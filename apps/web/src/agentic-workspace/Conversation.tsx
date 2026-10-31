import { QuestionOptions } from './QuestionOptions';
import type { Answer, Message, Question } from './execution-model';

const answerText = (answer: Answer, messages: Message[]) =>
  answer.unknown
    ? 'Ainda não sei'
    : [
        ...answer.selectedOptionIds.map(
          (id) =>
            messages.find((x) => x.question?.id === answer.questionId)?.question?.options.find((o) => o.id === id)
              ?.label ?? id,
        ),
        answer.freeText,
      ]
        .filter(Boolean)
        .join(' · ');

/** The request, the agent's questions and the lawyer's answers, in the order they happened. */
export function Conversation({
  question,
  messages,
  busy,
  onAnswer,
  onCorrect,
}: {
  question: Question | null;
  messages: Message[];
  busy: boolean;
  onAnswer: (a: Answer) => void;
  onCorrect?: (q: Question) => void;
}) {
  return (
    <section aria-label="Conversa do trabalho" className="space-y-4">
      {messages.map((m) => {
        const pendingNow =
          m.question && !m.answer && question?.id === m.question.id && question.version === m.question.version;
        return (
          <div key={m.id} className="space-y-3 break-words">
            {m.text && (
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-cognac-100 px-4 py-3 text-stone-900">
                {m.text}
              </p>
            )}
            {m.question && !pendingNow && (
              <p className="mr-auto w-fit max-w-[85%] rounded-2xl rounded-bl-sm border border-champagne-border bg-white px-4 py-3">
                {m.question.prompt}
              </p>
            )}
            {m.answer && (
              <div className="ml-auto w-fit max-w-[85%] space-y-1">
                <p className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-cognac-100 px-4 py-3 text-stone-900">
                  {answerText(m.answer, messages)}
                </p>
                {onCorrect && (
                  <button
                    className="min-h-11 text-sm text-cognac-700 underline"
                    disabled={busy}
                    onClick={() => {
                      if (busy) return;
                      const answer = m.answer!;
                      const q = messages.find(
                        (x) =>
                          x.question &&
                          x.question.id === answer.questionId &&
                          x.question.version === answer.questionVersion,
                      )?.question;
                      if (q) onCorrect(q);
                    }}
                  >
                    Corrigir esta resposta
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {question && (
        <div className="mr-auto max-w-full rounded-2xl rounded-bl-sm border border-champagne-border bg-white p-5 shadow-card">
          <QuestionOptions
            key={`${question.id}:${question.version}:${question.contextRevision}`}
            question={question}
            busy={busy}
            onSubmit={onAnswer}
          />
        </div>
      )}
    </section>
  );
}
