import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerLegacyHostRedirect, resolveLegacyHostRedirect } from './legacy-host-redirect.js';

const environment = {
  FORGELEX_PUBLIC_URL: 'https://forgelex.com.br',
  FORGELEX_LEGACY_HOSTS: 'nexojuris.ia.br, WWW.nexojuris.ia.br',
};

async function build(env: Record<string, string | undefined> = environment) {
  const app = Fastify();
  registerLegacyHostRedirect(app, env);
  app.get('/*', async () => ({ ok: true }));
  app.post('/*', async () => ({ ok: true }));
  return app;
}

describe('redirecionamento do domínio antigo (item 14, virada de uma vez)', () => {
  it('sem FORGELEX_LEGACY_HOSTS não faz nada', async () => {
    expect(resolveLegacyHostRedirect({ FORGELEX_PUBLIC_URL: 'https://forgelex.com.br' })).toBeUndefined();
    const app = await build({ FORGELEX_PUBLIC_URL: 'https://forgelex.com.br' });
    const response = await app.inject({ url: '/como-funciona', headers: { host: 'nexojuris.ia.br' } });
    expect(response.statusCode).toBe(200);
  });

  it('GET no domínio antigo vai para o novo com 301, mantendo caminho e consulta', async () => {
    const app = await build();
    const response = await app.inject({ url: '/creditos?x=1', headers: { host: 'nexojuris.ia.br' } });
    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('https://forgelex.com.br/creditos?x=1');
  });

  it('reconhece o host sem diferenciar maiúsculas e com porta', async () => {
    const app = await build();
    const response = await app.inject({ url: '/', headers: { host: 'www.NexoJuris.ia.br:443' } });
    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('https://forgelex.com.br/');
  });

  it('POST no domínio antigo usa 308, que preserva o método', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { host: 'nexojuris.ia.br' },
      payload: {},
    });
    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe('https://forgelex.com.br/mcp');
  });

  it('o aviso do Mercado Pago continua sendo recebido no domínio antigo', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/mercadopago?type=payment',
      headers: { host: 'nexojuris.ia.br' },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
  });

  it('o domínio novo e outros hosts não são redirecionados', async () => {
    const app = await build();
    for (const host of ['forgelex.com.br', 'ratione.nexojuris.ia.br']) {
      const response = await app.inject({ url: '/', headers: { host } });
      expect(response.statusCode, host).toBe(200);
    }
  });

  it('recusa configuração em que o domínio novo também está na lista do antigo', () => {
    expect(() =>
      resolveLegacyHostRedirect({
        FORGELEX_PUBLIC_URL: 'https://forgelex.com.br',
        FORGELEX_LEGACY_HOSTS: 'forgelex.com.br',
      }),
    ).toThrow('LEGACY_HOST_IS_PUBLIC_HOST');
  });
});
