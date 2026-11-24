import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewItemKind } from './EvidenceReviewPanel';

// Dados sintéticos: um fato da análise e um fato que o usuário informou pela conversa (E2).
const fact = { kind: 'FACT' as const, classification: 'ALLEGATION' };
const render = (item: Parameters<typeof ReviewItemKind>[0]['item']) =>
  renderToStaticMarkup(React.createElement(ReviewItemKind, { item }));

describe('ReviewItemKind', () => {
  it('item informado pelo usuário leva o selo, para não parecer fato da análise', () => {
    const html = render({
      ...fact,
      userAdded: { frase: 'pagou abril em dinheiro', addedAt: '2026-11-22T10:00:00.000Z' },
    });
    expect(html).toContain('Fato alegado');
    expect(html).toContain('informado por você, a confirmar');
  });

  it('item da análise fica como antes, sem selo', () => {
    const html = render(fact);
    expect(html).toContain('Fato alegado');
    expect(html).not.toContain('informado por você');
  });
});
