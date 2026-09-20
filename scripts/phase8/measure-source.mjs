import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';

const GIB = 1024 ** 3;
const CORPUS_TABLES = ['jurisprudence_ingestion_runs', 'jurisprudence_source_manifests', 'jurisprudence_documents', 'jurisprudence_document_versions'];

export function sanitizeDatabaseUrl(value) {
  const url = new URL(value);
  url.username = '';
  url.password = '';
  return url.toString().replace('://@', '://');
}

function finiteNonNegative(input, name) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) throw new Error(`MEASUREMENT_NEGATIVE_VALUE:${name}`);
  return value;
}

export function buildMeasurement(input) {
  if (!/^postgres(?:ql)?:\/\//i.test(input.databaseUrl ?? '')) throw new Error('DATABASE_URL_POSTGRES_REQUIRED');
  const numeric = Object.fromEntries(['databaseBytes', 'corpusTableBytes', 'corpusIndexBytes', 'dumpBytes', 'imageBytes', 'plannedRequests', 'plannedIngressBytes', 'plannedEgressBytes', 'logRetentionDays', 'storageBytes', 'estimatedMonthlyBrl'].map((key) => [key, finiteNonNegative(input[key], key)]));
  const projectedStorageBytes = numeric.databaseBytes + numeric.dumpBytes;
  if (projectedStorageBytes > 25 * GIB) throw new Error('STORAGE_ESTIMATE_EXCEEDS_25_GIB');
  if (numeric.storageBytes < projectedStorageBytes * 1.25) throw new Error('STORAGE_HEADROOM_BELOW_25_PERCENT');
  return {
    databaseBytes: numeric.databaseBytes, corpusTableBytes: numeric.corpusTableBytes,
    corpusIndexBytes: numeric.corpusIndexBytes, dumpBytes: numeric.dumpBytes,
    imageBytes: numeric.imageBytes, plannedRequests: numeric.plannedRequests,
    plannedIngressBytes: numeric.plannedIngressBytes, plannedEgressBytes: numeric.plannedEgressBytes,
    logRetentionDays: numeric.logRetentionDays,
    storageHeadroomRatio: Number(((numeric.storageBytes - projectedStorageBytes) / numeric.storageBytes).toFixed(4)),
    estimatedMonthlyBrl: numeric.estimatedMonthlyBrl,
  };
}

export async function measureDatabase(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [database] = await sql`SELECT pg_database_size(current_database())::bigint AS bytes`;
    const [sizes] = await sql.unsafe(`SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(name))), 0)::bigint AS table_bytes, COALESCE(SUM(pg_indexes_size(quote_ident(name))), 0)::bigint AS index_bytes FROM unnest(string_to_array($1, ',')) AS name`, [CORPUS_TABLES.join(',')]);
    const tableCounts = {};
    for (const table of CORPUS_TABLES) {
      const [row] = await sql.unsafe(`SELECT COUNT(*)::bigint AS count FROM ${table}`);
      tableCounts[table] = Number(row.count);
    }
    return { databaseBytes: Number(database.bytes), corpusTableBytes: Number(sizes.table_bytes), corpusIndexBytes: Number(sizes.index_bytes), tableCounts };
  } finally { await sql.end(); }
}

async function main() {
  const databaseUrl = process.env.FORGELEX_PHASE8_SOURCE_DATABASE_URL ?? process.env.FORGELEX_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('FORGELEX_PHASE8_SOURCE_DATABASE_URL_REQUIRED');
  const measured = await measureDatabase(databaseUrl);
  const dumpBytes = process.env.FORGELEX_PHASE8_DUMP_PATH ? (await stat(process.env.FORGELEX_PHASE8_DUMP_PATH)).size : Number(process.env.FORGELEX_PHASE8_DUMP_BYTES ?? 0);
  const result = buildMeasurement({ databaseUrl, ...measured, dumpBytes, imageBytes: process.env.FORGELEX_PHASE8_IMAGE_BYTES, plannedRequests: process.env.FORGELEX_PHASE8_PLANNED_REQUESTS ?? 100, plannedIngressBytes: process.env.FORGELEX_PHASE8_PLANNED_INGRESS_BYTES ?? 0, plannedEgressBytes: process.env.FORGELEX_PHASE8_PLANNED_EGRESS_BYTES ?? 0, logRetentionDays: process.env.FORGELEX_PHASE8_LOG_RETENTION_DAYS ?? 7, storageBytes: process.env.FORGELEX_PHASE8_STORAGE_BYTES ?? 10 * GIB, estimatedMonthlyBrl: process.env.FORGELEX_PHASE8_ESTIMATED_MONTHLY_BRL });
  console.log(JSON.stringify({ ...result, tableCounts: measured.tableCounts }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
