import { describe, expect, it } from 'vitest';
import { connectionStateLabel, createPlatformConnection, deriveMcpConnectionSignals, isLocalMcpUrl, isVerifiedConnection, type ConnectionState } from './connection-model';

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

  it.each([
    ['http://127.0.0.1:3001/mcp', true],
    ['http://127.1:3001/mcp', true],
    ['http://localhost:3001/mcp', true],
    ['http://[::1]:3001/mcp', true],
    ['http://192.168.1.10:3001/mcp', true],
    ['http://10.0.0.3:3001/mcp', true],
    ['http://172.20.0.3:3001/mcp', true],
    ['http://169.254.1.3:3001/mcp', true],
    ['http://forgelex.local:3001/mcp', true],
    ['http://[fc00::1]:3001/mcp', true],
    ['http://[fe80::1]:3001/mcp', true],
    ['not-a-url', true],
    ['https://mcp.forgelex.example/mcp', false],
  ])('identifica se %s é apenas uma URL local', (url, expected) => {
    expect(isLocalMcpUrl(url)).toBe(expected);
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
