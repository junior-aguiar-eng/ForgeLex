import React, { useEffect, useState } from 'react';
import { getBillingTransactions } from '../../api-client';
import { useAuth } from '../../auth/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatBRL } from '../../format';
import { recentAccountActivity, type ActivityLine } from './account-aside-model';

/**
 * Coluna lateral da Conta (tema gelo, V5): identificação, resumo das chaves, atividade recente e encerramento. Cada
 * cartão busca o próprio dado e, se falhar, diz que está indisponível sem derrubar os outros. Nada é calculado aqui: os
 * valores vêm do serviço em centavos e as chaves aparecem só pelo prefixo público.
 */
type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; value: T };

const card = 'rounded-2xl border border-line bg-surface p-5';
const label = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle';
const link = 'inline-flex min-h-11 items-center text-[13px] font-semibold text-accent hover:text-accent-strong';

const shortDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

export const AccountAside: React.FC = () => {
  const { account } = useAuth();
  const { setActiveTab } = useApp();
  const [activity, setActivity] = useState<Load<ActivityLine[]>>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    getBillingTransactions().then(
      (result) => alive && setActivity({ state: 'ready', value: recentAccountActivity(result.items) }),
      () => alive && setActivity({ state: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <aside aria-label="Resumo da conta" className="space-y-4">
      <section aria-labelledby="conta-identificacao" className={card}>
        <h2 id="conta-identificacao" className={label}>
          Identificação
        </h2>
        {account ? (
          <>
            <p className="mt-2 font-editorial text-lg font-semibold text-ink">{account.user.displayName}</p>
            <p className="text-sm text-muted">{account.workspace.name}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Dados da conta indisponíveis.</p>
        )}
        <p className="mt-1 text-xs text-subtle">Conta pré-paga, em reais.</p>
      </section>

      <section aria-labelledby="conta-atividade" className={card}>
        <h2 id="conta-atividade" className={label}>
          Atividade da conta
        </h2>
        {activity.state === 'loading' && <p className="mt-2 text-sm text-muted">Carregando…</p>}
        {activity.state === 'error' && <p className="mt-2 text-sm text-muted">Atividade indisponível no momento.</p>}
        {activity.state === 'ready' &&
          (activity.value.length ? (
            <ol className="mt-2 space-y-2">
              {activity.value.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-ink">{item.label}</span>
                    <span className="block text-xs text-subtle">{shortDate(item.date)}</span>
                  </span>
                  <span className="shrink-0 text-ink-soft">{formatBRL(item.amountCents)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">Nenhum lançamento registrado.</p>
          ))}
        <button type="button" onClick={() => setActiveTab('account_activity')} className={`mt-1 ${link}`}>
          Ver atividade
        </button>
      </section>

      <section aria-labelledby="conta-encerramento" className={card}>
        <h2 id="conta-encerramento" className={label}>
          Encerramento de conta
        </h2>
        <p className="mt-2 text-sm text-muted">
          O encerramento é pedido em Segurança e abre um acompanhamento com recibo. O que acontece com o saldo e com os
          dados segue a política publicada.
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <button type="button" onClick={() => setActiveTab('account_security')} className={link}>
            Ir para Segurança
          </button>
          <a href="/legal/retencao-pos-encerramento.html" className={link}>
            Política de destinação
          </a>
        </div>
      </section>
    </aside>
  );
};
