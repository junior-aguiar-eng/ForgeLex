import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ForgeLexDatabase, Client } from '@forgelex/persistence';
import { LegalAnswerSchema, type AuthenticatedPrincipal } from '@forgelex/domain';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { ExecutionService, StartExecutionSchema } from './execution-service.js';
import { ExecutionWorker, type ExecutionDriver } from './execution-worker.js';
import { encodeExecutionEvent } from './event-stream.js';
import { createCaseTaskDriver, type NativeCaseTaskOptions } from './case-task-driver.js';
import type { ResearchService } from '@forgelex/legal-tools';

export interface AgenticWorkspaceRuntimeOptions {
  driver?: ExecutionDriver;
  caseTask?: NativeCaseTaskOptions;
  scheduler?: boolean;
  pollMs?: number;
  leaseMs?: number;
}
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
  if (deps.options?.driver && deps.options.caseTask) throw new Error('CASE_TASK_CONFIGURATION_CONFLICT');
  const caseTask = deps.database && deps.client && deps.options?.caseTask ? createCaseTaskDriver(deps.database, deps.client, deps.options.caseTask, deps.researchService) : undefined;
  const driver = deps.options?.driver ?? caseTask?.driver;
  const service =
    deps.database && deps.client
      ? new ExecutionService(deps.database, deps.client, { executorAvailable: Boolean(driver) })
      : undefined;
  const worker = service
    ? new ExecutionWorker(service, driver, { leaseMs: deps.options?.leaseMs })
    : undefined;
  let running = false;
  const tick = async () => {
    if (!worker || running) return;
    running = true;
    try {
      await worker.runOnce();
    } catch {
      /* Persistent lease permits safe recovery on the next tick. */
    } finally {
      running = false;
    }
  };
  if (worker && deps.options?.scheduler !== false) {
    const timer = setInterval(() => void tick(), deps.options?.pollMs ?? 1000);
    timer.unref();
    app.addHook('onReady', async () => {
      void tick();
    });
    app.addHook('onClose', async () => {
      clearInterval(timer);
      await worker.stop();
    });
  }
  const owner = (req: FastifyRequest) => ({ tenantId: req.principal.tenantId, userId: req.principal.userId });
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal.authMethod !== 'session')
      return reply
        .code(403)
        .send({ error: 'SESSION_REQUIRED', message: 'Entre na sua conta para acessar este trabalho.' });
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
  const options = { preHandler: [deps.auth.createPreHandler(['research:read']), session, caseScope] };
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
        const message = error instanceof Error ? error.message : '';
        const code =
          error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : [
                  'IDEMPOTENCY_CONFLICT',
                  'CONTEXT_CONFLICT',
                  'EXECUTION_CONFLICT',
                  'QUESTION_EXPIRED',
                  'RECONCILIATION_REQUIRED',
                  'EXECUTOR_UNAVAILABLE',
                  'ACCESS_REVOKED',
                ].includes(message)
              ? message
              : /NOT_FOUND$/.test(message)
                ? 'EXECUTION_NOT_FOUND'
                : 'EXECUTION_UNAVAILABLE';
        const status =
          code === 'INVALID_INPUT'
            ? 400
            : code === 'EXECUTION_NOT_FOUND'
              ? 404
              : code === 'ACCESS_REVOKED'
                ? 403
                : code.endsWith('UNAVAILABLE')
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
      reply.code(202).send(await required().startExecution(owner(req), key(req), StartExecutionSchema.parse(req.body))),
    ),
  );
  app.get(
    '/api/agentic/executions/:id',
    options,
    handle(async (req) => required().getExecution(owner(req), executionId(req))),
  );
  app.post(
    '/api/agentic/executions/:id/answers',
    options,
    handle(async (req, reply) =>
      reply
        .code(202)
        .send(
          await required().answerExecution(owner(req), executionId(req), key(req), LegalAnswerSchema.parse(req.body)),
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
      return required().cancelExecution(owner(req), executionId(req), key(req));
    }),
  );
  app.post(
    '/api/agentic/executions/:id/continue',
    options,
    handle(async (req, reply) => {
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
      const poll = async () => {
        if (closed) return;
        try {
          const current = await deps.auth.authenticate(req.headers.authorization).catch(() => null);
          if (!current || !sameIdentity(current)) throw new Error('ACCESS_REVOKED');
          if (closed) return;
          batch = await s.listClientEvents(identity, id, cursor);
          send();
          if (batch.terminal) {
            reply.raw.end();
            return;
          }
          reply.raw.write(': keepalive\n\n');
          timer = setTimeout(() => void poll(), deps.options?.pollMs ?? 1000);
          timer.unref();
        } catch (error) {
          if (!closed) {
            const code =
              error instanceof Error && error.message === 'ACCESS_REVOKED' ? 'ACCESS_REVOKED' : 'EXECUTION_UNAVAILABLE';
            reply.raw.write(`event: error\ndata: ${JSON.stringify({ code })}\n\n`);
            reply.raw.end();
          }
        }
      };
      send();
      if (batch.terminal) reply.raw.end();
      else {
        timer = setTimeout(() => void poll(), deps.options?.pollMs ?? 1000);
        timer.unref();
      }
      return reply;
    }),
  );
  if (caseTask) app.get('/api/agentic/deliveries/:id', { preHandler: [deps.auth.createPreHandler(['research:read']), session] }, handle(async (req, reply) => {
    const id = z.object({ id: z.string().min(1).max(200) }).parse(req.params).id;
    const scope = await caseTask.native.getDeliveryContext(owner(req), id);
    if (scope.matterId && !req.principal.scopes.includes('matter:read')) return reply.code(403).send({ error: 'ACCESS_REVOKED', message: 'Seu acesso atual não permite ler este caso.' });
    return caseTask.native.getDelivery(owner(req), id);
  }));
  return { service, worker };
}
