import { QuestionOptions } from './QuestionOptions';
import type { Answer, Message, Question } from './execution-model';
export function GuidedDialogue({
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
    <section aria-label="Diálogo do trabalho" className="space-y-5">
      {!!messages.length && (
        <details>
          <summary className="min-h-11 cursor-pointer">Pedido e respostas anteriores</summary>
          <ol className="space-y-3 break-words">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg bg-stone-50 p-3 text-sm">
                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                {m.question && <p>{m.question.prompt}</p>}
                {m.answer && (
                  <>
                    <p>
                      {m.answer.unknown
                        ? 'Ainda não sei'
                        : [
                            ...m.answer.selectedOptionIds.map(
                              (id) =>
                                messages
                                  .find((x) => x.question?.id === m.answer?.questionId)
                                  ?.question?.options.find((o) => o.id === id)?.label ?? id,
                            ),
                            m.answer.freeText,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                    {onCorrect && (
                      <button
                        className="min-h-11 underline"
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
                  </>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
      {question && (
        <QuestionOptions
          key={`${question.id}:${question.version}:${question.contextRevision}`}
          question={question}
          busy={busy}
          onSubmit={onAnswer}
        />
      )}
    </section>
  );
}
