import { GuidanceSnapshotSchema, type GuidanceSnapshot } from '@forgelex/domain';
import type { CaseTaskRole } from '../agentic-case-contracts.js';
import type { SkillCatalog, SkillCatalogEntry } from './skill-catalog.js';

export interface ClassifiedSkillIssue {
  readonly id: string;
  readonly area: string;
  readonly topic: string;
  readonly sourceIds: readonly string[];
}

export interface DeskSkillRequest {
  readonly catalog: SkillCatalog;
  readonly guidance: GuidanceSnapshot;
  /** Structured issue classifications and active roles come from the server plan. */
  readonly issues: readonly ClassifiedSkillIssue[];
  readonly sourceIds: readonly string[];
  readonly activeRoles: readonly CaseTaskRole[];
}

type IssueEvidence = { id: string; sourceIds: string[] };
export type SkillReason =
  | { kind: 'FORM'; area: string; documentType: string }
  | { kind: 'MATTER'; area: string; topic: string; issues: IssueEvidence[] };

export type SkillResolutionLimitation =
  | { code: 'FORM_SCOPE_UNRESOLVED' }
  | { code: 'FORM_UNAVAILABLE'; area: string; documentType: string }
  | { code: 'FORM_CONFLICT'; area: string; documentType: string; skillIds: string[] }
  | { code: 'ISSUE_WITHOUT_SCOPED_SOURCE'; issueId: string }
  | { code: 'MATTER_UNAVAILABLE'; issueId: string }
  | { code: 'MATTER_CONFLICT'; issueId: string; skillIds: string[] };

type Selection = {
  skill: SkillCatalogEntry;
  roles: CaseTaskRole[];
  reason: SkillReason;
};

export function resolveDeskSkills(input: DeskSkillRequest): {
  selections: Selection[];
  limitations: SkillResolutionLimitation[];
} {
  const guidance = GuidanceSnapshotSchema.parse(input.guidance);
  const activeRoles = new Set(input.activeRoles);
  const sources = new Set(input.sourceIds);
  const selections = new Map<string, Selection>();
  const limitations: SkillResolutionLimitation[] = [];
  const eligible = input.catalog.entries.filter(
    (skill) => skill.status === 'eligible' && skill.roles.some((role) => activeRoles.has(role)),
  );
  const select = (skill: SkillCatalogEntry, reason: SkillReason) => {
    selections.set(skill.id, { skill, roles: skill.roles.filter((role) => activeRoles.has(role)).sort(), reason });
  };

  const actionKnown = guidance.action.status === 'confirmed' || guidance.action.status === 'known';
  const pieceConfirmed = guidance.documentType.status === 'confirmed' && guidance.documentType.value !== 'outra';
  if (
    actionKnown &&
    (guidance.action.value === 'create_document' || (guidance.action.value === 'review_text' && pieceConfirmed))
  ) {
    const areaKnown = guidance.area.status === 'confirmed' || guidance.area.status === 'known';
    const { value: area } = guidance.area;
    const { value: documentType } = guidance.documentType;
    if (!areaKnown || !area || area === 'outra' || !pieceConfirmed || !documentType) {
      limitations.push({ code: 'FORM_SCOPE_UNRESOLVED' });
    } else {
      const forms = eligible.filter(
        (skill) => skill.kind === 'FORM' && skill.area === area && skill.documentType === documentType,
      );
      if (forms.length === 1) select(forms[0], { kind: 'FORM', area, documentType });
      else if (forms.length) {
        limitations.push({ code: 'FORM_CONFLICT', area, documentType, skillIds: forms.map(({ id }) => id).sort() });
      } else {
        limitations.push({ code: 'FORM_UNAVAILABLE', area, documentType });
      }
    }
  }

  const issues = new Map(input.issues.map((issue) => [issue.id, issue]));
  if (issues.size !== input.issues.length) throw new Error('DUPLICATE_CLASSIFIED_SKILL_ISSUE');
  for (const id of [...issues.keys()].sort()) {
    const issue = issues.get(id)!;
    const sourceIds = [...new Set(issue.sourceIds.filter((source) => sources.has(source)))].sort();
    if (!sourceIds.length) {
      limitations.push({ code: 'ISSUE_WITHOUT_SCOPED_SOURCE', issueId: id });
      continue;
    }
    const matches = eligible.filter(
      (skill) => skill.kind === 'MATTER' && skill.area === issue.area && skill.topic === issue.topic,
    );
    if (matches.length !== 1) {
      limitations.push(
        matches.length
          ? { code: 'MATTER_CONFLICT', issueId: id, skillIds: matches.map(({ id }) => id).sort() }
          : { code: 'MATTER_UNAVAILABLE', issueId: id },
      );
      continue;
    }
    const skill = matches[0];
    const previous = selections.get(skill.id)?.reason;
    if (previous?.kind === 'MATTER') previous.issues.push({ id, sourceIds });
    else select(skill, { kind: 'MATTER', area: issue.area, topic: issue.topic, issues: [{ id, sourceIds }] });
  }
  return { selections: [...selections.keys()].sort().map((id) => selections.get(id)!), limitations };
}
