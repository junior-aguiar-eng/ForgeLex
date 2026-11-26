import { createHash } from 'node:crypto';
import { exceedsSourceTextLimit, type AgenticTaskDelivery, type TaskSource } from '@forgelex/domain';

/** Prefixo reservado da fonte com o histórico do caso montada pelo servidor. */
export const CASE_HISTORY_SOURCE_PREFIX = 'case-history:';
/** Teto do histórico, abaixo do limite de uma fonte, para sobrar espaço ao pedido e aos anexos. */
const CASE_HISTORY_MAX_CHARS = 60_000;
const DOCUMENT_MAX_CHARS = 12_000;

export interface CaseHistoryEntry {
  conversationId: string;
  objective: string;
  delivery: AgenticTaskDelivery;
}

const cut = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}… [cortado]` : value);

function entryOf({ objective, delivery }: CaseHistoryEntry, documentMax: number) {
  return {
    pedido: cut(objective, 2000),
    acao: delivery.action,
    ...(delivery.issues.length ? { questoes: delivery.issues.map((issue) => issue.statement) } : {}),
    ...(delivery.claims.length
      ? { afirmacoes: delivery.claims.map((claim) => `${claim.classification}: ${claim.statement}`) }
      : {}),
    ...(delivery.document && documentMax > 0
      ? {
          peca: {
            titulo: delivery.document.title,
            texto: cut(
              delivery.document.sections.map((section) => `${section.title}\n${section.content}`).join('\n\n'),
              documentMax,
            ),
          },
        }
      : {}),
  };
}

/**
 * Regra do mínimo (26/11/2026): uma conversa nova dentro de um caso recebe, sem botão nem etapa, o que as conversas
 * anteriores do mesmo caso produziram (pedido, questões, afirmações e peça). É resultado de IA, não prova: a fonte diz
 * isso. O excesso sai pelas conversas mais antigas e, depois, pelo texto das peças; nunca é erro.
 */
export function caseHistorySource(matterId: string, entries: readonly CaseHistoryEntry[]): TaskSource | undefined {
  if (!entries.length) return undefined;
  const build = (count: number, documentMax: number) =>
    JSON.stringify({
      aviso:
        'Conversas anteriores deste caso, da mais recente para a mais antiga. É resultado de IA ainda sujeito a revisão humana: use como contexto, nunca como prova, lei ou jurisprudência.',
      ...(count < entries.length ? { omitidas: entries.length - count } : {}),
      conversas: entries.slice(0, count).map((entry) => entryOf(entry, documentMax)),
    });
  let count = entries.length;
  let documentMax = DOCUMENT_MAX_CHARS;
  let text = build(count, documentMax);
  while ((text.length > CASE_HISTORY_MAX_CHARS || exceedsSourceTextLimit(text)) && count > 1)
    text = build(--count, documentMax);
  while ((text.length > CASE_HISTORY_MAX_CHARS || exceedsSourceTextLimit(text)) && documentMax > 0)
    text = build(count, (documentMax = documentMax > 1000 ? Math.floor(documentMax / 2) : 0));
  if (text.length > CASE_HISTORY_MAX_CHARS || exceedsSourceTextLimit(text)) return undefined;
  const key = createHash('sha256')
    .update(`${matterId}:${entries.map((entry) => entry.conversationId).join(',')}`)
    .digest('hex')
    .slice(0, 32);
  return {
    id: `${CASE_HISTORY_SOURCE_PREFIX}${key}`,
    kind: 'PREVIOUS_DELIVERY',
    text,
    contentHash: createHash('sha256').update(text).digest('hex'),
    extent: 'SELECTED_TEXT',
  };
}
