import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { AgenticCaseTask } from './case-task.js';

const legacy = JSON.parse(readFileSync(new URL('./fixtures/pre-evidence-v2.json', import.meta.url), 'utf8'));
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const approvedItem = {
  deliveryId: 'delivery:origin',
  itemId: 'a'.repeat(64),
  targetId: 'e06c58d9-0664-4bcb-a0c1-76fc9c54a439',
  kind: 'FACT' as const,
  text: 'Alegação revisada e controvertida.',
  status: 'DISPUTED' as const,
  decidedBy: 'boni',
  decidedAt: '2026-11-01T00:00:00.000Z',
  receiptHash: 'b'.repeat(64),
  sources: [],
};
const source = {
  id: 'approved:fact',
  kind: 'CASE_FACT' as const,
  text: JSON.stringify(approvedItem),
  contentHash: hash(JSON.stringify(approvedItem)),
  approvedItem,
};
it.each(['create_document', 'review_text'] as const)(
  'usa contexto aprovado no %s, preserva revisão humana e retoma sem repetir etapas',
  async (action) => {
    const roles: string[] = [],
      deliveries: any[] = [];
    const issue = { id: 'issue', statement: 'Relato controvertido', sourceIds: [source.id] };
    const claim = { id: 'claim', statement: approvedItem.text, classification: 'CONFLICT', sourceIds: [source.id] };
    const task = new AgenticCaseTask({
      tools: [],
      context: {
        load: async () => ({ ...legacy.packet, sources: [source] }),
        assert: async () => {},
        save: async (_b, d) => {
          deliveries.push(d);
          return { id: 'saved' };
        },
      },
      createProvider: ({ role, registry, packet }) => {
        roles.push(role);
        expect(packet.sources).toContainEqual(source);
        const output =
          role === 'legal-orchestrator'
            ? {
                ...legacy.state.plan,
                action,
                documentPurpose: 'FACTUAL_RECORD',
                documentType: 'Registro de fatos',
                issues: [issue],
              }
            : {
                coveredIssueIds: ['issue'],
                claims: [claim],
                requirements: [],
                findings: [],
                supportChecks: [],
                ...(role === 'legal-drafter'
                  ? {
                      document: {
                        title: 'Relato',
                        documentType: 'Registro de fatos',
                        sections: [{ title: 'Fatos', content: approvedItem.text, sourceIds: [source.id] }],
                      },
                    }
                  : {}),
              };
        return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input: output } }]);
      },
    });
    const binding = { ...legacy.binding, actionId: action };
    let result = await task.step(binding, undefined, new AbortController().signal);
    expect(result.state.version).toBe(8);
    for (let i = 0; i < 10 && result.kind === 'checkpoint'; i++)
      result = await task.step(binding, JSON.parse(JSON.stringify(result.state)), new AbortController().signal);
    expect(result.kind).toBe('completed');
    expect(roles.filter((r) => r === 'legal-orchestrator')).toHaveLength(1);
    expect(roles).toContain('adversarial-reviewer');
    expect(deliveries[0]).toMatchObject({
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      sources: [expect.objectContaining({ approvedItem })],
    });
    expect(Boolean(deliveries[0].document)).toBe(action === 'create_document');
  },
);
