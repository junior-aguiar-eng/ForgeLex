import { describe, expect, it } from 'vitest';
import { runTask6Homologation, assertPilotResult } from './agentic-workspace/task6-homologation.js';
// A credential alone never authorizes inference. Only the approved, persistent USD5 pilot can opt in.
describe.skipIf(process.env.FORGELEX_TASK6_REAL_APPROVAL !== 'boni-task6')('homologação real sintética aprovada por Boni',()=>{
 it('executa um único provider/modelo com orçamento durável, sem pesquisa paga nem fallback',async()=>{
  if(!process.env.OPENAI_API_KEY)throw new Error('PROVIDER_NOT_CONFIGURED');
  const report=await runTask6Homologation(process.cwd(),process.env.OPENAI_API_KEY,process.env.FORGELEX_TASK6_STAGE==='minimal');
  expect(report.provider).toBe('openai');expect(report.model).toBe('gpt-6.1-sol');
  expect(report.attempts.filter((x:any)=>x.caseId==='T6-MIN').at(-1)?.status).toBe('COMPLETED');
  expect(report.observations.every((x:any)=>x.upperBoundCents<=50)).toBe(true);
  assertPilotResult(report,process.env.FORGELEX_TASK6_STAGE??'all',process.env.FORGELEX_TASK6_CASE);
 },600000);
});
