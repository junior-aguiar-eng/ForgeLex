import { PageIntro, CreditsInfo } from './PublicSections';

export function CreditsPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow={model ? 'Preços' : 'Créditos'}
        title={model ? 'Você paga só pelo uso.' : 'Pague pelas operações jurídicas que utilizar.'}
        text={
          model
            ? 'Créditos pré-pagos em reais, sem mensalidade ForgeLex. Cada trabalho na Mesa usa créditos e o custo máximo aparece antes de enviar; o que não for usado volta ao saldo. A pesquisa jurisprudencial válida é faturável; abrir e verificar uma autoridade não têm cobrança própria. A sua IA conectada tem custos próprios.'
            : 'Os créditos são pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida é a operação faturável no contrato atual.'
        }
      />
      <CreditsInfo model={model} />
    </>
  );
}
