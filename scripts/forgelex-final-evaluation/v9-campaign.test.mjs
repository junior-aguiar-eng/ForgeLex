import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v9Packet, assertV9Packet, shouldStop } from './v9-campaign.mjs';
test('pins candidate-only order, action mapping and reserve-inclusive cap', () => {
  const p = v9Packet({ candidate: { head: 'a'.repeat(40) } });
  assertV9Packet(p);
  assert.deepEqual(
    p.runs.map((r) => r.id),
    ['D04-V2', 'D01-V2', 'D03-V2', 'V2-FIT', 'V2-INTEGRITY', 'V2-MULTI'],
  );
  assert.equal(p.workflowVersion, 9);
  assert.equal(p.newCallsCapMicroUsd + p.historicalReserveMicroUsd, 1500000);
  assert.ok(p.runs.every((r) => r.variant === 'candidate'));
  assert.equal(p.corpus.scenarios[0].action, 'analyze_documents');
});
test('refuses altered financial envelope or reordered cases', () => {
  for (const mutate of [
    (p) => (p.newCallsCapMicroUsd = 1500000),
    (p) => (p.historicalReserveMicroUsd = 0),
    (p) => p.runs.reverse(),
    (p) => (p.workflowVersion = 8),
  ]) {
    const p = v9Packet({ candidate: { head: 'a'.repeat(40) } });
    mutate(p);
    assert.throws(() => assertV9Packet(p));
  }
});
test('stops on any failure or new uncertain cost, allows limited delivery and questions', () => {
  assert.equal(shouldStop({ outcome: 'completed', error: null, uncertainUpperMicroUsd: 0 }), false);
  assert.equal(shouldStop({ outcome: 'question', error: null, uncertainUpperMicroUsd: 0 }), false);
  for (const r of [
    { outcome: 'failed' },
    { outcome: 'cancelled' },
    { outcome: 'completed', error: 'BUDGET_EXCEEDED' },
    { outcome: 'completed', uncertainUpperMicroUsd: 1 },
  ])
    assert.equal(shouldStop(r), true);
});
