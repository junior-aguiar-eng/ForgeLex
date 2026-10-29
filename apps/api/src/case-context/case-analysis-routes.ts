import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AnalysisDecisionInputSchema } from '@forgelex/domain';
import { CaseAnalysisRepository } from '@forgelex/persistence';
import type { AuditRecorder } from '@forgelex/audit';
import { AuthAdapter } from '../auth/fastify-auth.js';

export function registerCaseAnalysisRoutes(
  app: FastifyInstance,
  repo: CaseAnalysisRepository,
  auth: AuthAdapter,
  audit?: AuditRecorder,
) {
  const params = z.object({ matterId: z.string().uuid(), analysisId: z.string().uuid().optional() }).strict();
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    if (req.principal.authMethod !== 'session')
      return reply
        .code(403)
        .send({ error: 'SESSION_REQUIRED', message: 'Entre na sua conta para conferir a análise.' });
  };
  const opts = (write = false) => ({
    preHandler: [auth.createPreHandler([write ? 'matter:write' : 'matter:read']), session],
  });
  const owner = (req: FastifyRequest) => ({ tenantId: req.principal.tenantId, userId: req.principal.userId });
  const handle =
    (fn: (req: FastifyRequest) => Promise<unknown>) => async (req: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return await fn(req);
      } catch (error) {
        const candidate =
          error instanceof z.ZodError ? 'INVALID_INPUT' : error instanceof Error ? error.message.split(':')[0] : '';
        const conflicts = [
          'ANALYSIS_REVIEW_CONFLICT',
          'ANALYSIS_ALREADY_DECIDED',
          'MATTER_NOT_ACTIVE',
          'LIFECYCLE_CONFLICT',
          'ANALYSIS_SOURCE_UNAVAILABLE',
        ];
        const invalid = ['INVALID_INPUT', 'ANALYSIS_ITEM_INVALID', 'ANALYSIS_FACT_REQUIRED'];
        const status = conflicts.includes(candidate)
          ? 409
          : invalid.includes(candidate)
            ? 400
            : candidate === 'ANALYSIS_NOT_FOUND' || candidate === 'MATTER_NOT_FOUND'
              ? 404
              : 500;
        const code = status === 500 ? 'ANALYSIS_UNAVAILABLE' : candidate;
        return reply
          .code(status)
          .send({
            error: code,
            message:
              code === 'ANALYSIS_SOURCE_UNAVAILABLE'
                ? 'Uma fonte está indisponível. Confira o documento antes de incorporar.'
                : code === 'ANALYSIS_FACT_REQUIRED'
                  ? 'Incorpore também o fato relacionado, antes ou junto com a prova.'
                  : status === 409
                    ? 'A análise ou o caso mudou. Atualize antes de decidir.'
                    : 'Não foi possível concluir a conferência.',
          });
      }
    };
  const path = '/api/v2/matters/:matterId/analyses';
  app.get(
    path,
    opts(),
    handle(async (req) =>
      (await repo.list(owner(req), params.parse(req.params).matterId)).map(({ items, decisions, ...summary }) => ({
        ...summary,
        objective: summary.objective.slice(0, 200),
        itemCount: items.length,
        pendingCount: items.length - Object.keys(decisions).length,
      })),
    ),
  );
  app.get(
    path + '/:analysisId',
    opts(),
    handle(async (req) => {
      const p = params.parse(req.params);
      return repo.get(owner(req), p.matterId, p.analysisId!);
    }),
  );
  app.post(
    path + '/:analysisId/decisions',
    opts(true),
    handle(async (req) => {
      const p = params.parse(req.params);
      const input = AnalysisDecisionInputSchema.parse(req.body);
      const result = await repo.decide(owner(req), p.matterId, p.analysisId!, input);
      await audit
        ?.recordEvent({
          sessionId: 'analysis_review_' + req.id,
          ...owner(req),
          toolName: 'case.analysis.decided',
          durationMs: 0,
          status: 'SUCCESS',
          payload: {
            matterId: p.matterId,
            analysisId: p.analysisId,
            revision: result.revision,
            itemCount: input.decisions.length,
          },
        })
        .catch(() => undefined);
      return result;
    }),
  );
}
