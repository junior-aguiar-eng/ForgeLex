import { normalizeText } from './desk-vocabulary.js';

/**
 * Peça que a Mesa pode propor (U3). Vem do catálogo incorporado: `id` é o tipo de peça, `label` o rótulo legível e
 * `triggers` as expressões que costumam anunciá-la. Nada daqui carrega o conteúdo da ficha, e a lista inteira nunca
 * chega ao navegador: a Mesa propõe uma peça por vez.
 */
export interface DeskPiece {
  readonly id: string;
  readonly label: string;
  readonly areas: readonly string[];
  readonly transversal: boolean;
  readonly triggers: readonly string[];
}

export interface PieceMatch {
  readonly piece: DeskPiece;
  readonly score: number;
}

const STOPWORDS = new Set(
  (
    'de da do das dos para por com sem que uma uns umas num numa nos nas em na no ao aos aquela aquele este esta esse essa ' +
    'meu minha seu sua quero preciso precisamos gostaria fazer elaborar redigir preparar montar entrar ' +
    'sobre contra como qual quando onde mais muito pouco ainda ja cliente caso peca modelo'
  ).split(' '),
);
const MIN_SCORE = 4;

const tokens = (normalized: string) => normalized.split(' ').filter((word) => word.length >= 3 && !STOPWORDS.has(word));
const contains = (haystack: string, phrase: string) => ` ${haystack} `.includes(` ${phrase} `);

function scoreOf(piece: DeskPiece, text: string, textTokens: ReadonlySet<string>, area: string | null): number {
  const label = normalizeText(piece.label);
  let score = 0;
  if (label && contains(text, label)) score += 10;
  for (const trigger of piece.triggers) {
    const phrase = normalizeText(trigger);
    if (phrase.length >= 4 && contains(text, phrase)) score += 5;
  }
  for (const word of tokens(label)) if (textTokens.has(word)) score += 2;
  if (score > 0 && area && piece.areas.includes(area)) score += 1;
  return score;
}

/**
 * Ordena as peças candidatas para o texto do cliente, sem chamar provedor. Com a área escolhida, só entram as peças
 * dessa área e as transversais (molduras que servem a qualquer área). As peças já recusadas ficam de fora.
 */
export function rankPieces(input: {
  readonly pieces: readonly DeskPiece[];
  readonly text: string;
  readonly area?: string | null;
  readonly rejected?: readonly string[];
}): PieceMatch[] {
  const text = normalizeText(input.text);
  if (!text) return [];
  const area = input.area ?? null;
  const rejected = new Set(input.rejected ?? []);
  const textTokens = new Set(tokens(text));
  return input.pieces
    .filter((piece) => !rejected.has(piece.id))
    .filter((piece) => !area || area === 'outra' || piece.transversal || piece.areas.includes(area))
    .map((piece) => ({ piece, score: scoreOf(piece, text, textTokens, area === 'outra' ? null : area) }))
    .filter(({ score }) => score >= MIN_SCORE)
    .sort(
      (a, b) => b.score - a.score || a.piece.label.length - b.piece.label.length || (a.piece.id < b.piece.id ? -1 : 1),
    );
}
