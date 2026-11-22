import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  COMMERCIAL_POLICY,
  commercialCallUpperBound,
  commercialProviderPrice,
  commercialInferenceProfile,
  CommercialInferenceRoleSchema,
} from '@forgelex/billing-ledger';
import type { CaseTaskProviderInput } from '@forgelex/legal-workflows';
import {
  createCommercialOpenAIRuntime,
  createOfflineProfiledOpenAIRuntime,
  createProfiledEvaluationOpenAIRuntime,
  type CommercialProviderOptions,
} from '../../apps/api/src/agentic-workspace/commercial-provider.js';
import { EvaluationBudget } from './budget.mjs';

const directory = process.env.FORGELEX_A3_PHASE1_DIRECTORY;
const arm = process.env.FORGELEX_A3_ARM;
const mode = process.env.FORGELEX_A3_PHASE1_MODE;
const scenario = process.env.FORGELEX_A3_PHASE1_SCENARIO;
const wireFetch = globalThis.fetch;
const profileSet = arm === 'profiles-fixed' ? 'a2-output-v1' : arm === 'profiles-by-role' ? 'a2-roles-v1' : undefined;
const phaseArms = profileSet ? ['profiles-fixed', 'profiles-by-role'] : ['prompts-current', 'prompts-revised'];
export const phase1 = Boolean(directory);

export function runPhase1(
  id: string,
  inputHash: string,
  run: (
    runtime: ReturnType<typeof createCommercialOpenAIRuntime>,
    signal: AbortSignal,
  ) => Promise<{ outcome: 'completed' | 'question' | 'failed'; [key: string]: unknown }>,
  mockSubmission: (role: string, context: CaseTaskProviderInput['packet']) => unknown,
  hasSearch: boolean,
) {
  if (
    !directory ||
    !['real', 'mock'].includes(mode ?? '') ||
    !phaseArms.includes(arm ?? '') ||
    (profileSet && scenario)
  )
    throw new Error('A3_PHASE1_CONFIG_INVALID');
  const bytes = readFileSync(join(directory, 'packet.json'));
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  const packet = JSON.parse(String(bytes));
  if (scenario && (scenario !== id || (mode === 'real' && scenario !== 'A04')))
    throw new Error('A3_PHASE1_CONFIG_INVALID');
  const approval = profileSet
    ? 'boni-phase2-16-usd-4.00'
    : scenario === 'A04'
      ? 'boni-phase1-a04-2-usd-0.60'
      : 'boni-phase1-16-usd-3.50';
  if (profileSet && packet.selectedPromptsForDryRun !== 'revised') throw new Error('A3_REVISED_PROMPTS_REQUIRED');
  if (mode === 'real' && (process.env.FORGELEX_A3_PHASE1_APPROVAL !== approval || !process.env.OPENAI_API_KEY?.trim()))
    throw new Error('A3_PHASE1_APPROVAL_OR_KEY_REQUIRED');
  const runs = packet.runs.filter((entry) => phaseArms.includes(entry.arm) && (!scenario || entry.id === scenario));
  const runId = arm + '/' + id;
  if (runs.length !== (scenario ? 2 : 16) || runs.find((entry) => entry.runId === runId)?.inputHash !== inputHash)
    throw new Error('A3_PHASE1_INPUT_MISMATCH');

  return execute();
  async function execute() {
    const budget = new EvaluationBudget({
      directory,
      fingerprint: fingerprint + '/' + mode,
      runIds: runs.map((entry) => entry.runId),
      cap: profileSet ? 4000000 : scenario === 'A04' ? 600000 : 3500000,
      runCap: COMMERCIAL_POLICY.maxInferenceMicroUsd,
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = performance.now();
    const owner = { tenantId: 'synthetic', userId: 'offline' };
    const file = join(directory, runId.replace('/', '-') + '.result.json');
    let currentRole = '';
    const settings = () =>
      profileSet
        ? commercialInferenceProfile({ set: profileSet, role: CommercialInferenceRoleSchema.parse(currentRole) })
        : { ...COMMERCIAL_POLICY, effort: 'low' };
    let reservedCallId = '';
    let sentAt = 0;
    const traces: unknown[] = [];
    const result = (value) =>
      writeFileSync(
        file,
        JSON.stringify(
          {
            runId,
            ...value,
            elapsedMs: Math.round(performance.now() - start),
            ledger: budget.summary(),
            traces,
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
    try {
      if (budget.summary().unresolved || budget.state.runs[runId]) return;
      budget.begin(runId);
      timer = setTimeout(() => controller.abort(), COMMERCIAL_POLICY.maxDurationMs);
      const finance = {
        async authorizeCall(received, _executionId, call) {
          const profile = settings();
          if (
            received.tenantId !== owner.tenantId ||
            received.userId !== owner.userId ||
            _executionId !== id ||
            call.maxOutputTokens !== profile.maxOutputTokens ||
            (profileSet && (call.profile?.set !== profileSet || call.profile.role !== currentRole)) ||
            call.upperBoundMicroUsd !== commercialCallUpperBound(profile, call.inputTokens, call.maxOutputTokens)
          )
            throw new Error('A3_RESERVATION_MISMATCH');
          const shouldExecute = budget.reserve(runId, call.callId, call.upperBoundMicroUsd);
          if (shouldExecute) reservedCallId = call.callId;
          return { shouldExecute };
        },
        async settleCall(_owner, _id, callId, usage) {
          const actualMicroUsd = commercialProviderPrice(
            settings(),
            usage.inputTokens,
            usage.outputTokens,
            usage.cachedInputTokens,
          );
          budget.settle(runId, callId, actualMicroUsd, usage);
          return { status: 'SETTLED', actualMicroUsd };
        },
        async markUncertain(_owner, _id, callId) {
          budget.uncertain(runId, callId);
        },
        async markNotDispatched(_owner, _id, callId) {
          budget.void(runId, callId);
        },
      } as CommercialProviderOptions['finance'];
      const transportOptions = {
        finance,
        assertContext: async (received: string) => {
          if (received !== id || controller.signal.aborted) throw new Error('SESSION_CANCELLED');
          budget.assertActive(runId);
          return owner;
        },
        recordCall: async (event: Parameters<NonNullable<CommercialProviderOptions['recordCall']>>[0]) => {
          const record = {
            ...event,
            runId,
            role: currentRole,
            ...(event.phase === 'SETTLED'
              ? {
                  elapsedMs: Math.round(performance.now() - sentAt),
                  actualMicroUsd: budget.state.runs[runId].calls[event.callId].actual,
                }
              : {}),
          };
          appendFileSync(join(directory, 'call-trace.jsonl'), JSON.stringify(record) + '\n', { flush: true });
          traces.push(record);
        },
        transport: (async (url, init) => {
          const callId = new Headers(init?.headers).get('X-Client-Request-Id');
          if (
            String(url) !== 'https://api.openai.com/v1/responses' ||
            !callId ||
            callId !== reservedCallId ||
            budget.state.runs[runId].calls[callId]?.status !== 'RESERVED'
          )
            throw new Error('A3_DISPATCH_NOT_RESERVED');
          const body = JSON.parse(String(init?.body));
          const profile = settings();
          if (
            body.model !== profile.model ||
            body.max_output_tokens !== profile.maxOutputTokens ||
            body.reasoning?.effort !== profile.effort ||
            body.store !== false ||
            body.parallel_tool_calls !== false ||
            body.prompt_cache_options?.mode !== 'explicit' ||
            body.service_tier !== 'default'
          )
            throw new Error('A3_WIRE_MISMATCH');
          const policy = JSON.parse(body.instructions.split('\n\n')[0]);
          currentRole = policy.profile.role;
          sentAt = performance.now();
          if (mode === 'real') return wireFetch(url, init);
          if (
            id === 'A04' &&
            currentRole === 'legal-orchestrator' &&
            (policy.researchHandoff?.role !== 'legal-researcher' ||
              policy.researchHandoff?.tool !== 'research.search_case_law' ||
              policy.researchHandoff?.planField !== 'requiresCaseLaw')
          )
            throw new Error('A3_RESEARCH_HANDOFF_MISSING');
          const user = body.input.find((item) => item.role === 'user');
          const context = JSON.parse(
            typeof user.content === 'string'
              ? user.content
              : user.content.find((item) => item.type === 'input_text').text,
          ).untrustedContext;
          const name = body.tools.find((tool) => tool.name.includes('search_case_law'))?.name;
          const runSearch =
            hasSearch &&
            currentRole === 'legal-researcher' &&
            name &&
            !body.input.some((item) => item.type === 'function_call' && item.name === name);
          return simulatedResponse(
            body,
            runSearch ? {} : mockSubmission(currentRole, context),
            runSearch ? name : 'forgelex_task_submit',
          );
        }) as typeof fetch,
      };
      const runtime = profileSet
        ? mode === 'real'
          ? createProfiledEvaluationOpenAIRuntime({
              ...transportOptions,
              profileSet,
              apiKey: process.env.OPENAI_API_KEY!,
            })
          : createOfflineProfiledOpenAIRuntime({ ...transportOptions, profileSet })
        : createCommercialOpenAIRuntime({
            ...transportOptions,
            apiKey: mode === 'real' ? process.env.OPENAI_API_KEY! : 'synthetic-phase1',
          });
      const createProvider = (input: CaseTaskProviderInput) => {
        currentRole = input.role;
        return runtime.createProvider(input);
      };
      try {
        const outcome = await run({ ...runtime, createProvider }, controller.signal);
        budget.finish(runId, outcome.outcome);
        result(outcome);
      } catch (error) {
        budget.finish(runId, 'failed');
        result({
          outcome: 'failed',
          errorCode:
            error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'A3_WORKFLOW_FAILED',
          diagnostic: error && typeof error === 'object' && 'diagnostic' in error ? error.diagnostic : undefined,
        });
      }
    } finally {
      clearTimeout(timer);
      budget.close();
    }
  }
}
export function simulatedResponse(body, submission, name) {
  const id = randomUUID();
  const item = {
    id: 'fc_' + id,
    type: 'function_call',
    status: 'completed',
    call_id: 'call_' + id,
    name,
    arguments: JSON.stringify(submission),
  };
  const response = {
    id: 'resp_' + id,
    object: 'response',
    created_at: 1793664000,
    model: body.model,
    service_tier: 'default',
    status: 'completed',
    output: [item],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    parallel_tool_calls: false,
    tool_choice: 'auto',
    tools: body.tools,
  };
  const frames = [
    { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response },
  ];
  return new Response(
    frames
      .map(
        (frame, sequence_number) => `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
