import { z } from 'zod';
import { ProvenanceMetadataSchema } from '@forgelex/domain';

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
