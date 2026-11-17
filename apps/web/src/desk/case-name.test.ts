import { describe, expect, it } from 'vitest';
import { caseNameFrom } from './case-name';

describe('nome sugerido para o caso criado a partir da conversa', () => {
  it('sem texto não sugere nada', () => {
    expect(caseNameFrom('')).toBe('');
    expect(caseNameFrom('   \n ')).toBe('');
  });

  it('usa a primeira frase, sem pontuação final nem espaços sobrando', () => {
    expect(caseNameFrom('  Preciso das teses do STJ sobre o registro mantido.  Depois revise a peça.')).toBe(
      'Preciso das teses do STJ sobre o registro mantido',
    );
  });

  it('usa só a primeira linha', () => {
    expect(caseNameFrom('Apelação contra a sentença\nFatos: o autor alega…')).toBe('Apelação contra a sentença');
  });

  it('corta em 80 caracteres no limite de uma palavra, com reticências', () => {
    const name = caseNameFrom(
      'Preciso pesquisar as teses do Superior Tribunal de Justiça sobre a manutenção indevida do registro em cadastro de inadimplentes após a quitação',
    );
    expect(name.length).toBeLessThanOrEqual(81);
    expect(name.endsWith('…')).toBe(true);
    expect(name).not.toMatch(/\s…$/);
    expect(name.startsWith('Preciso pesquisar as teses do Superior Tribunal de Justiça sobre a')).toBe(true);
  });

  it('uma palavra gigante é cortada sem quebrar o limite', () => {
    expect(caseNameFrom('a'.repeat(200)).length).toBeLessThanOrEqual(81);
  });

  it('normaliza espaços internos repetidos', () => {
    expect(caseNameFrom('Caso   do   registro')).toBe('Caso do registro');
  });
});
