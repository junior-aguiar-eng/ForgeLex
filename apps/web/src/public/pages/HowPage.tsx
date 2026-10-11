import { PageIntro, Movements, Safeguards } from './PublicSections';

export function HowPage() {
  return (
    <>
      <PageIntro
        eyebrow="Como funciona"
        title="Conecte, pesquise e confira a fonte."
        text="Crie seu acesso, autorize um host compatível e pesquise decisões do STJ. Abra as autoridades e confira sua proveniência antes do uso."
      />
      <Movements />
      <Safeguards />
    </>
  );
}
