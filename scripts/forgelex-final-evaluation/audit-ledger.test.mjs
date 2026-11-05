import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditLedger } from './audit-ledger.mjs';
const fixture = () => {
  const state = {
    runs: {
      case1: { status: 'failed', startedAt: 0, calls: { call1: { status: 'UNCERTAIN', upper: 83620, actual: null } } },
    },
  };
  const value = { previous: null, state };
  return JSON.stringify({ ...value, hash: createHash('sha256').update(JSON.stringify(value)).digest('hex') }) + '\n';
};
test('keeps unknown cost separate from settled cost and never clears it', () => {
  const result = auditLedger(fixture(), {
    case1: { outcome: 'failed', paidModelCalls: 1, measuredMicroUsd: 0, uncertainUpperMicroUsd: 83620 },
  });
  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.measuredMicroUsd, 0);
  assert.equal(result.exposureMicroUsd, 83620);
  assert.equal(result.unresolved[0].callId, 'call1');
  assert.deepEqual(result.artifactMismatches, []);
});
test('rejects corrupt and truncated ledgers', () => {
  assert.throws(() => auditLedger(fixture().replace('83620', '0'), {}), /INTEGRITY/);
  assert.throws(() => auditLedger(fixture().trim(), {}), /INCOMPLETE/);
});
test('reports an artifact that incorrectly claims zero uncertainty or is missing', () => {
  assert.ok(
    auditLedger(fixture(), { case1: { measuredMicroUsd: 0, uncertainUpperMicroUsd: 0 } }).artifactMismatches.length,
  );
  assert.ok(auditLedger(fixture(), {}).artifactMismatches.includes('case1:MISSING_ARTIFACT'));
});
