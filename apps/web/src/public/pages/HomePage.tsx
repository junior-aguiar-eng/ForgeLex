import {
  Hero,
  MesaSection,
  CrossCuttingSection,
  Problems,
  Movements,
  Capabilities,
  WaysToUse,
  CreditsInfo,
  Safeguards,
  FAQ,
} from './PublicSections';

/** Modelo novo (27/11): a Mesa no centro; jurisprudência e sua IA como temas transversais. Sem o modelo, o site atual. */
export function HomePage({ model = false }: { model?: boolean }) {
  if (model)
    return (
      <>
        <Hero model />
        <MesaSection />
        <CrossCuttingSection />
        <CreditsInfo model />
        <Safeguards />
        <FAQ model />
      </>
    );
  return (
    <>
      <Hero />
      <Problems />
      <Movements />
      <Capabilities />
      <WaysToUse />
      <CreditsInfo />
      <Safeguards />
      <FAQ />
    </>
  );
}
