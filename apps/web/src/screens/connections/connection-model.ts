import { resolveApiOrigin } from '../../api-client';
import type { McpConnectionStatusResponse } from '../../api-client';

export type HostPlatform = 'chatgpt' | 'claude';
export type ConnectionState = 'not_configured' | 'ready' | 'authorization_started' | 'verified' | 'revoked' | 'expired' | 'unavailable';

export interface PlatformConnection {
  platform: HostPlatform;
  state: ConnectionState;
  mcpUrl: string;
  lastVerifiedAt: string | null;
  requirements: string[];
}

export interface McpConnectionSignal {
  id: 'service' | 'credential' | 'use';
  label: string;
  detail: string;
  tone: 'ready' | 'pending' | 'unavailable';
}

const stateLabels: Record<ConnectionState, string> = {
  not_configured: 'Não configurado', ready: 'Instruções disponíveis', authorization_started: 'Autorização iniciada', verified: 'Conectado', revoked: 'Credencial revogada', expired: 'Credencial expirada', unavailable: 'Indisponível',
};

const requirementsByPlatform: Record<HostPlatform, string[]> = {
  chatgpt: ['Use o ChatGPT em um computador.', 'A disponibilidade de conectores ou MCP depende do plano e da versão do host.', 'Confirme no próprio host se a opção de adicionar ferramentas está disponível para sua conta.'],
  claude: ['Use o Claude em um computador.', 'A disponibilidade de conectores ou MCP depende do plano e da versão do host.', 'Confirme no próprio host se a opção de adicionar ferramentas está disponível para sua conta.'],
};

export function platformName(platform: HostPlatform): string { return platform === 'chatgpt' ? 'ChatGPT' : 'Claude'; }
export function connectionStateLabel(state: ConnectionState): string { return stateLabels[state]; }
export function isVerifiedConnection(state: ConnectionState): boolean { return state === 'verified'; }

export function isLocalMcpUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const private172 = /^172\.(\d{1,3})\./.exec(hostname);
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || hostname === '::1' || hostname === '0.0.0.0' || hostname.startsWith('127.')
      || hostname.startsWith('10.') || hostname.startsWith('192.168.')
      || hostname.startsWith('169.254.')
      || (private172 !== null && Number(private172[1]) >= 16 && Number(private172[1]) <= 31)
      || /^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/.test(hostname);
  } catch {
    return true;
  }
}

export function resolveMcpUrl(input: { configured?: string; apiOrigin?: string } = {}): string {
  const configured = input.configured ?? import.meta.env.VITE_FORGELEX_MCP_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');
  return `${(input.apiOrigin ?? resolveApiOrigin()).replace(/\/$/, '')}/mcp`;
}

export function createPlatformConnection(platform: HostPlatform, mcpUrl = resolveMcpUrl()): PlatformConnection {
  return { platform, state: 'not_configured', mcpUrl, lastVerifiedAt: null, requirements: requirementsByPlatform[platform] };
}

export function deriveMcpConnectionSignals(status: McpConnectionStatusResponse): McpConnectionSignal[] {
  return [
    status.serviceAvailable
      ? { id: 'service', label: 'Serviço disponível', detail: 'O ForgeLex respondeu ao teste gratuito.', tone: 'ready' }
      : { id: 'service', label: 'Serviço temporariamente indisponível', detail: 'Tente novamente em alguns instantes.', tone: 'unavailable' },
    status.authenticatedCredential && status.scopes.includes('mcp')
      ? { id: 'credential', label: 'Credencial pronta', detail: 'A credencial possui o escopo MCP necessário.', tone: 'ready' }
      : { id: 'credential', label: 'Credencial MCP indisponível', detail: 'Configure uma credencial com o escopo MCP.', tone: 'unavailable' },
    status.lastMcpUseAt
      ? { id: 'use', label: 'Uso confirmado', detail: `Último uso auditável: ${new Date(status.lastMcpUseAt).toLocaleString('pt-BR')}.`, tone: 'ready' }
      : { id: 'use', label: 'Uso confirmado ainda não registrado', detail: 'O host ainda não retornou uma execução auditável.', tone: 'pending' },
  ];
}

export function connectionStatusErrorMessage(code: string): string {
  if (code === 'INSUFFICIENT_SCOPE') return 'A credencial não possui o escopo MCP necessário.';
  if (code === 'CREDENTIAL_REVOKED' || code === 'UNAUTHENTICATED') return 'A credencial está ausente, expirada ou revogada.';
  return 'O ForgeLex está temporariamente indisponível. Tente novamente em alguns instantes.';
}
