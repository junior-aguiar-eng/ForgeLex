import { QuestionOptions } from './QuestionOptions';
import type { Answer, Question } from './execution-model';

export function GuidedQuestion({
  question,
  busy,
  focus,
  initialValue,
  onAnswer,
  onCancel,
}: {
  question: Question;
  busy: boolean;
  focus: number;
  initialValue?: string | null;
  onAnswer: (answer: Answer) => void;
  onCancel?: () => void;
}) {
  return (
    <section aria-label="Pergunta do pedido" aria-busy={busy} className="min-w-0 px-1 py-2">
      <QuestionOptions
        key={`${question.id}:${question.contextRevision}`}
        guided
        question={question}
        busy={busy}
        focus={focus}
        initialValue={initialValue}
        submitLabel={onCancel ? 'Salvar alteração' : 'Continuar'}
        onSubmit={onAnswer}
      />
      {onCancel && (
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-stone-700 hover:bg-ivory-100"
        >
          Cancelar alteração
        </button>
      )}
    </section>
  );
}
