import { createHash } from 'node:crypto';
import { createSkillBinding, type SkillBinding } from '@forgelex/domain';
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

interface SkillBindingRequest extends DeskSkillRequest {
  readonly contextRevision: number;
  readonly budget: { readonly maxBytesPerRole: number; readonly maxBytesTotal: number };
  /** Read the exact version, bounded by the supplied UTF-8 byte length. */
  readonly loadContent: (resource: Readonly<SkillResource>) => Promise<string>;
}

export async function bindDeskSkills(input: SkillBindingRequest): Promise<ExecutionSkillSnapshot> {
  const { maxBytesPerRole, maxBytesTotal } = input.budget;
  if ([maxBytesPerRole, maxBytesTotal].some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_SKILL_BUDGET');
  }
  const { selections, limitations } = resolveDeskSkills(input);
  const entries: SkillBindingEntry[] = [];
  const bytesByRole = new Map<CaseTaskRole, number>();
  let totalBytes = 0;
  for (const { skill, roles, reason } of selections) {
    for (const role of roles) {
      totalBytes += skill.byteLength;
      bytesByRole.set(role, (bytesByRole.get(role) ?? 0) + skill.byteLength);
      entries.push({
        id: skill.id,
        version: skill.version,
        contentHash: skill.contentHash,
        role,
        issueIds: reason.kind === 'MATTER' ? reason.issues.map(({ id }) => id) : [],
      });
    }
  }
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
  if (
    entries.length > 100 || // SkillBindingSchema caps the number of role assignments.
    totalBytes > Math.min(maxBytesTotal, CASE_TASK_POLICY.maxBytes) ||
    [...bytesByRole.values()].some((bytes) => bytes > maxBytesPerRole)
  ) {
    return empty({ code: 'SKILL_BUDGET_EXCEEDED' });
  }

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
