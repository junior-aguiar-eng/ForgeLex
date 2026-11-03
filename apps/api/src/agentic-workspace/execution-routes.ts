import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  NativeEvidenceReviewRepository,
  EvidenceReapprovalRepository,
  AgenticWorkspaceRepository,
  type ForgeLexDatabase,
  type Client,
} from '@forgelex/persistence';
import {
  EvidenceReviewCommandSchema,
  EvidenceReapprovalCommandSchema,
  LegalAnswerSchema,
  type AuthenticatedPrincipal,
} from '@forgelex/domain';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { ExecutionService, StartExecutionSchema } from './execution-service.js';
import { ExecutionWorker, type ExecutionDriver } from './execution-worker.js';
import { encodeExecutionEvent } from './event-stream.js';
import { createCaseTaskDriver, type NativeCaseTaskOptions } from './case-task-driver.js';
import type { ResearchService } from '@forgelex/legal-tools';
import {
  LEGAL_ACTION_CATALOG,
  EVIDENCE_TASK_ACTION,
  FinalEditorService,
  FinalEditorGenerator,
  EditorialReviewService,
  type FinalEditorGenerationOptions,
} from '@forgelex/legal-workflows';
import type { ClosedPilot } from './closed-pilot.js';
import type { CommercialRuntime } from './commercial-runtime.js';
import { reportAgenticFailure, throttledReporter } from './failure-log.js';

export interface AgenticWorkspaceRuntimeOptions {
  /** Local simulation injection only; production bootstrap leaves this absent. */
  editorialGeneration?: FinalEditorGenerationOptions;
  closedPilot?: ClosedPilot;
  commercial?: CommercialRuntime;
  driver?: ExecutionDriver;
  caseTask?: NativeCaseTaskOptions;
  scheduler?: boolean;
  pollMs?: number;
  /** How often an open event stream re-verifies the session; the stream itself polls at `pollMs`. */
  authRecheckMs?: number;
  leaseMs?: number;
  /** Admission cleanup cadence; defaults to 5 s, or to every tick when `pollMs` is tuned (tests). */
  sweepMs?: number;
}
const STREAM_AUTH_FAILURE_LIMIT = 3;
export function registerAgenticWorkspace(
  app: FastifyInstance,
  deps: {
    database?: ForgeLexDatabase;
    client?: Client;
    auth: AuthAdapter;
    environment: Record<string, string | undefined>;
    options?: AgenticWorkspaceRuntimeOptions;
    researchService?: ResearchService;
  },
) {
  if (deps.environment.FORGELEX_AGENTIC_WORKSPACE_ENABLED !== 'true') return;
  const pilot = deps.options?.closedPilot;
  const commercial = deps.options?.commercial;
  if (commercial && (pilot || deps.options?.driver || deps.options?.caseTask))
    throw new Error('CASE_TASK_CONFIGURATION_CONFLICT');
  if (pilot && (deps.options?.driver || deps.options?.caseTask)) throw new Error('CASE_TASK_CONFIGURATION_CONFLICT');
  if (deps.options?.driver && deps.options.caseTask) throw new Error('CASE_TASK_CONFIGURATION_CONFLICT');
  const caseTask =
    deps.database && deps.client && (pilot?.caseTask || commercial?.caseTask || deps.options?.caseTask)
      ? createCaseTaskDriver(
          deps.database,
          deps.client,
          (pilot?.caseTask ?? commercial?.caseTask ?? deps.options!.caseTask)!,
          pilot || commercial ? undefined : deps.researchService,
        )
      : undefined;
  const driver = deps.options?.driver ?? caseTask?.driver;
  const service =
    pilot?.service ??
    commercial?.service ??
    (deps.database && deps.client
      ? new ExecutionService(deps.database, deps.client, { executorAvailable: Boolean(driver) })
      : undefined);
  const worker = service
    ? new ExecutionWorker(service, driver, {
        leaseMs: deps.options?.leaseMs,
        ...(commercial ? { maxDurationMs: 300000 } : {}),
      })
    : undefined;
  const report = throttledReporter();
  let running = false;
  let sweeping = false,
    lastSweepAt = 0;
  const sweepMs = deps.options?.sweepMs ?? (deps.options?.pollMs === undefined ? 5000 : 0);
  const sweep = async () => {
    if (!commercial || sweeping || Date.now() - lastSweepAt < sweepMs) return;
    sweeping = true;
    lastSweepAt = Date.now();
    try {
      await commercial.sweepAdmissions();
    } catch (error) {
      // Durable admission cleanup is retried on the next poll; a persistent failure must still be visible.
      report('agentic.admission_sweep.failed', error);
    } finally {
      sweeping = false;
    }
  };
  const tick = async () => {
    if (!worker || running) return;
    running = true;
    try {
      await worker.runOnce();
    } catch (error) {
      // The persistent lease permits safe recovery on the next tick; a persistent failure must still be visible.
      report('agentic.worker_tick.failed', error);
    } finally {
      running = false;
    }
  };
  if (worker && deps.options?.scheduler !== false) {
    const timer = setInterval(() => {
      void sweep();
      void tick();
    }, deps.options?.pollMs ?? 1000);
    timer.unref();
    app.addHook('onReady', async () => {
      await sweep();
      void tick();
    });
    app.addHook('onClose', async () => {
      clearInterval(timer);
      await worker.stop();
    });
  }
  const owner = (req: FastifyRequest) => ({ tenantId: req.principal.tenantId, userId: req.principal.userId });
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    if (pilot) {
      try {
        pilot.assertOwner(owner(req));
      } catch {
        return reply
          .code(403)
          .send({ error: 'CLOSED_PILOT_FORBIDDEN', message: 'Este piloto é restrito ao responsável autorizado.' });
      }
    }
    if (req.principal.authMethod !== 'session')
      return reply
        .code(403)
        .send({ error: 'SESSION_REQUIRED', message: 'Entre na sua conta para acessar este trabalho.' });
  };
  const closedCommands = async (req: FastifyRequest, reply: FastifyReply) => {
    if (commercial && req.method === 'POST') {
      const id = (req.params as { id?: string }).id;
      if (id && !commercial.canManageExecution(await commercial.service.store.workspace.getExecution(owner(req), id)))
        return reply.code(404).send({ error: 'EXECUTION_NOT_FOUND' });
    }
    if (!pilot) return;
    const routeId = (req.params as { id?: string }).id;
    if (routeId) {
      const id = req.url.startsWith('/api/agentic/deliveries/') ? routeId.replace(/^delivery:/, '') : routeId;
      const execution = await pilot.service.store.workspace.getExecution(owner(req), id);
      if (!pilot.canManageExecution(execution)) return reply.code(404).send({ error: 'EXECUTION_NOT_FOUND' });
    }
    if (req.method !== 'POST' || req.url.startsWith('/api/agentic/pilot/')) return;
    if (req.url.endsWith('/cancel')) {
      const id = (req.params as { id?: string }).id;
      const execution = id ? await pilot.service.store.workspace.getExecution(owner(req), id) : undefined;
      if (pilot.canManageExecution(execution)) return;
    }
    return reply.code(403).send({
      error: 'CLOSED_PILOT_SYNTHETIC_ONLY',
      message: 'Use somente os exemplos sintéticos aprovados no painel do piloto.',
    });
  };
  const caseScope = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal.scopes.includes('matter:read') || !service) return;
    try {
      const body = req.body as
        { matterId?: unknown; conversationId?: unknown; context?: { documents?: unknown } } | undefined;
      const ids = {
        executionId: (req.params as { id?: string })?.id,
        conversationId: typeof body?.conversationId === 'string' ? body.conversationId : undefined,
      };
      if (
        body?.matterId ||
        (Array.isArray(body?.context?.documents) && body.context.documents.length) ||
        (await service.hasCaseContext(owner(req), ids))
      )
        return reply
          .code(403)
          .send({ error: 'ACCESS_REVOKED', message: 'Seu acesso atual não permite ler o contexto deste caso.' });
    } catch {
      return reply
        .code(503)
        .send({ error: 'EXECUTION_UNAVAILABLE', message: 'Não foi possível verificar o acesso ao trabalho.' });
    }
  };
  const options = { preHandler: [deps.auth.createPreHandler(['research:read']), session, caseScope, closedCommands] };
  const key = (req: FastifyRequest) => z.string().trim().min(1).max(200).parse(req.headers['idempotency-key']);
  const executionId = (req: FastifyRequest) => z.object({ id: z.string().guid() }).parse(req.params).id;
  const required = () => {
    if (!service) throw new Error('PERSISTENCE_UNAVAILABLE');
    return service;
  };
  const handle =
    (operation: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return await operation(req, reply);
      } catch (error) {
        const original = error instanceof Error ? error.message : '';
        const message = original === 'AGENTIC_TENANT_CLOSED' ? 'ACCESS_REVOKED' : original;
        const code =
          error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : [
                  'EVIDENCE_REVIEW_CONFLICT',
                  'EDITORIAL_VERSION_CONFLICT',
                  'EDITORIAL_GENERATION_DISABLED',
                  'EDITORIAL_PROVIDER_NOT_ALLOWED',
                  'EDITORIAL_GENERATION_CANCELLED',
                  'EDITORIAL_GENERATION_TIMEOUT',
                  'EDITORIAL_GENERATION_FAILED',
                  'EDITORIAL_CONTEXT_CHANGED',
                  'EDITORIAL_CONTEXT_LIMIT',
                  'EDITORIAL_REVIEW_CONFLICT',
                  'EDITORIAL_REVIEW_LIMIT',
                  'EDITORIAL_REVIEW_INTEGRITY',
                  'EDITORIAL_SOURCE_UNAVAILABLE',
                  'EDITORIAL_AUDIT_UNAVAILABLE',
                  'SOURCE_VERSION_CONFLICT',
                  'EVIDENCE_COMMAND_CONFLICT',
                  'EVIDENCE_ALREADY_DECIDED',
                  'EVIDENCE_ITEM_INVALID',
                  'EVIDENCE_SOURCE_UNAVAILABLE',
                  'EVIDENCE_DATE_REQUIRED',
                  'EVIDENCE_DATE_INVALID',
                  'EVIDENCE_REVIEW_LIMIT',
                  'EVIDENCE_REVIEW_NOT_AVAILABLE',
                  'ANALYSIS_FACT_REQUIRED',
                  'MATTER_NOT_ACTIVE',
                  'LIFECYCLE_CONFLICT',
                  'IDEMPOTENCY_CONFLICT',
                  'CONTEXT_CONFLICT',
                  'APPROVED_CONTEXT_CHANGED',
                  'APPROVED_FACT_REQUIRED',
                  'TASK_CONTEXT_LIMIT',
                  'EXECUTION_CONFLICT',
                  'QUESTION_EXPIRED',
                  'RECONCILIATION_REQUIRED',
                  'EXECUTOR_UNAVAILABLE',
                  'ACCESS_REVOKED',
                  'COMMERCIAL_EXECUTION_ACTIVE',
                  'COMMERCIAL_RECONCILIATION_REQUIRED',
                  'COMMERCIAL_DAILY_LIMIT',
                  'COMMERCIAL_MONTHLY_LIMIT',
                  'BILLING_INSUFFICIENT_BALANCE',
                  'COMMERCIAL_POLICY_MISMATCH',
                ].includes(message)
              ? message
              : /NOT_FOUND$/.test(message)
                ? 'EXECUTION_NOT_FOUND'
                : 'EXECUTION_UNAVAILABLE';
        if (code === 'EXECUTION_UNAVAILABLE' && !(error instanceof z.ZodError))
          reportAgenticFailure('agentic.request.failed', error, { method: req.method, route: req.routeOptions.url });
        const status =
          code === 'INVALID_INPUT'
            ? 400
            : code === 'EXECUTION_NOT_FOUND'
              ? 404
              : code === 'ACCESS_REVOKED'
                ? 403
                : code === 'EXECUTION_UNAVAILABLE' || code === 'EXECUTOR_UNAVAILABLE'
                  ? 503
                  : 409;
        return reply.code(status).send({
          error: code,
          message:
            code === 'INVALID_INPUT'
              ? 'Confira os dados da solicitação.'
              : 'Não foi possível concluir esta operação. Consulte o estado do trabalho.',
        });
      }
    };
  app.post(
    '/api/agentic/executions',
    options,
    handle(async (req, reply) =>
      reply
        .code(202)
        .send(
          commercial
            ? await commercial.start(owner(req), key(req), req.body)
            : await required().startExecution(owner(req), key(req), StartExecutionSchema.parse(req.body)),
        ),
    ),
  );
  app.get(
    '/api/agentic/actions',
    options,
    handle(async () => ({
      available: Boolean(driver),
      ...(pilot ? { closedPilot: true } : {}),
      ...(commercial ? { commercial: true } : {}),
      actions: [...LEGAL_ACTION_CATALOG, EVIDENCE_TASK_ACTION].map((a) => ({
        id: a.id,
        label: a.label,
        dialogue: a.dialogue.map((q) => ({ prompt: q.prompt, options: [...q.options] })),
      })),
    })),
  );
  if (commercial) {
    app.get(
      '/api/agentic/commercial/quote',
      options,
      handle(async (req) => commercial.finance.quote(owner(req))),
    );
    app.post(
      '/api/agentic/commercial/executions',
      options,
      handle(async (req, reply) => reply.code(202).send(await commercial.start(owner(req), key(req), req.body))),
    );
    app.get(
      '/api/agentic/commercial/executions/:id/receipt',
      options,
      handle(async (req) => {
        const receipt = await commercial.finance.getReceipt(owner(req), executionId(req));
        if (!receipt) throw new Error('EXECUTION_NOT_FOUND');
        return {
          executionId: receipt.executionId,
          reservedCents: receipt.reservedCents,
          chargedCents: receipt.chargedCents,
          releasedCents: receipt.releasedCents,
          expiredPromoCents: receipt.expiredPromoCents,
          status: receipt.status,
          currency: receipt.currency,
          policyVersion: receipt.policyVersion,
        };
      }),
    );
  }
  if (pilot) {
    const pilotError = (reply: FastifyReply, error: unknown) => {
      const original = error instanceof Error ? error.message : '';
      const message = original === 'AGENTIC_TENANT_CLOSED' ? 'ACCESS_REVOKED' : original;
      const code =
        error instanceof z.ZodError
          ? 'INVALID_INPUT'
          : /^(ACCESS_REVOKED|CLOSED_PILOT_[A-Z_]+|BILLING_INSUFFICIENT_BALANCE|BUDGET_EXCEEDED|IDEMPOTENCY_CONFLICT|EXECUTION_CONFLICT|EXECUTION_NOT_FOUND)$/.test(
                message,
              )
            ? message
            : 'CLOSED_PILOT_UNAVAILABLE';
      return reply
        .code(
          code === 'INVALID_INPUT'
            ? 400
            : code === 'EXECUTION_NOT_FOUND'
              ? 404
              : code === 'CLOSED_PILOT_FORBIDDEN' || code === 'ACCESS_REVOKED'
                ? 403
                : code === 'CLOSED_PILOT_UNAVAILABLE'
                  ? 503
                  : 409,
        )
        .send({
          error: code,
          message: 'Não foi possível autorizar o piloto. Confira o escopo e o orçamento; o teto não foi reposto.',
        });
    };
    app.get('/api/agentic/pilot/budget', options, async (req, reply) => {
      try {
        const query = z.strictObject({ executionId: z.string().guid().optional() }).parse(req.query);
        return await pilot.summary(owner(req), query.executionId);
      } catch (error) {
        return pilotError(reply, error);
      }
    });
    app.post('/api/agentic/pilot/executions', options, async (req, reply) => {
      try {
        return reply.code(202).send(await pilot.start(owner(req), key(req), req.body));
      } catch (error) {
        return pilotError(reply, error);
      }
    });
  }
  app.post(
    '/api/agentic/executions/:id/corrections',
    options,
    handle(async (req, reply) =>
      reply
        .code(202)
        .send(
          commercial
            ? await commercial.successor(owner(req), executionId(req), key(req), 'correct', req.body)
            : await required().correctAnswer(owner(req), executionId(req), key(req), LegalAnswerSchema.parse(req.body)),
        ),
    ),
  );
  app.get(
    '/api/agentic/conversations',
    options,
    handle(async (req) => {
      z.object({}).strict().parse(req.query);
      const s = required(),
        canCase = req.principal.scopes.includes('matter:read');
      // Same visibility as the single execution: case work needs the case scope, and the commercial
      // and pilot modes list only what they themselves manage.
      const manages = commercial?.canManageExecution ?? pilot?.canManageExecution;
      const items = (await s.store.workspace.listRecentConversations(owner(req)))
        .filter((c) => (canCase || !c.matterId) && (!manages || manages(c.execution)))
        .map((c) => ({
          executionId: c.execution.id,
          title: c.objective.length > 90 ? `${c.objective.slice(0, 87)}…` : c.objective,
          status: c.execution.status,
          updatedAt: c.execution.updatedAt,
        }));
      return { items };
    }),
  );
  app.get(
    '/api/agentic/executions/:id',
    options,
    handle(async (req) => ({
      ...(await required().getExecution(owner(req), executionId(req))),
      permissions: {
        editDraft: req.principal.scopes.includes('draft:write'),
        reviewEvidence: req.principal.scopes.includes('matter:write') && req.principal.scopes.includes('matter:read'),
      },
    })),
  );
  app.post(
    '/api/agentic/executions/:id/answers',
    options,
    handle(async (req, reply) =>
      reply
        .code(202)
        .send(
          commercial
            ? await commercial.successor(owner(req), executionId(req), key(req), 'answer', req.body)
            : await required().answerExecution(
                owner(req),
                executionId(req),
                key(req),
                LegalAnswerSchema.parse(req.body),
              ),
        ),
    ),
  );
  app.post(
    '/api/agentic/executions/:id/cancel',
    options,
    handle(async (req) => {
      z.object({})
        .strict()
        .parse(req.body ?? {});
      const id = executionId(req);
      const result = await required().cancelExecution(owner(req), id, key(req));
      // A deferred (cooperative) cancel must not abort the call in flight; the worker finishes it first.
      if (result.status === 'CANCELLED') worker?.cancel(id);
      return result;
    }),
  );
  app.post(
    '/api/agentic/executions/:id/continue',
    options,
    handle(async (req, reply) => {
      if (commercial)
        return reply
          .code(202)
          .send(await commercial.successor(owner(req), executionId(req), key(req), 'continue', req.body));
      z.object({})
        .strict()
        .parse(req.body ?? {});
      return reply.code(202).send(await required().continueFromCheckpoint(owner(req), executionId(req), key(req)));
    }),
  );
  app.get(
    '/api/agentic/executions/:id/events',
    options,
    handle(async (req, reply) => {
      const query = z
        .object({ after: z.coerce.number().int().nonnegative().default(0) })
        .strict()
        .parse(req.query);
      const id = executionId(req),
        s = required(),
        identity = owner(req);
      const requiresCaseScope = await s.hasCaseContext(identity, { executionId: id });
      let cursor = query.after;
      // Authorization and validation complete before opening an irreversible streaming response.
      let batch = await s.listClientEvents(identity, id, cursor);
      reply.hijack();
      for (const [name, value] of Object.entries(reply.getHeaders()))
        if (value !== undefined) reply.raw.setHeader(name, value);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(': connected\n\n');
      let closed = false,
        timer: ReturnType<typeof setTimeout> | undefined;
      reply.raw.once('close', () => {
        closed = true;
        if (timer) clearTimeout(timer);
      });
      const sameIdentity = (p: AuthenticatedPrincipal) =>
        p.authMethod === 'session' &&
        p.tenantId === identity.tenantId &&
        p.userId === identity.userId &&
        p.scopes.includes('research:read') &&
        (!requiresCaseScope || p.scopes.includes('matter:read'));
      const send = () => {
        for (const event of batch.events) {
          if (closed) return;
          reply.raw.write(encodeExecutionEvent(event));
        }
        cursor = batch.cursor;
      };
      // Identity providers fail transiently (timeout, 429, 5xx) and the verifier reports that as a null
      // principal. Only consecutive failures, or a principal that no longer matches, end the stream.
      let authFailures = 0,
        lastAuthAt = Date.now();
      const recheckMs = deps.options?.authRecheckMs ?? 3000;
      const again = () => {
        timer = setTimeout(() => void poll(), deps.options?.pollMs ?? 1000);
        timer.unref();
      };
      const poll = async () => {
        if (closed) return;
        try {
          // The session was verified when the stream opened; re-verify on a slower cadence than the event poll.
          if (Date.now() - lastAuthAt >= recheckMs) {
            const current = await deps.auth.authenticate(req.headers.authorization).catch(() => null);
            lastAuthAt = Date.now();
            if (current && !sameIdentity(current)) throw new Error('ACCESS_REVOKED');
            if (!current) {
              if (++authFailures >= STREAM_AUTH_FAILURE_LIMIT) throw new Error('ACCESS_REVOKED');
              if (closed) return;
              reply.raw.write(': keepalive\n\n');
              again();
              return;
            }
            authFailures = 0;
            if (closed) return;
          }
          // Two plain reads decide whether the heavy, locking snapshot is worth taking.
          if (await s.eventsChanged(identity, id, cursor)) {
            batch = await s.listClientEvents(identity, id, cursor);
            send();
            if (batch.terminal) {
              reply.raw.end();
              return;
            }
          }
          if (closed) return;
          reply.raw.write(': keepalive\n\n');
          again();
        } catch (error) {
          if (!closed) {
            const code =
              error instanceof Error && ['ACCESS_REVOKED', 'AGENTIC_TENANT_CLOSED'].includes(error.message)
                ? 'ACCESS_REVOKED'
                : 'EXECUTION_UNAVAILABLE';
            if (code === 'EXECUTION_UNAVAILABLE')
              reportAgenticFailure('agentic.stream.failed', error, { executionId: id });
            reply.raw.write(`event: error\ndata: ${JSON.stringify({ code })}\n\n`);
            reply.raw.end();
          }
        }
      };
      send();
      if (batch.terminal) reply.raw.end();
      else again();
      return reply;
    }),
  );
  if (caseTask)
    app.get(
      '/api/agentic/deliveries/:id',
      { preHandler: [deps.auth.createPreHandler(['research:read']), session] },
      handle(async (req, reply) => {
        const id = z.object({ id: z.string().min(1).max(200) }).parse(req.params).id;
        const scope = await caseTask.native.getDeliveryContext(owner(req), id);
        if (scope.matterId && !req.principal.scopes.includes('matter:read'))
          return reply
            .code(403)
            .send({ error: 'ACCESS_REVOKED', message: 'Seu acesso atual não permite ler este caso.' });
        return caseTask.native.getDelivery(owner(req), id);
      }),
    );
  if (caseTask && deps.database) {
    const nativeOptions = (pilot?.caseTask ?? commercial?.caseTask ?? deps.options!.caseTask)!;
    const reviews = new NativeEvidenceReviewRepository(deps.database, nativeOptions.authorizeNative);
    const changes = new EvidenceReapprovalRepository(
      deps.database,
      nativeOptions.authorizeNative,
      async (owner, id, db) => {
        const execution = await new AgenticWorkspaceRepository(db).getExecution(owner, id);
        if (
          !execution ||
          (pilot && !pilot.canManageExecution(execution)) ||
          (commercial && !commercial.canManageExecution(execution))
        )
          throw new Error('DELIVERY_NOT_FOUND');
      },
    );
    const reviewMatter = (req: FastifyRequest) => z.object({ matterId: z.string().uuid() }).parse(req.params).matterId;
    app.get(
      '/api/agentic/matters/:matterId/evidence-changes',
      {
        preHandler: [deps.auth.createPreHandler(['research:read', 'matter:read']), session],
      },
      handle(async (req) => changes.preview(owner(req), reviewMatter(req))),
    );
    app.post(
      '/api/agentic/matters/:matterId/evidence-changes/decisions',
      {
        preHandler: [deps.auth.createPreHandler(['research:read', 'matter:read', 'matter:write']), session],
      },
      handle(async (req) =>
        changes.approve(owner(req), reviewMatter(req), EvidenceReapprovalCommandSchema.parse(req.body)),
      ),
    );
    const reviewId = async (req: FastifyRequest) => {
      const id = z.object({ id: z.string().min(1).max(200) }).parse(req.params).id;
      // Preserve the execution boundary of each runtime, including human review commands.
      await caseTask.native.getDeliveryContext(owner(req), id);
      const execution = await required().store.workspace.getExecution(owner(req), id.replace(/^delivery:/, ''));
      if (
        !execution ||
        (pilot && !pilot.canManageExecution(execution)) ||
        (commercial && !commercial.canManageExecution(execution))
      )
        throw new Error('DELIVERY_NOT_FOUND');
      return id;
    };
    const editor = new FinalEditorService(caseTask.native);
    const generator = new FinalEditorGenerator(editor, deps.options?.editorialGeneration);
    const editorialReview = new EditorialReviewService(caseTask.native);
    const editorialTarget = z.strictObject({
      draftId: z.string().min(1).max(200),
      versionId: z.string().min(1).max(200),
    });
    const editorialOptions = { preHandler: [deps.auth.createPreHandler(['research:read', 'matter:read']), session] };
    app.get(
      '/api/agentic/deliveries/:id/editorial-context',
      editorialOptions,
      handle(async (req) => editor.load(owner(req), await reviewId(req), editorialTarget.parse(req.query))),
    );
    app.post(
      '/api/agentic/deliveries/:id/editorial-proposals/validate',
      editorialOptions,
      handle(async (req) => {
        const id = await reviewId(req);
        const body = editorialTarget.extend({ proposal: z.unknown() }).parse(req.body);
        return editor.validate(owner(req), id, body, body.proposal);
      }),
    );
    app.get(
      '/api/agentic/deliveries/:id/editorial-review',
      editorialOptions,
      handle(async (req) => editorialReview.history(owner(req), await reviewId(req), req.query)),
    );
    app.post(
      '/api/agentic/deliveries/:id/editorial-review/preview',
      editorialOptions,
      handle(async (req) => editorialReview.review(owner(req), await reviewId(req), req.body, 'preview')),
    );
    app.post(
      '/api/agentic/deliveries/:id/editorial-review/decisions',
      {
        preHandler: [deps.auth.createPreHandler(['research:read', 'matter:read', 'matter:write']), session],
      },
      handle(async (req) => editorialReview.review(owner(req), await reviewId(req), req.body, 'decide')),
    );
    app.post(
      '/api/agentic/deliveries/:id/editorial-proposals/generate',
      editorialOptions,
      handle(async (req, reply) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        req.raw.once('aborted', abort);
        reply.raw.once('close', abort);
        try {
          if (req.raw.aborted || reply.raw.destroyed) abort();
          if (controller.signal.aborted) throw new Error('EDITORIAL_GENERATION_CANCELLED');
          const id = await reviewId(req),
            target = editorialTarget.parse(req.body);
          if (req.raw.aborted || reply.raw.destroyed) abort();
          return await generator.generate(owner(req), id, target, controller.signal);
        } finally {
          req.raw.removeListener('aborted', abort);
          reply.raw.removeListener('close', abort);
        }
      }),
    );
    app.get(
      '/api/agentic/deliveries/:id/evidence-review',
      {
        preHandler: [deps.auth.createPreHandler(['research:read', 'matter:read']), session],
      },
      handle(async (req) => reviews.preview(owner(req), await reviewId(req))),
    );
    app.post(
      '/api/agentic/deliveries/:id/evidence-review/decisions',
      {
        preHandler: [deps.auth.createPreHandler(['research:read', 'matter:read', 'matter:write']), session],
      },
      handle(async (req) =>
        reviews.decide(owner(req), await reviewId(req), EvidenceReviewCommandSchema.parse(req.body)),
      ),
    );
  }
  return { service, worker };
}
