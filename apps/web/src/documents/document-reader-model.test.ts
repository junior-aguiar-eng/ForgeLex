import { describe, expect, it } from 'vitest';
import { documentMatches, documentTextParts, type DocumentAnchor } from './document-reader-model';

const anchor = (startOffset: number, endOffset: number, ordinal = 0): DocumentAnchor => ({
  id: `p${ordinal}`,
  ordinal,
  startOffset,
  endOffset,
});

describe('saved document text', () => {
  it('preserves whitespace and Unicode around ordered anchors without reconstructing the text', () => {
    const content = '  Primeiro 😀\r\n\r\nSegundo.  \n';
    const second = content.indexOf('Segundo');
    const parts = documentTextParts(content, [anchor(second, second + 8, 1), anchor(2, 13)]);
    expect(parts.map((part) => content.slice(part.start, part.end)).join('')).toBe(content);
    expect(parts.filter((part) => part.anchor).map((part) => part.anchor?.ordinal)).toEqual([0, 1]);
  });

  it('invalid and overlapping anchors cannot duplicate, hide or cut the saved text', () => {
    const content = 'Texto completo.';
    const parts = documentTextParts(content, [anchor(0, 5), anchor(2, 8, 1), anchor(8, 200, 2), anchor(9, 8, 3)]);
    expect(parts.map((part) => content.slice(part.start, part.end)).join('')).toBe(content);
    expect(parts.filter((part) => part.anchor)).toHaveLength(1);
  });

  it('documents without anchors remain readable in full', () => {
    expect(documentTextParts('Sem âncoras.', [])).toEqual([{ start: 0, end: 12 }]);
  });
});

describe('search within the saved text', () => {
  it('uses original offsets for case-insensitive matches including Unicode', () => {
    const content = '😀 OBRIGAÇÃO e obrigação.';
    expect(documentMatches(content, 'obrigação').matches.map((match) => content.slice(match.start, match.end))).toEqual(
      ['OBRIGAÇÃO', 'obrigação'],
    );
  });

  it('searches literal punctuation instead of executing a regular expression', () => {
    expect(documentMatches('Citação [art. 5] e art. 5.', '[art. 5]').matches).toEqual([{ start: 8, end: 16 }]);
    expect(documentMatches('R$ 250,00.', 'R$ 250,00.').matches).toEqual([{ start: 0, end: 10 }]);
  });

  it('supports a match spanning paragraph boundaries without changing its offsets', () => {
    expect(documentMatches('Primeiro\n\nSegundo', 'Primeiro\n\nSegundo').matches).toEqual([{ start: 0, end: 17 }]);
    expect(documentMatches('Texto', '   ').matches).toEqual([]);
  });

  it('bounds very frequent results and tells the reader when they are truncated', () => {
    const result = documentMatches('a '.repeat(1001), 'a');
    expect(result.matches).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(documentMatches('a '.repeat(1000), 'a').truncated).toBe(false);
  });
});
