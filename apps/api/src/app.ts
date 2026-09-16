import Fastify, { FastifyInstance, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { CourtCatalog } from '@forgelex/source-catalog';
import { SourceRouter, StjSconProvider } from '@forgelex/source-providers';
import { ToolRegistry } from '@forgelex/agent-core';
import {
  createSearchCaseLawTool,
  createGetAuthorityTool,
  createVerifyAuthorityTool,
  DraftReviewService,
  DraftingService,
  DraftCreateInputSchema,
  FactsEvidenceService,
  ResearchService,
} from '@forgelex/legal-tools';
import {
  createDatabase,
  DraftRepository,
  FactsEvidenceRepository,
  ForgeLexDatabase,
  MatterRepository,
  MatterAuthorityRepository,
  LegalIssueRepository,
  ResearchMemoRepository,
  ApiKeyRepository,
  runPersistenceMigrations,
} from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { EXTERNAL_MCP_TOOL_NAMES, McpHandler } from '@forgelex/mcp-server';
import { CaseLawSchema, type AuthenticatedPrincipal } from '@forgelex/domain';
import {
  AuthAdapter,
  createDefaultAuthAdapter,
  resolveAllowedOrigins,
} from './auth/fastify-auth.js';
import { ApiKeyService } from './auth/api-key-service.js';
import { buildOpenApiDocument } from './distribution/openapi.js';
import { WEBHOOK_EVENT_TYPES } from './distribution/webhooks.js';
import { caseLawToLegalAuthority, compileLegalResearchMemo } from '@forgelex/legal-workflows';

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

  const database = options.database ?? connection?.db;
  const apiKeyRepository = database ? new ApiKeyRepository(database) : undefined;
  const apiKeyService = apiKeyRepository ? new ApiKeyService(apiKeyRepository) : undefined;
  const authAdapter = options.authAdapter ?? createDefaultAuthAdapter(environment, apiKeyRepository);
  const ledgerService = options.ledgerService ?? new LedgerService(connection!.db, connection!.client);
  await ledgerService.runMigrations();
  const matterRepository = database ? new MatterRepository(database) : undefined;
  const matterAuthorityRepository = database ? new MatterAuthorityRepository(database) : undefined;
  const legalIssueRepository = database ? new LegalIssueRepository(database) : undefined;
  const researchMemoRepository = database ? new ResearchMemoRepository(database) : undefined;
  const factsEvidenceService = database
    ? new FactsEvidenceService(new FactsEvidenceRepository(database))
    : undefined;
  const draftRepository = database ? new DraftRepository(database) : undefined;
  const draftingService = draftRepository ? new DraftingService(draftRepository) : undefined;
  const draftReviewService = draftRepository && factsEvidenceService
    ? new DraftReviewService(draftRepository, factsEvidenceService)
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
  toolRegistry.register(createGetAuthorityTool(researchService));
  toolRegistry.register(createVerifyAuthorityTool(researchService));

  const auditRecorder = options.auditRecorder ?? (connection ? new AuditRecorder(connection.db) : undefined);
  const mcpHandler = new McpHandler(toolRegistry, ledgerService, auditRecorder, {
    exposedToolNames: EXTERNAL_MCP_TOOL_NAMES,
  });

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

  const runBillableSearchCaseLaw = async (input: {
    principal: AuthenticatedPrincipal;
    reply: FastifyReply;
    query: string;
    court?: string;
    limit: number;
    idempotencyKey?: string;
  }) => {
    const idempotencyKey = input.idempotencyKey ?? `rest_search_${input.query}_${input.court ?? 'all'}_${input.limit}`;
    const sessionId = `rest_${idempotencyKey}`;
    const startedAt = Date.now();

    try {
      const execution = await ledgerService.executeBillableOperation({
        tenantId: input.principal.tenantId,
        userId: input.principal.userId,
        idempotencyKey,
        costCents: 15,
        usage: {
          capability: 'research.search_case_law',
          toolName: 'research.search_case_law',
          provider: 'provider_stj_scon',
          requestId: idempotencyKey,
          sessionId,
          userId: input.principal.userId,
        },
        operation: async () => researchService.searchCaseLaw({ query: input.query, court: input.court, limit: input.limit }),
      });

      setBillingHeaders(input.reply, execution);
      if (!execution.isReplay) {
        await recordAudit({
          sessionId,
          tenantId: input.principal.tenantId,
          userId: input.principal.userId,
          toolName: 'research.search_case_law',
          durationMs: Date.now() - startedAt,
          status: 'SUCCESS',
          payload: { query: input.query, court: input.court, limit: input.limit, resultCount: execution.data.total },
          costMetadata: { estimatedCostUsd: 0 },
        });
      }

      return {
        query: input.query,
        court: input.court,
        total: execution.data.total,
        results: execution.data.items,
      };
    } catch (error) {
      const details = error as { code?: unknown; details?: unknown; message?: unknown };
      const code = typeof details.code === 'string' ? details.code : '';
      const message = typeof details.message === 'string' ? details.message : 'Falha ao pesquisar jurisprudência.';
      const sourceFailure = code.startsWith('SOURCE_PROVIDER_');
      await recordAudit({
        sessionId,
        tenantId: input.principal.tenantId,
        userId: input.principal.userId,
        toolName: 'research.search_case_law',
        durationMs: Date.now() - startedAt,
        status: 'FAILED',
        payload: { query: input.query, court: input.court, limit: input.limit, error: message },
      });
      input.reply.status(sourceFailure ? 503 : 402);
      return {
        error: sourceFailure ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
        message,
        details: details.details,
      };
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

  const openApiDocument = buildOpenApiDocument(environment.FORGELEX_PUBLIC_API_URL ?? 'http://localhost:3001');
  app.get('/openapi.json', async () => openApiDocument);
  app.get('/api/v2/openapi.json', async () => openApiDocument);

  app.get('/api/v2/webhooks/events', async () => ({
    eventTypes: [...WEBHOOK_EVENT_TYPES],
    delivery: {
      signatureHeader: 'X-ForgeLex-Webhook-Signature',
      timestampHeader: 'X-ForgeLex-Webhook-Timestamp',
      signedPayload: '<unix_timestamp>.<raw_json_payload>',
      algorithm: 'HMAC-SHA256',
      toleranceSeconds: 300,
    },
    status: 'CONTRACT_ONLY',
    message: 'A entrega e a persistência de assinaturas serão habilitadas após a escolha do transporte operacional.',
  }));

  app.get(
    '/api/v2/api-keys',
    { preHandler: authAdapter.createPreHandler(['billing:read']) },
    async (req, reply) => {
      if (!apiKeyService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de chaves de API não está disponível.' };
      }
      const items = await apiKeyService.list(req.principal.tenantId);
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/api-keys',
    { preHandler: authAdapter.createPreHandler(['billing:read']) },
    async (req, reply) => {
      if (!apiKeyService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de chaves de API não está disponível.' };
      }
      const body = (req.body ?? {}) as { name?: string; scopes?: unknown };
      if (!body.name?.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'name é obrigatório para criar uma chave de API.' };
      }
      if (body.scopes !== undefined && (!Array.isArray(body.scopes) || !body.scopes.every((scope) => typeof scope === 'string'))) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'scopes deve ser uma lista de textos.' };
      }
      const scopes = [...new Set((body.scopes as string[] | undefined) ?? ['mcp', 'research:read'])];
      const missingScopes = scopes.filter((scope) => !req.principal.scopes.includes(scope));
      if (missingScopes.length > 0) {
        reply.status(403);
        return { error: 'INSUFFICIENT_SCOPE', message: 'A nova chave não pode receber escopos além dos autorizados na credencial atual.', missingScopes };
      }

      const key = await apiKeyService.create({
        tenantId: req.principal.tenantId,
        subjectId: req.principal.subjectId,
        userId: req.principal.userId,
        name: body.name.trim(),
        roles: req.principal.roles,
        scopes,
      });
      await recordAudit({
        sessionId: `api_key_${key.id}`,
        tenantId: req.principal.tenantId,
        userId: req.principal.userId,
        toolName: 'api_key.created',
        durationMs: 0,
        status: 'SUCCESS',
        payload: { keyId: key.id, keyPrefix: key.keyPrefix, scopes: key.scopes },
      });
      reply.status(201);
      return {
        key,
        warning: 'O segredo token é exibido somente nesta resposta. Armazene-o com segurança; o ForgeLex persiste apenas o hash.',
      };
    },
  );

  app.delete(
    '/api/v2/api-keys/:keyId',
    { preHandler: authAdapter.createPreHandler(['billing:read']) },
    async (req, reply) => {
      if (!apiKeyService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de chaves de API não está disponível.' };
      }
      const { keyId } = req.params as { keyId: string };
      const revoked = await apiKeyService.revoke(req.principal.tenantId, keyId);
      if (!revoked) {
        reply.status(404);
        return { error: 'API_KEY_NOT_FOUND', message: 'Chave de API ativa não localizada para o tenant autenticado.' };
      }
      await recordAudit({
        sessionId: `api_key_${keyId}`,
        tenantId: req.principal.tenantId,
        userId: req.principal.userId,
        toolName: 'api_key.revoked',
        durationMs: 0,
        status: 'SUCCESS',
        payload: { keyId },
      });
      return { key: revoked };
    },
  );

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
    '/api/v2/matters/:matterId/issues',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !legalIssueRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de questões jurídicas não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await legalIssueRepository.listIssues(req.principal.tenantId, matterId);
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/issues',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !legalIssueRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de questões jurídicas não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as { statement?: string; status?: 'OPEN' | 'ADDRESSED' | 'DISMISSED' };
      if (!body.statement?.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'statement é obrigatório para registrar uma questão jurídica.' };
      }
      try {
        const issue = await legalIssueRepository.createIssue({
          tenantId: req.principal.tenantId,
          matterId,
          createdBy: req.principal.userId,
          statement: body.statement,
          status: body.status,
        });
        await recordAudit({
          sessionId: `issue_${issue.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'strategy.issue.created',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { issueId: issue.id, matterId, status: issue.status },
        });
        reply.status(201);
        return issue;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível registrar a questão jurídica.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.get(
    '/api/v2/matters/:matterId/authorities',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !matterAuthorityRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de authorities não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await matterAuthorityRepository.listAuthorities(req.principal.tenantId, matterId);
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/authorities',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !matterAuthorityRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de authorities não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as { authority?: unknown };
      const candidate = body.authority ?? req.body;
      const parsed = CaseLawSchema.safeParse(candidate);
      if (!parsed.success) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'authority deve conter uma autoridade judicial com proveniência válida.',
          details: parsed.error.issues,
        };
      }

      try {
        const result = await matterAuthorityRepository.saveAuthority({
          tenantId: req.principal.tenantId,
          matterId,
          savedBy: req.principal.userId,
          authority: parsed.data,
        });
        await recordAudit({
          sessionId: `matter_${matterId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'matter.authority.saved',
          durationMs: 0,
          status: 'SUCCESS',
          payload: {
            matterId,
            authorityId: result.record.authority.id,
            dedupeKey: result.record.authority.dedupeKey,
            created: result.created,
          },
        });
        reply.status(result.created ? 201 : 200);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível salvar a autoridade.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 409);
        return {
          error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'AUTHORITY_SAVE_FAILED',
          message,
        };
      }
    },
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

  // 5. Research memo do matter: contexto forense, pesquisa e revisão humana
  app.get(
    '/api/v2/matters/:matterId/research-memos',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !researchMemoRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de memorandos não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await researchMemoRepository.listMemos(req.principal.tenantId, matterId);
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/research-memos',
    { preHandler: authAdapter.createPreHandler(['matter:write', 'research:read']) },
    async (req, reply) => {
      if (!matterRepository || !legalIssueRepository || !researchMemoRepository || !factsEvidenceService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'A infraestrutura do research memo não está disponível.' };
      }

      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as {
        query?: unknown;
        court?: unknown;
        limit?: unknown;
        issueIds?: unknown;
      };
      const query = typeof body.query === 'string' ? body.query.trim() : '';
      const court = typeof body.court === 'string' && body.court.trim() ? body.court.trim() : undefined;
      const limit = body.limit === undefined ? 10 : body.limit;
      if (
        query.length < 3 ||
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'query deve conter pelo menos 3 caracteres e limit deve ser um inteiro entre 1 e 20.' };
      }

      const issueIdsProvided = body.issueIds !== undefined;
      if (issueIdsProvided && (!Array.isArray(body.issueIds) || !body.issueIds.every((item) => typeof item === 'string'))) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'issueIds deve ser uma lista de identificadores.' };
      }

      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }

      const requestedIssueIds = issueIdsProvided
        ? [...new Set((body.issueIds as string[]).map((item) => item.trim()).filter(Boolean))]
        : undefined;
      const allIssues = await legalIssueRepository.listIssues(req.principal.tenantId, matterId);
      const selectedIssues = requestedIssueIds === undefined
        ? allIssues
        : allIssues.filter((issue) => requestedIssueIds.includes(issue.id));
      if (requestedIssueIds && selectedIssues.length !== requestedIssueIds.length) {
        reply.status(404);
        return { error: 'LEGAL_ISSUE_NOT_FOUND', message: 'Uma ou mais questões jurídicas não pertencem ao matter autenticado.' };
      }

      const idempotencyKey =
        (req.headers['idempotency-key'] as string | undefined) ??
        `research_memo_${matterId}_${query}_${court ?? 'all'}_${limit}_${selectedIssues.map((issue) => issue.id).join(',')}`;
      const existing = await researchMemoRepository.getByIdempotencyKey(
        req.principal.tenantId,
        matterId,
        idempotencyKey,
      );
      if (existing) {
        const factsResult = await factsEvidenceService.listFacts({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          matterId,
        });
        return {
          memo: existing.memo,
          record: existing,
          issues: selectedIssues,
          context: {
            documentCount: (await matterRepository.listDocuments(req.principal.tenantId, matterId)).length,
            factCount: factsResult.items.length,
            evidenceCount: (await factsEvidenceService.listEvidence({ tenantId: req.principal.tenantId, userId: req.principal.userId, matterId })).length,
            coverage: factsResult.coverage,
          },
          research: { query, court, total: existing.memo.applicableAuthorities.length },
          billed: false,
          idempotentReplay: true,
        };
      }

      const sessionId = `memo_${idempotencyKey}`;
      const startedAt = Date.now();
      try {
        const execution = await ledgerService.executeBillableOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          costCents: 15,
          usage: {
            capability: 'research.generate_memo',
            toolName: 'research.generate_memo',
            provider: 'provider_stj_scon',
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => researchService.searchCaseLaw({ query, court, limit }),
        });

        const authorities = execution.data.items.map(caseLawToLegalAuthority);
        const memo = compileLegalResearchMemo({
          query,
          matterId,
          authorities,
          issues: selectedIssues.map((issue) => issue.statement),
        });
        let record;
        try {
          record = await researchMemoRepository.createMemo({
            tenantId: req.principal.tenantId,
            matterId,
            query,
            issueIds: selectedIssues.map((issue) => issue.id),
            memo,
            workflowVersion: '2.0.0',
            idempotencyKey,
            createdBy: req.principal.userId,
          });
        } catch (error) {
          const concurrentRecord = await researchMemoRepository.getByIdempotencyKey(
            req.principal.tenantId,
            matterId,
            idempotencyKey,
          );
          if (!concurrentRecord) throw error;
          record = concurrentRecord;
        }

        const factsResult = await factsEvidenceService.listFacts({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          matterId,
        });
        const evidence = await factsEvidenceService.listEvidence({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          matterId,
        });
        if (!execution.isReplay) {
          await recordAudit({
            sessionId,
            tenantId: req.principal.tenantId,
            userId: req.principal.userId,
            toolName: 'research.memo.generated',
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: {
              memoId: record.id,
              matterId,
              query,
              issueCount: selectedIssues.length,
              authorityCount: authorities.length,
              documentCount: (await matterRepository.listDocuments(req.principal.tenantId, matterId)).length,
              factCount: factsResult.items.length,
              evidenceCount: evidence.length,
            },
            costMetadata: { estimatedCostUsd: 0 },
          });
        }

        return {
          memo: record.memo,
          record,
          issues: selectedIssues,
          context: {
            documentCount: (await matterRepository.listDocuments(req.principal.tenantId, matterId)).length,
            factCount: factsResult.items.length,
            evidenceCount: evidence.length,
            coverage: factsResult.coverage,
          },
          research: { query, court, total: execution.data.total },
          billed: !execution.isReplay,
          idempotentReplay: execution.isReplay,
        };
      } catch (error) {
        const details = error as { code?: unknown; details?: unknown; message?: unknown };
        const code = typeof details.code === 'string' ? details.code : '';
        const message = typeof details.message === 'string' ? details.message : 'Não foi possível gerar o research memo.';
        const sourceFailure = code.startsWith('SOURCE_PROVIDER_');
        await recordAudit({
          sessionId,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'research.memo.generated',
          durationMs: Date.now() - startedAt,
          status: 'FAILED',
          payload: { matterId, query, issueCount: selectedIssues.length, error: message },
        });
        reply.status(sourceFailure ? 503 : 402);
        return {
          error: sourceFailure ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message,
          details: details.details,
        };
      }
    },
  );

  app.post(
    '/api/v2/matters/:matterId/research-memos/:memoId/review',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!researchMemoRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de revisão de memorandos não está disponível.' };
      }
      const { matterId, memoId } = req.params as { matterId: string; memoId: string };
      const body = (req.body ?? {}) as { decision?: unknown; reason?: unknown };
      if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED') {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'decision deve ser APPROVED ou REJECTED.' };
      }
      try {
        const record = await researchMemoRepository.reviewMemo({
          tenantId: req.principal.tenantId,
          matterId,
          memoId,
          decision: body.decision,
          reviewedBy: req.principal.userId,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        });
        await recordAudit({
          sessionId: `memo_${memoId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'research.memo.reviewed',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { memoId, matterId, decision: record.status },
        });
        return { memo: record.memo, record };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível registrar a revisão humana.';
        reply.status(message.includes('NOT_FOUND') ? 404 : 409);
        return { error: message.includes('NOT_FOUND') ? 'RESEARCH_MEMO_NOT_FOUND' : 'RESEARCH_MEMO_REVIEW_FAILED', message };
      }
    },
  );

  // 5. REST v2: Draft Studio, revisão e aprovação humana
  app.get(
    '/api/v2/matters/:matterId/drafts',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!draftRepository || !matterRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de rascunhos não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await draftRepository.listDrafts(req.principal.tenantId, matterId);
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/matters/:matterId/drafts',
    { preHandler: authAdapter.createPreHandler(['draft:write']) },
    async (req, reply) => {
      if (!draftingService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de rascunhos não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const parsed = DraftCreateInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'Título, seções e vínculos do rascunho são inválidos.', details: parsed.error.flatten() };
      }
      try {
        const result = await draftingService.createDraft(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          parsed.data,
        );
        await recordAudit({
          sessionId: `draft_${result.draft.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'drafting.create_draft',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { draftId: result.draft.id, draftVersionId: result.version.id, sectionCount: result.sections.length },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível criar o rascunho.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.get(
    '/api/v2/matters/:matterId/drafts/:draftId',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!draftingService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de rascunhos não está disponível.' };
      }
      const { matterId, draftId } = req.params as { matterId: string; draftId: string };
      try {
        return await draftingService.getDraft(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          draftId,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível consultar o rascunho.';
        reply.status(message.startsWith('DRAFT_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('DRAFT_NOT_FOUND') ? 'DRAFT_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.post(
    '/api/v2/matters/:matterId/drafts/:draftId/versions',
    { preHandler: authAdapter.createPreHandler(['draft:write']) },
    async (req, reply) => {
      if (!draftingService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de rascunhos não está disponível.' };
      }
      const { matterId, draftId } = req.params as { matterId: string; draftId: string };
      const parsed = DraftCreateInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'Conteúdo da nova versão é inválido.', details: parsed.error.flatten() };
      }
      try {
        const result = await draftingService.updateDraft(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          draftId,
          parsed.data,
        );
        await recordAudit({
          sessionId: `draft_${draftId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'drafting.update_draft',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { draftId, draftVersionId: result.version.id, versionNumber: result.version.versionNumber },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível criar a versão.';
        reply.status(message.startsWith('DRAFT_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('DRAFT_NOT_FOUND') ? 'DRAFT_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.post(
    '/api/v2/matters/:matterId/drafts/:draftId/review',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!draftReviewService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Serviço de revisão não está disponível.' };
      }
      const { matterId, draftId } = req.params as { matterId: string; draftId: string };
      const body = (req.body ?? {}) as { type?: 'citations' | 'fact_support' | 'adversarial' | 'all'; versionId?: string };
      const context = { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId };
      try {
        const result = body.type === 'citations'
          ? await draftReviewService.verifyCitations(context, draftId, body.versionId)
          : body.type === 'fact_support'
            ? await draftReviewService.checkFactSupport(context, draftId, body.versionId)
            : body.type === 'adversarial'
              ? await draftReviewService.adversarialReview(context, draftId, body.versionId)
              : body.type === 'all' || body.type === undefined
                ? await draftReviewService.runAll(context, draftId, body.versionId)
                : undefined;
        if (!result) {
          reply.status(400);
          return { error: 'INVALID_REQUEST', message: 'type deve ser citations, fact_support, adversarial ou all.' };
        }
        await recordAudit({
          sessionId: `draft_${draftId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: `review.${body.type ?? 'all'}`,
          durationMs: 0,
          status: 'SUCCESS',
          payload: { draftId, draftVersionId: result.draftVersionId, status: result.status, findingCount: result.findings.length },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível revisar o rascunho.';
        reply.status(message.includes('NOT_FOUND') ? 404 : 400);
        return { error: message.includes('NOT_FOUND') ? 'DRAFT_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.post(
    '/api/v2/matters/:matterId/drafts/:draftId/approval',
    { preHandler: authAdapter.createPreHandler(['draft:write']) },
    async (req, reply) => {
      if (!draftingService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de aprovações não está disponível.' };
      }
      const { matterId, draftId } = req.params as { matterId: string; draftId: string };
      const body = (req.body ?? {}) as { versionId?: string };
      try {
        const result = await draftingService.requestApproval(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          draftId,
          body.versionId,
        );
        await recordAudit({
          sessionId: `draft_${draftId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'drafting.request_approval',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { draftId, approvalRequestId: result.request.id, draftVersionId: result.request.draftVersionId },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível solicitar aprovação.';
        reply.status(message.includes('NOT_FOUND') ? 404 : 409);
        return { error: message.includes('NOT_FOUND') ? 'DRAFT_NOT_FOUND' : 'APPROVAL_REQUEST_REJECTED', message };
      }
    },
  );

  app.get(
    '/api/v2/matters/:matterId/draft-approvals',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!draftRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de aprovações não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const items = await draftRepository.listApprovalRequests(req.principal.tenantId, matterId);
      return { items, total: items.length };
    },
  );

  app.post(
    '/api/v2/draft-approvals/resolve',
    { preHandler: authAdapter.createPreHandler(['draft:write']) },
    async (req, reply) => {
      if (!draftingService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência de aprovações não está disponível.' };
      }
      const body = (req.body ?? {}) as { token?: string; decision?: 'APPROVED' | 'REJECTED'; reason?: string };
      if (!body.token?.trim() || !body.decision || !['APPROVED', 'REJECTED'].includes(body.decision)) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'token e decision APPROVED/REJECTED são obrigatórios.' };
      }
      try {
        const result = await draftingService.resolveApproval(
          { tenantId: req.principal.tenantId, userId: req.principal.userId },
          body.token,
          body.decision,
          body.reason,
        );
        await recordAudit({
          sessionId: `draft_${result.request.draftId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'drafting.resolve_approval',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { draftId: result.request.draftId, approvalRequestId: result.request.id, decision: body.decision },
        });
        return { request: result.request, decision: result.decision };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível resolver a aprovação.';
        reply.status(message.includes('INVALID') || message.includes('EXPIRED') || message.includes('USED') ? 400 : 404);
        return { error: 'APPROVAL_RESOLUTION_FAILED', message };
      }
    },
  );

  // 6. REST v2: Busca de Jurisprudência Faturável e Idempotente
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
    '/api/v2/research/search-case-law',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async (req, reply) => {
      const body = (req.body ?? {}) as { query?: unknown; court?: unknown; limit?: unknown };
      const query = typeof body.query === 'string' ? body.query : '';
      const court = typeof body.court === 'string' ? body.court : undefined;
      const limit = body.limit === undefined ? 10 : body.limit;
      if (
        query.trim().length < 2 ||
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'query deve conter pelo menos 2 caracteres e limit deve ser um inteiro entre 1 e 20.',
        };
      }

      return runBillableSearchCaseLaw({
        principal: req.principal,
        reply,
        query,
        court,
        limit,
        idempotencyKey: req.headers['idempotency-key'] as string | undefined,
      });
    },
  );

  app.post(
    '/api/v2/research/get-authority',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async (req, reply) => {
      const body = (req.body ?? {}) as { court?: unknown; processNumber?: unknown; judgmentDate?: unknown };
      const court = typeof body.court === 'string' ? body.court : '';
      const processNumber = typeof body.processNumber === 'string' ? body.processNumber : '';
      const judgmentDate = typeof body.judgmentDate === 'string' ? body.judgmentDate : undefined;

      if (court.trim().length < 2 || processNumber.trim().length < 5) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'court e processNumber são obrigatórios para obter a autoridade.',
        };
      }

      const idempotencyKey =
        (req.headers['idempotency-key'] as string) ??
        `rest_get_authority_${court}_${processNumber}_${judgmentDate ?? ''}`;
      const sessionId = `rest_${idempotencyKey}`;
      const startedAt = Date.now();

      try {
        const execution = await ledgerService.executeBillableOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          costCents: 15,
          usage: {
            capability: 'research.get_authority',
            toolName: 'research.get_authority',
            provider: 'provider_stj_scon',
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => researchService.verifyAuthority({ court, processNumber, judgmentDate }),
        });

        setBillingHeaders(reply, execution);
        if (!execution.isReplay) {
          await recordAudit({
            sessionId,
            tenantId: req.principal.tenantId,
            userId: req.principal.userId,
            toolName: 'research.get_authority',
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: { court, processNumber, judgmentDate, status: execution.data.status },
            costMetadata: { estimatedCostUsd: 0 },
          });
        }
        return execution.data;
      } catch (error) {
        const details = error as { code?: unknown; details?: unknown; message?: unknown };
        const code = typeof details.code === 'string' ? details.code : '';
        const message = typeof details.message === 'string' ? details.message : 'Falha ao obter a autoridade.';
        const sourceFailure = code.startsWith('SOURCE_PROVIDER_');
        await recordAudit({
          sessionId,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'research.get_authority',
          durationMs: Date.now() - startedAt,
          status: 'FAILED',
          payload: { court, processNumber, judgmentDate, error: message },
        });
        reply.status(sourceFailure ? 503 : 402);
        return {
          error: sourceFailure ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message,
          details: details.details,
        };
      }
    },
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
