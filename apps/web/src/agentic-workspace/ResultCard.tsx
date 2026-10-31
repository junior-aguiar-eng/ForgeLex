import { useState } from 'react';
import { deliveryPlainText, type PresentedDelivery } from './present-delivery';
import { editorLink, type Delivery, type Execution } from './execution-model';
import { CASE_WORKSPACE_ENABLED } from '../config/site-capabilities';

const marker =
  'mx-0.5 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-cognac-400 bg-cognac-50 px-1.5 align-super text-xs font-semibold leading-none text-cognac-900 hover:bg-cognac-100';

/** The deliverable as the lawyer reads it: a text with numbered sources. Everything else lives in the side table. */
export function ResultCard({
  run,
  delivery,
  view,
  activeSource,
  onSource,
  onPending,
  onSources,
  onEditor,
  receipt,
}: {
  run: Execution;
  delivery: Delivery;
  view: PresentedDelivery;
  activeSource: number | null;
  onSource: (n: number) => void;
  onPending: () => void;
  onSources: () => void;
  onEditor: (url: string) => void;
  receipt?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const link = CASE_WORKSPACE_ENABLED ? editorLink(run, delivery) : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deliveryPlainText(view));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const cites = (numbers: number[]) =>
    numbers.map((n) => (
      <button
        key={n}
        type="button"
        aria-label={`Fonte ${n}`}
        aria-pressed={activeSource === n}
        className={marker + (activeSource === n ? ' bg-champagne-light' : '')}
        onClick={() => onSource(n)}
      >
        {n}
      </button>
    ));
  return (
    <article
      aria-label="Resultado do trabalho"
      data-delivery-id={delivery.id}
      className="space-y-5 rounded-2xl border border-champagne-border bg-white p-5 shadow-card sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="break-words font-editorial text-2xl text-stone-900">{view.title}</h2>
        {view.pending.length > 0 && (
          <button
            type="button"
            className="min-h-11 rounded-full border border-cognac-400 bg-cognac-50 px-4 text-sm font-medium text-cognac-900"
            onClick={onPending}
          >
            {view.pending.length} {view.pending.length === 1 ? 'ponto' : 'pontos'} a conferir
          </button>
        )}
      </div>
      <p className="text-sm text-stone-600">Preliminar: exige a sua revisão antes de qualquer uso.</p>
      <div className="space-y-4 break-words font-serif leading-8 text-stone-900">
        {view.blocks.map((block, i) =>
          block.kind === 'heading' ? (
            <h3 key={i} className="pt-2 font-sans text-xs font-semibold uppercase tracking-wide text-stone-600">
              {block.text}
            </h3>
          ) : (
            <p key={i} className="whitespace-pre-wrap">
              {block.tag && (
                <span className="mr-2 font-sans text-xs font-semibold uppercase text-stone-600">{block.tag}</span>
              )}
              {block.text}
              {cites(block.citations)}
            </p>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-champagne-border-subtle pt-4">
        {link && (
          <a
            href={link}
            className="btn-primary inline-flex min-h-11 items-center"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                e.preventDefault();
                onEditor(link);
              }
            }}
          >
            Editar minuta
          </a>
        )}
        <button type="button" className="btn-secondary min-h-11" onClick={() => void copy()}>
          {copied ? 'Texto copiado' : 'Copiar texto'}
        </button>
        {view.sources.length > 0 && (
          <button type="button" className="btn-secondary min-h-11" onClick={onSources}>
            Fontes ({view.sources.length})
          </button>
        )}
      </div>
      {receipt}
    </article>
  );
}
