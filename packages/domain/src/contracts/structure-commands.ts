import { z } from 'zod';
import type { EvidenceReviewCommand, EvidenceReviewItem } from './evidence-review.js';

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

export type StructureQuestionReason =
  'ITEM_DESCONHECIDO' | 'JA_DECIDIDO' | 'DATA_SO_PARA_LINHA_DO_TEMPO' | 'SEM_EFEITO';
export interface StructureQuestion {
  itemId?: string;
  reason: StructureQuestionReason;
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
