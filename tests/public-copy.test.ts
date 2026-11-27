import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rejectedHeadline = 'A inteligência jurídica que pensa antes de peticionar.';
const publicSurfaces = [
  // README e o site no modelo novo (V5A) levam o título escolhido por Boni em 17/11/2026.
  ['README.md', 'Peças jurídicas prontas para revisar, com a jurisprudência na fonte.'],
  ['apps/web/index.html', 'ForgeLex · Jurisprudência e consulta processual'],
  ['apps/web/src/public/pages/PublicSections.tsx', 'Jurisprudência dos tribunais superiores e consulta processual.'],
  ['apps/web/src/screens/LandingScreen.tsx', 'Jurisprudência dos tribunais superiores e consulta processual.'],
  // V5A: o título do modelo novo, escolhido por Boni em 17/11/2026, mora em um só módulo, atrás de VITE_FORGELEX_PUBLIC_MODEL.
  ['apps/web/src/config/public-model-copy.ts', 'Peças jurídicas prontas para revisar, com a jurisprudência na fonte.'],
  ['apps/web/src/screens/LandingScreen.tsx', 'MODEL_TITLE'],
];

describe('public headline', () => {
  it.each(publicSurfaces)('%s uses the approved presentation', (path, approvedHeadline) => {
    const content = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(content).toContain(approvedHeadline);
    expect(content).not.toContain(rejectedHeadline);
  });
});
