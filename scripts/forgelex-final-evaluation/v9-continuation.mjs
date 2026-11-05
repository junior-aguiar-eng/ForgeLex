import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { v9Packet, assertV9Packet } from './v9-campaign.mjs';
import { auditLedger } from './audit-ledger.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export function previousExecution(directory) {
  const paths = ['packet.json', 'real/budget.jsonl', 'real/D04-V2.json', 'real/D04-V2.checkpoint.json'];
  const files = paths.map((file) => ({ file, sha256: sha(readFileSync(join(directory, file))) }));
  const old = JSON.parse(readFileSync(join(directory, 'packet.json')));
  assertV9Packet(old);
  const r = JSON.parse(readFileSync(join(directory, 'real/D04-V2.json')));
  const audit = auditLedger(readFileSync(join(directory, 'real/budget.jsonl'), 'utf8'), { 'D04-V2': r });
  if (
    audit.status !== 'CONSISTENT_LOCAL_RECORDS' ||
    r.outcome !== 'failed' ||
    r.diagnostic?.failureCode !== 'BUDGET_EXCEEDED' ||
    r.paidModelCalls !== 4 ||
    r.stateVersion !== 9 ||
    r.measuredMicroUsd !== 91896
  )
    throw new Error('UNSAFE_CONTINUATION');
  const checkpoint = JSON.parse(readFileSync(join(directory, 'real/D04-V2.checkpoint.json')));
  const nodes = checkpoint.graph.nodes;
  for (const role of ['matter-analyst', 'procedural-advisor', 'legal-drafter'])
    if (!nodes.some((n) => n.role === role && n.status === 'COMPLETED') || !checkpoint.outputs[role])
      throw new Error('CHECKPOINT_INCOMPLETE');
  if (!nodes.some((n) => n.role === 'adversarial-reviewer' && n.status === 'PENDING'))
    throw new Error('CHECKPOINT_NOT_RESUMABLE');
  return {
    directory,
    files,
    priorMeasuredMicroUsd: r.measuredMicroUsd,
    priorPaidCalls: r.paidModelCalls,
    runLimits: {
      'D04-V2': {
        runCap: 500000 - r.measuredMicroUsd,
        maxCalls: 24 - r.paidModelCalls,
        maxDurationMs: Math.floor(300000 - r.durationMs),
      },
    },
    checkpointPath: join(directory, 'real/D04-V2.checkpoint.json'),
    checkpointSha256: files[3].sha256,
  };
}
export function continuationPacket(base, directory) {
  const p = v9Packet(base),
    continuation = previousExecution(directory);
  p.continuation = continuation;
  p.newCallsCapMicroUsd -= continuation.priorMeasuredMicroUsd;
  p.limits.perExecutionCapMicroUsd = 500000;
  p.authorization.decision =
    'Boni authorizes higher per-execution limit and resumption of D04-V2 checkpoint to finish six scenarios, total USD 1.50 including prior costs and USD 0.083620 historical reserve';
  p.authorization.checkpointResume = true;
  return p;
}
export function assertContinuationPacket(p) {
  const expected = continuationPacket({}, p.continuation.directory);
  for (const key of ['continuation', 'newCallsCapMicroUsd', 'limits', 'authorization'])
    if (JSON.stringify(p[key]) !== JSON.stringify(expected[key])) throw new Error('CONTINUATION_SCOPE_CHANGED');
  const normalized = structuredClone(p);
  normalized.newCallsCapMicroUsd = 1416380;
  normalized.limits.perExecutionCapMicroUsd = 250000;
  assertV9Packet(normalized);
}
