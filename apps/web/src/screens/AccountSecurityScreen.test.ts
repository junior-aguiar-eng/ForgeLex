import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountSecurityView } from './AccountSecurityScreen';

describe('segurança da conta', () => {
  it('oferece recuperação de senha e saída sem publicar encerramento destrutivo', () => {
    const markup = renderToStaticMarkup(React.createElement(AccountSecurityView, {
      email: 'pessoa@exemplo.com',
      busy: null,
      message: null,
      onRequestPasswordChange: vi.fn(),
      onSignOut: vi.fn(),
    }));

    expect(markup).toContain('Segurança da conta');
    expect(markup).toContain('pessoa@exemplo.com');
    expect(markup).toContain('Enviar link para alterar senha');
    expect(markup).toContain('Encerrar esta sessão');
    expect(markup).toContain('Encerramento ainda indisponível');
    expect(markup).toContain('política de retenção');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('/api/v2/account/close');
  });
});
