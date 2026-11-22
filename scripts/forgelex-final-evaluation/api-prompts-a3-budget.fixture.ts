import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRunInput } from '@forgelex/agent-core';
import { COMMERCIAL_POLICY, commercialProviderPrice, commercialInferenceProfile } from '@forgelex/billing-ledger';
import {
  createOfflineProfiledOpenAIRuntime,
  createCommercialOpenAIRuntime,
  type CommercialProviderOptions,
} from '../../apps/api/src/agentic-workspace/commercial-provider.js';
import type { CaseTaskProviderInput } from '@forgelex/legal-workflows';

const arms = {
  'prompts-current': { prompts: 'current', profileSet: undefined },
  'prompts-revised': { prompts: 'revised', profileSet: undefined },
  'profiles-fixed': { prompts: 'selected', profileSet: 'a2-output-v1' },
  'profiles-by-role': { prompts: 'selected', profileSet: 'a2-roles-v1' },
} as const;
const armId = process.env.FORGELEX_A3_ARM;
const directory = process.env.FORGELEX_A3_OFFLINE_DIRECTORY;
const selected = process.env.FORGELEX_A3_SELECTED_PROMPTS ?? 'revised';

if (armId && (!Object.hasOwn(arms, armId) || !directory || !['current', 'revised'].includes(selected)))
  throw new Error('A3_OFFLINE_CONFIGURATION_INVALID');
const arm = armId ? arms[armId as keyof typeof arms] : undefined;
export const a3Arm = arm ? { ...arm, prompts: arm.prompts === 'selected' ? selected : arm.prompts } : undefined;

const scenarios: unknown[] = [];
export async function stageA3Role(id: string, input: CaseTaskProviderInput, request: AgentRunInput) {
  if (!a3Arm) throw new Error('A3_OFFLINE_CONFIGURATION_INVALID');
  const profile = a3Arm.profileSet
    ? commercialInferenceProfile({ set: a3Arm.profileSet, role: input.role })
    : COMMERCIAL_POLICY;
  let probe:
    | {
        bytes: number;
        maxOutputTokens: number;
        inputTokenBound: number;
        reserveMicroUsd: number;
        lowEstimateMicroUsd: number;
        highEstimateMicroUsd: number;
        simulatedMicroUsd: number;
      }
    | undefined;
  let calls = 0;
  let upperBound = 0;
  let inputBound = 0;
  let settled = false;
  const finance = {
    async authorizeCall(_owner, _run, call) {
      upperBound = call.upperBoundMicroUsd;
      inputBound = call.inputTokens;
      return { shouldExecute: true };
    },
    async settleCall(_owner, _run, _call, usage) {
      settled = true;
      return {
        status: 'SETTLED',
        actualMicroUsd: commercialProviderPrice(profile, usage.inputTokens, usage.outputTokens),
      };
    },
    async markUncertain() {
      throw new Error('A3_SIMULATED_USAGE_UNCERTAIN');
    },
    async markNotDispatched() {
      throw new Error('A3_SIMULATED_NOT_DISPATCHED');
    },
  } as CommercialProviderOptions['finance'];
  const transport: typeof fetch = async (_url, init) => {
    if (++calls !== 1 || upperBound === 0) throw new Error('A3_PROBE_SEQUENCE_INVALID');
    const wire = String(init?.body);
    const body = JSON.parse(wire);
    if (
      body.model !== profile.model ||
      body.max_output_tokens !== profile.maxOutputTokens ||
      body.store !== false ||
      body.parallel_tool_calls !== false ||
      body.prompt_cache_options?.mode !== 'explicit'
    )
      throw new Error('A3_WIRE_CONFIGURATION_INVALID');
    const bytes = Buffer.byteLength(wire);
    // Planning assumptions only. Real handoffs and their context may exceed both estimates.
    const typicalInput = Math.ceil(bytes / 4);
    const stressInput = Math.ceil(bytes / 2);
    probe = {
      bytes,
      maxOutputTokens: body.max_output_tokens,
      inputTokenBound: inputBound,
      reserveMicroUsd: upperBound,
      lowEstimateMicroUsd: commercialProviderPrice(profile, typicalInput, Math.min(512, body.max_output_tokens)),
      highEstimateMicroUsd: commercialProviderPrice(profile, stressInput, body.max_output_tokens),
      simulatedMicroUsd: commercialProviderPrice(profile, 100, 10),
    };
    if (
      input.role === 'legal-orchestrator' &&
      JSON.parse(body.instructions.split('\n\n')[0]).boundAction?.actionId !== input.binding.actionId
    )
      throw new Error('A3_WIRE_ACTION_MISMATCH');
    return new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_a3_offline',
            model: profile.model,
            usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
          },
        }) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  };
  const options = {
    finance,
    transport,
    assertContext: async () => ({ tenantId: 'synthetic', userId: 'offline' }),
    recordCall: async () => {},
  };
  const runtime = a3Arm.profileSet
    ? createOfflineProfiledOpenAIRuntime({ ...options, profileSet: a3Arm.profileSet })
    : createCommercialOpenAIRuntime({ ...options, apiKey: 'synthetic-a3' });
  for await (const _ of runtime.createProvider(input).run(request)) {
    // This probe records the first wire request. The separate fake workflow provides the handoff.
  }
  if (!probe || !settled) throw new Error('A3_PROBE_MISSING');
  scenarios.push({
    id,
    role: input.role,
    model: profile.model,
    ...probe,
    policyHash: createHash('sha256')
      .update(request.systemPolicy ?? '')
      .digest('hex'),
  });
}

export function a3Reports() {
  if (!a3Arm || !directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, armId + '-calls.json'), JSON.stringify({ arm: a3Arm, scenarios }, null, 2) + '\n');
}
