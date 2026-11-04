// Isolated v9 campaign. Does not modify the commercial ledger or historical runs.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from './prepare.mjs';
import { parseCalibrationArgs, campaignPacket, assertNewPreparation } from './campaign.mjs';
import { acquireRunnerLock } from './budget.mjs';
import { v9Packet, assertV9Packet, shouldStop } from './v9-campaign.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const options = parseCalibrationArgs(process.argv.slice(2), process.env);
if (!options.campaignId || !options.expectedHead) throw new Error('Named campaign and expected HEAD required');
const directory = join(root, 'docs/architecture/evidence', options.campaignId);
const release = acquireRunnerLock(join(root, '.superpowers/sdd/2026-11-02-forgelex-calibration-runner'));
const historicalPath = join(root, 'docs/architecture/evidence/2026-11-03-verifier-v8/real/budget.jsonl');
const historicalSha = '5263bf583c77f1ec2ecbc5743996c24ea128b18586cdb32a68ede8bc8e135b8e';
const verifyHistory = () => {
  if (sha(readFileSync(historicalPath)) !== historicalSha) throw new Error('HISTORICAL_LEDGER_CHANGED');
};
try {
  verifyHistory();
  if (!options.real) {
    assertNewPreparation(directory);
    prepare(root, {
      expectedHead: options.expectedHead,
      outputDirectory: join(directory, 'preparation'),
      preparedAt: '2026-11-04',
    });
    const base = JSON.parse(readFileSync(join(directory, 'preparation/packet.json')));
    const packet = v9Packet(base);
    delete packet.budget;
    delete packet.corpusSha256;
    packet.corpusSha256 = sha(JSON.stringify(packet.corpus));
    packet.historicalLedger = { path: historicalPath, sha256: historicalSha };
    campaignPacket(directory, Buffer.from(json(packet)));
  }
  const packetPath = campaignPacket(directory),
    bytes = readFileSync(packetPath),
    packet = JSON.parse(bytes);
  assertV9Packet(packet);
  const packetSha256 = sha(bytes);
  const verifySources = () => {
    if (
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== options.expectedHead ||
      packet.candidate.head !== options.expectedHead
    )
      throw new Error('HEAD_CHANGED');
    for (const entry of packet.candidate.files)
      for (const base of [root, resolve(root, packet.candidate.snapshot)])
        if (sha(readFileSync(join(base, entry.file))) !== entry.sha256)
          throw new Error('SOURCE_CHANGED: ' + entry.file);
    verifyHistory();
  };
  verifySources();
  if (options.real) {
    const offline = JSON.parse(readFileSync(join(directory, 'offline-verified.json')));
    if (
      offline.packetSha256 !== packetSha256 ||
      offline.runs.length !== 6 ||
      offline.runs.some((r) => r.outcome !== 'completed' || r.stateVersion !== 9)
    )
      throw new Error('OFFLINE_VALIDATION_REQUIRED');
    for (const entry of offline.files)
      if (sha(readFileSync(join(directory, 'offline', entry.file))) !== entry.sha256)
        throw new Error('OFFLINE_ARTIFACT_CHANGED');
  }
  const engine = resolve(root, packet.candidate.snapshot);
  for (const folder of [
    '',
    ...['apps', 'packages'].flatMap((p) => readdirSync(join(engine, p)).map((n) => p + '/' + n)),
  ]) {
    const installed = join(root, folder, 'node_modules'),
      target = join(engine, folder, 'node_modules');
    if (existsSync(installed) && !existsSync(target))
      symlinkSync(installed, target, process.platform === 'win32' ? 'junction' : 'dir');
  }
  const campaign = join(directory, options.real ? 'real' : 'offline');
  if (existsSync(campaign)) throw new Error('CAMPAIGN_ALREADY_STARTED_NO_REPLAY');
  mkdirSync(campaign, { recursive: true });
  writeFileSync(
    join(campaign, 'authorization.json'),
    json({
      ...packet.authorization,
      mode: options.real ? 'real' : 'fake',
      packetSha256,
      historicalReserveMicroUsd: 83620,
      newCallsCapMicroUsd: 1416380,
      totalCapMicroUsd: 1500000,
    }),
    { flag: 'wx' },
  );
  const alias = Object.fromEntries(
    readdirSync(join(engine, 'packages'))
      .filter((n) => existsSync(join(engine, 'packages', n, 'src/index.ts')))
      .map((n) => ['@forgelex/' + n, join(engine, 'packages', n, 'src/index.ts')]),
  );
  alias['@evaluation/provider'] = join(engine, 'apps/api/src/agentic-workspace/commercial-provider.ts');
  const testConfig = join(campaign, 'vitest.config.mjs');
  writeFileSync(
    testConfig,
    'export default ' +
      json({
        root: engine,
        resolve: { alias, preserveSymlinks: false },
        test: {
          environment: 'node',
          maxWorkers: 1,
          fileParallelism: false,
          include: ['scripts/forgelex-final-evaluation/calibration-harness.fixture.ts'],
          exclude: [],
          testTimeout: 360000,
        },
      }),
  );
  const runIds = packet.runs.map((r) => r.id),
    results = [];
  const fingerprint = sha(JSON.stringify({ packetSha256, mode: options.real ? 'real' : 'fake', cap: 1416380 }));
  let stopReason = null;
  for (const runId of runIds) {
    verifySources();
    const configPath = join(campaign, 'invocation.json');
    writeFileSync(
      configPath,
      json({
        mode: options.real ? 'real' : 'fake',
        variant: 'candidate',
        workflowVersion: 9,
        runId,
        engine,
        campaign,
        fingerprint,
        packetPath,
        packetSha256,
        runIds,
      }),
    );
    const env = { ...process.env, FORGELEX_EVALUATION_CONFIG: configPath };
    if (options.real) env.FORGELEX_EVALUATION_APPROVAL = 'boni-v9-usd-1.50-reserve-0.083620';
    else {
      delete env.OPENAI_API_KEY;
      delete env.FORGELEX_EVALUATION_APPROVAL;
    }
    console.log('Starting ' + runId + ' (' + (options.real ? 'real' : 'offline') + ')');
    const fd = openSync(join(campaign, 'execution.txt'), 'a');
    let child;
    try {
      child = spawnSync(
        process.execPath,
        [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', testConfig],
        { cwd: engine, env, stdio: ['ignore', fd, fd], timeout: 370000 },
      );
    } finally {
      closeSync(fd);
    }
    const resultPath = join(campaign, runId + '.json');
    if (existsSync(resultPath)) {
      const r = JSON.parse(readFileSync(resultPath));
      results.push(r);
      console.log(
        json({
          runId,
          outcome: r.outcome,
          error: r.error,
          paidModelCalls: r.paidModelCalls,
          measuredMicroUsd: r.measuredMicroUsd,
          uncertainUpperMicroUsd: r.uncertainUpperMicroUsd,
        }),
      );
      if (shouldStop(r)) stopReason = 'EXECUTION_STOP_CONDITION';
    } else stopReason = 'MISSING_EXECUTION_ARTIFACT';
    if (child.status !== 0) stopReason ??= 'HARNESS_FAILED';
    if (stopReason) break;
  }
  verifySources();
  const receipt = {
    mode: options.real ? 'real' : 'fake',
    packetSha256,
    status: stopReason ? 'STOPPED' : 'COMPLETED',
    stopReason,
    historicalReserveMicroUsd: 83620,
    paidModelCalls: results.reduce((n, r) => n + r.paidModelCalls, 0),
    measuredMicroUsd: results.reduce((n, r) => n + (r.measuredMicroUsd ?? 0), 0),
    uncertainMicroUsd: results.reduce((n, r) => n + r.uncertainUpperMicroUsd, 0),
    runs: results.map(({ delivery, question, ...r }) => ({
      ...r,
      hasDelivery: Boolean(delivery),
      hasQuestion: Boolean(question),
    })),
    notRun: runIds.filter((id) => !results.some((r) => r.runId === id)),
    legalAssessment: 'PENDING_BONI',
    historicalLedgerUnchanged: true,
    commit: false,
    push: false,
    publish: false,
  };
  receipt.exposureIncludingHistoricalReserveMicroUsd = receipt.measuredMicroUsd + receipt.uncertainMicroUsd + 83620;
  writeFileSync(join(campaign, 'receipt.json'), json(receipt), { flag: 'wx' });
  if (!options.real && !stopReason)
    writeFileSync(
      join(directory, 'offline-verified.json'),
      json({
        packetSha256,
        runs: receipt.runs,
        files: results.map((r) => ({
          file: r.runId + '.json',
          sha256: sha(readFileSync(join(campaign, r.runId + '.json'))),
        })),
      }),
      { flag: 'wx' },
    );
  console.log(
    json({
      campaign,
      status: receipt.status,
      stopReason,
      paidModelCalls: receipt.paidModelCalls,
      notRun: receipt.notRun,
    }),
  );
  if (stopReason) process.exitCode = 1;
} finally {
  release();
}
