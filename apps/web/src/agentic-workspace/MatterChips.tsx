import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { WorkspaceClient } from './client';

export interface MatterChip {
  token: string;
  label: string;
}

const MAX_MATTERS = 5;

type Step =
  | { kind: 'closed' }
  | { kind: 'asking'; busy: boolean; message?: string }
  | { kind: 'proposed'; suggestion: MatterChip; text: string; rejected: string[]; busy: boolean };

/**
 * Matérias do pedido como chips (U4). O cliente descreve a matéria em poucas palavras e a Mesa sugere uma por vez, sem
 * mostrar lista. A matéria confirmada vira dica no pedido; o conteúdo do catálogo continua oculto.
 */
export function MatterChips({
  client,
  chips,
  area,
  disabled,
  onChange,
}: {
  client: WorkspaceClient;
  chips: readonly MatterChip[];
  area?: string | null;
  disabled: boolean;
  onChange: (chips: MatterChip[]) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'closed' });
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');
  const full = chips.length >= MAX_MATTERS;

  const ask = async (value: string, rejected: string[]) => {
    const typed = value.trim();
    if (!typed) return;
    setStep(step.kind === 'proposed' ? { ...step, busy: true } : { kind: 'asking', busy: true });
    try {
      const { suggestion } = await client.suggestMatter({
        text: typed,
        ...(area ? { area } : {}),
        ...(rejected.length ? { rejected } : {}),
      });
      if (!suggestion) {
        setStep({
          kind: 'asking',
          busy: false,
          message: rejected.length
            ? 'Não há outra matéria parecida. Descreva de outro jeito ou siga sem matéria.'
            : 'Não encontrei uma matéria para isso. Descreva de outro jeito ou siga sem matéria.',
        });
        setStatus('Nenhuma matéria encontrada.');
        return;
      }
      setStep({ kind: 'proposed', suggestion, text: typed, rejected, busy: false });
      setStatus(`Matéria sugerida: ${suggestion.label}.`);
    } catch {
      setStep({ kind: 'asking', busy: false, message: 'Não foi possível sugerir uma matéria agora. Tente de novo.' });
    }
  };

  const close = () => {
    setStep({ kind: 'closed' });
    setText('');
    requestAnimationFrame(() => addButton.current?.focus());
  };

  const button = 'min-h-11 rounded-lg px-3 text-sm font-medium text-cognac-800 hover:bg-ivory-100 disabled:opacity-50';
  return (
    <section aria-label="Matérias do pedido" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {chips.length > 0 && (
          <ul aria-label="Matérias do pedido" className="contents">
            {chips.map((chip) => (
              <li
                key={chip.token}
                className="inline-flex min-h-11 items-center gap-1 rounded-full bg-champagne-light pl-3 pr-1 text-sm text-cognac-900"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remover matéria: ${chip.label}`}
                  className="inline-flex size-9 items-center justify-center rounded-full hover:bg-cognac-100 disabled:opacity-50"
                  onClick={() => {
                    onChange(chips.filter((item) => item.token !== chip.token));
                    setStatus(`Matéria removida: ${chip.label}.`);
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {step.kind === 'closed' && (
          <button
            ref={addButton}
            type="button"
            disabled={disabled || full}
            title={full ? `Até ${MAX_MATTERS} matérias por pedido` : undefined}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-cognac-800 hover:bg-ivory-100 disabled:opacity-50"
            onClick={() => {
              setStep({ kind: 'asking', busy: false });
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <Plus size={14} aria-hidden="true" /> Adicionar matéria
          </button>
        )}
      </div>
      {step.kind === 'asking' && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(text, []);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <label className="block text-sm font-medium text-stone-800">
            Qual matéria você quer incluir? Escreva em poucas palavras.
            <input
              ref={input}
              value={text}
              maxLength={200}
              disabled={step.busy}
              onChange={(event) => setText(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-normal focus-visible:border-cognac-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cognac-700"
            />
          </label>
          {step.message && (
            <p role="note" className="text-sm text-stone-700">
              {step.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={step.busy || !text.trim()} className={button}>
              Sugerir matéria
            </button>
            <button type="button" disabled={step.busy} className={button} onClick={close}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {step.kind === 'proposed' && (
        <div
          role="group"
          aria-label="Matéria sugerida"
          className="space-y-2 rounded-xl border border-stone-200 bg-white p-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <p className="text-sm text-stone-900">
            Pelo que você escreveu, a matéria é: <strong>{step.suggestion.label}</strong>. Está correto?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={step.busy}
              className={button}
              onClick={() => {
                if (!chips.some((chip) => chip.token === step.suggestion.token)) {
                  onChange([...chips, step.suggestion]);
                }
                setStatus(`Matéria adicionada: ${step.suggestion.label}.`);
                close();
              }}
            >
              Sim, adicionar
            </button>
            <button
              type="button"
              disabled={step.busy}
              className={button}
              onClick={() => void ask(step.text, [...step.rejected, step.suggestion.token])}
            >
              Não, outra
            </button>
            <button type="button" disabled={step.busy} className={button} onClick={close}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
    </section>
  );
}
