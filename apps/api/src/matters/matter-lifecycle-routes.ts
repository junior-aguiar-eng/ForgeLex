import { z } from 'zod';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { LifecycleCommandSchema, PurgeCommandSchema, type LifecycleActor } from '@forgelex/domain';
import { MatterLifecycleRepository, MatterRepository, type ForgeLexDatabase } from '@forgelex/persistence';
import type { AuthAdapter } from '../auth/fastify-auth.js';
import type { MatterPurgeService } from './matter-purge-service.js';

export const lifecycleViewQuery = z.object({ view: z.enum(['active', 'archived', 'trash']).default('active') }).strict();

export function registerMatterLifecycleRoutes(app: FastifyInstance, database: ForgeLexDatabase, auth: AuthAdapter, purge?: MatterPurgeService): void {
  const repository = new MatterLifecycleRepository(database);
  const matters = new MatterRepository(database);
  app.get('/api/v2/matter-purge-operations/:operationId', { preHandler: auth.createPreHandler(['matter:write']) }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (request.principal.authMethod !== 'session') return reply.code(403).send({ error: 'LIFECYCLE_FORBIDDEN' });
    const params = z.object({ operationId: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    if (!purge) return reply.code(503).send({ error: 'MATTER_PURGE_JOURNAL_UNAVAILABLE' });
    try { return await purge.status(request.principal.tenantId, { userId: request.principal.userId, role: request.principal.roles.includes('owner') ? 'owner' : request.principal.roles.includes('admin') ? 'admin' : 'member', authType: 'web_session', scopes: request.principal.scopes }, params.data.operationId); }
    catch (error) { return reply.code(error instanceof Error && error.message === 'MATTER_NOT_FOUND' ? 404 : error instanceof Error && error.message === 'LIFECYCLE_FORBIDDEN' ? 403 : 503).send({ error: 'PURGE_STATUS_UNAVAILABLE' }); }
  });
  // Append after the route's authentication hook so legacy URLs follow the same policy.
  app.addHook('onRoute', route => {
    if (!route.url.startsWith('/api/v2/matters/:matterId') || /\/(archive|trash|restore|purge)$/.test(route.url)) return;
    const guard: preHandlerHookHandler = async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const params = request.params as { matterId: string; documentId?: string };
      const matter = await matters.getMatter(request.principal.tenantId, params.matterId);
      if (!matter) return reply.code(404).send({ error: 'MATTER_NOT_FOUND' });
      const session = request.principal.authMethod === 'session';
      const read = request.method === 'GET' || request.method === 'HEAD';
      if (matter.lifecycleState !== 'ACTIVE' && (!session || !read)) return reply.code(session ? 409 : 404).send({ error: session ? 'MATTER_NOT_ACTIVE' : 'MATTER_NOT_FOUND', message: 'Este caso está disponível apenas para consulta.' });
      if (params.documentId) {
        const document = await matters.getDocumentVersion(request.principal.tenantId, params.documentId, session && read ? 'web_retained' : 'work');
        if (!document || document.document.matterId !== params.matterId) return reply.code(404).send({ error: 'DOCUMENT_NOT_FOUND' });
        if (document.document.lifecycleState !== 'ACTIVE' && !read) return reply.code(409).send({ error: 'DOCUMENT_NOT_ACTIVE' });
      }
    };
    route.preHandler = [...(Array.isArray(route.preHandler) ? route.preHandler : route.preHandler ? [route.preHandler] : []), guard];
  });
  for (const path of ['/api/v2/matters/:matterId', '/api/v2/matters/:matterId/documents/:documentId']) {
    for (const action of ['archive', 'trash', 'restore', 'purge'] as const) {
      app.post(`${path}/${action}`, { preHandler: auth.createPreHandler(['matter:write']) }, async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (request.principal.authMethod !== 'session') return reply.code(403).send({ error: 'LIFECYCLE_FORBIDDEN' });
        const params = z.object({ matterId: z.string().uuid(), documentId: z.string().uuid().optional() }).strict().safeParse(request.params);
        const command = (action === 'purge' ? PurgeCommandSchema : LifecycleCommandSchema).safeParse(request.body);
        if (!params.success || !command.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
        const target = { tenantId: request.principal.tenantId, ...params.data };
        const roles = request.principal.roles;
        const actor: LifecycleActor = { userId: request.principal.userId, role: roles.includes('owner') ? 'owner' : roles.includes('admin') ? 'admin' : 'member', authType: 'web_session', scopes: request.principal.scopes };
        try {
          if (action === 'purge') {
            if (!purge) return reply.code(503).send({ error: 'MATTER_PURGE_JOURNAL_UNAVAILABLE', message: 'A exclusão definitiva está temporariamente indisponível.' });
            return await purge.execute(target, actor, PurgeCommandSchema.parse(command.data));
          }
          return await repository.transition(target, actor, action, command.data);
        } catch (error) {
          const code = error instanceof Error ? error.message : 'LIFECYCLE_FAILED';
          const status = /NOT_FOUND/.test(code) ? 404 : code === 'LIFECYCLE_FORBIDDEN' ? 403 : /CONFLICT|NOT_ACTIVE|CONFIRMATION_REQUIRED|RETENTION_HOLD/.test(code) ? 409 : /JOURNAL|PURGE_CONFIRMATION_PENDING/.test(code) ? 503 : 500;
          return reply.code(status).send({ error: status === 500 ? 'LIFECYCLE_FAILED' : code, message: status === 409 ? 'O caso ou documento mudou. Atualize a página e confira a operação.' : status === 503 ? 'A operação aguarda confirmação. Não é necessário excluir novamente.' : 'Não foi possível concluir esta operação.', ...(code === 'PURGE_CONFIRMATION_PENDING' ? { operationId: (error as { operationId?: string }).operationId } : {}) });
        }
      });
    }
  }
}
