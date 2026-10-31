import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { SearchResultItem } from '../operations/contracts';
import './decision-reader.css';

export interface ReaderEntry {
  decision?: SearchResultItem;
  unavailable?: boolean;
}
export function safeSourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function decisionCitation(item: SearchResultItem): string {
  return `${item.court}. ${item.processNumber}, Rel. ${item.relator}${item.chamber ? `, ${item.chamber}` : ''}, j. ${item.judgmentDate || 'não informado'}, publ. ${item.publicationDate || 'não informada'}.\n\nEmenta:\n${item.ementa}${safeSourceUrl(item.sourceUrl) ? `\n\nFonte: ${safeSourceUrl(item.sourceUrl)}` : ''}`;
}
function date(value?: string) {
  if (!value) return 'Não informada';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return value;
}
/** Passive reader: no authentication, search, billing, HTML from sources, or private application context. */
export function DecisionReader({
  entries,
  searchedAt,
  actions,
  onExpand,
  onOpenSource,
}: {
  entries: ReaderEntry[];
  searchedAt?: string;
  actions?: (item: SearchResultItem) => ReactNode;
  onExpand?: () => void;
  onOpenSource?: (url: string) => Promise<void>;
}) {
  const [position, setPosition] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [failedSource, setFailedSource] = useState('');
  const [originOpen, setOriginOpen] = useState(false);
  const contentId = useId();
  const identity = entries.map((entry) => `${entry.decision?.id}:${entry.decision?.versionId}`).join('|');
  useEffect(() => {
    setPosition(0);
    setCopyState('idle');
    setFailedSource('');
    setOriginOpen(false);
  }, [identity]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const index = Math.min(position, Math.max(entries.length - 1, 0));
  const item = entries[index]?.decision;
  const move = (next: number) => {
    setPosition(Math.max(0, Math.min(entries.length - 1, next)));
    setCopyState('idle');
    setFailedSource('');
    heading.current?.focus();
  };
  const sourceLink = (url: string, label: string) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={
        onOpenSource
          ? (event) => {
              event.preventDefault();
              setFailedSource('');
              void onOpenSource(url).catch(() => setFailedSource(url));
            }
          : undefined
      }
    >
      {label}
    </a>
  );
  const copy = async () => {
    if (!item) return;
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(decisionCitation(item));
      setCopyState('copied');
      timer.current = setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  };
  return (
    <section
      className="decision-reader"
      aria-label="Leitor de decisões"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('input,textarea,select') || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          move(index + (event.key === 'ArrowRight' ? 1 : -1));
        }
      }}
    >
      <div className="reader-brandbar">
        <span className="reader-brand">ForgeLex</span>
        <span>Decisões selecionadas</span>
      </div>
      {searchedAt && (
        <p className="reader-note reader-saved-date">
          Resultados da pesquisa realizada em {new Date(searchedAt).toLocaleDateString('pt-BR')} às{' '}
          {new Date(searchedAt).toLocaleTimeString('pt-BR')}. O material conservado não foi atualizado.
        </p>
      )}
      <header className="reader-toolbar">
        <span aria-live="polite">
          {entries.length ? `${index + 1} de ${entries.length}` : 'Nenhuma decisão nesta pesquisa'}
        </span>
        <nav aria-label="Navegar pelas decisões">
          <button
            className="reader-icon"
            type="button"
            disabled={index === 0}
            onClick={() => move(index - 1)}
            aria-label="Decisão anterior"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            className="reader-icon"
            type="button"
            disabled={index >= entries.length - 1}
            onClick={() => move(index + 1)}
            aria-label="Próxima decisão"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
          {onExpand && (
            <button type="button" className="reader-expand" onClick={onExpand}>
              Expandir
            </button>
          )}
        </nav>
      </header>
      {!item ? (
        <p className="reader-empty" role="status">
          {entries.length
            ? 'A versão desta decisão não está disponível. Nenhuma outra decisão foi usada em seu lugar.'
            : 'A pesquisa não retornou decisões.'}
        </p>
      ) : (
        <article className="reader-record">
          <p className="reader-eyebrow">{item.court}</p>
          <h2 ref={heading} tabIndex={-1}>
            {item.processNumber}
          </h2>
          <p className="reader-relator">Relatoria: {item.relator || 'Não informada'}</p>
          <p className="reader-chamber">Órgão julgador: {item.chamber || 'Não informado'}</p>
          <dl className="reader-metadata">
            <div>
              <dt>Julgamento</dt>
              <dd>{date(item.judgmentDate)}</dd>
            </div>
            <div>
              <dt>Publicação</dt>
              <dd>{date(item.publicationDate)}</dd>
            </div>
          </dl>
          {item.ementa && (
            <p className="reader-note reader-completeness">
              Ementa disponibilizada pela fonte; sua integralidade não foi confirmada. Consulte o inteiro teor quando
              houver link.
            </p>
          )}
          <div className="reader-tabs" role="tablist" aria-label="Conteúdo da decisão">
            <button
              type="button"
              role="tab"
              id={`${contentId}-tab`}
              aria-selected="true"
              aria-controls={`${contentId}-text`}
            >
              Ementa
            </button>
          </div>
          <div
            className="reader-text"
            role="tabpanel"
            id={`${contentId}-text`}
            aria-labelledby={`${contentId}-tab`}
            tabIndex={0}
          >
            {item.ementa || 'Texto não disponível nesta fonte.'}
          </div>
          <div className="reader-actions">
            <button type="button" onClick={() => void copy()}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
              </svg>
              {copyState === 'copied' ? 'Citação copiada' : 'Copiar citação'}
            </button>
            <button
              type="button"
              aria-expanded={originOpen}
              aria-controls={`${contentId}-origin`}
              onClick={() => setOriginOpen(!originOpen)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M14 3h7v7M21 3 10 14M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              Origem e fonte
            </button>
            {actions?.(item)}
          </div>
          {copyState === 'failed' && (
            <div role="alert">
              <p>Não foi possível copiar. Selecione e copie a citação abaixo.</p>
              <textarea readOnly aria-label="Citação para copiar manualmente" value={decisionCitation(item)} />
            </div>
          )}
          <div className="reader-origin" id={`${contentId}-origin`} hidden={!originOpen}>
            <p>
              {item.verificationStatus === 'VERIFIED_OFFICIAL'
                ? 'Conferida na fonte oficial.'
                : item.verificationStatus === 'VERIFIED_PROVIDER'
                  ? 'Conferida no fornecedor informado.'
                  : 'A fonte ainda não foi conferida.'}
            </p>
            {safeSourceUrl(item.sourceUrl) ? (
              sourceLink(safeSourceUrl(item.sourceUrl)!, 'Conferir decisão')
            ) : (
              <p>Link da fonte não disponível.</p>
            )}
            {safeSourceUrl(item.fullTextUrl) && (
              <p>{sourceLink(safeSourceUrl(item.fullTextUrl)!, 'Abrir inteiro teor na fonte')}</p>
            )}
            {failedSource && (
              <div role="alert">
                <p>O aplicativo não abriu a fonte. Copie o endereço para consultar no navegador.</p>
                <textarea readOnly aria-label="Endereço da fonte para copiar" value={failedSource} />
              </div>
            )}
          </div>
        </article>
      )}
      <footer className="reader-footer">Decisões e fontes · ForgeLex</footer>
    </section>
  );
}
