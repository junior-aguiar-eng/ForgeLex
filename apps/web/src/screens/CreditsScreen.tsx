import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, CreditCard, FileText, History, Loader2, RefreshCw, RotateCcw, WalletCards } from 'lucide-react';
import { ApiRequestError, requestApi } from '../api-client';
import { parseBillingReturn, type BillingReturn } from '../billing-return';

interface BillingPackage { id: string; amountCents: number; label: string; estimatedSearches: number; }
interface BillingAccount {
  currency: string;
  balanceCents: number;
  paidBalanceCents: number;
  promotionalBalanceCents: number;
  searchCostCents: number;
  packages: BillingPackage[];
  customAmount: { minCents: number; maxCents: number };
  autoRecharge: { thresholdCents: number; enabled: boolean; amountCents: number | null; paymentMethodId: string | null };
}
interface BillingPurchase { id: string; amountCents: number; status: string; createdAt: string; packageId: string; }
interface BillingTransaction { id: string; type: string; amountCents: number; status: string; date: string; }
interface BillingInvoice { id: string; number: string; amountCents: number; status: string; issuedAt: string; receiptUrl: string | null; }
interface PaymentMethod { id: string; type: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; isDefault: number; }
interface BillingData { account: BillingAccount; transactions: BillingTransaction[]; purchases: BillingPurchase[]; invoices: BillingInvoice[]; paymentMethods: PaymentMethod[]; }
interface BillingPurchaseStatus { id: string; status: string; amountCents: number; }

const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');
const newIdempotencyKey = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function returnMessage(returnState: BillingReturn, purchaseStatus?: string): { tone: 'success' | 'error'; text: string } {
  if (returnState.outcome === 'canceled') return { tone: 'error', text: 'Pagamento cancelado. Nenhum crédito foi adicionado.' };
  if (purchaseStatus === 'PAID') return { tone: 'success', text: 'Pagamento confirmado. O saldo foi atualizado.' };
  if (purchaseStatus === 'FAILED' || returnState.outcome === 'failed') return { tone: 'error', text: 'O pagamento não foi aprovado. Nenhum crédito foi adicionado.' };
  if (purchaseStatus === 'PROCESSING' || returnState.outcome === 'pending') return { tone: 'error', text: 'Pagamento recebido e ainda em processamento. O saldo será atualizado após a confirmação.' };
  return { tone: 'success', text: 'Pagamento aprovado. Confirmando o crédito…' };
}

export const CreditsScreen: React.FC = () => {
  const [data, setData] = useState<BillingData | null>(null);
  const [selectedPackage, setSelectedPackage] = useState('credits_50');
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [billingState, setBillingState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const billingReturn = useMemo(() => parseBillingReturn(window.location.search), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [account, transactions, invoices, paymentMethods] = await Promise.all([
        requestApi<BillingAccount>('/api/v2/billing/account', {}, { sessionOnly: true }),
        requestApi<{ items: BillingTransaction[]; purchases: BillingPurchase[] }>('/api/v2/billing/transactions', {}, { sessionOnly: true }),
        requestApi<{ invoices: BillingInvoice[] }>('/api/v2/billing/invoices', {}, { sessionOnly: true }),
        requestApi<{ paymentMethods: PaymentMethod[] }>('/api/v2/billing/payment-methods', {}, { sessionOnly: true }),
      ]);
      setData({ account, transactions: transactions.items, purchases: transactions.purchases, invoices: invoices.invoices, paymentMethods: paymentMethods.paymentMethods });
      setBillingState('ready');
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'BILLING_UNAVAILABLE') {
        setBillingState('unavailable');
        setMessage(null);
      } else {
        setBillingState('error');
        setMessage({ tone: 'error', text: error instanceof ApiRequestError ? error.message : 'Não foi possível carregar a conta de faturamento.' });
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!billingReturn) return undefined;
    let active = true;
    setMessage(returnMessage(billingReturn));

    const refreshPurchase = async () => {
      for (let attempt = 0; attempt < 8 && active; attempt += 1) {
        try {
          const purchase = await requestApi<BillingPurchaseStatus>(`/api/v2/billing/purchases/${encodeURIComponent(billingReturn.purchaseId)}`, {}, { sessionOnly: true });
          if (!active) return;
          setMessage(returnMessage(billingReturn, purchase.status));
          if (purchase.status === 'PAID' || purchase.status === 'FAILED') {
            await load();
            return;
          }
        } catch {
          if (active) setMessage(returnMessage(billingReturn));
          return;
        }
        await wait(1500);
      }
      if (active) await load();
    };

    void refreshPurchase();
    return () => { active = false; };
  }, [billingReturn, load]);

  const amountForCheckout = useMemo(() => {
    if (!data || selectedPackage !== 'custom') return undefined;
    const value = Number(customAmount.replace(',', '.'));
    return Number.isFinite(value) ? Math.round(value * 100) : undefined;
  }, [customAmount, data, selectedPackage]);

  const checkout = async () => {
    if (!data) return;
    setBusy('checkout'); setMessage(null);
    try {
      const result = await requestApi<{ checkoutUrl: string }>('/api/v2/billing/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdempotencyKey('web_checkout') },
        body: JSON.stringify(selectedPackage === 'custom' ? { amountCents: amountForCheckout } : { packageId: selectedPackage }),
      }, { sessionOnly: true });
      window.location.assign(result.checkoutUrl);
    } catch (error) { setMessage({ tone: 'error', text: error instanceof ApiRequestError ? error.message : 'Não foi possível iniciar o pagamento.' }); }
    finally { setBusy(null); }
  };

  const toggleAutoRecharge = async () => {
    if (!data) return;
    const enabled = !data.account.autoRecharge.enabled;
    const method = data.paymentMethods.find((item) => item.id === data.account.autoRecharge.paymentMethodId) ?? data.paymentMethods[0];
    if (enabled && !method) { setMessage({ tone: 'error', text: 'Cadastre um cartão antes de ativar a recarga automática.' }); return; }
    setBusy('auto'); setMessage(null);
    try {
      await requestApi('/api/v2/billing/auto-recharge', { method: 'PUT', body: JSON.stringify({ enabled, amountCents: data.account.autoRecharge.amountCents ?? data.account.packages[1]?.amountCents, paymentMethodId: method?.id }) }, { sessionOnly: true });
      await load();
      setMessage({ tone: 'success', text: enabled ? 'Recarga automática ativada.' : 'Recarga automática desativada.' });
    } catch (error) { setMessage({ tone: 'error', text: error instanceof ApiRequestError ? error.message : 'Não foi possível alterar a recarga automática.' }); }
    finally { setBusy(null); }
  };

  const requestRefund = async (purchaseId: string) => {
    setBusy(`refund:${purchaseId}`); setMessage(null);
    try {
      await requestApi('/api/v2/billing/refund-requests', { method: 'POST', body: JSON.stringify({ purchaseId }) }, { sessionOnly: true });
      await load();
      setMessage({ tone: 'success', text: 'Solicitação registrada. O reembolso é analisado manualmente em até sete dias da compra.' });
    } catch (error) { setMessage({ tone: 'error', text: error instanceof ApiRequestError ? error.message : 'Não foi possível solicitar o reembolso.' }); }
    finally { setBusy(null); }
  };

  if (loading && !data) return <div className="page-container py-16 text-sm text-stone-500">Carregando conta de faturamento…</div>;
  if (!data) return <div className="py-8 md:py-12"><div className="page-container"><section className="surface max-w-2xl space-y-4 p-6 sm:p-8"><p className="eyebrow">Conta</p><h1 className="font-editorial text-3xl font-bold text-stone-900">Billing aguardando configuração</h1><p className="text-sm leading-relaxed text-stone-600">O saldo real, os pagamentos e os recibos serão exibidos quando o serviço de faturamento estiver configurado no servidor. Nenhum crédito ou pagamento é presumido nesta sessão.</p>{billingState === 'error' && message && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message.text}</p>}<button type="button" onClick={() => void load()} className="btn-secondary"><RefreshCw className="h-4 w-4" aria-hidden="true" />Tentar novamente</button></section></div></div>;

  const { account } = data;
  const selected = selectedPackage === 'custom' ? undefined : account.packages.find((item) => item.id === selectedPackage);
  const checkoutValid = selectedPackage !== 'custom' || (amountForCheckout !== undefined && amountForCheckout >= account.customAmount.minCents && amountForCheckout <= account.customAmount.maxCents);

  return <div className="py-8 md:py-12"><div className="page-container space-y-8">
    <div className="flex flex-col gap-4 border-b border-champagne-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Conta</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Recarregar créditos</h1><p className="mt-1 text-sm text-stone-500">Pré-pago, em reais e sem mensalidade. Você paga somente pelo uso.</p></div><button type="button" onClick={() => void load()} className="btn-quiet"><RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar</button></div>
    {message && <div className={`rounded-xl border p-4 text-sm ${message.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.text}</div>}
    <section className="surface flex flex-col gap-3 p-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Saldo atual</p><p className="mt-1 font-editorial text-4xl font-bold text-stone-950">{formatBRL(account.balanceCents)}</p><p className="mt-1 text-sm text-stone-500">{formatBRL(account.searchCostCents)} por busca jurisprudencial</p></div><div className="text-left text-sm text-stone-500 sm:text-right"><p>{account.paidBalanceCents > 0 ? `${formatBRL(account.paidBalanceCents)} em créditos pagos` : 'Nenhum crédito pago'}</p><p>{Math.floor(account.balanceCents / account.searchCostCents)} buscas estimadas</p></div></section>
    <section className="surface space-y-6 p-6 sm:p-8"><div><p className="eyebrow">Adicionar saldo</p><h2 className="font-editorial text-2xl font-bold text-stone-900">Escolha o valor</h2><p className="mt-1 text-sm text-stone-500">O saldo não vence. Cartão ou Pix pelo Checkout seguro do Mercado Pago.</p></div><div className="grid gap-3 md:grid-cols-4">{account.packages.map((item) => <button key={item.id} type="button" onClick={() => setSelectedPackage(item.id)} className={`rounded-xl border p-4 text-left transition ${selectedPackage === item.id ? 'border-cognac-700 bg-cognac-50 ring-2 ring-cognac-700/10' : 'border-stone-200 bg-white hover:border-cognac-300'}`}><span className="block text-2xl font-bold text-stone-900">{formatBRL(item.amountCents)}</span><span className="mt-1 block text-xs text-stone-500">≈ {item.estimatedSearches} buscas</span>{selectedPackage === item.id && <Check className="mt-3 h-4 w-4 text-cognac-700" aria-hidden="true" />}</button>)}<button type="button" onClick={() => setSelectedPackage('custom')} className={`rounded-xl border p-4 text-left transition ${selectedPackage === 'custom' ? 'border-cognac-700 bg-cognac-50 ring-2 ring-cognac-700/10' : 'border-stone-200 bg-white hover:border-cognac-300'}`}><span className="block text-lg font-bold text-stone-900">Outro valor</span><span className="mt-1 block text-xs text-stone-500">De {formatBRL(account.customAmount.minCents)} a {formatBRL(account.customAmount.maxCents)}</span></button></div>{selectedPackage === 'custom' && <label className="block max-w-sm text-sm font-semibold text-stone-700">Valor em reais<input value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} className="input-control mt-2" inputMode="decimal" placeholder="25,00" /></label>}<button type="button" disabled={!checkoutValid || busy === 'checkout'} onClick={() => void checkout()} className="btn-primary w-full justify-center">{busy === 'checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Pagar {selected ? formatBRL(selected.amountCents) : amountForCheckout ? formatBRL(amountForCheckout) : ''}</button><div className="grid gap-3 text-xs text-stone-500 sm:grid-cols-3"><span className="inline-flex items-center gap-2"><CreditCard className="h-4 w-4 text-cognac-700" />Cartão ou Pix</span><span className="inline-flex items-center gap-2"><WalletCards className="h-4 w-4 text-cognac-700" />Pré-pago, sem assinatura</span><span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-cognac-700" />Crédito após confirmação</span></div></section>
    <section className="surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Recarga automática</h2></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">Quando o saldo pago chegar a {formatBRL(account.autoRecharge.thresholdCents)}, o ForgeLex usa o último valor escolhido no cartão salvo. A primeira ativação exige um cartão.</p><p className="mt-2 text-xs text-stone-500">{account.autoRecharge.amountCents ? `Valor configurado: ${formatBRL(account.autoRecharge.amountCents)}` : 'Nenhum valor configurado'}</p></div><button type="button" onClick={() => void toggleAutoRecharge()} disabled={busy === 'auto'} className={`relative h-7 w-12 shrink-0 rounded-full transition ${account.autoRecharge.enabled ? 'bg-cognac-700' : 'bg-stone-300'}`} aria-label={account.autoRecharge.enabled ? 'Desativar recarga automática' : 'Ativar recarga automática'}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${account.autoRecharge.enabled ? 'left-6' : 'left-1'}`} /></button></section>
    <div className="grid gap-6 lg:grid-cols-2"><section className="surface space-y-4 p-6"><div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Cartões salvos</h2></div>{data.paymentMethods.length ? data.paymentMethods.map((method) => <div key={method.id} className="flex items-center justify-between rounded-lg border border-stone-200 p-3 text-sm"><span>{method.brand ?? 'Cartão'} {method.last4 ? `terminado em ${method.last4}` : ''}</span><span className="text-xs text-stone-500">{method.isDefault ? 'Padrão' : 'Disponível'}</span></div>) : <p className="text-sm text-stone-500">Nenhum cartão salvo. O cartão usado em uma compra pode ser preparado para recarga automática pelo Checkout.</p>}</section><section className="surface space-y-4 p-6"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Faturas e recibos</h2></div>{data.invoices.length ? data.invoices.slice(0, 4).map((invoice) => <div key={invoice.id} className="flex items-center justify-between border-b border-stone-100 pb-3 text-sm last:border-0 last:pb-0"><span><strong>{invoice.number}</strong><span className="ml-2 text-xs text-stone-500">{formatDate(invoice.issuedAt)}</span></span>{invoice.receiptUrl ? <a href={invoice.receiptUrl} target="_blank" rel="noreferrer" className="text-cognac-800 underline">Recibo</a> : <span>{formatBRL(invoice.amountCents)}</span>}</div>) : <p className="text-sm text-stone-500">As faturas internas e recibos do Mercado Pago aparecerão após a confirmação do pagamento.</p>}</section></div>
    <section className="surface space-y-4 p-6"><div className="flex items-center gap-2"><History className="h-5 w-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Últimos lançamentos</h2></div>{data.transactions.length ? <div className="divide-y divide-stone-100">{data.transactions.slice(0, 8).map((item) => <div key={item.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span><strong>{item.type === 'CREDIT' ? 'Crédito' : item.type === 'REFUND' ? 'Reembolso' : 'Uso'}</strong><span className="ml-2 text-xs text-stone-500">{formatDate(item.date)}</span></span><span className={item.type === 'CREDIT' || item.type === 'REFUND' ? 'text-emerald-700' : 'text-stone-700'}>{item.type === 'CREDIT' || item.type === 'REFUND' ? '+' : '-'}{formatBRL(item.amountCents)}</span></div>)}</div> : <p className="text-sm text-stone-500">Nenhum lançamento registrado.</p>}</section>
    {data.purchases.filter((purchase) => purchase.status === 'PAID').length > 0 && <section className="surface space-y-4 p-6"><div className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Solicitar reembolso</h2></div><p className="text-sm text-stone-500">Solicitações manuais podem ser feitas em até sete dias da compra, limitadas aos créditos ainda não consumidos.</p>{data.purchases.filter((purchase) => purchase.status === 'PAID').slice(0, 4).map((purchase) => <div key={purchase.id} className="flex flex-col gap-3 border-b border-stone-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm">{formatBRL(purchase.amountCents)} · {formatDate(purchase.createdAt)}</span><button type="button" onClick={() => void requestRefund(purchase.id)} disabled={busy === `refund:${purchase.id}`} className="btn-quiet">{busy === `refund:${purchase.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Solicitar análise</button></div>)}</section>}
  </div></div>;
};
