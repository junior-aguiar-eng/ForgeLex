import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { v9Packet, assertV9Packet } from './v9-campaign.mjs';
import { assertContinuationPacket } from './v9-continuation.mjs';
import { auditLedger } from './audit-ledger.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export function finalizationPacket(base, directory) {
  const old = JSON.parse(readFileSync(join(directory, 'packet.json')));
  assertContinuationPacket(old);
  const ids = ['D04-V2', 'D01-V2', 'D03-V2', 'V2-FIT'];
  const results = Object.fromEntries(
    ids.map((id) => [id, JSON.parse(readFileSync(join(directory, 'real', id + '.json')))]),
  );
  const audit = auditLedger(readFileSync(join(directory, 'real/budget.jsonl'), 'utf8'), results);
  const fit = results['V2-FIT'];
  if (
    audit.status !== 'CONSISTENT_LOCAL_RECORDS' ||
    audit.measuredMicroUsd !== 281102 ||
    ids.slice(0, 3).some((id) => results[id].outcome !== 'completed') ||
    fit.outcome !== 'failed' ||
    fit.error !== 'INTERNAL_IDENTIFIER_IN_OUTPUT' ||
    fit.measuredMicroUsd !== 70016 ||
    fit.paidModelCalls !== 4
  )
    throw new Error('UNSAFE_FINALIZATION');
  const checkpointPath = join(directory, 'real/V2-FIT.checkpoint.json');
  const checkpoint = JSON.parse(readFileSync(checkpointPath));
  if (
    checkpoint.version !== 9 ||
    !checkpoint.graph.nodes.some((n) => n.role === 'authority-verifier' && n.status === 'PENDING') ||
    !checkpoint.outputs['matter-analyst'] ||
    !checkpoint.outputs['adversarial-reviewer']
  )
    throw new Error('CHECKPOINT_NOT_RESUMABLE');
  const paths = [
    'packet.json',
    'real/budget.jsonl',
    'real/receipt.json',
    ...ids.map((id) => 'real/' + id + '.json'),
    'real/V2-FIT.checkpoint.json',
  ];
  const p = v9Packet(base);
  p.finalization = true;
  p.continuation = {
    directory,
    files: paths.map((file) => ({ file, sha256: sha(readFileSync(join(directory, file))) })),
    resumeRunId: 'V2-FIT',
    priorMeasuredMicroUsd: 372998,
    priorPaidCalls: 18,
    checkpointPath,
    checkpointSha256: sha(readFileSync(checkpointPath)),
    runLimits: {
      'V2-FIT': {
        runCap: 500000 - fit.measuredMicroUsd,
        maxCalls: 24 - fit.paidModelCalls,
        maxDurationMs: Math.floor(300000 - fit.durationMs),
      },
    },
  };
  p.runs = p.runs.slice(3);
  p.newCallsCapMicroUsd = 1043382;
  p.limits.perExecutionCapMicroUsd = 500000;
  p.authorization.decision =
    'Boni authorizes correction of INTERNAL_IDENTIFIER_IN_OUTPUT, resumption of pending V2-FIT verifier and completion of remaining scenarios within USD 1.50 including all previous v9 costs and USD 0.083620 reserve';
  p.authorization.checkpointResume = true;
  return p;
}
export function assertFinalizationPacket(p) {
  const expected = finalizationPacket({}, p.continuation.directory);
  for (const key of ['finalization', 'continuation', 'runs', 'newCallsCapMicroUsd', 'limits', 'authorization'])
    if (JSON.stringify(p[key]) !== JSON.stringify(expected[key])) throw new Error('FINALIZATION_SCOPE_CHANGED');
  const normalized = structuredClone(p);
  normalized.runs = v9Packet({}).runs;
  normalized.newCallsCapMicroUsd = 1416380;
  normalized.limits.perExecutionCapMicroUsd = 250000;
  assertV9Packet(normalized);
}
