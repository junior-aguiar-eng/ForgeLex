import { expect, it, vi } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import {
  commercialCallUpperBound,
  commercialInferenceProfile,
  commercialProviderPrice,
} from '@forgelex/billing-ledger';
import { getAuthorityTool, verifyAuthorityTool } from '@forgelex/legal-tools';
import {
  createOfflineProfiledOpenAIRuntime,
  type CommercialProviderOptions,
} from '../../apps/api/src/agentic-workspace/commercial-provider.js';
import { simulatedResponse } from './api-prompts-a3-phase1.fixture.js';

it('compares valid authority handoffs in equal Terra profiles and budgets each one-call probe', async () => {
  const rows = [];
  const owner = { tenantId: 'synthetic', userId: 'offline' };
  const profileSet = 'a2-roles-v1';
  for (const strict of [false, true]) {
    for (const tool of [getAuthorityTool, verifyAuthorityTool]) {
      for (const judgmentDate of [undefined, '2026-01-15']) {
        const role = tool.name === 'research.get_authority' ? 'legal-researcher' : 'authority-verifier';
        const profile = commercialInferenceProfile({ set: profileSet, role });
        const input = { court: 'STJ', processNumber: 'SYNTHETIC-01', ...(judgmentDate ? { judgmentDate } : {}) };
        const objective = `Use a ferramenta ${tool.name} para consultar STJ, referência sintética SYNTHETIC-01. ${judgmentDate ? 'Data informada: ' + judgmentDate : 'A data é desconhecida.'}`;
        const packet = {
          contextId: 'fixture',
          contextRevision: 1,
          sources: [],
          answers: [],
          objective,
          priorResults: {},
        };
        const binding = { ...owner, executionId: 'fixture', conversationId: 'fixture', contextRevision: 1, objective };
        const registry = new ToolRegistry();
        const execute = vi.fn(async () => ({
          success: true,
          data: { status: 'NOT_FOUND', checkedAt: '2026-11-17T12:00:00.000Z' },
        }));
        registry.register({ ...tool, execute });
        const reserve = vi.fn(async (_owner, _id, _call) => ({ shouldExecute: true }));
        const settle = vi.fn(async () => ({ status: 'SETTLED' }));
        const runtime = createOfflineProfiledOpenAIRuntime({
          profileSet,
          strictEvaluationTools: strict,
          finance: {
            authorizeCall: reserve,
            settleCall: settle,
            markNotDispatched: vi.fn(),
            markUncertain: vi.fn(),
          } as unknown as CommercialProviderOptions['finance'],
          assertContext: async () => owner,
          recordCall: async () => {},
          transport: async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            const [wireTool] = body.tools;
            const bytes = Buffer.byteLength(String(init?.body));
            expect(reserve).toHaveBeenCalledTimes(1);
            expect(reserve.mock.calls[0][2].upperBoundMicroUsd).toBe(
              commercialCallUpperBound(profile, bytes + 8192, profile.maxOutputTokens),
            );
            expect(body).toMatchObject({
              model: profile.model,
              max_output_tokens: profile.maxOutputTokens,
              reasoning: { effort: profile.effort },
              store: false,
              parallel_tool_calls: false,
              prompt_cache_options: { mode: 'explicit' },
            });
            expect(wireTool.strict).toBe(strict);
            expect(wireTool.parameters.required.includes('judgmentDate')).toBe(strict);
            rows.push({
              arm: strict ? 'strict' : 'current',
              role,
              dateKnown: Boolean(judgmentDate),
              estimateLow: commercialProviderPrice(profile, Math.ceil(bytes / 4), 256),
              estimateHigh: commercialProviderPrice(profile, Math.ceil(bytes / 2), profile.maxOutputTokens),
              reserve: reserve.mock.calls[0][2].upperBoundMicroUsd,
            });
            return simulatedResponse(
              body,
              strict && !judgmentDate ? { ...input, judgmentDate: null } : input,
              wireTool.name,
            );
          },
        });
        const provider = runtime.createProvider({ binding, role, registry, selectedPacket: packet, packet });
        const events = [];
        for await (const event of provider.run({
          ...owner,
          sessionId: 'fixture',
          prompt: objective,
          systemPolicy: JSON.stringify({ profile: { instructions: 'Use somente os dados do pedido sintético.' } }),
          tools: registry.list(),
          finishOnTools: [tool.name],
          maxTurns: 1,
          abortSignal: new AbortController().signal,
        }))
          events.push(event);
        expect(execute).toHaveBeenCalledExactlyOnceWith(input, expect.anything());
        expect(settle).toHaveBeenCalledOnce();
        expect(events.some((event) => event.type === 'error')).toBe(false);
      }
    }
  }
  expect(rows).toHaveLength(8);
  if (process.env.FORGELEX_A3_EXPERIMENT_BUDGET === '1') console.log(JSON.stringify({ schemas: rows }));
});
