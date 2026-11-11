import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Download, History, X } from 'lucide-react';

interface Section {
  title: string;
  content: string;
}
export function CanvasDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[85dvh] w-[min(680px,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl backdrop:bg-stone-900/25"
      aria-label={title}
    >
      <header className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-editorial text-xl">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 hover:bg-stone-100">
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

function PaperText({
  value,
  id,
  label,
  onChange,
  onSelect,
  disabled,
  heading,
}: {
  value: string;
  label: string;
  id: string;
  onChange: (value: string) => void;
  onSelect?: (start: number, end: number, value: string) => void;
  disabled: boolean;
  heading?: 'title' | 'section';
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
    let width = el?.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el && el.clientWidth !== width) {
        width = el.clientWidth;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    });
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onSelect={
        onSelect
          ? ({ currentTarget }) =>
              onSelect(currentTarget.selectionStart, currentTarget.selectionEnd, currentTarget.value)
          : undefined
      }
      disabled={disabled}
      rows={heading ? 1 : 3}
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-stone-800 outline-none focus:ring-0 disabled:opacity-70 ${heading === 'title' ? 'font-editorial text-3xl leading-tight' : heading ? 'font-serif text-lg font-semibold' : 'font-serif text-base leading-8'}`}
    />
  );
}

export function DraftCanvas({
  title,
  sections,
  matters,
  drafts,
  matterId,
  draftId,
  busy,
  dirty,
  error,
  status,
  onTitle,
  onSection,
  editVersionId,
  onEditSelection,
  onMatter,
  onDraft,
  onSave,
  onExport,
  onCaseSources,
  reviewActions,
  history,
  extras,
  caseControls,
}: {
  title: string;
  sections: Section[];
  matters: { id: string; title: string }[];
  drafts: { id: string; title: string }[];
  matterId: string;
  draftId: string;
  busy: boolean;
  dirty: boolean;
  error: string | null;
  status: string | null;
  onTitle: (s: string) => void;
  onSection: (index: number, field: 'title' | 'content', value: string) => void;
  editVersionId?: string;
  onEditSelection?: (index: number, start: number, end: number, value: string) => void;
  onMatter: (id: string) => void;
  onDraft: (id: string) => void;
  onSave: () => void;
  onExport: (format: 'docx' | 'pdf') => void;
  onCaseSources?: () => void;
  reviewActions?: ReactNode;
  history: ReactNode;
  extras?: ReactNode;
  caseControls?: ReactNode;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selection, setSelection] = useState<{
    index: number;
    start: number;
    end: number;
    value: string;
    versionId: string;
  }>();
  return (
    <section
      aria-label="Mesa da peça"
      className="flex min-h-[70dvh] min-w-0 flex-col bg-[#F1EEE8] lg:h-[calc(100dvh-8rem)]"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-[#FBF9F5] px-4 py-3 text-sm">
        {onCaseSources && (
          <button type="button" className="min-h-9 rounded-lg px-2 hover:bg-stone-100" onClick={onCaseSources}>
            Fontes do caso
          </button>
        )}
        {reviewActions}
        <details className="relative mr-auto">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-stone-100">
            {draftId ? 'Peça aberta' : 'Abrir peça'}
            <ChevronDown size={14} />
          </summary>
          <div className="absolute left-0 top-11 z-20 w-64 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
            <label className="block text-xs text-stone-600">
              Caso
              <select
                aria-label="Caso da peça"
                value={matterId}
                disabled={busy}
                onChange={(e) => onMatter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 p-2"
              >
                <option value="">Escolha um caso</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            {caseControls}
            {matterId && (
              <label className="block text-xs text-stone-600">
                Peça
                <select
                  aria-label="Peça do caso"
                  value={draftId}
                  disabled={busy}
                  onChange={(e) => onDraft(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 p-2"
                >
                  <option value="">Nova peça</option>
                  {drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </details>
        <span role="status" className="mr-1 hidden text-xs text-stone-600 sm:inline">
          {busy ? 'Atualizando…' : dirty ? 'Edição não salva' : draftId ? 'Salvo' : 'Edição local'}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !matterId}
          className="rounded-lg px-3 py-2 font-medium text-cognac-800 hover:bg-cognac-50 disabled:opacity-40"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={() => setHistoryOpen(!historyOpen)}
          disabled={!draftId}
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
          aria-label="Histórico da peça"
          title="Histórico"
        >
          <History size={18} />
        </button>
        <details className="relative">
          <summary
            aria-label="Exportar peça"
            title="Exportar"
            className="cursor-pointer list-none rounded-lg p-2 text-stone-600 hover:bg-stone-100"
          >
            <Download size={18} />
          </summary>
          <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onExport('docx');
              }}
              className="block w-full rounded-lg p-2 text-left hover:bg-stone-50"
            >
              Word (.docx)
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                onExport('pdf');
              }}
              className="block w-full rounded-lg p-2 text-left hover:bg-stone-50"
            >
              PDF / imprimir
            </button>
            <p className="px-2 pb-1 text-xs text-stone-600">Exporta o texto aberto na mesa.</p>
          </div>
        </details>
      </header>
      {error && (
        <p role="alert" className="bg-amber-50 px-5 py-3 text-sm text-amber-900">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="px-5 pt-3 text-xs text-stone-600">
          {status}
        </p>
      )}
      {extras}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6">
        <article
          aria-label="Documento em edição"
          className="mx-auto min-h-[60dvh] max-w-[760px] space-y-7 bg-white px-6 py-10 shadow-sm sm:px-12"
        >
          <PaperText
            id="desk-title"
            label="Título da peça"
            heading="title"
            value={title}
            onChange={onTitle}
            disabled={busy}
          />
          {sections.map((s, i) => (
            <section key={i} className="space-y-3">
              <PaperText
                id={'desk-heading-' + i}
                label={`Título da seção ${i + 1}`}
                heading="section"
                value={s.title}
                onChange={(v) => onSection(i, 'title', v)}
                disabled={busy}
              />
              <PaperText
                id={'draft-section-' + i}
                label={`Texto da seção ${i + 1}`}
                value={s.content}
                onChange={(v) => onSection(i, 'content', v)}
                onSelect={
                  editVersionId
                    ? (start, end, value) =>
                        setSelection(
                          end > start ? { index: i, start, end, value, versionId: editVersionId } : undefined,
                        )
                    : undefined
                }
                disabled={busy}
              />
              {selection?.index === i &&
                selection.versionId === editVersionId &&
                onEditSelection &&
                !busy &&
                !dirty && (
                  <button
                    type="button"
                    className="text-sm text-cognac-800 underline"
                    onClick={() => {
                      onEditSelection(i, selection.start, selection.end, selection.value);
                      setSelection(undefined);
                    }}
                  >
                    Usar trecho na conversa
                  </button>
                )}
            </section>
          ))}
          {historyOpen && (
            <section aria-label="Histórico da peça" className="border-t border-stone-200 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Histórico</span>
                <button
                  type="button"
                  aria-label="Recolher apontamentos"
                  onClick={() => setHistoryOpen(false)}
                  className="p-2"
                >
                  <X size={16} />
                </button>
              </div>
              {history}
            </section>
          )}
        </article>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-stone-200 px-5 py-3 text-xs text-stone-600">
        <span>Revise o texto antes de usar.</span>
      </footer>
    </section>
  );
}
