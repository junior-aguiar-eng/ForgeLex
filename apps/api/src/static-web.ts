import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export const RESERVED_PREFIXES = [
  '/api',
  '/mcp',
  '/.well-known',
  '/health',
  '/healthz',
  '/readyz',
  '/metrics',
  '/openapi.json',
] as const;

function isReservedPath(pathname: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function registerStaticWeb(app: FastifyInstance, root: string): Promise<void> {
  const resolvedRoot = resolve(root);
  await access(resolve(resolvedRoot, 'index.html'));
  await app.register(fastifyStatic, {
    root: resolvedRoot,
    wildcard: true,
    setHeaders(reply, filePath) {
      if (filePath.endsWith('.html')) reply.header('Cache-Control', 'no-cache');
    },
  });

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?', 1)[0] ?? request.url;
    const acceptsHtml = request.method === 'GET'
      && (request.headers.accept ?? '').split(',').some((value) => value.trim().startsWith('text/html'));
    if (acceptsHtml && !isReservedPath(pathname) && !pathname.startsWith('/assets/')) {
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    }
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Recurso não encontrado.' });
  });
}
