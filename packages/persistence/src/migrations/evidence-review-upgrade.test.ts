import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';

it('0037 preserva entregas anteriores, inicia revisão nula e pode ser reexecutada', async () => {
  const { client } = await createDatabase({ url: 'file::memory:' });
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((m) => !m.id.startsWith('persistence-0037-')),
    );
    await client.execute(
      "INSERT INTO agentic_conversations (id,tenant_id,user_id,objective,context_revision,created_at) VALUES ('c','t','u','Objetivo',1,'2026-01-01')",
    );
    await client.execute(
      "INSERT INTO agentic_executions (id,tenant_id,user_id,conversation_id,idempotency_key,input_hash,payload_json) VALUES ('e','t','u','c','key','hash','{}')",
    );
    await client.execute(
      "INSERT INTO agentic_task_deliveries (id,execution_id,conversation_id,tenant_id,user_id,context_revision,payload_json,content_hash) VALUES ('d','e','c','t','u',1,'original','hash-original')",
    );
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    expect(
      (await client.execute('SELECT payload_json,content_hash,evidence_review_json FROM agentic_task_deliveries')).rows,
    ).toEqual([{ payload_json: 'original', content_hash: 'hash-original', evidence_review_json: null }]);
    expect(
      (await client.execute("SELECT id FROM forgelex_migrations WHERE id='persistence-0037-native-evidence-review'"))
        .rows,
    ).toHaveLength(1);
  } finally {
    client.close();
  }
});
