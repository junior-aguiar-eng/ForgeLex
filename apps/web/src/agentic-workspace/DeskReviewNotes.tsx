import { useState, type ReactNode } from 'react';
import type { EditorialItem, EditorialProposal, EditorialReview } from './editorial-review-model';

/** One comment at a time, next to the editable document; no approval form. */
export function DeskReviewNotes({
  review,
  proposal,
  disabled,
  controls,
  onAsk,
  onLocate,
  onApply,
}: {
  review: EditorialReview | null;
  proposal: EditorialProposal | null;
  disabled: boolean;
  controls: ReactNode;
  onAsk?: (text: string) => void;
  onLocate?: (index: number) => void;
  onApply: (item: EditorialItem) => void;
}) {
  const [index, setIndex] = useState(0);
  const points = [
    ...(review?.context?.findings.filter((f) => f.code !== 'LEGAL_SUPPORT_NOT_EVALUATED') ?? []).map((f) => ({
      id: f.id,
      reason: f.statement,
      item: undefined as EditorialItem | undefined,
    })),
    ...(proposal
      ? [...proposal.changes, ...proposal.substantiveSuggestions].map((item) => ({
          id: item.id,
          reason: item.reason,
          item,
        }))
      : []),
  ];
  const point = points[Math.min(index, Math.max(0, points.length - 1))];
  return (
    <div className="space-y-3 text-sm">
      {controls}
      {point && (
        <div className="border-l-2 border-cognac-300 pl-3" aria-label="Apontamento da revisão">
          {points.length > 1 && (
            <div className="mb-2 flex items-center gap-3 text-xs text-stone-500">
              <button
                type="button"
                aria-label="Apontamento anterior"
                disabled={index === 0}
                onClick={() => setIndex((i) => i - 1)}
                className="min-h-9 px-2 disabled:opacity-30"
              >
                ←
              </button>
              <span>
                {Math.min(index + 1, points.length)} de {points.length}
              </span>
              <button
                type="button"
                aria-label="Próximo apontamento"
                disabled={index >= points.length - 1}
                onClick={() => setIndex((i) => i + 1)}
                className="min-h-9 px-2 disabled:opacity-30"
              >
                →
              </button>
            </div>
          )}
          {point.item && (
            <blockquote className="mb-2 whitespace-pre-wrap text-stone-600">{point.item.before}</blockquote>
          )}
          <p className="break-words">{point.reason}</p>
          {point.item?.after !== undefined && (
            <p className="mt-2 whitespace-pre-wrap text-cognac-900">
              <span className="text-xs text-stone-500">Sugestão: </span>
              {point.item.after}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3">
            {point.item && (
              <button
                type="button"
                onClick={() => onLocate?.(point.item!.sectionIndex)}
                className="min-h-10 text-cognac-800"
              >
                Ver trecho
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAsk?.(`Sobre este apontamento na peça: ${point.reason}\n\nGostaria de: `)}
              className="min-h-10 text-cognac-800 disabled:opacity-40"
            >
              Pedir ajuste na conversa
            </button>
            {point.item?.after !== undefined && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onApply(point.item!)}
                className="min-h-10 font-medium text-cognac-800 disabled:opacity-40"
              >
                Aplicar esta sugestão
              </button>
            )}
          </div>
        </div>
      )}
      {proposal && !points.length && <p>Nenhuma alteração sugerida nesta revisão.</p>}
      <p className="text-xs text-stone-500">
        Você decide o que mudar. A revisão não valida fatos nem o mérito jurídico.
      </p>
      {!!proposal?.limitations.length && (
        <details className="text-xs text-stone-500">
          <summary className="cursor-pointer">Limites da revisão</summary>
          {proposal.limitations.map((text, i) => (
            <p key={i} className="mt-2">
              {text}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
