import { PageIntro, Capabilities, Movements, Safeguards } from './PublicSections';

export function ProductPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Produto"
        title={
          model
            ? 'Pesquisa com fonte, conexão com a sua IA e Mesa de trabalho.'
            : 'Jurisprudência dos tribunais superiores e consulta processual.'
        }
        text={
          model
            ? 'O ForgeLex entrega jurisprudência com fonte e estado de verificação ao ChatGPT ou ao Claude por MCP, oferece a Mesa de trabalho para elaborar e revisar peças e cobra só pelo uso. API e consulta processual gratuita também estão disponíveis.'
            : 'Conecte ferramentas de pesquisa ao ChatGPT ou Claude, confira autoridades e gerencie seus créditos. API e consulta processual gratuita também estão disponíveis.'
        }
      />
      <Capabilities model={model} />
      <Movements model={model} />
      {model && <Safeguards />}
    </>
  );
}
