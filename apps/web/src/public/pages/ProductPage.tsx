import { PageIntro, Capabilities, Movements } from './PublicSections';

export function ProductPage() {
  return (
    <>
      <PageIntro
        eyebrow="Produto"
        title="Pesquisa do STJ para o seu fluxo com IA."
        text="Conecte ferramentas de pesquisa ao ChatGPT ou Claude, confira autoridades e gerencie seus créditos. API e consulta processual gratuita também estão disponíveis."
      />
      <Capabilities />
      <Movements />
    </>
  );
}
