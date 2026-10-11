import { PageIntro, WaysToUse, Safeguards } from './PublicSections';

export function IntegrationsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Integrações"
        title="Conecte pesquisa jurídica à sua IA ou ao seu software."
        text="MCP permite pesquisar decisões pelo ChatGPT ou Claude, conforme a disponibilidade no host. A API REST oferece integração ao seu software."
      />
      <WaysToUse />
      <Safeguards />
    </>
  );
}
