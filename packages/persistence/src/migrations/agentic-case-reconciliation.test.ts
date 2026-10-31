import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';

it.each([
  [
    'main com análise documental',
    (id: string) => !id.startsWith('persistence-0031-agentic') && !/^persistence-003[2346]-/.test(id),
  ],
  ['branch agêntica sem análise documental', (id: string) => id !== 'persistence-0031-case-document-analysis'],
])('reconcilia migrations a partir de %s sem reaplicação', async (_description, keep) => {
  const { client } = await createDatabase();
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((migration) => keep(migration.id)),
    );
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    const ids = (await client.execute('SELECT id FROM forgelex_migrations')).rows.map((row) => String(row.id));
    expect(ids.filter((id) => id === 'persistence-0031-case-document-analysis')).toHaveLength(1);
    expect(ids.filter((id) => id === 'persistence-0031-agentic-workspace')).toHaveLength(1);
    const tables = (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('case_analysis_receipts','agentic_conversations')",
      )
    ).rows.map((row) => String(row.name));
    expect(tables.sort()).toEqual(['agentic_conversations', 'case_analysis_receipts']);
  } finally {
    client.close();
  }
});

it('0036 copia o prazo de admissão dos jobs que aguardam e deixa nulo o que aguarda pessoa', async () => {
  // Own database: the default shared in-memory one keeps earlier tests' migrations applied.
  const directory = await mkdtemp(join(tmpdir(), 'm0036-'));
  const { client } = await createDatabase({ url: pathToFileURL(join(directory, 'db.sqlite')).toString() });
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((migration) => !migration.id.startsWith('persistence-0036-')),
    );
    await client.execute(
      "INSERT INTO agentic_conversations (id,tenant_id,user_id,objective,context_revision,created_at) VALUES ('c','t','u','o',1,'2026-10-31T00:00:00Z')",
    );
    for (const [id, state, payload] of [
      ['e1', 'WAITING', { admissionExpiresAt: '2026-10-31T00:02:00.000Z' }],
      ['e2', 'WAITING', { admissionExpiresAt: null }],
      ['e3', 'READY', { admissionExpiresAt: '2026-10-31T00:02:00.000Z' }],
    ] as const) {
      await client.execute({
        sql: "INSERT INTO agentic_executions (id,tenant_id,user_id,conversation_id,idempotency_key,input_hash,payload_json,event_sequence) VALUES (?,'t','u','c',?,'h','{}',0)",
        args: [id, id],
      });
      await client.execute({
        sql: "INSERT INTO agentic_execution_jobs (execution_id,tenant_id,user_id,state,payload_json,created_at) VALUES (?,'t','u',?,?,'2026-10-31T00:00:00Z')",
        args: [id, state, JSON.stringify(payload)],
      });
    }
    await runPersistenceMigrations(client);
    const rows = (
      await client.execute(
        'SELECT execution_id, admission_expires_at FROM agentic_execution_jobs ORDER BY execution_id',
      )
    ).rows;
    expect(rows.map((row) => [row.execution_id, row.admission_expires_at])).toEqual([
      ['e1', '2026-10-31T00:02:00.000Z'],
      ['e2', null],
      ['e3', null],
    ]);
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
