import { useEffect, useId, useRef, useState } from 'react';
import { answerFor, type Answer, type Question } from './execution-model';
import { matchesSearch } from './option-search';
import type { QuestionDraft } from './question-draft';

export function QuestionOptions({
  question,
  busy,
  onSubmit,
  guided = false,
  initialValue,
  focus = 0,
  submitLabel,
  draft,
  onDraft,
}: {
  question: Question;
  busy: boolean;
  onSubmit: (answer: Answer) => void;
  guided?: boolean;
  initialValue?: string | null;
  focus?: number;
  submitLabel?: string;
  /** Rascunho guardado de uma visita anterior a esta mesma pergunta. */
  draft?: QuestionDraft;
  onDraft?: (draft: QuestionDraft) => void;
}) {
  const [selected, setSelected] = useState<string[]>(
      (draft?.selected ?? (initialValue ? [initialValue] : [])).filter((id) =>
        question.options.some((option) => option.id === id),
      ),
    ),
    [text, setText] = useState(draft?.text ?? ''),
    [unknown, setUnknown] = useState(draft?.unknown ?? initialValue === null);
  const [textOpen, setTextOpen] = useState(draft?.textOpen ?? question.selection === 'free_text');
  // Perguntas com muitas opções (as 25 grandes áreas) ganham uma busca; a opção escolhida nunca some da lista.
  const [search, setSearch] = useState(draft?.search ?? '');
  const searchable = guided && question.options.length > 12;
  const visibleOptions = question.options.filter(
    (option) => !searchable || !search.trim() || selected.includes(option.id) || matchesSearch(option.label, search),
  );
  const legend = useRef<HTMLLegendElement>(null);
  const freeText = useRef<HTMLTextAreaElement>(null);
  const name = useId();
  useEffect(() => {
    if (focus) legend.current?.focus();
  }, [focus]);
  useEffect(() => {
    onDraft?.({ selected, text, unknown, search, textOpen });
  }, [onDraft, selected, text, unknown, search, textOpen]);
  const answer = answerFor(question, selected, text, unknown);
  const optionClass = guided
    ? 'flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white/70 px-3 py-2 text-sm font-medium leading-snug text-stone-800 transition-colors hover:bg-ivory-200 focus-within:ring-2 focus-within:ring-cognac-700 has-[:checked]:border-cognac-700 has-[:checked]:bg-cognac-100 has-[:checked]:text-cognac-900 motion-reduce:transition-none'
    : 'flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 p-3';
  const guidedInput =
    'size-4 shrink-0 cursor-pointer accent-cognac-700 focus-visible:outline-none disabled:cursor-default';
  const choose = (id: string) => {
    setUnknown(false);
    setSelected((current) =>
      question.selection === 'multiple'
        ? current.includes(id)
          ? current.filter((option) => option !== id)
          : [...current, id]
        : [id],
    );
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (answer && !busy) onSubmit(answer);
      }}
      className={guided ? 'space-y-3' : 'space-y-4'}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend
          ref={legend}
          tabIndex={guided ? -1 : undefined}
          className={
            guided
              ? 'mb-3 max-w-full text-lg font-semibold leading-snug tracking-tight text-stone-900 sm:text-xl'
              : 'font-semibold text-stone-900'
          }
        >
          {question.prompt}
        </legend>
        {!guided && <p className="text-sm text-stone-600">{question.reason}</p>}
        {searchable && (
          <label className="block text-sm">
            <span className="sr-only">Buscar nas opções</span>
            <input
              type="search"
              value={search}
              placeholder="Buscar"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white/70 px-3 text-sm focus-visible:border-cognac-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cognac-700"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span role="status" className="sr-only">
              {search.trim() ? `${visibleOptions.length} opções encontradas` : ''}
            </span>
          </label>
        )}
        <div
          className={
            guided ? 'grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))]' : 'space-y-3'
          }
        >
          {visibleOptions.map((option) => (
            <label key={option.id} className={optionClass}>
              <input
                type={question.selection === 'multiple' ? 'checkbox' : 'radio'}
                name={name}
                className={guided ? guidedInput : undefined}
                checked={!unknown && selected.includes(option.id)}
                onChange={() => choose(option.id)}
              />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          ))}
          {guided && question.allowUnknown && (
            <label className={optionClass}>
              <input
                type={question.selection === 'single' ? 'radio' : 'checkbox'}
                name={name}
                className={guidedInput}
                checked={unknown}
                onChange={(event) => {
                  setUnknown(event.target.checked);
                  if (event.target.checked) {
                    setSelected([]);
                    setText('');
                  }
                }}
              />
              <span>Não sei</span>
            </label>
          )}
        </div>
        {question.allowFreeText && (!guided || textOpen) && (
          <label className="block text-sm">
            {guided || !question.options.length ? 'Sua resposta' : 'Complemento ou outra resposta'}
            <textarea
              ref={freeText}
              maxLength={32000}
              className="mt-2 min-h-20 w-full rounded-2xl border border-stone-200 bg-white p-3 focus-visible:border-cognac-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cognac-700"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setUnknown(false);
              }}
            />
          </label>
        )}
        {!guided && question.allowUnknown && (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} />
            Ainda não sei
          </label>
        )}
      </fieldset>
      <div className={guided ? 'flex flex-wrap items-center justify-end gap-2' : undefined}>
        {guided && question.allowFreeText && !textOpen && (
          <button
            type="button"
            disabled={busy}
            className="mr-auto min-h-11 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-ivory-100"
            onClick={() => {
              setTextOpen(true);
              requestAnimationFrame(() => freeText.current?.focus());
            }}
          >
            Responder com texto
          </button>
        )}
        <button
          className={`btn-primary min-h-11 disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none ${guided ? 'rounded-full' : ''}`}
          disabled={busy || !answer}
          type="submit"
        >
          {submitLabel ?? 'Enviar resposta'}
        </button>
      </div>
    </form>
  );
}
