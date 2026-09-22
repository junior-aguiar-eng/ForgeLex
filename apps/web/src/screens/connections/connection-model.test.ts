import { describe, expect, it } from 'vitest';
import { connectionStateLabel, createPlatformConnection, deriveMcpConnectionSignals, isVerifiedConnection, type ConnectionState } from './connection-model';

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

  it('separa serviço, credencial e uso confirmado sem chamar nenhum sinal de ativo', () => {
    const signals = deriveMcpConnectionSignals({
      serviceAvailable: true,
      mcpUrl: 'https://mcp.forgelex.ai',
      authenticatedCredential: true,
      scopes: ['mcp'],
      lastMcpUseAt: null,
      billableOperationExecuted: false,
    });

    expect(signals).toEqual([
      { id: 'service', label: 'Serviço disponível', detail: 'O ForgeLex respondeu ao teste gratuito.', tone: 'ready' },
      { id: 'credential', label: 'Credencial pronta', detail: 'A credencial possui o escopo MCP necessário.', tone: 'ready' },
      { id: 'use', label: 'Uso confirmado ainda não registrado', detail: 'O host ainda não retornou uma execução auditável.', tone: 'pending' },
    ]);
    expect(signals.map((signal) => signal.label).join(' ')).not.toContain('Ativo');
  });
});
