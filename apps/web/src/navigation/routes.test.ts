import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToTab, routeForTab, tabForPath } from './routes';

describe('rotas do espaço de trabalho', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['landing', '/app', 'Visão geral'],
    ['research', '/app/pesquisa', 'Pesquisa'],
    ['matter', '/app/casos', 'Casos'],
    ['draft_studio', '/app/rascunhos', 'Rascunhos'],
    ['dashboard', '/app/revisao', 'Revisão'],
    ['connections', '/app/conectar', 'Conectar IA'],
    ['credits', '/app/conta', 'Conta'],
    ['account_activity', '/app/conta/atividade', 'Atividade da conta'],
    ['account_security', '/app/conta/seguranca', 'Segurança da conta'],
    ['account_closure_status', '/conta/encerramento', 'Acompanhamento do encerramento'],
    ['api_keys', '/app/conta/chaves', 'Chaves de API'],
    ['for_lawyers_guide', '/app/guia/mcp', 'Guia de conexão'],
    ['api_docs', '/app/desenvolvedores/api', 'API para desenvolvedores'],
  ] as const)('expõe %s em %s', (tab, path, title) => {
    expect(routeForTab(tab)).toEqual({ tab, path, title });
  });

  it.each([
    ['/app', 'landing'],
    ['/pesquisa', 'research'],
    ['/casos', 'matter'],
    ['/rascunhos', 'draft_studio'],
    ['/revisao', 'dashboard'],
    ['/conectar', 'connections'],
    ['/conta', 'credits'],
    ['/conta/chaves', 'api_keys'],
    ['/conta/atividade', 'account_activity'],
    ['/conta/seguranca', 'account_security'],
    ['/conta/encerramento', 'account_closure_status'],
    ['/guia/mcp', 'for_lawyers_guide'],
    ['/app/desenvolvedores/api', 'api_docs'],
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

    expect(replaceState).toHaveBeenCalledWith({}, 'ForgeLex · Conta', '/app/conta?billing_purchase=pedido-1&status=approved');
  });

  it('não duplica histórico ao selecionar a tela já ativa', () => {
    const pushState = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/app/pesquisa', search: '', hash: '' },
      history: { pushState, replaceState: vi.fn() },
    });
    vi.stubGlobal('document', { title: '' });

    navigateToTab('research');

    expect(pushState).not.toHaveBeenCalled();
  });
});
