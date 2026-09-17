import postgres from 'postgres';
import { persistenceMigrations } from '../packages/persistence/dist/index.js';
import { ledgerMigrations } from '../packages/billing-ledger/dist/index.js';

const url = process.env.DATABASE_URL;
if (!url?.startsWith('postgres://') && !url?.startsWith('postgresql://')) {
  console.error('DATABASE_URL deve apontar para PostgreSQL (postgres:// ou postgresql://).');
  process.exit(2);
}

const sql = postgres(url, { max: 1, onnotice: () => undefined });
const migrations = [...persistenceMigrations, ...ledgerMigrations];

try {
  await sql`CREATE TABLE IF NOT EXISTS forgelex_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`;
  for (const migration of migrations) {
    const applied = await sql`SELECT id FROM forgelex_migrations WHERE id = ${migration.id}`;
    if (applied.length > 0) continue;
    await sql.begin(async (transaction) => {
      for (const statement of migration.statements) await transaction.unsafe(statement);
      await transaction`INSERT INTO forgelex_migrations (id, applied_at) VALUES (${migration.id}, ${new Date().toISOString()})`;
    });
    console.log(`applied ${migration.id}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
