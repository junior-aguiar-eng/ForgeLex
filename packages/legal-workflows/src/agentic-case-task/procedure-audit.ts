import type { AgenticTaskDelivery, TaskSource } from '@forgelex/domain';
import { z } from 'zod';

const evidence = z.strictObject({
  sourceId: z.string().min(1).max(200),
  quote: z.string().trim().min(1).max(4000),
});
export const ProcedureChecksSchema = z
  .array(
    z.strictObject({
      requirementId: z.string().min(1).max(200),
      assessment: z.enum(['SUPPORTED', 'PARTIAL', 'NONE', 'UNDETERMINED']),
      norms: z.array(evidence).min(1).max(8).optional(),
      documents: z.array(evidence).min(1).max(8).optional(),
    }),
  )
  .max(100);

type Requirement = AgenticTaskDelivery['requirements'][number];
type Audit = NonNullable<AgenticTaskDelivery['procedureAudit']>[number];

export function auditProceduralRequirements(
  requirements: Requirement[],
  sources: TaskSource[],
  checks: z.infer<typeof ProcedureChecksSchema>,
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const requirementCounts = new Map<string, number>();
  for (const { id } of requirements) requirementCounts.set(id, (requirementCounts.get(id) ?? 0) + 1);
  const byRequirement = new Map<string, typeof checks>();
  for (const check of checks) {
    const list = byRequirement.get(check.requirementId) ?? [];
    list.push(check);
    byRequirement.set(check.requirementId, list);
  }
  const audit: Audit[] = [];
  const invalidEvidence = new Set<string>();
  const bindEvidence = (excerpts: z.infer<typeof evidence>[], kind: 'NORM' | 'DOCUMENT') =>
    excerpts.flatMap((excerpt) => {
      const source = sourceById.get(excerpt.sourceId);
      return source?.kind === kind &&
        (kind !== 'NORM' ||
          (source.identityStatus === 'CURATED_SNAPSHOT_NOT_APPLICABILITY' &&
            source.versionId &&
            source.url?.startsWith('https://'))) &&
        source.text.includes(excerpt.quote)
        ? [{ ...excerpt, contentHash: source.contentHash }]
        : [];
    });
  const reviewed = requirements.map((requirement) => {
    if (requirement.kind === 'EDITORIAL') return requirement;
    const candidates = byRequirement.get(requirement.id) ?? [];
    const check = candidates.length === 1 ? candidates[0] : undefined;
    const pending = { ...requirement, verified: false };
    if (
      requirementCounts.get(requirement.id) !== 1 ||
      requirement.kind !== 'PROCEDURAL' ||
      check?.assessment !== 'SUPPORTED' ||
      !check.norms ||
      !check.documents
    )
      return pending;
    const norms = bindEvidence(check.norms, 'NORM');
    const documents = bindEvidence(check.documents, 'DOCUMENT');
    if (norms.length !== check.norms.length || documents.length !== check.documents.length) {
      invalidEvidence.add(requirement.id);
      return pending;
    }
    const sourceIds = [
      ...new Set([...requirement.sourceIds, ...[...norms, ...documents].map(({ sourceId }) => sourceId)]),
    ];
    if (sourceIds.length > 100) return pending;
    audit.push({
      requirementId: requirement.id,
      norms,
      documents,
    });
    return { ...requirement, sourceIds, verified: true };
  });
  return { requirements: reviewed, audit, invalidEvidence };
}
