import { PageIntro, WaysToUse, Safeguards } from './PublicSections';

export function IntegrationsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Integrações"
        title="Trabalhe no ForgeLex ou conecte suas ferramentas."
        text="O espaço de trabalho é o caminho direto. MCP e API REST são alternativas para usar as operações jurídicas em outros ambientes."
      />
      <WaysToUse />
      <Safeguards />
    </>
  );
}
