import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { CourtCatalog } from '@forgelex/source-catalog';
import { SourceRouter, StjSconProvider } from '@forgelex/source-providers';
import { ToolRegistry } from '@forgelex/agent-core';
import {
  createSearchCaseLawTool,
  createVerifyAuthorityTool,
  FactsEvidenceService,
  ResearchService,
} from '@forgelex/legal-tools';
import {
  createDatabase,
  FactsEvidenceRepository,
  ForgeLexDatabase,
  MatterRepository,
  runPersistenceMigrations,
} from '@forgelex/persistence';
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
  database?: ForgeLexDatabase;
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
  const database = options.database ?? connection?.db;
  const matterRepository = database ? new MatterRepository(database) : undefined;
  const factsEvidenceService = database
    ? new FactsEvidenceService(new FactsEvidenceRepository(database))
    : undefined;

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
      scopes_supported: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
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

  app.get(
    '/api/v2/matters',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de matters não está disponível.' };
      }
      const items = await matterRepository.listMatters(req.principal.tenantId);
      return { items, total: items.length };
    }
  );

  app.post(
    '/api/v2/matters',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de matters não está disponível.' };
      }
      const body = (req.body ?? {}) as {
        title?: string;
        clientId?: string;
        description?: string;
        practiceArea?: string;
        jurisdiction?: string;
      };
      if (!body.title?.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'title é obrigatório para criar um matter.' };
      }
      try {
        const matter = await matterRepository.createMatter({
          tenantId: req.principal.tenantId,
          createdBy: req.principal.userId,
          title: body.title,
          clientId: body.clientId,
          description: body.description,
          practiceArea: body.practiceArea,
          jurisdiction: body.jurisdiction,
        });
        await recordAudit({
          sessionId: `matter_${matter.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'matter.created',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { matterId: matter.id, title: matter.title },
        });
        return matter;
      } catch (error) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: error instanceof Error ? error.message : 'Dados do matter inválidos.',
        };
      }
    }
  );

  app.get(
    '/api/v2/matters/:matterId',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de matters não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const matter = await matterRepository.getMatter(req.principal.tenantId, matterId);
      if (!matter) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const documents = await matterRepository.listDocuments(req.principal.tenantId, matterId);
      return { matter, documents };
    }
  );

  app.post(
    '/api/v2/matters/:matterId/documents',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de documentos não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as {
        title?: string;
        originalFilename?: string;
        mimeType?: string;
        content?: string;
      };
      if (!body.title?.trim() || !body.originalFilename?.trim() || !body.content?.trim()) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'title, originalFilename e content são obrigatórios para ingerir o documento.',
        };
      }
      try {
        const ingested = await matterRepository.ingestTextDocument({
          tenantId: req.principal.tenantId,
          matterId,
          createdBy: req.principal.userId,
          title: body.title,
          originalFilename: body.originalFilename,
          mimeType: body.mimeType ?? 'text/plain',
          content: body.content,
        });
        await recordAudit({
          sessionId: `document_${ingested.document.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'document.ingested',
          durationMs: 0,
          status: 'SUCCESS',
          payload: {
            documentId: ingested.document.id,
            matterId,
            contentHash: ingested.document.contentHash,
            anchorCount: ingested.anchors.length,
          },
        });
        return {
          document: ingested.document,
          version: {
            id: ingested.version.id,
            documentId: ingested.version.documentId,
            versionNumber: ingested.version.versionNumber,
            contentHash: ingested.version.contentHash,
            createdAt: ingested.version.createdAt,
          },
          anchors: ingested.anchors,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível ingerir o documento.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 400);
        return {
          error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'INVALID_REQUEST',
          message,
        };
      }
    }
  );

  app.get(
    '/api/v2/matters/:matterId/documents/:documentId',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de documentos não está disponível.' };
      }
      const { matterId, documentId } = req.params as { matterId: string; documentId: string };
      const matter = await matterRepository.getMatter(req.principal.tenantId, matterId);
      const result = await matterRepository.getDocumentVersion(req.principal.tenantId, documentId);
      if (!matter || !result || result.document.matterId !== matterId) {
        reply.status(404);
        return { error: 'DOCUMENT_NOT_FOUND', message: 'Documento não localizado no matter do tenant autenticado.' };
      }
      return {
        document: result.document,
        version: {
          id: result.version.id,
          documentId: result.version.documentId,
          versionNumber: result.version.versionNumber,
          contentHash: result.version.contentHash,
          createdAt: result.version.createdAt,
        },
        anchors: result.anchors,
      };
    }
  );

  app.get(
    '/api/v2/matters/:matterId/facts',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de fatos não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const result = await factsEvidenceService.listFacts({
        tenantId: req.principal.tenantId,
        userId: req.principal.userId,
        matterId,
      });
      return { items: result.items, coverage: result.coverage, total: result.items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/facts',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de fatos não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as {
        statement?: string;
        category?: 'FACTUAL' | 'PROCEDURAL' | 'TEMPORAL' | 'DAMAGE' | 'OTHER';
        status?: 'ASSERTED' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED';
      };
      if (!body.statement?.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'statement é obrigatório para registrar um fato.' };
      }
      try {
        const fact = await factsEvidenceService.createFact(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          { statement: body.statement, category: body.category, status: body.status },
        );
        await recordAudit({
          sessionId: `fact_${fact.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'facts.created',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { factId: fact.id, matterId, category: fact.category, status: fact.status },
        });
        return fact;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível registrar o fato.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.get(
    '/api/v2/matters/:matterId/evidence',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de provas não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await factsEvidenceService.listEvidence(
        { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
      );
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/evidence',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de provas não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as {
        title?: string;
        description?: string;
        evidenceType?: 'DOCUMENT' | 'TESTIMONY' | 'RECORD' | 'EXPERT_REPORT' | 'OTHER';
        status?: 'AVAILABLE' | 'MISSING' | 'CONTESTED';
      };
      if (!body.title?.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'title é obrigatório para registrar uma prova.' };
      }
      try {
        const evidence = await factsEvidenceService.createEvidence(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          {
            title: body.title,
            description: body.description,
            evidenceType: body.evidenceType,
            status: body.status,
          },
        );
        await recordAudit({
          sessionId: `evidence_${evidence.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'evidence.created',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { evidenceItemId: evidence.id, matterId, evidenceType: evidence.evidenceType, status: evidence.status },
        });
        return evidence;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível registrar a prova.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.post(
    '/api/v2/matters/:matterId/facts/:factId/support',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de suporte não está disponível.' };
      }
      const { matterId, factId } = req.params as { matterId: string; factId: string };
      const body = (req.body ?? {}) as {
        anchorId?: string;
        evidenceItemId?: string;
        relation?: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
        note?: string;
      };
      if (!body.anchorId && !body.evidenceItemId) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'anchorId ou evidenceItemId é obrigatório para mapear suporte.' };
      }
      try {
        const relation = body.relation ?? 'SUPPORTS';
        const context = { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId };
        const factSourceLink = body.anchorId
          ? await factsEvidenceService.linkFactToAnchor(context, {
              factId,
              documentAnchorId: body.anchorId,
              relation,
              note: body.note,
            })
          : undefined;
        const evidenceLink = body.evidenceItemId
          ? await factsEvidenceService.linkEvidenceToFact(context, {
              factId,
              evidenceItemId: body.evidenceItemId,
              relation,
              note: body.note,
            })
          : undefined;
        await recordAudit({
          sessionId: `fact_${factId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'facts.support.mapped',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { matterId, factId, anchorId: body.anchorId, evidenceItemId: body.evidenceItemId, relation },
        });
        return { factSourceLink, evidenceLink };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível mapear o suporte.';
        const notFound = /^(MATTER|FACT|EVIDENCE|ANCHOR)_NOT_FOUND/.test(message);
        reply.status(notFound ? 404 : 400);
        return { error: notFound ? message.split(':')[0] : 'INVALID_REQUEST', message };
      }
    },
  );

  app.get(
    '/api/v2/matters/:matterId/evidence/coverage',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de cobertura não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const coverage = await factsEvidenceService.getCoverage(
        { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
      );
      await recordAudit({
        sessionId: `matter_${matterId}`,
        tenantId: req.principal.tenantId,
        userId: req.principal.userId,
        toolName: 'evidence.coverage.read',
        durationMs: 0,
        status: 'SUCCESS',
        payload: { matterId, factCount: coverage.length },
      });
      return { items: coverage, total: coverage.length };
    },
  );

  app.get(
    '/api/v2/matters/:matterId/timeline',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência da linha do tempo não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await factsEvidenceService.listTimeline(
        { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
      );
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/timeline',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência da linha do tempo não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as {
        title?: string;
        eventDate?: string;
        description?: string;
        sourceAnchorId?: string;
      };
      if (!body.title?.trim() || !body.eventDate?.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'title e eventDate são obrigatórios para registrar um evento.' };
      }
      try {
        const event = await factsEvidenceService.createTimeline(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          {
            title: body.title,
            eventDate: body.eventDate,
            description: body.description,
            sourceAnchorId: body.sourceAnchorId,
          },
        );
        await recordAudit({
          sessionId: `timeline_${event.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'timeline.created',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { timelineEventId: event.id, matterId, eventDate: event.eventDate },
        });
        return event;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível registrar o evento.';
        const notFound = /^(MATTER|ANCHOR)_NOT_FOUND/.test(message);
        reply.status(notFound ? 404 : 400);
        return { error: notFound ? message.split(':')[0] : 'INVALID_REQUEST', message };
      }
    },
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
