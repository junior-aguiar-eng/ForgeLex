import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvaluationBudget } from './budget.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const selected = process.argv[2] ?? 'revised';
if (process.argv.length > 3 || !['current', 'revised'].includes(selected))
  throw new Error('Usage: node scripts/forgelex-final-evaluation/api-prompts-a3-offline.mjs [current|revised]');
const output = mkdtempSync(join(tmpdir(), 'forgelex-a3-'));
const arms = ['prompts-current', 'prompts-revised', 'profiles-fixed', 'profiles-by-role'];
const ids = Array.from({ length: 8 }, (_, index) => `A0${index + 1}`);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (file) => JSON.parse(readFileSync(join(output, file), 'utf8'));
const vitest = resolve(root, 'node_modules/vitest/vitest.mjs');
const scenarios = [];
const sourcePaths = [
  'scripts/forgelex-final-evaluation/corpus.mjs',
  'packages/legal-agents/src/legal-evaluations.ts',
  'packages/legal-workflows/src/agentic-case-task/api-prompts-offline.test.ts',
  'scripts/forgelex-final-evaluation/api-prompts-a3-budget.fixture.ts',
  'scripts/forgelex-final-evaluation/api-prompts-a3-offline.mjs',
  'scripts/forgelex-final-evaluation/api-prompts-a3-phase1.fixture.ts',
  'scripts/forgelex-final-evaluation/api-prompts-a3-phase1.mjs',
  'packages/billing-ledger/src/commercial-inference-profiles.ts',
  'packages/billing-ledger/src/commercial-inference-service.ts',
  'packages/legal-workflows/src/agentic-case-task/case-task.ts',
  'packages/legal-agents/src/agentic-guided-desk.ts',
  'packages/legal-agents/src/agentic-bounded-delivery.ts',
  'packages/legal-agents/src/agentic-desk.ts',
  'packages/legal-agents/src/instructions/case-task.ts',
  'apps/api/src/agentic-workspace/commercial-provider.ts',
  'apps/api/src/agentic-workspace/provider-transport.ts',
  'packages/agent-provider-openai/src/openai-agent-provider.ts',
  'scripts/forgelex-final-evaluation/budget.mjs',
  'pnpm-lock.yaml',
];
const sourceHashes = Object.fromEntries(sourcePaths.map((p) => [p, hash(readFileSync(join(root, p)))]));
let control;
let policy;
for (const arm of arms) {
  execFileSync(
    process.execPath,
    [vitest, 'run', 'packages/legal-workflows/src/agentic-case-task/api-prompts-offline.test.ts', '-t', '^A0[1-8]'],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        FORGELEX_A3_ARM: arm,
        FORGELEX_A3_SELECTED_PROMPTS: selected,
        FORGELEX_A3_OFFLINE_DIRECTORY: output,
        FORGELEX_API_PROMPTS_OFFLINE_REPORT: join(output, arm + '-workflow.json'),
      },
    },
  );
  const workflow = read(arm + '-workflow.json');
  if (workflow.scenarios.length !== ids.length) throw new Error('A3_MISSING_SCENARIOS');
  const calls = read(arm + '-calls.json').scenarios;
  policy ??= workflow.commercialPolicy;
  control ??= workflow.scenarios;
  for (const id of ids) {
    const result = workflow.scenarios.find((item) => item.id === id);
    const original = control.find((item) => item.id === id);
    const route = calls.filter((item) => item.id === id);
    if (
      result?.inputHash !== original?.inputHash ||
      result?.outcome !== original?.outcome ||
      result?.status !== original?.status ||
      JSON.stringify(result?.roles) !== JSON.stringify(route.map((call) => call.role))
    )
      throw new Error(`A3_SCENARIO_DRIFT: ${arm}/${id}`);
    scenarios.push({ arm, runId: arm + '/' + id, ...result, calls: route });
  }
}
const runIds = scenarios.map((item) => item.runId);
const cap = policy.maxInferenceMicroUsd * runIds.length;
const packet = {
  mode: 'offline',
  selectedPromptsForDryRun: selected,
  baseHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes,
  policy,
  comparisonSettings: {
    reasoning: 'low for fixed model',
    serviceTier: 'default',
    store: false,
    cache: 'explicit without breakpoint',
    parallelTools: false,
  },
  review: {
    reviewer: 'Boni',
    dimensions: ['cobertura', 'fidelidade aos fatos e fontes', 'suporte das proposições', 'utilidade da entrega'],
    scale: { 0: 'ausente ou incorreto', 1: 'parcial com ressalva', 2: 'atende ao cenário' },
    rejectOn: ['fato ou fonte inventada', 'prazo exato sem dados', 'mudança fora da seleção', 'violação de orçamento'],
    scenarioCriteria: {
      A02: 'Entregar minuta preliminar condicionada, com modalidade da peça em aberto e sem afirmar urgência demonstrada. Perguntar apenas pelo tipo de peça interrompe uma entrega possível.',
      A03: 'Aceitar pergunta indispensável ou entrega limitada que identifique os dados faltantes. O termo final deve ficar em aberto.',
      A04: 'O pesquisador consulta P-01 e o verificador confere as duas posições com rastreabilidade por fonte. Suporte parcial fundamentado é válido.',
    },
    compare: [
      'Cobertura, suporte, fidelidade, conclusão útil, perguntas indevidas e erros de schema, sobre oito casos por braço.',
      'Tokens, custo calculado, exposição incerta e latência mediana/P95 por chamada, papel e execução. Reportar amostra e falhas.',
      'Priorizar o braço com maior utilidade jurídica. Usar custo e latência como desempate entre braços sem regressão material.',
    ],
  },
  runs: scenarios,
  budget: {
    campaignCapMicroUsd: cap,
    runCapMicroUsd: policy.maxInferenceMicroUsd,
    maxCallsPerRun: policy.maxCalls,
    maxDurationMs: policy.maxDurationMs,
  },
};
const packetJson = JSON.stringify(packet, null, 2) + '\n';
const fingerprint = hash(packetJson);
writeFileSync(join(output, 'packet.json'), packetJson);
writeFileSync(join(output, 'packet.sha256'), fingerprint + '\n');
const ledger = new EvaluationBudget({
  directory: output,
  fingerprint,
  runIds,
  cap,
  runCap: policy.maxInferenceMicroUsd,
});
try {
  for (const run of scenarios) {
    ledger.begin(run.runId);
    for (const [index, call] of run.calls.entries()) {
      const callId = String(index + 1);
      if (!ledger.reserve(run.runId, callId, call.reserveMicroUsd)) throw new Error('A3_REPLAY');
      ledger.settle(run.runId, callId, call.simulatedMicroUsd, { inputTokens: 100, outputTokens: 10 });
    }
    ledger.finish(run.runId, run.outcome);
  }
  if (ledger.summary().unresolved) throw new Error('A3_UNRESOLVED_COST');
} finally {
  ledger.close();
}
const sums = ['lowEstimateMicroUsd', 'highEstimateMicroUsd', 'reserveMicroUsd'];
const totals = (runs) =>
  Object.fromEntries(
    sums.map((key) => [key, runs.flatMap((run) => run.calls).reduce((total, call) => total + call[key], 0)]),
  );
const summary = {
  output,
  fingerprint,
  count: scenarios.length,
  capMicroUsd: cap,
  simulatedLedger: ledger.summary(),
  outcomes: Object.fromEntries(
    ['completed', 'question', 'failed'].map((outcome) => [
      outcome,
      scenarios.filter((run) => run.outcome === outcome).length,
    ]),
  ),
  arms: arms.map((arm) => {
    const runs = scenarios.filter((run) => run.arm === arm);
    return { arm, calls: runs.reduce((total, run) => total + run.calls.length, 0), ...totals(runs) };
  }),
  total: totals(scenarios),
};
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
