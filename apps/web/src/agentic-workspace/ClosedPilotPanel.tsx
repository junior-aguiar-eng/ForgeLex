import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceClient, type ClosedPilotBudget } from './client';
import type { Execution } from './execution-model';

const usd = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function ClosedPilotPanel({
  client,
  executionId,
  refreshKey,
  active,
  onStarted,
}: {
  client: WorkspaceClient;
  executionId?: string;
  refreshKey: string;
  active: boolean;
  onStarted: (execution: Execution) => void;
}) {
  const [budget, setBudget] = useState<ClosedPilotBudget>();
  const [caseId, setCaseId] = useState('T6-MIN'),
    [maximum, setMaximum] = useState(50);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const mounted = useRef(false),
    generation = useRef(0),
    pending = useRef(false);
  const key = useRef<string>();
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [invalidate]);
  async function load() {
    const current = ++generation.current;
    try {
      const value = await client.closedBudget(executionId);
      if (mounted.current && generation.current === current) {
        setBudget(value);
        setError('');
      }
    } catch {
      if (mounted.current && generation.current === current)
        setError('Não foi possível conferir o orçamento do piloto.');
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearInterval(timer);
      invalidate();
    };
  }, [client, executionId, refreshKey, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps
  const available = Boolean(
    budget && !budget.reconciliationRequired && maximum > 0 && maximum <= budget.availableCents,
  );
  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || !available || active || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    key.current ??= crypto.randomUUID();
    try {
      const execution = await client.closedStart({ caseId, maxCostCents: maximum, confirmed: true }, key.current);
      if (!mounted.current) return;
      key.current = undefined;
      setConfirmed(false);
      onStarted(execution);
      void load();
    } catch {
      if (mounted.current)
        setError(
          'Não foi possível autorizar o exemplo. Confira o orçamento e tente novamente; o teto não foi reposto.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Piloto fechado e consumo"
      className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6 space-y-4"
    >
      <h2 className="font-editorial text-xl">Piloto fechado — exemplos sintéticos</h2>
      <p className="text-sm">
        Somente para o responsável autorizado · OpenAI {budget?.model ?? 'gpt-6.1-sol'} · sem pesquisa paga ou fallback.
      </p>
      {error && <p role="alert">{error}</p>}
      {budget && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {(
              [
                ['Teto cumulativo', budget.ceilingCents],
                ['Disponível', budget.availableCents],
                ['Reservado', budget.escrowCents],
                ['Consumo arredondado no ledger', budget.settledCents],
                ['Provisão incerta', budget.provisionedCents],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="font-semibold">{usd(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            Valores em USD, separados dos créditos BRL. Provisão não é cobrança confirmada. Estes valores não são uma
            fatura.
          </p>
          {budget.reconciliationRequired && (
            <p role="alert">
              Há envio sem consumo confirmado. Novos envios aguardam a liquidação ou conciliação; a reserva foi
              preservada.
            </p>
          )}
          {budget.execution && (
            <p className="text-sm">
              Execução atual: limite {usd(budget.execution.maximumCents)}, consumo arredondado{' '}
              {usd(budget.execution.settledCents)}, reserva {usd(budget.execution.escrowCents)}.
            </p>
          )}
          <form onSubmit={start} className="space-y-3">
            <label className="block">
              Exemplo sintético aprovado
              <select
                className="block min-h-11 w-full rounded-lg border p-2"
                value={caseId}
                disabled={busy || active}
                onChange={(event) => {
                  setCaseId(event.target.value);
                  setConfirmed(false);
                  key.current = undefined;
                }}
              >
                {budget.examples.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.id} — {example.objective}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Limite desta execução (centavos de dólar)
              <input
                className="block min-h-11 rounded-lg border p-2 w-full"
                type="number"
                min={1}
                max={Math.min(500, budget.availableCents)}
                value={maximum}
                disabled={busy || active}
                onChange={(event) => {
                  setMaximum(Number(event.target.value));
                  setConfirmed(false);
                  key.current = undefined;
                }}
              />
            </label>
            <label className="flex gap-2 items-start">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || active || !available}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Autorizo o envio deste exemplo sintético e a reserva de até {usd(maximum)}, dentro do teto cumulativo de{' '}
                {usd(budget.ceilingCents)}.
              </span>
            </label>
            <button className="btn-primary" type="submit" disabled={!confirmed || !available || busy || active}>
              Executar exemplo sintético
            </button>
          </form>
        </>
      )}
      <button type="button" className="btn-secondary" onClick={() => void load()}>
        Atualizar consumo
      </button>
    </section>
  );
}
