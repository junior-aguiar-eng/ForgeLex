import type { AppTab } from './routes';

/**
 * Navegação da casca do tema gelo (V2, tabela 7.2): a lateral tem Mesa, Casos e Jurisprudência no alto, os recursos no
 * meio e a conta no rodapé. É um modelo puro; a lateral escolhe o componente de cada ícone.
 */

export type NavIcon =
  | 'desk'
  | 'cases'
  | 'research'
  | 'overview'
  | 'progress'
  | 'connections'
  | 'guide'
  | 'api'
  | 'billing'
  | 'activity'
  | 'security'
  | 'keys';

export interface NavItem {
  tab: AppTab;
  label: string;
  icon: NavIcon;
}

export interface IceNavigation {
  work: NavItem[];
  resources: NavItem[];
  account: NavItem[];
}

export function iceNavigation(flags: { deskEnabled: boolean; casesEnabled: boolean }): IceNavigation {
  return {
    work: [
      ...(flags.deskEnabled ? [{ tab: 'work' as const, label: 'Mesa', icon: 'desk' as const }] : []),
      ...(flags.casesEnabled ? [{ tab: 'matter' as const, label: 'Casos', icon: 'cases' as const }] : []),
      { tab: 'research', label: 'Jurisprudência', icon: 'research' },
    ],
    resources: [
      { tab: 'landing', label: 'Visão geral', icon: 'overview' },
      { tab: 'datajud', label: 'Andamento processual', icon: 'progress' },
      { tab: 'connections', label: 'Conectar IA', icon: 'connections' },
      { tab: 'for_lawyers_guide', label: 'Guia de conexão', icon: 'guide' },
      { tab: 'api_docs', label: 'API para desenvolvedores', icon: 'api' },
    ],
    account: [
      { tab: 'credits', label: 'Conta e faturamento', icon: 'billing' },
      { tab: 'account_activity', label: 'Atividade da conta', icon: 'activity' },
      { tab: 'account_security', label: 'Segurança da conta', icon: 'security' },
      { tab: 'api_keys', label: 'Chaves de API', icon: 'keys' },
    ],
  };
}

/** Rascunhos e Revisão são a Mesa: os links antigos abrem a Mesa e acendem o item dela. */
export function highlightedTab(tab: AppTab): AppTab {
  return tab === 'draft_studio' || tab === 'dashboard' ? 'work' : tab;
}
