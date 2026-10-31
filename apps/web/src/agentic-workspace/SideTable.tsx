import { useEffect, useRef } from 'react';
import type { Context, Execution } from './execution-model';
import { sourceLink } from './execution-model';
import type { PresentedDelivery, PresentedSource } from './present-delivery';
import type { DocumentSource } from '../documents/document-reader-model';

export type SideTab = 'sources' | 'pending' | 'context';

const tab = (on: boolean) =>
  `min-h-11 rounded-lg border px-3 text-sm font-medium ${on ? 'border-cognac-600 bg-cognac-100 text-cognac-900' : 'border-transparent text-stone-700 hover:bg-ivory-100'}`;

function sourceNote(s: PresentedSource): string {
  if (s.kind === 'AUTHORITY')
    return s.source.identityStatus?.startsWith('VERIFIED') ? 'Identidade conferida.' : 'Identidade não conferida.';
  if (s.kind === 'NORM') return 'Texto de lei. Vigência e aplicação ao caso estão por conferir.';
  return (
    (
      {
        ANSWER: 'Resposta que você deu ao agente.',
        USER_TEXT: 'Contexto que você escreveu.',
        DRAFT: 'Minuta do caso que você selecionou.',
        PREVIOUS_DELIVERY: 'Resultado de um trabalho anterior.',
      } as Record<string, string>
    )[s.kind] ?? ''
  );
}

function SourceCard({
  source,
  active,
  matterId,
  titles,
  onRead,
}: {
  source: PresentedSource;
  active: boolean;
  matterId: string | null;
  titles: Record<string, string>;
  onRead: (source: DocumentSource) => void;
}) {
  const link = sourceLink(source.source, matterId);
  const title = source.source.documentId ? titles[source.source.documentId] : undefined;
  const note = sourceNote(source);
  return (
    <li
      data-source-number={source.n}
      className={`space-y-1 rounded-xl bg-white p-4 ${active ? 'border-2 border-cognac-600' : 'border border-champagne-border'}`}
    >
      <p className="text-sm text-stone-600">
        Fonte {source.n} · {source.label}
      </p>
      {title && <p className="break-words font-semibold text-stone-900">{title}</p>}
      {note && <p className="text-sm text-stone-700">{note}</p>}
      {typeof link === 'string' ? (
        <a
          className="inline-flex min-h-11 items-center text-cognac-700 underline"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir fonte externa
        </a>
      ) : link ? (
        <button className="min-h-11 text-cognac-700 underline" onClick={() => onRead(link)}>
          Abrir documento
        </button>
      ) : null}
    </li>
  );
}

/** The side table: sources, points to check and the context the agent worked from. */
export function SideTable({
  tab: current,
  onTab,
  onClose,
  view,
  activeSource,
  run,
  context,
  titles,
  onRead,
  onEditor,
  contextOnly = false,
}: {
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  onClose: () => void;
  view: PresentedDelivery | undefined;
  activeSource: number | null;
  run: Execution;
  context: Context;
  titles: Record<string, string>;
  onRead: (source: DocumentSource) => void;
  onEditor: (url: string) => void;
  /** Access to the case changed: only the lawyer's own written context remains. */
  contextOnly?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // On narrow screens the table stacks below the text: bring it into view when it opens or changes.
    if (window.matchMedia?.('(max-width: 1023px)').matches) ref.current?.scrollIntoView?.({ block: 'start' });
  }, [current, activeSource]);
  const matterId = contextOnly ? null : run.matterId;
  current = contextOnly ? 'context' : current;
  return (
    <aside
      ref={ref}
      aria-label="Mesa lateral"
      className="min-w-0 space-y-4 rounded-2xl border border-champagne-border bg-ivory-50 p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
    >
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Seções da mesa lateral" className="flex flex-1 flex-wrap gap-1">
          {!contextOnly && (
            <>
              <button
                aria-pressed={current === 'sources'}
                className={tab(current === 'sources')}
                onClick={() => onTab('sources')}
              >
                Fontes{view ? ` (${view.sources.length})` : ''}
              </button>
              <button
                aria-pressed={current === 'pending'}
                className={tab(current === 'pending')}
                onClick={() => onTab('pending')}
              >
                A conferir{view ? ` (${view.pending.length})` : ''}
              </button>
            </>
          )}
          <button
            aria-pressed={current === 'context'}
            className={tab(current === 'context')}
            onClick={() => onTab('context')}
          >
            Contexto
          </button>
        </div>
        <button
          aria-label="Fechar mesa lateral"
          className="min-h-11 min-w-11 rounded-lg text-xl text-stone-800"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {current === 'sources' &&
        (view?.sources.length ? (
          <ul className="space-y-3">
            {view.sources.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                active={activeSource === s.n}
                matterId={matterId}
                titles={titles}
                onRead={onRead}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-700">Este resultado não cita fontes.</p>
        ))}

      {current === 'pending' && (
        <div className="space-y-3">
          {view?.pending.length ? (
            <ul className="space-y-3">
              {view.pending.map((point) => (
                <li
                  key={point}
                  className="break-words rounded-xl border border-champagne-border bg-white p-4 text-stone-900"
                >
                  {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-700">Nenhum ponto adicional foi apontado.</p>
          )}
          <p className="text-sm text-stone-600">
            Este resultado é preliminar e exige a sua revisão antes de qualquer uso.
          </p>
        </div>
      )}

      {current === 'context' && (
        <section aria-label="Contexto do trabalho" className="space-y-3 break-words text-sm">
          <p>{matterId ? 'Trabalho vinculado a um caso.' : 'Trabalho com contexto escrito.'}</p>
          <p className="whitespace-pre-wrap">{context.text || 'Sem texto adicional.'}</p>
          {context.draft && matterId && (
            <a
              className="inline-flex min-h-11 items-center text-cognac-700 underline"
              href={`/app/rascunhos?${new URLSearchParams({ matterId, draftId: context.draft.draftId, versionId: context.draft.versionId, returnExecution: run.id })}`}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onEditor(e.currentTarget.getAttribute('href')!);
                }
              }}
            >
              Abrir minuta selecionada
            </a>
          )}
          {context.documents.map((d, i) => (
            <button
              className="block min-h-11 text-left text-cognac-700 underline"
              key={d.documentId}
              onClick={() => {
                if (matterId) onRead({ matterId, ...d });
              }}
            >
              Abrir {titles[d.documentId] ?? `documento ${i + 1}`}
            </button>
          ))}
          {!!run.history?.length && (
            <div>
              <p className="font-medium">Resultados anteriores</p>
              <ul>
                {run.history.map((h) => (
                  <li key={h.executionId}>
                    <a
                      className="inline-flex min-h-11 items-center text-cognac-700 underline"
                      href={`/app/trabalho?executionId=${encodeURIComponent(h.executionId)}`}
                    >
                      Resultado de {new Date(h.createdAt).toLocaleString('pt-BR')}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
