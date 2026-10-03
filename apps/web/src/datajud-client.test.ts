import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCnjNumber, formatDataJudDate, lookupTjalProcess } from './datajud-client';

vi.mock('./auth/supabase-client', () => ({ supabase: { auth: { getSession: () => { throw new Error('Não consultar sessão'); } } } }));
const fixture = { court: 'TJAL', billable: false, processNumber: '00000017720258020001', consultedAt: '2026-10-03T12:00:00Z', source: { name: 'CNJ / DataJud', url: 'https://www.cnj.jus.br/sistemas/datajud/api-publica/' }, notice: 'Fonte externa.', truncated: false, records: [] };
afterEach(() => vi.unstubAllGlobals());
describe('cliente público DataJud', () => {
  it('consulta anonimamente sem cookies, sessão, token local ou idempotência', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://nexojuris.ia.br' }, localStorage: { getItem: () => { throw new Error('Não consultar token'); } } });
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture));
    vi.stubGlobal('fetch', upstream);
    expect(await lookupTjalProcess('0000001-77.2025.8.02.0001')).toEqual(fixture);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe('https://nexojuris.ia.br/api/v2/datajud/tjal/process');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(new Headers(init?.headers).has('idempotency-key')).toBe(false);
  });
  it.each([{ ...fixture, billable: true }, { ...fixture, records: [{}] }, { ...fixture, court: 'TJSE' }])('rejeita contrato inconsistente antes de exibir os dados', async (body) => {
    vi.stubGlobal('fetch', async () => Response.json(body));
    await expect(lookupTjalProcess('00000017720258020001')).rejects.toMatchObject({ code: 'DATAJUD_INVALID_RESPONSE', status: 502 });
  });
  it('propaga indisponibilidade sem apresentar erro de pagamento', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'DATAJUD_TIMEOUT', message: 'Tente novamente mais tarde.' }, { status: 504 }));
    await expect(lookupTjalProcess('00000017720258020001')).rejects.toMatchObject({ code: 'DATAJUD_TIMEOUT', status: 504 });
  });
  it('preserva movimentação sem código TPU em vez de rejeitar o processo inteiro', async () => {
    const body = { ...fixture, records: [{ id: 'fixture', court: 'TJAL', processNumber: fixture.processNumber,
      subjects: [], movements: [{ name: 'Descrição não informada', occurredAt: '2025-01-01T12:00:00Z' }] }] };
    vi.stubGlobal('fetch', async () => Response.json(body));
    expect((await lookupTjalProcess(fixture.processNumber)).records[0].movements).toHaveLength(1);
  });
  it('formata número CNJ e distingue data compacta de horários com fuso', () => {
    expect(formatCnjNumber('00000017720258020001')).toBe('0000001-77.2025.8.02.0001');
    expect(formatDataJudDate('20250101000000')).toBe('01/01/2025');
    expect(formatDataJudDate('2026-10-03T12:00:00Z')).toBe('03/10/2026, 09:00');
    expect(formatDataJudDate()).toBe('Não informado');
    expect(formatDataJudDate('data inválida')).toBe('Não informado');
  });
});
