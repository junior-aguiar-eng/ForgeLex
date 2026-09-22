import { describe, expect, it } from 'vitest';
import { connectionStateLabel, createPlatformConnection, isVerifiedConnection, type ConnectionState } from './connection-model';

describe('modelo de conexão MCP', () => {
  it.each([
    ['not_configured', 'Não configurado'],
    ['ready', 'Instruções disponíveis'],
    ['authorization_started', 'Autorização iniciada'],
    ['verified', 'Conectado'],
    ['revoked', 'Credencial revogada'],
    ['expired', 'Credencial expirada'],
    ['unavailable', 'Indisponível'],
  ] satisfies Array<[ConnectionState, string]>)('descreve %s sem ambiguidade', (state, expectedLabel) => {
    expect(connectionStateLabel(state)).toBe(expectedLabel);
  });

  it('reserva Conectado para evidência de verificação', () => {
    expect(isVerifiedConnection('verified')).toBe(true);
    expect(isVerifiedConnection('authorization_started')).toBe(false);
    expect(connectionStateLabel('authorization_started')).not.toBe('Conectado');
  });

  it('cria uma conexão inicial sem prometer configuração do host', () => {
    expect(createPlatformConnection('chatgpt', 'https://nexojuris.ia.br/mcp')).toMatchObject({
      platform: 'chatgpt',
      state: 'not_configured',
      mcpUrl: 'https://nexojuris.ia.br/mcp',
      lastVerifiedAt: null,
    });
  });
});
