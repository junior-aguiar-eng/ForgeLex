import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { DeliveryTaskPlanSchema, TaskPlanSchema } from '@forgelex/legal-agents';
import { AgenticCaseTask } from './case-task.js';

it('retoma o verificador do checkpoint real v6 com contrato e leitura de fontes originais', async () => {
  const prior = JSON.parse(readFileSync(new URL('./fixtures/pre-bounded-v5.json', import.meta.url), 'utf8'));
  const state = JSON.parse(
    readFileSync(
      'docs/architecture/evidence/2026-11-02-delivery-failure-fix/real/D01-analyze-candidate.checkpoint.json',
      'utf8',
    ),
  );
  const task = new AgenticCaseTask({
    tools: [],
    context: { load: async () => prior.packet, assert: async () => {}, save: async () => ({ id: 'saved' }) },
    createProvider: ({ role, registry }) => {
      expect(role).toBe('authority-verifier');
      expect(registry.get('task.get_sources')).toBeDefined();
      const fake = new FakeAgentProvider(registry, undefined, [
        {
          toolCall: {
            name: 'task.submit',
            input: {
              coveredIssueIds: state.plan.issues.map((i: any) => i.id),
              claims: [],
              requirements: [],
              findings: [],
              supportChecks: [],
            },
          },
        },
      ]);
      return {
        id: 'fake',
        cancel: async () => {},
        run(input) {
          expect(input.finishOnTools).toEqual(['task.submit']);
          return fake.run(input);
        },
      };
    },
  });
  const resumed = await task.step(prior.binding, state, new AbortController().signal);
  expect(resumed.state.version).toBe(6);
  expect(resumed.state.contractHash).toBe(state.contractHash);
  expect(resumed.state.outputs['matter-analyst']).toEqual(state.outputs['matter-analyst']);
});

it.each([3, 4, 5])(
  'retoma checkpoint v%s capturado no motor anterior sem replanejar ou alterar o contrato',
  async (version) => {
    const prior = JSON.parse(
      readFileSync(
        new URL(`./fixtures/${version === 5 ? 'pre-bounded-v5' : `pre-delivery-v${version}`}.json`, import.meta.url),
        'utf8',
      ),
    );
    const roles: string[] = [];
    const task = new AgenticCaseTask({
      tools: [],
      context: { load: async () => prior.packet, assert: async () => {}, save: async () => ({ id: 'saved' }) },
      createProvider: ({ role, registry }) => {
        roles.push(role);
        const fake = new FakeAgentProvider(registry, undefined, [
          {
            toolCall: {
              name: 'task.submit',
              input: {
                coveredIssueIds: prior.state.plan.issues.map((i: any) => i.id),
                claims: [],
                findings: [],
                requirements: [],
                supportChecks: [],
              },
            },
          },
        ]);
        return {
          id: 'fake',
          cancel: async () => {},
          run: (input) => {
            expect(input.finishOnTools).toBeUndefined();
            return fake.run(input);
          },
        };
      },
    });
    const result = await task.step(prior.binding, prior.state, new AbortController().signal);
    expect(result.state.version).toBe(version);
    expect(result.state.contractHash).toBe(prior.state.contractHash);
    expect(result.state.plan).toEqual(prior.state.plan);
    expect(roles).toEqual(['matter-analyst']);
  },
);

it('o contrato novo aceita apenas classificações enumeradas sem alterar o plano histórico', () => {
  const prior = JSON.parse(readFileSync(new URL('./fixtures/pre-delivery-v4.json', import.meta.url), 'utf8')).state
    .plan;
  const gap = {
    key: 'missing',
    kind: 'MISSING',
    material: true,
    prompt: 'Dado?',
    reason: 'Não informado.',
    sourceIds: [],
    options: [],
  };
  expect(DeliveryTaskPlanSchema.parse({ ...prior, gaps: [gap] }).gaps[0]).toEqual(gap);
  expect(DeliveryTaskPlanSchema.safeParse({ ...prior, gaps: [{ ...gap, deliveryImpact: 'IGNORE' }] }).success).toBe(
    false,
  );
  expect(TaskPlanSchema.safeParse({ ...prior, gaps: [{ ...gap, deliveryImpact: 'LIMITATION' }] }).success).toBe(false);
});
