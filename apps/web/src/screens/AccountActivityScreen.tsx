import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, CircleAlert, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { ApiRequestError, getBillingAccount, getBillingTransactions, type BillingTransaction } from '../api-client';

export type BillingActivity = Pick<BillingTransaction, 'id' | 'type' | 'amountCents' | 'status' | 'date' | 'capability' | 'channel'>;

export interface ActivitySummary {
  operations: number;
  spentCents: number;
  lastUsedAt: string | null;
}

const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDateTime = (date: string) => new Date(date).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const thirtyDaysAgo = (now: Date) => now.getTime() - 30 * 24 * 60 * 60 * 1000;

export function summarizeActivities(activities: BillingActivity[], now = new Date()): ActivitySummary {
  const recent = activities.filter((item) => new Date(item.date).getTime() >= thirtyDaysAgo(now));
  return {
    operations: recent.length,
    spentCents: recent.reduce((total, item) => total + item.amountCents, 0),
    lastUsedAt: recent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date ?? null,
  };
}

const channelLabel = (channel: BillingTransaction['channel']) => channel ?? 'Não registrado';

export const AccountActivityScreen: React.FC = () => {
  const [account, setAccount] = useState<Awaited<ReturnType<typeof getBillingAccount>> | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAccount, statement] = await Promise.all([getBillingAccount(), getBillingTransactions()]);
      setAccount(nextAccount);
      setTransactions(statement.items);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível carregar a atividade da conta.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activities = useMemo(() => transactions.filter((item) => item.type === 'DEBIT' && item.capability !== null), [transactions]);
  const summary = useMemo(() => summarizeActivities(activities), [activities]);

  if (loading && !account) return <div className="page-container py-16 text-sm text-stone-500">Carregando atividade da conta…</div>;
  if (!account) return <div className="page-container py-12"><section className="surface max-w-2xl space-y-4 p-6 sm:p-8"><p className="eyebrow">Conta</p><h1 className="font-editorial text-3xl font-bold text-stone-900">Atividade indisponível</h1><p className="text-sm leading-relaxed text-stone-600">{error ?? 'A atividade fica disponível quando o faturamento estiver configurado.'}</p><button type="button" onClick={() => void load()} className="btn-secondary"><RefreshCw className="h-4 w-4" aria-hidden="true" />Tentar novamente</button></section></div>;

  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <div className="flex flex-col gap-4 border-b border-champagne-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Conta</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Atividade da conta</h1><p className="mt-1 max-w-2xl text-sm text-stone-500">Acompanhe o uso faturável por capacidade e canal. O ForgeLex não registra a sua consulta jurídica neste extrato.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="btn-quiet">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</button></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    <section className="surface grid gap-5 p-6 md:grid-cols-2"><div><p className="eyebrow">Saldo atual</p><p className="mt-1 font-editorial text-4xl font-bold text-stone-950">{formatBRL(account.balanceCents)}</p><p className="mt-1 text-sm text-stone-500">{formatBRL(account.paidBalanceCents)} em créditos pagos · {formatBRL(account.promotionalBalanceCents)} promocionais</p></div><div className="border-t border-stone-100 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0"><p className="eyebrow">Conferência</p><p className="mt-2 text-sm leading-relaxed text-stone-600">O saldo é calculado no ledger a partir dos créditos e débitos liquidados. Replays idempotentes não geram novo lançamento.</p></div></section>
    {summary.operations > 0 ? <section className="grid gap-4 sm:grid-cols-3"><div className="surface p-5"><p className="eyebrow">Últimos 30 dias</p><p className="mt-2 font-editorial text-3xl font-bold text-stone-900">{summary.operations}</p><p className="mt-1 text-sm text-stone-500">operações faturáveis</p></div><div className="surface p-5"><p className="eyebrow">Gasto</p><p className="mt-2 font-editorial text-3xl font-bold text-stone-900">{formatBRL(summary.spentCents)}</p><p className="mt-1 text-sm text-stone-500">em operações reais</p></div><div className="surface p-5"><p className="eyebrow">Último uso</p><p className="mt-2 text-lg font-semibold text-stone-900">{summary.lastUsedAt ? formatDateTime(summary.lastUsedAt) : '—'}</p><p className="mt-1 text-sm text-stone-500">horário registrado</p></div></section> : <section className="surface flex gap-3 p-6"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><div><h2 className="font-editorial text-xl font-bold text-stone-900">Nenhuma operação faturável nos últimos 30 dias</h2><p className="mt-1 text-sm leading-relaxed text-stone-500">Quando houver uso cobrado, os indicadores e o canal aparecerão aqui. Nenhum gráfico é exibido sem dados reais.</p></div></section>}
    <section className="surface space-y-4 p-6"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-cognac-700" aria-hidden="true" /><div><h2 className="font-editorial text-xl font-bold text-stone-900">Operações faturáveis</h2><p className="text-sm text-stone-500">Cada linha corresponde a um débito liquidado.</p></div></div>{activities.length ? <div className="divide-y divide-stone-100">{activities.map((item) => <article key={item.id} className="py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-stone-900">{item.capability}</strong><span className="rounded-full bg-cognac-50 px-2 py-0.5 text-[11px] font-semibold text-cognac-800">{channelLabel(item.channel)}</span><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{item.status === 'SETTLED' ? 'Liquidado' : item.status}</span></div><p className="mt-1 text-xs text-stone-500">{formatDateTime(item.date)}</p></div><strong className="text-sm text-stone-800">−{formatBRL(item.amountCents)}</strong></div>{item.technical && <details className="mt-3 text-xs text-stone-500"><summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-stone-600">Detalhes técnicos para suporte <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></summary><dl className="mt-2 grid gap-1 rounded-lg bg-stone-50 p-3 sm:grid-cols-2"><div><dt className="text-stone-400">Capacidade</dt><dd>{item.technical.capability}</dd></div><div><dt className="text-stone-400">Solicitação</dt><dd>{item.technical.requestId}</dd></div>{item.technical.provider && <div><dt className="text-stone-400">Provedor</dt><dd>{item.technical.provider}</dd></div>}</dl></details>}</article>)}</div> : <p className="text-sm text-stone-500">Nenhuma operação faturável foi registrada nesta conta.</p>}</section>
    <section className="surface space-y-4 p-6"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-cognac-700" aria-hidden="true" /><div><h2 className="font-editorial text-xl font-bold text-stone-900">Lançamentos financeiros</h2><p className="text-sm text-stone-500">Créditos, reembolsos e débitos liquidados.</p></div></div>{transactions.length ? <div className="divide-y divide-stone-100">{transactions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span><strong>{item.type === 'CREDIT' ? 'Crédito' : item.type === 'REFUND' ? 'Reembolso' : item.capability ?? 'Uso'}</strong><span className="ml-2 text-xs text-stone-500">{formatDateTime(item.date)}</span></span><span className={item.type === 'DEBIT' ? 'text-stone-800' : 'text-emerald-700'}>{item.type === 'DEBIT' ? '−' : '+'}{formatBRL(item.amountCents)}</span></div>)}</div> : <p className="text-sm text-stone-500">Nenhum lançamento financeiro registrado.</p>}</section>
  </div></div>;
};
