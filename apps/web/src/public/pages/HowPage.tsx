import { PageIntro, Movements, Safeguards } from './PublicSections';

export function HowPage() {
  return (
    <>
      <PageIntro
        eyebrow="Como funciona"
        title="Conecte, pesquise e confira a fonte."
        text="Crie seu acesso, autorize um aplicativo compatível e pesquise decisões dos tribunais disponíveis. Abra as autoridades e confira sua proveniência antes do uso."
      />
      <Movements />
      <Safeguards />
    </>
  );
}
