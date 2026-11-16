import { MigrationCommandError, runMigrationCommand } from './migration-command.js';

// Uma linha JSON por evento no stdout (o Cloud Run grava como jsonPayload).
const emit = (event: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(event)}\n`);

try {
  emit({ ...(await runMigrationCommand(process.argv.slice(2), process.env, { emit })) });
} catch (error) {
  // Só códigos e mensagens desta ferramenta (sem URL, senha ou SQL) e o SQLSTATE do PostgreSQL, se houver.
  const sqlState = (error as { code?: unknown })?.code;
  process.stderr.write(
    `${JSON.stringify({
      event: 'migration.failed',
      code: error instanceof MigrationCommandError ? error.code : 'MIGRATION_UNEXPECTED_ERROR',
      ...(error instanceof MigrationCommandError ? { message: error.message } : {}),
      ...(typeof sqlState === 'string' && /^[0-9A-Z]{5}$/.test(sqlState) ? { sqlState } : {}),
    })}\n`,
  );
  process.exitCode = 1;
}
