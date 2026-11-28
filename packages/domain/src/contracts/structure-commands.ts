import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { EvidenceReviewItem } from './evidence-review.js';
import type { TaskSource } from './agentic-case-task.js';
import { structureItemLabels } from './structure-labels.js';
import { exceedsSourceTextLimit } from './agentic-limits.js';

const ItemIdSchema = z.string().regex(/^[a-f0-9]{64}$/);

export { structureItemLabels };

const STRUCTURE_LIST_MAX_ITEMS = 1000;

/**
 * E3: reserved id prefix of the server-assembled source that gives the drafting agent the case structure.
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
