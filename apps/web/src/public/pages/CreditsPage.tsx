import { PageIntro, CreditsInfo } from './PublicSections';

export function CreditsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Créditos"
        title="Pague pelas operações jurídicas que utilizar."
        text="Os créditos são pré-pagos em reais, sem mensalidade ForgeLex. A pesquisa jurisprudencial válida do STJ é a operação faturável no contrato atual."
      />
      <CreditsInfo />
    </>
  );
}
