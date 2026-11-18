import { PageIntro, MesaMovements, Movements, Safeguards } from './PublicSections';

export function HowPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Como funciona"
        title={
          model
            ? 'Da pergunta à peça na Mesa, e da conta à pesquisa com fonte.'
            : 'Conecte, pesquise e confira a fonte.'
        }
        text={
          model
            ? 'Na Mesa de trabalho você descreve o que precisa, responde o que faltar e revisa a peça com as fontes à vista. Na sua IA, autorize o ChatGPT ou o Claude por MCP e pesquise decisões, abrindo a autoridade para conferir a proveniência antes do uso.'
            : 'Crie seu acesso, autorize um aplicativo compatível e pesquise decisões dos tribunais disponíveis. Abra as autoridades e confira sua proveniência antes do uso.'
        }
      />
      {model && <MesaMovements />}
      <Movements model={model} />
      <Safeguards />
    </>
  );
}
