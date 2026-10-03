import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    status: 'signed_out',
    passwordRecovery: window.location.hash.includes('type=recovery'),
    passwordRecoveryError: window.location.hash.includes('otp_expired'),
  }),
}));

import { App } from './App';

function renderRoute(pathname: string, hash = ''): string {
  vi.stubGlobal('window', {
    location: { pathname, search: '', hash },
    localStorage: { getItem: () => null },
  });
  return renderToStaticMarkup(React.createElement(App));
}

afterEach(() => vi.unstubAllGlobals());

describe('entrada pública de autenticação', () => {
  it('consulta TJAL abre sem provedor de autenticação ou saldo', () => {
    const html = renderRoute('/consulta-processual');
    expect(html).toContain('Consulta processual');
    expect(html).toContain('Tribunal');
    expect(html).toContain('TJAL — Alagoas');
    expect(html).toContain('Número do processo');
    expect(html).not.toContain('Entre no ForgeLex');
  });
  it('mostra nova senha ao receber callback de recuperação na raiz', () => {
    const html = renderRoute('/', '#type=recovery&access_token=synthetic');
    expect(html).toContain('Escolha uma nova senha');
    expect(html).toContain('Salvar nova senha');
    expect(html).not.toContain('Entre no ForgeLex');
  });

  it('mostra link expirado quando o callback retorna erro', () => {
    const html = renderRoute('/', '#error=access_denied&error_code=otp_expired');
    expect(html).toContain('O link expirou');
    expect(html).not.toContain('Entre no ForgeLex');
  });

  it('preserva os formulários comuns de login e cadastro', () => {
    expect(renderRoute('/entrar')).toContain('Entre no ForgeLex');
    expect(renderRoute('/cadastro')).toContain('Crie seu acesso');
  });
});
