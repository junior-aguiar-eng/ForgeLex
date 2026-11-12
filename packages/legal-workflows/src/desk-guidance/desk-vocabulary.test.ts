import { describe, expect, it } from 'vitest';
import { DESK_AREAS, deskAreaLabel, deskCourtLabel, normalizeText, parseCourt } from './desk-vocabulary.js';
import { rankPieces, type DeskPiece } from './piece-ranking.js';

describe('vocabulário da Mesa', () => {
  it('traz as 25 grandes áreas, sem repetição, com rótulo legível', () => {
    expect(DESK_AREAS).toHaveLength(25);
    expect(new Set(DESK_AREAS.map(({ id }) => id)).size).toBe(25);
    expect(deskAreaLabel('processo-penal')).toBe('Processo penal');
    expect(deskAreaLabel('outra')).toBe('Outra área');
    expect(deskAreaLabel('nao-existe')).toBeUndefined();
  });

  it('normaliza acento, caixa e pontuação', () => {
    expect(normalizeText('  Resposta à Acusação, TJ-AL! ')).toBe('resposta a acusacao tj al');
  });

  it.each([
    ['TJ-AL', 'tj-al', 'TJ-AL'],
    ['TJAL', 'tj-al', 'TJ-AL'],
    ['tj al', 'tj-al', 'TJ-AL'],
    ['Tribunal de Justiça de Alagoas', 'tj-al', 'TJ-AL'],
    ['Tribunal de Justiça do Rio Grande do Sul', 'tj-rs', 'TJ-RS'],
    ['TJDFT', 'tj-df', 'TJ-DF'],
    ['STJ', 'stj', 'STJ'],
    ['Superior Tribunal de Justiça', 'stj', 'STJ'],
    ['TRF 4', 'trf-4', 'TRF-4'],
    ['Tribunal Regional Federal da 3ª Região', 'trf-3', 'TRF-3'],
    ['TRT-15', 'trt-15', 'TRT-15'],
    ['TRT 30', null, null],
    ['TRE-SP', 'tre-sp', 'TRE-SP'],
    ['Vara cível de Maceió', null, null],
  ])('reconhece o tribunal em %s', (text, id, label) => {
    expect(parseCourt(text)?.id ?? null).toBe(id);
    expect(parseCourt(text)?.label ?? null).toBe(label);
  });

  it('dá rótulo ao tribunal reconhecido e ignora ids desconhecidos', () => {
    expect(deskCourtLabel('tj-al')).toBe('TJ-AL');
    expect(deskCourtLabel('stf')).toBe('STF');
    expect(deskCourtLabel('outro')).toBe('Outro tribunal');
    expect(deskCourtLabel('qualquer')).toBeUndefined();
  });
});

const piece = (
  id: string,
  label: string,
  areas: string[],
  triggers: string[] = [],
  transversal = false,
): DeskPiece => ({
  id,
  label,
  areas,
  transversal,
  triggers,
});
const pieces = [
  piece('resposta-acusacao', 'Resposta à acusação', ['penal', 'processo-penal'], ['defesa preliminar', 'art 396']),
  piece('contestacao-civel', 'Contestação cível', ['processo-civil'], ['defesa do reu', 'resposta do reu']),
  piece('habeas-corpus', 'Habeas corpus', ['processo-penal'], ['prisao ilegal']),
  piece('oficio', 'Ofício', [], [], true),
];

describe('ranqueamento de peças', () => {
  it('põe primeiro a peça cujo nome aparece no texto, mesmo com acento diferente', () => {
    const ranked = rankPieces({ pieces, text: 'Preciso elaborar uma resposta a acusacao para o meu cliente' });
    expect(ranked[0].piece.id).toBe('resposta-acusacao');
  });

  it('usa os gatilhos quando o nome não aparece', () => {
    expect(rankPieces({ pieces, text: 'cliente foi citado, quero a defesa do réu' })[0].piece.id).toBe(
      'contestacao-civel',
    );
    expect(rankPieces({ pieces, text: 'prisão ilegal na delegacia' })[0].piece.id).toBe('habeas-corpus');
  });

  it('com a área escolhida, só entram as peças da área e as transversais', () => {
    const ids = (area: string) =>
      rankPieces({ pieces, area, text: 'ofício e resposta à acusação' }).map((m) => m.piece.id);
    expect(ids('penal')).toEqual(['resposta-acusacao', 'oficio']);
    expect(ids('processo-civil')).toEqual(['oficio']);
    expect(ids('outra')).toEqual(['resposta-acusacao', 'oficio']);
  });

  it('deixa de fora as peças recusadas e o texto sem correspondência', () => {
    const text = 'resposta à acusação';
    expect(rankPieces({ pieces, text, rejected: ['resposta-acusacao'] })).toEqual([]);
    expect(rankPieces({ pieces, text: 'quero entender como proceder' })).toEqual([]);
    expect(rankPieces({ pieces, text: '   ' })).toEqual([]);
  });

  it('a palavra rara do rótulo identifica a peça mesmo sem o nome inteiro no texto', () => {
    const many = Array.from({ length: 29 }, (_, index) =>
      piece(`acao-${index}`, `Ação Tipo${String.fromCharCode(65 + (index % 26))}${index}`, ['civil']),
    );
    const catalog = [...many, piece('acao-alimentos', 'Ação de Alimentos', ['familia-sucessoes'])];
    expect(rankPieces({ pieces: catalog, text: 'pedido de alimentos para meu filho' })[0]?.piece.id).toBe(
      'acao-alimentos',
    );
    expect(rankPieces({ pieces: catalog, text: 'quero fazer uma ação' })).toEqual([]);
  });

  it('desempata de forma estável, sem depender da ordem de entrada', () => {
    const twin = [
      piece('b-peca', 'Petição simples', ['civil'], ['peticao']),
      piece('a-peca', 'Petição simples', ['civil'], ['peticao']),
    ];
    const forward = rankPieces({ pieces: twin, text: 'petição simples' }).map((m) => m.piece.id);
    const reverse = rankPieces({ pieces: [...twin].reverse(), text: 'petição simples' }).map((m) => m.piece.id);
    expect(forward).toEqual(['a-peca', 'b-peca']);
    expect(reverse).toEqual(forward);
  });
});
