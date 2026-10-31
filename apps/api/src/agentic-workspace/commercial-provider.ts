import { randomUUID } from 'node:crypto';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import type { AgentProvider } from '@forgelex/agent-core';
import type { AgenticOwner, TaskBinding } from '@forgelex/domain';
import { COMMERCIAL_POLICY, type CommercialInferenceService } from '@forgelex/billing-ledger';
import type { CaseTaskProviderInput } from '@forgelex/legal-workflows';
import { AGENT_TOOL_NAMES, readBounded, responseUsage, sdkCompatibleSse } from './provider-transport.js';

/** The commercial policy is the single source of truth for the model, its rates and its output ceiling. */
export const COMMERCIAL_MODEL = COMMERCIAL_POLICY.model;
export interface CommercialProviderOptions {
  apiKey: string;
  finance: Pick<CommercialInferenceService, 'authorizeCall' | 'settleCall' | 'markUncertain' | 'markNotDispatched'>;
  /** Rechecks live account, execution, reservation and selected-source snapshot before each HTTP. */
  assertContext: (executionId: string, packet?: CaseTaskProviderInput['packet']) => Promise<AgenticOwner>;
  transport?: typeof globalThis.fetch;
}
export function createCommercialOpenAIRuntime(options: CommercialProviderOptions) {
  if (!options.apiKey.trim()) throw new Error('COMMERCIAL_KEY_REQUIRED');
  const providers = new WeakSet<AgentProvider>();
  const fetchFor =
    (executionId: string, packet?: CaseTaskProviderInput['packet']): typeof globalThis.fetch =>
    async (url, init) => {
      if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('COMMERCIAL_DESTINATION_INVALID');
      if (init?.signal?.aborted) throw new Error('SESSION_CANCELLED');
      let body: any;
      try {
        body = JSON.parse(String(init?.body));
      } catch {
        throw new Error('COMMERCIAL_REQUEST_INVALID');
      }
      if (
        !body ||
        init?.method !== 'POST' ||
        body.model !== COMMERCIAL_MODEL ||
        body.stream !== true ||
        body.previous_response_id ||
        body.conversation ||
        body.background ||
        body.prompt ||
        body.context_management ||
        body.prompt_cache_key ||
        JSON.stringify(body).includes('prompt_cache_breakpoint') ||
        !Array.isArray(body.tools ?? []) ||
        (body.tools ?? []).some((t: any) => t.type !== 'function' || !AGENT_TOOL_NAMES.includes(t.name))
      )
        throw new Error('COMMERCIAL_REQUEST_INVALID');
      Object.assign(body, {
        max_output_tokens: COMMERCIAL_POLICY.maxOutputTokens,
        reasoning: { effort: 'low' },
        service_tier: 'default',
        store: false,
        parallel_tool_calls: false,
        prompt_cache_options: { mode: 'explicit' },
      });
      const serialized = JSON.stringify(body),
        bytes = Buffer.byteLength(serialized);
      if (bytes > 64000) throw new Error('COMMERCIAL_REQUEST_INVALID');
      const owner = await options.assertContext(executionId, packet);
      const inputTokens = bytes * 2 + 8192;
      // Micro-USD from the policy rates. No cache discount is assumed for authorization.
      const upperBoundMicroUsd = Math.ceil(
        (inputTokens * COMMERCIAL_POLICY.inputMicroUsdPerMillion +
          COMMERCIAL_POLICY.maxOutputTokens * COMMERCIAL_POLICY.outputMicroUsdPerMillion) /
          1_000_000,
      );
      const callId = randomUUID();
      const authorization = await options.finance.authorizeCall(owner, executionId, {
        callId,
        inputTokens,
        maxOutputTokens: COMMERCIAL_POLICY.maxOutputTokens,
        upperBoundMicroUsd,
      });
      if (!authorization.shouldExecute) throw new Error('CALL_ALREADY_AUTHORIZED');
      let dispatched = false;
      try {
        if (init?.signal?.aborted) throw new Error('SESSION_CANCELLED');
        await options.assertContext(executionId, packet);
        if (init?.signal?.aborted) throw new Error('SESSION_CANCELLED');
        dispatched = true;
        const response = await (options.transport ?? globalThis.fetch)(url, {
          ...init,
          body: serialized,
          redirect: 'error',
          signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30000)]),
        });
        if (!response.ok) throw new Error('COMMERCIAL_HTTP_FAILED');
        const wire = await readBounded(response),
          usage = responseUsage(wire, COMMERCIAL_MODEL);
        if (usage.inputTokens > inputTokens || usage.outputTokens > COMMERCIAL_POLICY.maxOutputTokens)
          throw new Error('COMMERCIAL_RESPONSE_INVALID');
        const compatible = sdkCompatibleSse(wire);
        const settled = await options.finance.settleCall(owner, executionId, callId, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
        });
        if (settled.status !== 'SETTLED') throw new Error('COMMERCIAL_RESPONSE_INVALID');
        return new Response(compatible, { status: response.status, headers: { 'content-type': 'text/event-stream' } });
      } catch (error) {
        if (dispatched) await options.finance.markUncertain(owner, executionId, callId);
        else await options.finance.markNotDispatched(owner, executionId, callId);
        throw error;
      }
    };
  return {
    fetchFor,
    createProvider(input: CaseTaskProviderInput) {
      const provider = new OpenAIAgentProvider({
        apiKey: options.apiKey,
        model: COMMERCIAL_MODEL,
        fetch: fetchFor(input.binding.executionId, input.packet),
      });
      providers.add(provider);
      return provider;
    },
    async authorizeRealProvider(binding: TaskBinding, provider: AgentProvider) {
      if (!providers.has(provider)) throw new Error('REAL_PROVIDER_NOT_ENABLED');
      const owner = await options.assertContext(binding.executionId);
      if (binding.tenantId !== owner.tenantId || binding.userId !== owner.userId) throw new Error('ACCESS_REVOKED');
    },
  };
}
