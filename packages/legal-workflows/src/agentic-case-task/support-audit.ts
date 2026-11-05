import type { TaskSource, TaskSupportAudit } from '@forgelex/domain';
import type { TaskSpecialistResult } from '@forgelex/legal-agents';

/** Check referential/literal integrity only. Semantic support remains the model's assessment. */
export function auditClaimSupport(
  claims: TaskSpecialistResult['claims'],
  sources: TaskSource[],
  checks: TaskSpecialistResult['supportChecks'],
  includeDocuments = false,
): { entries: TaskSupportAudit[]; invalidChecks: boolean } {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const kinds = includeDocuments ? ['AUTHORITY', 'NORM', 'DOCUMENT', 'USER_TEXT', 'ANSWER'] : ['AUTHORITY', 'NORM'];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const checksByPair = new Map<string, TaskSpecialistResult['supportChecks']>();
  const key = (claimId: string, sourceId: string) => JSON.stringify([claimId, sourceId]);
  let invalidChecks = false;
  for (const check of checks) {
    const source = sourceById.get(check.sourceId);
    if (!source || !kinds.includes(source.kind) || !claimById.get(check.claimId)?.sourceIds.includes(check.sourceId)) {
      invalidChecks = true;
      continue;
    }
    const pair = key(check.claimId, check.sourceId);
    checksByPair.set(pair, [...(checksByPair.get(pair) ?? []), check]);
  }
  const entries: TaskSupportAudit[] = [];
  for (const claim of claims)
    for (const sourceId of new Set(claim.sourceIds)) {
      const source = sourceById.get(sourceId);
      if (!source || !kinds.includes(source.kind)) continue;
      const pairChecks = checksByPair.get(key(claim.id, sourceId)) ?? [];
      const unique = pairChecks.length === 1 ? pairChecks[0] : undefined;
      if (pairChecks.length > 1) invalidChecks = true;
      entries.push({
        claimId: claim.id,
        sourceId,
        sourceContentHash: source.contentHash,
        ...(unique ? { quote: unique.quote } : {}),
        quoteStatus:
          pairChecks.length > 1
            ? 'CONFLICTING'
            : !unique
              ? 'MISSING'
              : source.text.includes(unique.quote)
                ? 'MATCHED'
                : 'MISMATCH',
        modelAssessment: unique?.assessment ?? 'NOT_ASSESSED',
      });
    }
  return { entries, invalidChecks };
}
