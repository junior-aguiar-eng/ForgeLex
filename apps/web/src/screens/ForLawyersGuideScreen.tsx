import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleDollarSign, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react';
import { requestApi } from '../api-client';

type BillingCostResponse = { account: { searchCostCents: number } };

const reviewedOn = '22 de setembro de 2026';

const hostInstructions = [
  {
    name: 'ChatGPT',
    steps: [
      'Use o ChatGPT na Web e confirme se seu plano ou workspace permite conectores MCP remotos.',
      'No fluxo de conectores ou apps disponível na sua conta, informe a URL do ForgeLex e siga as confirmações mostradas pelo próprio host.',
      'Se a opção não aparecer, não há uma configuração alternativa no ForgeLex: verifique a elegibilidade da conta no suporte oficial do host.',
    ],
  },
  {
    name: 'Claude',
    steps: [
      'No Claude, abra a área de conectores disponível na sua conta e confirme que conectores personalizados/remotos estão liberados.',
      'Adicione a URL do ForgeLex e conclua a autenticação solicitada pelo host.',
      'Ative o conector na conversa antes de enviar a primeira pergunta; a disponibilidade pode variar conforme plano, organização e interface do host.',
    ],
  },
] as const;

const examples = [
  'Pesquise jurisprudência do STJ sobre [tema ou tese].',
  'Abra a autoridade [identificador] e mostre a proveniência disponível.',
  'Verifique a proveniência da autoridade [identificador].',
] as const;

export function formatSearchCost(searchCostCents: number | null): string {
  if (searchCostCents === null) return 'Consulte a conta para ver o custo atualizado da pesquisa.';
  return `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(searchCostCents / 100)} por pesquisa jurisprudencial`;
}

export const ForLawyersGuideScreen: React.FC = () => {
  const [searchCostCents, setSearchCostCents] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void requestApi<BillingCostResponse>('/api/v2/billing/account', {}, { sessionOnly: true })
      .then((response) => { if (active) setSearchCostCents(response.account.searchCostCents); })
      .catch(() => { if (active) setSearchCostCents(null); });
    return () => { active = false; };
  }, []);

  return <div className="py-8 md:py-12"><main className="page-container space-y-8">
    <header className="border-b border-champagne-border pb-6"><p className="eyebrow">Guia de primeiro uso</p><h1 className="font-editorial text-3xl font-bold text-stone-900 sm:text-4xl">Guia de conexão para advogados</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600">Este roteiro explica como usar a pesquisa jurídica do ForgeLex no host de IA que você já utiliza, sem documentação de desenvolvedor.</p></header>

    <section className="surface space-y-3 p-5 sm:p-6" aria-labelledby="what-is"><h2 id="what-is" className="font-editorial text-2xl font-bold text-stone-900">O que é</h2><p className="text-sm leading-relaxed text-stone-600">O ForgeLex fornece ferramentas de pesquisa jurídica, autoridades e proveniência. O ChatGPT ou Claude formula a resposta: o modelo, a conta e a assinatura do host pertencem ao respectivo serviço.</p></section>

    <section className="surface space-y-5 p-5 sm:p-6" aria-labelledby="how-connect"><div><h2 id="how-connect" className="font-editorial text-2xl font-bold text-stone-900">Como conectar</h2><p className="mt-1 text-sm leading-relaxed text-stone-600">As interfaces dos hosts podem mudar. As instruções abaixo evitam depender de um botão ou menu que não esteja disponível na sua conta.</p></div><div className="grid gap-4 lg:grid-cols-2">{hostInstructions.map((host) => <article key={host.name} className="rounded-xl border border-stone-200 bg-[#FDFBF7] p-4"><h3 className="text-lg font-bold text-stone-800">{host.name}</h3><ol className="mt-3 space-y-3 text-sm leading-relaxed text-stone-600">{host.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cognac-100 text-xs font-bold text-cognac-800">{index + 1}</span><span>{step}</span></li>)}</ol><p className="mt-4 text-xs text-stone-500">Última revisão: {reviewedOn}</p></article>)}</div></section>

    <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="how-ask"><h2 id="how-ask" className="font-editorial text-2xl font-bold text-stone-900">Como perguntar</h2><p className="text-sm leading-relaxed text-stone-600">Para uma pesquisa rastreável, siga a sequência <strong className="font-semibold text-stone-800">pesquisar → abrir autoridade → verificar</strong>. A primeira etapa localiza resultados; as seguintes ajudam a conferir a origem antes de usar a informação no trabalho jurídico.</p><ol className="grid gap-3 md:grid-cols-3">{examples.map((example, index) => <li key={example} className="rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-relaxed text-stone-600"><span className="mb-2 block text-xs font-bold text-cognac-800">Pergunta {index + 1}</span>{example}</li>)}</ol></section>

    <section className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between" aria-labelledby="cost"><div className="flex gap-3"><CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><div><h2 id="cost" className="font-editorial text-2xl font-bold text-stone-900">Quanto custa</h2><p className="mt-1 text-sm leading-relaxed text-stone-600">{formatSearchCost(searchCostCents)} Abrir uma autoridade e verificar a proveniência são operações gratuitas.</p></div></div><a href="/conta" className="btn-primary shrink-0">Ir para a conta</a></section>

    <section className="surface space-y-3 p-5 sm:p-6" aria-labelledby="privacy"><div className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><div><h2 id="privacy" className="font-editorial text-2xl font-bold text-stone-900">Privacidade</h2><p className="mt-1 text-sm leading-relaxed text-stone-600">O ForgeLex recebe a chamada autenticada e os argumentos da ferramenta. Não recebe o histórico geral da conversa, arquivos ou mensagens que o host não envie como argumento da ferramenta.</p></div></div></section>

    <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="revoke"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cognac-700" aria-hidden="true" /><div><h2 id="revoke" className="font-editorial text-2xl font-bold text-stone-900">Como revogar</h2><p className="mt-1 text-sm leading-relaxed text-stone-600">Remova ou desative o conector no host. Se você também criou uma chave de API para integração manual, revogue-a na área de chaves; a revogação interrompe novas autenticações dessa chave.</p></div></div><a href="/conta/chaves" className="btn-secondary inline-flex items-center gap-2">Gerenciar chaves de API <ExternalLink className="h-4 w-4" aria-hidden="true" /></a></section>

    <footer className="flex flex-wrap items-center gap-2 text-xs text-stone-500"><CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /><span>Depois da configuração, volte a <a className="font-semibold text-cognac-800 underline" href="/conectar">Conectar IA</a> e execute o teste gratuito de disponibilidade.</span></footer>
  </main></div>;
};
