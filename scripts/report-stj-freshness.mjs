import { pathToFileURL } from 'node:url';
import { createDatabase } from '../packages/persistence/dist/index.js';

const TERMINAL_GAP_PREFIX = 'OFFICIAL_SOURCE_MALFORMED_JSON:';

export function parseFreshnessArgs(argv, env = process.env) {
  let maxLagHours = Number(env.FORGELEX_STJ_MAX_LAG_HOURS ?? 48);
  let withCounts = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--with-counts') {
      withCounts = true;
      continue;
    }
    if (argv[index] !== '--max-lag-hours' || !argv[index + 1]) throw new Error('Opção inválida; use --max-lag-hours <horas>.');
    maxLagHours = Number(argv[++index]);
  }
  if (!Number.isFinite(maxLagHours) || maxLagHours <= 0) throw new Error('max-lag-hours deve ser positivo.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório.');
  return { database: env.DATABASE_URL, maxLagHours, withCounts };
}

export function calculateFreshness(manifests, runs, now = new Date().toISOString(), maxLagHours = 48) {
  const latestByResource = new Map();
  let lastSuccessfulManifestAt = null;
  let runningManifests = 0;
  for (const manifest of manifests) {
    if (manifest.status === 'COMPLETED' && manifest.completed_at > (lastSuccessfulManifestAt ?? '')) {
      lastSuccessfulManifestAt = manifest.completed_at;
    }
    if (manifest.status === 'RUNNING') runningManifests += 1;
    const previous = latestByResource.get(manifest.resource_id);
    if (!previous || (manifest.completed_at ?? manifest.started_at ?? '') > (previous.completed_at ?? previous.started_at ?? '')) {
      latestByResource.set(manifest.resource_id, manifest);
    }
  }

  let failed = 0;
  let terminalGaps = 0;
  for (const manifest of latestByResource.values()) {
    if (manifest.status !== 'FAILED') continue;
    if (manifest.error?.startsWith(TERMINAL_GAP_PREFIX)) terminalGaps += 1;
    else failed += 1;
  }

  const completedRuns = runs.filter((run) => run.status === 'COMPLETED' && run.completed_at);
  const lastSuccessfulRunAt = completedRuns.reduce((latest, run) => run.completed_at > (latest ?? '') ? run.completed_at : latest, null);
  const runningRuns = runs.filter((run) => run.status === 'RUNNING').length;
  const latestRun = runs.reduce((latest, run) => !latest || run.started_at > latest.started_at ? run : latest, null);
  const failedManifests = failed;
  if (latestRun?.status === 'FAILED' && failed === 0) failed = 1;
  const lagHours = lastSuccessfulRunAt === null ? null : Math.round(Math.max(0, Date.parse(now) - Date.parse(lastSuccessfulRunAt)) / 36_000) / 100;
  const pending = Math.max(runningManifests, runningRuns);
  const staleCutoff = Date.parse(now) - maxLagHours * 3_600_000;
  const stalePending = manifests.filter((manifest) => manifest.status === 'RUNNING' && Date.parse(manifest.started_at) < staleCutoff).length
    + runs.filter((run) => run.status === 'RUNNING' && Date.parse(run.started_at) < staleCutoff).length;
  return {
    lastSuccessfulManifestAt,
    lastSuccessfulRunAt,
    pending,
    stalePending,
    failed,
    failedManifests,
    latestRunStatus: latestRun?.status ?? null,
    terminalGaps,
    lagHours,
    alert: lagHours === null || lagHours > maxLagHours || failed > 0 || stalePending > 0,
  };
}

export async function reportFreshness(argv, env = process.env) {
  const { database, maxLagHours, withCounts } = parseFreshnessArgs(argv, env);
  const connection = await createDatabase({ url: database });
  try {
    const [manifestResult, runResult] = await Promise.all([
      connection.client.execute("SELECT resource_id, status, started_at, completed_at, error FROM jurisprudence_source_manifests WHERE ingestion_run_id IN (SELECT id FROM jurisprudence_ingestion_runs WHERE provider_id = 'provider_stj_open_data' AND court = 'STJ')"),
      connection.client.execute("SELECT status, started_at, completed_at FROM jurisprudence_ingestion_runs WHERE provider_id = 'provider_stj_open_data' AND court = 'STJ'"),
    ]);
    const report = calculateFreshness(manifestResult.rows, runResult.rows, new Date().toISOString(), maxLagHours);
    if (!withCounts) return report;
    const counts = await connection.client.execute('SELECT (SELECT COUNT(*) FROM jurisprudence_source_manifests) AS manifests, (SELECT COUNT(*) FROM jurisprudence_documents) AS documents, (SELECT COUNT(*) FROM jurisprudence_document_versions) AS versions');
    return { ...report, corpusCounts: Object.fromEntries(['manifests', 'documents', 'versions'].map((key) => [key, Number(counts.rows[0]?.[key] ?? 0)])) };
  } finally {
    connection.client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reportFreshness(process.argv.slice(2)).then((report) => {
    console.log(JSON.stringify(report));
    if (report.alert) process.exitCode = 1;
  }).catch(() => {
    console.error('STJ_FRESHNESS_REPORT_FAILED');
    process.exitCode = 2;
  });
}
