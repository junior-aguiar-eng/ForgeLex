import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ForLawyersGuideScreen, formatSearchCost } from './ForLawyersGuideScreen';

describe('guia de conexão para advogados', () => {
  it('organiza o primeiro uso sem copiar documentação técnica', () => {
    const markup = renderToStaticMarkup(React.createElement(ForLawyersGuideScreen));

    expect(markup).toContain('Habilite o modo de desenvolvedor');
    expect(markup).toContain('OAuth · sua conta ForgeLex');
    expect(markup).toContain('Confirme o funcionamento');
    expect(markup).toContain('Se a conexão falhar');
    expect(markup).toContain('Como revogar');
    expect(markup).toContain('ChatGPT');
    expect(markup).toContain('Claude');
    expect(markup).toContain('A pesquisa consome créditos');
    expect(markup).not.toContain('curl');
    expect(markup).not.toContain('JSON-RPC');
  });

  it('mostra o custo somente quando a conta autenticada o informa', () => {
    expect(formatSearchCost(null)).toContain('conta');
    expect(formatSearchCost(20).replace(/\s/g, ' ')).toBe('R$ 0,20 por pesquisa jurisprudencial');
  });
});
