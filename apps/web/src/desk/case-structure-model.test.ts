import { describe, expect, it } from 'vitest';
import type { PresentedBlock } from '../agentic-workspace/present-delivery';
import {
  STRUCTURE_QUESTION_REASONS,
  type StructureAdjustmentRecord,
} from '../../../../packages/domain/src/contracts/structure-commands';
import {
  STRUCTURE_LEAD_TITLE,
  USER_ADDED_SEAL,
  USER_ADDED_TITLE,
  structureQuestions,
  structureSections,
  structureSize,
  structureSummary,
  type StructureReview,
  type StructureReviewItem,
  type StructureSection,
} from './case-structure-model';

const block = (kind: PresentedBlock['kind'], text: string, extra: Partial<PresentedBlock> = {}): PresentedBlock => ({
  kind,
  text,
  citations: [],
  ...extra,
});

describe('structureSections', () => {
  it('agrupa os itens sob o cabeçalho que os antecede e mantém a classificação e as fontes', () => {
    const sections = structureSections([
      block('heading', 'Questões'),
      block('item', 'Há dano moral?', { citations: [1] }),
      block('heading', 'Afirmações'),
      block('item', 'O autor foi cobrado duas vezes.', { tag: 'Alegação', citations: [1, 2] }),
      block('item', 'A cobrança foi indevida.', { tag: 'Inferência', citations: [] }),
    ]);
    expect(sections.map((section) => section.title)).toEqual(['Questões', 'Afirmações']);
    expect(sections[1]?.entries).toEqual([
      { kind: 'item', text: 'O autor foi cobrado duas vezes.', tag: 'Alegação', citations: [1, 2] },
      { kind: 'item', text: 'A cobrança foi indevida.', tag: 'Inferência', citations: [] },
    ]);
  });

  it('o que vem antes de qualquer cabeçalho forma a primeira parte', () => {
    const sections = structureSections([
      block('paragraph', 'Resumo solto.'),
      block('heading', 'Cronologia'),
      block('item', '2021 — fato.'),
    ]);
    expect(sections.map((section) => section.title)).toEqual([STRUCTURE_LEAD_TITLE, 'Cronologia']);
  });

  it('cabeçalho sem itens embaixo não vira parte, e entrada vazia dá lista vazia', () => {
    expect(structureSections([block('heading', 'Contradições')])).toEqual([]);
    expect(structureSections([])).toEqual([]);
  });
});

describe('structureSize', () => {
  it('conta os itens, não os cabeçalhos', () => {
    const sections = structureSections([
      block('heading', 'A'),
      block('item', '1'),
      block('item', '2'),
      block('heading', 'B'),
      block('item', '3'),
    ]);
    expect(structureSize(sections)).toBe(3);
  });
});

// ---- E2: numeração, selo, marcas e resumo, a partir da revisão da análise (dados sintéticos) ----

const fact = (
  id: string,
  rowId: string,
  text: string,
  extra: Partial<StructureReviewItem> = {},
): StructureReviewItem => ({
  id,
  kind: 'FACT',
  text,
  originIds: [rowId, `claim-${rowId}`],
  references: [],
  ...extra,
});
const proof = (id: string, rowId: string, sourceId: string, start: number, quote: string): StructureReviewItem => ({
  id,
  kind: 'EVIDENCE',
  text: quote,
  originIds: [rowId, `claim-${rowId}`],
  references: [{ sourceId, start, quote }],
});
const analysisBlocks = (): PresentedBlock[] => [
  block('heading', 'Houve pagamento?'),
  block('item', 'O autor pagou o aluguel de março.', {
    tag: 'Alegação',
    citations: [1],
    origin: { kind: 'FACT', originId: 'r1' },
  }),
  block('item', 'Trecho relacionado: “recibo de março”', {
    citations: [1],
    origin: { kind: 'EVIDENCE', originId: 'r1', ref: { sourceId: 'd1', start: 10 } },
  }),
  block('heading', 'Houve atraso?'),
  block('item', 'O réu atrasou a entrega das chaves.', {
    tag: 'Alegação',
    citations: [2],
    origin: { kind: 'FACT', originId: 'r2' },
  }),
  block('item', 'Trecho contrário ao relato: “chaves entregues no prazo”', {
    citations: [2],
    origin: { kind: 'EVIDENCE', originId: 'r2', ref: { sourceId: 'd2', start: 0 } },
  }),
];
const analysisReview = (extra: Partial<StructureReview> = {}): StructureReview => ({
  items: [
    fact('a'.repeat(64), 'r1', 'O autor pagou o aluguel de março.'),
    proof('b'.repeat(64), 'r1', 'd1', 10, 'recibo de março'),
    fact('c'.repeat(64), 'r2', 'O réu atrasou a entrega das chaves.'),
    proof('d'.repeat(64), 'r2', 'd2', 0, 'chaves entregues no prazo'),
  ],
  decisions: {},
  ...extra,
});
const entries = (sections: StructureSection[]) => sections.flatMap((section) => section.entries);

describe('structureSections com a revisão (E2)', () => {
  it('numera fatos e provas como o agente (F1, P1…), na ordem da revisão, igual entre duas renderizações', () => {
    const first = structureSections(analysisBlocks(), analysisReview());
    const second = structureSections(analysisBlocks(), analysisReview());
    expect(entries(first).map((entry) => entry.label)).toEqual(['F1', 'P1', 'F2', 'P2']);
    expect(entries(second).map((entry) => entry.label)).toEqual(entries(first).map((entry) => entry.label));
  });

  it('sem revisão, nada muda: sem rótulo, sem selo, sem marca', () => {
    const plain = entries(structureSections(analysisBlocks()));
    expect(plain.every((entry) => !entry.label && !entry.userAdded && !entry.change)).toBe(true);
    expect(plain[0]).toEqual({
      kind: 'item',
      text: 'O autor pagou o aluguel de março.',
      tag: 'Alegação',
      citations: [1],
    });
  });

  it('item informado pelo usuário aparece com o selo, a frase dele e nenhuma fonte, numerado depois dos fatos', () => {
    const review = analysisReview();
    review.items = [
      ...review.items,
      fact('e'.repeat(64), '', 'O cliente pagou abril em dinheiro.', {
        originIds: [],
        userAdded: { frase: 'o cliente também pagou abril em dinheiro', addedAt: '2026-11-22T10:00:00.000Z' },
      }),
    ];
    const sections = structureSections(analysisBlocks(), review);
    const added = sections.find((section) => section.title === USER_ADDED_TITLE);
    expect(added?.entries).toEqual([
      {
        kind: 'item',
        text: 'O cliente pagou abril em dinheiro.',
        citations: [],
        label: 'F3',
        userAdded: true,
        seal: USER_ADDED_SEAL,
        frase: 'o cliente também pagou abril em dinheiro',
      },
    ]);
    expect(USER_ADDED_SEAL).toBe('informado por você, a confirmar');
  });

  it('item alterado mostra o texto corrigido e o anterior; item removido fica marcado', () => {
    const review = analysisReview({
      decisions: {
        ['a'.repeat(64)]: { action: 'ADOPT', text: 'O autor pagou o aluguel de março e de abril.' },
        ['d'.repeat(64)]: { action: 'DISCARD', text: 'chaves entregues no prazo' },
        ['c'.repeat(64)]: { action: 'ADOPT', text: 'O réu atrasou a entrega das chaves.' },
      },
    });
    const [f1, p1, f2, p2] = entries(structureSections(analysisBlocks(), review));
    expect(f1).toMatchObject({
      label: 'F1',
      text: 'O autor pagou o aluguel de março e de abril.',
      change: { kind: 'corrected', before: 'O autor pagou o aluguel de março.' },
    });
    expect(p1?.change).toBeUndefined();
    // Confirmado sem mudar o texto não é correção.
    expect(f2?.change).toBeUndefined();
    expect(p2).toMatchObject({ label: 'P2', change: { kind: 'removed' } });
  });
});

describe('structureSummary e structureQuestions (E2)', () => {
  const adjustment = (
    recordedAt: string,
    extra: Partial<StructureAdjustmentRecord> = {},
  ): StructureAdjustmentRecord => ({
    executionId: `exec-${recordedAt}`,
    applied: 1,
    questions: [],
    recordedAt,
    ...extra,
  });

  it('o resumo do caso vem do ajuste mais recente que trouxe resumo', () => {
    const review = analysisReview({
      adjustments: {
        recent: adjustment('2026-11-22T10:00:00.000Z', { caseSummary: 'Locação com pagamento discutido.' }),
        old: adjustment('2026-11-20T10:00:00.000Z', { caseSummary: 'Resumo antigo.' }),
      },
    });
    expect(structureSummary(review)).toBe('Locação com pagamento discutido.');
    expect(structureSummary(analysisReview())).toBeUndefined();
    expect(structureSummary(undefined)).toBeUndefined();
  });

  it('as perguntas do ajuste mais recente viram frases simples, com o número do item e nenhum código', () => {
    const review = analysisReview({
      adjustments: {
        old: adjustment('2026-11-20T10:00:00.000Z', { questions: [{ reason: 'LIMITE_DE_ITENS' }] }),
        recent: adjustment('2026-11-22T10:00:00.000Z', {
          questions: [
            { itemId: 'a'.repeat(64), reason: 'DATA_SO_PARA_LINHA_DO_TEMPO' },
            { itemId: 'f'.repeat(64), reason: 'ITEM_DESCONHECIDO' },
            { texto: 'O réu mudou de endereço.', reason: 'FRASE_NAO_ENCONTRADA' },
          ],
        }),
      },
    });
    const lines = structureQuestions(review);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('F1');
    expect(lines[2]).toContain('O réu mudou de endereço.');
    for (const line of lines) {
      expect(line).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(line).not.toMatch(/[a-f0-9]{64}/);
    }
    expect(structureQuestions(analysisReview())).toEqual([]);
    expect(structureQuestions(undefined)).toEqual([]);
  });

  it('todo motivo de pergunta tem frase em português', () => {
    for (const reason of STRUCTURE_QUESTION_REASONS) {
      const [line] = structureQuestions(
        analysisReview({ adjustments: { x: adjustment('2026-11-22T10:00:00.000Z', { questions: [{ reason }] }) } }),
      );
      expect(line, reason).toBeTruthy();
      expect(line).not.toContain(reason);
    }
  });
});
