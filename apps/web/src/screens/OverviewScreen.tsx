import React, { useEffect, useState } from 'react';
import { ArrowRight, Cable, Check, FileText, Search } from 'lucide-react';
import {
  getBillingTransactions,
  getMcpConnectionStatus,
  listApiKeys,
  requestApi,
  type BillingTransaction,
  type McpConnectionStatusResponse,
} from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/ice/PageHeader';
import { CASE_WORKSPACE_ENABLED, DESK_ENABLED } from '../config/site-capabilities';
import { useApp } from '../context/AppContext';
import { formatBRL } from '../format';
import {
  activeMatters,
  connectionRows,
  matterStatusLabel,
  monthlyUsage,
  overviewSteps,
  overviewSubtitle,
  pendingStep,
  stepsProgress,
  type MatterSummary,
} from './overview-model';
import {
  browserStorage,
  readFirstStepsHidden,
  readVerifiedCitation,
  writeFirstStepsHidden,
} from './first-steps-storage';

/**
 * Visão geral no tema gelo (V2, protótipo de 09/11): primeiros passos com o estado real da conta, atalhos, casos
 * abertos, conexões e consumo do mês. Cada bloco lê os dados que a conta já devolve e mostra "indisponível" quando não
 * houver resposta, sem inventar valor.
 */

interface OverviewData {
  matters?: MatterSummary[];
  mcp?: McpConnectionStatusResponse;
  activeKeys?: number;
  transactions?: BillingTransaction[];
}

function useOverviewData(): OverviewData {
  const [data, setData] = useState<OverviewData>({});
  useEffect(() => {
    let active = true;
    const apply = (patch: OverviewData) => {
      if (active) setData((current) => ({ ...current, ...patch }));
    };
    if (CASE_WORKSPACE_ENABLED) {
      void requestApi<{ items: MatterSummary[] }>('/api/v2/matters', {}, { sessionOnly: true })
        .then((response) => apply({ matters: response.items }))
        .catch(() => undefined);
    }
    void getMcpConnectionStatus()
      .then((mcp) => apply({ mcp }))
      .catch(() => undefined);
    void listApiKeys()
      .then((response) => apply({ activeKeys: response.items.filter((key) => !key.revokedAt).length }))
      .catch(() => undefined);
    void getBillingTransactions()
      .then((response) => apply({ transactions: response.items }))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return data;
}

const cardClass = 'rounded-2xl border border-line bg-surface';
const sectionTitle = 'font-editorial text-[17px] font-semibold text-ink';

const Shortcut: React.FC<{ icon: React.ReactNode; title: string; text: string; onClick: () => void }> = ({
  icon,
  title,
  text,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`${cardClass} flex flex-col items-start justify-start p-5 text-left transition-colors hover:border-accent`}
  >
    <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-accent-tint text-accent">
      {icon}
    </span>
    <span className="mt-3.5 block font-editorial text-lg font-semibold text-ink">{title}</span>
    <span className="mt-1.5 block text-[13px] leading-relaxed text-muted">{text}</span>
  </button>
);

export const OverviewScreen: React.FC = () => {
  const { setActiveTab, searchCostCents } = useApp();
  const { account } = useAuth();
  const userId = account?.user.id ?? '';
  const data = useOverviewData();
  const [hidden, setHidden] = useState(() => readFirstStepsHidden(browserStorage(), userId));

  const matters = data.matters ?? [];
  const open = activeMatters(matters, 3);
  const openCount = data.matters ? matters.filter((matter) => matter.status === 'OPEN').length : undefined;
  const steps = overviewSteps({
    connected: data.mcp ? data.mcp.authenticatedCredential || data.mcp.lastMcpUseAt !== null : undefined,
    matterCount: data.matters?.length,
    verified: readVerifiedCitation(browserStorage(), userId),
    casesEnabled: CASE_WORKSPACE_ENABLED,
  });
  const progress = stepsProgress(steps);
  const next = pendingStep(steps);
  const usage = data.transactions ? monthlyUsage(data.transactions, new Date()) : undefined;
  const price = searchCostCents === null ? undefined : formatBRL(searchCostCents);

  const setStepsHidden = (value: boolean) => {
    writeFirstStepsHidden(browserStorage(), userId, value);
    setHidden(value);
  };

  return (
    <>
      <PageHeader
        title="O que você precisa fazer hoje?"
        subtitle={overviewSubtitle({ casesEnabled: CASE_WORKSPACE_ENABLED, openCount })}
      />
      <div className="flex flex-col gap-6 px-6 pb-9 pt-6 sm:px-8">
        {hidden ? (
          <div>
            <button type="button" onClick={() => setStepsHidden(false)} className="btn-quiet">
              Mostrar primeiros passos
            </button>
          </div>
        ) : (
          <section aria-labelledby="primeiros-passos-titulo" className={`${cardClass} p-[22px]`}>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 id="primeiros-passos-titulo" className="font-editorial text-[19px] font-semibold text-ink">
                Primeiros passos
              </h2>
              <span className="text-[13px] text-muted">
                {progress.done} de {progress.total} concluídos
              </span>
              <button
                type="button"
                onClick={() => setStepsHidden(true)}
                className="btn-quiet ml-auto"
                aria-label="Ocultar primeiros passos"
              >
                Ocultar
              </button>
            </div>
            <div
              role="progressbar"
              aria-label="Primeiros passos concluídos"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas-deep"
            >
              <div className="h-1.5 bg-accent" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {steps.map((step) => {
                const highlighted = next?.id === step.id;
                return (
                  <li
                    key={step.id}
                    className={`rounded-xl border p-3.5 ${highlighted ? 'border-accent bg-accent-soft' : 'border-line'}`}
                  >
                    {step.done ? (
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Feito
                      </span>
                    ) : (
                      <span className="text-[13px] font-semibold text-accent-strong">
                        {highlighted ? 'Falta este' : 'A fazer'}
                      </span>
                    )}
                    <h3 className="mt-1.5 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.description}</p>
                    {!step.done && (
                      <button
                        type="button"
                        onClick={() => setActiveTab(step.tab)}
                        className={`${highlighted ? 'btn-primary' : 'btn-secondary'} mt-3 !min-h-11 !px-4 !text-[13px]`}
                      >
                        {step.action}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section aria-label="Atalhos" className={`grid gap-4 ${DESK_ENABLED ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {DESK_ENABLED && (
            <Shortcut
              icon={<FileText className="h-[17px] w-[17px]" aria-hidden="true" />}
              title="Abrir a Mesa"
              text="Descreva a tarefa e acompanhe a execução em etapas."
              onClick={() => setActiveTab('work')}
            />
          )}
          <Shortcut
            icon={<Search className="h-[17px] w-[17px]" aria-hidden="true" />}
            title="Pesquisar o STJ"
            text={price ? `Consulta com proveniência. ${price} por pesquisa.` : 'Consulta com proveniência.'}
            onClick={() => setActiveTab('research')}
          />
          <Shortcut
            icon={<Cable className="h-[17px] w-[17px]" aria-hidden="true" />}
            title="Conectar sua IA"
            text="MCP remoto para ChatGPT ou Claude."
            onClick={() => setActiveTab('connections')}
          />
        </section>

        <div className="flex flex-wrap items-start gap-5">
          {CASE_WORKSPACE_ENABLED && (
            <section
              aria-labelledby="casos-ativos-titulo"
              className={`${cardClass} min-w-0 flex-[999_1_420px] overflow-hidden`}
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
                <h2 id="casos-ativos-titulo" className={sectionTitle}>
                  Casos ativos
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('matter')}
                  className="ml-auto inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:text-accent-strong"
                >
                  Ver todos
                </button>
              </div>
              {data.matters === undefined ? (
                <p className="px-5 py-4 text-sm text-muted">Carregando os casos…</p>
              ) : open.length === 0 ? (
                <div className="px-5 py-4">
                  <p className="text-sm text-muted">Nenhum caso aberto ainda.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('matter')}
                    className="btn-secondary mt-3 !text-[13px]"
                  >
                    Criar um caso
                  </button>
                </div>
              ) : (
                <ul>
                  {open.map((matter) => (
                    <li key={matter.id} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setActiveTab('matter', 'push', { matterId: matter.id })}
                        className="flex min-h-11 w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-surface-muted"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{matter.title}</span>
                          {matter.practiceArea && (
                            <span className="mt-0.5 block text-xs text-subtle">{matter.practiceArea}</span>
                          )}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-ok">
                          <span className="h-[7px] w-[7px] rounded-full bg-ok" aria-hidden="true" />
                          {matterStatusLabel(matter.status)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section aria-labelledby="conexoes-titulo" className={`${cardClass} p-5`}>
              <h2 id="conexoes-titulo" className={sectionTitle}>
                Conexões
              </h2>
              <ul className="mt-3.5 flex flex-col gap-3">
                {connectionRows({ mcp: data.mcp, activeKeys: data.activeKeys }).map((row) => (
                  <li key={row.label} className="flex items-center gap-2.5">
                    <span
                      className={`h-2 w-2 rounded-full ${row.state === 'ok' ? 'bg-ok' : 'bg-line-control'}`}
                      aria-hidden="true"
                    />
                    <span className="text-[13px] text-ink-soft">{row.label}</span>
                    <span className={`ml-auto text-xs font-semibold ${row.state === 'ok' ? 'text-ok' : 'text-subtle'}`}>
                      {row.text}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setActiveTab('connections')}
                className="mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:text-accent-strong"
              >
                Gerenciar conexões
              </button>
            </section>

            <section aria-labelledby="consumo-titulo" className={`${cardClass} p-5`}>
              <h2 id="consumo-titulo" className={sectionTitle}>
                Consumo do mês
              </h2>
              {usage ? (
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-editorial text-[30px] font-semibold text-ink">
                    {formatBRL(usage.totalCents)}
                  </span>
                  <span className="text-xs text-subtle">
                    {usage.count === 1 ? '1 operação' : `${usage.count} operações`}
                  </span>
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted">Consumo indisponível no momento.</p>
              )}
              <p className="mt-2.5 text-xs leading-relaxed text-subtle">
                Verificações de autoridade e consultas processuais não entram neste total.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('account_activity')}
                className="mt-2 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-accent hover:text-accent-strong"
              >
                Ver recibos
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};
