import { PageIntro, WaysToUse, Safeguards } from './PublicSections';

export function IntegrationsPage({ model = false }: { model?: boolean }) {
  return (
    <>
      <PageIntro
        eyebrow="Integrações"
        title={
          model
            ? 'Conecte o ForgeLex à sua IA, à Mesa e ao seu software.'
            : 'Conecte pesquisa jurídica à sua IA ou ao seu software.'
        }
        text={
          model
            ? 'Por MCP, o ChatGPT ou o Claude pesquisa com as ferramentas do ForgeLex, conforme a disponibilidade no aplicativo conectado e na sua conta. A Mesa de trabalho funciona no próprio site e a API REST integra o seu software.'
            : 'MCP permite pesquisar decisões pelo ChatGPT ou Claude, conforme a disponibilidade no aplicativo conectado. A API REST oferece integração ao seu software.'
        }
      />
      <WaysToUse model={model} />
      <Safeguards />
    </>
  );
}
