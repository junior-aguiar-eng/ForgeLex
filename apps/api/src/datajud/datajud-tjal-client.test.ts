import { describe, expect, it, vi } from 'vitest';
import { DataJudTjalClient } from './datajud-tjal-client.js';

const input = { processNumber: '00000017720258020001' };
describe('Limites de execução DataJud', () => {
  it('mantém prazo de 60 segundos para a fonte, sem chamadas adicionais', async () => {
    const deadline = vi.spyOn(AbortSignal, 'timeout');
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ timed_out: false, _shards: { failed: 0 }, hits: { total: { value: 0, relation: 'eq' }, hits: [] } }));
    try {
      await new DataJudTjalClient({ apiKey: 'fixture', fetchImpl: upstream }).lookup(input);
      expect(deadline).toHaveBeenCalledWith(60000);
      expect(upstream).toHaveBeenCalledOnce();
    } finally { deadline.mockRestore(); }
  });
  it('interrompe espera de rede e não transforma timeout em resultado vazio', async () => {
    const client = new DataJudTjalClient({ apiKey: 'fixture', timeoutMs: 10, fetchImpl: async (_, options) => {
      return new Promise<Response>((_, reject) => options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true }));
    } });
    await expect(client.lookup(input)).rejects.toMatchObject({ code: 'DATAJUD_TIMEOUT' });
  });
  it('propaga cancelamento da requisição ao provedor', async () => {
    const controller = new AbortController();
    const client = new DataJudTjalClient({ apiKey: 'fixture', fetchImpl: async (_, options) => {
      controller.abort();
      throw options!.signal!.reason;
    } });
    await expect(client.lookup(input, controller.signal)).rejects.toMatchObject({ code: 'DATAJUD_TIMEOUT' });
  });
  it.each([
    () => new Response('not-json'),
    () => new Response('{}', { headers: { 'content-length': '2097153' } }),
    () => new Response('x'.repeat(2097153)),
  ])('rejeita corpo inválido ou excessivo sem sucesso enganoso', async (response) => {
    const client = new DataJudTjalClient({ apiKey: 'fixture', fetchImpl: async () => response() });
    await expect(client.lookup(input)).rejects.toMatchObject({ code: 'DATAJUD_INVALID_RESPONSE' });
  });
  it('não chama rede com input inválido mesmo no uso direto do cliente', async () => {
    const upstream = vi.fn<typeof fetch>();
    const client = new DataJudTjalClient({ apiKey: 'fixture', fetchImpl: upstream });
    await expect(client.lookup({ processNumber: '123' })).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });
});
