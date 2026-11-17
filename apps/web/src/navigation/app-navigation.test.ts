import { describe, expect, it } from 'vitest';
import { highlightedTab, iceNavigation } from './app-navigation';
import { routeForTab } from './routes';

const labels = (items: ReadonlyArray<{ label: string }>) => items.map((item) => item.label);

describe('iceNavigation (V2)', () => {
  const all = iceNavigation({ deskEnabled: true, casesEnabled: true });

  it('trabalho, recursos e conta, na ordem da tabela 7.2', () => {
    expect(labels(all.work)).toEqual(['Mesa', 'Casos', 'Jurisprudência']);
    expect(labels(all.resources)).toEqual([
      'Visão geral',
      'Andamento processual',
      'Conectar IA',
      'Guia de conexão',
      'API para desenvolvedores',
    ]);
    expect(labels(all.account)).toEqual([
      'Conta e faturamento',
      'Atividade da conta',
      'Segurança da conta',
      'Chaves de API',
    ]);
  });

  it('sem a Mesa não há item Mesa; sem casos não há Mesa nem Casos, e a Jurisprudência fica', () => {
    expect(labels(iceNavigation({ deskEnabled: false, casesEnabled: true }).work)).toEqual(['Casos', 'Jurisprudência']);
    expect(labels(iceNavigation({ deskEnabled: false, casesEnabled: false }).work)).toEqual(['Jurisprudência']);
  });

  it('nenhum item leva a uma ferramenta removida, e todos têm rota', () => {
    const tabs = [...all.work, ...all.resources, ...all.account].map((item) => item.tab);
    for (const removed of ['draft_studio', 'dashboard', 'account_closure_status'] as const) {
      expect(tabs).not.toContain(removed);
    }
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const tab of tabs) expect(() => routeForTab(tab, 'gelo')).not.toThrow();
  });

  it('cada item tem ícone, e o do andamento e o da jurisprudência são diferentes', () => {
    const items = [...all.work, ...all.resources, ...all.account];
    expect(items.every((item) => item.icon.length > 0)).toBe(true);
    const icon = (tab: string) => items.find((item) => item.tab === tab)!.icon;
    expect(icon('datajud')).not.toBe(icon('research'));
  });
});

describe('highlightedTab', () => {
  it('Rascunhos e Revisão são a Mesa: acendem o item Mesa', () => {
    expect(highlightedTab('draft_studio')).toBe('work');
    expect(highlightedTab('dashboard')).toBe('work');
  });

  it('as outras telas acendem o próprio item', () => {
    for (const tab of ['work', 'matter', 'research', 'landing', 'credits'] as const) {
      expect(highlightedTab(tab)).toBe(tab);
    }
  });
});
