import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToTab, routeForTab, tabForPath } from './routes';

describe('rotas do espaço de trabalho', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['landing', '/', 'Visão geral'],
    ['research', '/pesquisa', 'Pesquisa'],
    ['matter', '/casos', 'Casos'],
    ['draft_studio', '/rascunhos', 'Rascunhos'],
    ['dashboard', '/revisao', 'Revisão'],
    ['connections', '/conectar', 'Conectar IA'],
    ['credits', '/conta', 'Conta'],
    ['account_activity', '/conta/atividade', 'Atividade da conta'],
    ['api_keys', '/conta/chaves', 'Chaves de API'],
    ['for_lawyers_guide', '/guia/mcp', 'Guia de conexão'],
    ['api_docs', '/desenvolvedores/api', 'API para desenvolvedores'],
  ] as const)('expõe %s em %s', (tab, path, title) => {
    expect(routeForTab(tab)).toEqual({ tab, path, title });
  });

  it.each([
    ['/', 'landing'],
    ['/pesquisa', 'research'],
    ['/casos', 'matter'],
    ['/rascunhos', 'draft_studio'],
    ['/revisao', 'dashboard'],
    ['/conectar', 'connections'],
    ['/conta', 'credits'],
    ['/conta/chaves', 'api_keys'],
    ['/conta/atividade', 'account_activity'],
    ['/guia/mcp', 'for_lawyers_guide'],
    ['/desenvolvedores/api', 'api_docs'],
    ['/rota-inexistente', 'landing'],
  ] as const)('resolve %s para %s', (pathname, tab) => {
    expect(tabForPath(pathname)).toBe(tab);
  });

  it('substitui a rota de retorno de pagamento sem descartar seus parâmetros', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/', search: '?billing_purchase=pedido-1&status=approved', hash: '' },
      history: { pushState: vi.fn(), replaceState },
    });
    vi.stubGlobal('document', { title: '' });

    navigateToTab('credits', 'replace');

    expect(replaceState).toHaveBeenCalledWith({}, 'ForgeLex · Conta', '/conta?billing_purchase=pedido-1&status=approved');
  });

  it('não duplica histórico ao selecionar a tela já ativa', () => {
    const pushState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/pesquisa', search: '', hash: '' },
      history: { pushState, replaceState: vi.fn() },
    });
    vi.stubGlobal('document', { title: '' });

    navigateToTab('research');

    expect(pushState).not.toHaveBeenCalled();
  });
});
