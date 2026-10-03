import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { buildApp } from '../app.js';

// Número fictício com dígito verificador CNJ válido, sem consulta externa.
const processNumber = '0000001-77.2025.8.02.0001';
const digits = '00000017720258020001';
const path = '/api/v2/datajud/tjal/process';
const source = {
  id: 'TJAL_7_G1_1_fixture', tribunal: 'TJAL', numeroProcesso: digits, nivelSigilo: 0,
  grau: 'G1', dataAjuizamento: '20250101000000',
  classe: { codigo: 7, nome: 'Procedimento Comum Cível' },
  assuntos: [{ codigo: 1, nome: 'Assunto fictício' }],
  orgaoJulgador: { codigo: 1, nome: 'Vara fictícia', codigoMunicipioIBGE: 2704302 },
  movimentos: [
    { codigo: 2, nome: 'Conclusão', dataHora: '2025-02-01T12:00:00.000Z' },
    { codigo: 1, nome: 'Distribuição', dataHora: '2025-01-01T12:00:00.000Z' },
  ],
  dataHoraUltimaAtualizacao: '2025-02-02T12:00:00.000Z', '@timestamp': '2025-02-03T12:00:00.000Z',
  partes: [{ nome: 'Dado que não pode ser repassado' }],
};
const envelope = (records: unknown[] = [source]) => ({
  timed_out: false, _shards: { failed: 0 },
  hits: { total: { value: records.length, relation: 'eq' }, hits: records.map((record) => ({ _source: record })) },
});

describe('Consulta gratuita DataJud TJAL', () => {
  let connection: Awaited<ReturnType<typeof createDatabase>>;
  let ledger: LedgerService;
  let app: FastifyInstance;
  let upstream = vi.fn<typeof fetch>();
  const makeApp = (key = 'public-test-key') => buildApp({
    database: connection.db, databaseClient: connection.client, ledgerService: ledger,
    environment: { NODE_ENV: 'test', FORGELEX_DATAJUD_API_KEY: key },
  });
  const consult = (value: unknown = { processNumber }) => app.inject({ method: 'POST', url: path, payload: value });

  beforeAll(async () => {
    connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
  });
  beforeEach(async () => {
    upstream = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(envelope()));
    vi.stubGlobal('fetch', upstream);
    app = await makeApp();
  });
  afterEach(async () => { await app.close(); vi.unstubAllGlobals(); });
  afterAll(() => connection.client.close());

  it('consulta sem conta, assinatura, saldo ou chave de idempotência e não grava operação', async () => {
    const response = await consult();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-credits-charged']).toBe('0');
    expect(response.json()).toMatchObject({
      court: 'TJAL', processNumber: digits, billable: false, source: { name: 'CNJ / DataJud' },
      records: [{ id: source.id, processNumber: digits, court: 'TJAL', degree: 'G1',
        movements: [{ name: 'Conclusão' }, { name: 'Distribuição' }] }],
    });
    expect(response.json().consultedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(response.body).not.toContain('Dado que não pode ser repassado');
    expect(upstream).toHaveBeenCalledOnce();
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe('https://api-publica.datajud.cnj.jus.br/api_publica_tjal/_search');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('APIKey public-test-key');
    expect(JSON.parse(String(init?.body)).query).toEqual({ bool: { filter: [
      { match: { numeroProcesso: digits } }, { term: { nivelSigilo: 0 } },
    ] } });
    for (const table of ['billing_operations', 'ledger_entries', 'usage_events', 'research_search_history']) {
      const count = await connection.client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
      expect(Number(count.rows[0]!.count)).toBe(0);
    }
  });

  it.each(['', '123', '0000001-00.2025.8.02.0001', '00000017720258010001', 'abc00000017720258020001'])('rejeita número inválido antes de consultar: %s', async (value) => {
    expect((await consult({ processNumber: value })).statusCode).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejeita filtros arbitrários e consultas em lote', async () => {
    expect((await consult({ processNumber, query: { match_all: {} } })).statusCode).toBe(400);
    expect((await consult([{ processNumber }])).statusCode).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('aceita número sem máscara', async () => {
    expect((await consult({ processNumber: digits })).statusCode).toBe(200);
  });
  it('resposta vazia informa ausência na fonte sem afirmar inexistência do processo', async () => {
    upstream.mockImplementation(async () => Response.json(envelope([])));
    const response = await consult();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ records: [], truncated: false });
    expect(response.json().notice).toContain('não comprova');
  });
  it('preserva entradas distintas do mesmo processo e identifica limite de exibição', async () => {
    upstream.mockImplementation(async () => Response.json({ ...envelope([source, { ...source, id: 'second', grau: 'G2' }]),
      hits: { ...envelope([source, { ...source, id: 'second', grau: 'G2' }]).hits, total: { value: 21, relation: 'eq' } } }));
    const response = await consult();
    expect(response.json().records).toHaveLength(2);
    expect(response.json().truncated).toBe(true);
  });
  it.each([
    envelope([{ ...source, nivelSigilo: 1 }]), envelope([{ ...source, tribunal: 'TJSE' }]),
    envelope([{ ...source, numeroProcesso: '00000000000000000000' }]),
    { hits: {} }, { ...envelope(), timed_out: true }, { ...envelope(), _shards: { failed: 1 } },
  ])('não apresenta resposta inconsistente, sigilosa ou parcial como resultado completo', async (value) => {
    upstream.mockImplementation(async () => Response.json(value));
    const response = await consult();
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe('DATAJUD_INVALID_RESPONSE');
  });
  it.each([401, 403, 500])('oculta erros e credenciais do upstream HTTP %s', async (status) => {
    upstream.mockImplementation(async () => new Response('public-test-key stacktrace', { status }));
    const response = await consult();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('public-test-key');
  });
  it('traduz limitação externa com orientação de nova tentativa', async () => {
    upstream.mockImplementation(async () => new Response(null, { status: 429 }));
    const response = await consult();
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
  });
  it('traduz falha de rede sem expor detalhes técnicos', async () => {
    upstream.mockRejectedValue(new Error('credentials stacktrace'));
    const response = await consult();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('stacktrace');
  });
  it('timeout do DataJud retorna 504 com cobrança zero', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      upstream.mockImplementation(async () => { controller.abort(); throw new Error('timeout'); });
      const response = await consult();
      expect(response.statusCode).toBe(504);
      expect(response.json().error).toBe('DATAJUD_TIMEOUT');
      expect(response.headers['x-credits-charged']).toBe('0');
    } finally { timeout.mockRestore(); }
  });
  it('ordena movimentos por instante mesmo com fusos diferentes', async () => {
    upstream.mockImplementation(async () => Response.json(envelope([{ ...source, movimentos: [
      { codigo: 1, nome: 'Mais antigo', dataHora: '2025-02-01T14:00:00+03:00' },
      { codigo: 2, nome: 'Mais recente', dataHora: '2025-02-01T12:00:00Z' },
    ] }])));
    const response = await consult();
    expect(response.json().records[0].movements.map((movement: { name: string }) => movement.name)).toEqual(['Mais recente', 'Mais antigo']);
  });
  it('não apresenta movimento com data inválida como dado confiável', async () => {
    upstream.mockImplementation(async () => Response.json(envelope([{ ...source, movimentos: [
      { codigo: 1, nome: 'Movimento', dataHora: 'data inválida' },
    ] }])));
    expect((await consult()).statusCode).toBe(502);
  });
  it('limita repetições por IP sem confiar em X-Forwarded-For do cliente', async () => {
    for (let i = 0; i < 10; i++) expect((await consult()).statusCode).toBe(200);
    const response = await app.inject({ method: 'POST', url: path, payload: { processNumber }, headers: { 'x-forwarded-for': '203.0.113.99' } });
    expect(response.statusCode).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(10);
  });
  it('sem configuração retorna indisponibilidade apenas neste recurso', async () => {
    await app.close();
    app = await makeApp('');
    expect((await consult()).statusCode).toBe(503);
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('limita consultas simultâneas e libera vagas quando terminam', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    upstream.mockImplementation(async () => { await gate; return Response.json(envelope()); });
    const pending = Array.from({ length: 4 }, (_, index) => app.inject({ method: 'POST', url: path, payload: { processNumber }, remoteAddress: `192.0.2.${index + 1}` }).then((response) => response));
    try {
      await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(4));
      expect((await consult()).statusCode).toBe(429);
    } finally { release(); }
    expect((await Promise.all(pending)).map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
    expect((await consult()).statusCode).toBe(200);
  });
  it('limite global restringe IPs distintos e volta a permitir após a janela', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
    try {
      for (let i = 1; i <= 60; i++) {
        expect((await app.inject({ method: 'POST', url: path, payload: { processNumber }, remoteAddress: `192.0.2.${i}` })).statusCode).toBe(200);
      }
      expect((await consult()).statusCode).toBe(429);
      now.mockReturnValue(1800000060001);
      expect((await consult()).statusCode).toBe(200);
    } finally { now.mockRestore(); }
  });
  it('OpenAPI documenta consulta pública gratuita sem vínculo ao catálogo pago', async () => {
    const response = await app.inject('/api/v2/openapi.json');
    const operation = response.json().paths[path].post;
    expect(operation.security).toEqual([]);
    expect(operation['x-forgelex-billing-mode']).toBe('FREE');
    expect(operation.responses['402']).toBeUndefined();
    expect(operation.responses['429']).toBeDefined();
    expect(operation.requestBody.content['application/json'].schema.$ref).toBe('#/components/schemas/DataJudProcessRequest');
  });
});
