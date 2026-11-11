import { createHash } from 'node:crypto';
import { z } from 'zod';

const code = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const revision = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.string().min(1).max(200);
const references = z
  .array(reference)
  .max(100)
  .refine((items) => new Set(items).size === items.length);

export const DecisionValueSchema = z
  .strictObject({
    value: code.nullable(),
    status: z.enum(['known', 'unknown', 'proposed', 'confirmed']),
    origin: z.enum(['user', 'document', 'model']),
    questionId: reference.optional(),
    evidenceIds: references.optional(),
  })
  .superRefine((decision, ctx) => {
    if ((decision.value === null) !== (decision.status === 'unknown')) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'DECISION_VALUE_STATUS_MISMATCH' });
    }
    if (
      (decision.status === 'confirmed' && decision.origin !== 'user') ||
      (decision.status === 'known' && decision.origin === 'model') ||
      (decision.status === 'proposed' && decision.origin === 'user')
    ) {
      ctx.addIssue({ code: 'custom', path: ['origin'], message: 'DECISION_ORIGIN_STATUS_MISMATCH' });
    }
    if (decision.origin === 'document' && !decision.evidenceIds?.length) {
      ctx.addIssue({ code: 'custom', path: ['evidenceIds'], message: 'DECISION_EVIDENCE_REQUIRED' });
    }
  });
export type DecisionValue = z.infer<typeof DecisionValueSchema>;

const snapshotInput = z.strictObject({
  protocolVersion: z.literal(1),
  rulesVersion: code,
  revision,
  area: DecisionValueSchema,
  action: DecisionValueSchema,
  documentType: DecisionValueSchema,
  partyRole: DecisionValueSchema,
  stage: DecisionValueSchema,
  activeQuestionId: reference.nullable(),
});
type GuidanceInput = z.infer<typeof snapshotInput>;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

// Field order is part of protocol v1. References are sets. Question IDs and
// revision are transport state and do not change the routing decision itself.
function guidanceDigest(snapshot: GuidanceInput): string {
  const decision = ({ value, status, origin, evidenceIds }: DecisionValue) => ({
    value,
    status,
    origin,
    evidenceIds: [...(evidenceIds ?? [])].sort(),
  });
  return digest({
    protocolVersion: snapshot.protocolVersion,
    rulesVersion: snapshot.rulesVersion,
    area: decision(snapshot.area),
    action: decision(snapshot.action),
    documentType: decision(snapshot.documentType),
    partyRole: decision(snapshot.partyRole),
    stage: decision(snapshot.stage),
  });
}

export const GuidanceSnapshotSchema = snapshotInput
  .extend({ guidanceHash: hash })
  .refine((snapshot) => snapshot.guidanceHash === guidanceDigest(snapshot), {
    path: ['guidanceHash'],
    message: 'GUIDANCE_HASH_MISMATCH',
  });
export type GuidanceSnapshot = z.infer<typeof GuidanceSnapshotSchema>;

export function createGuidanceSnapshot(input: GuidanceInput): GuidanceSnapshot {
  const snapshot = snapshotInput.parse(input);
  return { ...snapshot, guidanceHash: guidanceDigest(snapshot) };
}

const skillEntry = z.strictObject({
  id: code,
  version: revision,
  contentHash: hash,
  role: code,
  issueIds: references,
});
const skillEntries = z
  .array(skillEntry)
  .max(100)
  .refine((entries) => new Set(entries.map(({ id, role }) => JSON.stringify([id, role]))).size === entries.length, {
    message: 'DUPLICATE_SKILL_ROLE',
  });
const skillSelection = z.strictObject({ catalogVersion: code, entries: skillEntries });
const resolutionInput = skillSelection.extend({ guidanceHash: hash, contextRevision: revision });

export const SkillBindingSchema = skillSelection.extend({ resolutionHash: hash });
export type SkillBinding = z.infer<typeof SkillBindingSchema>;

export function createSkillBinding(input: z.infer<typeof resolutionInput>): SkillBinding {
  const { guidanceHash, contextRevision, catalogVersion, entries } = resolutionInput.parse(input);
  const canonicalEntries = entries
    .map(({ id, version, contentHash, role, issueIds }) =>
      JSON.stringify({ id, version, contentHash, role, issueIds: [...issueIds].sort() }),
    )
    .sort();
  return {
    catalogVersion,
    entries,
    resolutionHash: digest({ guidanceHash, contextRevision, catalogVersion, entries: canonicalEntries }),
  };
}
