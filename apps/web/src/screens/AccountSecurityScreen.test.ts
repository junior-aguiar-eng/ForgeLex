import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountSecurityView, submitAccountClosure } from './AccountSecurityScreen';

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

  it('mostra efeitos, prazos e habilita pedido só após confirmações explícitas', () => {
    const base = {
      email: 'pessoa@exemplo.com', busy: null, message: null,
      onRequestPasswordChange: vi.fn(), onSignOut: vi.fn(),
      closure: { policy: { enabled: true, version: '2026-09-22.v1' as const, confirmation: 'ENCERRAR MINHA CONTA' as const, reauthenticationMaxAgeSeconds: 300, deadlines: { identityHours: 24, privateContentDays: 7, backupDays: 35 }, consequences: ['Acesso bloqueado imediatamente.'], retention: [{ category: 'financial_records', disposition: 'minimize_and_retain', deadline: 'provisional_5y' }], personalTenantOnly: true as const }, loading: false, stage: 'explanation' as const, personalConfirmed: false, password: '', confirmation: '' },
      onPersonalConfirmedChange: vi.fn(), onClosurePasswordChange: vi.fn(), onClosureConfirmationChange: vi.fn(), onContinueClosure: vi.fn(), onConfirmClosurePassword: vi.fn(), onRequestClosure: vi.fn(),
    };
    const initial = renderToStaticMarkup(React.createElement(AccountSecurityView, base));
    expect(initial).toContain('24 horas');
    expect(initial).toContain('7 dias');
    expect(initial).toContain('35 dias');
    expect(initial).toContain('tenant pessoal');
    expect(initial).toContain('disabled=""');
    expect(initial).not.toContain('Confirme sua senha atual');
    const passwordStep = renderToStaticMarkup(React.createElement(AccountSecurityView, { ...base, closure: { ...base.closure, stage: 'password', personalConfirmed: true, password: 'senha' } }));
    expect(passwordStep).toContain('Confirmar senha');
    expect(passwordStep).not.toContain('Digite exatamente ENCERRAR MINHA CONTA');
    const confirmationStep = renderToStaticMarkup(React.createElement(AccountSecurityView, { ...base, closure: { ...base.closure, stage: 'confirmation', personalConfirmed: true } }));
    expect(confirmationStep).toContain('Digite exatamente ENCERRAR MINHA CONTA');
    expect(confirmationStep).toContain('disabled=""');
    const ready = renderToStaticMarkup(React.createElement(AccountSecurityView, { ...base, closure: { ...base.closure, stage: 'confirmation', personalConfirmed: true, confirmation: 'ENCERRAR MINHA CONTA' } }));
    expect(ready).toContain('Solicitar encerramento');
    expect(ready).not.toMatch(/disabled=""[^>]*>[^<]*Solicitar encerramento/);
  });

  it('não envia pedido com política desligada, frase errada ou reautenticação falha', async () => {
    const request = vi.fn();
    const deps = { request, save: vi.fn(), ensureStorage: vi.fn(), signOut: vi.fn(), navigate: vi.fn() };
    const input = { enabled: true, personalConfirmed: true, confirmation: 'ENCERRAR MINHA CONTA', accessToken: 'fresh-jwt' };
    await expect(submitAccountClosure({ ...input, enabled: false }, deps)).rejects.toThrow();
    await expect(submitAccountClosure({ ...input, confirmation: 'encerrar minha conta' }, deps)).rejects.toThrow();
    await expect(submitAccountClosure({ ...input, accessToken: '' }, deps)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    deps.ensureStorage.mockImplementationOnce(() => { throw new Error('Sem armazenamento'); });
    await expect(submitAccountClosure(input, deps)).rejects.toThrow('Sem armazenamento');
    expect(request).not.toHaveBeenCalled();
  });

  it('salva recibo de 202 e sai localmente antes de navegar', async () => {
    const order: string[] = [];
    const accepted = { closureId: 'closure-1', statusToken: 'flx_close_secret', status: 'ACCESS_BLOCKED' as const, requestedAt: '2026-09-22T00:00:00Z', policyVersion: '2026-09-22.v1' as const };
    await submitAccountClosure({ enabled: true, personalConfirmed: true, confirmation: 'ENCERRAR MINHA CONTA', accessToken: 'fresh-jwt' }, {
      request: async (_input, token, key) => { expect(token).toBe('fresh-jwt'); expect(key).toBeTruthy(); order.push('request'); return accepted; },
      save: (receipt) => { expect(receipt.statusToken).toBe(accepted.statusToken); order.push('save'); },
      ensureStorage: () => { order.push('storage'); },
      signOut: async () => { order.push('signOut'); },
      navigate: () => { order.push('navigate'); },
    });
    expect(order).toEqual(['storage', 'request', 'save', 'signOut', 'navigate']);
  });
});
