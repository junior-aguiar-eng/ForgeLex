import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GuidedQuestion } from './GuidedQuestion';
import { GuidanceSummary } from './GuidanceSummary';
import { askedGuidanceFields, type GuidanceField } from './guidance-model';
import type { QuestionDraft } from './question-draft';
import type { useDeskGuidance } from './use-desk-guidance';

export function GuidancePanel({
  guidance,
  field,
  blocked,
  onEdit,
}: {
  guidance: ReturnType<typeof useDeskGuidance>;
  field?: GuidanceField;
  blocked: boolean;
  onEdit: (field?: GuidanceField) => void;
}) {
  const { state, feedback, focus, answer, leave, retry } = guidance;
  const busy = guidance.busy || blocked;
  const [editFocus, setEditFocus] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const editing = field ? state?.decisions[field] : undefined;
  const question = editing?.question ?? state?.question;
  // O que o cliente digitou numa pergunta fica guardado por pergunta, para voltar um passo e retomar sem perder nada.
  const drafts = useRef(new Map<string, QuestionDraft>());
  const draftKey = question ? `${question.id}:${question.contextRevision}` : undefined;
  const saveDraft = useCallback(
    (draft: QuestionDraft) => {
      if (draftKey) drafts.current.set(draftKey, draft);
    },
    [draftKey],
  );
  // "Voltar": a resposta mais recente vira a pergunta aberta; a pendente mantém o rascunho.
  const previous = !editing && state ? askedGuidanceFields(state).at(-1) : undefined;
  const returnToSummary = () => summary.current?.querySelector('button')?.focus();
  useEffect(() => {
    if (focus && !question) summary.current?.querySelector('button')?.focus();
  }, [focus, question]);

  if (!state)
    return (
      <div className="px-1 py-2 text-sm text-stone-700">
        <p role="status">{feedback ?? 'Recuperando seu pedido…'}</p>
        {feedback && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary min-h-11" onClick={retry}>
              Tentar novamente
            </button>
            <button type="button" className="btn-secondary min-h-11" onClick={leave}>
              Voltar ao pedido livre
            </button>
          </div>
        )}
      </div>
    );
  return (
    <div className="space-y-3">
      <div ref={summary}>
        <GuidanceSummary
          state={state}
          disabled={busy}
          onLeave={leave}
          onEdit={(field) => {
            onEdit(field);
            setEditFocus((value) => value + 1);
          }}
        />
      </div>
      <p role="status" className={guidance.busy || feedback ? 'text-sm text-stone-700' : 'sr-only'}>
        {guidance.busy ? 'Registrando sua resposta…' : (feedback ?? question?.prompt ?? 'Pedido atualizado.')}
      </p>
      {question && (
        <GuidedQuestion
          question={question}
          busy={busy}
          focus={focus + editFocus}
          initialValue={editing?.value}
          draft={draftKey ? drafts.current.get(draftKey) : undefined}
          onDraft={saveDraft}
          onBack={
            previous
              ? () => {
                  onEdit(previous);
                  setEditFocus((value) => value + 1);
                }
              : undefined
          }
          onAnswer={(value) => {
            void answer(value, Boolean(editing));
          }}
          onCancel={
            editing
              ? () => {
                  onEdit();
                  requestAnimationFrame(returnToSummary);
                }
              : undefined
          }
        />
      )}
      {state.history.length > 0 && (
        <details className="group px-1 text-sm text-stone-700">
          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
            Respostas anteriores <ChevronDown size={15} aria-hidden="true" className="group-open:rotate-180" />
          </summary>
          <ol className="space-y-3 pb-2">
            {state.history.map(({ id, prompt, text }) => (
              <li key={id} className="space-y-1 break-words">
                <p>{prompt}</p>
                <p className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-cognac-100 px-3 py-2 text-stone-900">
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
