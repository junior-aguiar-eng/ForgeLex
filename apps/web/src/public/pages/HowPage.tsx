import { PageIntro, Movements, Safeguards } from './PublicSections';

export function HowPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Como funciona"
        title={model ? 'Da conta à pesquisa com fonte, e da fonte à peça.' : 'Conecte, pesquise e confira a fonte.'}
        text={
          model
            ? 'Crie seu acesso, autorize o ChatGPT ou o Claude por MCP e pesquise decisões dos tribunais disponíveis. Abra a autoridade e confira a proveniência antes do uso; para elaborar e revisar a peça, use a Mesa de trabalho.'
            : 'Crie seu acesso, autorize um aplicativo compatível e pesquise decisões dos tribunais disponíveis. Abra as autoridades e confira sua proveniência antes do uso.'
        }
      />
      <Movements model={model} />
      <Safeguards />
    </>
  );
}
