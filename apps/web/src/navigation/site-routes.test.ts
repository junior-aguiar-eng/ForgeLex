import { describe, expect, it } from 'vitest';
import { resolveSiteRoute, safeWorkspaceDestination } from './site-routes';

describe('rotas públicas e protegidas', () => {
  it.each(['/app/casos', '/app/rascunhos', '/app/revisao', '/casos', '/rascunhos', '/revisao'])('oculta %s e seu next inclusive com barra final', (path) => {
    for (const suffix of ['', '/']) {
      expect(resolveSiteRoute(path + suffix, false)).toEqual({ kind: 'workspace', tab: 'connections' });
      expect(safeWorkspaceDestination(path + suffix + '?matterId=private#document', false)).toBe('/app/conectar');
      expect(safeWorkspaceDestination(path + suffix + '?matterId=private#document', true)).toBe(path + suffix + '?matterId=private#document');
    }
  });
  it('preserva parâmetros e hash de conta no next', () => {
    expect(safeWorkspaceDestination('/app/conta?billing_purchase=p1&status=approved#receipt', false)).toBe('/app/conta?billing_purchase=p1&status=approved#receipt');
  });
  it.each([
    ['/', { kind: 'public', page: 'home' }],
    ['/produto', { kind: 'public', page: 'product' }],
    ['/guia', { kind: 'public', page: 'guide' }],
    ['/consulta-processual', { kind: 'public', page: 'datajud' }],
    ['/app/consulta-processual', { kind: 'workspace', tab: 'datajud' }],
    ['/desenvolvedores/api', { kind: 'public', page: 'api_docs' }],
    ['/entrar', { kind: 'auth', view: 'sign_in' }],
    ['/cadastro', { kind: 'auth', view: 'sign_up' }],
    ['/app/pesquisa', { kind: 'workspace', tab: 'research' }],
    ['/pesquisa', { kind: 'workspace', tab: 'research' }],
    ['/rota-inexistente', { kind: 'public', page: 'not_found' }],
  ] as const)('resolve %s', (path, expected) => {
    expect(resolveSiteRoute(path)).toEqual(expected);
  });

  it('aceita apenas destinos internos conhecidos após o login', () => {
    expect(safeWorkspaceDestination('/app/casos?secao=provas', true)).toBe('/app/casos?secao=provas');
    expect(safeWorkspaceDestination('/pesquisa')).toBe('/pesquisa');
    expect(safeWorkspaceDestination('/app/consulta-processual')).toBe('/app/consulta-processual');
    expect(safeWorkspaceDestination('https://example.com')).toBe('/app');
    expect(safeWorkspaceDestination('//example.com')).toBe('/app');
    expect(safeWorkspaceDestination('/app/desconhecido')).toBe('/app');
  });
});
