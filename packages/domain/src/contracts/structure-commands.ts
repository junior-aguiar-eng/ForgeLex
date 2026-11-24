import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { EvidenceReviewCommand, EvidenceReviewItem } from './evidence-review.js';
import type { TaskSource } from './agentic-case-task.js';
// Pure numbering lives in its own module (no Node imports) so the web tab can reuse it.
import { structureItemLabels } from './structure-labels.js';
import { exceedsSourceTextLimit } from './agentic-limits.js';

const ItemIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const TextoSchema = z.string().trim().min(3).max(4000);

export const StructureCommandSchema = z.discriminatedUnion('op', [
  z
    .strictObject({
      op: z.literal('ALTERAR'),
      itemId: ItemIdSchema,
      texto: TextoSchema.optional(),
      dataEvento: z.string().date().optional(),
    })
    .refine((v) => v.texto !== undefined || v.dataEvento !== undefined, 'Informe texto ou dataEvento.'),
  z.strictObject({ op: z.literal('REMOVER'), itemId: ItemIdSchema }),
  z.strictObject({
    op: z.literal('ACRESCENTAR'),
    texto: TextoSchema,
    frase: z.string().trim().min(1).max(2000),
  }),
]);
export type StructureCommand = z.infer<typeof StructureCommandSchema>;

export const StructureCommandsSchema = z.array(StructureCommandSchema).min(1).max(20);

/**
 * Result of the adjust_structure action, stored with the delivery. Commands may be empty when every reference was
 * ambiguous: the agent omits a command instead of guessing, and says why in its findings.
 */
export const StructureAdjustmentSchema = z.strictObject({
  commands: z.array(StructureCommandSchema).max(20),
  caseSummary: z.string().trim().min(1).max(1500),
});
export type StructureAdjustment = z.infer<typeof StructureAdjustmentSchema>;

export { structureItemLabels };

/** Reserved id prefix of the server-assembled source that lists the items of the current analysis. */
export const STRUCTURE_ITEMS_SOURCE_PREFIX = 'structure:';
const StructureListedItemSchema = z.strictObject({
  id: ItemIdSchema,
  label: z.string().optional(),
  kind: z.enum(['FACT', 'EVIDENCE', 'GAP', 'ISSUE', 'TIMELINE']),
  classification: z.string(),
  text: z.string(),
  dateText: z.string().optional(),
  eventDate: z.string().optional(),
  decided: z.literal(true).optional(),
  userAdded: z.literal(true).optional(),
});
const STRUCTURE_LIST_MAX_ITEMS = 1000;
const StructureListSchema = z.strictObject({ items: z.array(StructureListedItemSchema).max(STRUCTURE_LIST_MAX_ITEMS) });

/**
 * One PREVIOUS_DELIVERY source with the items of the current analysis (id and text), so the agent can resolve the
 * user's reference. Built by the server from the evidence review; it is analysis output, not documentary proof.
 */
export function structureItemsSource(
  deliveryId: string,
  items: readonly EvidenceReviewItem[],
  decidedIds: ReadonlySet<string>,
): TaskSource {
  // A list that does not fit one source is the same limit as any oversized context: a coded error, never a raw
  // validation failure.
  if (items.length > STRUCTURE_LIST_MAX_ITEMS) throw new Error('TASK_CONTEXT_LIMIT');
  const labels = structureItemLabels(items);
  const text = JSON.stringify(
    StructureListSchema.parse({
      items: items.map((item) => ({
        id: item.id,
        ...(labels.has(item.id) ? { label: labels.get(item.id) } : {}),
        kind: item.kind,
        classification: item.classification,
        text: item.text,
        ...(item.dateText ? { dateText: item.dateText } : {}),
        ...(item.eventDate ? { eventDate: item.eventDate } : {}),
        ...(decidedIds.has(item.id) ? { decided: true } : {}),
        ...(item.userAdded ? { userAdded: true } : {}),
      })),
    }),
  );
  if (exceedsSourceTextLimit(text)) throw new Error('TASK_CONTEXT_LIMIT');
  return {
    id: `${STRUCTURE_ITEMS_SOURCE_PREFIX}${deliveryId}`,
    kind: 'PREVIOUS_DELIVERY',
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
    extent: 'SELECTED_TEXT',
  };
}

/** Item ids listed by the structure source; undefined when the packet has none. Two lists are a conflict. */
export function readStructureItemIds(sources: readonly TaskSource[]): Set<string> | undefined {
  const found = sources.filter((s) => s.kind === 'PREVIOUS_DELIVERY' && s.id.startsWith(STRUCTURE_ITEMS_SOURCE_PREFIX));
  if (!found.length) return undefined;
  const source = found[0]!;
  if (found.length > 1 || createHash('sha256').update(source.text).digest('hex') !== source.contentHash)
    throw new Error('STRUCTURE_SOURCE_CONFLICT');
  try {
    return new Set(StructureListSchema.parse(JSON.parse(source.text)).items.map((i) => i.id));
  } catch {
    throw new Error('STRUCTURE_SOURCE_CONFLICT');
  }
}

/**
 * E3: reserved id prefix of the server-assembled source that gives the drafting agent the case structure. It does not
 * start with `structure:`, so `readStructureItemIds` (the adjust_structure list) never sees it.
 */
export const STRUCTURE_CONTEXT_SOURCE_PREFIX = 'structure-context:';
const StructureContextItemSchema = z.strictObject({
  id: ItemIdSchema,
  label: z.string().optional(),
  kind: z.enum(['FACT', 'EVIDENCE', 'GAP', 'ISSUE', 'TIMELINE']),
  classification: z.string(),
  text: z.string(),
  dateText: z.string().optional(),
  eventDate: z.string().optional(),
  state: z.enum(['CONFIRMADO', 'A_CONFIRMAR']),
  userAdded: z.literal(true).optional(),
});
const StructureContextSchema = z.strictObject({
  summary: z.string().optional(),
  /** One line per document of the case (E4): piece type and parties when the analysis identified them. */
  documents: z.array(z.string().max(600)).max(60).optional(),
  omitted: z.number().int().positive().optional(),
  items: z.array(StructureContextItemSchema).max(STRUCTURE_LIST_MAX_ITEMS),
});

/** Items of the structure the final piece leaned on without the user having checked them yet. */
export const StructureUseSchema = z
  .array(z.strictObject({ itemId: ItemIdSchema, label: z.string().optional() }))
  .max(100);
export type StructureUse = z.infer<typeof StructureUseSchema>;

/**
 * One PREVIOUS_DELIVERY source with the case structure for drafting: the summary, the confirmed items and the ones
 * still waiting for the user's check, in that order. Items the user discarded never appear. Too much text is cut from
 * the tail (never an error) and the source says how many items were left out. Analysis output, not documentary proof.
 */
export function structureContextSource(
  deliveryId: string,
  items: readonly EvidenceReviewItem[],
  decisions: ReadonlyMap<string, 'ADOPT' | 'DISCARD'>,
  summary?: string,
  documents: readonly string[] = [],
): TaskSource | undefined {
  const labels = structureItemLabels(items);
  const kept = items.filter((item) => decisions.get(item.id) !== 'DISCARD');
  const entries = kept
    .map((item) => ({
      id: item.id,
      ...(labels.has(item.id) ? { label: labels.get(item.id) } : {}),
      kind: item.kind,
      classification: item.classification,
      text: item.text,
      ...(item.dateText ? { dateText: item.dateText } : {}),
      ...(item.eventDate ? { eventDate: item.eventDate } : {}),
      state: decisions.get(item.id) === 'ADOPT' ? ('CONFIRMADO' as const) : ('A_CONFIRMAR' as const),
      ...(item.userAdded ? { userAdded: true as const } : {}),
    }))
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'CONFIRMADO' ? -1 : 1))
    .slice(0, STRUCTURE_LIST_MAX_ITEMS);
  const trimmedSummary = summary?.trim() || undefined;
  if (!entries.length && !trimmedSummary) return undefined;
  const build = (count: number) =>
    JSON.stringify(
      StructureContextSchema.parse({
        ...(trimmedSummary ? { summary: trimmedSummary } : {}),
        ...(documents.length ? { documents: [...documents] } : {}),
        ...(count < kept.length ? { omitted: kept.length - count } : {}),
        items: entries.slice(0, count),
      }),
    );
  let count = entries.length;
  let text = build(count);
  while (exceedsSourceTextLimit(text) && count > 0) text = build(--count);
  if (exceedsSourceTextLimit(text)) return undefined;
  return {
    id: `${STRUCTURE_CONTEXT_SOURCE_PREFIX}${deliveryId}`,
    kind: 'PREVIOUS_DELIVERY',
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
    extent: 'SELECTED_TEXT',
  };
}

/** Items still `A_CONFIRMAR` in the packet's structure-context source; undefined when there is none. */
export function readStructureContext(
  sources: readonly TaskSource[],
): ReadonlyMap<string, { label?: string; state: 'A_CONFIRMAR' }> | undefined {
  const found = sources.filter(
    (s) => s.kind === 'PREVIOUS_DELIVERY' && s.id.startsWith(STRUCTURE_CONTEXT_SOURCE_PREFIX),
  );
  if (!found.length) return undefined;
  const source = found[0]!;
  if (found.length > 1 || createHash('sha256').update(source.text).digest('hex') !== source.contentHash)
    throw new Error('STRUCTURE_SOURCE_CONFLICT');
  try {
    const parsed = StructureContextSchema.parse(JSON.parse(source.text));
    return new Map(
      parsed.items
        .filter((i) => i.state === 'A_CONFIRMAR')
        .map((i) => [i.id, { ...(i.label ? { label: i.label } : {}), state: 'A_CONFIRMAR' as const }]),
    );
  } catch {
    throw new Error('STRUCTURE_SOURCE_CONFLICT');
  }
}

export const STRUCTURE_QUESTION_REASONS = [
  'ITEM_DESCONHECIDO',
  'JA_DECIDIDO',
  'DATA_SO_PARA_LINHA_DO_TEMPO',
  'SEM_EFEITO',
  // Applying: the current analysis is not the one the agent read; nothing was applied.
  'ANALISE_ALTERADA',
  // Applying: the phrase the agent cited is not in the user's request; the item was not added.
  'FRASE_NAO_ENCONTRADA',
  // Applying: adding would pass the review's cap of items added by the user; none was added.
  'LIMITE_DE_ITENS',
  // Applying: the item cannot be adopted as is (blocked source, evidence without source, timeline without date).
  'ITEM_BLOQUEADO',
  // Applying: ALTERAR on an item the user added; confirming it into the case needs the user's explicit confirmation.
  'ITEM_INFORMADO_A_CONFIRMAR',
] as const;
export type StructureQuestionReason = (typeof STRUCTURE_QUESTION_REASONS)[number];
export interface StructureQuestion {
  itemId?: string;
  /** Text of an ACRESCENTAR command that was not added. */
  texto?: string;
  reason: StructureQuestionReason;
}
/** Outcome of applying one adjust_structure work, kept with the review of the analysis it targeted. */
export interface StructureAdjustmentRecord {
  executionId: string;
  applied: number;
  questions: StructureQuestion[];
  caseSummary?: string;
  recordedAt: string;
}
export interface StructureResolution {
  decisions: EvidenceReviewCommand['decisions'];
  added: { texto: string; frase: string }[];
  questions: StructureQuestion[];
}

type Outcome = { decision: EvidenceReviewCommand['decisions'][number] } | { question: StructureQuestion };

/** Pure: turns adjust commands into review decisions, additions and questions. The last command per item wins. */
export function resolveStructureCommands(input: {
  items: EvidenceReviewItem[];
  decidedIds: ReadonlySet<string>;
  commands: StructureCommand[];
}): StructureResolution {
  const byId = new Map(input.items.map((i) => [i.id, i]));
  const outcomes = new Map<string, Outcome>();
  const added: StructureResolution['added'] = [];

  for (const cmd of input.commands) {
    if (cmd.op === 'ACRESCENTAR') {
      added.push({ texto: cmd.texto, frase: cmd.frase });
      continue;
    }
    // Last command per item wins; re-insert so order follows the winning command.
    outcomes.delete(cmd.itemId);
    const item = byId.get(cmd.itemId);
    if (!item) {
      outcomes.set(cmd.itemId, { question: { itemId: cmd.itemId, reason: 'ITEM_DESCONHECIDO' } });
    } else if (input.decidedIds.has(cmd.itemId)) {
      outcomes.set(cmd.itemId, { question: { itemId: cmd.itemId, reason: 'JA_DECIDIDO' } });
    } else if (cmd.op === 'REMOVER') {
      outcomes.set(cmd.itemId, { decision: { itemId: cmd.itemId, action: 'DISCARD' } });
    } else if (cmd.dataEvento !== undefined && item.kind !== 'TIMELINE') {
      outcomes.set(cmd.itemId, { question: { itemId: cmd.itemId, reason: 'DATA_SO_PARA_LINHA_DO_TEMPO' } });
    } else {
      const text = cmd.texto !== undefined && cmd.texto !== item.text ? cmd.texto : undefined;
      const eventDate = cmd.dataEvento !== undefined && cmd.dataEvento !== item.eventDate ? cmd.dataEvento : undefined;
      if (text === undefined && eventDate === undefined) {
        outcomes.set(cmd.itemId, { question: { itemId: cmd.itemId, reason: 'SEM_EFEITO' } });
      } else {
        outcomes.set(cmd.itemId, {
          decision: {
            itemId: cmd.itemId,
            action: 'ADOPT',
            ...(text !== undefined ? { text } : {}),
            ...(eventDate !== undefined ? { eventDate } : {}),
          },
        });
      }
    }
  }

  const decisions: StructureResolution['decisions'] = [];
  const questions: StructureQuestion[] = [];
  for (const o of outcomes.values()) {
    if ('decision' in o) decisions.push(o.decision);
    else questions.push(o.question);
  }
  return { decisions, added, questions };
}
