import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';

it('0039 preserva conversas existentes visíveis e pode ser reaplicada', async () => {
  const { client } = await createDatabase({ url: 'file::memory:' });
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((m) => m.id !== 'persistence-0039-conversation-history'),
    );
    await client.execute(
      "INSERT INTO agentic_conversations (id,tenant_id,user_id,objective,context_revision,created_at) VALUES ('c','t','u','Conversa existente',1,'2026-01-01')",
    );
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    expect((await client.execute('SELECT id, objective, history_hidden_at FROM agentic_conversations')).rows).toEqual([
      { id: 'c', objective: 'Conversa existente', history_hidden_at: null },
    ]);
  } finally {
    client.close();
  }
});
