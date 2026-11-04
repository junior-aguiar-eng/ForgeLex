import { expect, it, vi } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { AgenticCaseTask } from './case-task.js';
it('persists the initial checkpoint before a simulated provider failure, without saving a delivery', async () => {
  const save = vi.fn(),
    persistCheckpoint = vi.fn();
  const task = new AgenticCaseTask({
    context: {
      load: async () => ({ contextId: 'c', contextRevision: 1, sources: [], answers: [] }),
      assert: async () => {},
      save,
    },
    tools: [],
    persistCheckpoint,
    createProvider: () =>
      ({
        id: 'fake',
        async *run() {
          yield {
            type: 'error',
            code: 'OPENAI_AGENT_ERROR',
            message: 'redacted',
            details: { errorType: 'Error', failureClass: 'TRANSIENT_TRANSPORT' },
          };
        },
      }) as any,
  } as any);
  const binding = {
    tenantId: 't',
    userId: 'u',
    executionId: 'e',
    conversationId: 'c',
    contextRevision: 1,
    objective: 'Analisar',
    actionId: 'analyze_documents' as const,
  };
  await expect(task.step(binding, undefined, new AbortController().signal)).rejects.toMatchObject({
    message: 'OPENAI_AGENT_ERROR',
    diagnostic: { failureClass: 'TRANSIENT_TRANSPORT' },
  });
  expect(persistCheckpoint).toHaveBeenCalledOnce();
  expect(persistCheckpoint.mock.calls[0][1]).toMatchObject({ version: 8, outputs: {}, profiles: [] });
  expect(save).not.toHaveBeenCalled();
});
it('keeps completed draft work in the persisted checkpoint when the next role fails', async () => {
  const checkpoints: any[] = [];
  let calls = 0;
  const plan = {
    action: 'create_document',
    requiresCaseLaw: false,
    requiresNorms: false,
    requiresProcedure: false,
    documentPurpose: 'FACTUAL_RECORD',
    documentType: 'Registro',
    issues: [],
    gaps: [],
  };
  const empty = { coveredIssueIds: [], claims: [], requirements: [], findings: [], supportChecks: [] };
  const task = new AgenticCaseTask({
    context: {
      load: async () => ({ contextId: 'c', contextRevision: 1, sources: [], answers: [] }),
      assert: async () => {},
      save: vi.fn(),
    },
    tools: [],
    persistCheckpoint: async (_b: any, s: any) => {
      checkpoints.push(structuredClone(s));
    },
    createProvider: ({ role, registry }: any) => {
      calls++;
      if (role === 'adversarial-reviewer')
        return {
          id: 'fake',
          async *run() {
            yield {
              type: 'error',
              code: 'OPENAI_AGENT_ERROR',
              message: 'redacted',
              details: { errorType: 'Error', failureClass: 'TRANSIENT_TRANSPORT' },
            };
          },
        } as any;
      return new FakeAgentProvider(registry, undefined, [
        {
          toolCall: {
            name: 'task.submit',
            input:
              role === 'legal-orchestrator'
                ? plan
                : {
                    ...empty,
                    ...(role === 'legal-drafter'
                      ? {
                          document: {
                            title: 'Registro',
                            documentType: 'Registro',
                            sections: [{ title: 'Fatos', content: 'Lacunas expressas.', sourceIds: [] }],
                          },
                        }
                      : {}),
                  },
          },
        },
      ]);
    },
  } as any);
  const binding = {
    tenantId: 't',
    userId: 'u',
    executionId: 'e',
    conversationId: 'c',
    contextRevision: 1,
    objective: 'Registrar',
    actionId: 'create_document' as const,
  };
  let state: any;
  for (let i = 0; i < 3; i++) state = (await task.step(binding, state, new AbortController().signal)).state;
  await expect(task.step(binding, state, new AbortController().signal)).rejects.toMatchObject({
    message: 'OPENAI_AGENT_ERROR',
    diagnostic: { failureClass: 'TRANSIENT_TRANSPORT' },
  });
  expect(checkpoints.at(-1)?.outputs['legal-drafter'].document.sections[0].content).toBe('Lacunas expressas.');
  expect(checkpoints.at(-1)).toEqual(state);
  expect(calls).toBe(4);
});
