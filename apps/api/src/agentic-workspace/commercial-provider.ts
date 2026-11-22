import { createHash, randomUUID } from 'node:crypto';
import { OpenAIAgentProvider, openAIWireToolNames } from '@forgelex/agent-provider-openai';
import { structuredLog } from '../observability.js';
import { safeAgentFailure, type AgentFailureDiagnostic } from '@forgelex/agent-core';
import type { AgentProvider } from '@forgelex/agent-core';
import { MAX_COMMERCIAL_REQUEST_BYTES, type AgenticOwner, type TaskBinding } from '@forgelex/domain';
import {
  COMMERCIAL_POLICY,
  commercialCallUpperBound,
  commercialInferenceProfile,
  CommercialProfileSetSchema,
  type CommercialCallProfile,
  type CommercialInferenceRole,
  type CommercialInferenceService,
  type CommercialProfileSet,
} from '@forgelex/billing-ledger';
import { withBoundedOutputLimit, type CaseTaskProviderInput } from '@forgelex/legal-workflows';
import { AGENT_TOOL_NAMES, readBounded, responseUsage, sdkCompatibleSse } from './provider-transport.js';

/** The commercial policy is the single source of truth for the model, its rates and its output ceiling. */
export const COMMERCIAL_MODEL = COMMERCIAL_POLICY.model;
export interface CommercialCallRecord {
  phase: 'RESERVED' | 'RESPONSE' | 'USAGE' | 'SETTLED' | 'FAILED';
  executionId: string;
  callId: string;
  timestamp: string;
  requestSha256: string;
  upperBoundMicroUsd: number;
  profile?: CommercialCallProfile & { model: string; maxOutputTokens: number; effort: string };
  elapsedMs?: number;
  reasoningTokens?: number;
  outputLimited?: boolean;
  actualMicroUsd?: number;
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
const editorialCallId = (id: string) => `editorial:${createHash('sha256').update(id).digest('hex')}`;
export function createCommercialOpenAIRuntime(options: CommercialProviderOptions) {
  return createBudgetedOpenAIRuntime(options, AGENT_TOOL_NAMES, () => randomUUID());
}

/** Evaluation composition requires an injected transport and never falls back to network fetch. */
type ProfiledEvaluationOptions = Omit<CommercialProviderOptions, 'transport' | 'recordCall'> & {
  transport: typeof globalThis.fetch;
  recordCall: NonNullable<CommercialProviderOptions['recordCall']>;
  profileSet: CommercialProfileSet;
  strictEvaluationTools?: boolean;
};

export function createProfiledEvaluationOpenAIRuntime(options: ProfiledEvaluationOptions) {
  if (!options.transport) throw new Error('EVALUATION_TRANSPORT_REQUIRED');
  const set = CommercialProfileSetSchema.parse(options.profileSet);
  return createBudgetedOpenAIRuntime(options, AGENT_TOOL_NAMES, () => randomUUID(), set, options.strictEvaluationTools);
}

export function createOfflineProfiledOpenAIRuntime(options: Omit<ProfiledEvaluationOptions, 'apiKey'>) {
  if (!options.transport || options.transport === globalThis.fetch) throw new Error('OFFLINE_TRANSPORT_REQUIRED');
  return createProfiledEvaluationOpenAIRuntime({ ...options, apiKey: 'synthetic-a2' });
}

/** Same financial transport, but only a single durable call to the editorial submission tool. */
export function createEditorialOpenAITransport(options: CommercialProviderOptions) {
  return createBudgetedOpenAIRuntime(options, ['forgelex_editorial_submit'], editorialCallId).fetchFor;
}

function createBudgetedOpenAIRuntime(
  options: CommercialProviderOptions,
  toolNames: readonly string[],
  callIdFor: (executionId: string) => string,
  profileSet?: CommercialProfileSet,
  strictEvaluationTools = false,
) {
  if (!options.apiKey.trim()) throw new Error('COMMERCIAL_KEY_REQUIRED');
  const providers = new WeakSet<AgentProvider>();
  const fetchFor =
    (
      executionId: string,
      packet?: CaseTaskProviderInput['selectedPacket'],
      allowedTools = toolNames,
      role?: CommercialInferenceRole,
    ): typeof globalThis.fetch =>
    async (url, init) => {
      if (profileSet && !role) throw new Error('COMMERCIAL_ROLE_REQUIRED');
      const profile = profileSet && role ? { set: profileSet, role } : undefined;
      const settings = profile
        ? commercialInferenceProfile(profile)
        : { ...COMMERCIAL_POLICY, effort: 'low', verbosity: undefined };
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
        body.model !== settings.model ||
        body.stream !== true ||
        body.previous_response_id ||
        body.conversation ||
        body.background ||
        body.prompt ||
        body.context_management ||
        body.prompt_cache_key ||
        JSON.stringify(body).includes('prompt_cache_breakpoint') ||
        !Array.isArray(body.tools ?? []) ||
        (body.tools ?? []).some((t: any) => t.type !== 'function' || !allowedTools.includes(t.name))
      )
        throw new Error('COMMERCIAL_REQUEST_INVALID');
      Object.assign(body, {
        max_output_tokens: settings.maxOutputTokens,
        reasoning: { effort: settings.effort },
        service_tier: 'default',
        store: false,
        parallel_tool_calls: false,
        prompt_cache_options: { mode: 'explicit' },
      });
      if (profile) {
        delete body.text?.verbosity;
        if (settings.verbosity) body.text = { ...body.text, verbosity: settings.verbosity };
      }
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
      const upperBoundMicroUsd = commercialCallUpperBound(settings, inputTokens, settings.maxOutputTokens);
      if (upperBoundMicroUsd > COMMERCIAL_POLICY.maxInferenceMicroUsd) throw new Error('BUDGET_EXCEEDED');
      const callId = role === 'final-editor' ? editorialCallId(executionId) : callIdFor(executionId);
      const authorization = await options.finance.authorizeCall(owner, executionId, {
        callId,
        inputTokens,
        maxOutputTokens: settings.maxOutputTokens,
        upperBoundMicroUsd,
        ...(profile ? { profile } : {}),
      });
      if (!authorization.shouldExecute) throw new Error('CALL_ALREADY_AUTHORIZED');
      let dispatched = false;
      let usageSettled = false;
      let stage: AgentFailureDiagnostic['failureStage'] = 'RECORD_RESERVATION';
      let httpStatus: number | undefined, requestId: string | undefined;
      const startedAt = performance.now();
      const record = async (phase: CommercialCallRecord['phase'], fields: Partial<CommercialCallRecord> = {}) => {
        const event: CommercialCallRecord = {
          executionId,
          callId,
          timestamp: new Date().toISOString(),
          requestSha256: createHash('sha256').update(serialized).digest('hex'),
          upperBoundMicroUsd,
          ...(profile
            ? {
                profile: {
                  ...profile,
                  model: settings.model,
                  maxOutputTokens: settings.maxOutputTokens,
                  effort: settings.effort,
                },
                elapsedMs: Math.round(performance.now() - startedAt),
              }
            : {}),
          httpStatus,
          requestId,
          ...fields,
          phase,
        };
        if (options.recordCall) await options.recordCall(event);
        else {
          const { profile: recordedProfile, reasoningTokens, ...safeFields } = event;
          structuredLog('info', 'commercial_call_trace', {
            ...safeFields,
            ...(recordedProfile
              ? {
                  profile: {
                    set: recordedProfile.set,
                    role: recordedProfile.role,
                    model: recordedProfile.model,
                    maxOutput: recordedProfile.maxOutputTokens,
                    effort: recordedProfile.effort,
                  },
                  ...(reasoningTokens === undefined ? {} : { reasoning: reasoningTokens }),
                }
              : {}),
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
        }
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
        const usage = responseUsage(wire, settings.model);
        if (usage.inputTokens > inputTokens || usage.outputTokens > settings.maxOutputTokens)
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
        await record('SETTLED', {
          usage: measured,
          costState: 'SETTLED',
          ...(profile
            ? {
                ...(usage.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens }),
                outputLimited: usage.failureCode === 'COMMERCIAL_OUTPUT_LIMIT',
                actualMicroUsd: settled.actualMicroUsd ?? undefined,
              }
            : {}),
        });
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
    fetchFor: (executionId: string, packet?: CaseTaskProviderInput['selectedPacket']) => fetchFor(executionId, packet),
    fetchForRole: (executionId: string, role: CommercialInferenceRole) =>
      fetchFor(executionId, undefined, role === 'final-editor' ? ['forgelex_editorial_submit'] : toolNames, role),
    createProvider(input: CaseTaskProviderInput) {
      const settings = profileSet ? commercialInferenceProfile({ set: profileSet, role: input.role }) : undefined;
      const provider = new OpenAIAgentProvider({
        apiKey: options.apiKey,
        model: settings?.model ?? COMMERCIAL_MODEL,
        strictSourceList: strictEvaluationTools,
        strictAuthorityLookup: strictEvaluationTools,
        fetch: fetchFor(
          input.binding.executionId,
          input.selectedPacket,
          openAIWireToolNames(input.registry.list()),
          input.role,
        ),
      });
      if (settings && settings.maxOutputTokens !== COMMERCIAL_POLICY.maxOutputTokens) {
        const run = provider.run.bind(provider);
        provider.run = (request) => {
          if (!request.systemPolicy) throw new Error('COMMERCIAL_POLICY_MISMATCH');
          const policy = JSON.parse(request.systemPolicy);
          policy.profile.instructions = withBoundedOutputLimit(policy.profile.instructions, settings.maxOutputTokens);
          return run({ ...request, systemPolicy: JSON.stringify(policy) });
        };
      }
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
