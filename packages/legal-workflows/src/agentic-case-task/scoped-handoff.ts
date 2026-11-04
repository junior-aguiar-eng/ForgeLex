import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { TaskSource } from '@forgelex/domain';
import { EvidenceTaskResultSchema, ReviewedTaskResultSchema, type TaskSpecialistResult } from '@forgelex/legal-agents';

type Result = z.infer<typeof ReviewedTaskResultSchema>;
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const claimDigest = (c: TaskSpecialistResult['claims'][number]) => digest({ ...c, sourceIds: [...c.sourceIds].sort() });

/** Local model IDs do not share a namespace with another role or refinement. */
export function scopeTaskResult(
  result: Result,
  nodeId: string,
  prior: Record<string, TaskSpecialistResult>,
  reviewedScope?: string,
): Result {
  const output = structuredClone(result);
  const previous = new Map(
    Object.values(prior)
      .flatMap((x) => x.claims)
      .map((c) => [c.id, c]),
  );
  const seen = new Map<string, string>();
  const ids = new Map<string, string>();
  // The prefix is deterministic and bounded, independent of user-controlled IDs.
  const prefix = digest(reviewedScope ? [reviewedScope, nodeId] : nodeId).slice(0, 10);
  const scoped = (id: string) => `${prefix}:${id.length <= 60 ? id : digest(id).slice(0, 40)}`;
  for (const c of output.claims) {
    const fingerprint = claimDigest(c);
    if (
      (seen.has(c.id) && seen.get(c.id) !== fingerprint) ||
      (previous.has(c.id) && claimDigest(previous.get(c.id)!) !== fingerprint)
    )
      throw new Error('CLAIM_ID_CONFLICT');
    seen.set(c.id, fingerprint);
    ids.set(c.id, previous.has(c.id) ? c.id : scoped(c.id));
  }
  const reference = (id: string) => ids.get(id) ?? id;
  if (output.review) {
    const local = {
      claim: ids,
      requirement: new Map(output.requirements.map((r) => [r.id, scoped(r.id)])),
      finding: new Map(output.findings.map((f) => [f.id, scoped(f.id)])),
    };
    output.review.equivalences = output.review.equivalences?.map((g) => ({
      ...g,
      retainedId: local[g.kind].get(g.retainedId) ?? g.retainedId,
      memberIds: g.memberIds.map((id) => local[g.kind].get(id) ?? id),
    }));
  }
  output.claims = output.claims.map((c) => ({ ...c, id: reference(c.id) }));
  output.requirements = output.requirements.map((r) => ({ ...r, id: scoped(r.id) }));
  output.findings = output.findings.map((f) => ({ ...f, id: scoped(f.id) }));
  output.supportChecks = output.supportChecks.map((c) => ({ ...c, claimId: reference(c.claimId) }));
  if (output.evidenceAnalysis) {
    output.evidenceAnalysis.rows = output.evidenceAnalysis.rows.map((r) => ({ ...r, claimId: reference(r.claimId) }));
    output.evidenceAnalysis.chronology = output.evidenceAnalysis.chronology.map((e) => ({
      ...e,
      claimIds: e.claimIds.map(reference),
    }));
    output.evidenceAnalysis.contradictions = output.evidenceAnalysis.contradictions.map((c) => ({
      ...c,
      claimIds: c.claimIds.map(reference),
    }));
  }
  return (reviewedScope ? ReviewedTaskResultSchema : EvidenceTaskResultSchema).parse(output);
}

export function eligibleSupportTargets(
  prior: Record<string, TaskSpecialistResult>,
  sources: TaskSource[],
  includeDocuments = false,
) {
  const kinds = includeDocuments ? ['NORM', 'AUTHORITY', 'DOCUMENT', 'USER_TEXT', 'ANSWER'] : ['NORM', 'AUTHORITY'];
  const legal = new Set(sources.filter((s) => kinds.includes(s.kind)).map((s) => s.id));
  const targets = Object.values(prior).flatMap((r) =>
    r.claims.flatMap((c) => c.sourceIds.filter((id) => legal.has(id)).map((sourceId) => ({ claimId: c.id, sourceId }))),
  );
  return [...new Map(targets.map((t) => [JSON.stringify(t), t])).values()];
}
