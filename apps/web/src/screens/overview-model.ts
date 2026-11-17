import type { AppTab } from '../navigation/routes';

/**
 * Modelo da Visão no tema gelo (V2, protótipo de 09/11): primeiros passos com estado real, casos abertos, conexões e
 * consumo do mês. Funções puras sobre os dados que a conta já devolve; a tela só desenha.
 */

export interface UsageTransaction {
  type: string;
  amountCents: number;
  date: string;
  capability: string | null;
}

/** Consumo do mês corrente: débitos de operação (com capacidade) e quantas foram. Créditos e reembolsos não entram. */
export function monthlyUsage(transactions: UsageTransaction[], now: Date): { totalCents: number; count: number } {
  let totalCents = 0;
  let count = 0;
  for (const item of transactions) {
    if (item.type !== 'DEBIT' || item.capability === null) continue;
    const when = new Date(item.date);
    if (when.getFullYear() !== now.getFullYear() || when.getMonth() !== now.getMonth()) continue;
    totalCents += item.amountCents;
    count++;
  }
  return { totalCents, count };
}

export interface OverviewStep {
  id: 'connect' | 'matter' | 'verify';
  title: string;
  description: string;
  action: string;
  tab: AppTab;
  done: boolean;
}

export function overviewSteps(input: {
  connected: boolean | undefined;
  matterCount: number | undefined;
  verified: boolean;
  casesEnabled: boolean;
}): OverviewStep[] {
  return [
    {
      id: 'connect',
      title: 'Conectar sua IA',
      description: 'ChatGPT ou Claude usando suas ferramentas.',
      action: 'Conectar IA',
      tab: 'connections',
      done: input.connected === true,
    },
    ...(input.casesEnabled
      ? [
          {
            id: 'matter' as const,
            title: 'Criar o primeiro caso',
            description: 'Base de fatos e provas aprovada por você.',
            action: 'Criar um caso',
            tab: 'matter' as const,
            done: (input.matterCount ?? 0) > 0,
          },
        ]
      : []),
    {
      id: 'verify',
      title: 'Verificar uma citação',
      description: 'Pesquise no STJ e confira a decisão na fonte. É gratuito.',
      action: 'Abrir a jurisprudência',
      tab: 'research',
      done: input.verified,
    },
  ];
}

export const stepsProgress = (steps: OverviewStep[]) => ({
  done: steps.filter((step) => step.done).length,
  total: steps.length,
});

export const pendingStep = (steps: OverviewStep[]) => steps.find((step) => !step.done);

export interface MatterSummary {
  id: string;
  title: string;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  updatedAt: string;
  practiceArea?: string;
}

/** Casos abertos, do mais recente ao mais antigo. */
export function activeMatters<T extends MatterSummary>(matters: T[], limit = 3): T[] {
  return matters
    .filter((matter) => matter.status === 'OPEN')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

export function matterStatusLabel(status: MatterSummary['status']): string {
  return status === 'OPEN' ? 'aberto' : status === 'CLOSED' ? 'encerrado' : 'arquivado';
}

export function overviewSubtitle(input: { casesEnabled: boolean; openCount: number | undefined }): string {
  const fallback = 'Seu trabalho, num só lugar.';
  if (!input.casesEnabled || input.openCount === undefined) return fallback;
  if (input.openCount === 0) return 'Nenhum caso aberto ainda.';
  return input.openCount === 1 ? '1 caso aberto.' : `${input.openCount} casos abertos.`;
}

export interface ConnectionRow {
  label: string;
  state: 'ok' | 'off' | 'unknown';
  text: string;
}

export function connectionRows(input: {
  mcp: { authenticatedCredential: boolean; lastMcpUseAt: string | null } | undefined;
  activeKeys: number | undefined;
}): ConnectionRow[] {
  const mcp: ConnectionRow = !input.mcp
    ? { label: 'MCP remoto', state: 'unknown', text: 'indisponível' }
    : input.mcp.authenticatedCredential || input.mcp.lastMcpUseAt !== null
      ? { label: 'MCP remoto', state: 'ok', text: 'autenticado' }
      : { label: 'MCP remoto', state: 'off', text: 'não conectado' };
  const keys: ConnectionRow =
    input.activeKeys === undefined
      ? { label: 'Chaves de API', state: 'unknown', text: 'indisponível' }
      : input.activeKeys === 0
        ? { label: 'Chaves de API', state: 'off', text: 'nenhuma ativa' }
        : {
            label: 'Chaves de API',
            state: 'ok',
            text: input.activeKeys === 1 ? '1 ativa' : `${input.activeKeys} ativas`,
          };
  return [mcp, keys];
}
