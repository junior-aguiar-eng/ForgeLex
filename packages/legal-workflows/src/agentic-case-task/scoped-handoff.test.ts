import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { AgenticCaseTask } from './case-task.js';
import { scopeTaskResult, eligibleSupportTargets } from './scoped-handoff.js';

const text = 'Norma sintética.';
const packet = {
  contextId: 'c',
  contextRevision: 1,
  answers: [],
  sources: [{ id: 's', kind: 'NORM' as const, text, contentHash: createHash('sha256').update(text).digest('hex') }],
};
const binding = {
  tenantId: 't',
  userId: 'u',
  executionId: 'e',
  conversationId: 'c',
  contextRevision: 1,
  objective: 'Analisar material',
  actionId: 'analyze_documents' as const,
};
const plan = {
  action: 'analyze_documents',
  requiresCaseLaw: false,
  requiresNorms: false,
  requiresProcedure: true,
  issues: [{ id: 'i', statement: 'Questão', sourceIds: ['s'] }],
  gaps: [],
};
const result = { coveredIssueIds: ['i'], claims: [], requirements: [], findings: [], supportChecks: [] };
const claim = { id: 'c1', classification: 'INFERENCE', statement: 'Afirmação', sourceIds: ['s'] };
it('v9 separates different case namespaces while retaining legacy role-only identities for old checkpoints', () => {
  const a = scopeTaskResult({ ...result, claims: [claim as any] }, 'matter-analyst:0', {}, 'case-binding-a');
  const b = scopeTaskResult({ ...result, claims: [claim as any] }, 'matter-analyst:0', {}, 'case-binding-b');
  expect(a.claims[0].id).not.toBe(b.claims[0].id);
  expect(scopeTaskResult({ ...result, claims: [claim as any] }, 'matter-analyst:0', {}).claims[0].id).toBe(
    '0623a0beb6:c1',
  );
});
const historical = (id: string) =>
  JSON.parse(
    readFileSync(`docs/architecture/evidence/2026-11-02-delivery-failure-fix/real/${id}.checkpoint.json`, 'utf8'),
  );
function fixture(output: (input: any) => any) {
  const inputs: any[] = [];
  let delivery: any;
  const task = new AgenticCaseTask({
    tools: [],
    context: {
      load: async () => packet,
      assert: async () => {},
      save: async (_b, d) => {
        delivery = d;
        return { id: 'saved' };
      },
    },
    createProvider: (input) => {
      inputs.push(input);
      return new FakeAgentProvider(input.registry, undefined, [
        { toolCall: { name: 'task.submit', input: input.role === 'legal-orchestrator' ? plan : output(input) } },
      ]);
    },
  });
  return {
    task,
    inputs,
    delivery: () => delivery,
    async run() {
      let state: any;
      for (let i = 0; i < 10; i++) {
        const step = await task.step(binding, state, new AbortController().signal);
        state = step.state;
        if (step.kind !== 'checkpoint') return step;
      }
      throw new Error('UNFINISHED');
    },
  };
}

it('uses the complete authorized inline sources without a second source-read tool in a closed corpus', async () => {
  const f = fixture(() => result);
  await f.run();
  for (const input of f.inputs) {
    expect(input.packet.sources).toEqual(packet.sources);
    expect(input.selectedPacket).toEqual(packet);
    expect(input.registry.get('task.get_sources')).toBeUndefined();
  }
});

it('scopes independently generated claim IDs without merging distinct propositions', async () => {
  const recorded = historical('D04-create-candidate').outputs['matter-analyst'].claims[0];
  const f = fixture(({ role }) =>
    role === 'authority-verifier'
      ? result
      : {
          ...result,
          claims: [
            {
              ...claim,
              id: recorded.id,
              statement: role === 'matter-analyst' ? recorded.statement : 'Outra proposição processual',
            },
          ],
        },
  );
  await expect(f.run()).resolves.toMatchObject({ kind: 'completed' });
  expect(f.delivery().claims).toHaveLength(2);
  expect(new Set(f.delivery().claims.map((c: any) => c.id)).size).toBe(2);
});

it('still rejects modification of an explicitly reused canonical claim', async () => {
  const f = fixture(({ role, packet: p }) => ({
    ...result,
    claims: [
      {
        ...claim,
        id: role === 'procedural-advisor' ? p.priorResults['matter-analyst'].claims[0].id : claim.id,
        statement: role === 'procedural-advisor' ? 'Alterada' : claim.statement,
      },
    ],
  }));
  await expect(f.run()).rejects.toThrow('CLAIM_ID_CONFLICT');
});

it('still rejects conflicting duplicates inside the same specialist output', async () => {
  const f = fixture(() => ({ ...result, claims: [claim, { ...claim, statement: 'Conflito' }] }));
  await expect(f.run()).rejects.toThrow('CLAIM_ID_CONFLICT');
});

it('exposes only eligible claim/source pairs and rejects the actual D03 requirement-ID checks', async () => {
  const recorded = historical('D03-review-candidate').outputs;
  const f = fixture(({ role, registry, packet: p }) => {
    const schema = registry.get('task.submit')!.inputSchema;
    if (role === 'matter-analyst') {
      expect(schema.safeParse({ ...result, supportChecks: recorded['matter-analyst'].supportChecks }).success).toBe(
        false,
      );
      return {
        ...result,
        claims: [claim],
        requirements: [{ id: 'r3', kind: 'PROCEDURAL', statement: 'Requisito', sourceIds: ['s'], verified: false }],
      };
    }
    if (role === 'authority-verifier') {
      expect(schema.safeParse({ ...result, supportChecks: recorded['authority-verifier'].supportChecks }).success).toBe(
        false,
      );
      const id = p.priorResults['matter-analyst'].claims[0].id;
      expect(p.supportTargets).toEqual([{ claimId: id, sourceId: 's' }]);
      return { ...result, supportChecks: [{ claimId: id, sourceId: 's', quote: text, assessment: 'PARTIAL' }] };
    }
    return result;
  });
  await f.run();
  expect(f.delivery().findings.some((f: any) => f.code === 'SUPPORT_CHECK_INVALID')).toBe(false);
  expect(f.delivery().supportAudit).toEqual([
    expect.objectContaining({ modelAssessment: 'PARTIAL', quoteStatus: 'MATCHED' }),
  ]);
  expect(f.delivery().findings.some((f: any) => f.code === 'CITATION_WITHOUT_SUPPORT')).toBe(true);
});

it('keeps evidence links and source offsets intact when claims acquire canonical IDs', () => {
  const reference = { sourceId: 's', quote: text, start: 0, relation: 'SUPPORTS' as const };
  const value: any = {
    ...result,
    claims: [claim, { ...claim, id: 'c2', statement: 'Contrária' }],
    evidenceAnalysis: {
      rows: [{ id: 'row', claimId: 'c1', issueIds: ['i'], references: [reference], gaps: [] }],
      chronology: [{ id: 'event', claimIds: ['c1'], description: 'Evento', dateText: null, reference }],
      contradictions: [{ id: 'conflict', claimIds: ['c1', 'c2'], explanation: 'Contradição' }],
    },
  };
  const mapped = scopeTaskResult(value, 'matter-analyst:0', {});
  expect(mapped.evidenceAnalysis!.rows[0].claimId).toBe(mapped.claims[0].id);
  expect(mapped.evidenceAnalysis!.chronology[0].claimIds).toEqual([mapped.claims[0].id]);
  expect(mapped.evidenceAnalysis!.contradictions[0].claimIds).toEqual(mapped.claims.map((c) => c.id));
  expect(mapped.evidenceAnalysis!.rows[0].references).toEqual([reference]);
  expect(mapped.claims.map(({ id: _id, ...c }) => c)).toEqual(value.claims.map(({ id: _id, ...c }: any) => c));
  expect(scopeTaskResult(value, 'matter-analyst:1', {}).claims[0].id).not.toBe(mapped.claims[0].id);
  expect(
    scopeTaskResult({ ...result, claims: [mapped.claims[0]] }, 'legal-drafter:0', { analyst: mapped }).claims[0],
  ).toEqual(mapped.claims[0]);
});

it('the recorded D03 legal requirements do not become claim support targets', () => {
  const output = historical('D03-review-candidate').outputs;
  const delivery = JSON.parse(
    readFileSync('docs/architecture/evidence/2026-11-02-delivery-failure-fix/real/D03-review-candidate.json', 'utf8'),
  ).delivery;
  expect(output['authority-verifier'].supportChecks.map((c: any) => c.claimId)).toEqual(['r3', 'ar-r3']);
  expect(delivery.requirements.map((r: any) => r.id)).toEqual(expect.arrayContaining(['r3', 'ar-r3']));
  expect(eligibleSupportTargets(output, delivery.sources)).toEqual([]);
});
