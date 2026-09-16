import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { CourtCatalog } from '@forgelex/source-catalog';
import { SourceRouter, CanonicalFixtureProvider } from '@forgelex/source-providers';
import { ToolRegistry } from '@forgelex/agent-core';
import { searchCaseLawTool } from '@forgelex/legal-tools';
import { createDatabase } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { McpHandler } from '@forgelex/mcp-server';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: '*' });

  // 1. Inicialização dos serviços fundamentais
  const { db } = await createDatabase({ url: 'file::memory:?cache=shared' });
  const ledgerService = new LedgerService(db);
  await ledgerService.bootstrapTables();

  const courtCatalog = new CourtCatalog();
  const sourceRouter = new SourceRouter();
  sourceRouter.registerProvider(new CanonicalFixtureProvider());

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(searchCaseLawTool);

  const mcpHandler = new McpHandler(toolRegistry, ledgerService);

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
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://forgelex.ai/documentacao-api',
    };
  });

  // 4. REST v2: Catálogo de Tribunais Habilitados
  app.get('/api/v2/tribunals', async () => {
    return {
      tribunals: courtCatalog.getAllCourts(),
      total: courtCatalog.getAllCourts().length,
    };
  });

  // 5. REST v2: Busca de Jurisprudência Faturável e Idempotente
  app.get('/api/v2/jurisprudencias', async (req, reply) => {
    const query = req.query as { q?: string; court?: string; limit?: string };
    const q = query.q ?? 'direito fundamental';
    const court = query.court;
    const limit = query.limit ? parseInt(query.limit, 10) : 10;

    const idempotencyKey =
      (req.headers['idempotency-key'] as string) ??
      `rest_juris_${q}_${court ?? 'all'}_${limit}`;

    try {
      const execution = await ledgerService.executeBillableOperation({
        tenantId: (req.headers['x-tenant-id'] as string) ?? 'tenant_public_api',
        idempotencyKey,
        costCents: 15, // R$ 0,15 por busca
        operation: async () => {
          return await sourceRouter.search(q, { court, limit });
        },
      });

      reply.header('X-Billable-Units', '1');
      reply.header('X-Credit-Cost-Per-Unit', '0.15');
      reply.header('X-Credits-Charged', execution.chargedCents / 100);
      reply.header('X-Remaining-Balance', (execution.remainingBalanceCents / 100).toFixed(2));
      reply.header('X-Idempotent-Replay', execution.isReplay ? 'true' : 'false');

      return {
        query: q,
        court,
        total: execution.data.length,
        results: execution.data,
      };
    } catch (err: any) {
      reply.status(402);
      return {
        error: 'PAYMENT_REQUIRED',
        message: err.message,
        details: err.details,
      };
    }
  });

  // 6. Remote MCP Endpoint (POST /mcp)
  app.post('/mcp', async (req) => {
    const body = req.body as any;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const tenantId = (req.headers['x-tenant-id'] as string) ?? 'tenant_mcp_client';
    const userId = (req.headers['x-user-id'] as string) ?? 'user_mcp_agent';

    return await mcpHandler.handleRequest(body, {
      idempotencyKey,
      tenantId,
      userId,
    });
  });

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
