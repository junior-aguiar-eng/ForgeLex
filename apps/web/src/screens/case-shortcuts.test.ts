import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ status: 'authenticated', account: null }) }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({
  tribunals: { state: 'ready', data: [{ code: 'STJ', searchable: true, name: 'STJ' }] },
  recentSearches: { state: 'empty', data: [] }, searchIntent: null, searchCostCents: 20,
  searchBusy: false, searchFailure: null, searchExecution: {
    intent: { query: 'teste', court: 'STJ' }, resultCount: 1, chargedCents: 20,
    results: [{ id: 'synthetic', court: 'STJ', processNumber: 'REsp 123', ementa: 'Decisão sintética', sourceAuthority: { id: 'synthetic' }, sourceUrl: 'https://stj.jus.br', verificationStatus: 'UNVERIFIED' }],
  },
}) }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
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
    const sidebar = renderToStaticMarkup(React.createElement(Sidebar, { activeTab: 'connections', mobileOpen: true, onCloseMobile: () => {}, onSelect: () => {} }));
    for (const html of [header, sidebar]) {
      for (const label of ['>Casos<', '>Rascunhos<', '>Revisão<']) expect(html.includes(label)).toBe(enabled);
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
