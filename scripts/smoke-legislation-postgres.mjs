import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDatabase, runPersistenceMigrations, LegislationRepository } from '../packages/persistence/dist/index.js';
import { LegislationService } from '../packages/legal-data/dist/index.js';
import { LegislationCatalog } from '../packages/source-catalog/dist/index.js';
import { IndexedLegislationProvider } from '../packages/source-providers/dist/index.js';

const coverage = [
  {
    sourceId: 'synthetic',
    normId: 'fixture-law',
    provisionIds: ['art-1'],
    officialUrl: 'https://www.planalto.gov.br/fixture-not-a-real-law.htm',
    currentVersionId: 'v1',
  },
];
const catalog = new LegislationCatalog(coverage);
const request = { normId: 'fixture-law', provisionId: 'art-1', selector: { kind: 'EXACT', versionId: 'v1' } };
const hash = (text) => createHash('sha256').update(text).digest('hex');
const snapshotText = 'Texto exclusivamente sintético.';
const input = {
  document: {
    sourceId: 'synthetic',
    normId: 'fixture-law',
    provisionId: 'art-1',
    versionId: 'v1',
    text: snapshotText,
    officialUrl: coverage[0].officialUrl,
    capturedAt: '2026-10-26T00:00:00Z',
    effectiveFrom: '2000-01-01',
    effectiveTo: null,
    contentHash: hash(snapshotText),
    snapshotHash: hash(snapshotText),
    start: 0,
    end: snapshotText.length,
    curationEvidence: 'synthetic-only',
  },
  snapshotText,
};
if (process.argv[2] === '--recover') {
  const c = await createDatabase({ url: process.env.FORGELEX_LEGISLATION_TEST_URL });
  try {
    const provider = new IndexedLegislationProvider(new LegislationRepository(c.db), catalog);
    assert.equal((await provider.retrieve(request)).document.text, snapshotText);
    assert.equal(
      (await provider.retrieve({ ...request, selector: { kind: 'CURRENT' } })).temporalBasis,
      'CATALOG_CURRENT',
    );
    assert.equal(
      (await provider.retrieve({ ...request, selector: { kind: 'ON_DATE', date: '2001-01-01' } })).legalApplicability,
      'NOT_EVALUATED',
    );
    console.log('RECOVERY_PASSED');
  } finally {
    c.client.close();
  }
} else {
  const name = `forgelex-legislation-test-${randomUUID().slice(0, 8)}`,
    password = randomUUID();
  let started = false,
    a,
    b;
  try {
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--detach',
        '--name',
        name,
        '-p',
        '127.0.0.1::5432',
        '-e',
        'POSTGRES_PASSWORD',
        '-e',
        'POSTGRES_DB=forgelex_legislation_test',
        'postgres:16-alpine',
      ],
      { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'pipe' },
    );
    started = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (
        spawnSync(
          'docker',
          ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'forgelex_legislation_test'],
          { stdio: 'pipe' },
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'TEMPORARY_POSTGRES_NOT_READY');
    const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/forgelex_legislation_test`;
    a = await createDatabase({ url });
    b = await createDatabase({ url });
    await runPersistenceMigrations(a.client);
    await runPersistenceMigrations(a.client);
    const repo = new LegislationRepository(a.db),
      other = new LegislationRepository(b.db);
    const service = new LegislationService(repo, (n, p) => catalog.find(n, p));
    const otherService = new LegislationService(other, (n, p) => catalog.find(n, p));
    await Promise.all([service.ingest(input), otherService.ingest(input)]);
    assert.equal((await repo.listVersions('fixture-law', 'art-1')).length, 1);
    await assert.rejects(
      otherService.ingest({ ...input, document: { ...input.document, curationEvidence: 'different' } }),
      /LEGISLATION_VERSION_CONFLICT/,
    );
    const badProvider = new IndexedLegislationProvider(
      { listVersions: async () => [{ ...input, document: { ...input.document, normId: 'swapped' } }] },
      catalog,
    );
    assert.equal((await badProvider.retrieve(request)).reason, 'SOURCE_INVALID');
    const result = await new IndexedLegislationProvider(repo, catalog).retrieve(request);
    assert.equal(result.status, 'FOUND');
    assert.ok(!JSON.stringify(result).includes('snapshotText'));
    await a.client.execute("UPDATE legislation_versions SET version_id='tampered'");
    assert.equal((await new IndexedLegislationProvider(repo, catalog).retrieve(request)).reason, 'SOURCE_INVALID');
    await a.client.execute("UPDATE legislation_versions SET version_id='v1'");
    a.client.close();
    b.client.close();
    a = b = undefined;
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--recover'], {
      env: { ...process.env, FORGELEX_LEGISLATION_TEST_URL: url },
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(child.status, 0, 'SEPARATE_PROCESS_RECOVERY_FAILED');
    assert.ok(child.stdout.includes('RECOVERY_PASSED'));
    console.log(
      JSON.stringify({
        status: 'passed',
        checks: [
          'migration_twice',
          'concurrent_ingestion_one_version',
          'immutable_version',
          'wrong_source_rejected',
          'indexed_identity_integrity',
          'projection_without_snapshot',
          'separate_process_recovery',
          'explicit_temporal_selector',
        ],
      }),
    );
  } finally {
    a?.client.close();
    b?.client.close();
    if (started) execFileSync('docker', ['rm', '--force', name], { stdio: 'pipe' });
  }
}
