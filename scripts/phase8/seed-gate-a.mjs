import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assertRemoteSeed(databaseUrl, confirmation) {
  if (confirmation !== 'confirmed') throw new Error('REMOTE_SEED_NOT_CONFIRMED');
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(hostname)) throw new Error('REMOTE_SEED_TARGET_REQUIRED');
}
export async function seedGateA({ provider, ingestion }) {
  const documents = await provider.search('vazamento', { court: 'STJ', limit: 10 });
  const empty = await provider.search('resultado-inexistente-phase8', { court: 'STJ', limit: 10 });
  if (documents.length < 1 || empty.length !== 0) throw new Error('GATE_A_FIXTURE_SEARCH_INVALID');
  const verified = documents.every((document) => document.court === 'STJ' && document.provenance?.verified !== false);
  if (!verified) throw new Error('GATE_A_FIXTURE_NOT_VERIFIED');
  await ingestion.ingest({ providerId: provider.id, court: 'STJ', documents });
  await ingestion.ingest({ providerId: provider.id, court: 'STJ', documents });
  return { resultCount: documents.length, emptyCount: empty.length, verified, replayed: true };
}
async function main() {
  const databaseUrl = process.env.FORGELEX_PHASE8_TARGET_DATABASE_URL;
  if (!databaseUrl) throw new Error('FORGELEX_PHASE8_TARGET_DATABASE_URL_REQUIRED');
  assertRemoteSeed(databaseUrl, process.env.FORGELEX_PHASE8_ALLOW_REMOTE_SEED);
  const [{ createDatabase, IngestionRunRepository, JurisprudenceRepository, runPersistenceMigrations }, { JurisprudenceIngestionService }, { CanonicalFixtureProvider }] = await Promise.all([import('../../packages/persistence/dist/index.js'), import('../../packages/legal-data/dist/index.js'), import('../../packages/source-providers/dist/index.js')]);
  const connection = await createDatabase({ url: databaseUrl });
  try {
    await runPersistenceMigrations(connection.client);
    const result = await seedGateA({ provider: new CanonicalFixtureProvider(), ingestion: new JurisprudenceIngestionService(new JurisprudenceRepository(connection.db), new IngestionRunRepository(connection.db)) });
    console.log(JSON.stringify(result));
  } finally { connection.client.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
