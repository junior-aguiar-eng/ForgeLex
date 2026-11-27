import type { AppTab } from './routes';

/**
 * Navegação da casca do tema gelo (V2, protótipo de 09/11): a lateral tem o grupo Trabalho (Mesa, Casos e
 * Jurisprudência) e o grupo Conta e recursos (Visão geral, Andamento processual, Conectar IA e Conta). Atividade,
 * Segurança e Chaves de API são seções da Conta; o guia e a API são parte de Conectar IA. É um modelo puro; a lateral
 * escolhe o componente de cada ícone, que só aparece no trilho recolhido.
 */

export type NavIcon = 'desk' | 'cases' | 'research' | 'overview' | 'progress' | 'connections' | 'billing';

export interface NavItem {
  tab: AppTab;
  label: string;
  icon: NavIcon;
}

export interface IceNavigation {
  work: NavItem[];
  resources: NavItem[];
}

export interface AccountSection {
  tab: AppTab;
  label: string;
}

export function iceNavigation(flags: { deskEnabled: boolean; casesEnabled: boolean }): IceNavigation {
  // Regra do mínimo (AGENTS.md, 26/11): com a Mesa, ela é tudo; fora dela, só Conectar IA e Conta.
  if (flags.deskEnabled)
    return {
      work: [],
      resources: [
        { tab: 'connections', label: 'Conectar IA', icon: 'connections' },
        { tab: 'credits', label: 'Conta', icon: 'billing' },
      ],
    };
  return {
    work: [
      ...(flags.deskEnabled ? [{ tab: 'work' as const, label: 'Mesa', icon: 'desk' as const }] : []),
      // Com a Mesa, os casos vivem nela e "Dados do caso" abre a partir de um caso; sem a Mesa, a tela Casos é o lugar.
      ...(flags.casesEnabled && !flags.deskEnabled
        ? [{ tab: 'matter' as const, label: 'Casos', icon: 'cases' as const }]
        : []),
      { tab: 'research', label: 'Jurisprudência', icon: 'research' },
    ],
    resources: [
      { tab: 'landing', label: 'Visão geral', icon: 'overview' },
      { tab: 'datajud', label: 'Andamento processual', icon: 'progress' },
      { tab: 'connections', label: 'Conectar IA', icon: 'connections' },
      { tab: 'credits', label: 'Conta', icon: 'billing' },
    ],
  };
}

/** Seções da Conta, na barra que as telas da conta mostram no alto (protótipo: Faturamento, Atividade, Segurança...). */
export function accountSections(): AccountSection[] {
  return [
    { tab: 'credits', label: 'Faturamento' },
    { tab: 'account_activity', label: 'Atividade' },
    { tab: 'account_security', label: 'Segurança' },
    { tab: 'api_keys', label: 'Chaves de API' },
  ];
}

/** Seções de Conectar IA: a conexão, o guia e a API para desenvolvedores. */
export function connectSections(): AccountSection[] {
  return [
    { tab: 'connections', label: 'Conexão' },
    { tab: 'for_lawyers_guide', label: 'Guia de conexão' },
    { tab: 'api_docs', label: 'API para desenvolvedores' },
  ];
}

/**
 * O item aceso da lateral. Rascunhos, Revisão e Dados do caso são a Mesa; as seções da conta acendem Conta; o guia e a
 * API acendem Conectar IA.
 */
export function highlightedTab(tab: AppTab, deskEnabled = true): AppTab {
  if (tab === 'draft_studio' || tab === 'dashboard') return 'work';
  if (tab === 'matter' && deskEnabled) return 'work';
  if (tab === 'account_activity' || tab === 'account_security' || tab === 'api_keys') return 'credits';
  if (tab === 'for_lawyers_guide' || tab === 'api_docs') return 'connections';
  return tab;
}
