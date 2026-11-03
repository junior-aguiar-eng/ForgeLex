import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';

it('0038 preserva entrega e revisão probatória, inicia histórico editorial nulo e é idempotente', async () => {
  const { client } = await createDatabase({ url: 'file::memory:' });
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((m) => !m.id.startsWith('persistence-0038-')),
    );
    await client.execute(
      "INSERT INTO agentic_conversations (id,tenant_id,user_id,objective,context_revision,created_at) VALUES ('c','t','u','Objetivo',1,'2026-01-01')",
    );
    await client.execute(
      "INSERT INTO agentic_executions (id,tenant_id,user_id,conversation_id,idempotency_key,input_hash,payload_json) VALUES ('e','t','u','c','k','h','{}')",
    );
    await client.execute(
      "INSERT INTO agentic_task_deliveries (id,execution_id,conversation_id,tenant_id,user_id,context_revision,payload_json,content_hash,evidence_review_json) VALUES ('d','e','c','t','u',1,'original','hash','review')",
    );
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    expect(
      (
        await client.execute(
          'SELECT payload_json,content_hash,evidence_review_json,editorial_review_json FROM agentic_task_deliveries',
        )
      ).rows,
    ).toEqual([
      { payload_json: 'original', content_hash: 'hash', evidence_review_json: 'review', editorial_review_json: null },
    ]);
  } finally {
    client.close();
  }
});
