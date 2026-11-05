import { useState } from 'react';
import type { EditorialProposal, EditorialReview } from './editorial-review-model';

export function EditorialApplicationControls({
  review,
  proposal,
  disabled,
  apply,
}: {
  review: EditorialReview;
  proposal: EditorialProposal;
  disabled: boolean;
  apply: (selection: { proposalHash: string; itemIds: string[]; reason: string; confirmed: true }) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const events = review.history.filter(
    (e) => e.contextHash === review.contextHash && JSON.stringify(e.proposal) === JSON.stringify(proposal),
  );
  const accepted = proposal.changes
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => events.filter((e) => e.decision.itemId === item.id).at(-1)?.decision.action === 'ACCEPT');
  const proposalHash = events.at(-1)?.proposalHash;
  if (!accepted.length || !proposalHash || review.stale || review.application) return null;
  return (
    <fieldset disabled={disabled} className="my-4 min-w-0 space-y-3 rounded-xl border border-champagne-border p-4">
      <legend className="px-1 font-semibold">Criar versão com ajustes conferidos</legend>
      <p className="text-sm text-stone-600">
        Selecione os ajustes aceitos que deseja aplicar. A versão original será preservada; a nova versão será um
        rascunho que exige conferência. Sugestões substantivas não são aplicadas.
      </p>
      {accepted.map(({ item, index }) => (
        <label key={item.id} className="flex min-h-11 items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            aria-label={`Aplicar ajuste editorial ${index + 1}`}
            checked={selected.includes(item.id)}
            onChange={(e) => {
              setConfirmed(false);
              setSelected((old) => (e.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id)));
            }}
          />
          <span>
            Aplicar ajuste editorial {index + 1}
            <span className="mt-1 block break-words whitespace-pre-wrap text-stone-600">
              {item.before} → {item.after}
            </span>
          </span>
        </label>
      ))}
      <label className="block text-sm">
        Fundamento da aplicação
        <textarea
          className="mt-1 w-full rounded border border-stone-300 p-2"
          maxLength={1000}
          rows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>Confirmo criar uma nova versão com os ajustes selecionados.</span>
      </label>
      <button
        className="btn-secondary min-h-11"
        disabled={!selected.length || reason.trim().length < 3 || !confirmed}
        onClick={() => {
          if (!disabled && selected.length && reason.trim().length >= 3 && confirmed)
            apply({ proposalHash, itemIds: selected, reason, confirmed: true });
        }}
      >
        Criar nova versão com selecionadas
      </button>
    </fieldset>
  );
}
