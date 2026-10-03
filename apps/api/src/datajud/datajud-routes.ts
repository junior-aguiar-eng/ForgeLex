import type { FastifyInstance } from 'fastify';
import { createRequestAbortSignal } from '../distribution/request-abort-signal.js';
import { DataJudError, DataJudProcessRequestSchema, DataJudTjalClient } from './datajud-tjal-client.js';

export function registerDataJudRoutes(app: FastifyInstance, client: DataJudTjalClient): void {
  // Limites locais por instância. Não confia em cabeçalhos de IP enviados pelo cliente.
  const windows = new Map<string, { count: number; until: number }>();
  let globalWindow = { count: 0, until: 0 };
  let active = 0;
  app.post('/api/v2/datajud/tjal/process', { bodyLimit: 1024 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-ForgeLex-Billing-Mode', 'FREE');
    reply.header('X-Credits-Charged', '0');
    const input = DataJudProcessRequestSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'DATAJUD_INVALID_PROCESS_NUMBER', message: 'Informe somente um número CNJ válido do TJAL, com ou sem máscara.' });
    const now = Date.now();
    for (const [ip, window] of windows) if (window.until <= now) windows.delete(ip);
    if (globalWindow.until <= now) globalWindow = { count: 0, until: now + 60000 };
    const window = windows.get(request.ip) ?? { count: 0, until: now + 60000 };
    if (window.count >= 10 || globalWindow.count >= 60 || active >= 4 || windows.size >= 1000) {
      return reply.header('Retry-After', '60').code(429).send({ error: 'DATAJUD_RATE_LIMITED', message: 'Limite temporário de consultas. Aguarde um minuto e tente novamente.' });
    }
    window.count++;
    globalWindow.count++;
    windows.set(request.ip, window);
    active++;
    const abort = createRequestAbortSignal(request.raw);
    try {
      return await client.lookup(input.data, abort.signal);
    } catch (error) {
      const code = error instanceof DataJudError ? error.code : 'DATAJUD_UNAVAILABLE';
      const status = code === 'DATAJUD_TIMEOUT' ? 504 : code === 'DATAJUD_INVALID_RESPONSE' ? 502 : code === 'DATAJUD_RATE_LIMITED' ? 429 : 503;
      if (status === 429) reply.header('Retry-After', '60');
      return reply.code(status).send({ error: code, message: status === 504
        ? 'O DataJud demorou a responder. Tente novamente mais tarde; esta consulta é gratuita.'
        : status === 429 ? 'O DataJud limitou temporariamente as consultas. Tente novamente em um minuto.'
        : 'Não foi possível obter uma resposta válida do DataJud. Tente novamente mais tarde; esta consulta é gratuita.' });
    } finally {
      active--;
      abort.dispose();
    }
  });
}
