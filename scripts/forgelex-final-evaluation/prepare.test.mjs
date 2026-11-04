import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from './corpus.mjs';
import { buildRunPlan, validateCorpus, assertPreparationHead, baseline } from './prepare.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readTest = (file) => readFileSync(resolve(root, file), 'utf8');

test('preparation requires the exact reviewed HEAD and preserves the original baseline', () => {
  assert.doesNotThrow(() => assertPreparationHead(baseline));
  assert.throws(() => assertPreparationHead('a'.repeat(40)), /HEAD/);
  assert.doesNotThrow(() => assertPreparationHead('a'.repeat(40), 'a'.repeat(40)));
  assert.throws(() => assertPreparationHead('a'.repeat(40), 'b'.repeat(40)), /HEAD/);
  assert.throws(() => assertPreparationHead('main', 'main'), /HEAD/);
});

test('every offline scenario points to an existing exact test and legal sources are closed', () => {
  validateCorpus(corpus, readTest);
});

test('paired comparison charges both versions and calibration is included in the full envelope', () => {
  const { runs, budget } = buildRunPlan(corpus);
  assert.equal(runs.length, 60);
  assert.equal(runs.filter((run) => run.variant === 'baseline').length, 24);
  assert.equal(runs.filter((run) => run.phase === 'calibration').length, 6);
  assert.deepEqual(budget.calibration, {
    executions: 6,
    estimatedLowUsd: 0.36,
    estimatedHighUsd: 1.08,
    proposedCapUsd: 1.5,
  });
  assert.deepEqual(budget.completeIncludingCalibration, {
    executions: 60,
    estimatedLowUsd: 3.6,
    estimatedHighUsd: 10.8,
    proposedCapUsd: 15,
  });
  assert.equal(
    runs.reduce((total, run) => total + run.executionCapUsd, 0),
    15,
  );
  assert.equal(budget.paidExecutionEnabled, false);
  assert.ok(runs.every((run) => run.actualCostUsd === null && run.status === 'not-run'));
});

test('fails closed for duplicate scenarios, absent test and unknown source', () => {
  const duplicate = structuredClone(corpus);
  duplicate.scenarios[1].id = duplicate.scenarios[0].id;
  assert.throws(() => validateCorpus(duplicate, readTest), /duplicado/);
  assert.throws(() => validateCorpus(corpus, () => ''), /não localizado/);
  const unknown = structuredClone(corpus);
  unknown.dossiers[0].sourceIds.push('NONEXISTENT');
  assert.throws(() => validateCorpus(unknown, readTest), /desconhecida/);
});

test('each pair has the same dossier and two distinct blinded labels; new capability is not a baseline failure', () => {
  const { runs } = buildRunPlan(corpus);
  for (const scenario of corpus.scenarios.filter((entry) => entry.group === 'paired')) {
    const pair = runs.filter((run) => run.scenarioId === scenario.id);
    assert.equal(pair.length, 2);
    assert.deepEqual(new Set(pair.map((run) => run.blindLabel)), new Set(['A', 'B']));
  }
  for (const scenario of corpus.scenarios.filter((entry) => entry.group === 'new-capability')) {
    assert.deepEqual(
      runs.filter((run) => run.scenarioId === scenario.id).map((run) => run.variant),
      ['candidate'],
    );
  }
});
