import { Hero, Problems, Movements, Capabilities, WaysToUse, CreditsInfo, Safeguards, FAQ } from './PublicSections';

export function HomePage({ model = false }: { model?: boolean }) {
  return (
    <>
      <Hero model={model} />
      <Problems />
      <Movements model={model} />
      <Capabilities model={model} />
      <WaysToUse model={model} />
      <CreditsInfo />
      <Safeguards />
      <FAQ model={model} />
    </>
  );
}
