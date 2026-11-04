// Read-only financial audit: never invokes a provider or mutates a ledger.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const amount = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_AMOUNT');
  return value;
};
export function auditLedger(text, artifacts = {}) {
  if (!text.endsWith('\n') || !text.trim()) throw new Error('LEDGER_INCOMPLETE');
  let previous = null,
    state;
  for (const line of text.trim().split('\n')) {
    const entry = JSON.parse(line);
    if (
      entry.previous !== previous ||
      sha(JSON.stringify({ previous: entry.previous, state: entry.state })) !== entry.hash
    )
      throw new Error('LEDGER_INTEGRITY');
    previous = entry.hash;
    state = entry.state;
  }
  const result = {
    schemaVersion: 1,
    status: 'CONSISTENT_LOCAL_RECORDS',
    ledgerSha256: sha(text),
    measuredMicroUsd: 0,
    uncertainMicroUsd: 0,
    exposureMicroUsd: 0,
    unresolved: [],
    artifactMismatches: [],
    providerBillingVerified: false,
  };
  for (const [runId, run] of Object.entries(state.runs)) {
    let measured = 0,
      uncertain = 0;
    const entries = Object.entries(run.calls);
    for (const [callId, call] of entries) {
      const upper = amount(call.upper);
      if (call.status === 'SETTLED') {
        const actual = amount(call.actual);
        if (actual > upper) throw new Error('COST_OVERRUN');
        measured += actual;
      } else if (['UNCERTAIN', 'RESERVED'].includes(call.status)) {
        uncertain += upper;
        result.unresolved.push({
          runId,
          callId,
          status: call.status,
          upperMicroUsd: upper,
          executionStartedAt: new Date(run.startedAt).toISOString(),
        });
      } else if (call.status !== 'VOID') throw new Error('INVALID_CALL_STATE');
    }
    result.measuredMicroUsd += measured;
    result.uncertainMicroUsd += uncertain;
    const artifact = artifacts[runId];
    if (!artifact) result.artifactMismatches.push(`${runId}:MISSING_ARTIFACT`);
    else {
      for (const [field, expected] of Object.entries({
        measuredMicroUsd: measured,
        uncertainUpperMicroUsd: uncertain,
        outcome: run.status,
      }))
        if (artifact[field] !== expected) result.artifactMismatches.push(`${runId}:${field}`);
    }
  }
  result.exposureMicroUsd = result.measuredMicroUsd + result.uncertainMicroUsd;
  if (result.unresolved.length) result.status = 'RECONCILIATION_REQUIRED';
  if (result.artifactMismatches.length) result.status = 'ARTIFACT_MISMATCH';
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: node audit-ledger.mjs <campaign-directory>');
  const text = readFileSync(join(directory, 'budget.jsonl'), 'utf8');
  // Validate the chain before using any of its identifiers as paths.
  auditLedger(text);
  const final = JSON.parse(text.trim().split('\n').at(-1)).state;
  const artifacts = {};
  for (const runId of Object.keys(final.runs)) {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('INVALID_RUN_ID');
    const path = join(directory, runId + '.json');
    if (existsSync(path)) artifacts[runId] = JSON.parse(readFileSync(path, 'utf8'));
  }
  const result = auditLedger(text, artifacts);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'CONSISTENT_LOCAL_RECORDS') process.exitCode = 2;
}
