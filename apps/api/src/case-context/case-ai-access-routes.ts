import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CaseAiSelectionSchema, CaseItemKindSchema, DraftReceivePermissionSchema, AnalysisPermissionSchema } from '@forgelex/domain';
import { CaseAiAccessRepository } from '@forgelex/persistence';
import { AuthAdapter, extractBearerToken } from '../auth/fastify-auth.js';
import type { OAuthClientDirectory } from './oauth-client-directory.js';
import type { AuditRecorder } from '@forgelex/audit';
export function registerCaseAiAccessRoutes(
  app: FastifyInstance,
  repo: CaseAiAccessRepository,
  auth: AuthAdapter,
  directory: OAuthClientDirectory,
  audit?: AuditRecorder,
) {
  const params = z.object({ matterId: z.string().uuid() });
  const page = { cursor: z.string().max(1024).optional(), limit: z.number().int().min(1).max(50).optional() };
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal.authMethod !== 'session')
      return reply
        .code(403)
        .send({ error: 'SESSION_REQUIRED', message: 'Entre na sua conta para gerenciar as permissões.' });
  };
  const options = (write = false) => ({
    preHandler: [auth.createPreHandler([write ? 'matter:write' : 'matter:read']), session],
  });
  const owner = (req: FastifyRequest) => ({ tenantId: req.principal.tenantId, userId: req.principal.userId });
  const handle =
    (fn: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return await fn(req, reply);
      } catch (error) {
        const candidate =
          error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : (error instanceof Error ? error.message : String(error)).split(':')[0];
        const code = [
          'INVALID_INPUT',
          'CASE_ACCESS_CONFLICT',
          'OAUTH_DIRECTORY_UNAVAILABLE',
          'MATTER_NOT_FOUND',
          'CASE_APPLICATION_NOT_AUTHORIZED',
          'CASE_SELECTION_INVALID',
          'DRAFT_DESTINATION_INVALID',
          'CASE_CURSOR_INVALID',
          'CASE_ITEM_TOO_LARGE',
        ].includes(candidate)
          ? candidate
          : 'CASE_ACCESS_UNAVAILABLE';
        const status =
          code === 'CASE_ACCESS_CONFLICT'
            ? 409
            : code === 'OAUTH_DIRECTORY_UNAVAILABLE'
              ? 503
              : code === 'MATTER_NOT_FOUND'
                ? 404
                : code === 'CASE_APPLICATION_NOT_AUTHORIZED'
                  ? 403
                  : code === 'CASE_ACCESS_UNAVAILABLE'
                    ? 500
                    : 400;
        if (req.method === 'PUT' || req.url.endsWith('/revoke'))
          await audit
            ?.recordEvent({
              sessionId: 'case_ai_' + req.id,
              tenantId: req.principal.tenantId,
              userId: req.principal.userId,
              toolName: 'case_ai.access.failed',
              durationMs: 0,
              status: 'FAILED',
              payload: { errorCode: code },
            })
            .catch(() => undefined);
        return reply
          .code(status)
          .send({
            error: code,
            message:
              status === 409
                ? 'As permissões foram alteradas. Atualize antes de salvar.'
                : status === 503
                  ? 'Não foi possível consultar os aplicativos autorizados. Tente novamente.'
                  : status === 403
                    ? 'Este aplicativo não está autorizado na sua conta.'
                    : 'Não foi possível usar esta seleção.',
          });
      }
    };
  const log = async (req: FastifyRequest, matterId: string, grantId: string, revision: number, action: string) => {
    await audit
      ?.recordEvent({
        sessionId: 'case_ai_' + req.id,
        tenantId: req.principal.tenantId,
        userId: req.principal.userId,
        toolName: action,
        durationMs: 0,
        status: 'SUCCESS',
        payload: { matterId, grantId, revision },
      })
      .catch(() => undefined);
  };
  app.get(
    '/api/v2/mcp/authorized-applications',
    options(),
    handle(async (req) => directory.list(extractBearerToken(req.headers.authorization) ?? '')),
  );
  app.get(
    '/api/v2/matters/:matterId/ai-access',
    options(),
    handle(async (req) => repo.listForOwner(owner(req), params.parse(req.params).matterId)),
  );
  app.get(
    '/api/v2/matters/:matterId/ai-access/materials',
    options(),
    handle(async (req) => {
      const p = z
        .object({
          kind: CaseItemKindSchema,
          cursor: page.cursor,
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .strict()
        .parse(req.query);
      return repo.catalog(owner(req), params.parse(req.params).matterId, p.kind, p);
    }),
  );
  app.post(
    '/api/v2/matters/:matterId/ai-access/preview',
    options(),
    handle(async (req) => {
      const body = z
        .object({ selection: CaseAiSelectionSchema, ...page })
        .strict()
        .parse(req.body);
      return repo.preview(owner(req), params.parse(req.params).matterId, body.selection, body);
    }),
  );
  app.put(
    '/api/v2/matters/:matterId/ai-access',
    options(true),
    handle(async (req) => {
      const body = z
        .object({
          oauthClientId: z.string().min(1).max(500),
          expectedRevision: z.number().int().nonnegative(),
          selection: CaseAiSelectionSchema,
          receivePermission: DraftReceivePermissionSchema.optional(),
          analysisPermission: AnalysisPermissionSchema.optional(),
        })
        .strict()
        .parse(req.body);
      const apps = await directory.list(extractBearerToken(req.headers.authorization) ?? '');
      const client = apps.find((a) => a.clientId === body.oauthClientId);
      if (!client) throw new Error('CASE_APPLICATION_NOT_AUTHORIZED');
      const matterId = params.parse(req.params).matterId;
      const result = await repo.replace(owner(req), matterId, { ...body, oauthGrantedAt: client.grantedAt });
      await log(req, matterId, result.id, result.revision, 'case_ai.access.allowed');
      return result;
    }),
  );
  app.post(
    '/api/v2/matters/:matterId/ai-access/:grantId/revoke',
    options(true),
    handle(async (req) => {
      const p = params.extend({ grantId: z.string().uuid() }).parse(req.params);
      const body = z.object({ expectedRevision: z.number().int().positive() }).strict().parse(req.body);
      const result = await repo.revoke(owner(req), p.matterId, p.grantId, body.expectedRevision);
      await log(req, p.matterId, result.id, result.revision, 'case_ai.access.revoked');
      return result;
    }),
  );
}
