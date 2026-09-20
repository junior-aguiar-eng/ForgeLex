import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createDatabase,
  IngestionRunRepository,
  JurisprudenceRepository,
  JurisprudenceSourceManifestRepository,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { existingResourceDisposition, parseIngestArgs, runIngestion, shouldProcessStjResource } from './ingest-stj-open-data.mjs';

describe('ingest-stj-open-data CLI', () => {
  const databasePaths = [];

  afterEach(() => {
    for (const databasePath of databasePaths.splice(0)) {
      try { rmSync(databasePath, { force: true }); } catch { /* arquivo temporário pode estar em liberação pelo driver */ }
    }
  });
  it('aceita banco, dry-run e dataset opcional', () => {
    expect(parseIngestArgs(['--database', 'file:local.db', '--dry-run', '--dataset', 'dataset-1'])).toEqual({
      database: 'file:local.db',
      dryRun: true,
      dataset: 'dataset-1',
    });
  });

  it('rejeita execução sem database', () => {
    expect(() => parseIngestArgs([])).toThrow('--database');
  });

  it('não permite incremental depois que o snapshot histórico do mesmo dataset falha', () => {
    const blockedDatasets = new Set(['dataset-1']);

    expect(shouldProcessStjResource(blockedDatasets, {
      datasetId: 'dataset-1',
      role: 'INCREMENTAL',
    })).toBe(false);
    expect(shouldProcessStjResource(blockedDatasets, {
      datasetId: 'dataset-2',
      role: 'INCREMENTAL',
    })).toBe(true);
    expect(shouldProcessStjResource(blockedDatasets, {
      datasetId: 'dataset-1',
      role: 'HISTORICAL_SNAPSHOT',
    })).toBe(true);
  });

  it('trata lacuna oficial terminal como skip sem solicitar novo download', () => {
    const terminalGap = {
      resourceSha256: 'a'.repeat(64),
      rawRecordCount: 0,
      acceptedRecordCount: 0,
      rejectedRecordCount: 0,
      duplicateRecordCount: 0,
      publishedRecordCount: 0,
      warnings: ['OFFICIAL_RESPONSE_INVALID_JSON:line=24,column=1'],
    };

    expect(existingResourceDisposition(undefined, terminalGap)).toMatchObject({
      status: 'SKIPPED_TERMINAL_SOURCE_GAP',
      manifest: terminalGap,
    });
    expect(existingResourceDisposition(undefined, undefined)).toBeUndefined();
  });

  it('repete uma base local com manifesto concluído e lacuna terminal sem baixar a lacuna', async () => {
    const databasePath = join(tmpdir(), `.forgelex-ingest-idempotency-${randomUUID()}.db`);
    databasePaths.push(databasePath);
    const databaseUrl = pathToFileURL(databasePath).toString();
    const connection = await createDatabase({ url: databaseUrl });
    await runPersistenceMigrations(connection.client);
    const run = await new IngestionRunRepository(connection.db).start({ providerId: 'provider_stj_open_data', court: 'STJ' });
    const manifests = new JurisprudenceSourceManifestRepository(connection.db, new JurisprudenceRepository(connection.db));
    const base = {
      datasetId: 'dataset-fixture',
      datasetTitle: 'Dataset fixture',
      resourceRole: 'INCREMENTAL',
      extractionDate: '2024-02-29',
      ingestionRunId: run.id,
    };
    const completed = await manifests.start({
      ...base,
      resourceId: 'resource-completed',
      resourceName: 'completed.json',
      resourceUrl: 'https://fixture.example/completed.json',
      resourceSha256: 'a'.repeat(64),
    });
    await manifests.complete({ manifestId: completed.id, rawRecordCount: 0, acceptedRecordCount: 0, rejectedRecordCount: 0, duplicateRecordCount: 0, publishedRecordCount: 0 });
    const unclassified = await manifests.start({
      ...base,
      resourceId: 'resource-unclassified',
      resourceName: 'dictionary.json',
      resourceUrl: 'https://fixture.example/dictionary.json',
      resourceRole: 'UNCLASSIFIED',
      extractionDate: '0000-00-00',
      resourceSha256: '0'.repeat(64),
    });
    await manifests.complete({ manifestId: unclassified.id, rawRecordCount: 0, acceptedRecordCount: 0, rejectedRecordCount: 0, duplicateRecordCount: 0, publishedRecordCount: 0, warnings: ['NON_CLASSIFIABLE_RESOURCE'] });
    const terminal = await manifests.start({
      ...base,
      resourceId: 'resource-terminal-gap',
      resourceName: '20240229.json',
      resourceUrl: 'https://fixture.example/20240229.json',
      resourceSha256: 'b'.repeat(64),
    });
    await manifests.fail({ manifestId: terminal.id, error: 'OFFICIAL_SOURCE_MALFORMED_JSON:20240229.json:line=24,column=1,position=592:unexpected_extra_closing_brace' });
    connection.client.close();

    const processedResources = [];
    const provider = {
      id: 'provider_stj_open_data',
      async discover() {
        return {
          resources: [
            { ...base, resourceId: 'resource-completed', name: 'completed.json', url: 'https://fixture.example/completed.json' },
            { ...base, resourceId: 'resource-terminal-gap', name: '20240229.json', url: 'https://fixture.example/20240229.json' },
          ],
          unclassifiedResourceDetails: [{
            datasetId: 'dataset-fixture',
            datasetTitle: 'Dataset fixture',
            resourceId: 'resource-unclassified',
            name: 'dictionary.json',
            url: 'https://fixture.example/dictionary.json',
            reason: 'NON_CLASSIFIABLE_RESOURCE',
          }],
        };
      },
      async processResource(resource, options) {
        processedResources.push(resource.resourceId);
        const resourceSha256 = resource.resourceId === 'resource-completed' ? 'a'.repeat(64) : 'b'.repeat(64);
        const shouldProcess = await options.shouldProcess(resourceSha256);
        return {
          resource,
          resourceSha256,
          rawRecordCount: 0,
          acceptedRecordCount: 0,
          rejectedRecordCount: 0,
          duplicateRecordCount: 0,
          warnings: [],
          ...(shouldProcess ? {} : {}),
        };
      },
    };

    const result = await runIngestion(['--database', databaseUrl], { provider });

    expect(processedResources).toEqual(['resource-completed']);
    expect(result.hasFailure).toBe(false);
    expect(result.summaries.map((summary) => summary.status)).toEqual([
      'SKIPPED_ALREADY_COMPLETED',
      'SKIPPED_ALREADY_COMPLETED',
      'SKIPPED_TERMINAL_SOURCE_GAP',
    ]);
    const verification = await createDatabase({ url: databaseUrl });
    const unclassifiedCount = await verification.client.execute({
      sql: "SELECT count(*) AS count FROM jurisprudence_source_manifests WHERE resource_id = 'resource-unclassified'",
      args: [],
    });
    verification.client.close();
    expect(Number(unclassifiedCount.rows[0]?.count)).toBe(1);
  });
});
