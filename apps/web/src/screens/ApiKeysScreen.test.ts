import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiKeysScreen } from './ApiKeysScreen';

describe('gestão de chaves de API', () => {
  it('oferece perfis de integração e não exibe segredo antes da criação', () => {
    const markup = renderToStaticMarkup(React.createElement(ApiKeysScreen));

    expect(markup).toContain('Chaves de API');
    expect(markup).toContain('MCP de pesquisa');
    expect(markup).toContain('API de pesquisa');
    expect(markup).not.toContain('flx_live_');
    expect(markup).not.toContain('billing:admin');
  });
});
