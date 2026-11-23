import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import type { Delivery } from '../agentic-workspace/execution-model';
import { presentDelivery, type PresentedDelivery } from '../agentic-workspace/present-delivery';
import {
  replacedCorrectionsNotice,
  structureQuestions,
  structureSections,
  structureSize,
  structureSummary,
  type StructureEntry,
  type StructureReview,
  type StructureSection,
} from './case-structure-model';

interface Loaded {
  updatedAt: string;
  sections: StructureSection[];
  sources: PresentedDelivery['sources'];
  pending: string[];
  /** Resumo curto do caso, do ajuste mais recente feito pela conversa (E2). */
  summary?: string;
}
export type StructureViewState =
  { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'empty' } | ({ phase: 'ready' } & Loaded);

const failureText = (failure: unknown) =>
  failure instanceof Error ? failure.message : 'Não foi possível carregar a estrutura do caso.';

/**
 * Aba Estrutura da peça (tema gelo): o caso como o ForgeLex o entendeu, a partir da análise de fatos e provas mais recente
 * do caso. Não tem formulário nem botão: o que está errado se corrige pela conversa, no compositor. Cada item mostra a
 * classificação (alegação, inferência…) e as fontes que o sustentam; o que não tem fonte aparece com o aviso do próprio
 * resultado, nunca como fato.
 */
export function DeskCaseStructure({
  matterId,
  refreshKey,
  onReadyChange,
}: {
  matterId: string;
  /** Muda quando um ajuste da estrutura termina: a aba recarrega sem piscar o que já mostra. */
  refreshKey?: string;
  /** Diz à peça se há estrutura carregada: só então o pedido do compositor vira ajuste. */
  onReadyChange?: (ready: boolean) => void;
}) {
  const [state, setState] = useState<StructureViewState>({ phase: 'loading' });
  const ready = state.phase === 'ready';
  const notify = useRef(onReadyChange);
  notify.current = onReadyChange;
  useEffect(() => {
    notify.current?.(ready);
  }, [ready]);
  useEffect(() => () => notify.current?.(false), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((old) => (old.phase === 'ready' ? old : { phase: 'loading' }));
    void (async () => {
      try {
        const found = await requestApi<{
          structure: { deliveryId: string; updatedAt: string; previousDeliveryId?: string } | null;
        }>(
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
        // A revisão da análise (E2) numera os itens, marca o que o usuário mudou e traz o resumo. Sem ela (rota ausente
        // ou revisão indisponível), a aba fica como no E1: nunca vira falha.
        let review: StructureReview | undefined;
        try {
          review = await requestApi<StructureReview>(
            `/api/agentic/deliveries/${encodeURIComponent(found.structure.deliveryId)}/evidence-review`,
            { signal: controller.signal },
            { sessionOnly: true },
          );
        } catch {
          if (controller.signal.aborted) return;
          review = undefined;
        }
        // Análise nova sobre outra que tinha correções pela conversa: o usuário é avisado de que elas não foram
        // reaplicadas. Falha ao ler a anterior só tira o aviso.
        let previous: StructureReview | undefined;
        if (found.structure.previousDeliveryId) {
          try {
            previous = await requestApi<StructureReview>(
              `/api/agentic/deliveries/${encodeURIComponent(found.structure.previousDeliveryId)}/evidence-review`,
              { signal: controller.signal },
              { sessionOnly: true },
            );
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        const presented = presentDelivery(result.delivery);
        const sections = structureSections(presented.blocks, review);
        const summary = structureSummary(review);
        const replaced = replacedCorrectionsNotice(previous);
        const pending = [...(replaced ? [replaced] : []), ...presented.pending];
        for (const line of structureQuestions(review)) if (!pending.includes(line)) pending.push(line);
        setState(
          structureSize(sections) === 0
            ? { phase: 'empty' }
            : {
                phase: 'ready',
                updatedAt: found.structure.updatedAt,
                sections,
                sources: presented.sources,
                pending,
                ...(summary ? { summary } : {}),
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
  }, [matterId, refreshKey]);

  return <DeskCaseStructureView state={state} />;
}

/** Marca curta do que o usuário mudou pela conversa. */
function ChangeMark({ entry }: { entry: StructureEntry }) {
  if (!entry.change) return null;
  return (
    <span className="mr-2 rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {entry.change.kind === 'removed' ? 'retirado por você' : 'corrigido por você e confirmado no caso'}
    </span>
  );
}

/** A aba já carregada: só leitura, sem formulário nem botão. */
export function DeskCaseStructureView({ state }: { state: StructureViewState }) {
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
          {state.summary && (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-ink-soft">Resumo do caso</h3>
              <p className="text-sm leading-6 text-ink">{state.summary}</p>
            </div>
          )}
          <p className="text-xs text-subtle">
            Análise de {new Date(state.updatedAt).toLocaleDateString('pt-BR')}. É leitura do ForgeLex sobre os
            documentos do caso, não decisão: confira as fontes. Para corrigir algo, diga no campo ao lado.
          </p>
          {state.sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-soft">{section.title}</h3>
              <ul className="space-y-2">
                {section.entries.map((entry, index) => (
                  <li key={entry.label ?? index} className="text-sm leading-6 text-ink">
                    {entry.label && (
                      <span className="mr-2 font-semibold tabular-nums text-ink-soft">{entry.label}</span>
                    )}
                    {entry.seal && (
                      <span className="mr-2 rounded border border-dashed border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">
                        {entry.seal}
                      </span>
                    )}
                    {entry.tag && (
                      <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                        {entry.tag}
                      </span>
                    )}
                    <ChangeMark entry={entry} />
                    <span
                      className={`break-words${entry.change?.kind === 'removed' ? ' text-muted line-through' : ''}`}
                    >
                      {entry.text}
                    </span>
                    {/* O texto corrigido é do usuário: as citações da análise eram do texto de antes. */}
                    {!entry.userAdded && entry.change?.kind !== 'corrected' && entry.citations.length > 0 && (
                      <span className="ml-1 text-xs text-subtle" aria-label={`Fontes ${entry.citations.join(', ')}`}>
                        {entry.citations.map((n) => `[${n}]`).join(' ')}
                      </span>
                    )}
                    {entry.change?.kind === 'corrected' && (
                      <span className="block text-xs text-subtle">Antes: {entry.change.before}</span>
                    )}
                    {entry.frase && <span className="block text-xs text-subtle">Você disse: “{entry.frase}”</span>}
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
