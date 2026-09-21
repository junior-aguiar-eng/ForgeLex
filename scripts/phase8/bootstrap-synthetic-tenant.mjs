import { randomUUID } from 'node:crypto';
import { writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertRemoteSeed } from './seed-gate-a.mjs';

export const SYNTHETIC_SCOPES = Object.freeze(['mcp', 'research:read', 'matter:read', 'matter:write', 'billing:read']);
export function writeTokenToSecret(token, { command, commandScript, secret, project, runner = spawnSync }) {
  if (!command || !secret || !project) throw new Error('FORGELEX_PHASE8_TOKEN_SECRET_CONFIG_REQUIRED');
  const args = [...(commandScript ? [commandScript] : []), 'secrets', 'versions', 'add', secret, '--data-file=-', `--project=${project}`, '--quiet'];
  const result = runner(command, args, {
    input: `${token}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (result.status !== 0) throw new Error('FORGELEX_PHASE8_TOKEN_SECRET_WRITE_FAILED');
}
export async function bootstrapSyntheticTenant(deps, identityPrefix = `phase8_hml_${randomUUID()}`) {
  if (!identityPrefix.startsWith('phase8_hml_')) throw new Error('SYNTHETIC_ID_PREFIX_REQUIRED');
  const account = await deps.bootstrapAccount({ supabaseUserId: identityPrefix, email: `${identityPrefix}@nexojuris.ia.br`, displayName: 'Homologação Fase 8' });
  const promoExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  await deps.provisionAccount(account.tenant.id, { paidBalanceCents: 0, promotionalBalanceCents: 2_000, promoExpiresAt });
  const apiKey = await deps.createApiKey({ tenantId: account.tenant.id, subjectId: account.user.id, userId: account.user.id, name: identityPrefix, roles: ['lawyer'], scopes: SYNTHETIC_SCOPES });
  await deps.writeToken(apiKey.token);
  return { tenantId: account.tenant.id, userId: account.user.id, keyId: apiKey.id, keyPrefix: apiKey.keyPrefix };
}
async function main() {
  const databaseUrl = process.env.FORGELEX_PHASE8_TARGET_DATABASE_URL;
  if (!databaseUrl) throw new Error('FORGELEX_PHASE8_TARGET_DATABASE_URL_REQUIRED');
  assertRemoteSeed(databaseUrl, process.env.FORGELEX_PHASE8_ALLOW_REMOTE_SEED, process.env.FORGELEX_PHASE8_TARGET_KIND);
  const descriptor = Number(process.env.FORGELEX_PHASE8_TOKEN_FD);
  const secretSink = process.env.FORGELEX_PHASE8_TOKEN_SECRET;
  if (!secretSink && (!Number.isInteger(descriptor) || descriptor < 3)) throw new Error('FORGELEX_PHASE8_TOKEN_SINK_REQUIRED');
  const [{ createDatabase, AccountRepository, ApiKeyRepository, runPersistenceMigrations }, { LedgerService }, { ApiKeyService }] = await Promise.all([import('../../packages/persistence/dist/index.js'), import('../../packages/billing-ledger/dist/index.js'), import('../../apps/api/dist/auth/api-key-service.js')]);
  const connection = await createDatabase({ url: databaseUrl });
  try {
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const result = await bootstrapSyntheticTenant({ bootstrapAccount: (input) => new AccountRepository(connection.db).bootstrap(input), provisionAccount: (tenantId, provision) => ledger.provisionAccount(tenantId, provision), createApiKey: (input) => new ApiKeyService(new ApiKeyRepository(connection.db)).create(input), writeToken: async (token) => {
      if (secretSink) writeTokenToSecret(token, { command: process.env.FORGELEX_PHASE8_GCLOUD_COMMAND ?? 'gcloud', commandScript: process.env.FORGELEX_PHASE8_GCLOUD_SCRIPT, secret: secretSink, project: process.env.FORGELEX_PHASE8_GCP_PROJECT });
      else writeSync(descriptor, `${token}\n`, null, 'utf8');
    } });
    console.log(JSON.stringify(result));
  } finally { connection.client.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
