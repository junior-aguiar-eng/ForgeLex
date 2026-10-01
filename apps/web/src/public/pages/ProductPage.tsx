import { PageIntro, Capabilities, Movements } from './PublicSections';

export function ProductPage() {
  return (
    <>
      <PageIntro
        eyebrow="Produto"
        title="Um espaço para reunir o caso, as fontes e a minuta."
        text="Organize documentos, fatos, provas e questões. Pesquise jurisprudência do STJ, confira autoridades e prepare rascunhos com revisão humana."
      />
      <Capabilities />
      <Movements />
    </>
  );
}
