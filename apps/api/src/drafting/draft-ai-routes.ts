import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DraftAiReceiptRepository, DraftRepository } from '@forgelex/persistence';
import type { AuditRecorder } from '@forgelex/audit';
import { AuthAdapter } from '../auth/fastify-auth.js';
export function registerDraftAiRoutes(
  app: FastifyInstance,
  receipts: DraftAiReceiptRepository,
  drafts: DraftRepository,
  auth: AuthAdapter,
  audit?: AuditRecorder,
) {
  const params = z
    .object({ matterId: z.string().uuid(), draftId: z.string().uuid(), receiptId: z.string().uuid().optional() })
    .strict();
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    if (req.principal.authMethod !== 'session')
      return reply
        .code(403)
        .send({ error: 'SESSION_REQUIRED', message: 'Entre na sua conta para conferir o texto recebido.' });
  };
  const opts = (write = false) => ({
    preHandler: [auth.createPreHandler(write ? ['matter:write', 'draft:write'] : ['matter:read']), session],
  });
  const owner = (req: FastifyRequest) => ({ tenantId: req.principal.tenantId, userId: req.principal.userId });
  const handle =
    (fn: (req: FastifyRequest) => Promise<unknown>) => async (req: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return await fn(req);
      } catch (error) {
        const conflict = error instanceof Error && error.message === 'DRAFT_ADOPTION_CONFLICT';
        const invalid = error instanceof z.ZodError;
        return reply
          .code(conflict ? 409 : invalid ? 400 : 404)
          .send({
            error: conflict ? 'DRAFT_ADOPTION_CONFLICT' : invalid ? 'INVALID_INPUT' : 'DRAFT_RECEIPT_NOT_FOUND',
            message: conflict
              ? 'A edição atual mudou. Atualize antes de usar esta versão.'
              : 'Não foi possível usar este texto recebido.',
          });
      }
    };
  const find = async (req: FastifyRequest) => {
    const p = params.parse(req.params);
    const saved = (await receipts.listForOwner(owner(req), p.matterId, p.draftId)).find((r) => r.id === p.receiptId);
    if (!saved) throw new Error('DRAFT_RECEIPT_NOT_FOUND');
    return { p, saved };
  };
  const path = '/api/v2/matters/:matterId/drafts/:draftId/ai-receipts';
  app.get(
    path,
    opts(),
    handle(async (req) => {
      const p = params.parse(req.params);
      return receipts.listForOwner(owner(req), p.matterId, p.draftId);
    }),
  );
  app.get(
    path + '/:receiptId',
    opts(),
    handle(async (req) => {
      const { p, saved } = await find(req);
      const version = await drafts.getVersion(req.principal.tenantId, p.matterId, p.draftId, saved.versionId);
      if (!version) throw new Error('DRAFT_RECEIPT_NOT_FOUND');
      return { receipt: saved, version };
    }),
  );
  app.post(
    path + '/:receiptId/adopt',
    opts(true),
    handle(async (req) => {
      const { p, saved } = await find(req);
      const body = z.object({ expectedCurrentVersionId: z.string().uuid().nullable() }).strict().parse(req.body);
      const result = await receipts.adopt(
        owner(req),
        p.matterId,
        p.draftId,
        saved.versionId,
        body.expectedCurrentVersionId,
      );
      await audit
        ?.recordEvent({
          sessionId: 'draft_adopt_' + req.id,
          ...owner(req),
          toolName: 'draft.ai.adopt',
          durationMs: 0,
          status: 'SUCCESS',
          payload: { matterId: p.matterId, draftId: p.draftId, receiptId: saved.id, versionId: saved.versionId },
        })
        .catch(() => undefined);
      return result;
    }),
  );
}
