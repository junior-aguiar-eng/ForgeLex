export type AppTab = 'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'account_activity' | 'account_security' | 'account_closure_status' | 'api_keys' | 'for_lawyers_guide' | 'api_docs';

export type AppRoute = {
  tab: AppTab;
  path: string;
  title: string;
};

const routes: readonly AppRoute[] = [
  { tab: 'landing', path: '/app', title: 'Visão geral' },
  { tab: 'research', path: '/app/pesquisa', title: 'Pesquisa' },
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
