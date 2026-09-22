import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ForLawyersGuideScreen, formatSearchCost } from './ForLawyersGuideScreen';

describe('guia de conexão para advogados', () => {
  it('organiza o primeiro uso sem copiar documentação técnica', () => {
    const markup = renderToStaticMarkup(React.createElement(ForLawyersGuideScreen));

    expect(markup).toContain('O que é');
    expect(markup).toContain('Como conectar');
    expect(markup).toContain('Como perguntar');
    expect(markup).toContain('Quanto custa');
    expect(markup).toContain('Privacidade');
    expect(markup).toContain('Como revogar');
    expect(markup).toContain('ChatGPT');
    expect(markup).toContain('Claude');
    expect(markup).toContain('Última revisão: 22 de setembro de 2026');
    expect(markup).toContain('pesquisar → abrir autoridade → verificar');
    expect(markup).not.toContain('curl');
    expect(markup).not.toContain('JSON-RPC');
  });

  it('mostra o custo somente quando a conta autenticada o informa', () => {
    expect(formatSearchCost(null)).toContain('conta');
    expect(formatSearchCost(20).replace(/\s/g, ' ')).toBe('R$ 0,20 por pesquisa jurisprudencial');
  });
});
