import { afterEach, beforeEach, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import { createDatabase } from '@forgelex/persistence';
import { CobrancaAnalise } from './cobranca.js';
import { ModuloAnalise } from './modulo.js';
import { NOMES_TOOLS } from './contratos.js';

let connection: Awaited<ReturnType<typeof createDatabase>>;
let ledger: LedgerService;
let billing: CobrancaAnalise;
let module: ModuloAnalise;
const owner = { tenantId: 'billing-test', userId: 'alice' };
const input = {
  sessao_analitica_id: 'nova',
  area_direito: 'civil',
  fase_processual: 'postulatoria',
  texto_documento: 'Documento confidencial: cobrança do contrato privado de Alice.',
  estrutura: { fatos: [], fundamentos: [], pedidos_dispositivo: [] },
};
const call = (key: string, args: object, userId = 'alice', name: string = NOMES_TOOLS.pecaAnalisar) =>
  module.call(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { idempotencyKey: key, ...args } } },
    { tenantId: owner.tenantId, userId },
  );

beforeEach(async () => {
  const postgresUrl = process.env.FORGELEX_ANALISE_TEST_POSTGRES_URL;
  if (postgresUrl) {
    const url = new URL(postgresUrl);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/forgelex_analise_review')
      throw new Error('Use apenas o banco PostgreSQL temporário de análise no loopback.');
  }
  connection = await createDatabase({ url: postgresUrl ?? 'file::memory:?cache=shared' });
  ledger = new LedgerService(connection.db, connection.client);
  await ledger.bootstrapTables();
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 10000, promotionalBalanceCents: 0 });
  module = await ModuloAnalise.criar({
    client: connection.client,
    ledger,
    registry: new ToolRegistry(),
    buscador: { obterTexto: async () => '' },
  });
  billing = new CobrancaAnalise(connection.client, ledger);
});
afterEach(async () => {
  const postgres = Boolean(process.env.FORGELEX_ANALISE_TEST_POSTGRES_URL);
  if (!postgres) await connection.client.execute('PRAGMA foreign_keys = OFF');
  const tables = await connection.client.execute(
    postgres
      ? 'SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = current_schema()'
      : "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  for (const table of tables.rows)
    await connection.client.execute(
      `DROP TABLE IF EXISTS "${String(table.name).replace(/"/g, '""')}"${postgres ? ' CASCADE' : ''}`,
    );
  connection.client.close();
});
async function combo() {
  const first = await call('session', input);
  const sessionId = (first.result as any).structuredContent.sessao_analitica_id as string;
  const activated = await call(
    'activation',
    { sessao_analitica_id: sessionId, combo: 'decisao' },
    'alice',
    NOMES_TOOLS.comboAtivar,
  );
  expect(activated.result).toBeDefined();
  return sessionId;
}

it('não devolve replay avulso a outro usuário do mesmo tenant', async () => {
  const first = await call('same-key', input);
  expect(first.result).toBeDefined();
  const denied = await call('same-key', input, 'bob');
  expect(denied.result).toBeUndefined();
  expect(denied.error).toBeDefined();
});
it('não devolve replay de combo a outro usuário nem a entrada modificada', async () => {
  const sessionId = await combo();
  const args = { ...input, sessao_analitica_id: sessionId };
  expect((await call('combo-call', args)).result).toBeDefined();
  expect((await call('combo-call', args, 'bob')).result).toBeUndefined();
  expect(
    (
      await call('combo-call', {
        ...args,
        texto_documento: 'Outro documento completamente diferente da análise original.',
      })
    ).result,
  ).toBeUndefined();
  const replay = await call('combo-call', args);
  expect((replay.result as any).billing).toMatchObject({ mode: 'COMBO', isReplay: true, chargedCents: 0 });
});
it('recupera a mesma compra de combo sem repetir o débito', async () => {
  const sessionId = await combo();
  const balance = await ledger.getAvailableBalanceCents(owner.tenantId);
  const replay = await call(
    'activation',
    { sessao_analitica_id: sessionId, combo: 'decisao' },
    'alice',
    NOMES_TOOLS.comboAtivar,
  );
  expect((replay.result as any)?.billing).toMatchObject({ isReplay: true, chargedCents: 0 });
  expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(balance);
});
it('retry concorrente em outra instância não executa nem cobra enquanto a chamada de combo está em andamento', async () => {
  const sessionId = await combo();
  let signalStarted!: () => void;
  let signalFinish!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    signalFinish = resolve;
  });
  let executions = 0;
  const params = {
    ...owner,
    idempotencyKey: 'concurrent',
    tool: NOMES_TOOLS.pecaAnalisar,
    sessaoId: sessionId,
    argumentos: { sessionId },
    operation: async () => {
      executions++;
      signalStarted();
      await finish;
      return { secret: 'original' };
    },
  };
  const balance = await ledger.getAvailableBalanceCents(owner.tenantId);
  const first = billing.executar(params);
  await started;
  const successor = new CobrancaAnalise(connection.client, ledger);
  // A simultaneous retry must reject explicitly, without entering the operation or the ledger.
  const simultaneous = await successor
    .executar({
      ...params,
      operation: async () => {
        executions++;
        return { secret: 'duplicate' };
      },
    })
    .then(
      () => 'executed',
      () => 'pending',
    );
  signalFinish();
  await first;
  expect(simultaneous).toBe('pending');
  expect(executions).toBe(1);
  expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(balance);
  const replay = await successor.executar(params);
  expect(replay.data).toEqual({ secret: 'original' });
  expect(replay.billing).toMatchObject({ isReplay: true, chargedCents: 0 });
  expect(executions).toBe(1);
});
it('falha devolve somente seu direito ao combo mesmo se outra ferramenta foi consumida durante a execução', async () => {
  const sessionId = await combo();
  const params = { ...owner, sessaoId: sessionId, argumentos: { sessionId } };
  await expect(
    billing.executar({
      ...params,
      idempotencyKey: 'failure',
      tool: NOMES_TOOLS.pecaAnalisar,
      operation: async () => {
        await billing.executar({
          ...params,
          idempotencyKey: 'other-tool',
          tool: NOMES_TOOLS.mapearTeses,
          operation: async () => ({ ok: true }),
        });
        throw new Error('failure before result');
      },
    }),
  ).rejects.toThrow();
  const balance = await ledger.getAvailableBalanceCents(owner.tenantId);
  const retried = await billing.executar({
    ...params,
    idempotencyKey: 'new-attempt',
    tool: NOMES_TOOLS.pecaAnalisar,
    operation: async () => ({ ok: true }),
  });
  expect(retried.billing.mode).toBe('COMBO');
  expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(balance);
  const rows = await connection.client.execute({
    sql: 'SELECT tools_restantes FROM analise_combos WHERE sessao_analitica_id = ?',
    args: [sessionId],
  });
  expect(JSON.parse(String(rows.rows[0].tools_restantes))).toEqual([NOMES_TOOLS.estrategiaDefinir]);
});
it('duas ferramentas diferentes disputando a lista do combo conservam ambas as coberturas', async () => {
  const sessionId = await combo();
  const balance = await ledger.getAvailableBalanceCents(owner.tenantId);
  let reads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalFirstFinished!: () => void;
  const firstFinished = new Promise<void>((resolve) => {
    signalFirstFinished = resolve;
  });
  // Synchronize real database reads so both contenders see the same initial entitlement list.
  const client = new Proxy(connection.client, {
    get(target, property) {
      if (property !== 'execute') {
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (statement: Parameters<typeof target.execute>[0]) => {
        if (
          typeof statement !== 'string' &&
          statement.sql === 'UPDATE analise_combos SET tools_restantes = ? WHERE id = ? AND tools_restantes = ?' &&
          JSON.parse(String(statement.args?.[0])).includes(NOMES_TOOLS.pecaAnalisar)
        )
          await firstFinished;
        const result = await target.execute(statement);
        if (
          typeof statement !== 'string' &&
          statement.sql.startsWith('SELECT id, combo, tools_restantes') &&
          reads < 2
        ) {
          reads++;
          if (reads === 2) release();
          await bothRead;
        }
        return result;
      };
    },
  });
  const first = new CobrancaAnalise(client, ledger);
  const second = new CobrancaAnalise(client, ledger);
  const params = { ...owner, sessaoId: sessionId, argumentos: { sessionId }, operation: async () => ({ ok: true }) };
  const results = await Promise.all([
    first
      .executar({ ...params, idempotencyKey: 'different-a', tool: NOMES_TOOLS.pecaAnalisar })
      .finally(signalFirstFinished),
    second.executar({ ...params, idempotencyKey: 'different-b', tool: NOMES_TOOLS.mapearTeses }),
  ]);
  expect(results.map((result) => result.billing.mode)).toEqual(['COMBO', 'COMBO']);
  expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(balance);
});
it('replay legado de combo sem fingerprint nunca retorna dados privados', async () => {
  const sessionId = await combo();
  await connection.client.execute({
    sql: "INSERT INTO analise_consumos (id,tenant_id,idempotency_key,sessao_analitica_id,tool,resultado,criado_em) VALUES ('legacy', ?, 'legacy-key', ?, ?, '{}', ?)",
    args: [owner.tenantId, sessionId, NOMES_TOOLS.pecaAnalisar, new Date().toISOString()],
  });
  const replay = await call('legacy-key', { ...input, sessao_analitica_id: sessionId });
  expect(replay.result).toBeUndefined();
  expect(replay.error).toBeDefined();
});

function interruptAfterResult(keepRunning: boolean) {
  return new Proxy(connection.client, {
    get(target, property) {
      if (property === 'execute') {
        return async (statement: Parameters<typeof target.execute>[0]) => {
          const sql = typeof statement === 'string' ? statement : statement.sql;
          if (
            sql.startsWith("UPDATE analise_operacoes SET status = 'COMPLETED'") ||
            (keepRunning && sql.startsWith("UPDATE analise_operacoes SET status = 'FAILED'"))
          )
            throw new Error('simulated interruption after result');
          return target.execute(statement);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

it.each(['RUNNING', 'FAILED'] as const)(
  'reinício conserva %s bloqueado depois de liquidar no ledger, sem executar ou debitar novamente',
  async (status) => {
    let executions = 0;
    const params = {
      ...owner,
      idempotencyKey: 'settled-without-envelope',
      tool: NOMES_TOOLS.pecaAnalisar,
      sessaoId: 'nova',
      argumentos: { documento: 'synthetic' },
      operation: async () => {
        executions++;
        return { original: true };
      },
    };
    const interrupted = new CobrancaAnalise(interruptAfterResult(status === 'RUNNING'), ledger);
    await expect(interrupted.executar(params)).rejects.toThrow('simulated interruption');
    await connection.client.execute({
      sql: "UPDATE analise_operacoes SET atualizado_em = '2000-01-01T00:00:00.000Z' WHERE tenant_id = ? AND idempotency_key = ?",
      args: [owner.tenantId, params.idempotencyKey],
    });
    const balance = await ledger.getAvailableBalanceCents(owner.tenantId);
    expect(balance).toBe(9913); // 75 pela ferramenta + 12 pela triagem.
    const successor = new CobrancaAnalise(connection.client, ledger);
    await expect(successor.executar(params)).rejects.toMatchObject({
      details: { code: status === 'RUNNING' ? 'ANALISE_EM_ANDAMENTO' : 'ANALISE_RECONCILIACAO' },
    });
    expect(executions).toBe(1);
    expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(balance);
    expect(await ledger.getUsageEvents(owner.tenantId)).toHaveLength(1);
    const state = await connection.client.execute({
      sql: 'SELECT a.status, a.resultado, b.status AS ledger_status, b.result_snapshot FROM analise_operacoes a JOIN billing_operations b ON b.tenant_id = a.tenant_id AND b.idempotency_key = a.idempotency_key WHERE a.tenant_id = ? AND a.idempotency_key = ?',
      args: [owner.tenantId, params.idempotencyKey],
    });
    expect(state.rows[0]).toMatchObject({ status, resultado: null, ledger_status: 'COMPLETED' });
    expect(state.rows[0]!.result_snapshot).toBeTruthy();
  },
);

it('interrupção após consumir combo conserva o direito consumido e bloqueia repetição sem cobrar avulso', async () => {
  const sessionId = await combo();
  const balance = await ledger.getAvailableBalanceCents(owner.tenantId);
  let executions = 0;
  const params = {
    ...owner,
    idempotencyKey: 'combo-without-envelope',
    tool: NOMES_TOOLS.pecaAnalisar,
    sessaoId: sessionId,
    argumentos: { sessionId },
    operation: async () => {
      executions++;
      return { original: true };
    },
  };
  const interrupted = new CobrancaAnalise(interruptAfterResult(false), ledger);
  await expect(interrupted.executar(params)).rejects.toThrow('simulated interruption');
  const rights = await connection.client.execute({
    sql: 'SELECT tools_restantes FROM analise_combos WHERE tenant_id = ? AND sessao_analitica_id = ?',
    args: [owner.tenantId, sessionId],
  });
  expect(JSON.parse(String(rights.rows[0]!.tools_restantes))).toEqual([
    NOMES_TOOLS.mapearTeses,
    NOMES_TOOLS.estrategiaDefinir,
  ]);
  await expect(new CobrancaAnalise(connection.client, ledger).executar(params)).rejects.toMatchObject({
    details: { code: 'ANALISE_RECONCILIACAO' },
  });
  expect(executions).toBe(1);
  expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(balance);
  expect(await ledger.getUsageEvents(owner.tenantId)).toHaveLength(2); // análise inicial e compra do combo.
  const after = await connection.client.execute({
    sql: 'SELECT tools_restantes FROM analise_combos WHERE tenant_id = ? AND sessao_analitica_id = ?',
    args: [owner.tenantId, sessionId],
  });
  expect(after.rows).toEqual(rights.rows);
});
