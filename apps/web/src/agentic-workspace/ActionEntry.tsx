import { useState } from 'react';
import type { PublicAction, ActionId } from './execution-model';
export function ActionEntry({
  actions,
  busy,
  onPrepare,
  initialAction,
  initialText = '',
  initialPurpose = '',
}: {
  actions: PublicAction[];
  busy: boolean;
  initialAction?: ActionId;
  initialText?: string;
  initialPurpose?: string;
  onPrepare: (objective: string, action: ActionId | undefined, draft: { text: string; purpose: string }) => void;
}) {
  const [action, setAction] = useState<PublicAction | undefined>(() => actions.find((a) => a.id === initialAction)),
    [text, setText] = useState(initialText),
    [purpose, setPurpose] = useState(initialPurpose);
  return (
    <section aria-label="Iniciar trabalho" className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((a) => (
          <button
            type="button"
            key={a.id}
            aria-pressed={action?.id === a.id}
            className={`min-h-12 rounded-xl border p-3 text-left ${action?.id === a.id ? 'border-cognac-700 bg-cognac-50' : 'border-stone-200'}`}
            onClick={() => {
              setAction(a);
              setPurpose('');
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const goal = [text.trim(), purpose && `Finalidade informada: ${purpose}`].filter(Boolean).join('\n');
          if (goal) onPrepare(goal, action?.id, { text, purpose });
        }}
      >
        {action && (
          <fieldset className="min-w-0 space-y-2">
            <legend className="font-semibold">{action.dialogue[0]?.prompt}</legend>
            {action.dialogue[0]?.options.map((o) => (
              <label className="flex min-h-11 items-center gap-3" key={o}>
                <input type="radio" name="purpose" checked={purpose === o} onChange={() => setPurpose(o)} />
                {o}
              </label>
            ))}
          </fieldset>
        )}
        <label className="block font-medium">
          O que você precisa fazer?
          <textarea
            className="mt-2 w-full rounded-xl border border-stone-300 p-3 font-normal"
            maxLength={15000}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Descreva sua necessidade. Você pode começar sem escolher uma ação ou modelo de peça."
          />
        </label>
        <p className="text-sm text-stone-600">
          Texto livre permanece disponível. Se a finalidade já estiver clara no pedido, não é necessário escolher uma
          opção.
        </p>
        <button type="submit" className="btn-primary min-h-11" disabled={busy || (!text.trim() && !purpose)}>
          Definir escopo
        </button>
      </form>
    </section>
  );
}
