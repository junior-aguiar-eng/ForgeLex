import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeskCaseStructureView, type StructureViewState } from './DeskCaseStructure';
import { USER_ADDED_SEAL, USER_ADDED_TITLE } from './case-structure-model';

// Dados sintéticos: a aba pronta, como fica depois de carregar a análise e a revisão.
const ready = (extra: Partial<Extract<StructureViewState, { phase: 'ready' }>> = {}): StructureViewState => ({
  phase: 'ready',
  updatedAt: '2026-11-22T10:00:00.000Z',
  sections: [
    {
      title: 'Houve pagamento?',
      entries: [
        { kind: 'item', text: 'O autor pagou o aluguel de março.', tag: 'Alegação', citations: [1], label: 'F1' },
        {
          kind: 'item',
          text: 'O réu atrasou a entrega em 2021.',
          tag: 'Alegação',
          citations: [1],
          label: 'F2',
          change: { kind: 'corrected', before: 'O réu atrasou a entrega em 2020.' },
        },
        {
          kind: 'item',
          text: 'Trecho relacionado: “recibo de março”',
          citations: [1],
          label: 'P1',
          change: { kind: 'removed' },
        },
      ],
    },
    {
      title: USER_ADDED_TITLE,
      entries: [
        {
          kind: 'item',
          text: 'O cliente pagou abril em dinheiro.',
          citations: [],
          label: 'F3',
          userAdded: true,
          seal: USER_ADDED_SEAL,
          frase: 'o cliente também pagou abril em dinheiro',
        },
      ],
    },
  ],
  sources: [],
  pending: ['Não identifiquei a qual item você se referiu.'],
  summary: 'Locação residencial com pagamento de março discutido.',
  ...extra,
});
const render = (state: StructureViewState) =>
  renderToStaticMarkup(React.createElement(DeskCaseStructureView, { state }));

describe('DeskCaseStructureView', () => {
  it('mostra o resumo no topo, os rótulos F/P, o selo sem fonte e as marcas do que mudou', () => {
    const html = render(ready());
    expect(html.indexOf('Resumo do caso')).toBeGreaterThan(-1);
    expect(html.indexOf('Locação residencial')).toBeLessThan(html.indexOf('F1'));
    for (const label of ['F1', 'F2', 'P1', 'F3']) expect(html).toContain(`>${label}<`);
    expect(html).toContain(USER_ADDED_SEAL);
    expect(html).toContain('o cliente também pagou abril em dinheiro');
    expect(html).toContain('corrigido por você');
    expect(html).toContain('O réu atrasou a entrega em 2020.');
    expect(html).toContain('retirado por você');
    expect(html).toContain('Pontos a conferir');
    // Item informado não tem fonte nem citação.
    const added = html.slice(html.indexOf('O cliente pagou abril'));
    expect(added.slice(0, added.indexOf('</li>'))).not.toMatch(/\[\d+\]|Fontes/);
    // Leitura só: nenhum controle novo.
    expect(html).not.toMatch(/<button|<input|<select|<textarea|<form/);
  });

  it('sem revisão, a aba fica como antes: sem resumo, sem rótulo, sem selo', () => {
    const html = render(
      ready({
        summary: undefined,
        pending: [],
        sections: [
          {
            title: 'Afirmações',
            entries: [{ kind: 'item', text: 'O autor pagou o aluguel.', tag: 'Alegação', citations: [1] }],
          },
        ],
      }),
    );
    expect(html).not.toContain('Resumo do caso');
    expect(html).not.toContain(USER_ADDED_SEAL);
    expect(html).not.toContain('corrigido por você');
    expect(html).not.toMatch(/>F\d+</);
    expect(html).toContain('O autor pagou o aluguel.');
  });
});
