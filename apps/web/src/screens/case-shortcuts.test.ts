import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ status: 'authenticated', account: null }) }));
vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    tribunals: { state: 'ready', data: [{ code: 'STJ', searchable: true, name: 'STJ' }] },
    recentSearches: { state: 'empty', data: [] },
    searchIntent: null,
    searchCostCents: 20,
    searchBusy: false,
    searchFailure: null,
    searchExecution: {
      intent: { query: 'teste', court: 'STJ' },
      resultCount: 1,
      chargedCents: 20,
      results: [
        {
          id: 'synthetic',
          court: 'STJ',
          processNumber: 'REsp 123',
          ementa: 'Decisão sintética',
          sourceAuthority: { id: 'synthetic' },
          sourceUrl: 'https://stj.jus.br',
          verificationStatus: 'UNVERIFIED',
        },
      ],
    },
  }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
// Compile the dependency graph during module collection, outside hook/test timers.
// Each case still reloads modules so both flag configurations are independent.
await Promise.all([
  import('./LandingScreen'),
  import('./ResearchDeskScreen'),
  import('./ConnectionsScreen'),
  import('../components/Header'),
  import('../components/Sidebar'),
]);
describe('Mesa única na navegação', () => {
  it('mostra a Mesa só com a Mesa agêntica e os casos ligados, sem Rascunhos nem Revisão avulsos', async () => {
    for (const [cases, agentic, mesa] of [
      ['true', 'true', true],
      ['true', 'false', false],
      ['false', 'true', false],
    ] as const) {
      vi.stubEnv('VITE_FORGELEX_CASE_WORKSPACE_ENABLED', cases);
      vi.stubEnv('VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED', agentic);
      vi.resetModules();
      const { Header } = await import('../components/Header');
      const { Sidebar } = await import('../components/Sidebar');
      const header = renderToStaticMarkup(React.createElement(Header, { menuOpen: false, onMenuToggle: () => {} }));
      const sidebar = renderToStaticMarkup(
        React.createElement(Sidebar, {
          activeTab: 'connections',
          mobileOpen: true,
          onCloseMobile: () => {},
          onSelect: () => {},
        }),
      );
      for (const html of [header, sidebar]) {
        expect(html.includes('>Mesa<')).toBe(mesa);
        for (const label of ['>Rascunhos<', '>Revisão<']) expect(html.includes(label)).toBe(false);
      }
    }
  });
});
describe('atalhos de casos nas telas preservadas', () => {
  it.each([false, true])('respeita flag casesEnabled=%s em resultados e conexão', async (enabled) => {
    vi.stubEnv('VITE_FORGELEX_CASE_WORKSPACE_ENABLED', String(enabled));
    vi.resetModules();
    const { LandingScreen } = await import('./LandingScreen');
    const { ResearchDeskScreen } = await import('./ResearchDeskScreen');
    const { ConnectionsScreen } = await import('./ConnectionsScreen');
    const { Header } = await import('../components/Header');
    const { Sidebar } = await import('../components/Sidebar');
    const header = renderToStaticMarkup(React.createElement(Header, { menuOpen: false, onMenuToggle: () => {} }));
    const sidebar = renderToStaticMarkup(
      React.createElement(Sidebar, {
        activeTab: 'connections',
        mobileOpen: true,
        onCloseMobile: () => {},
        onSelect: () => {},
      }),
    );
    for (const html of [header, sidebar]) {
      expect(html.includes('>Casos<')).toBe(enabled);
      // Rascunhos e Revisão deixaram de ser itens avulsos: viraram abas da Mesa.
      for (const label of ['>Rascunhos<', '>Revisão<']) expect(html.includes(label)).toBe(false);
      expect(html.includes('>Mesa<')).toBe(false);
      expect(html).toContain('Pesquisa');
    }
    expect(sidebar).toContain('Consulta processual gratuita');
    expect(sidebar).toContain('API para desenvolvedores');
    expect(sidebar).toContain('Guia de conexão');
    for (const Screen of [LandingScreen, ResearchDeskScreen]) {
      const html = renderToStaticMarkup(React.createElement(Screen));
      expect(html.includes('Salvar no caso')).toBe(enabled);
      expect(html).toContain('Decisão sintética');
      expect(html).toContain('Copiar');
    }
    const home = renderToStaticMarkup(React.createElement(LandingScreen));
    expect(home.includes('Abrir caso')).toBe(enabled);
    expect(home.includes('Revisão humana antes de efeitos externos')).toBe(enabled);
    expect(home.includes('Fontes e fatos rastreáveis')).toBe(enabled);
    expect(home.includes('Conferência das fontes')).toBe(!enabled);
    expect(home.includes('Fontes e proveniência')).toBe(!enabled);
    const connection = renderToStaticMarkup(React.createElement(ConnectionsScreen));
    expect(connection.includes('href="/app/casos"')).toBe(enabled);
    expect(connection).toContain('Aplicativos autorizados');
  });
});

describe('tela inicial interna no modelo novo (V5A)', () => {
  it.each([false, true])('com VITE_FORGELEX_PUBLIC_MODEL ligado, o título é um só, com casos=%s', async (cases) => {
    vi.stubEnv('VITE_FORGELEX_CASE_WORKSPACE_ENABLED', String(cases));
    vi.stubEnv('VITE_FORGELEX_PUBLIC_MODEL', 'true');
    vi.resetModules();
    const { LandingScreen } = await import('./LandingScreen');
    const home = renderToStaticMarkup(React.createElement(LandingScreen));
    const text = home.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(home).toContain('Peças jurídicas prontas para revisar, com a jurisprudência na fonte.');
    expect(text).toContain('com decisões do STJ e a fonte de cada uma');
    expect(text).toContain('Fonte e estado de verificação');
    for (const gone of ['Do caso à minuta', 'Revisão humana antes de efeitos externos', 'Fontes e fatos rastreáveis'])
      expect(home, gone).not.toContain(gone);
    expect(home).toContain('Comece pela conexão com IA');
    // A função não muda: o botão de caso continua pela mesma flag de casos.
    expect(home.includes('Abrir caso')).toBe(cases);
  });

  it('com o modelo desligado a tela inicial fica como está', async () => {
    vi.stubEnv('VITE_FORGELEX_CASE_WORKSPACE_ENABLED', 'false');
    vi.resetModules();
    const { LandingScreen } = await import('./LandingScreen');
    const home = renderToStaticMarkup(React.createElement(LandingScreen));
    expect(home).toContain('Jurisprudência dos tribunais superiores e consulta processual.');
    expect(home).not.toContain('Peças jurídicas prontas para revisar');
  });
});
