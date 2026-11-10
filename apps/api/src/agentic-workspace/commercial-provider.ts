import { createHash, randomUUID } from 'node:crypto';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import { structuredLog } from '../observability.js';
import { safeAgentFailure, type AgentFailureDiagnostic } from '@forgelex/agent-core';
import type { AgentProvider } from '@forgelex/agent-core';
import { MAX_COMMERCIAL_REQUEST_BYTES, type AgenticOwner, type TaskBinding } from '@forgelex/domain';
import { COMMERCIAL_POLICY, type CommercialInferenceService } from '@forgelex/billing-ledger';
import type { CaseTaskProviderInput } from '@forgelex/legal-workflows';
import { COMMERCIAL_AGENT_TOOL_NAMES, readBounded, responseUsage, sdkCompatibleSse } from './provider-transport.js';

/** The commercial policy is the single source of truth for the model, its rates and its output ceiling. */
export const COMMERCIAL_MODEL = COMMERCIAL_POLICY.model;
export interface CommercialCallRecord {
  phase: 'RESERVED' | 'RESPONSE' | 'USAGE' | 'SETTLED' | 'FAILED';
  executionId: string;
  callId: string;
  timestamp: string;
  requestSha256: string;
  upperBoundMicroUsd: number;
  httpStatus?: number;
  requestId?: string;
  responseId?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
  diagnostic?: AgentFailureDiagnostic;
  costState?: 'SETTLED' | 'UNCERTAIN' | 'NOT_DISPATCHED';
  accountingUpdateFailed?: boolean;
}
export interface CommercialProviderOptions {
  /** Awaited before dispatch and settlement. Campaigns must supply a durable sink. */
  recordCall?: (event: CommercialCallRecord) => Promise<void>;

  apiKey: string;
  finance: Pick<CommercialInferenceService, 'authorizeCall' | 'settleCall' | 'markUncertain' | 'markNotDispatched'>;
  /** Rechecks live account, execution, reservation and selected-source snapshot before each HTTP. */
  assertContext: (executionId: string, packet?: CaseTaskProviderInput['selectedPacket']) => Promise<AgenticOwner>;
  transport?: typeof globalThis.fetch;
}
export function createCommercialOpenAIRuntime(options: CommercialProviderOptions) {
  return createBudgetedOpenAIRuntime(options, COMMERCIAL_AGENT_TOOL_NAMES, () => randomUUID());
}

/** Same financial transport, but only a single durable call to the editorial submission tool. */
export function createEditorialOpenAITransport(options: CommercialProviderOptions) {
  return createBudgetedOpenAIRuntime(
    options,
    ['forgelex_editorial_submit'],
    (id) => `editorial:${createHash('sha256').update(id).digest('hex')}`,
  ).fetchFor;
}

function createBudgetedOpenAIRuntime(
  options: CommercialProviderOptions,
  toolNames: readonly string[],
  callIdFor: (executionId: string) => string,
) {
  if (!options.apiKey.trim()) throw new Error('COMMERCIAL_KEY_REQUIRED');
  const providers = new WeakSet<AgentProvider>();
  const fetchFor =
    (executionId: string, packet?: CaseTaskProviderInput['selectedPacket']): typeof globalThis.fetch =>
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
        (body.tools ?? []).some((t: any) => t.type !== 'function' || !toolNames.includes(t.name))
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
      if (bytes > MAX_COMMERCIAL_REQUEST_BYTES) {
        // Sizes only: never the content. Tells "over the ceiling" apart from "malformed request".
        structuredLog('warn', 'commercial_request_too_large', {
          executionId,
          bytes,
          limitBytes: MAX_COMMERCIAL_REQUEST_BYTES,
        });
        throw new Error('COMMERCIAL_REQUEST_TOO_LARGE');
      }
      const owner = await options.assertContext(executionId, packet);
      // A token is at least one byte, so the serialized size bounds the input tokens; 8192 covers the provider's own framing.
      const inputTokens = bytes + 8192;
      // Micro-USD from the policy rates. No cache discount is assumed for authorization.
      const upperBoundMicroUsd = Math.ceil(
        (inputTokens * COMMERCIAL_POLICY.inputMicroUsdPerMillion +
          COMMERCIAL_POLICY.maxOutputTokens * COMMERCIAL_POLICY.outputMicroUsdPerMillion) /
          1_000_000,
      );
      if (upperBoundMicroUsd > COMMERCIAL_POLICY.maxInferenceMicroUsd) throw new Error('BUDGET_EXCEEDED');
      const callId = callIdFor(executionId);
      const authorization = await options.finance.authorizeCall(owner, executionId, {
        callId,
        inputTokens,
        maxOutputTokens: COMMERCIAL_POLICY.maxOutputTokens,
        upperBoundMicroUsd,
      });
      if (!authorization.shouldExecute) throw new Error('CALL_ALREADY_AUTHORIZED');
      let dispatched = false;
      let usageSettled = false;
      let stage: AgentFailureDiagnostic['failureStage'] = 'RECORD_RESERVATION';
      let httpStatus: number | undefined, requestId: string | undefined;
      const record = async (phase: CommercialCallRecord['phase'], fields: Partial<CommercialCallRecord> = {}) => {
        const event: CommercialCallRecord = {
          executionId,
          callId,
          timestamp: new Date().toISOString(),
          requestSha256: createHash('sha256').update(serialized).digest('hex'),
          upperBoundMicroUsd,
          httpStatus,
          requestId,
          ...fields,
          phase,
        };
        if (options.recordCall) await options.recordCall(event);
        else
          structuredLog('info', 'commercial_call_trace', {
            ...event,
            // Numeric counts are not credentials; avoid the generic token-key redactor.
            ...(event.usage
              ? {
                  usage: {
                    input: event.usage.inputTokens,
                    output: event.usage.outputTokens,
                    cachedInput: event.usage.cachedInputTokens,
                  },
                }
              : {}),
          });
      };
      try {
        await record('RESERVED');
        stage = 'REVALIDATE';
        if (init?.signal?.aborted) throw new Error('SESSION_CANCELLED');
        await options.assertContext(executionId, packet);
        if (init?.signal?.aborted) throw new Error('SESSION_CANCELLED');
        const headers = new Headers(init?.headers);
        headers.set('X-Client-Request-Id', callId);
        stage = 'DISPATCH';
        dispatched = true;
        const response = await (options.transport ?? globalThis.fetch)(url, {
          ...init,
          body: serialized,
          headers,
          redirect: 'error',
          signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30000)]),
        });
        httpStatus = response.status;
        const receivedId = response.headers.get('x-request-id');
        if (receivedId && /^req_[A-Za-z0-9_-]{1,120}$/.test(receivedId)) requestId = receivedId;
        await record('RESPONSE');
        if (!response.ok)
          throw Object.assign(new Error('COMMERCIAL_HTTP_FAILED'), {
            status: response.status,
            requestId,
          });
        stage = 'READ_RESPONSE';
        const wire = await readBounded(response);
        stage = 'PARSE_USAGE';
        const usage = responseUsage(wire, COMMERCIAL_MODEL);
        if (usage.inputTokens > inputTokens || usage.outputTokens > COMMERCIAL_POLICY.maxOutputTokens)
          throw new Error('COMMERCIAL_RESPONSE_INVALID');
        const measured = {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
        };
        await record('USAGE', {
          usage: measured,
          ...(usage.requestId && /^resp_[A-Za-z0-9_-]{1,160}$/.test(usage.requestId)
            ? { responseId: usage.requestId }
            : {}),
        });
        stage = 'ADAPT_RESPONSE';
        const compatible = sdkCompatibleSse(wire);
        stage = 'SETTLE_USAGE';
        const settled = await options.finance.settleCall(owner, executionId, callId, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
        });
        if (settled.status !== 'SETTLED') throw new Error('COMMERCIAL_RESPONSE_INVALID');
        usageSettled = true;
        await record('SETTLED', { usage: measured, costState: 'SETTLED' });
        if (usage.failureCode) throw new Error(usage.failureCode);
        return new Response(compatible, { status: response.status, headers: { 'content-type': 'text/event-stream' } });
      } catch (error) {
        const failure = Object.assign(new Error('COMMERCIAL_CALL_FAILED', { cause: error }), {
          status: httpStatus,
          requestId,
          clientRequestId: callId,
          failureStage: stage,
        });
        let accountingUpdateFailed = false;
        try {
          if (dispatched && !usageSettled) await options.finance.markUncertain(owner, executionId, callId);
          else if (!dispatched) await options.finance.markNotDispatched(owner, executionId, callId);
        } catch {
          accountingUpdateFailed = true;
        }
        // A secondary logging failure must not erase the original safe diagnosis.
        await record('FAILED', {
          diagnostic: safeAgentFailure(failure),
          accountingUpdateFailed,
          costState: usageSettled ? 'SETTLED' : dispatched || accountingUpdateFailed ? 'UNCERTAIN' : 'NOT_DISPATCHED',
        }).catch(() => undefined);
        // Keep existing stable messages for callers, but never log arbitrary messages.
        if (error instanceof Error) failure.message = error.message;
        throw failure;
      }
    };
  return {
    fetchFor,
    createProvider(input: CaseTaskProviderInput) {
      const provider = new OpenAIAgentProvider({
        apiKey: options.apiKey,
        model: COMMERCIAL_MODEL,
        fetch: fetchFor(input.binding.executionId, input.selectedPacket),
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
