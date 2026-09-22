import { resolveApiOrigin } from '../../api-client';

export type HostPlatform = 'chatgpt' | 'claude';
export type ConnectionState = 'not_configured' | 'ready' | 'authorization_started' | 'verified' | 'revoked' | 'expired' | 'unavailable';

export interface PlatformConnection {
  platform: HostPlatform;
  state: ConnectionState;
  mcpUrl: string;
  lastVerifiedAt: string | null;
  requirements: string[];
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

export function resolveMcpUrl(input: { configured?: string; apiOrigin?: string } = {}): string {
  const configured = input.configured ?? import.meta.env.VITE_FORGELEX_MCP_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');
  return `${(input.apiOrigin ?? resolveApiOrigin()).replace(/\/$/, '')}/mcp`;
}

export function createPlatformConnection(platform: HostPlatform, mcpUrl = resolveMcpUrl()): PlatformConnection {
  return { platform, state: 'not_configured', mcpUrl, lastVerifiedAt: null, requirements: requirementsByPlatform[platform] };
}
