import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { ApiRequestError, requestApiWithToken } from '../api-client';
import {
  documentMatches,
  documentTextParts,
  type DocumentBundle,
  type DocumentSource,
} from '../documents/document-reader-model';

export function DocumentReaderDialog(props: { source: DocumentSource; token: string; onClose: () => void }) {
  const { matterId, documentId, versionId, anchorId } = props.source;
  // Identity changes remount the reader before an old response can be painted.
  return <Reader key={`${matterId}:${documentId}:${versionId ?? ''}:${anchorId ?? ''}:${props.token}`} {...props} />;
}

function Reader({ source, token, onClose }: { source: DocumentSource; token: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [bundle, setBundle] = useState<DocumentBundle>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [occurrence, setOccurrence] = useState(0);
  const [paragraph, setParagraph] = useState('');
  const { matterId, documentId, versionId, anchorId } = source;
  const search = useMemo(() => documentMatches(bundle?.version.content ?? '', query), [bundle, query]);
  const parts = useMemo(() => (bundle ? documentTextParts(bundle.version.content, bundle.anchors) : []), [bundle]);
  const paragraphs = parts.flatMap((part) => (part.anchor ? [part.anchor] : []));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBundle(undefined);
    setError('');
    setLoading(true);
    const read = async () => {
      const root = `/api/v2/matters/${matterId}/documents/${documentId}`;
      const init = { signal: controller.signal, cache: 'no-store' as const };
      // The current endpoint omits the full text; resolve its ID, then read that exact version.
      const resolved =
        versionId ?? (await requestApiWithToken<{ version: { id: string } }>(root, token, init)).version.id;
      const result = await requestApiWithToken<DocumentBundle>(`${root}/versions/${resolved}`, token, init);
      if (active) setBundle(result);
    };
    void read()
      .catch((failure) => {
        if (!active) return;
        const status = failure instanceof ApiRequestError ? failure.status : undefined;
        setError(
          status === 404
            ? 'Documento indisponível. A versão pode ter sido excluída definitivamente ou não estar acessível neste caso.'
            : status === 401
              ? 'Sua sessão expirou. Entre novamente para ler o documento.'
              : status === 403
                ? 'Você não tem acesso a este documento.'
                : 'Não foi possível carregar o documento. Tente novamente.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [matterId, documentId, versionId, token, attempt]);

  useEffect(() => {
    if (!bundle || !anchorId) return;
    const element = text.current?.querySelector<HTMLElement>(`[data-anchor-id="${anchorId}"]`);
    if (element) {
      setParagraph(anchorId);
      element.scrollIntoView({ block: 'center' });
      element.focus({ preventScroll: true });
    }
  }, [bundle, anchorId]);

  useEffect(() => {
    text.current?.querySelector('[data-active-match="true"]')?.scrollIntoView({ block: 'center' });
  }, [query, occurrence]);

  const navigateParagraph = (id: string) => {
    setParagraph(id);
    const element = text.current?.querySelector<HTMLElement>(`[data-anchor-id="${id}"]`);
    element?.scrollIntoView({ block: 'center' });
    element?.focus({ preventScroll: true });
  };

  const highlighted = (start: number, end: number): ReactNode => {
    const nodes: ReactNode[] = [];
    let cursor = start;
    for (const [index, match] of search.matches.entries()) {
      if (match.end <= start) continue;
      if (match.start >= end) break;
      const from = Math.max(start, match.start),
        to = Math.min(end, match.end);
      nodes.push(bundle!.version.content.slice(cursor, from));
      nodes.push(
        <mark
          key={index}
          data-active-match={index === occurrence}
          className={index === occurrence ? 'bg-amber-300 text-stone-950' : 'bg-amber-100 text-stone-950'}
        >
          {bundle!.version.content.slice(from, to)}
        </mark>,
      );
      cursor = to;
    }
    nodes.push(bundle!.version.content.slice(cursor, end));
    return nodes;
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="document-reader-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="w-[min(64rem,calc(100vw-2rem))] max-h-[90vh] rounded-2xl p-0 text-stone-900 backdrop:bg-black/40"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-200 p-5 sm:px-8">
          <div className="min-w-0">
            <h2 id="document-reader-title" className="text-xs font-semibold uppercase tracking-wider text-cognac-800">
              Leitura do documento
            </h2>
            {bundle && (
              <>
                <h3 className="mt-2 break-words font-editorial text-2xl font-bold">{bundle.document.title}</h3>
                <p className="mt-1 text-sm text-stone-600">
                  Versão {bundle.version.versionNumber}
                  {versionId ? ' · citada no rascunho' : ''}
                </p>
                <p className="mt-1 break-words text-xs text-stone-600">
                  {bundle.document.originalFilename} · {new Date(bundle.version.createdAt).toLocaleString('pt-BR')}
                </p>
                {bundle.document.lifecycleState === 'ARCHIVED' && (
                  <p className="mt-2 text-sm text-cognac-800">Arquivado · leitura do conteúdo preservado</p>
                )}
                {bundle.document.lifecycleState === 'TRASHED' && (
                  <p className="mt-2 text-sm text-cognac-800">Na lixeira · leitura do conteúdo preservado</p>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            aria-label="Fechar leitura"
            onClick={onClose}
            className="btn-quiet min-h-11 min-w-11 shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        {loading && (
          <p role="status" className="p-8 text-sm">
            Carregando documento…
          </p>
        )}
        {error && (
          <div className="space-y-4 p-8">
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
            <button type="button" className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {bundle && (
          <>
            <div className="shrink-0 space-y-3 border-b border-stone-200 bg-stone-50 px-5 py-4 sm:px-8">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold">
                  Buscar no documento
                  <span className="mt-1 flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 focus-within:ring-2 focus-within:ring-cognac-700">
                    <Search className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setOccurrence(0);
                      }}
                      className="min-h-11 w-full min-w-0 bg-transparent text-sm font-normal outline-none"
                    />
                  </span>
                </label>
                <button
                  type="button"
                  aria-label="Ocorrência anterior"
                  className="btn-secondary min-h-11 disabled:opacity-40"
                  disabled={!search.matches.length}
                  onClick={() => setOccurrence((index) => (index - 1 + search.matches.length) % search.matches.length)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima ocorrência"
                  className="btn-secondary min-h-11 disabled:opacity-40"
                  disabled={!search.matches.length}
                  onClick={() => setOccurrence((index) => (index + 1) % search.matches.length)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-xs text-stone-600">
                  {query.trim()
                    ? search.matches.length
                      ? `${occurrence + 1} de ${search.matches.length} ocorrências${search.truncated ? ' · primeiras 1.000' : ''}`
                      : 'Nenhuma ocorrência'
                    : `${paragraphs.length} parágrafos`}
                </p>
                {!!paragraphs.length && (
                  <label className="flex items-center gap-2 whitespace-nowrap text-xs text-stone-600">
                    Ir para parágrafo
                    <select
                      className="input-control min-h-11 max-w-40 text-xs"
                      value={paragraph}
                      onChange={(event) => navigateParagraph(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {paragraphs.map((anchor) => (
                        <option key={anchor.id} value={anchor.id}>
                          Parágrafo {anchor.ordinal + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {anchorId &&
                (paragraphs.some((anchor) => anchor.id === anchorId) ? (
                  <button
                    type="button"
                    className="btn-quiet min-h-11 text-xs"
                    onClick={() => navigateParagraph(anchorId)}
                  >
                    Voltar ao trecho citado
                  </button>
                ) : (
                  <p role="alert" className="text-sm text-amber-900">
                    Trecho citado indisponível nesta versão. O texto integral está abaixo.
                  </p>
                ))}
            </div>
            <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8">
              <div
                ref={text}
                role="region"
                aria-label="Texto integral"
                className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]"
              >
                {parts.map((part) =>
                  part.anchor ? (
                    <span
                      key={part.anchor.id}
                      role="group"
                      tabIndex={-1}
                      aria-label={`Parágrafo ${part.anchor.ordinal + 1}`}
                      data-anchor-id={part.anchor.id}
                      data-cited={part.anchor.id === anchorId}
                      className={`rounded-sm outline-offset-4 focus:outline focus:outline-2 focus:outline-cognac-700 ${part.anchor.id === anchorId ? 'bg-cognac-100' : ''}`}
                    >
                      {highlighted(part.start, part.end)}
                    </span>
                  ) : (
                    <span key={`gap-${part.start}`}>{highlighted(part.start, part.end)}</span>
                  ),
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
