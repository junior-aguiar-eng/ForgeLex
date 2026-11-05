// Preparação exclusivamente local: sem transporte HTTP, SDK de IA ou leitura de .env.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, lstatSync, copyFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from './corpus.mjs';

export const baseline = '025f6dd438ecfd78079b4688fd076e476da74ce9';
export const pricing = {
  checkedAt: '2026-11-02',
  model: 'gpt-6.1-sol',
  serviceTier: 'default',
  currency: 'USD',
  source: 'https://developers.openai.com/api/docs/pricing',
  inputPerMillion: 2,
  outputPerMillion: 10,
  cacheDiscountAssumed: false,
  planningTokensPerExecution: { low: { input: 15000, output: 3000 }, high: { input: 50000, output: 8000 } },
  executionCapUsd: 0.25,
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const sumCost = ({ input, output }) => (input * pricing.inputPerMillion + output * pricing.outputPerMillion) / 1e6;
const rounded = (number) => Math.round(number * 100) / 100;

export function validateCorpus(value, readTest) {
  const ids = new Set();
  if (value.scenarios.length !== 60) throw new Error('São necessários 60 cenários.');
  const dossiers = new Map(value.dossiers.map((entry) => [entry.id, entry]));
  const sources = new Set(value.sources.map((entry) => entry.id));
  for (const dossier of value.dossiers) {
    if (!dossier.documents.length || !dossier.context || !dossier.draft) throw new Error('Dossiê incompleto.');
    for (const source of dossier.sourceIds) if (!sources.has(source)) throw new Error('Fonte desconhecida.');
  }
  for (const scenario of value.scenarios) {
    if (ids.has(scenario.id)) throw new Error('Cenário duplicado.');
    ids.add(scenario.id);
    if (scenario.group === 'offline-control') {
      if (!readTest(scenario.file).includes(`it('${scenario.test}'`))
        throw new Error(`Controle não localizado: ${scenario.id}`);
    } else {
      if (!dossiers.has(scenario.dossierId)) throw new Error('Dossiê desconhecido.');
      if (!scenario.request || !scenario.expected?.length || !scenario.forbidden?.length)
        throw new Error('Critério ausente.');
      if (!['paired', 'new-capability'].includes(scenario.group)) throw new Error('Grupo desconhecido.');
    }
  }
  const count = (group) => value.scenarios.filter((scenario) => scenario.group === group).length;
  if (count('paired') !== 24 || count('new-capability') !== 12 || count('offline-control') !== 24)
    throw new Error('Distribuição inválida.');
  if (value.scenarios.filter((scenario) => scenario.calibration).length !== 3) throw new Error('Calibração inválida.');
}

export function buildRunPlan(value) {
  const planned = value.scenarios.filter((scenario) => scenario.group !== 'offline-control');
  const runs = planned.flatMap((scenario, index) => {
    // Contrabalançar ordem, sem chamar os modelos. Chave A/B fica fora da ficha de notas.
    const variants =
      scenario.group === 'paired' ? (index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) : ['candidate'];
    return variants.map((variant, side) => ({
      id: `${scenario.id}-${variant}`,
      scenarioId: scenario.id,
      variant,
      phase: scenario.calibration ? 'calibration' : 'remaining',
      blindLabel: scenario.group === 'paired' ? (side === 0 ? 'A' : 'B') : 'N',
      executionCapUsd: pricing.executionCapUsd,
      status: 'not-run',
      calls: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      actualCostUsd: null,
      durationMs: null,
      stopReason: null,
      outputSha256: null,
    }));
  });
  runs.sort((a, b) => Number(b.phase === 'calibration') - Number(a.phase === 'calibration'));
  const estimate = (count) => ({
    executions: count,
    estimatedLowUsd: rounded(count * sumCost(pricing.planningTokensPerExecution.low)),
    estimatedHighUsd: rounded(count * sumCost(pricing.planningTokensPerExecution.high)),
    proposedCapUsd: rounded(count * pricing.executionCapUsd),
  });
  return {
    runs,
    budget: {
      approval: 'pending',
      paidExecutionEnabled: false,
      pricing,
      calibration: estimate(runs.filter((run) => run.phase === 'calibration').length),
      completeIncludingCalibration: estimate(runs.length),
      note: 'Hipóteses de consumo agregado por execução, não medições. Limites propostos; este preparador não implementa executor pago nem autoriza despachos. Sem câmbio, impostos ou preço comercial ForgeLex. Bloqueios prévios podem custar zero; encerramento por teto não é aprovação jurídica.',
    },
  };
}

export function assertPreparationHead(head, expectedHead = baseline) {
  if (!/^[a-f0-9]{40}$/.test(expectedHead) || head !== expectedHead)
    throw new Error('HEAD mudou: revisar a comparação antes de preparar outro pacote.');
}

export function prepare(root, options = {}) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  const read = (file) => readFileSync(resolve(root, file), 'utf8');
  validateCorpus(corpus, read);
  const plan = buildRunPlan(corpus);
  const head = git('rev-parse', 'HEAD');
  assertPreparationHead(head, options.expectedHead);
  const rootPrefix = /^(apps\/|packages\/|scripts\/|tests\/|[^/]+\.(?:json|yaml|yml|ts|mjs)$|AGENTS\.md$)/;
  const files = git('ls-files', '-z', '--cached', '--others', '--exclude-standard')
    .split('\0')
    .filter((file) => file && rootPrefix.test(file) && !/(^|\/)(node_modules|dist|build|\.env[^/]*)(\/|$)/.test(file));
  const entries = [...new Set(files)].sort().map((file) => {
    const absolute = resolve(root, file);
    if (!relative(root, absolute) || relative(root, absolute).startsWith('..') || !lstatSync(absolute).isFile())
      throw new Error(`Arquivo inválido: ${file}`);
    return { file, sha256: hash(readFileSync(absolute)) };
  });
  const candidateHash = hash(JSON.stringify(entries));
  const snapshot = `tmp/forgelex-final-evaluation/${candidateHash}`;
  for (const entry of entries) {
    const destination = resolve(root, snapshot, 'candidate', entry.file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(root, entry.file), destination);
    if (hash(readFileSync(destination)) !== entry.sha256)
      throw new Error('Arquivo mudou durante a cópia; execute novamente.');
  }
  const baselineArchive = resolve(root, snapshot, 'baseline.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${baselineArchive}`, baseline], { cwd: root });
  const packet = {
    schemaVersion: 1,
    preparedAt: options.preparedAt ?? '2026-11-02',
    mode: 'offline-preparation',
    baseline: {
      commit: baseline,
      tree: git('rev-parse', `${baseline}^{tree}`),
      archive: `${snapshot}/baseline.tar`,
      archiveSha256: hash(readFileSync(baselineArchive)),
    },
    candidate: {
      head,
      branch: git('branch', '--show-current'),
      sourceSha256: candidateHash,
      snapshot: `${snapshot}/candidate`,
      files: entries,
    },
    corpusSha256: hash(JSON.stringify(corpus)),
    corpus,
    ...plan,
    scoring: {
      evaluator: 'Boni',
      status: 'not-evaluated',
      dimensions: ['issues', 'support', 'procedure', 'counterarguments', 'requests'],
      scale: {
        0: 'Ausente ou materialmente incorreto',
        1: 'Falhas materiais',
        2: 'Parcial, exige correção',
        3: 'Adequado com ressalva menor',
        4: 'Adequado ao recorte e explícito sobre limites',
      },
      hardFailures: [
        'Fato, fonte, prazo ou citação material inventada',
        'Uso de item alterado como aprovado',
        'Exposição de fonte revogada ou de outro caso',
        'Incorporação sem aprovação',
        'Despacho além do limite ou repetição após custo incerto',
      ],
    },
  };
  const output = options.outputDirectory ?? resolve(root, 'docs/architecture/evidence/2026-11-02-final-evaluation');
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'packet.json'), json(packet));
  const rows = [
    'scenario,label,issues,support,procedure,counterarguments,requests,hard_failure,unsupported_claims,total_material_claims,decision,reason',
  ];
  for (const run of plan.runs) rows.push(`${run.scenarioId},${run.blindLabel},,,,,,,,,,`);
  // Template, nunca arquivo de resultados: regeneração não pode sobrescrever notas preenchidas.
  writeFileSync(resolve(output, 'scores-template.csv'), rows.join('\n') + '\n');
  const lines = [
    '# Cenários da avaliação final',
    '',
    'Preparação local; nenhuma execução com IA real ou nota jurídica.',
    '',
    '## Dossiês fictícios',
    '',
  ];
  for (const dossier of corpus.dossiers) {
    lines.push(
      `### ${dossier.id} — ${dossier.title}`,
      '',
      dossier.context,
      '',
      `Tipo: ${dossier.kind}. Fontes jurídicas: ${dossier.sourceIds.join(', ') || 'não disponíveis'}.`,
      '',
    );
    for (const [id, text] of dossier.documents) lines.push(`- ${dossier.id}/${id}@v1#p1: ${text}`);
    lines.push('', `Rascunho para revisão: ${dossier.draft}`, '');
  }
  lines.push('## Roteiros', '');
  for (const scenario of corpus.scenarios) {
    lines.push(`### ${scenario.id}`, '');
    if (scenario.group === 'offline-control')
      lines.push(`Controle local: ${scenario.expected}`, '', `Teste: \`${scenario.file}\` — ${scenario.test}.`, '');
    else
      lines.push(
        `Dossiê: ${scenario.dossierId}. Opção: **${scenario.option}**. Grupo: ${scenario.group}.`,
        '',
        `Pedido: ${scenario.request}`,
        '',
        `Preparação: ${scenario.setup || 'Caso isolado com os documentos e fontes do dossiê. Sem contexto aprovado e sem histórico de outro cenário.'}`,
        '',
        `Esperado: ${scenario.expected.join(' ')}`,
        '',
        `Reprova: ${scenario.forbidden.join(' ')}`,
        '',
      );
  }
  lines.push(
    '## Recortes oficiais',
    '',
    'Recortes consultados em 02/11/2026. Não representam pesquisa exaustiva ou inteiro teor de precedentes.',
    '',
  );
  for (const source of corpus.sources)
    lines.push(`### ${source.id}`, '', source.scope, '', source.text, '', `[Fonte oficial](${source.url})`, '');
  writeFileSync(resolve(output, 'scenarios.md'), lines.join('\n'));
  return {
    scenarios: corpus.scenarios.length,
    modelExecutionsPlanned: plan.runs.length,
    paidCallsMade: 0,
    candidateHash,
    snapshot,
    budget: plan.budget,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(json(prepare(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))));
}
