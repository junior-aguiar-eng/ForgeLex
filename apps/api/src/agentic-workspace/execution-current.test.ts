import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AgenticExecutionSchema, type AgenticExecution } from '@forgelex/domain';
import { agenticExecutions, createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { ExecutionService } from './execution-service.js';
import { ExecutionStore } from './execution-store.js';

const owner = { tenantId: 'durable', userId: 'author' };
const input = {
  objective: 'Pesquisar questão sintética',
  context: { text: 'Contexto informado', origin: 'USER' as const, documents: [] },
};
const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});

async function fixture() {
  const c = await createDatabase({ url: 'file::memory:' });
  connections.push(c);
  await runPersistenceMigrations(c.client);
  await new LedgerService(c.db, c.client).runMigrations();
  const service = new ExecutionService(c.db, c.client, { now: () => 100000, executorAvailable: true });
  await service.startExecution(owner, 'base', input);
  const [row] = await c.db.select().from(agenticExecutions);
  const base = AgenticExecutionSchema.parse(JSON.parse(row!.payloadJson));
  return { ...c, base, service, store: new ExecutionStore(c.db) };
}

async function insert(
  db: Awaited<ReturnType<typeof fixture>>['db'],
  execution: AgenticExecution,
  userId = owner.userId,
) {
  await db.insert(agenticExecutions).values({
    id: execution.id,
    tenantId: owner.tenantId,
    userId,
    conversationId: execution.conversationId,
    idempotencyKey: execution.idempotencyKey,
    inputHash: 'h',
    payloadJson: JSON.stringify(execution),
  });
}

/** O algoritmo de antes: ler todas as outras execuções da conversa e filtrar e ordenar em memória. */
function reference(all: AgenticExecution[], self: AgenticExecution, revision: number) {
  const prior = all.filter((p) => p.id !== self.id);
  const current = [...prior, self]
    .filter((p) => p.contextRevision === revision && !p.requiresReevaluation && p.status !== 'CANCELLED')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { current, history: prior.filter((p) => p.deliveryIds.length) };
}

describe('execução vigente e histórico lidos no banco, sem varrer a conversa inteira', () => {
  it('dá o mesmo resultado do algoritmo em memória em muitas combinações de estado', async () => {
    const f = await fixture();
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const statuses = ['QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED'] as const;
    const all: AgenticExecution[] = [f.base];
    for (let i = 0; i < 80; i++) {
      const execution: AgenticExecution = {
        ...f.base,
        id: randomUUID(),
        idempotencyKey: `extra-${i}`,
        status: statuses[Math.floor(random() * statuses.length)] as AgenticExecution['status'],
        contextRevision: 1 + Math.floor(random() * 3),
        requiresReevaluation: random() < 0.3,
        deliveryIds: random() < 0.5 ? [] : Array.from({ length: 1 + Math.floor(random() * 3) }, () => randomUUID()),
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, Math.floor(random() * 40))).toISOString(),
      };
      await insert(f.db, execution);
      all.push(execution);
    }
    for (const self of all.slice(0, 25)) {
      for (const revision of [1, 2, 3]) {
        const expected = reference(all, self, revision);
        const other = await f.store.newestCurrentExecution(owner, self.conversationId, self.id, revision);
        const stillValid =
          self.contextRevision === revision && !self.requiresReevaluation && self.status !== 'CANCELLED';
        const current = stillValid && (!other || self.createdAt > other.createdAt) ? self : other;
        // Empates de createdAt entre outras execuções não tinham ordem definida antes: compara o instante escolhido.
        expect(current?.createdAt ?? null).toBe(expected.current?.createdAt ?? null);
        if (other) {
          expect(other.contextRevision).toBe(revision);
          expect(other.requiresReevaluation).toBe(false);
          expect(other.status).not.toBe('CANCELLED');
        }
      }
      const history = await f.store.priorDeliveries(owner, self.conversationId, self.id);
      const expectedHistory = reference(all, self, 1).history;
      expect(history.map((h) => h.id).sort()).toEqual(expectedHistory.map((h) => h.id).sort());
      expect(history).toEqual(
        [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      );
      for (const h of history) expect(h.deliveryIds).toEqual(all.find((p) => p.id === h.id)!.deliveryIds);
    }
  });

  it('não devolve execuções de outro usuário nem de outra conversa', async () => {
    const f = await fixture();
    const foreign: AgenticExecution = {
      ...f.base,
      id: randomUUID(),
      idempotencyKey: 'outro',
      deliveryIds: [randomUUID()],
      createdAt: '2026-11-02T00:00:00.000Z',
    };
    await insert(f.db, foreign, 'outra-pessoa');
    expect(
      await f.store.newestCurrentExecution(owner, f.base.conversationId, f.base.id, f.base.contextRevision),
    ).toBeUndefined();
    expect(await f.store.priorDeliveries(owner, f.base.conversationId, f.base.id)).toEqual([]);
    expect(
      await f.store.newestCurrentExecution(owner, randomUUID(), f.base.id, f.base.contextRevision),
    ).toBeUndefined();
  });

  it('getExecution aponta a vigente e lista só as anteriores com entrega, com mais de mil execuções na conversa', async () => {
    const f = await fixture();
    const delivered: string[] = [];
    const rows: AgenticExecution[] = [];
    for (let i = 0; i < 1100; i++) {
      const withDelivery = i % 100 === 0;
      const execution: AgenticExecution = {
        ...f.base,
        id: randomUUID(),
        idempotencyKey: `muitas-${i}`,
        status: 'CANCELLED',
        deliveryIds: withDelivery ? [randomUUID()] : [],
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, 0) + i * 1000).toISOString(),
      };
      if (withDelivery) delivered.push(execution.id);
      rows.push(execution);
    }
    for (let i = 0; i < rows.length; i += 100) {
      await f.db.insert(agenticExecutions).values(
        rows.slice(i, i + 100).map((execution) => ({
          id: execution.id,
          tenantId: owner.tenantId,
          userId: owner.userId,
          conversationId: execution.conversationId,
          idempotencyKey: execution.idempotencyKey,
          inputHash: 'h',
          payloadJson: JSON.stringify(execution),
        })),
      );
    }
    const snapshot = await f.service.getExecution(owner, f.base.id);
    // Todas as outras estão canceladas: a própria execução é a vigente.
    expect(snapshot.currentExecutionId).toBe(f.base.id);
    expect(snapshot.history.map((h: { executionId: string }) => h.executionId).sort()).toEqual([...delivered].sort());
  });
});
