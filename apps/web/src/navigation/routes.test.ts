import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToTab, resolveVisibleTab, routeForTab, tabForPath } from './routes';

describe('rotas do espaço de trabalho', () => {
  it('não expõe contexto de caso quando o espaço de trabalho está desativado', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/app', search: '', hash: '' }, history: { replaceState, pushState: vi.fn() } });
    vi.stubGlobal('document', { title: '' });
    navigateToTab('draft_studio', 'push', { matterId: 'privado', draftId: 'minuta' }, false);
    expect(replaceState).toHaveBeenCalledWith({}, 'ForgeLex · Conectar IA', '/app/conectar');
  });
  it.each(['matter', 'draft_studio', 'dashboard'] as const)('redireciona tentativa interna de %s sem parâmetros do caso', (tab) => {
    const replaceState = vi.fn();
    const pushState = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/app/casos', search: '?matterId=private', hash: '#document' }, history: { replaceState, pushState } });
    vi.stubGlobal('document', { title: '' });
    expect(resolveVisibleTab(tab, false)).toBe('connections');
    expect(resolveVisibleTab(tab, true)).toBe(tab);
    navigateToTab(tab, 'push', false);
    expect(replaceState).toHaveBeenCalledWith({}, 'ForgeLex · Conectar IA', '/app/conectar');
    expect(pushState).not.toHaveBeenCalled();
  });
  it('preserva abas de conta e pesquisa nos dois modos', () => {
    for (const tab of ['credits', 'research', 'datajud', 'api_docs', 'account_security', 'api_keys'] as const) {
      expect(resolveVisibleTab(tab, false)).toBe(tab);
      expect(resolveVisibleTab(tab, true)).toBe(tab);
    }
  });
  it('transporta caso e rascunho sem confundir identificadores', () => {
    const pushState = vi.fn();
    vi.stubGlobal('window',{location:{pathname:'/app/casos',search:'?caso=A',hash:''},history:{pushState,replaceState:vi.fn()}});
    vi.stubGlobal('document',{title:''});
    navigateToTab('draft_studio','push',{matterId:'A',draftId:'D'},true);
    expect(pushState).toHaveBeenCalledWith({},'ForgeLex · Rascunhos','/app/rascunhos?matterId=A&draftId=D');
    navigateToTab('matter','push',{matterId:'A',analysisId:'R'},true);
    expect(pushState).toHaveBeenLastCalledWith({},'ForgeLex · Casos','/app/casos?caso=A&analysisId=R');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['landing', '/app', 'Visão geral'],
    ['research', '/app/pesquisa', 'Pesquisa'],
    ['datajud', '/app/consulta-processual', 'Consulta processual'],
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
    ['/app/consulta-processual', 'datajud'],
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
