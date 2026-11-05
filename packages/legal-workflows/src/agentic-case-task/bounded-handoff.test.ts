import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { AgenticCaseTask } from './case-task.js';
import { boundedTaskResultSchema } from '@forgelex/legal-agents';

const text = 'Relato sintético.';
const packet = {
  contextId: 'c',
  contextRevision: 1,
  answers: [],
  sources: [
    { id: 's', kind: 'USER_TEXT' as const, text, contentHash: createHash('sha256').update(text).digest('hex') },
  ],
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
  requiresProcedure: false,
  issues: [{ id: 'i', statement: 'Questão', sourceIds: ['s'] }],
  gaps: [],
};
const result = { coveredIssueIds: ['i'], claims: [], findings: [], requirements: [], supportChecks: [] };

it('keeps the observed D04 substantive analysis but reserves its duplicated matrix for evidence analysis', () => {
  const historical = JSON.parse(
    readFileSync(
      'docs/architecture/evidence/2026-11-02-delivery-gaps-calibration/real/D04-create-candidate.checkpoint.json',
      'utf8',
    ),
  ).outputs['matter-analyst'];
  expect(historical.evidenceAnalysis.rows.length).toBeGreaterThan(0);
  expect(boundedTaskResultSchema('create_document', 'matter-analyst').safeParse(historical).success).toBe(false);
  const { evidenceAnalysis: _matrix, ...scoped } = historical;
  expect(boundedTaskResultSchema('create_document', 'matter-analyst').parse(scoped)).toEqual(scoped);
  expect(boundedTaskResultSchema('analyze_evidence', 'matter-analyst').parse(historical)).toEqual(historical);
});

it('new tasks request a terminal handoff and exclude the evidence matrix outside evidence analysis', async () => {
  const inputs: any[] = [],
    schemas: any[] = [];
  const task = new AgenticCaseTask({
    tools: [],
    context: { load: async () => packet, assert: async () => {}, save: async () => ({ id: 'saved' }) },
    createProvider: ({ role, registry }) => {
      schemas.push({ role, schema: registry.get('task.submit')!.inputSchema });
      const fake = new FakeAgentProvider(registry, undefined, [
        { toolCall: { name: 'task.submit', input: role === 'legal-orchestrator' ? plan : result } },
      ]);
      return {
        id: 'fake',
        cancel: async () => {},
        run: (input) => {
          inputs.push(input);
          return fake.run(input);
        },
      };
    },
  });
  const first = await task.step(binding, undefined, new AbortController().signal);
  const second = await task.step(binding, first.state, new AbortController().signal);
  expect(second.state.version).toBe(8);
  expect(inputs.every((i) => i.finishOnTools?.[0] === 'task.submit')).toBe(true);
  const schema = schemas.find((s) => s.role === 'matter-analyst').schema;
  expect(schema.safeParse(result).success).toBe(true);
  expect(
    schema.safeParse({ ...result, evidenceAnalysis: { rows: [], chronology: [], contradictions: [], gaps: [] } })
      .success,
  ).toBe(false);
});

it('preserves only enumerated failure details through the workflow, never raw messages', async () => {
  const task = new AgenticCaseTask({
    tools: [],
    context: { load: async () => packet, assert: async () => {}, save: async () => ({ id: 'saved' }) },
    createProvider: () => ({
      id: 'fake',
      cancel: async () => {},
      async *run() {
        yield {
          type: 'error',
          sessionId: 'x',
          code: 'OPENAI_AGENT_ERROR',
          message: 'secret-token and confidential source',
          details: { failureCode: 'BUDGET_EXCEEDED', errorType: 'APIConnectionError', raw: 'private prompt' },
          timestamp: new Date().toISOString(),
        };
      },
    }),
  });
  const error = await task.step(binding, undefined, new AbortController().signal).catch((e) => e);
  expect(error.message).toBe('OPENAI_AGENT_ERROR');
  expect(error.diagnostic).toEqual({
    failureCode: 'BUDGET_EXCEEDED',
    errorType: 'APIConnectionError',
    role: 'legal-orchestrator',
  });
  expect(JSON.stringify(error)).not.toMatch(/secret-token|confidential|private prompt/);
});
