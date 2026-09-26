import {
  createDatabase,
  IngestionRunRepository,
  JurisprudenceRepository,
  JurisprudenceSourceManifestRepository,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { StjOpenDataProvider } from '../packages/source-providers/dist/index.js';
import { pathToFileURL } from 'node:url';

export function parseIngestArgs(argv, env = process.env) {
  const result = { database: env.DATABASE_URL || undefined, dryRun: false, dataset: undefined, incremental: false, singleFlight: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (argument === '--incremental' || argument === '--single-flight') {
      result[argument === '--incremental' ? 'incremental' : 'singleFlight'] = true;
      continue;
    }
    if (argument === '--database' || argument === '--dataset') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requer um valor.`);
      result[argument === '--database' ? 'database' : 'dataset'] = value;
      index += 1;
      continue;
    }
    throw new Error(`Opção desconhecida: ${argument}`);
  }
  if (!result.database) throw new Error('--database ou DATABASE_URL é obrigatório.');
  return result;
}

export async function withSingleFlight(database, task, connect = createDatabase) {
  const connection = await connect({ url: database });
  let transaction;
  try {
    if (connection.db.$forgelexDialect !== 'postgres') throw new Error('STJ_SINGLE_FLIGHT_REQUIRES_POSTGRES');
    transaction = await connection.client.transaction();
    const result = await transaction.execute('SELECT pg_try_advisory_xact_lock(731202604) AS acquired');
    if (result.rows[0]?.acquired !== true) throw new Error('STJ_INGESTION_ALREADY_RUNNING');
    return await task();
  } finally {
    await transaction?.rollback();
    connection.client.close();
  }
}

export function shouldProcessStjResource(blockedDatasetIds, resource) {
  return resource.role === 'HISTORICAL_SNAPSHOT' || !blockedDatasetIds.has(resource.datasetId);
}

export function existingResourceDisposition(completedManifest, terminalSourceGap) {
  if (completedManifest) return { status: 'SKIPPED_ALREADY_COMPLETED', manifest: completedManifest };
  if (terminalSourceGap) return { status: 'SKIPPED_TERMINAL_SOURCE_GAP', manifest: terminalSourceGap };
  return undefined;
}

function printSummary(summary) {
  console.log(JSON.stringify(summary));
}

function resultSummary(resource, result, status = 'COMPLETED') {
  return {
    dataset: resource.datasetId,
    resource: resource.name,
    role: resource.role,
    resourceSha256: result.resourceSha256,
    rawRecords: result.rawRecordCount,
    acceptedRecords: result.acceptedRecordCount,
    rejectedRecords: result.rejectedRecordCount,
    duplicateRecords: result.duplicateRecordCount,
    publishedRecords: result.publishedRecordCount ?? 0,
    coverageStart: result.coverageStart,
    coverageEnd: result.coverageEnd,
    status,
    warnings: result.warnings,
  };
}

export async function runIngestion(argv, dependencies = {}) {
  const args = parseIngestArgs(argv);
  const execute = () => runIngestionUnlocked(args, dependencies);
  return args.singleFlight
    ? withSingleFlight(args.database, execute, dependencies.connect ?? createDatabase)
    : execute();
}

async function runIngestionUnlocked(args, dependencies) {
  const provider = dependencies.provider ?? new StjOpenDataProvider({ datasetIds: args.dataset ? [args.dataset] : undefined });
  const plan = await provider.discover();
  const summaries = [];
  let connection;
  let ingestionRun;
  let manifestRepository;
  let totalSeen = 0;
  let totalPublished = 0;
  let coverageStart;
  let coverageEnd;
  let hasFailure = false;
  const blockedDatasetIds = new Set();

  if (!args.dryRun) {
    connection = await createDatabase({ url: args.database });
    try {
      if (!args.singleFlight) await runPersistenceMigrations(connection.client);
      if (args.incremental) {
        const baseline = await connection.client.execute("SELECT COUNT(*) AS count FROM jurisprudence_source_manifests WHERE status = 'COMPLETED' AND ingestion_run_id IN (SELECT id FROM jurisprudence_ingestion_runs WHERE provider_id = 'provider_stj_open_data' AND court = 'STJ')");
        if (Number(baseline.rows[0]?.count ?? 0) === 0) throw new Error('STJ_INGESTION_BASELINE_REQUIRED');
      }
      ingestionRun = await new IngestionRunRepository(connection.db).start({
        providerId: provider.id,
        court: 'STJ',
      });
      manifestRepository = new JurisprudenceSourceManifestRepository(
        connection.db,
        new JurisprudenceRepository(connection.db),
      );
    } catch (error) {
      connection.client.close();
      throw error;
    }
  }

  try {
    for (const detail of plan.unclassifiedResourceDetails ?? []) {
      let summary = {
        dataset: detail.datasetId,
        resource: detail.name,
        role: 'UNCLASSIFIED',
        resourceSha256: undefined,
        rawRecords: 0,
        acceptedRecords: 0,
        rejectedRecords: 0,
        duplicateRecords: 0,
        publishedRecords: 0,
        coverageStart: undefined,
        coverageEnd: undefined,
        status: 'UNCLASSIFIED',
        warnings: [detail.reason],
      };
      if (!args.dryRun) {
        const completed = await manifestRepository.findCompletedByResourceHash(detail.resourceId, '0'.repeat(64));
        if (completed) {
          summary = {
            ...summary,
            resourceSha256: completed.resourceSha256,
            status: 'SKIPPED_ALREADY_COMPLETED',
            warnings: completed.warnings,
          };
        } else {
          const manifest = await manifestRepository.start({
            datasetId: detail.datasetId,
            datasetTitle: detail.datasetTitle,
            resourceId: detail.resourceId,
            resourceName: detail.name,
            resourceUrl: detail.url,
            resourceRole: 'UNCLASSIFIED',
            extractionDate: '0000-00-00',
            resourceSha256: '0'.repeat(64),
            ingestionRunId: ingestionRun.id,
            warnings: [detail.reason],
          });
          await manifestRepository.complete({
            manifestId: manifest.id,
            rawRecordCount: 0,
            acceptedRecordCount: 0,
            rejectedRecordCount: 0,
            duplicateRecordCount: 0,
            publishedRecordCount: 0,
            warnings: [detail.reason],
          });
        }
      }
      summaries.push(summary);
      printSummary(summary);
    }

    for (const resource of plan.resources) {
      if (!shouldProcessStjResource(blockedDatasetIds, resource)) {
        hasFailure = true;
        const skipped = {
          dataset: resource.datasetId,
          resource: resource.name,
          role: resource.role,
          resourceSha256: undefined,
          rawRecords: 0,
          acceptedRecords: 0,
          rejectedRecords: 0,
          duplicateRecords: 0,
          publishedRecords: 0,
          coverageStart: undefined,
          coverageEnd: undefined,
          status: 'SKIPPED_SNAPSHOT_FAILED',
          warnings: ['STJ_OPEN_DATA_HISTORICAL_SNAPSHOT_FAILED'],
        };
        summaries.push(skipped);
        printSummary(skipped);
        continue;
      }
      if (!args.dryRun) {
        const completedById = args.incremental
          ? await manifestRepository.findLatestCompletedByResourceId(resource.resourceId)
          : undefined;
        const terminalSourceGap = await manifestRepository.findTerminalOfficialSourceGap(resource.resourceId);
        const disposition = existingResourceDisposition(completedById, terminalSourceGap);
        if (disposition) {
          const skipped = resultSummary(resource, disposition.manifest, disposition.status);
          summaries.push(skipped);
          printSummary(skipped);
          continue;
        }
      }
      let parsed;
      let manifest;
      let completed;
      let recordOrdinal = 0;
      try {
        parsed = await provider.processResource(resource, {
          onBatch: async (batch) => {
          if (args.dryRun) return;
          await manifestRepository.stageBatch({
            manifestId: manifest.id,
            records: batch.map((document, index) => ({
              recordOrdinal: recordOrdinal + index,
              sourceRecordId: document.provenance.source.documentId,
              dedupeKey: document.dedupeKey,
              contentHash: document.snapshot.contentHash,
              document,
            })),
          });
          recordOrdinal += batch.length;
          },
          shouldProcess: async (resourceSha256) => {
            if (args.dryRun) return true;
            completed = await manifestRepository.findCompletedByResourceHash(resource.resourceId, resourceSha256);
            if (completed) return false;
            manifest = await manifestRepository.start({
              datasetId: resource.datasetId,
              datasetTitle: resource.datasetTitle,
              resourceId: resource.resourceId,
              resourceName: resource.name,
              resourceUrl: resource.url,
              resourceRole: resource.role,
              extractionDate: resource.extractionDate,
              resourceSha256,
              ingestionRunId: ingestionRun.id,
            });
            return true;
          },
        });

        if (completed) {
          const skipped = {
            dataset: resource.datasetId,
            resource: resource.name,
            role: resource.role,
            resourceSha256: parsed.resourceSha256,
            rawRecords: completed.rawRecordCount,
            acceptedRecords: completed.acceptedRecordCount,
            rejectedRecords: completed.rejectedRecordCount,
            duplicateRecords: completed.duplicateRecordCount,
            publishedRecords: completed.publishedRecordCount,
            coverageStart: completed.coverageStart,
            coverageEnd: completed.coverageEnd,
            status: 'SKIPPED_ALREADY_COMPLETED',
            warnings: completed.warnings,
          };
          summaries.push(skipped);
          printSummary(skipped);
          continue;
        }

        totalSeen += parsed.acceptedRecordCount;
        coverageStart = !coverageStart || (parsed.coverageStart && parsed.coverageStart < coverageStart) ? parsed.coverageStart : coverageStart;
        coverageEnd = !coverageEnd || (parsed.coverageEnd && parsed.coverageEnd > coverageEnd) ? parsed.coverageEnd : coverageEnd;
        if (!args.dryRun) {
          const published = await manifestRepository.publishStaged(manifest.id);
          await manifestRepository.complete({
            manifestId: manifest.id,
            rawRecordCount: parsed.rawRecordCount,
            acceptedRecordCount: parsed.acceptedRecordCount,
            rejectedRecordCount: parsed.rejectedRecordCount,
            duplicateRecordCount: parsed.duplicateRecordCount,
            publishedRecordCount: published.publishedRecordCount,
            coverageStart: parsed.coverageStart,
            coverageEnd: parsed.coverageEnd,
            warnings: parsed.warnings,
          });
          parsed.publishedRecordCount = published.publishedRecordCount;
          totalPublished += published.publishedRecordCount;
        }
        const summary = resultSummary(resource, parsed, args.dryRun ? 'DRY_RUN' : 'COMPLETED');
        summaries.push(summary);
        printSummary(summary);
      } catch (error) {
        hasFailure = true;
        if (resource.role === 'HISTORICAL_SNAPSHOT') blockedDatasetIds.add(resource.datasetId);
        const message = error instanceof Error ? error.message : String(error);
        if (!args.dryRun) {
          try {
            if (manifest) {
              await manifestRepository.fail({
                manifestId: manifest.id,
                error: message,
                rawRecordCount: parsed?.rawRecordCount,
                acceptedRecordCount: parsed?.acceptedRecordCount,
                rejectedRecordCount: parsed?.rejectedRecordCount,
                duplicateRecordCount: parsed?.duplicateRecordCount,
                coverageStart: parsed?.coverageStart,
                coverageEnd: parsed?.coverageEnd,
                warnings: parsed?.warnings,
              });
            } else {
              const failedManifest = await manifestRepository.start({
                datasetId: resource.datasetId,
                datasetTitle: resource.datasetTitle,
                resourceId: resource.resourceId,
                resourceName: resource.name,
                resourceUrl: resource.url,
                resourceRole: resource.role,
                extractionDate: resource.extractionDate,
                resourceSha256: parsed?.resourceSha256 ?? '0'.repeat(64),
                ingestionRunId: ingestionRun.id,
                warnings: [`FAILED:${message}`],
              });
              await manifestRepository.fail({ manifestId: failedManifest.id, error: message });
            }
          } catch (manifestError) {
            console.error(`Falha ao registrar manifesto de ${resource.resourceId}:`, manifestError);
          }
        }
        const failed = {
          dataset: resource.datasetId,
          resource: resource.name,
          role: resource.role,
          resourceSha256: parsed?.resourceSha256,
          rawRecords: parsed?.rawRecordCount ?? 0,
          acceptedRecords: parsed?.acceptedRecordCount ?? 0,
          rejectedRecords: parsed?.rejectedRecordCount ?? 0,
          duplicateRecords: parsed?.duplicateRecordCount ?? 0,
          publishedRecords: 0,
          coverageStart: parsed?.coverageStart,
          coverageEnd: parsed?.coverageEnd,
          status: 'FAILED',
          warnings: [message],
        };
        summaries.push(failed);
        printSummary(failed);
      }
    }

    if (!args.dryRun) {
      const runRepository = new IngestionRunRepository(connection.db);
      if (hasFailure) {
        await runRepository.fail(ingestionRun.id, { error: 'Um ou mais recursos do STJ falharam; os manifestos individuais registram o diagnóstico.' });
      } else {
        await runRepository.complete(ingestionRun.id, {
          documentsSeen: totalSeen,
          documentsPublished: totalPublished,
          coverageStart,
          coverageEnd,
        });
      }
    }
  } finally {
    connection?.client.close();
  }
  return { plan, summaries, hasFailure };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runIngestion(process.argv.slice(2)).then((result) => {
    if (result.hasFailure) process.exitCode = 1;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
