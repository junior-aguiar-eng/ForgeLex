import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { z } from 'zod';
import type { GuidanceService } from './guidance-service.js';

type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export function registerGuidanceRoutes(
  app: FastifyInstance,
  service: GuidanceService,
  options: RouteShorthandOptions,
  handle: (handler: Handler) => Handler,
) {
  const base = '/api/agentic/guidance';
  const access = (req: FastifyRequest) => ({
    owner: { tenantId: req.principal.tenantId, userId: req.principal.userId },
    canReadMatter: req.principal.scopes.includes('matter:read'),
  });
  const id = (req: FastifyRequest) => z.object({ conversationId: z.guid() }).parse(req.params).conversationId;
  const command = (req: FastifyRequest) => z.uuid().parse(req.headers['idempotency-key']);
  app.post(
    base,
    options,
    handle(async (req, reply) => reply.code(201).send(await service.start(access(req), command(req), req.body ?? {}))),
  );
  app.post(
    `${base}/matter-suggestions`,
    options,
    handle(async (req, reply) => {
      try {
        return service.suggestMatter(req.body ?? {});
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Confira o texto da matéria.' });
        }
        throw error;
      }
    }),
  );
  app.get(
    `${base}/:conversationId`,
    options,
    handle(async (req) => service.get(access(req), id(req))),
  );
  for (const mode of ['answer', 'correct'] as const) {
    app.post(
      `${base}/:conversationId/${mode}`,
      options,
      handle(async (req, reply) => {
        try {
          return await service.respond(access(req), id(req), command(req), req.body, mode === 'correct');
        } catch (error) {
          if (error instanceof Error && error.message === 'INVALID_ANSWER')
            return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Confira a opção escolhida.' });
          throw error;
        }
      }),
    );
  }
}
