import type { BlockOrigin, PresentedBlock } from '../agentic-workspace/present-delivery';
import type {
  EvidenceReviewDecision,
  EvidenceReviewItem,
  StructureAdjustmentRecord,
  StructureQuestion,
  StructureQuestionReason,
} from '../../../../packages/domain/src/index';
// Mesma numeração do agente (F1…, P1…): reaproveitada do domínio, nunca reimplementada aqui.
import { structureItemLabels } from '../../../../packages/domain/src/contracts/structure-labels';

/** Um item da estrutura do caso: o texto, a classificação (alegação, inferência…) e as fontes que o sustentam. */
export interface StructureEntry {
  kind: 'item' | 'paragraph';
  text: string;
  tag?: string;
  citations: number[];
  /** Como o usuário se refere ao item na conversa: F1, F2… (fatos) e P1, P2… (provas). */
  label?: string;
  /** Item que o usuário acrescentou pela conversa: não é prova e não tem fonte. */
  userAdded?: boolean;
  /** Selo do item acrescentado ("informado por você, a confirmar"). */
  seal?: string;
  /** Frase do usuário que originou o item acrescentado. */
  frase?: string;
  /** O que o usuário mudou: texto corrigido (com o anterior) ou item retirado. */
  change?: { kind: 'corrected'; before: string } | { kind: 'removed' };
}

/** Uma parte da estrutura, como "Questões", "Afirmações", "Cronologia" ou "Contradições". */
export interface StructureSection {
  title: string;
  entries: StructureEntry[];
}

/** O que a aba lê da revisão da análise (`GET /api/agentic/deliveries/:id/evidence-review`). */
export type StructureReviewItem = Pick<EvidenceReviewItem, 'id' | 'kind' | 'text' | 'originIds' | 'eventDate'> & {
  references: { sourceId: string; start: number; quote?: string }[];
  userAdded?: EvidenceReviewItem['userAdded'];
};
export interface StructureReview {
  items: StructureReviewItem[];
  decisions: Record<string, Pick<EvidenceReviewDecision, 'action' | 'text' | 'eventDate'>>;
  adjustments?: Record<string, StructureAdjustmentRecord>;
}

/** Título das linhas que a análise emite antes de qualquer cabeçalho, para não ficarem soltas. */
export const STRUCTURE_LEAD_TITLE = 'Em síntese';
/** Parte com os itens que o usuário acrescentou pela conversa. */
export const USER_ADDED_TITLE = 'Informado por você';
export const USER_ADDED_SEAL = 'informado por você, a confirmar';
const USER_ADDED_CONFIRMED = 'informado por você, confirmado';

const matches = (item: StructureReviewItem, origin: BlockOrigin) =>
  !item.userAdded &&
  item.kind === origin.kind &&
  item.originIds[0] === origin.originId &&
  (origin.text === undefined || item.text === origin.text) &&
  (origin.ref === undefined ||
    (item.references[0]?.sourceId === origin.ref.sourceId && item.references[0]?.start === origin.ref.start));

/** Texto corrigido de um item: na cronologia, a data e a descrição, como a aba já mostra o evento. */
function correction(
  item: StructureReviewItem,
  decision: StructureReview['decisions'][string],
  shown: string,
): { text: string; before: string } | undefined {
  const textChanged = decision.text !== item.text;
  const dateChanged =
    item.kind === 'TIMELINE' && decision.eventDate !== undefined && decision.eventDate !== item.eventDate;
  if (!textChanged && !dateChanged) return undefined;
  const text =
    item.kind === 'TIMELINE'
      ? `${decision.eventDate ?? item.eventDate ?? 'Data a confirmar'} — ${decision.text}`
      : decision.text;
  return { text, before: shown };
}

function reviewed(entry: StructureEntry, item: StructureReviewItem, review: StructureReview, label?: string) {
  const decision = review.decisions[item.id];
  const next: StructureEntry = { ...entry, ...(label ? { label } : {}) };
  if (decision?.action === 'DISCARD') next.change = { kind: 'removed' };
  else if (decision?.action === 'ADOPT') {
    const corrected = correction(item, decision, entry.text);
    if (corrected) {
      next.text = corrected.text;
      next.change = { kind: 'corrected', before: corrected.before };
    }
  }
  return next;
}

/**
 * Agrupa os blocos que a Mesa já sabe apresentar (cabeçalho, parágrafo, item) em partes com título. Os blocos que vêm
 * antes de qualquer cabeçalho formam a primeira parte; cabeçalho sem nada embaixo não vira parte. Com a revisão da
 * análise (E2), cada fato e prova ganha o número que o agente também usa, o que o usuário corrigiu ou retirou fica
 * marcado, e os itens que ele acrescentou aparecem numa parte própria, com o selo e sem fonte.
 */
export function structureSections(blocks: readonly PresentedBlock[], review?: StructureReview): StructureSection[] {
  const labels = review ? structureItemLabels(review.items) : new Map<string, string>();
  const sections: StructureSection[] = [];
  let current: StructureSection | undefined;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      current = { title: block.text, entries: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: STRUCTURE_LEAD_TITLE, entries: [] };
      sections.push(current);
    }
    const entry: StructureEntry = {
      kind: block.kind,
      text: block.text,
      ...(block.tag ? { tag: block.tag } : {}),
      citations: block.citations,
    };
    const origin = block.origin;
    const item = review && origin ? review.items.find((candidate) => matches(candidate, origin)) : undefined;
    current.entries.push(item && review ? reviewed(entry, item, review, labels.get(item.id)) : entry);
  }
  const added = (review?.items ?? []).filter((item) => item.userAdded);
  if (review && added.length)
    sections.push({
      title: USER_ADDED_TITLE,
      entries: added.map((item) => {
        const decision = review.decisions[item.id];
        const label = labels.get(item.id);
        return {
          kind: 'item',
          text: item.text,
          citations: [],
          ...(label ? { label } : {}),
          userAdded: true,
          seal: decision?.action === 'ADOPT' ? USER_ADDED_CONFIRMED : USER_ADDED_SEAL,
          frase: item.userAdded!.frase,
          ...(decision?.action === 'DISCARD' ? { change: { kind: 'removed' as const } } : {}),
        };
      }),
    });
  return sections.filter((section) => section.entries.length > 0);
}

/** Quantos itens a estrutura tem no total (cabeçalhos não contam). */
export function structureSize(sections: readonly StructureSection[]): number {
  return sections.reduce((total, section) => total + section.entries.length, 0);
}

const byRecent = (review?: StructureReview) =>
  Object.values(review?.adjustments ?? {}).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

/** Resumo curto do caso: o do ajuste mais recente que trouxe um. */
export function structureSummary(review?: StructureReview): string | undefined {
  return byRecent(review)
    .find((record) => record.caseSummary?.trim())
    ?.caseSummary?.trim();
}

/** Frase simples para cada motivo; `{item}` é o número do item (F2, P1) ou "um item". O usuário nunca vê o código. */
const QUESTION_TEXT: Record<StructureQuestionReason, string> = {
  ITEM_DESCONHECIDO:
    'Não identifiquei a qual item você se referiu. Diga o número dele (por exemplo, F2 ou P1) ou repita o texto.',
  JA_DECIDIDO: '{item} já tinha sido confirmado ou retirado antes; não mudei nada nele.',
  DATA_SO_PARA_LINHA_DO_TEMPO:
    'A data só pode ser corrigida nos eventos da cronologia; {item} não foi alterado. Se quiser, corrija o texto dele.',
  SEM_EFEITO: 'A correção pedida para {item} já estava como você disse; nada mudou.',
  ANALISE_ALTERADA: 'A análise do caso mudou enquanto eu trabalhava, e nenhuma correção foi aplicada. Peça de novo.',
  FRASE_NAO_ENCONTRADA:
    'Não consegui ligar o item novo ao que você escreveu, e ele não foi acrescentado{texto}. Peça de novo com suas palavras.',
  LIMITE_DE_ITENS: 'Esta análise já tem itens demais informados por você; os novos não foram acrescentados.',
  ITEM_BLOQUEADO:
    '{item} não pode ser confirmado como está (fonte indisponível, prova sem trecho ou evento sem data). Confira as fontes.',
  ITEM_INFORMADO_A_CONFIRMAR:
    '{item} foi informado por você e ainda está a confirmar, por isso não mudei o texto. Se quiser, peça para retirá-lo e diga o texto certo.',
};
const FALLBACK_QUESTION = 'Parte do pedido não pôde ser aplicada. Confira a estrutura e peça de novo, se precisar.';

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function questionText(question: StructureQuestion, labels: Map<string, string>): string {
  const template = QUESTION_TEXT[question.reason] ?? FALLBACK_QUESTION;
  const item = (question.itemId && labels.get(question.itemId)) || 'um item';
  const texto = question.texto ? ` (“${question.texto}”)` : '';
  return capitalized(template.replace('{item}', item).replace('{texto}', texto));
}

/** Pontos a conferir do ajuste mais recente, em português simples, com o número do item quando há um. */
export function structureQuestions(review?: StructureReview): string[] {
  const latest = byRecent(review)[0];
  if (!review || !latest) return [];
  const labels = structureItemLabels(review.items);
  const lines: string[] = [];
  for (const question of latest.questions) {
    const line = questionText(question, labels);
    if (!lines.includes(line)) lines.push(line);
  }
  return lines;
}

/**
 * Aviso de que uma análise nova substituiu a anterior (E2): o que o usuário mudou pela conversa ficou na revisão da
 * análise anterior e não foi reaplicado. Conta os itens que ele acrescentou e as decisões tomadas sobre os demais. Sem
 * análise anterior, ou sem nenhuma correção pela conversa nela, não há aviso.
 */
export function replacedCorrectionsNotice(previous?: StructureReview): string | undefined {
  if (!previous) return undefined;
  const added = previous.items.filter((item) => item.userAdded);
  if (!added.length && !Object.keys(previous.adjustments ?? {}).length) return undefined;
  const addedIds = new Set(added.map((item) => item.id));
  const count = added.length + Object.keys(previous.decisions).filter((id) => !addedIds.has(id)).length;
  if (!count) return undefined;
  const what =
    count === 1
      ? '1 correção feita pela conversa não foi reaplicada'
      : `${count} correções feitas pela conversa não foram reaplicadas`;
  return `Uma análise nova substituiu a anterior; ${what}. Diga de novo o que quiser manter.`;
}

/**
 * Linha de leitura da estrutura para a orientação guiada ("Estrutura do caso: 5 fatos, 2 itens a confirmar"). Conta os
 * fatos que o usuário não retirou e os itens (exceto lacunas) ainda sem decisão. Sem itens, não há linha.
 */
export function structureReadingLine(review?: StructureReview): string | undefined {
  const kept = (review?.items ?? []).filter((item) => review?.decisions[item.id]?.action !== 'DISCARD');
  const facts = kept.filter((item) => item.kind === 'FACT').length;
  const unchecked = kept.filter((item) => item.kind !== 'GAP' && !review?.decisions[item.id]).length;
  if (!facts && !unchecked) return undefined;
  const parts = [
    ...(facts ? [`${facts} ${facts === 1 ? 'fato' : 'fatos'}`] : []),
    unchecked ? `${unchecked} ${unchecked === 1 ? 'item a confirmar' : 'itens a confirmar'}` : 'tudo conferido',
  ];
  return `Estrutura do caso: ${parts.join(', ')}`;
}
