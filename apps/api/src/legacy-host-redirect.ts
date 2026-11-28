import type { FastifyInstance } from 'fastify';

/**
 * Item 14, virada de domínio de uma vez (decisão de Boni em 27/11/2026): tudo passa a `FORGELEX_PUBLIC_URL` e os hosts
 * de `FORGELEX_LEGACY_HOSTS` só redirecionam para ele, com o mesmo caminho e a mesma consulta. GET e HEAD recebem 301
 * (o que os buscadores esperam); os demais métodos, 308, que preserva método e corpo. A única exceção é o aviso do
 * Mercado Pago: pagamentos criados antes da virada notificam o domínio antigo, e o provedor não segue redirecionamento.
 * Sem `FORGELEX_LEGACY_HOSTS`, nada muda.
 */
const KEEP_ON_LEGACY_HOST = new Set(['/api/v2/webhooks/mercadopago']);

export interface LegacyHostRedirect {
  target: string;
  hosts: Set<string>;
}

export function resolveLegacyHostRedirect(
  environment: Record<string, string | undefined>,
): LegacyHostRedirect | undefined {
  const hosts = new Set(
    (environment.FORGELEX_LEGACY_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
  if (hosts.size === 0) return undefined;
  const publicUrl = environment.FORGELEX_PUBLIC_URL?.trim();
  if (!publicUrl) throw new Error('LEGACY_HOST_REDIRECT_REQUIRES_PUBLIC_URL');
  const target = new URL(publicUrl);
  if (hosts.has(target.hostname.toLowerCase())) throw new Error('LEGACY_HOST_IS_PUBLIC_HOST');
  return { target: target.origin, hosts };
}

export function registerLegacyHostRedirect(
  app: FastifyInstance,
  environment: Record<string, string | undefined>,
): void {
  const redirect = resolveLegacyHostRedirect(environment);
  if (!redirect) return;
  app.addHook('onRequest', async (request, reply) => {
    const host = (request.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
    if (!redirect.hosts.has(host)) return;
    const url = request.raw.url ?? '/';
    if (KEEP_ON_LEGACY_HOST.has(url.split('?')[0]!)) return;
    const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
    return reply.redirect(`${redirect.target}${url}`, status);
  });
}
