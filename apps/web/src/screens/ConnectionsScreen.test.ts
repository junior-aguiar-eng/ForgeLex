import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConnectionsScreen } from './ConnectionsScreen';

describe('central de conexão', () => {
  it('orienta o advogado sem afirmar uma conexão que ainda não foi verificada', () => {
    const markup = renderToStaticMarkup(React.createElement(ConnectionsScreen));

    expect(markup).toContain('Conectar o ForgeLex ao ChatGPT ou Claude');
    expect(markup).toContain('ChatGPT');
    expect(markup).toContain('Claude');
    expect(markup).toContain('Não configurado');
    expect(markup).toContain('A assinatura do host não paga operações ForgeLex');
    expect(markup).toContain('Pesquisar jurisprudência do STJ');
    expect(markup).toContain('Abrir uma autoridade');
    expect(markup).toContain('Verificar proveniência');
    expect(markup).not.toContain('>Conectado<');
  });
});
