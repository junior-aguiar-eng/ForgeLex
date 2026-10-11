import { isKnownPath, resolveVisibleTab, routeForTab, tabForPath, type AppTab } from './routes';
import { CASE_WORKSPACE_ENABLED } from '../config/site-capabilities';

export type PublicPage = 'home' | 'product' | 'how' | 'integrations' | 'credits' | 'guide' | 'api_docs' | 'datajud' | 'not_found';

export type SiteRoute =
  | { kind: 'public'; page: PublicPage }
  | { kind: 'auth'; view: 'sign_in' | 'sign_up' }
  | { kind: 'workspace'; tab: AppTab };

const publicPaths: Record<string, PublicPage> = {
  '/': 'home',
  '/produto': 'product',
  '/como-funciona': 'how',
  '/integracoes': 'integrations',
  '/creditos': 'credits',
  '/guia': 'guide',
  '/consulta-processual': 'datajud',
  '/desenvolvedores/api': 'api_docs',
};

export function resolveSiteRoute(pathname: string, casesEnabled = CASE_WORKSPACE_ENABLED): SiteRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path in publicPaths) return { kind: 'public', page: publicPaths[path] };
  if (path === '/entrar') return { kind: 'auth', view: 'sign_in' };
  if (path === '/cadastro') return { kind: 'auth', view: 'sign_up' };
  if (isKnownPath(path)) return { kind: 'workspace', tab: resolveVisibleTab(tabForPath(path), casesEnabled) };
  return { kind: 'public', page: 'not_found' };
}

export function safeWorkspaceDestination(value: string | null, casesEnabled = CASE_WORKSPACE_ENABLED): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  try {
    const url = new URL(value, 'https://forgelex.invalid');
    if (
      url.origin !== 'https://forgelex.invalid' ||
      !isKnownPath(url.pathname) ||
      url.pathname === '/conta/encerramento'
    )
      return '/app';
    const tab = tabForPath(url.pathname);
    const visibleTab = resolveVisibleTab(tab, casesEnabled);
    if (tab !== visibleTab) return routeForTab(visibleTab).path;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/app';
  }
}
