import { randomUUID } from 'node:crypto';
import { writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertRemoteSeed } from '../phase8/seed-gate-a.mjs';
import { writeTokenToSecret } from '../phase8/bootstrap-synthetic-tenant.mjs';

export const BILLING_SCOPES = Object.freeze(['billing:read', 'billing:write']);

export async function bootstrapBillingTenant(deps, identityPrefix = `phase14_billing_${randomUUID()}`) {
  if (!identityPrefix.startsWith('phase14_billing_')) throw new Error('PHASE14_ID_PREFIX_REQUIRED');
  const account = await deps.bootstrapAccount({
    supabaseUserId: identityPrefix,
    email: `${identityPrefix}@nexojuris.ia.br`,
    displayName: 'Validação Fase 14',
  });
  await deps.provisionAccount(account.tenant.id, { paidBalanceCents: 0, promotionalBalanceCents: 0 });
  const apiKey = await deps.createApiKey({
    tenantId: account.tenant.id,
    subjectId: account.user.id,
    userId: account.user.id,
    name: identityPrefix,
    roles: ['lawyer'],
    scopes: BILLING_SCOPES,
  });
  await deps.writeToken(apiKey.token);
  return { tenantId: account.tenant.id, userId: account.user.id, keyId: apiKey.id, keyPrefix: apiKey.keyPrefix };
}

async function main() {
  const databaseUrl = process.env.FORGELEX_PHASE14_TARGET_DATABASE_URL;
  if (!databaseUrl) throw new Error('FORGELEX_PHASE14_TARGET_DATABASE_URL_REQUIRED');
  assertRemoteSeed(databaseUrl, process.env.FORGELEX_PHASE14_ALLOW_REMOTE_SEED, process.env.FORGELEX_PHASE14_TARGET_KIND);
  const descriptor = Number(process.env.FORGELEX_PHASE14_TOKEN_FD);
  const secretSink = process.env.FORGELEX_PHASE14_TOKEN_SECRET;
  if (!secretSink && (!Number.isInteger(descriptor) || descriptor < 3)) throw new Error('FORGELEX_PHASE14_TOKEN_SINK_REQUIRED');
  const [{ createDatabase, AccountRepository, ApiKeyRepository, runPersistenceMigrations }, { LedgerService }, { ApiKeyService }] = await Promise.all([
    import('../../packages/persistence/dist/index.js'),
    import('../../packages/billing-ledger/dist/index.js'),
    import('../../apps/api/dist/auth/api-key-service.js'),
  ]);
  const connection = await createDatabase({ url: databaseUrl });
  try {
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const result = await bootstrapBillingTenant({
      bootstrapAccount: (input) => new AccountRepository(connection.db).bootstrap(input),
      provisionAccount: (tenantId, provision) => ledger.provisionAccount(tenantId, provision),
      createApiKey: (input) => new ApiKeyService(new ApiKeyRepository(connection.db)).create(input),
      writeToken: async (token) => {
        if (secretSink) {
          writeTokenToSecret(token, {
            command: process.env.FORGELEX_PHASE14_GCLOUD_COMMAND ?? 'gcloud',
            commandScript: process.env.FORGELEX_PHASE14_GCLOUD_SCRIPT,
            secret: secretSink,
            project: process.env.FORGELEX_PHASE14_GCP_PROJECT,
          });
        } else {
          writeSync(descriptor, `${token}\n`, null, 'utf8');
        }
      },
    });
    console.log(JSON.stringify(result));
  } finally {
    connection.client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
