import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { EvidenceTaskPlanSchema } from '@forgelex/legal-agents';
import { AgenticCaseTask } from './case-task.js';
import { auditTaskEvidence } from './evidence-audit.js';

const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-evidence-v2.json', import.meta.url), 'utf8'));
it('binds the probatory planner contract to the explicitly selected action', () => {
  expect(EvidenceTaskPlanSchema.safeParse(legacy.state.plan).success).toBe(false);
  expect(EvidenceTaskPlanSchema.safeParse({ ...legacy.state.plan, action: 'analyze_evidence' }).success).toBe(true);
});
const text = 'Em 2026-10-01 houve entrega. O recibo registra pagamento.';
const source = {
  id: 'doc',
  kind: 'DOCUMENT' as const,
  text,
  contentHash: createHash('sha256').update(text).digest('hex'),
  documentId: 'document',
  versionId: 'version',
};
const issue = { id: 'issue', statement: 'Houve pagamento?', sourceIds: ['doc'] };
const claim = {
  id: 'claim',
  statement: 'O recibo relata pagamento',
  classification: 'ALLEGATION' as const,
  sourceIds: ['doc'],
};
const reference = { sourceId: 'doc', quote: 'O recibo registra pagamento.', start: 29, relation: 'SUPPORTS' as const };
const analysis = () => ({
  rows: [{ id: 'row', claimId: 'claim', issueIds: ['issue'], references: [reference], gaps: [] }],
  chronology: [
    {
      id: 'event',
      claimIds: ['claim'],
      description: 'Entrega relatada',
      dateText: '2026-10-01',
      reference: { ...reference, quote: 'Em 2026-10-01 houve entrega.', start: 0 },
    },
  ],
  contradictions: [],
});
const empty = () => ({ coveredIssueIds: ['issue'], claims: [], requirements: [], findings: [], supportChecks: [] });
function fixture(
  output = { ...empty(), claims: [claim], evidenceAnalysis: analysis() } as any,
  reviewer = empty() as any,
) {
  const roles: string[] = [],
    deliveries: any[] = [];
  let revoked = false;
  const binding = { ...legacy.binding, actionId: 'analyze_evidence' as const };
  const task = new AgenticCaseTask({
    context: {
      load: async () => ({ ...legacy.packet, sources: [source] }),
      assert: async () => {
        if (revoked) throw new Error('ACCESS_REVOKED');
      },
      save: async (_b, d) => {
        deliveries.push(d);
        return { id: 'delivery' };
      },
    },
    tools: [],
    createProvider: ({ role, registry }) => {
      roles.push(role);
      return new FakeAgentProvider(registry, undefined, [
        {
          toolCall: {
            name: 'task.submit',
            input:
              role === 'legal-orchestrator'
                ? { ...legacy.state.plan, action: 'analyze_evidence', issues: [issue] }
                : role === 'matter-analyst'
                  ? output
                  : reviewer,
          },
        },
      ]);
    },
  });
  const step = (state?: any, signal = new AbortController().signal) => task.step(binding, state, signal);
  const finish = async (state?: any) => {
    for (let i = 0; i < 12; i++) {
      const r = await step(state);
      state = r.state;
      if (r.kind !== 'checkpoint') return r;
    }
    throw new Error('LOOP');
  };
  return {
    step,
    finish,
    roles,
    deliveries,
    revoke: () => {
      revoked = true;
    },
  };
}
it('produces an audited evidence matrix and mandatory adversarial review without adopting facts', async () => {
  const f = fixture();
  const r = await f.finish();
  expect(r.state.version).toBe(8);
  expect(f.roles).toEqual(['legal-orchestrator', 'matter-analyst', 'adversarial-reviewer']);
  expect(f.deliveries[0].evidenceMatrix.rows[0]).toMatchObject({
    claimId: f.deliveries[0].claims[0].id,
    coverage: 'DOCUMENT_LINKED',
    references: [{ quoteStatus: 'MATCHED', sourceContentHash: source.contentHash }],
  });
  expect(f.deliveries[0]).toMatchObject({ legalAssessment: 'NOT_EVALUATED', humanReviewRequired: true });
  expect(f.deliveries[0].evidenceMatrix.chronology[0].sortDate).toBe('2026-10-01');
});
it('resumes the current probatory checkpoint without replaying the analyst', async () => {
  const f = fixture();
  const p = await f.step();
  const a = await f.step(p.state);
  await f.finish(JSON.parse(JSON.stringify(a.state)));
  expect(f.roles.filter((r) => r === 'matter-analyst')).toHaveLength(1);
  expect(f.deliveries).toHaveLength(1);
});
it('retains the captured v2 contract and resumes its original route', async () => {
  const roles: string[] = [];
  const task = new AgenticCaseTask({
    context: { load: async () => legacy.packet, assert: async () => {}, save: async () => ({ id: 'old' }) },
    tools: [],
    createProvider: ({ role, registry }) => {
      roles.push(role);
      return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input: empty() } }]);
    },
  });
  const r = await task.step(legacy.binding, legacy.state, new AbortController().signal);
  expect(r.state.contractHash).toBe(legacy.state.contractHash);
  expect(r.state.version).toBe(2);
  expect(roles).toEqual(['matter-analyst']);
});
it('limits a missing matrix instead of presenting prose as the completed task', async () => {
  const f = fixture({ ...empty(), claims: [claim] });
  await f.finish();
  expect(f.deliveries[0].findings.some((f: any) => f.code === 'EVIDENCE_MATRIX_MISSING')).toBe(true);
  expect(f.deliveries[0].status).toBe('LIMITED');
});
it('does not continue after revocation or cancellation', async () => {
  const f = fixture();
  const r = await f.step();
  f.revoke();
  await expect(f.step(r.state)).rejects.toThrow('ACCESS_REVOKED');
  const controller = new AbortController();
  controller.abort();
  await expect(f.step(r.state, controller.signal)).rejects.toThrow('SESSION_CANCELLED');
  expect(f.deliveries).toHaveLength(0);
});
it('does not treat matching user allegations as document evidence', () => {
  const r = auditTaskEvidence(analysis(), [claim], [issue], [{ ...source, kind: 'USER_TEXT' }]);
  expect(r.matrix.rows[0].coverage).toBe('CONTEXT_ONLY');
  expect(r.limitations).toContain('EVIDENCE_DOCUMENT_MISSING');
});
it('preserves a mismatched quote as an explicit limitation', () => {
  const a = analysis();
  a.rows[0].references[0] = { ...reference, start: 0 };
  const r = auditTaskEvidence(a, [claim], [issue], [source]);
  expect(r.matrix.rows[0].references[0].quoteStatus).toBe('MISMATCH');
  expect(r.limitations).toContain('EVIDENCE_REFERENCE_MISMATCH');
});
it.each(['AUTHORITY', 'NORM', 'DRAFT', 'PREVIOUS_DELIVERY'])(
  'rejects secondary source %s as primary evidence',
  (kind) => {
    expect(() => auditTaskEvidence(analysis(), [claim], [issue], [{ ...source, kind } as any])).toThrow(
      'EVIDENCE_SOURCE_INVALID',
    );
  },
);
it('rejects orphaned claims, issues and duplicated rows', () => {
  const a = analysis();
  a.rows[0].claimId = 'invented';
  expect(() => auditTaskEvidence(a, [claim], [issue], [source])).toThrow('EVIDENCE_REFERENCE_INVALID');
  const b = analysis();
  b.rows[0].issueIds = ['invented'];
  expect(() => auditTaskEvidence(b, [claim], [issue], [source])).toThrow('EVIDENCE_REFERENCE_INVALID');
  const c = analysis();
  c.rows.push(c.rows[0]);
  expect(() => auditTaskEvidence(c, [claim], [issue], [source])).toThrow('EVIDENCE_ID_CONFLICT');
});
it('flags later claims and unexamined issues as incomplete rather than silently covered', () => {
  const r = auditTaskEvidence(
    analysis(),
    [claim, { ...claim, id: 'late' }],
    [issue, { ...issue, id: 'other' }],
    [source],
  );
  expect(r.limitations).toContain('EVIDENCE_MATRIX_INCOMPLETE');
});
it('does not invent dates or accept impossible dates into chronological ordering', () => {
  const a = analysis();
  a.chronology[0].dateText = '2026-02-30';
  const r = auditTaskEvidence(a, [claim], [issue], [source]);
  expect(r.matrix.chronology[0].sortDate).toBeNull();
  expect(r.limitations).toContain('EVIDENCE_DATE_UNCERTAIN');
});
it('keeps contradictions explicit and limits the delivery', () => {
  const a: any = analysis();
  a.contradictions = [{ id: 'conflict', claimIds: ['claim', 'other'], explanation: 'Relatos incompatíveis' }];
  const r = auditTaskEvidence(a, [claim, { ...claim, id: 'other' }], [issue], [source]);
  expect(r.matrix.contradictions).toHaveLength(1);
  expect(r.limitations).toContain('EVIDENCE_CONFLICT_UNRESOLVED');
});
it('rejects oversized probatory state without saving a delivery', async () => {
  const claims = Array.from({ length: 100 }, (_, i) => ({ ...claim, id: `c${i}` }));
  const f = fixture({
    ...empty(),
    claims,
    evidenceAnalysis: {
      rows: claims.map((c) => ({
        ...analysis().rows[0],
        id: `r${c.id}`,
        claimId: c.id,
        references: [{ ...reference, quote: 'x'.repeat(3000) }],
      })),
      chronology: [],
      contradictions: [],
    },
  });
  await expect(f.finish()).rejects.toThrow('TASK_CONTEXT_LIMIT');
  expect(f.deliveries).toHaveLength(0);
});
it('does not permit the reviewer to replace the matrix outside the analyst handoff', async () => {
  const f = fixture(undefined, { ...empty(), evidenceAnalysis: analysis() });
  await expect(f.finish()).rejects.toThrow();
  expect(f.deliveries).toHaveLength(0);
});
it('marks new reviewer assertions not covered by the matrix as limited', async () => {
  const f = fixture(undefined, { ...empty(), claims: [{ ...claim, id: 'new' }] });
  await f.finish();
  expect(f.deliveries[0].status).toBe('LIMITED');
  expect(f.deliveries[0].findings.some((x: any) => x.code === 'EVIDENCE_MATRIX_INCOMPLETE')).toBe(true);
});
