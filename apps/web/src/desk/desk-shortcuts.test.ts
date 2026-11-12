import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeskShortcuts, reviewTextRequest } from './DeskShortcuts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('atalhos do estado vazio da Mesa', () => {
  it('mostram só o que a Mesa já faz, sem lista de habilidades', () => {
    const html = renderToStaticMarkup(
      React.createElement(DeskShortcuts, { onNewPiece: () => {}, onReviewText: () => {}, onResearch: () => {} }),
    );
    for (const label of ['Nova peça', 'Revisar um texto', 'Pesquisar jurisprudência']) expect(html).toContain(label);
    expect(html).toContain('aria-label="Atalhos"');
    expect(reviewTextRequest).toBe('Preciso revisar este texto: ');
  });

  it('a nova casca fica desligada por padrão e só liga com true exato', async () => {
    for (const [value, expected] of [
      [undefined, false],
      ['', false],
      ['false', false],
      ['TRUE', false],
      ['true', true],
    ] as const) {
      vi.resetModules();
      if (value === undefined) vi.stubEnv('VITE_FORGELEX_DESK_SHELL', '');
      else vi.stubEnv('VITE_FORGELEX_DESK_SHELL', value);
      const { DESK_SHELL_ENABLED } = await import('../config/site-capabilities');
      expect(DESK_SHELL_ENABLED).toBe(expected);
    }
  });
});
