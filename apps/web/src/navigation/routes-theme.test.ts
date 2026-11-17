import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalPathname, navigateToTab, routeForTab, tabForPath, type AppTab } from './routes';
import { resolveSiteRoute, safeWorkspaceDestination } from './site-routes';

const ALL_TABS: AppTab[] = [
  'work',
  'landing',
  'research',
  'datajud',
  'matter',
  'draft_studio',
  'dashboard',
  'connections',
  'credits',
  'account_activity',
  'account_security',
  'account_closure_status',
  'api_keys',
  'for_lawyers_guide',
  'api_docs',
];

describe('rotas por tema (V2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no gelo, "Consulta processual" vira "Andamento processual" e "Pesquisa" vira "Jurisprudência"', () => {
    expect(routeForTab('datajud', 'gelo')).toEqual({
      tab: 'datajud',
      path: '/app/andamento-processual',
      title: 'Andamento processual',
    });
    expect(routeForTab('research', 'gelo')).toEqual({
      tab: 'research',
      path: '/app/pesquisa',
      title: 'Jurisprudência',
    });
  });

  it('o clássico continua exatamente como era', () => {
    expect(routeForTab('datajud', 'classico')).toEqual({
      tab: 'datajud',
      path: '/app/consulta-processual',
      title: 'Consulta processual',
    });
    expect(routeForTab('research', 'classico').title).toBe('Pesquisa');
  });

  it('as demais rotas são iguais nos dois temas', () => {
    for (const tab of ALL_TABS.filter((tab) => tab !== 'datajud' && tab !== 'research')) {
      expect(routeForTab(tab, 'gelo'), tab).toEqual(routeForTab(tab, 'classico'));
    }
  });

  it('o caminho novo e o antigo abrem a mesma tela, em qualquer tema', () => {
    expect(tabForPath('/app/andamento-processual')).toBe('datajud');
    expect(tabForPath('/app/consulta-processual')).toBe('datajud');
    expect(resolveSiteRoute('/app/andamento-processual')).toEqual({ kind: 'workspace', tab: 'datajud' });
    expect(resolveSiteRoute('/app/andamento-processual/')).toEqual({ kind: 'workspace', tab: 'datajud' });
    expect(safeWorkspaceDestination('/app/andamento-processual?x=1#a')).toBe('/app/andamento-processual?x=1#a');
  });

  it('a página pública de consulta não muda: continua em /consulta-processual até a V5A', () => {
    expect(resolveSiteRoute('/consulta-processual')).toEqual({ kind: 'public', page: 'datajud' });
    expect(resolveSiteRoute('/andamento-processual')).toEqual({ kind: 'public', page: 'not_found' });
  });
});

describe('canonicalPathname', () => {
  it('no gelo, a rota antiga de andamento aponta para a nova, com ou sem barra final', () => {
    expect(canonicalPathname('/app/consulta-processual', 'gelo')).toBe('/app/andamento-processual');
    expect(canonicalPathname('/app/consulta-processual/', 'gelo')).toBe('/app/andamento-processual');
  });

  it('não mexe no que já é canônico, no desconhecido nem em nenhum caminho do clássico', () => {
    expect(canonicalPathname('/app/andamento-processual', 'gelo')).toBe('/app/andamento-processual');
    expect(canonicalPathname('/app/pesquisa', 'gelo')).toBe('/app/pesquisa');
    expect(canonicalPathname('/rota-inexistente', 'gelo')).toBe('/rota-inexistente');
    expect(canonicalPathname('/app/consulta-processual', 'classico')).toBe('/app/consulta-processual');
  });
});

describe('navegação no gelo', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubBrowser(theme: 'gelo' | 'classico', pathname = '/app') {
    const pushState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname, search: '', hash: '' },
      history: { pushState, replaceState: vi.fn() },
    });
    vi.stubGlobal('document', {
      title: '',
      documentElement: { getAttribute: (name: string) => (name === 'data-theme' ? theme : null) },
    });
    return pushState;
  }

  it('abrir o andamento usa o caminho e o título novos', () => {
    const pushState = stubBrowser('gelo');
    navigateToTab('datajud', 'push', true, true);
    expect(pushState).toHaveBeenCalledWith({}, 'ForgeLex · Andamento processual', '/app/andamento-processual');
  });

  it('abrir a jurisprudência usa o título novo e o mesmo caminho', () => {
    const pushState = stubBrowser('gelo');
    navigateToTab('research', 'push', true, true);
    expect(pushState).toHaveBeenCalledWith({}, 'ForgeLex · Jurisprudência', '/app/pesquisa');
  });

  it('no clássico nada mudou', () => {
    const pushState = stubBrowser('classico');
    navigateToTab('datajud', 'push', true, true);
    expect(pushState).toHaveBeenCalledWith({}, 'ForgeLex · Consulta processual', '/app/consulta-processual');
  });
});
