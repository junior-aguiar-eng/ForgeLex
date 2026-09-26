import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const approvedHeadline = 'Do caso à minuta, conecte fatos, provas e jurisprudência.';
const rejectedHeadline = 'A inteligência jurídica que pensa antes de peticionar.';
const publicSurfaces = ['README.md', 'apps/web/index.html', 'apps/web/src/public/PublicSite.tsx'];

describe('public headline', () => {
  it.each(publicSurfaces)('%s uses the approved headline', (path) => {
    const content = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(content).toContain(approvedHeadline);
    expect(content).not.toContain(rejectedHeadline);
  });
});
