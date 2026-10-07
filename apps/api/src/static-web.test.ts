import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerStaticWeb } from './static-web.js';

const temporaryRoots: string[] = [];

async function createWebRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'forgelex-static-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>ForgeLex HML</title>');
  await writeFile(join(root, 'assets', 'app.js'), 'globalThis.forgelex = true;');
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('registerStaticWeb', () => {
  it.each(['/', '/index.html', '/app/pesquisa', '/conta/encerramento'])(
    'revalida o HTML de %s para não restaurar referências a chunks antigos',
    async (url) => {
      const app = Fastify();
      await registerStaticWeb(app, await createWebRoot());
      try {
        const response = await app.inject({ url, headers: { accept: 'text/html' } });
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-cache');
      } finally {
        await app.close();
      }
    },
  );

  it('não responde com HTML quando um chunk antigo está ausente', async () => {
    const app = Fastify();
    await registerStaticWeb(app, await createWebRoot());
    try {
      const response = await app.inject({ url: '/assets/old-screen.js', headers: { accept: 'text/html' } });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).not.toContain('text/html');
    } finally {
      await app.close();
    }
  });

  it('serve o build real, SEO, páginas legais e fallback sem capturar rotas técnicas', async () => {
    const app = Fastify();
    await registerStaticWeb(app, resolve('apps/web/dist'));
    const root = await app.inject({ url: '/', headers: { accept: 'text/html' } });
    expect(root.body).toContain('property="og:title"');
    const assetPath = root.body.match(/src="(\/assets\/[^ ]+?)"/)?.[1];
    expect(assetPath).toBeTruthy();
    const asset = await app.inject({ url: assetPath! });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');
    for (const path of ['/produto', '/como-funciona', '/integracoes', '/creditos', '/guia', '/desenvolvedores/api']) {
      const response = await app.inject({ url: path, headers: { accept: 'text/html' } });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(root.body);
    }
    for (const path of ['/robots.txt', '/sitemap.xml', '/legal/termos-de-uso.html', '/legal/privacidade.html']) {
      const response = await app.inject({ url: path });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('id="root"');
    }
    for (const path of ['/api/inexistente', '/mcp/inexistente', '/readyz', '/healthz', '/openapi.json']) {
      expect((await app.inject({ url: path, headers: { accept: 'text/html' } })).statusCode).toBe(404);
    }
    await app.close();
  });
  it('serve asset e fallback React apenas para navegação HTML', async () => {
    const app = Fastify();
    await registerStaticWeb(app, await createWebRoot());

    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    const route = await app.inject({ method: 'GET', url: '/pesquisa', headers: { accept: 'text/html' } });
    const jsonRoute = await app.inject({ method: 'GET', url: '/pesquisa', headers: { accept: 'application/json' } });

    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('forgelex');
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('ForgeLex HML');
    expect(jsonRoute.statusCode).toBe(404);
    await app.close();
  });

  it.each(['/api/inexistente', '/mcp/inexistente', '/.well-known/inexistente', '/metrics/inexistente'])(
    'não captura a superfície técnica %s',
    async (url) => {
      const app = Fastify();
      await registerStaticWeb(app, await createWebRoot());

      const response = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'NOT_FOUND', message: 'Recurso não encontrado.' });
      await app.close();
    },
  );

  it('mantém caminhos fora da raiz inacessíveis', async () => {
    const app = Fastify();
    await registerStaticWeb(app, await createWebRoot());

    const response = await app.inject({ method: 'GET', url: '/assets/%2e%2e/%2e%2e/package.json' });

    expect([400, 404]).toContain(response.statusCode);
    expect(response.body).not.toContain('forgelex-monorepo');
    await app.close();
  });
});
