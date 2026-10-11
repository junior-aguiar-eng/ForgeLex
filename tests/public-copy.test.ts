import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rejectedHeadline = 'A inteligência jurídica que pensa antes de peticionar.';
const publicSurfaces = [
  // README describes the preserved platform; the site offers the frozen scope.
  ['README.md', 'Do caso à minuta, conecte fatos, provas e jurisprudência.'],
  ['apps/web/index.html', 'ForgeLex · Pesquisa do STJ por MCP'],
  ['apps/web/src/public/pages/PublicSections.tsx', 'Jurisprudência do STJ no seu fluxo com IA.'],
  ['apps/web/src/screens/LandingScreen.tsx', 'Jurisprudência do STJ no seu fluxo com IA.'],
];

describe('public headline', () => {
  it.each(publicSurfaces)('%s uses the approved presentation', (path, approvedHeadline) => {
    const content = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(content).toContain(approvedHeadline);
    expect(content).not.toContain(rejectedHeadline);
  });
});
