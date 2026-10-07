import { runRetentionCommand } from './retention-command.js';

try {
  process.stdout.write(JSON.stringify(await runRetentionCommand(process.argv.slice(2), process.env)) + '\n');
} catch {
  // SQL/connection exceptions may contain identifiers. Keep job logs aggregate.
  process.stderr.write(JSON.stringify({ event: 'retention.failed' }) + '\n');
  process.exitCode = 1;
}
