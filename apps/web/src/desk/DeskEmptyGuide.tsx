import { BadgeCheck, Sparkles } from 'lucide-react';

/**
 * Estado vazio da Mesa no tema gelo (V3): exemplos que só preenchem o pedido (o cliente edita e envia) e a explicação
 * curta dos dois selos. Nada aqui promete resultado nem lista o catálogo de habilidades (DEC-10): um exemplo é um texto
 * de partida, não um comando.
 */
export const DESK_EXAMPLES = [
  {
    kind: 'Pesquisa e peça',
    title: 'Teses sobre um tema, com precedentes conferidos',
    hint: 'Pede as teses e escreve a peça ao lado.',
    text: 'Preciso das teses do STJ sobre ',
  },
  {
    kind: 'Teses da outra parte',
    title: 'Mapear os argumentos da outra parte',
    hint: 'Parte do que a outra parte sustenta.',
    text: 'Mapeie as teses da outra parte na contestação e confira as decisões que ela cita.',
  },
  {
    kind: 'Conferência',
    title: 'Verificar as citações de um texto',
    hint: 'Cada decisão citada, conferida na fonte oficial.',
    text: 'Confira as decisões citadas neste texto: ',
  },
] as const;

export function DeskEmptyGuide({ onExample }: { onExample: (text: string) => void }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="desk-examples-title" className="space-y-2">
        <h2 id="desk-examples-title" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle">
          Comece por um exemplo
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {DESK_EXAMPLES.map((example) => (
            <button
              key={example.kind}
              type="button"
              onClick={() => onExample(example.text)}
              className="flex min-h-11 flex-col items-start gap-1 rounded-xl border border-line bg-surface p-3 text-left hover:bg-canvas-deep"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{example.kind}</span>
              <span className="text-sm font-medium text-ink">{example.title}</span>
              <span className="text-xs text-muted">{example.hint}</span>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="desk-seals-title" className="space-y-2">
        <h2 id="desk-seals-title" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle">
          Dois selos, dois sentidos
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface p-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Análise da IA
            </span>
            <p className="mt-1 text-xs text-muted">
              Explica por que uma decisão serve, ou não, à questão do caso. É leitura da IA, sempre rotulada, e você a
              confere.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              Verificada
            </span>
            <p className="mt-1 text-xs text-muted">Número, data e órgão conferidos na fonte oficial.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
