import { useId, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  guidanceDecisionText,
  askedGuidanceFields,
  guidanceLabels,
  guidanceSummaryText,
  type GuidanceField,
  type GuidanceState,
} from './guidance-model';

export function GuidanceSummary({
  state,
  disabled,
  onEdit,
  onLeave,
}: {
  state: GuidanceState;
  disabled: boolean;
  onEdit: (field: GuidanceField) => void;
  onLeave: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const fields = askedGuidanceFields(state);
  const labels = fields.map((field) => guidanceSummaryText(state, field)).filter(Boolean);
  if (!fields.length)
    return (
      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled}
          onClick={onLeave}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-cognac-100"
        >
          Voltar ao pedido livre
        </button>
      </div>
    );
  return (
    <section
      aria-label="Resumo do pedido"
      className="min-w-0 px-1"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          setExpanded(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="flex min-h-11 items-center gap-2">
        <p className="min-w-0 break-words py-2 text-sm leading-snug text-stone-700">{labels.join(' · ')}</p>
        <button
          ref={toggle}
          type="button"
          disabled={disabled}
          aria-expanded={expanded}
          aria-controls={list}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-cognac-100"
          onClick={() => setExpanded((value) => !value)}
        >
          <Pencil size={15} aria-hidden="true" /> Alterar
        </button>
      </div>
      <div id={list} hidden={!expanded} className="max-w-sm border-l border-stone-200 pl-2">
        {fields.map((field) => (
          <button
            key={field}
            type="button"
            disabled={disabled}
            aria-label={`Alterar ${guidanceLabels[field].toLowerCase()}`}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-ivory-200"
            onClick={() => {
              setExpanded(false);
              onEdit(field);
            }}
          >
            <span className="font-medium text-stone-800">{guidanceLabels[field]}</span>
            <span className="min-w-0 break-words text-right text-stone-600">{guidanceDecisionText(state, field)}</span>
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onLeave}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-cognac-100"
        >
          Voltar ao pedido livre
        </button>
      </div>
    </section>
  );
}
