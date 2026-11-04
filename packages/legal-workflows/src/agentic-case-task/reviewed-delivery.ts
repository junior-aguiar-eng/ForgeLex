import {
  AgenticTaskDeliverySchema,
  TaskReviewMetadataSchema,
  type AgenticTaskDelivery,
  type TaskSource,
} from '@forgelex/domain';
import type { TaskSpecialistResult } from '@forgelex/legal-agents';
import type { z } from 'zod';
import { createHash } from 'node:crypto';
type Metadata = z.infer<typeof TaskReviewMetadataSchema>;
type ReviewedResult = TaskSpecialistResult & { review?: Metadata };
const sourceKey = (ids: string[]) => JSON.stringify([...new Set(ids)].sort());
const literalKey = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const aspects = ['PARTIES', 'CAUSE', 'DUE_DATE', 'CREDIT_LINK'] as const;

export function assertPublicTaskText(value: unknown, internalIds: string[]) {
  const hidden = internalIds.filter((id) => id.length >= 12);
  const inspect = (value: unknown, key = '') => {
    if (
      typeof value === 'string' &&
      ['statement', 'content', 'title', 'conclusion', 'quote', 'prompt', 'reason'].includes(key) &&
      hidden.some((id) => value.includes(id))
    ) {
      const id = hidden.find((id) => value.includes(id))!;
      throw Object.assign(new Error('INTERNAL_IDENTIFIER_IN_OUTPUT'), {
        diagnostic: {
          errorType: 'Error',
          failureCode: 'INTERNAL_IDENTIFIER_IN_OUTPUT',
          failureClass: 'CONTRACT',
          publicField: key,
          identifierHash: createHash('sha256').update(id).digest('hex'),
        },
      });
    }
    if (Array.isArray(value)) for (const item of value) inspect(item, key);
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) inspect(item, name);
  };
  inspect(value);
}
/** Only explanatory findings/requirements may resolve analytical references.
 * Never rewrite quotations, documentary claims, documents, or private binding IDs. */
export function resolvePublicAnalyticalReferences<T extends ReviewedResult>(
  result: T,
  prior: Record<string, TaskSpecialistResult>,
): T {
  const descriptions = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const item of Object.values(prior).flatMap((r) => [...r.claims, ...r.requirements, ...r.findings])) {
    if (item.id.length < 12) continue;
    if (descriptions.has(item.id) && descriptions.get(item.id) !== item.statement) ambiguous.add(item.id);
    descriptions.set(item.id, item.statement);
  }
  for (const id of ambiguous) descriptions.delete(id);
  const output = structuredClone(result);
  if (!descriptions.size) return output;
  const escaped = [...descriptions.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const references = new RegExp(`(?<![A-Za-z0-9_:-])(?:${escaped.join('|')})(?![A-Za-z0-9_:-])`, 'g');
  for (const item of [...output.findings, ...output.requirements])
    item.statement = item.statement.replace(references, (id) => `“${descriptions.get(id)!}”`);
  return output;
}

export function validateReviewedResult(result: ReviewedResult, sources: TaskSource[], internalIds: string[] = []) {
  assertPublicTaskText(result, internalIds);
  const byId = new Map(sources.map((s) => [s.id, s]));
  for (const claim of result.claims)
    if (claim.classification === 'DOCUMENT_RECORD') {
      const source = claim.sourceIds.length === 1 ? byId.get(claim.sourceIds[0]) : undefined;
      if (!source || source.kind !== 'DOCUMENT') throw new Error('DOCUMENT_RECORD_SOURCE_INVALID');
      if (!source.text.includes(claim.statement)) throw new Error('DOCUMENT_RECORD_NOT_LITERAL');
    }
  const metadata = TaskReviewMetadataSchema.parse(result.review ?? {});
  const seen = new Set<string>();
  for (const assessment of metadata.documentAssessments ?? []) {
    const source = byId.get(assessment.sourceId);
    if (!source || source.kind !== 'DOCUMENT' || seen.has(source.id))
      throw new Error('DOCUMENT_ASSESSMENT_SOURCE_INVALID');
    seen.add(source.id);
    if (new Set(assessment.aspects.map((a) => a.aspect)).size !== 4) throw new Error('DOCUMENT_ASSESSMENT_INCOMPLETE');
    for (const aspect of assessment.aspects) {
      if (aspect.status === 'PRESENT' && !aspect.quote) throw new Error('DOCUMENT_ASSESSMENT_QUOTE_REQUIRED');
      if (aspect.quote && !source.text.includes(aspect.quote)) throw new Error('DOCUMENT_ASSESSMENT_QUOTE_MISMATCH');
    }
  }
  for (const signal of metadata.integritySignals ?? []) {
    const source = byId.get(signal.sourceId);
    if (!source || !['DOCUMENT', 'DRAFT'].includes(source.kind) || !source.text.includes(signal.quote))
      throw new Error('INTEGRITY_SIGNAL_INVALID');
  }
}

/** Exact duplicates and explicit model equivalences only; no fuzzy deletion of distinct facts or qualifications. */
export function consolidateReviewedDelivery(
  delivery: AgenticTaskDelivery,
  results: ReviewedResult[],
  sources: TaskSource[],
  plan: { gaps: { prompt: string; reason: string; sourceIds: string[]; material: boolean; deliveryImpact?: string }[] },
): AgenticTaskDelivery {
  const original = structuredClone({
    claims: delivery.claims,
    requirements: delivery.requirements,
    findings: delivery.findings,
  });
  const provenance: NonNullable<AgenticTaskDelivery['review']>['provenance'] = [];
  const mappings = new Map<string, string>();
  const groups = results.flatMap((r) => r.review?.equivalences ?? []);
  function consolidate<T extends { id: string; statement: string; sourceIds: string[] }>(
    kind: 'claim' | 'finding' | 'requirement',
    items: T[],
  ): T[] {
    const parent = new Map(items.map((i) => [i.id, i.id]));
    const byId = new Map(items.map((i) => [i.id, i]));
    const root = (id: string): string => {
      let cursor = id;
      const seen = new Set<string>();
      while (parent.get(cursor) !== cursor) {
        if (seen.has(cursor) || !parent.has(cursor)) throw new Error('CONSOLIDATION_REFERENCE_INVALID');
        seen.add(cursor);
        cursor = parent.get(cursor)!;
      }
      return cursor;
    };
    const signature = (item: T) => {
      const x = item as T & { classification?: string; kind?: string; verified?: boolean; severity?: string };
      return JSON.stringify([x.classification, x.kind, x.verified, x.severity, sourceKey(x.sourceIds)]);
    };
    const exact = new Map<string, string>();
    for (const item of items) {
      const key = signature(item) + literalKey(item.statement);
      const previous = exact.get(key);
      if (previous) parent.set(item.id, previous);
      else exact.set(key, item.id);
    }
    for (const group of groups.filter((g) => g.kind === kind)) {
      if (
        !group.memberIds.includes(group.retainedId) ||
        new Set(group.memberIds).size !== group.memberIds.length ||
        group.memberIds.some((id) => !byId.has(id))
      )
        throw new Error('CONSOLIDATION_REFERENCE_INVALID');
      const retained = byId.get(group.retainedId)!;
      if (group.memberIds.some((id) => signature(byId.get(id)!) !== signature(retained)))
        throw new Error('CONSOLIDATION_INCOMPATIBLE');
      const target = root(group.retainedId);
      for (const id of group.memberIds) parent.set(root(id), target);
    }
    const final = items.filter((i) => root(i.id) === i.id);
    for (const item of final) {
      const originIds = items.filter((i) => root(i.id) === item.id).map((i) => i.id);
      provenance.push({ kind, id: item.id, originIds });
      for (const id of originIds) mappings.set(`${kind}:${id}`, item.id);
    }
    return final;
  }
  const claims = consolidate('claim', delivery.claims);
  const matrixIds = delivery.evidenceMatrix
    ? [
        ...delivery.evidenceMatrix.rows.map((r) => r.claimId),
        ...delivery.evidenceMatrix.chronology.flatMap((e) => e.claimIds),
        ...delivery.evidenceMatrix.contradictions.flatMap((c) => c.claimIds),
      ]
    : [];
  if (matrixIds.some((id) => (mappings.get(`claim:${id}`) ?? id) !== id))
    throw new Error('CONSOLIDATION_MATRIX_REFERENCE_CONFLICT');
  // A model's editorial self-check cannot mark a proposed edit as human-verified.
  const requirements = consolidate(
    'requirement',
    delivery.requirements.map((r) => ({ ...r, ...(r.kind === 'EDITORIAL' ? { verified: false } : {}) })),
  );
  const audit = new Map<string, NonNullable<AgenticTaskDelivery['supportAudit']>[number]>();
  for (const entry of delivery.supportAudit ?? []) {
    const claimId = mappings.get(`claim:${entry.claimId}`) ?? entry.claimId,
      key = JSON.stringify([claimId, entry.sourceId]);
    const previous = audit.get(key),
      next = { ...entry, claimId };
    if (previous && JSON.stringify(previous) !== JSON.stringify(next))
      audit.set(key, {
        claimId,
        sourceId: entry.sourceId,
        sourceContentHash: entry.sourceContentHash,
        quoteStatus: 'CONFLICTING',
        modelAssessment: 'NOT_ASSESSED',
      });
    else audit.set(key, next);
  }
  const technicalFindings = delivery.findings.filter((f) => f.code === 'CAPABILITY_UNAVAILABLE' || !f.sourceIds.length);
  const filtered = delivery.findings.filter(
    (f) =>
      ![
        'EDITORIAL_REQUIREMENT_UNVERIFIED',
        'PROCEDURAL_REQUIREMENT_UNVERIFIED',
        'CITATION_WITHOUT_SUPPORT',
        'CAPABILITY_UNAVAILABLE',
      ].includes(f.code) && f.sourceIds.length,
  );
  // Validate declared finding groups against the full originals before keeping the user-facing subset.
  const consolidatedFindings = consolidate('finding', delivery.findings);
  const allowed = new Set(filtered.map((f) => mappings.get(`finding:${f.id}`) ?? f.id));
  const findings = consolidatedFindings.filter((f) => allowed.has(f.id));
  // A single public warning per claim; the audit retains each source's separate verdict.
  const unsupportedSources = new Map<string, string[]>();
  for (const entry of audit.values())
    if (entry.quoteStatus !== 'MATCHED' || entry.modelAssessment !== 'SUPPORTED') {
      const ids = unsupportedSources.get(entry.claimId) ?? [];
      if (!ids.includes(entry.sourceId)) ids.push(entry.sourceId);
      unsupportedSources.set(entry.claimId, ids);
    }
  for (const [claimId, sourceIds] of unsupportedSources) {
    const claim = claims.find((c) => c.id === claimId)!;
    findings.push({
      id: `support:${createHash('sha256')
        .update(JSON.stringify([claimId, [...sourceIds].sort()]))
        .digest('hex')}`,
      code: 'CITATION_WITHOUT_SUPPORT',
      severity: 'BLOCKING',
      statement: `Suporte a conferir para “${claim.statement}”: há fontes citadas cujo trecho, individualmente, não demonstra integralmente essa proposição. Conferir as avaliações por fonte.`,
      sourceIds,
    });
  }
  const assessments = new Map<string, NonNullable<AgenticTaskDelivery['review']>['documentAssessments'][number]>();
  for (const result of results) {
    validateReviewedResult(result, sources);
    for (const assessment of result.review?.documentAssessments ?? []) {
      const previous = assessments.get(assessment.sourceId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(assessment)) {
        assessments.set(assessment.sourceId, {
          sourceId: assessment.sourceId,
          aspects: aspects.map((aspect) => ({ aspect, status: 'AMBIGUOUS' })),
          conclusion:
            'Há avaliações documentais divergentes entre as etapas; conferir o recorte antes de concluir vínculo ou exigibilidade.',
        });
      } else assessments.set(assessment.sourceId, assessment);
    }
  }
  for (const source of sources.filter((s) => s.kind === 'DOCUMENT'))
    if (!assessments.has(source.id))
      assessments.set(source.id, {
        sourceId: source.id,
        aspects: aspects.map((aspect) => ({ aspect, status: 'AMBIGUOUS' })),
        conclusion:
          'A aptidão deste recorte ainda não foi examinada quanto a partes, causa, vencimento e vínculo. Não presumir existência ou inexistência do crédito.',
      });
  const integrityAlerts: NonNullable<AgenticTaskDelivery['review']>['integrityAlerts'] = [];
  for (const source of sources.filter((s) => s.kind === 'DOCUMENT')) {
    const flagged =
      results.some((r) =>
        r.review?.integritySignals?.some((s) => s.sourceId === source.id && s.kind === 'EMBEDDED_INSTRUCTION'),
      ) ||
      /ignore.{0,60}(?:instruções|regras)|(?:instrução|instruções).{0,30}(?:assistente|assistant)|(?:revele|exponha).{0,40}(?:identificador|identificadores|segredo|token)|(?:system|assistant)\s*:/iu.test(
        source.text,
      );
    if (flagged)
      integrityAlerts.push({
        kind: 'EMBEDDED_INSTRUCTION',
        statement:
          'Possível instrução embutida no documento: conferir origem e integridade do arquivo. O conteúdo permanece dado não confiável, nunca comando.',
        sourceIds: [source.id],
      });
  }
  if (integrityAlerts.length)
    for (const draft of sources.filter((s) => s.kind === 'DRAFT'))
      integrityAlerts.push({
        kind: 'DERIVED_TEXT_REVIEW',
        statement:
          'Conferir como o rascunho foi produzido e se incorporou instruções do documento. Há risco de contaminação, não confirmação de adulteração.',
        sourceIds: [draft.id],
      });
  for (const result of results)
    for (const signal of result.review?.integritySignals ?? [])
      if (signal.kind === 'ADVERSE_TO_REPRESENTED_PARTY')
        integrityAlerts.push({
          kind: signal.kind,
          statement: `Revisar possível conflito com o interesse declarado da parte no trecho “${signal.quote}”. A avaliação é proposta, não conclusão jurídica.`,
          sourceIds: [signal.sourceId],
        });
  return AgenticTaskDeliverySchema.parse({
    ...delivery,
    status:
      integrityAlerts.length ||
      plan.gaps.some((gap) => gap.material) ||
      [...assessments.values()].some((assessment) =>
        assessment.aspects.some((aspect) => aspect.status === 'AMBIGUOUS' || aspect.status === 'NOT_PROVIDED'),
      )
        ? 'LIMITED'
        : delivery.status,
    claims,
    requirements,
    findings,
    supportAudit: [...audit.values()],
    review: {
      version: 1,
      original,
      provenance,
      technicalFindings,
      questions: plan.gaps
        .filter((g) => g.material)
        .map(({ prompt, reason, sourceIds }) => ({ prompt, reason, sourceIds })),
      documentAssessments: [...assessments.values()],
      integrityAlerts,
    },
  });
}
