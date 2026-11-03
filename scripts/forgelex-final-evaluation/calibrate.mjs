import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from './prepare.mjs';
import { acquireRunnerLock } from './budget.mjs';
import { parseCalibrationArgs, campaignPacket } from './campaign.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const { real, campaignId } = parseCalibrationArgs(process.argv.slice(2), process.env);
const parent = join(root, '.superpowers/sdd/2026-11-02-forgelex-calibration-runner');
const campaignDirectory = campaignId ? join(parent, 'campaigns', campaignId) : null;
const releaseRunner = acquireRunnerLock(parent);
try {
  if (!real) prepare(root);
  const currentPacket = join(root, 'docs/architecture/evidence/2026-11-02-final-evaluation/packet.json');
  const packetPath = campaignDirectory
    ? campaignPacket(campaignDirectory, real ? undefined : readFileSync(currentPacket))
    : currentPacket;
  const packetBytes = readFileSync(packetPath);
  const packet = JSON.parse(packetBytes);
  for (const entry of packet.candidate.files) {
    for (const base of [root, resolve(root, packet.candidate.snapshot)]) {
      if (hash(readFileSync(resolve(base, entry.file))) !== entry.sha256)
        throw new Error(`Source changed: ${entry.file}`);
    }
  }
  const baseDirectory = resolve(root, dirname(packet.baseline.archive), 'baseline');
  if (hash(readFileSync(resolve(root, packet.baseline.archive))) !== packet.baseline.archiveSha256)
    throw new Error('Baseline archive changed');
  mkdirSync(baseDirectory, { recursive: true });
  execFileSync('tar', ['-xf', resolve(root, packet.baseline.archive), '-C', baseDirectory]);
  const candidateDirectory = resolve(root, packet.candidate.snapshot);
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'));
  for (const directory of [baseDirectory, candidateDirectory]) {
    if (hash(readFileSync(join(directory, 'pnpm-lock.yaml'))) !== hash(lock))
      throw new Error('Dependency lockfiles differ; isolated installations required');
    // Reuse the exact installed dependency tree; all @forgelex source imports are aliased below.
    const folders = [
      '',
      ...['apps', 'packages'].flatMap((parent) =>
        readdirSync(join(directory, parent)).map((name) => `${parent}/${name}`),
      ),
    ];
    for (const folder of folders) {
      const installed = join(root, folder, 'node_modules');
      const destination = join(directory, folder, 'node_modules');
      if (existsSync(installed) && !existsSync(destination))
        symlinkSync(installed, destination, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  const campaign = real ? join(campaignDirectory, 'real') : mkdtempSync(join(campaignDirectory ?? parent, 'offline-'));
  mkdirSync(campaign, { recursive: true });
  const runIds = packet.runs.filter((run) => run.phase === 'calibration').map((run) => run.id);
  if (
    runIds.length !== 6 ||
    packet.budget.calibration.proposedCapUsd !== 1.5 ||
    packet.budget.pricing.model !== 'gpt-6.1-sol'
  )
    throw new Error('Calibration scope changed');
  const fingerprint = hash(
    JSON.stringify({
      campaignId,
      packet: hash(packetBytes),
      mode: real ? 'real' : 'fake',
      capMicroUsd: 1500000,
      runIds,
    }),
  );
  const results = [];
  for (const runId of runIds) {
    const entry = packet.runs.find((run) => run.id === runId);
    const engine = entry.variant === 'baseline' ? baseDirectory : candidateDirectory;
    const alias = Object.fromEntries(
      readdirSync(join(engine, 'packages'))
        .filter((name) => existsSync(join(engine, 'packages', name, 'src/index.ts')))
        .map((name) => [`@forgelex/${name}`, join(engine, 'packages', name, 'src/index.ts')]),
    );
    alias['@evaluation/provider'] = join(engine, 'apps/api/src/agentic-workspace/commercial-provider.ts');
    const config = {
      mode: real ? 'real' : 'fake',
      variant: entry.variant,
      runId,
      engine,
      campaign,
      fingerprint,
      packetPath,
      packetSha256: hash(packetBytes),
      runIds,
    };
    const configPath = join(campaign, 'invocation.json');
    writeFileSync(configPath, json(config));
    const vitestConfig = join(campaign, 'vitest.config.mjs');
    writeFileSync(
      vitestConfig,
      `export default ${JSON.stringify({ root, resolve: { alias, preserveSymlinks: false }, test: { environment: 'node', maxWorkers: 1, fileParallelism: false, include: ['scripts/forgelex-final-evaluation/calibration-harness.fixture.ts'], exclude: [], testTimeout: 1000000 } })};\n`,
    );
    const environment = { ...process.env, FORGELEX_EVALUATION_CONFIG: configPath };
    if (real) environment.FORGELEX_EVALUATION_APPROVAL = 'boni-calibration-usd-1.50';
    else {
      delete environment.OPENAI_API_KEY;
      delete environment.FORGELEX_EVALUATION_APPROVAL;
    }
    console.log(`Evaluating ${runId} (${config.mode}); no customer wallet`);
    execFileSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', vitestConfig], {
      cwd: root,
      env: environment,
      stdio: 'inherit',
      timeout: 1050000,
    });
    results.push(JSON.parse(readFileSync(join(campaign, `${runId}.json`), 'utf8')));
  }
  for (const scenarioId of new Set(
    packet.runs.filter((run) => run.phase === 'calibration').map((run) => run.scenarioId),
  )) {
    const pair = results.filter((run) => run.runId.startsWith(`${scenarioId}-`));
    if (pair.length !== 2 || pair[0].inputHash !== pair[1].inputHash || pair[0].request !== pair[1].request)
      throw new Error('Paired inputs differ');
  }
  const comparison = {
    campaignId,
    packetSha256: hash(packetBytes),
    mode: real ? 'real' : 'fake',
    fingerprint,
    candidateSourceSha256: packet.candidate.sourceSha256,
    baseline: packet.baseline.commit,
    scope: 'Three paired calibration cases; direct workflow with frozen sources, no customer wallet or live research',
    paidModelCalls: results.reduce((sum, run) => sum + run.paidModelCalls, 0),
    measuredMicroUsd: real ? results.reduce((sum, run) => sum + (run.measuredMicroUsd ?? 0), 0) : null,
    legalAssessment: 'NOT_EVALUATED',
    runs: results.map(({ delivery, question, ...metrics }) => ({
      ...metrics,
      hasDelivery: Boolean(delivery),
      hasQuestion: Boolean(question),
    })),
  };
  writeFileSync(join(campaign, 'comparison.json'), json(comparison));
  const review = [
    '# Calibração — leitura A/B',
    '',
    real
      ? 'Saídas ainda não avaliadas por Boni. A chave das versões fica no pacote de execução.'
      : 'SIMULAÇÃO: respostas roteirizadas para testar o executor. Não são resultados de qualidade jurídica.',
    '',
  ];
  for (const scenarioId of new Set(
    packet.runs.filter((run) => run.phase === 'calibration').map((run) => run.scenarioId),
  )) {
    review.push(`## ${scenarioId}`, '');
    for (const label of ['A', 'B']) {
      const entry = packet.runs.find((run) => run.scenarioId === scenarioId && run.blindLabel === label);
      const output = results.find((run) => run.runId === entry.id);
      review.push(`### ${label}`, '', `Pedido: ${output.request}`, '');
      if (output.delivery) {
        for (const section of output.delivery.document?.sections ?? [])
          review.push(`**${section.title}**`, '', section.content, '');
        for (const claim of output.delivery.claims) review.push(`- ${claim.statement}`);
        review.push('');
        for (const finding of output.delivery.findings) review.push(`- Ponto a conferir: ${finding.statement}`);
        review.push('');
      } else
        review.push(
          'Sem entrega. Conferir a pergunta ou a interrupção registrada antes de atribuir nota.',
          '',
          JSON.stringify(output.question ?? output.error),
          '',
        );
    }
  }
  writeFileSync(join(campaign, 'review.md'), review.join('\n'));
  console.log(
    json({
      campaign,
      paidModelCalls: comparison.paidModelCalls,
      measuredMicroUsd: comparison.measuredMicroUsd,
      results: results.map((run) => ({ id: run.runId, outcome: run.outcome, stateVersion: run.stateVersion })),
    }),
  );
} finally {
  releaseRunner();
}
