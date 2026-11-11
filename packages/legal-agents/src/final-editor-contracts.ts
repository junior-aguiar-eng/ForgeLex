import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  TaskClaimSchema,
  TaskDocumentSchema,
  StoredTaskDocumentSchema,
  TaskFindingSchema,
  TaskRequirementSchema,
  TaskSourceSchema,
  TaskSupportAuditSchema,
} from '@forgelex/domain';

const id = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim().length > 0);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// UTF-8 encoding replaces lone surrogates with U+FFFD, losing text identity.
// In Unicode mode this range matches lone surrogates, not valid pairs.
const wellFormedUnicode = (value: string) => !/[\uD800-\uDFFF]/u.test(value);
const unicodeText = z.string().refine(wellFormedUnicode, 'Texto Unicode malformado.');
const exactText = (max: number) =>
  unicodeText
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0);
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const envelope = {
  contractVersion: z.literal('1.0.0'),
  contextId: id,
  contextRevision: z.number().int().positive(),
  deliveryId: id,
  draftId: id,
  versionId: id,
  documentHash: digest,
};

// Domain parsing trims content. Anchors must instead address the original text.
const documentSchema = StoredTaskDocumentSchema.extend({
  sections: z
    .array(
      StoredTaskDocumentSchema.shape.sections.element.extend({
        content: unicodeText.max(16000),
      }),
    )
    .min(1)
    .max(30),
});

export const FinalEditorialContextSchema = z
  .strictObject({
    ...envelope,
    origin: z.enum(['DESK_VERSION', 'SCOPED_DELIVERY']).optional(),
    document: documentSchema,
    claims: z.array(TaskClaimSchema).max(100),
    requirements: z.array(TaskRequirementSchema).max(100),
    findings: z.array(TaskFindingSchema).max(200),
    supportAudit: z.array(TaskSupportAuditSchema).max(10000),
    sources: z
      .array(
        TaskSourceSchema.extend({
          text: TaskSourceSchema.shape.text.refine(wellFormedUnicode, 'Texto Unicode malformado.'),
        }),
      )
      .max(100),
  })
  .superRefine((context, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const canonicalDocument = (
      context.origin === 'SCOPED_DELIVERY' ? StoredTaskDocumentSchema : TaskDocumentSchema
    ).safeParse(context.document);
    if (!canonicalDocument.success) {
      issue(['document'], 'Documento inválido.');
      return;
    }
    if (hash(JSON.stringify(canonicalDocument.data)) !== context.documentHash)
      issue(['documentHash'], 'Hash do documento divergente.');

    const sources = new Map(context.sources.map((source) => [source.id, source]));
    const claims = new Map(context.claims.map((claim) => [claim.id, claim]));
    for (const collection of ['sources', 'claims', 'requirements', 'findings'] as const) {
      const seen = new Set<string>();
      context[collection].forEach((item, index) => {
        if (seen.has(item.id)) issue([collection, index, 'id'], 'ID duplicado.');
        seen.add(item.id);
      });
    }
    context.sources.forEach((source, index) => {
      if (hash(source.text) !== source.contentHash)
        issue(['sources', index, 'contentHash'], 'Hash da fonte divergente.');
    });
    const checkRefs = (refs: string[], path: (string | number)[]) => {
      refs.forEach((ref, index) => {
        if (!sources.has(ref)) issue([...path, index], 'Fonte ausente do contexto.');
      });
    };
    context.document.sections.forEach((section, index) =>
      checkRefs(section.sourceIds, ['document', 'sections', index, 'sourceIds']),
    );
    for (const collection of ['claims', 'requirements', 'findings'] as const)
      context[collection].forEach((item, index) => checkRefs(item.sourceIds, [collection, index, 'sourceIds']));
    const auditPairs = new Set<string>();
    context.supportAudit.forEach((audit, index) => {
      const pair = JSON.stringify([audit.claimId, audit.sourceId]);
      if (auditPairs.has(pair)) issue(['supportAudit', index], 'Auditoria duplicada para o par claim/fonte.');
      auditPairs.add(pair);
      const claim = claims.get(audit.claimId);
      const source = sources.get(audit.sourceId);
      if (!claim) issue(['supportAudit', index, 'claimId'], 'Claim ausente do contexto.');
      if (!source || !claim?.sourceIds.includes(audit.sourceId))
        issue(['supportAudit', index, 'sourceId'], 'Fonte ausente do claim.');
      if (source && source.contentHash !== audit.sourceContentHash)
        issue(['supportAudit', index, 'sourceContentHash'], 'Hash da auditoria divergente.');
    });
  });
export type FinalEditorialContext = z.infer<typeof FinalEditorialContextSchema>;

const anchor = {
  id,
  sectionIndex: z.number().int().nonnegative(),
  sectionHash: digest,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  before: unicodeText.min(1).max(4000),
  reason: exactText(4000),
  sourceIds: z.array(id).max(100),
};
const changeSchema = z.strictObject({
  ...anchor,
  category: z.enum(['GRAMMAR', 'CLARITY', 'CONSISTENCY']),
  after: exactText(4000),
});
const suggestionSchema = z.strictObject(anchor);
export const FinalEditorialProposalSchema = z
  .strictObject({
    ...envelope,
    status: z.enum(['CANDIDATE', 'LIMITED']),
    humanReviewRequired: z.literal(true),
    legalAssessment: z.literal('NOT_EVALUATED'),
    changes: z.array(changeSchema).max(30),
    substantiveSuggestions: z.array(suggestionSchema).max(30),
    limitations: z.array(exactText(4000)).max(20),
  })
  .superRefine((proposal, ctx) => {
    if (proposal.status === 'LIMITED' && proposal.limitations.length === 0)
      ctx.addIssue({ code: 'custom', path: ['limitations'], message: 'LIMITED exige limitação explícita.' });
  });
export type FinalEditorialProposal = z.infer<typeof FinalEditorialProposalSchema>;

function splitsSurrogatePair(content: string, offset: number): boolean {
  const left = content.charCodeAt(offset - 1);
  const right = content.charCodeAt(offset);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
}

/**
 * Validates a proposal without applying it or changing its input.
 * The caller must load an authorized persisted delivery. This check proves neither
 * that provenance nor semantic equivalence, legal support or human approval.
 */
export function validateFinalEditorialProposal(inputContext: unknown, inputProposal: unknown): FinalEditorialProposal {
  const context = FinalEditorialContextSchema.parse(inputContext);
  const proposal = FinalEditorialProposalSchema.parse(inputProposal);
  const issues: z.core.$ZodIssue[] = [];
  const issue = (path: (string | number)[], message: string) => issues.push({ code: 'custom', path, message });
  for (const key of Object.keys(envelope) as (keyof typeof envelope)[])
    if (proposal[key] !== context[key]) issue([key], 'Identidade ou versão divergente do contexto.');
  if (context.origin === 'DESK_VERSION' && (proposal.status !== 'LIMITED' || proposal.limitations.length === 0))
    issue(['limitations'], 'Revisão de texto da mesa exige ressalva sobre suporte jurídico não auditado.');
  const sourceIds = new Set(context.sources.map((source) => source.id));
  const ids = new Set<string>();
  for (const collection of ['changes', 'substantiveSuggestions'] as const) {
    proposal[collection].forEach((item, index) => {
      const path = [collection, index];
      if (ids.has(item.id)) issue([...path, 'id'], 'ID de proposta duplicado.');
      ids.add(item.id);
      item.sourceIds.forEach((ref, refIndex) => {
        if (!sourceIds.has(ref)) issue([...path, 'sourceIds', refIndex], 'Fonte ausente do contexto.');
      });
      const section = context.document.sections[item.sectionIndex];
      if (!section) {
        issue([...path, 'sectionIndex'], 'Seção inexistente.');
        return;
      }
      if (hash(section.content) !== item.sectionHash) issue([...path, 'sectionHash'], 'Hash da seção divergente.');
      if (
        item.start >= item.end ||
        item.end > section.content.length ||
        splitsSurrogatePair(section.content, item.start) ||
        splitsSurrogatePair(section.content, item.end)
      )
        issue([...path, 'start'], 'Intervalo UTF-16 inválido.');
      if (section.content.slice(item.start, item.end) !== item.before)
        issue([...path, 'before'], 'Trecho diferente do conteúdo original.');
    });
  }
  const ordered = proposal.changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => a.change.sectionIndex - b.change.sectionIndex || a.change.start - b.change.start);
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1].change;
    const current = ordered[index];
    if (previous.sectionIndex === current.change.sectionIndex && previous.end > current.change.start)
      issue(['changes', current.index, 'start'], 'Mudanças sobrepostas.');
  }
  if (issues.length) throw new z.ZodError(issues);
  return proposal;
}
