import { describe, expect, it } from 'vitest';
import { resolveSiteRoute, safeWorkspaceDestination } from './site-routes';

describe('rotas públicas e protegidas', () => {
  it.each([
    ['/', { kind: 'public', page: 'home' }],
    ['/produto', { kind: 'public', page: 'product' }],
    ['/guia', { kind: 'public', page: 'guide' }],
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
    expect(safeWorkspaceDestination('/app/casos?secao=provas')).toBe('/app/casos?secao=provas');
    expect(safeWorkspaceDestination('/pesquisa')).toBe('/pesquisa');
    expect(safeWorkspaceDestination('https://example.com')).toBe('/app');
    expect(safeWorkspaceDestination('//example.com')).toBe('/app');
    expect(safeWorkspaceDestination('/app/desconhecido')).toBe('/app');
  });
});
