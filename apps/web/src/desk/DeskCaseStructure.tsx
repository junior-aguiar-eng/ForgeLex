import { useEffect, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import type { Delivery } from '../agentic-workspace/execution-model';
import { presentDelivery, type PresentedDelivery } from '../agentic-workspace/present-delivery';
import { structureSections, structureSize, type StructureSection } from './case-structure-model';

interface Loaded {
  updatedAt: string;
  sections: StructureSection[];
  sources: PresentedDelivery['sources'];
  pending: string[];
}
type State =
  { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'empty' } | ({ phase: 'ready' } & Loaded);

const failureText = (failure: unknown) =>
  failure instanceof Error ? failure.message : 'Não foi possível carregar a estrutura do caso.';

/**
 * Aba Estrutura da peça (tema gelo): o caso como o ForgeLex o entendeu, a partir da análise de fatos e provas mais recente
 * do caso. Não tem formulário nem botão: o que está errado se corrige pela conversa, no compositor. Cada item mostra a
 * classificação (alegação, inferência…) e as fontes que o sustentam; o que não tem fonte aparece com o aviso do próprio
 * resultado, nunca como fato.
 */
export function DeskCaseStructure({ matterId }: { matterId: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: 'loading' });
    void (async () => {
      try {
        const found = await requestApi<{ structure: { deliveryId: string; updatedAt: string } | null }>(
          `/api/agentic/matters/${encodeURIComponent(matterId)}/structure`,
          { signal: controller.signal },
          { sessionOnly: true },
        );
        if (!found.structure) {
          setState({ phase: 'empty' });
          return;
        }
        const result = await requestApi<Delivery>(
          `/api/agentic/deliveries/${encodeURIComponent(found.structure.deliveryId)}`,
          { signal: controller.signal },
          { sessionOnly: true },
        );
        const presented = presentDelivery(result.delivery);
        const sections = structureSections(presented.blocks);
        setState(
          structureSize(sections) === 0
            ? { phase: 'empty' }
            : {
                phase: 'ready',
                updatedAt: found.structure.updatedAt,
                sections,
                sources: presented.sources,
                pending: presented.pending,
              },
        );
      } catch (failure) {
        if (controller.signal.aborted) return;
        // Ambiente sem o fluxo de análise do caso (ou análise já removida): não há o que mostrar, e isso não é falha.
        if (failure instanceof ApiRequestError && failure.status === 404) setState({ phase: 'empty' });
        else setState({ phase: 'error', message: failureText(failure) });
      }
    })();
    return () => controller.abort();
  }, [matterId]);

  return (
    <section aria-label="Estrutura do caso" className="space-y-4">
      <h2 className="font-editorial text-[17px] font-semibold text-ink">Estrutura do caso</h2>
      {state.phase === 'loading' && (
        <p role="status" className="text-sm text-muted">
          Carregando a estrutura…
        </p>
      )}
      {state.phase === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.phase === 'empty' && (
        <p className="text-sm text-muted">
          O ForgeLex ainda não analisou os fatos e as provas deste caso. Peça no campo ao lado, por exemplo: “analise os
          fatos e as provas deste caso”.
        </p>
      )}
      {state.phase === 'ready' && (
        <>
          <p className="text-xs text-subtle">
            Análise de {new Date(state.updatedAt).toLocaleDateString('pt-BR')}. É leitura do ForgeLex sobre os
            documentos do caso, não decisão: confira as fontes. Para corrigir algo, diga no campo ao lado.
          </p>
          {state.sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-soft">{section.title}</h3>
              <ul className="space-y-2">
                {section.entries.map((entry, index) => (
                  <li key={index} className="text-sm leading-6 text-ink">
                    {entry.tag && (
                      <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                        {entry.tag}
                      </span>
                    )}
                    <span className="break-words">{entry.text}</span>
                    {entry.citations.length > 0 && (
                      <span className="ml-1 text-xs text-subtle" aria-label={`Fontes ${entry.citations.join(', ')}`}>
                        {entry.citations.map((n) => `[${n}]`).join(' ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {state.pending.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-soft">Pontos a conferir</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                {state.pending.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {state.sources.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-soft">Fontes</h3>
              <ol className="space-y-1 text-xs text-muted">
                {state.sources.map((source) => (
                  <li key={source.id}>
                    [{source.n}] {source.label}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
