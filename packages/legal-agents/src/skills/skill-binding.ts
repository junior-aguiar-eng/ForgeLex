import { createHash } from 'node:crypto';
import { createSkillBinding, SkillBindingSchema, type SkillBinding } from '@forgelex/domain';
import { z } from 'zod';
import { CASE_TASK_POLICY, type CaseTaskRole } from '../agentic-case-contracts.js';
import type { SkillCatalogEntry } from './skill-catalog.js';
import {
  resolveDeskSkills,
  type DeskSkillRequest,
  type SkillReason,
  type SkillResolutionLimitation,
} from './skill-resolver.js';

type SkillResource = Pick<SkillCatalogEntry, 'id' | 'version' | 'contentHash' | 'byteLength'>;
type SkillReference = Readonly<{ id: string; version: number; content: string }>;
type SkillBindingEntry = SkillBinding['entries'][number];
const hashContent = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');
type SkillBindingLimitation =
  | SkillResolutionLimitation
  | { code: 'SKILL_BUDGET_EXCEEDED' }
  | { code: 'SKILL_BUDGET_PARTIAL'; skillIds: string[] }
  | { code: 'SKILL_CONTENT_UNAVAILABLE' | 'SKILL_CONTENT_MISMATCH'; skillId: string; version: number };

/** Server-only payload for the execution checkpoint. */
export interface ExecutionSkillSnapshot {
  readonly binding: Readonly<Omit<SkillBinding, 'entries'>> & {
    readonly entries: readonly (Readonly<Omit<SkillBindingEntry, 'issueIds'>> & {
      readonly issueIds: readonly string[];
    })[];
  };
  readonly references: readonly SkillReference[];
  readonly reasons: readonly { skillId: string; version: number; reason: SkillReason }[];
  readonly limitations: readonly SkillBindingLimitation[];
}

export interface SkillBindingRequest extends DeskSkillRequest {
  readonly contextRevision: number;
  readonly budget: { readonly maxBytesPerRole: number; readonly maxBytesTotal: number };
  /** Read the exact version, bounded by the supplied UTF-8 byte length. */
  readonly loadContent: (resource: Readonly<SkillResource>) => Promise<string>;
}

const referenceId = z.string().min(1).max(200);
const issueEvidence = z.strictObject({ id: referenceId, sourceIds: z.array(referenceId).max(100) });
const reasonSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('FORM'),
    area: referenceId,
    documentType: referenceId,
    transversal: z.literal(true).optional(),
  }),
  z.strictObject({
    kind: z.literal('MATTER'),
    area: referenceId,
    topic: referenceId,
    issues: z.array(issueEvidence).max(100),
  }),
]);
export const ExecutionSkillSnapshotSchema = z.strictObject({
  binding: SkillBindingSchema,
  references: z
    .array(z.strictObject({ id: referenceId, version: z.number().int().positive(), content: z.string() }))
    .max(100),
  reasons: z
    .array(z.strictObject({ skillId: referenceId, version: z.number().int().positive(), reason: reasonSchema }))
    .max(100),
  limitations: z
    .array(
      z.union([
        z.strictObject({ code: z.enum(['FORM_SCOPE_UNRESOLVED', 'SKILL_BUDGET_EXCEEDED']) }),
        z.strictObject({ code: z.literal('SKILL_BUDGET_PARTIAL'), skillIds: z.array(referenceId) }),
        z.strictObject({ code: z.literal('FORM_UNAVAILABLE'), area: referenceId, documentType: referenceId }),
        z.strictObject({
          code: z.literal('FORM_CONFLICT'),
          area: referenceId,
          documentType: referenceId,
          skillIds: z.array(referenceId),
        }),
        z.strictObject({ code: z.enum(['ISSUE_WITHOUT_SCOPED_SOURCE', 'MATTER_UNAVAILABLE']), issueId: referenceId }),
        z.strictObject({ code: z.literal('MATTER_CONFLICT'), issueId: referenceId, skillIds: z.array(referenceId) }),
        z.strictObject({
          code: z.enum(['SKILL_CONTENT_UNAVAILABLE', 'SKILL_CONTENT_MISMATCH']),
          skillId: referenceId,
          version: z.number().int().positive(),
        }),
      ]),
    )
    .max(200),
});

export async function bindDeskSkills(input: SkillBindingRequest): Promise<ExecutionSkillSnapshot> {
  const { maxBytesPerRole, maxBytesTotal } = input.budget;
  if ([maxBytesPerRole, maxBytesTotal].some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_SKILL_BUDGET');
  }
  const resolved = resolveDeskSkills(input);
  const limitations: SkillBindingLimitation[] = [...resolved.limitations];
  // Seleção parcial: a Forma entra primeiro, depois a Matéria com mais fontes selecionadas (desempate pelo id). O que
  // não cabe no orçamento é omitido e registrado; só quando nada cabe a seleção fica vazia.
  const relevance = ({ reason }: (typeof resolved.selections)[number]) =>
    reason.kind === 'MATTER' ? reason.issues.reduce((sum, issue) => sum + issue.sourceIds.length, 0) : Infinity;
  const priority = [...resolved.selections].sort(
    (a, b) => relevance(b) - relevance(a) || (a.skill.id < b.skill.id ? -1 : a.skill.id > b.skill.id ? 1 : 0),
  );
  const totalLimit = Math.min(maxBytesTotal, CASE_TASK_POLICY.maxBytes);
  const bytesByRole = new Map<CaseTaskRole, number>();
  let totalBytes = 0;
  let assignments = 0; // SkillBindingSchema caps the number of role assignments at 100.
  const kept = new Set<string>();
  const omitted: string[] = [];
  for (const { skill, roles } of priority) {
    const fits =
      assignments + roles.length <= 100 &&
      totalBytes + skill.byteLength * roles.length <= totalLimit &&
      roles.every((role) => (bytesByRole.get(role) ?? 0) + skill.byteLength <= maxBytesPerRole);
    if (!fits) {
      omitted.push(skill.id);
      continue;
    }
    kept.add(skill.id);
    assignments += roles.length;
    totalBytes += skill.byteLength * roles.length;
    for (const role of roles) bytesByRole.set(role, (bytesByRole.get(role) ?? 0) + skill.byteLength);
  }
  const selections = resolved.selections.filter(({ skill }) => kept.has(skill.id));
  const entries: SkillBindingEntry[] = [];
  for (const { skill, roles, reason } of selections) {
    for (const role of roles) {
      entries.push({
        id: skill.id,
        version: skill.version,
        contentHash: skill.contentHash,
        role,
        issueIds: reason.kind === 'MATTER' ? reason.issues.map(({ id }) => id) : [],
      });
    }
  }
  const everyOmitted = resolved.selections.length > 0 && !selections.length;
  if (omitted.length && !everyOmitted) limitations.push({ code: 'SKILL_BUDGET_PARTIAL', skillIds: omitted.sort() });
  const hashInput = {
    guidanceHash: input.guidance.guidanceHash,
    contextRevision: input.contextRevision,
    catalogVersion: input.catalog.version,
  };
  const empty = (limitation: SkillBindingLimitation): ExecutionSkillSnapshot =>
    Object.freeze({
      binding: Object.freeze({ ...createSkillBinding({ ...hashInput, entries: [] }), entries: Object.freeze([]) }),
      references: Object.freeze([]),
      reasons: Object.freeze([]),
      limitations: Object.freeze([...limitations, limitation]),
    });
  if (everyOmitted) return empty({ code: 'SKILL_BUDGET_EXCEEDED' });

  const binding = createSkillBinding({ ...hashInput, entries });
  const references: SkillReference[] = [];
  for (const {
    skill: { id, version, contentHash, byteLength },
  } of selections) {
    let content: string;
    try {
      content = await input.loadContent(Object.freeze({ id, version, contentHash, byteLength }));
    } catch {
      return empty({ code: 'SKILL_CONTENT_UNAVAILABLE', skillId: id, version });
    }
    if (
      typeof content !== 'string' ||
      Buffer.byteLength(content, 'utf8') !== byteLength ||
      hashContent(content) !== contentHash
    ) {
      return empty({ code: 'SKILL_CONTENT_MISMATCH', skillId: id, version });
    }
    references.push(Object.freeze({ id, version, content }));
  }
  for (const entry of binding.entries) {
    Object.freeze(entry.issueIds);
    Object.freeze(entry);
  }
  return Object.freeze({
    binding: Object.freeze({ ...binding, entries: Object.freeze(binding.entries) }),
    references: Object.freeze(references),
    reasons: Object.freeze(
      selections.map(({ skill, reason }) => ({ skillId: skill.id, version: skill.version, reason })),
    ),
    limitations: Object.freeze(limitations),
  });
}

/** Skill bodies are inert references. The caller takes capabilities from the existing role profile. */
export function skillReferencesForRole(
  snapshot: ExecutionSkillSnapshot,
  role: CaseTaskRole,
): readonly SkillReference[] {
  const references = new Map(snapshot.references.map((reference) => [reference.id, reference]));
  return snapshot.binding.entries
    .filter((entry) => entry.role === role)
    .map(({ id, version, contentHash }) => {
      const reference = references.get(id);
      if (
        !reference ||
        reference.version !== version ||
        typeof reference.content !== 'string' ||
        hashContent(reference.content) !== contentHash
      )
        throw new Error('SKILL_SNAPSHOT_MISMATCH');
      return { id, version, content: reference.content };
    });
}
