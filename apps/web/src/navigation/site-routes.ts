import { isKnownPath, tabForPath, type AppTab } from './routes';

export type PublicPage = 'home' | 'product' | 'how' | 'integrations' | 'credits' | 'guide' | 'api_docs' | 'not_found';

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
  '/desenvolvedores/api': 'api_docs',
};

export function resolveSiteRoute(pathname: string): SiteRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path in publicPaths) return { kind: 'public', page: publicPaths[path] };
  if (path === '/entrar') return { kind: 'auth', view: 'sign_in' };
  if (path === '/cadastro') return { kind: 'auth', view: 'sign_up' };
  if (isKnownPath(path)) return { kind: 'workspace', tab: tabForPath(path) };
  return { kind: 'public', page: 'not_found' };
}

export function safeWorkspaceDestination(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/app';
  try {
    const url = new URL(value, 'https://forgelex.invalid');
    if (
      url.origin !== 'https://forgelex.invalid' ||
      !isKnownPath(url.pathname) ||
      url.pathname === '/conta/encerramento'
    )
      return '/app';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/app';
  }
}
