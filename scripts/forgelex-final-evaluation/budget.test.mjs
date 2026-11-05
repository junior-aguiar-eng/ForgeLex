import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvaluationBudget, acquireRunnerLock } from './budget.mjs';

const fixture = (extra = {}) => ({
  directory: mkdtempSync(join(tmpdir(), 'forgelex-eval-budget-')),
  fingerprint: 'fixture',
  runIds: ['before', 'after'],
  cap: 1500000,
  ...extra,
});
test('runner lock excludes competing preparation and releases only its own lock', () => {
  const { directory } = fixture();
  const release = acquireRunnerLock(directory);
  assert.throws(() => acquireRunnerLock(directory), /EEXIST/);
  release();
  const releaseNext = acquireRunnerLock(directory);
  release();
  assert.throws(() => acquireRunnerLock(directory), /EEXIST/);
  releaseNext();
});
test('cancelled deadline returns the same terminal outcome persisted across reopen', () => {
  const config = fixture();
  const budget = new EvaluationBudget(config);
  budget.begin('before');
  const outcome = budget.finish('before', 'failed', { aborted: true });
  assert.equal(outcome, 'cancelled');
  budget.close();
  const reopened = new EvaluationBudget(config);
  assert.equal(reopened.state.runs.before.status, outcome);
  assert.throws(() => reopened.reserve('before', 'late', 1), /NOT_ACTIVE/);
  reopened.close();
});
test('reserves both arms durably before dispatch, counts uncertainty and never replays a reservation', () => {
  const config = fixture({ cap: 200 });
  let budget = new EvaluationBudget(config);
  budget.begin('before');
  assert.equal(budget.reserve('before', 'c1', 120), true);
  assert.equal(budget.reserve('before', 'c1', 120), false);
  budget.settle('before', 'c1', 80, { inputTokens: 30, outputTokens: 2 });
  budget.finish('before', 'completed');
  budget.close();
  budget = new EvaluationBudget(config);
  assert.throws(() => budget.begin('before'), /ALREADY_STARTED/);
  budget.begin('after');
  assert.throws(() => budget.reserve('after', 'c2', 121), /BUDGET/);
  budget.reserve('after', 'c2', 120);
  budget.uncertain('after', 'c2');
  assert.equal(budget.summary().exposure, 200);
  assert.throws(() => budget.reserve('after', 'c3', 1), /UNCERTAIN/);
  budget.close();
});
test('blocks another writer, changed corpus and unknown runs', () => {
  const config = fixture();
  const budget = new EvaluationBudget(config);
  assert.throws(() => new EvaluationBudget(config), /EEXIST/);
  assert.throws(() => budget.begin('other'), /RUN/);
  budget.close();
  assert.throws(() => new EvaluationBudget({ ...config, fingerprint: 'changed' }), /FINGERPRINT/);
});
test('crashed active run cannot replay; pending cost blocks later work', () => {
  const config = fixture();
  let budget = new EvaluationBudget(config);
  budget.begin('before');
  budget.reserve('before', 'c1', 100);
  budget.close();
  budget = new EvaluationBudget(config);
  assert.throws(() => budget.begin('before'), /ALREADY_STARTED/);
  assert.throws(() => budget.begin('after'), /UNCERTAIN/);
  budget.close();
});
test('void releases proven non-dispatch, overrun blocks and cancellation prevents later calls', () => {
  const budget = new EvaluationBudget(fixture());
  budget.begin('before');
  budget.reserve('before', 'c1', 20);
  budget.void('before', 'c1');
  assert.equal(budget.summary().exposure, 0);
  budget.reserve('before', 'c2', 20);
  assert.throws(() => budget.settle('before', 'c2', 21, {}), /OVERRUN/);
  budget.uncertain('before', 'c2');
  budget.finish('before', 'cancelled');
  assert.throws(() => budget.reserve('before', 'c3', 20), /NOT_ACTIVE/);
  budget.close();
});
test('per-run cap, call count and execution deadline cannot be expanded', () => {
  let now = 100;
  const budget = new EvaluationBudget(fixture({ now: () => now }));
  budget.begin('before');
  assert.throws(() => budget.reserve('before', 'large', 250001), /BUDGET/);
  for (let i = 0; i < 24; i++) {
    budget.reserve('before', String(i), 1);
    budget.void('before', String(i));
  }
  assert.throws(() => budget.reserve('before', '25', 1), /CALL_LIMIT/);
  budget.finish('before', 'completed');
  budget.begin('after');
  now += 300001;
  assert.throws(() => budget.reserve('after', 'late', 1), /DEADLINE/);
  budget.close();
});

test('continuation limits subtract previous spend, calls and active time without expanding total cap', () => {
  let now = 100;
  const config = fixture({
    cap: 1324484,
    runCap: 500000,
    runLimits: { before: { runCap: 408104, maxCalls: 20, maxDurationMs: 230294 } },
    now: () => now,
  });
  const budget = new EvaluationBudget(config);
  budget.begin('before');
  assert.equal(budget.reserve('before', 'next', 195188), true);
  budget.settle('before', 'next', 100000, {});
  assert.throws(() => budget.reserve('before', 'too-large', 308105), /BUDGET/);
  for (let i = 1; i < 20; i++) {
    budget.reserve('before', 'n' + i, 1);
    budget.void('before', 'n' + i);
  }
  assert.throws(() => budget.reserve('before', 'over-count', 1), /CALL_LIMIT/);
  budget.finish('before', 'completed');
  budget.begin('after');
  budget.reserve('after', 'a', 400000);
  budget.settle('after', 'a', 400000, {});
  assert.throws(() => budget.reserve('after', 'b', 100001), /BUDGET/);
  budget.close();
  assert.throws(() => new EvaluationBudget({ ...config, runCap: 600000 }), /FINGERPRINT/);
  const timed = new EvaluationBudget(fixture({ runLimits: { before: { maxDurationMs: 10 } }, now: () => now }));
  timed.begin('before');
  now += 10;
  assert.throws(() => timed.reserve('before', 'late', 1), /DEADLINE/);
  timed.close();
});
