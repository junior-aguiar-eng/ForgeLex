import { useState } from 'react';
import { answerFor, type Answer, type Question } from './execution-model';
export function QuestionOptions({
  question,
  busy,
  onSubmit,
}: {
  question: Question;
  busy: boolean;
  onSubmit: (answer: Answer) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [text, setText] = useState(''),
    [unknown, setUnknown] = useState(false);
  const answer = answerFor(question, selected, text, unknown);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (answer && !busy) onSubmit(answer);
      }}
      className="space-y-4"
    >
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="font-semibold text-stone-900">{question.prompt}</legend>
        <p className="text-sm text-stone-600">{question.reason}</p>
        {question.options.map((option) => (
          <label key={option.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 p-3">
            <input
              type={question.selection === 'multiple' ? 'checkbox' : 'radio'}
              name={`question-${question.id}`}
              checked={!unknown && selected.includes(option.id)}
              onChange={() => {
                setUnknown(false);
                setSelected(
                  question.selection === 'multiple'
                    ? selected.includes(option.id)
                      ? selected.filter((id) => id !== option.id)
                      : [...selected, option.id]
                    : [option.id],
                );
              }}
            />
            {option.label}
          </label>
        ))}
        {question.allowFreeText && (
          <label className="block text-sm">
            {question.options.length ? 'Complemento ou outra resposta' : 'Sua resposta'}
            <textarea
              maxLength={32000}
              className="mt-2 w-full rounded-lg border p-3"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setUnknown(false);
              }}
            />
          </label>
        )}
        {question.allowUnknown && (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} />
            Ainda não sei
          </label>
        )}
      </fieldset>
      <button className="btn-primary min-h-11" disabled={busy || !answer} type="submit">
        Enviar resposta
      </button>
    </form>
  );
}
