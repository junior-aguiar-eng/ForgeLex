import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, type Client, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { IngestionRunRepository } from './ingestion-run-repository.js';
import { JurisprudenceRepository } from './jurisprudence-repository.js';
import { JurisprudenceSourceManifestRepository } from './jurisprudence-source-manifest-repository.js';
import { parseStjOpenDataRecord } from '@forgelex/source-providers';

const context = {
  datasetId: 'dataset-1',
  datasetTitle: 'Dataset STJ',
  resourceId: 'resource-1',
  resourceName: '20220508.json',
  resourceUrl: 'https://dados.example/resource-1',
  resourceRole: 'INCREMENTAL' as const,
  extractionDate: '2022-05-08',
};

function makeDocument(
  syllabus = 'Ementa oficial suficientemente longa para o teste.',
  sourceId = 'official-1',
  processNumber = '113',
) {
  return parseStjOpenDataRecord({
    id: sourceId,
    numeroProcesso: processNumber,
    numeroRegistro: '202201234567',
    siglaClasse: 'CC',
    nomeOrgaoJulgador: 'CORTE ESPECIAL',
    ministroRelator: 'MINISTRO HUMBERTO MARTINS',
    dataDecisao: '20220508',
    dataPublicacao: 'DJE DATA:26/05/2022',
    ementa: syllabus,
  }, context, '2026-09-19T00:00:00.000Z');
}

describe('JurisprudenceSourceManifestRepository', () => {
  let client: Client | undefined;
  let databasePath: string | undefined;

  afterEach(() => {
    client?.close();
    client = undefined;
    if (databasePath) {
      try { rmSync(databasePath, { force: true }); } catch { /* SQLite pode liberar o arquivo após o worker encerrar. */ }
    }
    databasePath = undefined;
  });

  async function setup(): Promise<{ db: ForgeLexDatabase; repository: JurisprudenceSourceManifestRepository; runId: string }> {
    databasePath = join(tmpdir(), `.forgelex-manifest-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
    await runPersistenceMigrations(client);
    const run = await new IngestionRunRepository(connection.db).start({ providerId: 'provider_stj_open_data', court: 'STJ' });
    return {
      db: connection.db,
      repository: new JurisprudenceSourceManifestRepository(connection.db, new JurisprudenceRepository(connection.db)),
      runId: run.id,
    };
  }

  it('publica somente após o recurso completo e cria nova versão apenas com hash jurídico diferente', async () => {
    const { repository, db, runId } = await setup();
    const document = makeDocument();
    const manifest = await repository.start({
      datasetId: context.datasetId,
      datasetTitle: context.datasetTitle,
      resourceId: context.resourceId,
      resourceName: context.resourceName,
      resourceUrl: context.resourceUrl,
      resourceRole: context.resourceRole,
      extractionDate: context.extractionDate,
      resourceSha256: 'a'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.stageBatch({
      manifestId: manifest.id,
      records: [{ recordOrdinal: 0, sourceRecordId: 'official-1', dedupeKey: document.dedupeKey, contentHash: document.snapshot.contentHash, document }],
    });

    expect(await new JurisprudenceRepository(db).search({ query: 'ementa oficial', court: 'STJ' })).toHaveLength(0);
    const published = await repository.publishStaged(manifest.id);
    expect(published.publishedRecordCount).toBe(1);
    expect(await new JurisprudenceRepository(db).search({ query: 'ementa oficial', court: 'STJ' })).toHaveLength(0);
    await repository.complete({ manifestId: manifest.id, rawRecordCount: 1, acceptedRecordCount: 1, rejectedRecordCount: 0, duplicateRecordCount: 0, publishedRecordCount: published.publishedRecordCount });
    await new IngestionRunRepository(db).complete(runId, { documentsSeen: 1, documentsPublished: 1 });
    const completedStaging = await client!.execute({
      sql: 'SELECT COUNT(*) AS count FROM jurisprudence_ingestion_staging WHERE manifest_id = ?',
      args: [manifest.id],
    });
    expect(Number(completedStaging.rows[0]?.count)).toBe(0);
    expect(await new JurisprudenceRepository(db).search({ query: 'ementa oficial', court: 'STJ' })).toHaveLength(1);
    expect(await new JurisprudenceRepository(db).listVersions(document.id)).toHaveLength(1);
    const versionManifest = await client!.execute({
      sql: 'SELECT source_manifest_id FROM jurisprudence_document_versions WHERE document_id = ?',
      args: [document.id],
    });
    expect(versionManifest.rows[0]?.source_manifest_id).toBe(manifest.id);

    const same = await repository.findCompletedByResourceHash(context.resourceId, 'a'.repeat(64));
    expect(same?.id).toBe(manifest.id);

    const changed = makeDocument('Ementa oficial alterada com conteúdo jurídico diferente para versão.');
    const next = await repository.start({
      datasetId: context.datasetId,
      datasetTitle: context.datasetTitle,
      resourceId: context.resourceId,
      resourceName: context.resourceName,
      resourceUrl: context.resourceUrl,
      resourceRole: context.resourceRole,
      extractionDate: context.extractionDate,
      resourceSha256: 'b'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.stageBatch({
      manifestId: next.id,
      records: [{ recordOrdinal: 0, sourceRecordId: 'official-1', dedupeKey: changed.dedupeKey, contentHash: changed.snapshot.contentHash, document: changed }],
    });
    const nextPublished = await repository.publishStaged(next.id);
    await repository.complete({ manifestId: next.id, rawRecordCount: 1, acceptedRecordCount: 1, rejectedRecordCount: 0, duplicateRecordCount: 0, publishedRecordCount: nextPublished.publishedRecordCount });
    expect(await new JurisprudenceRepository(db).listVersions(document.id)).toHaveLength(2);
  });

  it('mantém staging de carga falha, mas não publica seus documentos', async () => {
    const { repository, db, runId } = await setup();
    const document = makeDocument();
    const manifest = await repository.start({
      datasetId: context.datasetId,
      datasetTitle: context.datasetTitle,
      resourceId: 'resource-failed',
      resourceName: context.resourceName,
      resourceUrl: context.resourceUrl,
      resourceRole: context.resourceRole,
      extractionDate: context.extractionDate,
      resourceSha256: 'c'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.stageBatch({
      manifestId: manifest.id,
      records: [{ recordOrdinal: 0, sourceRecordId: 'official-1', dedupeKey: document.dedupeKey, contentHash: document.snapshot.contentHash, document }],
    });
    await repository.fail({ manifestId: manifest.id, error: 'parser failed' });
    const failedStaging = await client!.execute({
      sql: 'SELECT COUNT(*) AS count FROM jurisprudence_ingestion_staging WHERE manifest_id = ?',
      args: [manifest.id],
    });
    expect(Number(failedStaging.rows[0]?.count)).toBe(1);
    await expect(repository.publishStaged(manifest.id)).rejects.toThrow('SOURCE_MANIFEST_NOT_PUBLISHABLE');
    expect(await new JurisprudenceRepository(db).search({ query: 'ementa oficial', court: 'STJ' })).toHaveLength(0);
  });

  it('preserva a carga falha para diagnóstico e permite nova tentativa com o mesmo hash', async () => {
    const { repository, runId } = await setup();
    const input = {
      datasetId: context.datasetId,
      datasetTitle: context.datasetTitle,
      resourceId: 'resource-failed-retry',
      resourceName: context.resourceName,
      resourceUrl: context.resourceUrl,
      resourceRole: context.resourceRole,
      extractionDate: context.extractionDate,
      resourceSha256: 'd'.repeat(64),
      ingestionRunId: runId,
    };
    const first = await repository.start(input);
    await repository.fail({ manifestId: first.id, error: 'parser failed' });
    const second = await repository.start(input);
    expect(second.id).not.toBe(first.id);
    expect(await repository.get(first.id)).toMatchObject({ status: 'FAILED', error: 'parser failed' });
  });

  it('reconhece somente lacuna oficial malformada como exceção terminal', async () => {
    const { repository, runId } = await setup();
    const terminal = await repository.start({
      ...context,
      resourceId: 'resource-terminal-gap',
      resourceSha256: 'e'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.fail({
      manifestId: terminal.id,
      error: 'OFFICIAL_SOURCE_MALFORMED_JSON:20240229.json:line=24,column=1,position=592:unexpected_extra_closing_brace',
    });
    const ordinaryFailure = await repository.start({
      ...context,
      resourceId: 'resource-ordinary-failure',
      resourceSha256: 'f'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.fail({ manifestId: ordinaryFailure.id, error: 'STJ_OPEN_DATA_RECORD_INVALID_JSON:20240229.json' });

    expect((await repository.findTerminalOfficialSourceGap('resource-terminal-gap'))?.id).toBe(terminal.id);
    expect(await repository.findTerminalOfficialSourceGap('resource-ordinary-failure')).toBeUndefined();
  });

  it('não expõe staging publicado de manifesto pendente quando o run posteriormente falha', async () => {
    const { repository, db, runId } = await setup();
    const completedDocument = makeDocument();
    const completedManifest = await repository.start({
      ...context,
      resourceSha256: 'e'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.stageBatch({
      manifestId: completedManifest.id,
      records: [{ recordOrdinal: 0, sourceRecordId: 'official-1', dedupeKey: completedDocument.dedupeKey, contentHash: completedDocument.snapshot.contentHash, document: completedDocument }],
    });
    const completedPublished = await repository.publishStaged(completedManifest.id);
    await repository.complete({ manifestId: completedManifest.id, rawRecordCount: 1, acceptedRecordCount: 1, rejectedRecordCount: 0, duplicateRecordCount: 0, publishedRecordCount: completedPublished.publishedRecordCount });

    const pendingDocument = makeDocument('Ementa pendente que não pode entrar na busca comercial.', 'official-2', '114');
    const pendingManifest = await repository.start({
      ...context,
      resourceId: 'resource-pending',
      resourceSha256: 'f'.repeat(64),
      ingestionRunId: runId,
    });
    await repository.stageBatch({
      manifestId: pendingManifest.id,
      records: [{ recordOrdinal: 0, sourceRecordId: 'official-2', dedupeKey: pendingDocument.dedupeKey, contentHash: pendingDocument.snapshot.contentHash, document: pendingDocument }],
    });
    await repository.publishStaged(pendingManifest.id);
    await new IngestionRunRepository(db).fail(runId, { error: 'resource pending failed' });

    const results = await new JurisprudenceRepository(db).search({ query: 'ementa', court: 'STJ' });
    expect(results.map((document) => document.id)).toEqual([completedDocument.id]);
  });
});
