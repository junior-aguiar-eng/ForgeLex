import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';

it.each([
  ['main com análise documental', (id: string) => !id.startsWith('persistence-0031-agentic') && !/^persistence-003[234]-/.test(id)],
  ['branch agêntica sem análise documental', (id: string) => id !== 'persistence-0031-case-document-analysis'],
])('reconcilia migrations a partir de %s sem reaplicação', async (_description, keep) => {
  const { client } = await createDatabase();
  try {
    await runMigrations(client, persistenceMigrations.filter(migration => keep(migration.id)));
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    const ids = (await client.execute('SELECT id FROM forgelex_migrations')).rows.map(row => String(row.id));
    expect(ids.filter(id => id === 'persistence-0031-case-document-analysis')).toHaveLength(1);
    expect(ids.filter(id => id === 'persistence-0031-agentic-workspace')).toHaveLength(1);
    const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('case_analysis_receipts','agentic_conversations')")).rows.map(row => String(row.name));
    expect(tables.sort()).toEqual(['agentic_conversations', 'case_analysis_receipts']);
  } finally { client.close(); }
});
