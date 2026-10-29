export type AppTab = 'work' | 'landing' | 'research' | 'datajud' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'account_activity' | 'account_security' | 'account_closure_status' | 'api_keys' | 'for_lawyers_guide' | 'api_docs';

import { AGENTIC_WORKSPACE_ENABLED, CASE_WORKSPACE_ENABLED } from '../config/site-capabilities';

export function resolveVisibleTab(tab: AppTab, casesEnabled: boolean, workEnabled = AGENTIC_WORKSPACE_ENABLED): AppTab {
  if (tab === 'work' && !workEnabled) return 'landing';
  return !casesEnabled && (tab === 'matter' || tab === 'draft_studio' || tab === 'dashboard') ? 'connections' : tab;
}

export type AppRoute = {
  tab: AppTab;
  path: string;
  title: string;
};

const routes: readonly AppRoute[] = [
  { tab: 'work', path: '/app/trabalho', title: 'Trabalho' },
  { tab: 'landing', path: '/app', title: 'Visão geral' },
  { tab: 'research', path: '/app/pesquisa', title: 'Pesquisa' },
  { tab: 'datajud', path: '/app/consulta-processual', title: 'Consulta processual' },
  { tab: 'matter', path: '/app/casos', title: 'Casos' },
  { tab: 'draft_studio', path: '/app/rascunhos', title: 'Rascunhos' },
  { tab: 'dashboard', path: '/app/revisao', title: 'Revisão' },
  { tab: 'connections', path: '/app/conectar', title: 'Conectar IA' },
  { tab: 'credits', path: '/app/conta', title: 'Conta' },
  { tab: 'account_activity', path: '/app/conta/atividade', title: 'Atividade da conta' },
  { tab: 'account_security', path: '/app/conta/seguranca', title: 'Segurança da conta' },
  { tab: 'account_closure_status', path: '/conta/encerramento', title: 'Acompanhamento do encerramento' },
  { tab: 'api_keys', path: '/app/conta/chaves', title: 'Chaves de API' },
  { tab: 'for_lawyers_guide', path: '/app/guia/mcp', title: 'Guia de conexão' },
  { tab: 'api_docs', path: '/app/desenvolvedores/api', title: 'API para desenvolvedores' },
];

const routeByTab = new Map(routes.map((route) => [route.tab, route]));
const tabByPath = new Map<string, AppTab>([
  ...routes.map((route) => [route.path, route.tab] as const),
  ['/pesquisa', 'research'], ['/casos', 'matter'], ['/rascunhos', 'draft_studio'],
  ['/revisao', 'dashboard'], ['/conectar', 'connections'], ['/conta', 'credits'],
  ['/conta/atividade', 'account_activity'], ['/conta/seguranca', 'account_security'],
  ['/conta/chaves', 'api_keys'], ['/guia/mcp', 'for_lawyers_guide'],
]);

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '');
  return path || '/';
}

export function routeForTab(tab: AppTab): AppRoute {
  const route = routeByTab.get(tab);
  if (!route) throw new Error(`Rota não registrada para a aba ${tab}`);
  return route;
}

export function isKnownPath(pathname: string): boolean {
  return tabByPath.has(normalizePath(pathname));
}

export function tabForPath(pathname: string): AppTab {
  return tabByPath.get(normalizePath(pathname)) ?? 'landing';
}

export function updateDocumentTitle(tab: AppTab): void {
  if (typeof document !== 'undefined') document.title = `ForgeLex · ${routeForTab(tab).title}`;
}

export interface CaseRouteContext { matterId?: string; draftId?: string; analysisId?: string; versionId?: string }
export function navigateToTab(tab: AppTab, mode: 'push' | 'replace' = 'push', contextOrEnabled?: CaseRouteContext | boolean, enabled = CASE_WORKSPACE_ENABLED): void {
  if (typeof window === 'undefined') return;
  const context = typeof contextOrEnabled === 'boolean' ? undefined : contextOrEnabled;
  const casesEnabled = typeof contextOrEnabled === 'boolean' ? contextOrEnabled : enabled;
  const visibleTab = resolveVisibleTab(tab, casesEnabled);
  const redirected = visibleTab !== tab;
  if (redirected) mode = 'replace';
  const route = routeForTab(visibleTab);
  const params = new URLSearchParams();
  if (!redirected && context?.matterId) params.set(tab === 'matter' ? 'caso' : 'matterId', context.matterId);
  if (!redirected) for (const key of ['draftId','analysisId','versionId'] as const) if (context?.[key]) params.set(key, context[key]!);
  const preserveReturnParameters = redirected ? '' : context ? (params.size ? `?${params}` : '') : mode === 'replace' ? `${window.location.search}${window.location.hash}` : '';
  const destination = `${route.path}${preserveReturnParameters}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  updateDocumentTitle(visibleTab);
  if (current === destination) return;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, document.title, destination);
}
