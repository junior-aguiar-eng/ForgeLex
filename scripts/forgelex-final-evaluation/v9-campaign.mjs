import { corpusV2 } from './corpus-v2.mjs';
export const order = ['D04-V2', 'D01-V2', 'D03-V2', 'V2-FIT', 'V2-INTEGRITY', 'V2-MULTI'];
export function v9Packet(base) {
  return {
    ...base,
    schemaVersion: 2,
    workflowVersion: 9,
    corpus: structuredClone(corpusV2),
    historicalReserveMicroUsd: 83620,
    newCallsCapMicroUsd: 1416380,
    totalCapMicroUsd: 1500000,
    runs: order.map((id) => ({ id, scenarioId: id, variant: 'candidate', phase: 'calibration' })),
    authorization: {
      date: '2026-11-04',
      by: 'Boni',
      source: 'Current chat',
      decision: 'Execute v9 starting with D04-V2 while retaining USD 0.083620 historical reserve and USD 1.50 ceiling',
      historicalReconciliation: 'UNRESOLVED_RESERVE_RETAINED',
      retries: false,
      commit: false,
      push: false,
      publish: false,
    },
    pricing: {
      checkedAt: '2026-11-04',
      source: 'https://developers.openai.com/api/docs/pricing',
      model: 'gpt-6.1-sol',
      inputMicroUsdPerMillion: 2000000,
      outputMicroUsdPerMillion: 10000000,
      cachedInputMicroUsdPerMillion: 100000,
      serviceTier: 'default',
      reasoning: 'low',
      cacheWritesAllowed: false,
    },
    limits: {
      perExecutionCapMicroUsd: 250000,
      maxCallsPerExecution: 24,
      maxCallsTotal: 144,
      maxOutputTokens: 2048,
      maxDurationMs: 300000,
    },
  };
}
export function assertV9Packet(p) {
  if (
    p.workflowVersion !== 9 ||
    p.historicalReserveMicroUsd !== 83620 ||
    p.newCallsCapMicroUsd !== 1416380 ||
    p.totalCapMicroUsd !== 1500000 ||
    JSON.stringify(p.runs) !==
      JSON.stringify(order.map((id) => ({ id, scenarioId: id, variant: 'candidate', phase: 'calibration' }))) ||
    JSON.stringify(p.corpus) !== JSON.stringify(corpusV2) ||
    JSON.stringify(p.limits) !== JSON.stringify(v9Packet({}).limits) ||
    JSON.stringify(p.pricing) !== JSON.stringify(v9Packet({}).pricing)
  )
    throw new Error('V9_SCOPE_CHANGED');
}
export function shouldStop(r) {
  return !['completed', 'question'].includes(r.outcome) || Boolean(r.error) || (r.uncertainUpperMicroUsd ?? 0) > 0;
}
