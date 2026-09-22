export type AppTab = 'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'account_activity' | 'account_security' | 'api_keys' | 'for_lawyers_guide' | 'api_docs';

export type AppRoute = {
  tab: AppTab;
  path: string;
  title: string;
};

const routes: readonly AppRoute[] = [
  { tab: 'landing', path: '/', title: 'Visão geral' },
  { tab: 'research', path: '/pesquisa', title: 'Pesquisa' },
  { tab: 'matter', path: '/casos', title: 'Casos' },
  { tab: 'draft_studio', path: '/rascunhos', title: 'Rascunhos' },
  { tab: 'dashboard', path: '/revisao', title: 'Revisão' },
  { tab: 'connections', path: '/conectar', title: 'Conectar IA' },
  { tab: 'credits', path: '/conta', title: 'Conta' },
  { tab: 'account_activity', path: '/conta/atividade', title: 'Atividade da conta' },
  { tab: 'account_security', path: '/conta/seguranca', title: 'Segurança da conta' },
  { tab: 'api_keys', path: '/conta/chaves', title: 'Chaves de API' },
  { tab: 'for_lawyers_guide', path: '/guia/mcp', title: 'Guia de conexão' },
  { tab: 'api_docs', path: '/desenvolvedores/api', title: 'API para desenvolvedores' },
];

const routeByTab = new Map(routes.map((route) => [route.tab, route]));
const tabByPath = new Map<string, AppTab>([
  ...routes.map((route) => [route.path, route.tab] as const),
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

export function navigateToTab(tab: AppTab, mode: 'push' | 'replace' = 'push'): void {
  if (typeof window === 'undefined') return;

  const route = routeForTab(tab);
  const preserveReturnParameters = mode === 'replace' ? `${window.location.search}${window.location.hash}` : '';
  const destination = `${route.path}${preserveReturnParameters}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  updateDocumentTitle(tab);
  if (current === destination) return;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, document.title, destination);
}
