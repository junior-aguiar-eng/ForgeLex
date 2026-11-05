import { createHash } from 'node:crypto';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { expect, it } from 'vitest';
import { AgenticCaseTask } from './case-task.js';
import { auditClaimSupport } from './support-audit.js';
const text = 'Fatura de 610 reais. Pagamento: não informado.';
const source = {
  id: 'invoice',
  kind: 'DOCUMENT' as const,
  text,
  contentHash: createHash('sha256').update(text).digest('hex'),
};
const binding = {
  tenantId: 't',
  userId: 'u',
  executionId: 'e',
  conversationId: 'c',
  contextRevision: 1,
  objective: 'Revisar crédito',
  actionId: 'review_text' as const,
};
const empty = { coveredIssueIds: ['i'], claims: [], requirements: [], findings: [], supportChecks: [] };
const plan = {
  action: 'review_text',
  requiresCaseLaw: false,
  requiresNorms: false,
  requiresProcedure: false,
  issues: [{ id: 'i', statement: 'O documento vincula o crédito?', sourceIds: ['invoice'] }],
  gaps: [
    {
      key: 'relief',
      kind: 'MISSING',
      material: true,
      deliveryImpact: 'LIMITATION',
      prompt: 'Qual resultado material a parte pretende?',
      reason: 'A pretensão não foi informada.',
      sourceIds: [],
      options: [],
    },
  ],
};
it('v9 opt-in verifies documentary claims, preserves questions and exposes a consolidated traceable result', async () => {
  let delivery: any;
  const seen: any[] = [];
  const task = new AgenticCaseTask({
    workflowVersion: 9,
    tools: [],
    context: {
      load: async () => ({ contextId: 'c', contextRevision: 1, sources: [source], answers: [] }),
      assert: async () => {},
      save: async (_b: any, d: any) => {
        delivery = d;
        return { id: 'saved' };
      },
    },
    createProvider: (input: any) => {
      seen.push(input);
      const prior = input.packet.priorResults['matter-analyst'];
      const value =
        input.role === 'legal-orchestrator'
          ? plan
          : input.role === 'matter-analyst'
            ? {
                ...empty,
                claims: [{ id: 'c1', classification: 'DOCUMENT_RECORD', statement: text, sourceIds: ['invoice'] }],
                review: {
                  documentAssessments: [
                    {
                      sourceId: 'invoice',
                      aspects: ['PARTIES', 'CAUSE', 'DUE_DATE', 'CREDIT_LINK'].map((aspect) => ({
                        aspect,
                        status: 'NOT_PROVIDED',
                      })),
                      conclusion: 'O recorte não vincula crédito a devedor identificado; não prova inexistência.',
                    },
                  ],
                },
              }
            : input.role === 'authority-verifier'
              ? {
                  ...empty,
                  supportChecks: input.packet.supportTargets.map((t: any) => ({
                    ...t,
                    quote: text,
                    assessment: 'SUPPORTED',
                  })),
                }
              : {
                  ...empty,
                  claims: [{ id: 'copy', classification: 'DOCUMENT_RECORD', statement: text, sourceIds: ['invoice'] }],
                  findings: [
                    {
                      id: 'notice',
                      code: 'REVIEW_NEEDED',
                      severity: 'BLOCKING',
                      statement: `Conferir ${prior.claims[0].id}.`,
                      sourceIds: ['invoice'],
                    },
                  ],
                  review: {
                    equivalences: [
                      { kind: 'claim', retainedId: prior.claims[0].id, memberIds: [prior.claims[0].id, 'copy'] },
                    ],
                  },
                };
      return new FakeAgentProvider(input.registry, undefined, [{ toolCall: { name: 'task.submit', input: value } }]);
    },
  } as any);
  let state: any;
  for (let i = 0; i < 8; i++) {
    const next = await task.step(binding, state, new AbortController().signal);
    state = next.state;
    if (next.kind === 'completed') break;
  }
  expect(state.version).toBe(9);
  expect(delivery.claims).toHaveLength(1);
  expect(delivery.findings.find((f: any) => f.code === 'REVIEW_NEEDED').statement).toBe(`Conferir “${text}”.`);
  expect(delivery.findings.find((f: any) => f.code === 'REVIEW_NEEDED').statement).not.toContain(delivery.claims[0].id);
  expect(delivery.review.original.claims).toHaveLength(2);
  expect(delivery.review.questions[0].prompt).toContain('resultado material');
  expect(seen.map((i) => i.role)).toContain('authority-verifier');
  expect(delivery.supportAudit[0]).toMatchObject({
    sourceId: 'invoice',
    quoteStatus: 'MATCHED',
    modelAssessment: 'SUPPORTED',
  });
});
it('literal checking distinguishes several selected excerpts and flags an incorrect citation', () => {
  const other = { ...source, id: 'second', text: 'Outro recorte sobre prestação.', contentHash: 'b'.repeat(64) };
  const claims = [
    { id: 'c', classification: 'DOCUMENT_RECORD' as const, statement: text, sourceIds: ['invoice', 'second'] },
  ];
  const checks = [
    { claimId: 'c', sourceId: 'invoice', quote: text, assessment: 'SUPPORTED' as const },
    { claimId: 'c', sourceId: 'second', quote: text, assessment: 'SUPPORTED' as const },
  ];
  expect(auditClaimSupport(claims, [source, other], checks, true).entries.map((e) => e.quoteStatus)).toEqual([
    'MATCHED',
    'MISMATCH',
  ]);
});
