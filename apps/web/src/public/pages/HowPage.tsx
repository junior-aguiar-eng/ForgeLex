import { PageIntro, MesaMovements, Movements, Safeguards } from './PublicSections';

export function HowPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Como funciona"
        title={model ? 'Da pergunta à peça.' : 'Conecte, pesquise e confira a fonte.'}
        text={
          model
            ? 'Na Mesa de trabalho você descreve o que precisa, anexa o que tiver e revisa a peça com as fontes à vista. Na sua IA, autorize o ChatGPT ou o Claude por MCP e pesquise decisões com a fonte, dentro da sua conversa.'
            : 'Crie seu acesso, autorize um aplicativo compatível e pesquise decisões dos tribunais disponíveis. Abra as autoridades e confira sua proveniência antes do uso.'
        }
      />
      {model && <MesaMovements />}
      {model ? <Movements model title="Na sua IA" /> : <Movements />}
      <Safeguards />
    </>
  );
}
