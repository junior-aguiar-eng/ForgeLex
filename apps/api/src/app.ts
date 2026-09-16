import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { CourtCatalog } from '@forgelex/source-catalog';
import { SourceRouter, StjSconProvider } from '@forgelex/source-providers';
import { ToolRegistry } from '@forgelex/agent-core';
import {
  createSearchCaseLawTool,
  createVerifyAuthorityTool,
  ResearchService,
} from '@forgelex/legal-tools';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { McpHandler } from '@forgelex/mcp-server';
import {
  AuthAdapter,
  createDefaultAuthAdapter,
  resolveAllowedOrigins,
} from './auth/fastify-auth.js';

export interface BuildAppOptions {
  authAdapter?: AuthAdapter;
  ledgerService?: LedgerService;
  sourceRouter?: SourceRouter;
  auditRecorder?: AuditRecorder;
  environment?: Record<string, string | undefined>;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const environment = options.environment ?? process.env;
  const authAdapter = options.authAdapter ?? createDefaultAuthAdapter(environment);
  await app.register(cors, {
    origin: resolveAllowedOrigins(environment),
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposedHeaders: [
      'X-Billable-Units',
      'X-Credit-Cost-Per-Unit',
      'X-Credits-Charged',
      'X-Remaining-Balance',
      'X-Idempotent-Replay',
    ],
  });

  // 1. Inicialização dos serviços fundamentais
  const connection = options.ledgerService ? undefined : await createDatabase({ url: 'file::memory:?cache=shared' });
  if (connection) {
    await runPersistenceMigrations(connection.client);
  }

  const ledgerService = options.ledgerService ?? new LedgerService(connection!.db, connection!.client);
  await ledgerService.runMigrations();

  const courtCatalog = new CourtCatalog();
  const sourceRouter = options.sourceRouter ?? new SourceRouter();
  if (!options.sourceRouter) {
    sourceRouter.registerProvider(new StjSconProvider({
      baseUrl: environment.FORGELEX_STJ_SCON_BASE_URL,
    }));
  }
  const researchService = new ResearchService(sourceRouter);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(createSearchCaseLawTool(researchService));
  toolRegistry.register(createVerifyAuthorityTool(researchService));

  const auditRecorder = options.auditRecorder ?? (connection ? new AuditRecorder(connection.db) : undefined);
  const mcpHandler = new McpHandler(toolRegistry, ledgerService, auditRecorder);

  const setBillingHeaders = (reply: { header: (name: string, value: string | number) => unknown }, execution: {
    chargedCents: number;
    remainingBalanceCents: number;
    isReplay: boolean;
  }) => {
    reply.header('X-Billable-Units', '1');
    reply.header('X-Credit-Cost-Per-Unit', '0.15');
    reply.header('X-Credits-Charged', execution.chargedCents / 100);
    reply.header('X-Remaining-Balance', (execution.remainingBalanceCents / 100).toFixed(2));
    reply.header('X-Idempotent-Replay', execution.isReplay ? 'true' : 'false');
  };

  const recordAudit = async (event: Parameters<AuditRecorder['recordEvent']>[0]): Promise<void> => {
    if (!auditRecorder) return;
    try {
      await auditRecorder.recordEvent(event);
    } catch (error) {
      app.log.warn({ error }, 'Falha ao registrar evento de auditoria');
    }
  };

  // 2. Healthcheck
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'forgelex-api',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
    };
  });

  // 3. OAuth 2.1 Protected Resource Metadata (RFC 9207 / Benchmark Exordial)
  app.get('/.well-known/oauth-protected-resource', async () => {
    return {
      resource: 'https://mcp.forgelex.ai',
      authorization_servers: ['https://auth.forgelex.ai'],
      scopes_supported: ['mcp', 'research:read', 'matter:read', 'draft:write', 'billing:read'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://forgelex.ai/documentacao-api',
    };
  });

  // 4. REST v2: Catálogo de Tribunais Habilitados
  app.get(
    '/api/v2/tribunals',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async () => {
      return {
        tribunals: courtCatalog.getAllCourts(),
        total: courtCatalog.getAllCourts().length,
      };
    }
  );

  // 5. REST v2: Busca de Jurisprudência Faturável e Idempotente
  app.get(
    '/api/v2/jurisprudencias',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async (req, reply) => {
      const query = req.query as { q?: string; court?: string; limit?: string };
      const q = query.q ?? 'direito fundamental';
      const court = query.court;
      const limit = query.limit ? parseInt(query.limit, 10) : 10;

      if (q.trim().length < 2 || !Number.isInteger(limit) || limit < 1 || limit > 20) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'q deve conter pelo menos 2 caracteres e limit deve estar entre 1 e 20.',
        };
      }

      const idempotencyKey =
        (req.headers['idempotency-key'] as string) ??
        `rest_juris_${q}_${court ?? 'all'}_${limit}`;
      const sessionId = `rest_${idempotencyKey}`;
      const startedAt = Date.now();

      try {
        const execution = await ledgerService.executeBillableOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          costCents: 15, // R$ 0,15 por busca
          usage: {
            capability: 'research.search_case_law',
            toolName: 'research.search_case_law',
            provider: 'provider_stj_scon',
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => {
            return await researchService.searchCaseLaw({ query: q, court, limit });
          },
        });

        setBillingHeaders(reply, execution);
        if (!execution.isReplay) {
          await recordAudit({
            sessionId,
            tenantId: req.principal.tenantId,
            userId: req.principal.userId,
            toolName: 'research.search_case_law',
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: { query: q, court, limit, resultCount: execution.data.total },
            costMetadata: { estimatedCostUsd: 0 },
          });
        }

        return {
          query: q,
          court,
          total: execution.data.total,
          results: execution.data.items,
        };
      } catch (err: any) {
        await recordAudit({
          sessionId,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'research.search_case_law',
          durationMs: Date.now() - startedAt,
          status: 'FAILED',
          payload: { query: q, court, limit, error: err?.message },
        });
        reply.status(err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 503 : 402);
        return {
          error: err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message: err.message,
          details: err.details,
        };
      }
    }
  );

  app.post(
    '/api/v2/research/verify-authority',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async (req, reply) => {
      const body = req.body as { court?: string; processNumber?: string; judgmentDate?: string };
      const court = body.court ?? '';
      const processNumber = body.processNumber ?? '';

      if (court.trim().length < 2 || processNumber.trim().length < 5) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'court e processNumber são obrigatórios para verificar a autoridade.',
        };
      }
      const idempotencyKey =
        (req.headers['idempotency-key'] as string) ??
        `rest_verify_${court}_${processNumber}_${body.judgmentDate ?? ''}`;
      const sessionId = `rest_${idempotencyKey}`;
      const startedAt = Date.now();

      try {
        const execution = await ledgerService.executeBillableOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          costCents: 15,
          usage: {
            capability: 'research.verify_authority',
            toolName: 'research.verify_authority',
            provider: 'provider_stj_scon',
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => {
            return await researchService.verifyAuthority({ court, processNumber, judgmentDate: body.judgmentDate });
          },
        });

        setBillingHeaders(reply, execution);
        if (!execution.isReplay) {
          await recordAudit({
            sessionId,
            tenantId: req.principal.tenantId,
            userId: req.principal.userId,
            toolName: 'research.verify_authority',
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: { court, processNumber, judgmentDate: body.judgmentDate, status: execution.data.status },
            costMetadata: { estimatedCostUsd: 0 },
          });
        }
        return execution.data;
      } catch (err: any) {
        await recordAudit({
          sessionId,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'research.verify_authority',
          durationMs: Date.now() - startedAt,
          status: 'FAILED',
          payload: { court, processNumber, judgmentDate: body.judgmentDate, error: err?.message },
        });
        reply.status(err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 503 : 402);
        return {
          error: err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message: err.message,
          details: err.details,
        };
      }
    }
  );

  // 6. Remote MCP Endpoint (POST /mcp)
  app.post(
    '/mcp',
    { preHandler: authAdapter.createPreHandler(['mcp']) },
    async (req) => {
      const body = req.body as any;
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      return await mcpHandler.handleRequest(body, {
        idempotencyKey,
        tenantId: req.principal.tenantId,
        userId: req.principal.userId,
      });
    }
  );

  // GET /mcp deve retornar 405 Method Not Allowed (conforme especificação)
  app.get('/mcp', async (_, reply) => {
    reply.status(405);
    return {
      error: 'METHOD_NOT_ALLOWED',
      message: 'O conector MCP requer requisições HTTP POST com payloads JSON-RPC 2.0.',
    };
  });

  return app;
}
