import { PageIntro, CreditsInfo } from './PublicSections';

export function CreditsPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Créditos"
        title={model ? 'Você paga só pelo uso.' : 'Pague pelas operações jurídicas que utilizar.'}
        text={
          model
            ? 'Os créditos são pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida é faturável; abrir e verificar uma autoridade não têm cobrança própria. O aplicativo de IA conectado tem custos próprios.'
            : 'Os créditos são pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida é a operação faturável no contrato atual.'
        }
      />
      <CreditsInfo />
    </>
  );
}
