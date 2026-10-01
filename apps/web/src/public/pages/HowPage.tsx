import { PageIntro, Movements, Safeguards } from './PublicSections';

export function HowPage() {
  return (
    <>
      <PageIntro
        eyebrow="Como funciona"
        title="Cada etapa conserva o contexto da anterior."
        text="O ForgeLex relaciona o material do caso à pesquisa e aos rascunhos, permitindo conferir a origem de informações antes de usar o resultado."
      />
      <Movements />
      <Safeguards />
    </>
  );
}
