import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SavedResearchService } from '@forgelex/legal-tools';
import { AuthAdapter, extractBearerToken } from '../auth/fastify-auth.js';
import type { OAuthClientDirectory } from '../case-context/oauth-client-directory.js';

export function registerSavedResearchRoutes(app: FastifyInstance, service: SavedResearchService, auth: AuthAdapter, directory: OAuthClientDirectory) {
  const owner = (req: FastifyRequest) => ({ tenantId: req.principal.tenantId, userId: req.principal.userId });
  const session = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.principal.authMethod !== 'session') return reply.code(403).send({ error: 'SESSION_REQUIRED', message: 'Entre na sua conta para gerenciar pesquisas salvas.' });
  };
  const options = { preHandler: [auth.createPreHandler(['research:read']), session] };
  const handle = (fn: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store').header('X-ForgeLex-Billing-Mode', 'FREE').header('X-Credits-Charged', '0');
    try { return await fn(req, reply); }
    catch (error) {
      const e = error as Error & { code?: string };
      const code = error instanceof z.ZodError ? 'INVALID_INPUT' : e.code ?? 'SAVED_RESEARCH_UNAVAILABLE';
      const status = code === 'SAVED_RESEARCH_FULL' ? 409 : code === 'SAVED_RESEARCH_NOT_FOUND' ? 404 : code === 'SAVED_RESEARCH_NOT_AUTHORIZED' ? 403 : code === 'INVALID_INPUT' ? 400 : 503;
      return reply.code(status).send({ error: code, message: code === 'INVALID_INPUT' ? 'Confira os dados da solicitação.' : e.code ? e.message : 'Não foi possível recuperar as pesquisas salvas. Nenhuma nova pesquisa foi executada.' });
    }
  };
  const id = (req: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(req.params).id;
  app.get('/api/v2/research/saved', options, handle(async req => ({ items: await service.list(owner(req)), capacity: 6 })));
  app.post('/api/v2/research/saved', options, handle(async req => service.save(owner(req), z.object({ operationId: z.string().min(1) }).strict().parse(req.body).operationId)));
  app.get('/api/v2/research/saved/:id', options, handle(async req => service.get(owner(req), id(req))));
  app.delete('/api/v2/research/saved/:id', options, handle(async (req, reply) => { await service.delete(owner(req), id(req)); return reply.code(204).send(); }));
  app.get('/api/v2/research/saved/permissions', options, handle(async req => {
    const applications = await directory.list(extractBearerToken(req.headers.authorization) ?? '');
    return { items: await Promise.all(applications.map(async connection => ({ ...connection, enabled: await service.repository.hasPermission(owner(req), connection) }))) };
  }));
  app.put('/api/v2/research/saved/permissions', options, handle(async req => {
    const input = z.object({ clientId: z.string().min(1).max(200), grantedAt: z.string().datetime(), enabled: z.boolean() }).strict().parse(req.body);
    const applications = await directory.list(extractBearerToken(req.headers.authorization) ?? '');
    if (!applications.some(item => item.clientId === input.clientId && item.grantedAt === input.grantedAt)) throw Object.assign(new Error('Este aplicativo não está conectado à sua conta.'), { code: 'SAVED_RESEARCH_NOT_AUTHORIZED' });
    await service.repository.setPermission(owner(req), input, input.enabled);
    return { enabled: input.enabled };
  }));
}
