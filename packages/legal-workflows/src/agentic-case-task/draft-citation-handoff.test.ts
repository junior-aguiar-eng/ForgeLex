import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import type { AgenticTaskDelivery } from '@forgelex/domain';
import { AgenticCaseTask } from './case-task.js';

it.each([
  { proposed: 'A resposta é escrita.', checked: 'A resposta é escrita.', status: 'MATCHED', unlinked: false },
  { proposed: 'A resposta é escrita.', checked: 'O prazo é de dez dias.', status: 'MISMATCH', unlinked: false },
  { proposed: 'Trecho inexistente.', checked: 'A resposta é escrita.', status: 'MATCHED', unlinked: true },
])('audita o trecho do redator após retomar o checkpoint ($proposed, $checked)', async (scenario) => {
  const text = 'A resposta é escrita. O prazo é de dez dias.';
  const statement = 'A defesa apresenta resposta escrita.';
  const source = {
    id: 'norma',
    kind: 'NORM' as const,
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
  };
  const binding = {
    tenantId: 't',
    userId: 'u',
    executionId: 'e',
    conversationId: 'c',
    contextRevision: 1,
    objective: 'Elaborar peça',
    actionId: 'create_document' as const,
  };
  const empty = { coveredIssueIds: ['i'], claims: [], requirements: [], findings: [], supportChecks: [] };
  let delivery: AgenticTaskDelivery | undefined;
  const task = new AgenticCaseTask({
    workflowVersion: 11,
    tools: [],
    context: {
      load: async () => ({ contextId: 'c', contextRevision: 1, sources: [source], answers: [] }),
      assert: async () => {},
      save: async (_binding, value) => {
        delivery = value;
        return { id: 'saved' };
      },
    },
    createProvider: ({ registry, role, packet }) => {
      let input: Record<string, unknown> = empty;
      if (role === 'legal-orchestrator')
        input = {
          action: 'create_document',
          documentMode: 'CREATE',
          documentType: 'Resposta',
          requiresCaseLaw: false,
          requiresNorms: false,
          requiresProcedure: false,
          issues: [{ id: 'i', statement, sourceIds: ['norma'] }],
          gaps: [],
        };
      if (role === 'legal-drafter')
        input = {
          ...empty,
          claims: [{ id: 'local', classification: 'INFERENCE', statement, sourceIds: ['norma'] }],
          document: {
            title: 'Resposta',
            documentType: 'Resposta',
            sections: [
              { title: 'Defesa', content: statement, sourceIds: ['norma'] },
              { title: 'Pedidos', content: 'Requer o recebimento da resposta.', sourceIds: ['norma'] },
            ],
          },
          draftCitations: [{ claimId: 'local', sourceId: 'norma', quote: scenario.proposed }],
        };
      if (role === 'authority-verifier') {
        const target = packet.supportTargets?.[0];
        expect(target?.claimId).not.toBe('local');
        expect(target?.quote).toBe(scenario.unlinked ? undefined : scenario.proposed);
        input = {
          ...empty,
          supportChecks: [
            { claimId: target?.claimId, sourceId: 'norma', quote: scenario.checked, assessment: 'SUPPORTED' },
          ],
        };
      }
      return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input } }]);
    },
  });
  let checkpoint: unknown;
  for (let index = 0; index < 12; index++) {
    const step = await task.step(binding, checkpoint, new AbortController().signal);
    checkpoint = JSON.parse(JSON.stringify(step.state));
    if (step.kind === 'completed') break;
  }
  expect(delivery?.supportAudit).toHaveLength(1);
  expect(delivery?.supportAudit?.[0]).toMatchObject({ quoteStatus: scenario.status, quote: scenario.checked });
  const codes = delivery?.findings.map(({ code }) => code);
  expect(codes?.includes('DRAFT_CITATION_UNLINKED')).toBe(scenario.unlinked);
  expect(codes?.includes('CITATION_WITHOUT_SUPPORT')).toBe(scenario.status === 'MISMATCH');
});
