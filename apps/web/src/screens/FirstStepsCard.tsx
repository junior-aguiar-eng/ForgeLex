import React, { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { AppTab } from '../navigation/routes';
import { firstSteps } from './first-steps';
import { browserStorage, readFirstStepsHidden, writeFirstStepsHidden } from './first-steps-storage';

/** "Primeiros passos" da Visão (V2, tema gelo): quatro passos, ocultável, e o estado vale por usuário no navegador. */
export const FirstStepsCard: React.FC<{ userId: string; deskEnabled: boolean; onOpen: (tab: AppTab) => void }> = ({
  userId,
  deskEnabled,
  onOpen,
}) => {
  const [hidden, setHidden] = useState(() => readFirstStepsHidden(browserStorage(), userId));
  const change = (next: boolean) => {
    writeFirstStepsHidden(browserStorage(), userId, next);
    setHidden(next);
  };

  if (hidden) {
    return (
      <div className="mx-auto max-w-4xl">
        <button type="button" onClick={() => change(false)} className="btn-quiet">
          Mostrar primeiros passos
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="primeiros-passos-titulo" className="surface mx-auto max-w-4xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Para começar</p>
          <h2 id="primeiros-passos-titulo" className="font-editorial mt-1 text-xl font-semibold text-ink">
            Primeiros passos
          </h2>
        </div>
        <button type="button" onClick={() => change(true)} className="btn-quiet" aria-label="Ocultar primeiros passos">
          <X className="h-4 w-4" aria-hidden="true" />
          Ocultar
        </button>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {firstSteps({ deskEnabled }).map((step, index) => (
          <li
            key={step.id}
            className="flex flex-col gap-2 rounded-[var(--fl-radius-card-subtle)] border border-line bg-surface-muted p-4"
          >
            <span className="text-xs font-semibold text-accent">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="font-editorial text-base font-semibold text-ink">{step.title}</h3>
            <p className="text-sm text-muted">{step.description}</p>
            <button type="button" onClick={() => onOpen(step.tab)} className="btn-secondary mt-auto self-start">
              {step.action}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
