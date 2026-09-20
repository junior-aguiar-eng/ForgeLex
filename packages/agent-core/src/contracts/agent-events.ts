import { z } from 'zod';
import { ProvenanceMetadataSchema } from '@forgelex/domain';

export const NormalizedUsageSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  requestId: z.string().min(1).optional(),
});

export type NormalizedUsage = z.infer<typeof NormalizedUsageSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readNonNegativeInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  }
  return undefined;
}

/**
 * Converte payloads dos SDKs em um contrato comum. Sem input/output válidos,
 * retorna undefined para impedir cobrança silenciosa sem uso mensurável.
 */
export function normalizeProviderUsage(
  provider: string,
  model: string,
  value: unknown,
  fallbackRequestId?: string,
): NormalizedUsage | undefined {
  const root = asRecord(value);
  const usage = asRecord(root.usage ?? root);
  const inputTokens = readNonNegativeInteger(usage.inputTokens, usage.input_tokens, usage.prompt_tokens);
  const outputTokens = readNonNegativeInteger(usage.outputTokens, usage.output_tokens, usage.completion_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return undefined;

  const cachedInputTokens = readNonNegativeInteger(
    usage.cachedInputTokens,
    usage.cache_read_input_tokens,
    usage.cached_tokens,
  );
  const reasoningTokens = readNonNegativeInteger(usage.reasoningTokens, usage.reasoning_tokens);
  const requestId = typeof root.requestId === 'string'
    ? root.requestId
    : typeof root.request_id === 'string'
      ? root.request_id
      : fallbackRequestId;

  return NormalizedUsageSchema.parse({
    provider,
    model,
    inputTokens,
    outputTokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(requestId ? { requestId } : {}),
  });
}

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lifecycle:started'),
    sessionId: z.string().uuid(),
    timestamp: z.string().datetime(),
    model: z.string(),
  }),
  z.object({
    type: z.literal('thought:delta'),
    sessionId: z.string().uuid(),
    delta: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool:invoked'),
    sessionId: z.string().uuid(),
    toolName: z.string(),
    callId: z.string(),
    input: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool:waiting_approval'),
    sessionId: z.string().uuid(),
    toolName: z.string(),
    callId: z.string(),
    approvalToken: z.string(),
    parametersSummary: z.string(),
    proposedAction: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool:completed'),
    sessionId: z.string().uuid(),
    toolName: z.string(),
    callId: z.string(),
    output: z.unknown(),
    provenance: z.array(ProvenanceMetadataSchema).optional(),
    durationMs: z.number().nonnegative(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('tool:rejected'),
    sessionId: z.string().uuid(),
    toolName: z.string(),
    callId: z.string(),
    reason: z.string(),
    rejectedBy: z.enum(['HUMAN_DECISION', 'POLICY_GATE', 'TIMEOUT']),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('lifecycle:completed'),
    sessionId: z.string().uuid(),
    output: z.unknown(),
    totalTurns: z.number().int().positive(),
    totalDurationMs: z.number().nonnegative(),
    usage: NormalizedUsageSchema.optional(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('error'),
    sessionId: z.string().uuid(),
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  }),
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;
