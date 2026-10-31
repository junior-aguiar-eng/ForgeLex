import { AGENT_TOOL_NAMES, readBounded, responseUsage, sdkCompatibleSse } from './provider-transport.js';
import { createHash, randomUUID } from 'node:crypto';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import { type AgentProvider, type NormalizedUsage } from '@forgelex/agent-core';
import type { AgenticOwner, TaskBinding } from '@forgelex/domain';
import type { InferenceBudgetService } from '@forgelex/billing-ledger';
import type { CaseTaskProviderInput } from '@forgelex/legal-workflows';

/** Pilot-only tariff, explicitly approved by Boni; no automatic production configuration. */
export const PILOT_POLICY = {
  id: 'boni-synthetic-task6',
  version: '2026-10-27',
  approvalReference: 'boni-task6',
  provider: 'openai',
  model: 'gpt-6.1-sol',
  maxCalls: 40,
  maxInputTokens: 140000,
  maxOutputTokens: 2048,
  inputCentsPerMillion: 200,
  outputCentsPerMillion: 1000,
  cachedInputCentsPerMillion: 10,
};
export interface PilotObservation {
  executionId: string;
  callId: string;
  requestHash: string;
  requestBytes: number;
  startedAt: string;
  durationMs: number;
  upperBoundCents: number;
  status: 'SETTLED' | 'RECONCILIATION_REQUIRED';
  usage?: NormalizedUsage;
  costCents?: number;
}
export interface PilotRuntimeOptions {
  owner: AgenticOwner;
  apiKey: string;
  budget: Pick<InferenceBudgetService, 'authorizeProviderCall' | 'settleProviderCall'>;
  approval: { provider: string; model: string; ceilingCents: number; reference: string };
  /** Must verify the execution and exact approved synthetic selection, on every HTTP request. */
  assertContext: (executionId: string, packet?: CaseTaskProviderInput['packet']) => Promise<void>;
  transport?: typeof globalThis.fetch;
  onRequest?: (executionId: string, body: Record<string, unknown>) => void;
  onProviderError?: (code: string, message: string) => void;
}
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const cost = (input: number, output: number, cached = 0) =>
  Math.ceil(((input - cached) * 200 + cached * 10 + output * 1000) / 1000000);
export function createPilotOpenAIRuntime(options: PilotRuntimeOptions) {
  const a = options.approval;
  if (
    a.provider !== 'openai' ||
    a.model !== 'gpt-6.1-sol' ||
    a.ceilingCents !== 500 ||
    a.reference !== PILOT_POLICY.approvalReference ||
    !options.apiKey.trim()
  )
    throw new Error('PILOT_APPROVAL_INVALID');
  const observations: PilotObservation[] = [];
  const providers = new WeakSet<AgentProvider>();
  const fetchFor =
    (executionId: string, packet?: CaseTaskProviderInput['packet']): typeof globalThis.fetch =>
    async (url, init) => {
      if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('PILOT_DESTINATION_INVALID');
      if (init?.signal?.aborted) throw new Error('SESSION_CANCELLED');
      await options.assertContext(executionId, packet);
      let body: any;
      try {
        body = JSON.parse(String(init?.body));
      } catch {
        throw new Error('PILOT_REQUEST_INVALID');
      }
      if (
        init?.method !== 'POST' ||
        body.model !== a.model ||
        body.stream !== true ||
        body.previous_response_id ||
        body.conversation ||
        body.background ||
        body.prompt ||
        body.context_management ||
        body.prompt_cache_key ||
        JSON.stringify(body).includes('prompt_cache_breakpoint') ||
        (body.tools ?? []).some((t: any) => t.type !== 'function' || !AGENT_TOOL_NAMES.includes(t.name))
      )
        throw new Error('PILOT_REQUEST_INVALID');
      body.max_output_tokens = 2048;
      body.reasoning = { effort: 'low' };
      body.service_tier = 'default';
      body.store = false;
      // Native context assertions use write locks; the pilot executes one tool at a time.
      body.parallel_tool_calls = false;
      // Explicit mode without breakpoints disables cache reads and writes for this bounded pilot.
      body.prompt_cache_options = { mode: 'explicit' };
      const serialized = JSON.stringify(body),
        requestBytes = Buffer.byteLength(serialized);
      if (requestBytes > 64000) throw new Error('PILOT_REQUEST_INVALID');
      // UTF-8 bytes bound text tokens conservatively; margin also covers framing/system/schema tokens.
      const inputTokens = requestBytes * 2 + 8192,
        upperBoundCents = cost(inputTokens, 2048);
      const callId = randomUUID(),
        startedAt = new Date().toISOString(),
        started = Date.now();
      const observation: PilotObservation = {
        executionId,
        callId,
        requestHash: hash(serialized),
        requestBytes,
        startedAt,
        durationMs: 0,
        upperBoundCents,
        status: 'RECONCILIATION_REQUIRED',
      };
      const authorization = await options.budget.authorizeProviderCall(options.owner, executionId, {
        callId,
        upperBoundCents,
        inputTokens,
        maxOutputTokens: 2048,
      });
      if (!authorization.shouldExecute) throw new Error('CALL_ALREADY_AUTHORIZED');
      observations.push(observation);
      try {
        options.onRequest?.(executionId, body);
        let response: Response;
        try {
          response = await (options.transport ?? globalThis.fetch)(url, {
            ...init,
            body: serialized,
            redirect: 'error',
          });
        } catch {
          throw new Error('PILOT_TRANSPORT_FAILED');
        }
        if (!response.ok) throw new Error(`PILOT_HTTP_${response.status}`);
        const text = await readBounded(response),
          usage = responseUsage(text, a.model),
          compatible = sdkCompatibleSse(text);
        const costCents = cost(usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);
        const settlement = await options.budget.settleProviderCall(options.owner, executionId, {
          callId,
          usage,
          actualCostCents: costCents,
        });
        if (settlement.status !== 'SETTLED') throw new Error('PILOT_RESPONSE_INVALID');
        Object.assign(observation, { status: 'SETTLED', usage, costCents });
        return new Response(compatible, { status: response.status, headers: { 'content-type': 'text/event-stream' } });
      } catch (error) {
        await options.budget.settleProviderCall(options.owner, executionId, {
          callId,
          usage: null,
          actualCostCents: null,
        });
        throw error;
      } finally {
        observation.durationMs = Date.now() - started;
      }
    };
  return {
    observations,
    fetchFor,
    createProvider(input: CaseTaskProviderInput) {
      const inner = new OpenAIAgentProvider({
        apiKey: options.apiKey,
        model: a.model,
        fetch: fetchFor(input.binding.executionId, input.packet),
      });
      const provider: AgentProvider = {
        id: 'openai',
        cancel: (id) => inner.cancel(id),
        async *run(input) {
          for await (const event of inner.run(input)) {
            if (event.type === 'error') options.onProviderError?.(event.code, event.message);
            yield event;
          }
        },
      };
      providers.add(provider);
      return provider;
    },
    async authorizeRealProvider(binding: TaskBinding, provider: AgentProvider) {
      if (
        !providers.has(provider) ||
        binding.tenantId !== options.owner.tenantId ||
        binding.userId !== options.owner.userId
      )
        throw new Error('REAL_PROVIDER_NOT_ENABLED');
      await options.assertContext(binding.executionId);
    },
  };
}
