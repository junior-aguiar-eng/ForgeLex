import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeTheme, themeFromAttribute } from './active-theme';

describe('themeFromAttribute', () => {
  it('só "gelo" liga o tema gelo; qualquer outra coisa é o clássico', () => {
    expect(themeFromAttribute('gelo')).toBe('gelo');
    for (const value of ['classico', '', null, undefined, 'Gelo', 'escuro']) {
      expect(themeFromAttribute(value)).toBe('classico');
    }
  });
});

describe('activeTheme', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê o data-theme que o script do index.html pôs no <html>', () => {
    vi.stubGlobal('document', {
      documentElement: { getAttribute: (name: string) => (name === 'data-theme' ? 'gelo' : null) },
    });
    expect(activeTheme()).toBe('gelo');
  });

  it('sem documento (testes de unidade, servidor) ou sem atributo, é o clássico', () => {
    expect(activeTheme()).toBe('classico');
    vi.stubGlobal('document', { title: '' });
    expect(activeTheme()).toBe('classico');
    vi.stubGlobal('document', { documentElement: { getAttribute: () => null } });
    expect(activeTheme()).toBe('classico');
  });
});
