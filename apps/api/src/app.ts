import { randomUUID, timingSafeEqual } from 'node:crypto';
import Fastify, { FastifyInstance, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { CourtCatalog } from '@forgelex/source-catalog';
import { SourceRouter, StjSconProvider } from '@forgelex/source-providers';
import { ToolRegistry } from '@forgelex/agent-core';
import {
  createLegalToolGateway,
  DraftReviewService,
  DraftingService,
  DraftCreateInputSchema,
  FactsEvidenceService,
  ResearchService,
  type SearchCaseLawOutput,
  type VerifyAuthorityOutput,
  StrategyService,
  createStrategyTools,
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
  ResearchHistoryRepository,
  PersistentWorkflowCheckpointStore,
  LegalThesisRepository,
  ApiKeyRepository,
  JurisprudenceRepository,
  AccountRepository,
  AccountClosureRepository,
  runPersistenceMigrations,
} from '@forgelex/persistence';
import {
  BillingService,
  CREDIT_PACKAGES,
  getForgeLexBillingPolicy,
  JURISPRUDENCE_SEARCH_COST_CENTS,
  LedgerService,
} from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { EXTERNAL_MCP_TOOL_NAMES, McpHandler } from '@forgelex/mcp-server';
import { CaseLawSchema, type AuthenticatedPrincipal } from '@forgelex/domain';
import { JurisprudenceSearchService } from '@forgelex/legal-data';
import {
  AuthAdapter,
  createDefaultAuthAdapter,
  createSupabaseIdentityVerifier,
  extractBearerToken,
  resolveAllowedOrigins,
  SupabaseIdentityVerifier,
} from './auth/fastify-auth.js';
import { ApiKeyService } from './auth/api-key-service.js';
import { buildOpenApiDocument } from './distribution/openapi.js';
import { createRequestAbortSignal } from './distribution/request-abort-signal.js';
import { WEBHOOK_EVENT_TYPES } from './distribution/webhooks.js';
import { WebhookRepository } from '@forgelex/persistence';
import { WebhookService } from './distribution/webhook-service.js';
import type { Client } from '@forgelex/persistence';
import { createLegalResearchMemoTool, LegalResearchMemoExecutionService } from '@forgelex/legal-workflows';
import { RequestMetrics, structuredLog } from './observability.js';
import { BillingOperationsService, type PaymentProvider } from './billing/billing-operations.js';
import { MercadoPagoPaymentProvider } from './billing/mercado-pago-payment-provider.js';
import { resolveDatabasePolicy } from './config/database-policy.js';
import { OperationalRetentionService, resolveRetentionPolicy } from './operations/retention-service.js';
import { ReviewQueueService } from './review/review-queue-service.js';
import { registerStaticWeb } from './static-web.js';
import { digestClosureValue } from './account/account-closure-crypto.js';
import { SupabaseAccountAdmin, type AccountIdentityAdmin } from './account/supabase-account-admin.js';
import {
  AccountClosureReconciler,
  createAccountClosureStepHandlers,
} from './account/account-closure-reconciler.js';

export interface BuildAppOptions {
  authAdapter?: AuthAdapter;
  ledgerService?: LedgerService;
  database?: ForgeLexDatabase;
  databaseClient?: Client;
  sourceRouter?: SourceRouter;
  auditRecorder?: AuditRecorder;
  supabaseIdentityVerifier?: SupabaseIdentityVerifier;
  environment?: Record<string, string | undefined>;
  billingOperationsService?: BillingOperationsService;
  paymentProvider?: PaymentProvider;
  mercadoPagoPaymentProvider?: MercadoPagoPaymentProvider;
  accountClosureRepository?: AccountClosureRepository;
  accountIdentityAdmin?: AccountIdentityAdmin;
  accountClosureReconciler?: AccountClosureReconciler;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8');
    (request as typeof request & { rawBody?: string }).rawBody = rawBody;
    try { done(null, JSON.parse(rawBody)); } catch { done(new Error('INVALID_JSON')); }
  });
  const metrics = new RequestMetrics();
  const requestStartedAt = new WeakMap<object, number>();
  const requestTraceIds = new WeakMap<object, string>();
  app.addHook('onRequest', async (request, reply) => {
    const requestId = request.headers['x-request-id'] ?? request.id;
    const traceId = request.headers['x-trace-id'] ?? randomUUID();
    reply.header('x-request-id', Array.isArray(requestId) ? requestId[0] ?? request.id : requestId);
    reply.header('x-trace-id', Array.isArray(traceId) ? traceId[0] ?? randomUUID() : traceId);
    requestStartedAt.set(request.raw, Date.now());
    requestTraceIds.set(request.raw, Array.isArray(traceId) ? traceId[0] ?? '' : traceId);
  });
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartedAt.get(request.raw) ?? Date.now();
    const latencyMs = Date.now() - startedAt;
    metrics.observe({ latencyMs, statusCode: reply.statusCode });
    if (reply.statusCode >= 400) {
      structuredLog('warn', 'http.request.completed', {
        requestId: request.id,
        traceId: requestTraceIds.get(request.raw),
        tenantId: request.principal?.tenantId,
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        latencyMs,
      });
    }
  });
  const environment = options.environment ?? process.env;
  const normalizePublicUrl = (value: string) => value.trim().replace(/\/$/, '');
  const mcpResourceUrl = normalizePublicUrl(environment.FORGELEX_MCP_RESOURCE_URL ?? 'https://mcp.forgelex.ai');
  await app.register(cors, {
    origin: resolveAllowedOrigins(environment),
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposedHeaders: [
      'X-Billable-Units',
      'X-Credit-Cost-Per-Unit',
      'X-Credits-Charged',
      'X-Remaining-Balance',
      'X-Idempotent-Replay',
      'X-ForgeLex-Billing-Mode',
    ],
  });

  // 1. Inicialização dos serviços fundamentais
  const hasInjectedPersistence = Boolean(options.database && options.databaseClient);
  const shouldOpenConnection = !hasInjectedPersistence
    && (!options.ledgerService || environment.NODE_ENV === 'production');
  const databasePolicy = shouldOpenConnection
    ? resolveDatabasePolicy({ ...environment, NODE_ENV: environment.NODE_ENV ?? process.env.NODE_ENV })
    : undefined;
  const connection = shouldOpenConnection
    ? await createDatabase({ url: databasePolicy?.url ?? 'file::memory:?cache=shared' })
    : undefined;
  if (connection) {
    await runPersistenceMigrations(connection.client);
    app.addHook('onClose', async () => connection.client.close());
  }

  const database = options.database ?? connection?.db;
  const databaseClient = options.databaseClient ?? connection?.client;
  const retentionPolicy = resolveRetentionPolicy(environment);
  const retentionService = databaseClient && retentionPolicy.enabled
    ? new OperationalRetentionService(databaseClient, retentionPolicy.retentionDays)
    : undefined;
  const retentionWorker = retentionService
    ? setInterval(() => void retentionService.purge().catch((error) => structuredLog('error', 'retention.worker.failed', {
      error: error instanceof Error ? error.message : String(error),
    })), 86_400_000)
    : undefined;
  if (retentionWorker) app.addHook('onClose', async () => clearInterval(retentionWorker));
  const configuredWebhookTimeoutMs = Number(environment.FORGELEX_WEBHOOK_TIMEOUT_MS);
  const webhookTimeoutMs = Number.isFinite(configuredWebhookTimeoutMs) && configuredWebhookTimeoutMs > 0
    ? configuredWebhookTimeoutMs
    : undefined;
  const webhookService = databaseClient
    ? new WebhookService(new WebhookRepository(databaseClient), {
      masterKey: environment.FORGELEX_WEBHOOK_MASTER_KEY,
      timeoutMs: webhookTimeoutMs,
    })
    : undefined;
  const webhookWorker = webhookService && environment.FORGELEX_WEBHOOK_WORKER_ENABLED === 'true'
    ? setInterval(() => void webhookService.deliverOne()
      .then((result) => metrics.observeWebhookDelivery(result))
      .catch((error) => structuredLog('error', 'webhook.worker.failed', {
        error: error instanceof Error ? error.message : String(error),
      })), 1_000)
    : undefined;
  if (webhookWorker) app.addHook('onClose', async () => clearInterval(webhookWorker));
  const apiKeyRepository = database ? new ApiKeyRepository(database) : undefined;
  const apiKeyService = apiKeyRepository ? new ApiKeyService(apiKeyRepository) : undefined;
  const accountRepository = database ? new AccountRepository(database) : undefined;
  const accountClosureRepository = options.accountClosureRepository
    ?? (databaseClient ? new AccountClosureRepository(databaseClient) : undefined);
  const accountClosureHashSecret = environment.FORGELEX_ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET?.trim();
  const accountClosureBlocklist = accountClosureRepository
    ? {
        isBlocked: async (principal: AuthenticatedPrincipal) => accountClosureRepository.isBlocked({
          ...principal,
          ...(accountClosureHashSecret
            ? {
                subjectHash: digestClosureValue(accountClosureHashSecret, principal.subjectId),
                userHash: digestClosureValue(accountClosureHashSecret, principal.userId),
                tenantHash: digestClosureValue(accountClosureHashSecret, principal.tenantId),
              }
            : {}),
        }),
      }
    : undefined;
  const accountClosureEnabled = environment.FORGELEX_ACCOUNT_CLOSURE_ENABLED === 'true';
  const accountClosureWorkerEnabled = environment.FORGELEX_ACCOUNT_CLOSURE_WORKER_ENABLED === 'true';
  const accountIdentityAdmin = options.accountIdentityAdmin ?? (
    accountClosureEnabled
      && environment.FORGELEX_SUPABASE_URL?.trim()
      && environment.FORGELEX_SUPABASE_SECRET_KEY?.trim()
      ? new SupabaseAccountAdmin({
          baseUrl: environment.FORGELEX_SUPABASE_URL,
          secretKey: environment.FORGELEX_SUPABASE_SECRET_KEY,
        })
      : undefined
  );
  const accountClosureReconciler = options.accountClosureReconciler ?? (
    accountClosureRepository && accountIdentityAdmin
      ? new AccountClosureReconciler({
          repository: accountClosureRepository,
          handlers: createAccountClosureStepHandlers({ identityAdmin: accountIdentityAdmin }),
          leaseOwner: `api_${process.pid}`,
        })
      : undefined
  );
  if (accountClosureWorkerEnabled && (!accountClosureEnabled || !accountClosureReconciler)) {
    throw new Error('ACCOUNT_CLOSURE_WORKER_CONFIG_REQUIRED');
  }
  let accountClosureWorkerRunning = false;
  const accountClosureWorker = accountClosureEnabled && accountClosureWorkerEnabled && accountClosureReconciler
    ? setInterval(() => {
        if (accountClosureWorkerRunning) return;
        accountClosureWorkerRunning = true;
        void accountClosureReconciler.runOne()
          .catch(() => structuredLog('error', 'account_closure.worker.failed', {
            errorCode: 'ACCOUNT_CLOSURE_WORKER_FAILED',
          }))
          .finally(() => { accountClosureWorkerRunning = false; });
      }, 5_000)
    : undefined;
  if (accountClosureWorker) app.addHook('onClose', async () => clearInterval(accountClosureWorker));
  const supabaseIdentityVerifier = options.supabaseIdentityVerifier ?? createSupabaseIdentityVerifier(environment);
  const authAdapter = options.authAdapter ?? createDefaultAuthAdapter(
    environment,
    apiKeyRepository,
    accountRepository,
    accountClosureBlocklist,
  );
  const ledgerService = options.ledgerService ?? new LedgerService(connection!.db, connection!.client);
  await ledgerService.runMigrations();
  const mercadoPagoPaymentProvider = options.mercadoPagoPaymentProvider ?? (
    environment.FORGELEX_BILLING_ENABLED === 'true'
      && environment.MERCADOPAGO_ACCESS_TOKEN
      && environment.MERCADOPAGO_WEBHOOK_SECRET
      && environment.MERCADOPAGO_NOTIFICATION_URL
      ? new MercadoPagoPaymentProvider({
        accessToken: environment.MERCADOPAGO_ACCESS_TOKEN,
        webhookSecret: environment.MERCADOPAGO_WEBHOOK_SECRET,
        notificationUrl: environment.MERCADOPAGO_NOTIFICATION_URL,
      })
      : undefined
  );
  const activePaymentProvider = options.paymentProvider ?? mercadoPagoPaymentProvider;
  const billingOperationsService = options.billingOperationsService ?? (
    database && databaseClient && activePaymentProvider
      ? new BillingOperationsService(database, databaseClient, new BillingService(database, databaseClient), activePaymentProvider, environment.FORGELEX_WEB_URL ?? 'http://localhost:3000')
      : undefined
  );
  const matterRepository = database ? new MatterRepository(database) : undefined;
  const matterAuthorityRepository = database ? new MatterAuthorityRepository(database) : undefined;
  const legalIssueRepository = database ? new LegalIssueRepository(database) : undefined;
  const researchMemoRepository = database ? new ResearchMemoRepository(database) : undefined;
  const researchHistoryRepository = database ? new ResearchHistoryRepository(database) : undefined;
  const reviewQueueService = database ? new ReviewQueueService(database) : undefined;
  const legalThesisRepository = database ? new LegalThesisRepository(database) : undefined;
  const factsEvidenceService = database
    ? new FactsEvidenceService(new FactsEvidenceRepository(database))
    : undefined;
  const draftRepository = database ? new DraftRepository(database) : undefined;
  const draftingService = draftRepository ? new DraftingService(draftRepository) : undefined;
  const draftReviewService = draftRepository && factsEvidenceService
    ? new DraftReviewService(draftRepository, factsEvidenceService)
    : undefined;
  const strategyService = legalThesisRepository && legalIssueRepository
    ? new StrategyService(legalThesisRepository, legalIssueRepository)
    : undefined;

  const courtCatalog = new CourtCatalog();
  const commercialEnabledCourts = ['STJ'] as const;
  const sourceRouter = options.sourceRouter ?? new SourceRouter();
  if (!options.sourceRouter) {
    sourceRouter.registerProvider(new StjSconProvider({
      baseUrl: environment.FORGELEX_STJ_SCON_BASE_URL,
    }));
  }
  sourceRouter.setEnabledCourts(commercialEnabledCourts);
  const jurisprudenceSearchService = database
    ? new JurisprudenceSearchService(new JurisprudenceRepository(database))
    : undefined;
  const researchService = new ResearchService(sourceRouter, jurisprudenceSearchService, {
    requirePersistentDataPlane: true,
  });
  const researchBillingProvider = database ? 'forgelex_index' : 'provider_stj_scon';
  const persistentResearchDataPlaneUnavailable = (reply: FastifyReply) => {
    reply.status(503);
    return {
      error: 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE',
      message: 'O índice jurisprudencial persistido não está disponível.',
    };
  };

  const toolRegistry = new ToolRegistry();
  createLegalToolGateway(researchService).registerInto(toolRegistry);
  type LegalGatewayToolName = 'research.search_case_law' | 'research.get_authority' | 'research.verify_authority';
  type LegalGatewayToolOutput<TName extends LegalGatewayToolName> = TName extends 'research.search_case_law'
    ? SearchCaseLawOutput
    : VerifyAuthorityOutput;
  const executeLegalGatewayTool = async <TName extends LegalGatewayToolName>(
    toolName: TName,
    input: Record<string, unknown>,
    context: { sessionId: string; tenantId: string; userId: string; abortSignal?: AbortSignal },
  ): Promise<{ data: LegalGatewayToolOutput<TName> }> => {
    const execution = await toolRegistry.executeTool(toolName, input, {
      ...context,
      abortSignal: context.abortSignal ?? new AbortController().signal,
    });
    return execution as { data: LegalGatewayToolOutput<TName> };
  };
  const legalResearchMemoExecutionService = database && matterRepository && legalIssueRepository && researchMemoRepository
    ? new LegalResearchMemoExecutionService({
        matterRepository,
        legalIssueRepository,
        researchMemoRepository,
        matterAuthorityRepository: matterAuthorityRepository!,
        checkpointStore: new PersistentWorkflowCheckpointStore(database),
        toolRegistry,
      })
    : undefined;
  if (legalResearchMemoExecutionService) toolRegistry.register(createLegalResearchMemoTool(legalResearchMemoExecutionService));
  if (strategyService) {
    const strategyTools = createStrategyTools(strategyService);
    toolRegistry.register(strategyTools.identifyIssuesTool);
    toolRegistry.register(strategyTools.buildThesisMapTool);
    toolRegistry.register(strategyTools.createThesisTool);
  }

  const auditRecorder = options.auditRecorder ?? (connection ? new AuditRecorder(connection.db) : undefined);
  const mcpHandler = new McpHandler(toolRegistry, ledgerService, auditRecorder, {
    exposedToolNames: EXTERNAL_MCP_TOOL_NAMES,
    beforeToolCall: async (toolName) => {
      if (!jurisprudenceSearchService && toolName.startsWith('research.')) {
        throw Object.assign(
          new Error('O índice jurisprudencial persistido não está disponível.'),
          { code: 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE' },
        );
      }
    },
  });

  const setBillingHeaders = (reply: { header: (name: string, value: string | number) => unknown }, execution: {
    billingMode: 'METERED' | 'FREE';
    chargedCents: number;
    remainingBalanceCents: number;
    isReplay: boolean;
  }) => {
    reply.header('X-ForgeLex-Billing-Mode', execution.billingMode);
    if (execution.billingMode === 'METERED') {
      reply.header('X-Billable-Units', '1');
      reply.header('X-Credit-Cost-Per-Unit', (JURISPRUDENCE_SEARCH_COST_CENTS / 100).toFixed(2));
    }
    reply.header('X-Credits-Charged', execution.chargedCents / 100);
    reply.header('X-Remaining-Balance', (execution.remainingBalanceCents / 100).toFixed(2));
    reply.header('X-Idempotent-Replay', execution.isReplay ? 'true' : 'false');
  };

  const readIdempotencyKey = (headers: Record<string, string | string[] | undefined>): string | undefined => {
    const header = headers['idempotency-key'];
    const value = Array.isArray(header) ? header[0] : header;
    return value?.trim() || undefined;
  };

  const normalizeSearchCourt = (court?: string): string => {
    const normalized = court?.trim().toUpperCase();
    return !normalized || normalized === 'TODOS' ? 'STJ' : normalized;
  };

  const getSearchableCourt = (court?: string): string | undefined => {
    const normalized = normalizeSearchCourt(court);
    const capabilities = courtCatalog.getCapabilities({
      providers: sourceRouter.getProviders(),
      enabledCourts: commercialEnabledCourts,
    });
    return capabilities.some((item) => item.code === normalized && item.searchable) ? normalized : undefined;
  };

  const unsupportedCourtResponse = (reply: FastifyReply, court?: string) => {
    const normalized = normalizeSearchCourt(court);
    reply.status(422);
    return {
      error: 'UNSUPPORTED_COURT',
      message: `O tribunal '${normalized}' não está habilitado para pesquisa no ForgeLex.`,
    };
  };

  const missingIdempotencyResponse = (reply: FastifyReply) => {
    reply.status(400);
    return { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A chave de idempotência é obrigatória.' };
  };

  const recordAudit = async (event: Parameters<AuditRecorder['recordEvent']>[0]): Promise<void> => {
    if (!auditRecorder) return;
    try {
      await auditRecorder.recordEvent(event);
    } catch (error) {
      app.log.warn({ error }, 'Falha ao registrar evento de auditoria');
    }
  };

  const accountResponse = (account: Awaited<ReturnType<AccountRepository['findByUserAndTenant']>>) => {
    if (!account) return undefined;
    return {
      user: {
        id: account.user.id,
        email: account.user.email,
        displayName: account.user.displayName,
        status: account.user.status,
        createdAt: account.user.createdAt,
      },
      workspace: {
        id: account.tenant.id,
        name: account.tenant.name,
        status: account.tenant.status,
        createdAt: account.tenant.createdAt,
      },
      membership: {
        role: account.membership.role,
        status: account.membership.status,
      },
    };
  };

  app.get('/api/v2/billing/account', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!billingOperationsService) {
      reply.status(503);
      return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' };
    }
    const account = await billingOperationsService.getAccount(request.principal.tenantId);
    const billingAccount = await billingOperationsService.getBillingAccount(request.principal.tenantId);
    return {
      tenantId: request.principal.tenantId,
      currency: 'brl',
      balanceCents: account.paidBalanceCents + account.promotionalBalanceCents,
      paidBalanceCents: account.paidBalanceCents,
      promotionalBalanceCents: account.promotionalBalanceCents,
      searchCostCents: JURISPRUDENCE_SEARCH_COST_CENTS,
      packages: CREDIT_PACKAGES.map((item) => ({ ...item, label: `R$ ${(item.amountCents / 100).toFixed(2).replace('.', ',')}`, estimatedSearches: Math.floor(item.amountCents / JURISPRUDENCE_SEARCH_COST_CENTS) })),
      customAmount: { minCents: 2500, maxCents: 50000 },
      autoRecharge: {
        available: billingOperationsService.isAutoRechargeAvailable(),
        thresholdCents: billingAccount.autoRechargeThresholdCents,
        enabled: billingAccount.autoRechargeEnabled === 1,
        amountCents: billingAccount.lastRechargeAmountCents,
        paymentMethodId: billingAccount.defaultPaymentMethodId,
      },
    };
  });

  app.get('/api/v2/billing/transactions', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
    const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
    return billingOperationsService.listTransactions(request.principal.tenantId, limit, offset);
  });

  app.get('/api/v2/billing/invoices', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (_request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    return { invoices: await billingOperationsService.listInvoices(_request.principal.tenantId) };
  });

  app.get('/api/v2/billing/payment-methods', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    return { paymentMethods: await billingOperationsService.listPaymentMethods(request.principal.tenantId) };
  });

  app.post('/api/v2/billing/payment-methods/setup', { preHandler: authAdapter.createPreHandler(['billing:write']) }, async (request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    const header = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(header) ? header[0] : header;
    if (!idempotencyKey?.trim()) { reply.status(400); return { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A chave de idempotência é obrigatória.' }; }
    try { return await billingOperationsService.setupPaymentMethod({ tenantId: request.principal.tenantId, idempotencyKey }); }
    catch (error) { reply.status(400); return { error: error instanceof Error ? error.message : 'PAYMENT_METHOD_SETUP_FAILED', message: 'Não foi possível preparar o cartão.' }; }
  });

  app.put('/api/v2/billing/auto-recharge', { preHandler: authAdapter.createPreHandler(['billing:write']) }, async (request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    const body = (request.body ?? {}) as { enabled?: unknown; amountCents?: unknown; paymentMethodId?: unknown };
    if (typeof body.enabled !== 'boolean') { reply.status(400); return { error: 'INVALID_REQUEST', message: 'enabled deve ser booleano.' }; }
    try {
      const account = await billingOperationsService.updateAutoRecharge({
        tenantId: request.principal.tenantId,
        enabled: body.enabled,
        amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined,
        paymentMethodId: typeof body.paymentMethodId === 'string' ? body.paymentMethodId : undefined,
      });
      return { thresholdCents: account.autoRechargeThresholdCents, enabled: account.autoRechargeEnabled === 1, amountCents: account.lastRechargeAmountCents, paymentMethodId: account.defaultPaymentMethodId };
    } catch (error) { reply.status(400); return { error: error instanceof Error ? error.message : 'AUTO_RECHARGE_FAILED', message: 'Não foi possível atualizar a recarga automática.' }; }
  });

  app.post('/api/v2/billing/refund-requests', { preHandler: authAdapter.createPreHandler(['billing:write']) }, async (request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    const body = (request.body ?? {}) as { purchaseId?: unknown; reason?: unknown };
    if (typeof body.purchaseId !== 'string' || !body.purchaseId.trim()) { reply.status(400); return { error: 'INVALID_REQUEST', message: 'purchaseId é obrigatório.' }; }
    try { reply.status(201); return await billingOperationsService.createRefundRequest({ tenantId: request.principal.tenantId, userId: request.principal.userId, purchaseId: body.purchaseId, reason: typeof body.reason === 'string' ? body.reason : undefined }); }
    catch (error) { reply.status(400); return { error: error instanceof Error ? error.message : 'REFUND_REQUEST_FAILED', message: 'Não foi possível criar a solicitação de reembolso.' }; }
  });

  app.get('/api/v2/admin/billing/refund-requests', { preHandler: authAdapter.createPreHandler(['billing:admin']) }, async (_request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    return { requests: await billingOperationsService.listRefundRequests() };
  });

  app.post('/api/v2/admin/billing/refund-requests/:requestId/review', { preHandler: authAdapter.createPreHandler(['billing:admin']) }, async (request, reply) => {
    if (!billingOperationsService) { reply.status(503); return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' }; }
    const params = request.params as { requestId?: string };
    const body = (request.body ?? {}) as { decision?: unknown; approvedAmountCents?: unknown; reason?: unknown };
    if (!params.requestId || (body.decision !== 'APPROVED' && body.decision !== 'REJECTED')) { reply.status(400); return { error: 'INVALID_REQUEST', message: 'decision e requestId são obrigatórios.' }; }
    try {
      return await billingOperationsService.reviewRefundRequest({ requestId: params.requestId, reviewerId: request.principal.userId, decision: body.decision, approvedAmountCents: typeof body.approvedAmountCents === 'number' ? body.approvedAmountCents : undefined, reason: typeof body.reason === 'string' ? body.reason : undefined });
    } catch (error) { reply.status(400); return { error: error instanceof Error ? error.message : 'REFUND_REVIEW_FAILED', message: 'Não foi possível revisar o reembolso.' }; }
  });

  app.post('/api/v2/billing/checkout', { preHandler: authAdapter.createPreHandler(['billing:write']) }, async (request, reply) => {
    if (!billingOperationsService) {
      reply.status(503);
      return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' };
    }
    const idempotencyKeyHeader = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(idempotencyKeyHeader) ? idempotencyKeyHeader[0] : idempotencyKeyHeader;
    if (!idempotencyKey?.trim()) {
      reply.status(400);
      return { error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A chave de idempotência é obrigatória.' };
    }
    const body = (request.body ?? {}) as { packageId?: unknown; amountCents?: unknown };
    try {
      const result = await billingOperationsService.createCheckout({
        tenantId: request.principal.tenantId,
        userId: request.principal.userId,
        packageId: typeof body.packageId === 'string' ? body.packageId : undefined,
        amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined,
        idempotencyKey,
      });
      reply.status(201);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.status(message.startsWith('BILLING_') || message.startsWith('INVALID_') ? 400 : 503);
      return { error: message.split(':')[0] ?? 'BILLING_CHECKOUT_FAILED', message: 'Não foi possível criar o Checkout.' };
    }
  });

  app.get('/api/v2/billing/purchases/:purchaseId', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!billingOperationsService) {
      reply.status(503);
      return { error: 'BILLING_UNAVAILABLE', message: 'O billing ainda não está configurado.' };
    }
    const params = request.params as { purchaseId?: string };
    const purchase = params.purchaseId ? await billingOperationsService.getPurchase(params.purchaseId, request.principal.tenantId) : undefined;
    if (!purchase) {
      reply.status(404);
      return { error: 'BILLING_PURCHASE_NOT_FOUND', message: 'Compra não encontrada.' };
    }
    return purchase;
  });

  app.post('/api/v2/webhooks/mercadopago', async (request, reply) => {
    if (!billingOperationsService || !mercadoPagoPaymentProvider) {
      reply.status(503);
      return { error: 'BILLING_UNAVAILABLE', message: 'O webhook Mercado Pago ainda não está configurado.' };
    }
    const signature = request.headers['x-signature'];
    const requestId = request.headers['x-request-id'];
    const query = request.query as Record<string, unknown>;
    const dataId = typeof query['data.id'] === 'string' ? query['data.id'] : undefined;
    if (typeof signature !== 'string' || typeof requestId !== 'string' || !dataId) {
      reply.status(400);
      return { error: 'MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID', message: 'Assinatura Mercado Pago ausente.' };
    }
    try {
      const payload = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
      const event = await mercadoPagoPaymentProvider.normalizeWebhook({ payload, dataId, requestId, signature });
      await billingOperationsService.processWebhook(event);
      return { received: true };
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':')[0] : 'MERCADOPAGO_WEBHOOK_INVALID';
      reply.status(code === 'MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID' ? 401 : 400);
      return { error: code, message: 'Webhook Mercado Pago rejeitado.' };
    }
  });

  app.post('/api/v2/auth/bootstrap', async (request, reply) => {
    if (!accountRepository || !supabaseIdentityVerifier) {
      reply.status(503);
      return { error: 'AUTH_UNAVAILABLE', message: 'O acesso por conta ainda não está configurado.' };
    }

    let identity;
    try {
      identity = await supabaseIdentityVerifier.verify(extractBearerToken(request.headers.authorization));
    } catch {
      reply.status(401);
      return { error: 'UNAUTHENTICATED', message: 'Não foi possível confirmar seu acesso.' };
    }

    if (!identity) {
      structuredLog('warn', 'account.bootstrap.rejected', { requestId: request.id, reason: 'invalid_session' });
      reply.status(401);
      return { error: 'UNAUTHENTICATED', message: 'Não foi possível confirmar seu acesso.' };
    }
    if (!identity.emailConfirmed) {
      structuredLog('warn', 'account.bootstrap.rejected', { requestId: request.id, reason: 'email_not_confirmed' });
      reply.status(403);
      return { error: 'EMAIL_NOT_CONFIRMED', message: 'Confirme seu e-mail para continuar.' };
    }

    const body = (request.body ?? {}) as { displayName?: unknown };
    const displayName = typeof body.displayName === 'string'
      ? body.displayName.trim()
      : identity.displayName?.trim() ?? '';
    if (displayName.length < 2 || displayName.length > 120) {
      reply.status(400);
      return { error: 'INVALID_REQUEST', message: 'Informe seu nome para concluir o cadastro.' };
    }

    try {
      const account = await accountRepository.bootstrap({
        supabaseUserId: identity.id,
        email: identity.email,
        displayName,
      });
      if (account.user.status !== 'ACTIVE' || account.tenant.status !== 'ACTIVE' || account.membership.status !== 'ACTIVE') {
        await recordAudit({
          sessionId: `account_${account.user.id}`,
          tenantId: account.tenant.id,
          userId: account.user.id,
          toolName: 'account.bootstrap.rejected',
          durationMs: 0,
          status: 'FAILED',
          payload: { reason: 'account_disabled' },
        });
        reply.status(403);
        return { error: 'ACCOUNT_DISABLED', message: 'Sua conta não está disponível. Procure o responsável pelo acesso.' };
      }
      await recordAudit({
        sessionId: `account_${account.user.id}`,
        tenantId: account.tenant.id,
        userId: account.user.id,
        toolName: 'account.bootstrap',
        durationMs: 0,
        status: 'SUCCESS',
        payload: { authMethod: 'supabase_session' },
      });
      return accountResponse(account);
    } catch (error) {
      structuredLog('error', 'account.bootstrap.failed', {
        requestId: request.id,
        traceId: request.headers['x-trace-id'],
        error: error instanceof Error ? error.message : String(error),
      });
      reply.status(503);
      return { error: 'ACCOUNT_UNAVAILABLE', message: 'Não foi possível preparar seu espaço agora.' };
    }
  });

  app.get('/api/v2/auth/me', { preHandler: authAdapter.createPreHandler() }, async (request, reply) => {
    if (request.principal.authMethod !== 'session' || !accountRepository) {
      reply.status(403);
      return { error: 'SESSION_REQUIRED', message: 'Entre na sua conta para continuar.' };
    }
    const account = await accountRepository.findByUserAndTenant(request.principal.userId, request.principal.tenantId);
    if (!account) {
      reply.status(404);
      return { error: 'ACCOUNT_NOT_FOUND', message: 'Não foi possível localizar sua conta.' };
    }
    if (account.user.status !== 'ACTIVE' || account.tenant.status !== 'ACTIVE' || account.membership.status !== 'ACTIVE') {
      reply.status(403);
      return { error: 'ACCOUNT_DISABLED', message: 'Sua conta não está disponível. Procure o responsável pelo acesso.' };
    }
    return accountResponse(account);
  });

  const emitWebhook = async (input: {
    tenantId: string;
    type: Parameters<WebhookService['enqueue']>[0]['type'];
    payload: Record<string, unknown>;
  }): Promise<void> => {
    if (!webhookService) return;
    try {
      await webhookService.enqueue(input);
      metrics.observeWebhookQueued();
    } catch (error) {
      structuredLog('error', 'webhook.enqueue.failed', {
        tenantId: input.tenantId,
        eventType: input.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const emitBillingWebhooks = async (input: {
    principal: AuthenticatedPrincipal;
    capability: string;
    provider: string;
    idempotencyKey: string;
    sessionId: string;
    execution: { chargedCents: number; remainingBalanceCents: number; isReplay: boolean };
  }): Promise<void> => {
    if (input.execution.isReplay) return;
    metrics.observeBilling();
    const payload = {
      capability: input.capability,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey,
      sessionId: input.sessionId,
      units: 1,
      chargedCents: input.execution.chargedCents,
      remainingBalanceCents: input.execution.remainingBalanceCents,
    };
    await emitWebhook({ tenantId: input.principal.tenantId, type: 'billing.usage.recorded', payload });
    await emitWebhook({ tenantId: input.principal.tenantId, type: 'billing.debit.recorded', payload });
    if (billingOperationsService) {
      void billingOperationsService.startAutoRecharge(input.principal.tenantId).catch((error) => structuredLog('error', 'billing.auto_recharge.failed', {
        tenantId: input.principal.tenantId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const runBillableSearchCaseLaw = async (input: {
    principal: AuthenticatedPrincipal;
    reply: FastifyReply;
    query: string;
    court?: string;
    limit: number;
    idempotencyKey: string;
    abortSignal?: AbortSignal;
  }) => {
    if (!jurisprudenceSearchService) {
      return persistentResearchDataPlaneUnavailable(input.reply);
    }
    const court = getSearchableCourt(input.court);
    if (!court) return unsupportedCourtResponse(input.reply, input.court);
    if (!input.idempotencyKey) return missingIdempotencyResponse(input.reply);

    const idempotencyKey = input.idempotencyKey;
    const sessionId = `${input.principal.authMethod === 'session' ? 'web' : 'rest'}_${idempotencyKey}`;
    const startedAt = Date.now();

    try {
      const execution = await ledgerService.executeOperation({
        tenantId: input.principal.tenantId,
        userId: input.principal.userId,
        idempotencyKey,
        billing: getForgeLexBillingPolicy('research.search_case_law'),
        usage: {
          capability: 'research.search_case_law',
          toolName: 'research.search_case_law',
          provider: researchBillingProvider,
          requestId: idempotencyKey,
          sessionId,
          userId: input.principal.userId,
        },
        operation: async () => (await executeLegalGatewayTool('research.search_case_law', {
          query: input.query, court, limit: input.limit,
        }, { sessionId, tenantId: input.principal.tenantId, userId: input.principal.userId, abortSignal: input.abortSignal })).data,
      });

      setBillingHeaders(input.reply, execution);
      await researchHistoryRepository?.record({
        tenantId: input.principal.tenantId,
        userId: input.principal.userId,
        operationId: idempotencyKey,
        query: input.query,
        court,
        resultCount: execution.data.total,
        billingMode: execution.billingMode,
        chargedCents: execution.chargedCents,
      });
      if (!execution.isReplay) {
        await recordAudit({
          sessionId,
          tenantId: input.principal.tenantId,
          userId: input.principal.userId,
          toolName: 'research.search_case_law',
          durationMs: Date.now() - startedAt,
          status: 'SUCCESS',
          payload: { query: input.query, court, limit: input.limit, resultCount: execution.data.total },
        });
      }
      await emitBillingWebhooks({
        principal: input.principal,
        capability: 'research.search_case_law',
        provider: researchBillingProvider,
        idempotencyKey,
        sessionId,
        execution,
      });

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
        payload: { query: input.query, court, limit: input.limit, error: message },
      });
      input.reply.status(code === 'UNSUPPORTED_COURT' ? 422 : sourceFailure ? 503 : 402);
      return {
        error: code === 'UNSUPPORTED_COURT' ? 'UNSUPPORTED_COURT' : sourceFailure ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
        message,
        details: details.details,
      };
    }
  };

  // 2. Healthcheck
  const healthResponse = () => ({
      status: 'ok',
      service: 'forgelex-api',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
  });
  app.get('/healthz', async () => healthResponse());
  app.get('/health', async () => healthResponse());

  app.get('/readyz', async (_, reply) => {
    let persistenceReady = false;
    if (database && databaseClient) {
      try {
        await databaseClient.execute('SELECT 1');
        persistenceReady = true;
      } catch {
        persistenceReady = false;
      }
    }
    const checks = {
      persistence: persistenceReady,
      migrations: persistenceReady && Boolean(databaseClient),
      billing: persistenceReady && Boolean(ledgerService),
      source: persistenceReady && Boolean(jurisprudenceSearchService),
      auth: persistenceReady && Boolean(options.authAdapter || apiKeyRepository || supabaseIdentityVerifier),
      outbox: persistenceReady && Boolean(webhookService && environment.FORGELEX_WEBHOOK_MASTER_KEY),
    };
    const ready = Object.values(checks).every(Boolean);
    if (!ready) {
      reply.status(503);
      return { status: 'not_ready', service: 'forgelex-api', checks };
    }
    return { status: 'ready', service: 'forgelex-api', checks };
  });

  const metricsPreHandler = async (request: { headers: Record<string, string | string[] | undefined> }, reply: FastifyReply) => {
    const suppliedHeader = request.headers.authorization;
    const supplied = Array.isArray(suppliedHeader) ? suppliedHeader[0] : suppliedHeader;
    const configured = environment.FORGELEX_METRICS_TOKEN;
    const expected = configured ? `Bearer ${configured}` : '';
    const valid = Boolean(supplied && expected && supplied.length === expected.length
      && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)));
    if (!valid) {
      reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Credencial ausente ou inválida.' });
    }
  };
  app.get('/metrics', { preHandler: metricsPreHandler }, async () => ({ service: 'forgelex-api', metrics: metrics.read() }));
  app.get('/metrics/prometheus', { preHandler: metricsPreHandler }, async (_, reply) => {
    return reply.type('text/plain; version=0.0.4').send(metrics.toPrometheus());
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
    status: webhookService ? 'OUTBOX_PERSISTENCE_READY' : 'PERSISTENCE_UNAVAILABLE',
    transport: 'POSTGRES_OUTBOX_WORKER',
    message: webhookService
      ? 'Cadastro e persistência local estão disponíveis; a entrega exige worker e configuração operacional.'
      : 'Persistência de webhooks indisponível neste processo.',
  }));

  app.post('/api/v2/webhooks/endpoints', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!webhookService) return reply.status(503).send({ error: 'PERSISTENCE_UNAVAILABLE' });
    const principal = request.principal;
    const body = request.body as { url?: string; description?: string; secret?: string; eventTypes?: string[] };
    if (!body.url) return reply.status(400).send({ error: 'WEBHOOK_URL_REQUIRED' });
    try {
      const created = await webhookService.createEndpoint({ tenantId: principal.tenantId, ...body, url: body.url });
      const { secretCiphertext: _secretCiphertext, ...publicRecord } = created;
      return reply.status(201).send(publicRecord);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WEBHOOK_ENDPOINT_INVALID';
      return reply.status(message === 'WEBHOOK_MASTER_KEY_NOT_CONFIGURED' ? 503 : 400).send({ error: message });
    }
  });

  app.get('/api/v2/webhooks/endpoints', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!webhookService) return reply.status(503).send({ error: 'PERSISTENCE_UNAVAILABLE' });
    const principal = request.principal;
    const endpoints = await webhookService.listEndpoints(principal.tenantId);
    return endpoints.map(({ secretCiphertext: _secret, ...endpoint }) => endpoint);
  });

  app.delete('/api/v2/webhooks/endpoints/:endpointId', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!webhookService) return reply.status(503).send({ error: 'PERSISTENCE_UNAVAILABLE' });
    const principal = request.principal;
    const endpointId = (request.params as { endpointId: string }).endpointId;
    return { revoked: await webhookService.revokeEndpoint(principal.tenantId, endpointId) };
  });

  app.post('/api/v2/webhooks/endpoints/:endpointId/test', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!webhookService) return reply.status(503).send({ error: 'PERSISTENCE_UNAVAILABLE' });
    const principal = request.principal;
    const endpointId = (request.params as { endpointId: string }).endpointId;
    const endpoint = await webhookService.listEndpoints(principal.tenantId);
    if (!endpoint.some((item) => item.id === endpointId && item.status === 'ACTIVE')) return reply.status(404).send({ error: 'WEBHOOK_ENDPOINT_NOT_FOUND' });
    const eventId = await webhookService.enqueue({ tenantId: principal.tenantId, endpointId, type: 'matter.created', payload: { test: true, requestedBy: principal.userId } });
    return reply.status(202).send({ eventId, status: 'QUEUED' });
  });

  app.get('/api/v2/webhooks/deliveries', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!webhookService) return reply.status(503).send({ error: 'PERSISTENCE_UNAVAILABLE' });
    const principal = request.principal;
    const endpointId = (request.query as { endpointId?: string }).endpointId;
    return webhookService.listDeliveries(principal.tenantId, endpointId);
  });

  app.post('/api/v2/webhooks/deliveries/:deliveryId/retry', { preHandler: authAdapter.createPreHandler(['billing:read']) }, async (request, reply) => {
    if (!webhookService) return reply.status(503).send({ error: 'PERSISTENCE_UNAVAILABLE' });
    const principal = request.principal;
    const deliveryId = (request.params as { deliveryId: string }).deliveryId;
    return { requeued: await webhookService.requeue(principal.tenantId, deliveryId) };
  });

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

  app.get(
    '/api/v2/mcp/connection-status',
    { preHandler: authAdapter.createPreHandler(['mcp']) },
    async (request) => {
      let serviceAvailable = Boolean(jurisprudenceSearchService && databaseClient);
      if (serviceAvailable) {
        try {
          await databaseClient!.execute('SELECT 1');
        } catch {
          serviceAvailable = false;
        }
      }
      return {
        serviceAvailable,
        mcpUrl: mcpResourceUrl,
        authenticatedCredential: true,
        scopes: request.principal.scopes,
        lastMcpUseAt: null,
        billableOperationExecuted: false,
      };
    },
  );

  // 3. OAuth 2.1 Protected Resource Metadata (RFC 9207 / Benchmark Exordial)
  app.get('/.well-known/oauth-protected-resource', async () => {
    const authorizationServers = (environment.FORGELEX_OAUTH_AUTHORIZATION_SERVERS ?? 'https://auth.forgelex.ai')
      .split(',').map(normalizePublicUrl).filter(Boolean);
    return {
      resource: mcpResourceUrl,
      authorization_servers: authorizationServers.length > 0 ? authorizationServers : ['https://auth.forgelex.ai'],
      scopes_supported: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read', 'billing:write', 'billing:admin'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://forgelex.ai/documentacao-api',
    };
  });

  // 4. REST v2: Catálogo de Tribunais Habilitados
  app.get(
    '/api/v2/tribunals',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async () => {
      const tribunals = courtCatalog.getCapabilities({
        providers: sourceRouter.getProviders(),
        enabledCourts: commercialEnabledCourts,
      });
      return {
        tribunals,
        total: tribunals.length,
      };
    }
  );

  app.get(
    '/api/v2/research/history',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async (req, reply) => {
      if (!researchHistoryRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Histórico de pesquisa indisponível.' };
      }
      const requestedLimit = Number((req.query as { limit?: string }).limit ?? 20);
      const limit = Number.isInteger(requestedLimit) ? requestedLimit : 20;
      const items = await researchHistoryRepository.list(req.principal.tenantId, req.principal.userId, limit);
      return { items, total: items.length };
    },
  );

  app.get(
    '/api/v2/review-queue',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!reviewQueueService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Fila de revisão indisponível.' };
      }
      const items = await reviewQueueService.list(req.principal.tenantId);
      return { items, total: items.length };
    },
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'matter.created',
          payload: { matterId: matter.id, title: matter.title, status: matter.status },
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'document.ingested',
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
    '/api/v2/matters/:matterId/theses',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !legalThesisRepository) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Persistência do mapa de teses não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
        reply.status(404);
        return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
      }
      const items = await legalThesisRepository.listTheses(req.principal.tenantId, matterId);
      return { items, total: items.length };
    },
  );

  app.get(
    '/api/v2/matters/:matterId/thesis-map',
    { preHandler: authAdapter.createPreHandler(['matter:read']) },
    async (req, reply) => {
      if (!matterRepository || !strategyService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Serviço de estratégia não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      try {
        if (!(await matterRepository.getMatter(req.principal.tenantId, matterId))) {
          reply.status(404);
          return { error: 'MATTER_NOT_FOUND', message: 'Matter não localizado para o tenant autenticado.' };
        }
        const map = await strategyService.buildThesisMap({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          matterId,
        });
        await recordAudit({
          sessionId: `matter_${matterId}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'strategy.build_thesis_map',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { matterId, issueCount: map.issues.length, thesisCount: map.theses.length },
        });
        return map;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível montar o mapa de teses.';
        reply.status(message.startsWith('MATTER_NOT_FOUND') ? 404 : 400);
        return { error: message.startsWith('MATTER_NOT_FOUND') ? 'MATTER_NOT_FOUND' : 'INVALID_REQUEST', message };
      }
    },
  );

  app.post(
    '/api/v2/matters/:matterId/theses',
    { preHandler: authAdapter.createPreHandler(['matter:write']) },
    async (req, reply) => {
      if (!matterRepository || !strategyService) {
        reply.status(503);
        return { error: 'PERSISTENCE_UNAVAILABLE', message: 'Serviço de estratégia não está disponível.' };
      }
      const { matterId } = req.params as { matterId: string };
      const body = (req.body ?? {}) as {
        title?: unknown;
        statement?: unknown;
        rationale?: unknown;
        issueIds?: unknown;
        factIds?: unknown;
        evidenceIds?: unknown;
        authorityIds?: unknown;
        status?: unknown;
      };
      const ids = (value: unknown): string[] => Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
      if (typeof body.title !== 'string' || body.title.trim().length < 3 || typeof body.statement !== 'string' || body.statement.trim().length < 10) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'title e statement são obrigatórios para registrar uma tese.' };
      }
      try {
        const thesis = await strategyService.createThesis(
          { tenantId: req.principal.tenantId, userId: req.principal.userId, matterId },
          {
            title: body.title.trim(),
            statement: body.statement.trim(),
            rationale: typeof body.rationale === 'string' ? body.rationale : undefined,
            issueIds: ids(body.issueIds),
            factIds: ids(body.factIds),
            evidenceIds: ids(body.evidenceIds),
            authorityIds: ids(body.authorityIds),
            status: body.status === 'REVIEWED' || body.status === 'REJECTED' ? body.status : 'PROPOSED',
          },
        );
        await recordAudit({
          sessionId: `thesis_${thesis.id}`,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'strategy.thesis.created',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { thesisId: thesis.id, matterId, issueCount: thesis.issueIds.length, factCount: thesis.factIds.length },
        });
        reply.status(201);
        return thesis;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível registrar a tese.';
        const notFound = /^(MATTER|THESIS_.*)_NOT_FOUND/.test(message);
        reply.status(notFound ? 404 : 400);
        return { error: notFound ? message.split(':')[0] : 'INVALID_REQUEST', message };
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
      const requestedCourt = typeof body.court === 'string' && body.court.trim() ? body.court.trim() : undefined;
      const court = getSearchableCourt(requestedCourt);
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
      if (!court) return unsupportedCourtResponse(reply, requestedCourt);

      const idempotencyKey = readIdempotencyKey(req.headers);
      if (!idempotencyKey) return missingIdempotencyResponse(reply);

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

      const sessionId = `memo_${idempotencyKey}`;
      const startedAt = Date.now();
      const requestAbort = createRequestAbortSignal(req.raw);
      try {
        if (!legalResearchMemoExecutionService) throw new Error('WORKFLOW_UNAVAILABLE');
        const workflow = await legalResearchMemoExecutionService.execute({ matterId, query, court: 'STJ', limit,
          issueIds: selectedIssues.map((issue) => issue.id), idempotencyKey }, {
          tenantId: req.principal.tenantId, userId: req.principal.userId, sessionId,
          abortSignal: requestAbort.signal, source: 'REST',
        });
        setBillingHeaders(reply, { billingMode: 'FREE', chargedCents: 0,
          remainingBalanceCents: await ledgerService.getAvailableBalanceCents(req.principal.tenantId),
          isReplay: workflow.idempotentReplay });

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
        if (!workflow.idempotentReplay) {
          await recordAudit({
            sessionId,
            tenantId: req.principal.tenantId,
            userId: req.principal.userId,
            toolName: 'research.memo.generated',
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: {
              memoId: workflow.record.id,
              matterId,
              query,
              issueCount: selectedIssues.length,
              authorityCount: workflow.record.memo.applicableAuthorities.length,
              documentCount: (await matterRepository.listDocuments(req.principal.tenantId, matterId)).length,
              factCount: factsResult.items.length,
              evidenceCount: evidence.length,
            },
          });
        }
        return {
          workflowId: workflow.workflowId,
          workflowVersion: workflow.workflowVersion,
          executionId: workflow.executionId,
          executionSource: workflow.source,
          memo: workflow.record.memo,
          record: workflow.record,
          issues: selectedIssues,
          context: {
            documentCount: (await matterRepository.listDocuments(req.principal.tenantId, matterId)).length,
            factCount: factsResult.items.length,
            evidenceCount: evidence.length,
            coverage: factsResult.coverage,
          },
          research: workflow.research,
          billed: false,
          idempotentReplay: workflow.idempotentReplay,
        };
      } catch (error) {
        const details = error as { code?: unknown; details?: unknown; message?: unknown };
        const code = typeof details.code === 'string' ? details.code : '';
        const message = typeof details.message === 'string' ? details.message : 'Não foi possível gerar o research memo.';
        const sourceFailure = code.startsWith('SOURCE_PROVIDER_') || code === 'JURISPRUDENCE_DATA_PLANE_UNAVAILABLE';
        const idempotencyConflict = code === 'IDEMPOTENCY_CONFLICT' || message.startsWith('IDEMPOTENCY_CONFLICT');
        await recordAudit({
          sessionId,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          toolName: 'research.memo.generated',
          durationMs: Date.now() - startedAt,
          status: 'FAILED',
          payload: { matterId, query, issueCount: selectedIssues.length, error: message },
        });
        reply.status(sourceFailure ? 503 : idempotencyConflict ? 409 : 400);
        return {
          error: sourceFailure ? 'SOURCE_PROVIDER_UNAVAILABLE' : idempotencyConflict ? 'IDEMPOTENCY_CONFLICT' : 'WORKFLOW_EXECUTION_FAILED',
          message,
          details: details.details,
        };
      } finally {
        requestAbort.dispose();
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'draft.created',
          payload: { matterId, draftId: result.draft.id, draftVersionId: result.version.id },
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'draft.versioned',
          payload: { matterId, draftId, draftVersionId: result.version.id, versionNumber: result.version.versionNumber },
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'draft.review.completed',
          payload: { matterId, draftId, draftVersionId: result.draftVersionId, status: result.status, findingCount: result.findings.length },
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'draft.approval.requested',
          payload: { matterId, draftId, approvalRequestId: result.request.id, draftVersionId: result.request.draftVersionId },
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
        await emitWebhook({
          tenantId: req.principal.tenantId,
          type: 'draft.approval.resolved',
          payload: { matterId: result.request.matterId, draftId: result.request.draftId, approvalRequestId: result.request.id, decision: body.decision },
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
      const q = typeof query.q === 'string' ? query.q.trim() : '';
      const court = getSearchableCourt(query.court);
      const limit = query.limit ? parseInt(query.limit, 10) : 10;

      if (q.length < 2 || !Number.isInteger(limit) || limit < 1 || limit > 20) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'q deve conter pelo menos 2 caracteres e limit deve estar entre 1 e 20.',
        };
      }
      if (!court) return unsupportedCourtResponse(reply, query.court);
      if (!jurisprudenceSearchService) return persistentResearchDataPlaneUnavailable(reply);

      const idempotencyKey = readIdempotencyKey(req.headers);
      if (!idempotencyKey) return missingIdempotencyResponse(reply);
      const sessionId = `rest_${idempotencyKey}`;
      const startedAt = Date.now();
      const requestAbort = createRequestAbortSignal(req.raw);

      try {
        const execution = await ledgerService.executeOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          billing: getForgeLexBillingPolicy('research.search_case_law'),
          usage: {
            capability: 'research.search_case_law',
            toolName: 'research.search_case_law',
            provider: researchBillingProvider,
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => (await executeLegalGatewayTool('research.search_case_law', {
            query: q, court, limit,
          }, { sessionId, tenantId: req.principal.tenantId, userId: req.principal.userId, abortSignal: requestAbort.signal })).data,
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
          });
        }
        await emitBillingWebhooks({
          principal: req.principal,
          capability: 'research.search_case_law',
          provider: researchBillingProvider,
          idempotencyKey,
          sessionId,
          execution,
        });

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
        const unsupportedCourt = err?.code === 'UNSUPPORTED_COURT';
        reply.status(unsupportedCourt ? 422 : err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 503 : 402);
        return {
          error: unsupportedCourt ? 'UNSUPPORTED_COURT' : err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message: err.message,
          details: err.details,
        };
      } finally {
        requestAbort.dispose();
      }
    }
  );

  app.post(
    '/api/v2/research/search-case-law',
    { preHandler: authAdapter.createPreHandler(['research:read']) },
    async (req, reply) => {
      const body = (req.body ?? {}) as { query?: unknown; court?: unknown; limit?: unknown };
      const query = typeof body.query === 'string' ? body.query.trim() : '';
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

      const idempotencyKey = readIdempotencyKey(req.headers);
      if (!idempotencyKey) return missingIdempotencyResponse(reply);

      const requestAbort = createRequestAbortSignal(req.raw);
      try {
        return await runBillableSearchCaseLaw({
          principal: req.principal, reply, query, court, limit, idempotencyKey, abortSignal: requestAbort.signal,
        });
      } finally {
        requestAbort.dispose();
      }
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

      if (court.trim().length < 2 || processNumber.trim().length === 0) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'court e processNumber são obrigatórios para obter a autoridade.',
        };
      }

      const searchableCourt = getSearchableCourt(court);
      if (!searchableCourt) return unsupportedCourtResponse(reply, court);
      if (!jurisprudenceSearchService) return persistentResearchDataPlaneUnavailable(reply);
      const idempotencyKey = readIdempotencyKey(req.headers);
      if (!idempotencyKey) return missingIdempotencyResponse(reply);
      const sessionId = `rest_${idempotencyKey}`;
      const startedAt = Date.now();

      const requestAbort = createRequestAbortSignal(req.raw);
      try {
        const execution = await ledgerService.executeOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          billing: getForgeLexBillingPolicy('research.get_authority'),
          usage: {
            capability: 'research.get_authority',
            toolName: 'research.get_authority',
            provider: researchBillingProvider,
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => (await executeLegalGatewayTool('research.get_authority', {
            court: searchableCourt, processNumber, judgmentDate,
          }, { sessionId, tenantId: req.principal.tenantId, userId: req.principal.userId, abortSignal: requestAbort.signal })).data,
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
            payload: { court: searchableCourt, processNumber, judgmentDate, status: execution.data.status },
          });
        }
        if (!execution.isReplay && execution.data.status === 'VERIFIED_OFFICIAL') {
          await emitWebhook({
            tenantId: req.principal.tenantId,
            type: 'research.authority.verified',
            payload: { court, processNumber, judgmentDate, status: execution.data.status },
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
          payload: { court: searchableCourt, processNumber, judgmentDate, error: message },
        });
        reply.status(code === 'UNSUPPORTED_COURT' ? 422 : sourceFailure ? 503 : 402);
        return {
          error: code === 'UNSUPPORTED_COURT' ? 'UNSUPPORTED_COURT' : sourceFailure ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message,
          details: details.details,
        };
      } finally {
        requestAbort.dispose();
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

      if (court.trim().length < 2 || processNumber.trim().length === 0) {
        reply.status(400);
        return {
          error: 'INVALID_REQUEST',
          message: 'court e processNumber são obrigatórios para verificar a autoridade.',
        };
      }
      const searchableCourt = getSearchableCourt(court);
      if (!searchableCourt) return unsupportedCourtResponse(reply, court);
      if (!jurisprudenceSearchService) return persistentResearchDataPlaneUnavailable(reply);
      const idempotencyKey = readIdempotencyKey(req.headers);
      if (!idempotencyKey) return missingIdempotencyResponse(reply);
      const sessionId = `rest_${idempotencyKey}`;
      const startedAt = Date.now();

      const requestAbort = createRequestAbortSignal(req.raw);
      try {
        const execution = await ledgerService.executeOperation({
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          idempotencyKey,
          billing: getForgeLexBillingPolicy('research.verify_authority'),
          usage: {
            capability: 'research.verify_authority',
            toolName: 'research.verify_authority',
          provider: researchBillingProvider,
            requestId: idempotencyKey,
            sessionId,
            userId: req.principal.userId,
          },
          operation: async () => (await executeLegalGatewayTool('research.verify_authority', {
            court: searchableCourt, processNumber, judgmentDate: body.judgmentDate,
          }, { sessionId, tenantId: req.principal.tenantId, userId: req.principal.userId, abortSignal: requestAbort.signal })).data,
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
            payload: { court: searchableCourt, processNumber, judgmentDate: body.judgmentDate, status: execution.data.status },
          });
        }
        if (!execution.isReplay && execution.data.status === 'VERIFIED_OFFICIAL') {
          await emitWebhook({
            tenantId: req.principal.tenantId,
            type: 'research.authority.verified',
            payload: { court, processNumber, judgmentDate: body.judgmentDate, status: execution.data.status },
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
          payload: { court: searchableCourt, processNumber, judgmentDate: body.judgmentDate, error: err?.message },
        });
        const unsupportedCourt = err?.code === 'UNSUPPORTED_COURT';
        reply.status(unsupportedCourt ? 422 : err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 503 : 402);
        return {
          error: unsupportedCourt ? 'UNSUPPORTED_COURT' : err?.code?.startsWith?.('SOURCE_PROVIDER_') ? 'SOURCE_PROVIDER_UNAVAILABLE' : 'PAYMENT_REQUIRED',
          message: err.message,
          details: err.details,
        };
      } finally {
        requestAbort.dispose();
      }
    }
  );

  // 6. Remote MCP Endpoint (POST /mcp)
  app.post(
    '/mcp',
    { preHandler: authAdapter.createPreHandler(['mcp']) },
    async (req) => {
      const body = req.body as any;
      const idempotencyKey = readIdempotencyKey(req.headers);
      const requestAbort = createRequestAbortSignal(req.raw);
      try {
        return await mcpHandler.handleRequest(body, {
          idempotencyKey,
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          abortSignal: requestAbort.signal,
        });
      } finally {
        requestAbort.dispose();
      }
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

  if (environment.FORGELEX_WEB_ROOT) {
    await registerStaticWeb(app, environment.FORGELEX_WEB_ROOT);
  }

  return app;
}
