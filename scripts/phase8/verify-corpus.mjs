import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';

export const INVARIANT_QUERIES = Object.freeze({
  duplicateDedupeKeys: 'SELECT COUNT(*)::bigint AS count FROM (SELECT dedupe_key FROM jurisprudence_documents GROUP BY dedupe_key HAVING COUNT(*) > 1) violations',
  duplicateVersions: 'SELECT COUNT(*)::bigint AS count FROM (SELECT document_id, content_hash FROM jurisprudence_document_versions GROUP BY document_id, content_hash HAVING COUNT(*) > 1) violations',
  missingCurrentVersions: 'SELECT COUNT(*)::bigint AS count FROM jurisprudence_documents d LEFT JOIN jurisprudence_document_versions v ON v.id = d.current_version_id WHERE v.id IS NULL',
  stagingRows: 'SELECT COUNT(*)::bigint AS count FROM jurisprudence_ingestion_staging',
});

function sameArray(left, right) { return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort()); }
export function compareCorpusSnapshots(source, target) {
  for (const key of ['duplicateDedupeKeys', 'duplicateVersions', 'missingCurrentVersions', 'stagingRows']) if (Number(source[key]) !== 0 || Number(target[key]) !== 0) throw new Error(`CORPUS_INVARIANT_VIOLATION:${key}`);
  for (const key of ['documents', 'versions', 'manifests', 'rejected']) if (Number(source[key]) !== Number(target[key])) throw new Error(`CORPUS_COUNT_MISMATCH:${key}`);
  if (source.coverageStart !== target.coverageStart || source.coverageEnd !== target.coverageEnd) throw new Error('CORPUS_COVERAGE_MISMATCH');
  if (!sameArray(source.manifestHashes, target.manifestHashes)) throw new Error('CORPUS_MANIFEST_HASH_MISMATCH');
  if (!sameArray(source.terminalGapStates, target.terminalGapStates)) throw new Error('CORPUS_TERMINAL_STATE_MISMATCH');
  return { status: 'passed', ...target };
}

export async function collectCorpusSnapshot(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [[counts], [coverage], hashes, terminal] = await Promise.all([
      sql`SELECT (SELECT COUNT(*) FROM jurisprudence_documents)::bigint AS documents, (SELECT COUNT(*) FROM jurisprudence_document_versions)::bigint AS versions, (SELECT COUNT(*) FROM jurisprudence_source_manifests)::bigint AS manifests, (SELECT COALESCE(SUM(rejected_record_count), 0) FROM jurisprudence_source_manifests)::bigint AS rejected`,
      sql`SELECT MIN(coverage_start) AS coverage_start, MAX(coverage_end) AS coverage_end FROM jurisprudence_source_manifests`,
      sql`SELECT resource_sha256 FROM jurisprudence_source_manifests ORDER BY resource_sha256`,
      sql`SELECT DISTINCT status FROM jurisprudence_source_manifests ORDER BY status`,
    ]);
    const invariants = {};
    for (const [name, query] of Object.entries(INVARIANT_QUERIES)) { const [row] = await sql.unsafe(query); invariants[name] = Number(row.count); }
    return { documents: Number(counts.documents), versions: Number(counts.versions), manifests: Number(counts.manifests), rejected: Number(counts.rejected), coverageStart: coverage.coverage_start, coverageEnd: coverage.coverage_end, manifestHashes: hashes.map((row) => row.resource_sha256), terminalGapStates: terminal.map((row) => row.status), ...invariants };
  } finally { await sql.end(); }
}

async function main() {
  const sourceUrl = process.env.FORGELEX_PHASE8_SOURCE_DATABASE_URL;
  const targetUrl = process.env.FORGELEX_PHASE8_TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) throw new Error('PHASE8_SOURCE_AND_TARGET_DATABASE_URL_REQUIRED');
  const [source, target] = await Promise.all([collectCorpusSnapshot(sourceUrl), collectCorpusSnapshot(targetUrl)]);
  console.log(JSON.stringify(compareCorpusSnapshots(source, target)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
