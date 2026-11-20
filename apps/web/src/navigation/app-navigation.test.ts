import { describe, expect, it } from 'vitest';
import { accountSections, connectSections, highlightedTab, iceNavigation } from './app-navigation';
import { routeForTab } from './routes';

const labels = (items: ReadonlyArray<{ label: string }>) => items.map((item) => item.label);

describe('iceNavigation (V2, protótipo de 09/11)', () => {
  const all = iceNavigation({ deskEnabled: true, casesEnabled: true });

  it('Trabalho (Mesa, Jurisprudência) e Conta e recursos: os casos vivem na Mesa, sem item próprio', () => {
    expect(labels(all.work)).toEqual(['Mesa', 'Jurisprudência']);
    expect(labels(all.resources)).toEqual(['Visão geral', 'Andamento processual', 'Conectar IA', 'Conta']);
  });

  it('sem a Mesa os casos precisam do próprio item; sem casos não há Mesa nem Casos, e a Jurisprudência fica', () => {
    expect(labels(iceNavigation({ deskEnabled: false, casesEnabled: true }).work)).toEqual(['Casos', 'Jurisprudência']);
    expect(labels(iceNavigation({ deskEnabled: false, casesEnabled: false }).work)).toEqual(['Jurisprudência']);
  });

  it('nenhum item leva a uma ferramenta removida, e todos têm rota', () => {
    const tabs = [...all.work, ...all.resources].map((item) => item.tab);
    for (const removed of ['draft_studio', 'dashboard', 'account_closure_status'] as const) {
      expect(tabs).not.toContain(removed);
    }
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const tab of tabs) expect(() => routeForTab(tab, 'gelo')).not.toThrow();
  });

  it('cada item tem ícone (usado só no trilho), e o do andamento e o da jurisprudência são diferentes', () => {
    const items = [...all.work, ...all.resources];
    expect(items.every((item) => item.icon.length > 0)).toBe(true);
    const icon = (tab: string) => items.find((item) => item.tab === tab)!.icon;
    expect(icon('datajud')).not.toBe(icon('research'));
  });
});

describe('accountSections (seções da conta)', () => {
  it('Faturamento, Atividade, Segurança e Chaves de API, todas com rota', () => {
    const sections = accountSections();
    expect(labels(sections)).toEqual(['Faturamento', 'Atividade', 'Segurança', 'Chaves de API']);
    expect(sections.map((section) => section.tab)).toEqual([
      'credits',
      'account_activity',
      'account_security',
      'api_keys',
    ]);
    for (const section of sections) expect(() => routeForTab(section.tab, 'gelo')).not.toThrow();
  });
});

describe('connectSections (seções de Conectar IA)', () => {
  it('Conexão, Guia de conexão e API para desenvolvedores, todas com rota', () => {
    const sections = connectSections();
    expect(labels(sections)).toEqual(['Conexão', 'Guia de conexão', 'API para desenvolvedores']);
    for (const section of sections) expect(() => routeForTab(section.tab, 'gelo')).not.toThrow();
  });
});

describe('highlightedTab', () => {
  it('Rascunhos e Revisão são a Mesa: acendem o item Mesa', () => {
    expect(highlightedTab('draft_studio')).toBe('work');
    expect(highlightedTab('dashboard')).toBe('work');
  });

  it('as seções da conta acendem Conta, e o guia e a API acendem Conectar IA', () => {
    for (const tab of ['account_activity', 'account_security', 'api_keys'] as const) {
      expect(highlightedTab(tab)).toBe('credits');
    }
    expect(highlightedTab('for_lawyers_guide')).toBe('connections');
    expect(highlightedTab('api_docs')).toBe('connections');
  });

  it('Dados do caso é parte da Mesa: acende o item Mesa, e sem a Mesa acende o próprio item', () => {
    expect(highlightedTab('matter')).toBe('work');
    expect(highlightedTab('matter', true)).toBe('work');
    expect(highlightedTab('matter', false)).toBe('matter');
  });

  it('as outras telas acendem o próprio item', () => {
    for (const tab of ['work', 'research', 'landing', 'credits', 'datajud', 'connections'] as const) {
      expect(highlightedTab(tab)).toBe(tab);
    }
  });
});
