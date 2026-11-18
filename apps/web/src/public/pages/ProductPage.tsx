import { PageIntro, Capabilities, MesaSection, Movements, Safeguards } from './PublicSections';

export function ProductPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Produto"
        title={
          model
            ? 'Mesa de trabalho e pesquisa com fonte, no site e na sua IA.'
            : 'Jurisprudência dos tribunais superiores e consulta processual.'
        }
        text={
          model
            ? 'A Mesa de trabalho orienta, elabora e revisa peças com as fontes à vista, e a pesquisa de jurisprudência com estado de verificação pode ser feita no site ou no ChatGPT e no Claude por MCP. Você paga só pelo uso; API e consulta processual gratuita também estão disponíveis.'
            : 'Conecte ferramentas de pesquisa ao ChatGPT ou Claude, confira autoridades e gerencie seus créditos. API e consulta processual gratuita também estão disponíveis.'
        }
      />
      {model && <MesaSection />}
      <Capabilities model={model} />
      <Movements model={model} />
      {model && <Safeguards />}
    </>
  );
}
