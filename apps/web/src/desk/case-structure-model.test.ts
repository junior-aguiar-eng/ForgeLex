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
  replacedCorrectionsNotice,
  structureQuestions,
  structureReadingLine,
  structureSections,
  structureSize,
  structureSummary,
  unifyStructures,
  type StructureInput,
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

describe('replacedCorrectionsNotice', () => {
  const added = (id: string): StructureReviewItem => ({
    id,
    kind: 'FACT',
    text: 'Fato informado pelo usuário.',
    originIds: [],
    references: [],
    userAdded: { frase: 'fato informado', addedAt: '2026-11-22T10:00:00.000Z' },
  });
  const record: StructureAdjustmentRecord = {
    executionId: 'x',
    applied: 2,
    questions: [],
    recordedAt: '2026-11-22T10:00:00.000Z',
  };

  it('avisa quando a análise anterior tinha correções feitas pela conversa', () => {
    const previous: StructureReview = {
      items: [added('a'.repeat(64)), added('b'.repeat(64))],
      decisions: { ['c'.repeat(64)]: { action: 'DISCARD', text: 'Item retirado.' } },
      adjustments: { cmd: record },
    };
    expect(replacedCorrectionsNotice(previous)).toBe(
      'Uma análise nova substituiu a anterior; 3 correções feitas pela conversa não foram reaplicadas. Diga de novo o que quiser manter.',
    );
    expect(
      replacedCorrectionsNotice({ items: [added('a'.repeat(64))], decisions: {}, adjustments: { cmd: record } }),
    ).toBe(
      'Uma análise nova substituiu a anterior; 1 correção feita pela conversa não foi reaplicada. Diga de novo o que quiser manter.',
    );
  });

  it('sem análise anterior, ou sem correção pela conversa nela, não há aviso', () => {
    expect(replacedCorrectionsNotice(undefined)).toBeUndefined();
    expect(
      replacedCorrectionsNotice({
        items: [],
        decisions: { ['c'.repeat(64)]: { action: 'DISCARD', text: 'Retirado no painel antigo.' } },
      }),
    ).toBeUndefined();
  });
});

describe('structureReadingLine (E3)', () => {
  const it0 = (id: string, kind: StructureReviewItem['kind']): StructureReviewItem => ({
    id: id.repeat(64),
    kind,
    text: 'Texto sintético.',
    originIds: [],
    references: [],
  });
  const decision = (action: 'ADOPT' | 'DISCARD') => ({ action, text: 'x' });
  it('conta fatos não retirados e itens ainda sem decisão, sem contar lacunas', () => {
    const review: StructureReview = {
      items: [it0('a', 'FACT'), it0('b', 'FACT'), it0('c', 'FACT'), it0('d', 'EVIDENCE'), it0('e', 'GAP')],
      decisions: { ['a'.repeat(64)]: decision('ADOPT'), ['c'.repeat(64)]: decision('DISCARD') },
    };
    expect(structureReadingLine(review)).toBe('Estrutura do caso: 2 fatos, 2 itens a confirmar');
  });
  it('tudo decidido vira "tudo conferido"; singular em fato e item', () => {
    expect(
      structureReadingLine({ items: [it0('a', 'FACT')], decisions: { ['a'.repeat(64)]: decision('ADOPT') } }),
    ).toBe('Estrutura do caso: 1 fato, tudo conferido');
    expect(structureReadingLine({ items: [it0('a', 'EVIDENCE')], decisions: {} })).toBe(
      'Estrutura do caso: 1 item a confirmar',
    );
  });
  it('sem itens, ou só com lacunas ou itens retirados, não há linha', () => {
    expect(structureReadingLine(undefined)).toBeUndefined();
    expect(structureReadingLine({ items: [], decisions: {} })).toBeUndefined();
    expect(structureReadingLine({ items: [it0('a', 'GAP')], decisions: {} })).toBeUndefined();
    expect(
      structureReadingLine({ items: [it0('a', 'FACT')], decisions: { ['a'.repeat(64)]: decision('DISCARD') } }),
    ).toBeUndefined();
  });
});

describe('unifyStructures (E4)', () => {
  const analysis = (n: number, extra: Record<string, unknown> = {}): StructureInput['delivery'] =>
    ({
      action: 'analyze_evidence',
      status: 'CANDIDATE',
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      issues: [{ id: `i${n}`, statement: `Questão ${n}?`, sourceIds: [`s${n}`] }],
      claims: [],
      requirements: [],
      findings: [],
      sources: [
        { id: `s${n}`, kind: 'DOCUMENT', documentId: `d${n}`, versionId: `v${n}`, contentHash: 'a'.repeat(64) },
      ],
      ...extra,
    }) as unknown as StructureInput['delivery'];
  const added = (id: string, text: string): StructureReviewItem => ({
    id: id.repeat(64),
    kind: 'FACT',
    text,
    originIds: [],
    references: [],
    userAdded: { frase: 'frase', addedAt: '2026-11-22T10:00:00.000Z' },
  });
  const input = (n: number, extra: Partial<StructureInput> = {}): StructureInput => ({
    delivery: analysis(n),
    updatedAt: `2026-11-2${n}T10:00:00.000Z`,
    ...extra,
  });

  it('com uma análise só o resultado é o de sempre: sem marca de origem', () => {
    const one = unifyStructures([input(1)]);
    expect(entries(one.sections).every((entry) => entry.origin === undefined)).toBe(true);
    expect(one.documents).toHaveLength(1);
    expect(one.sections[0]?.title).toBe('Questões');
  });

  it('soma as seções pelo título, numera F e P em sequência entre as análises e marca a origem', () => {
    const first = input(1, { review: { items: [added('a', 'Fato do primeiro.')], decisions: {} } });
    const second = input(2, { review: { items: [added('b', 'Fato do segundo.')], decisions: {} } });
    const unified = unifyStructures([first, second]);
    const questions = unified.sections.find((section) => section.title === 'Questões');
    expect(questions?.entries.map((entry) => entry.text)).toEqual(['Questão 1?', 'Questão 2?']);
    expect(questions?.entries.map((entry) => entry.origin)).toEqual(['Documento 1', 'Documento 2']);
    const informed = unified.sections.find((section) => section.title === USER_ADDED_TITLE);
    expect(informed?.entries.map((entry) => [entry.label, entry.text])).toEqual([
      ['F1', 'Fato do primeiro.'],
      ['F2', 'Fato do segundo.'],
    ]);
    expect(unified.sections.at(-1)?.title).toBe(USER_ADDED_TITLE);
  });

  it('renumera as fontes para não colidirem e ajusta as citações da segunda análise', () => {
    const unified = unifyStructures([input(1), input(2)]);
    expect(unified.sources.map((source) => source.n)).toEqual([1, 2]);
    const questions = unified.sections.find((section) => section.title === 'Questões');
    expect(questions?.entries.map((entry) => entry.citations)).toEqual([[1], [2]]);
  });

  it('trechos do mesmo PDF viram um documento só, com o tipo da peça, as partes e o total de páginas', () => {
    const profile = {
      pieceType: 'Petição inicial',
      pieceTypeCertainty: 'IDENTIFICADA',
      parties: [{ name: 'Maria', role: 'autor' }],
    };
    const part = (index: number, extra: Record<string, unknown>, from: number, to: number) =>
      input(index, {
        delivery: analysis(index, extra),
        documentKey: 'a1b2c3d4e5f6',
        attachment: { name: 'processo.pdf', part: { index, total: 2, pageFrom: from, pageTo: to } },
      });
    const unified = unifyStructures([
      part(1, { documentProfile: { pieceTypeCertainty: 'INCERTA', parties: [] } }, 1, 40),
      part(2, { documentProfile: profile }, 41, 80),
    ]);
    expect(unified.documents).toHaveLength(1);
    expect(unified.documents[0]).toMatchObject({
      title: 'Petição inicial',
      pieceType: 'Petição inicial',
      parties: ['Maria (autor)'],
      parts: { count: 2, pages: 80 },
    });
    const origins = entries(unified.sections).map((entry) => entry.origin);
    expect(origins).toEqual(['Petição inicial, páginas 1 a 40', 'Petição inicial, páginas 41 a 80']);
  });

  it('sem perfil, o documento leva o nome do anexo; peça incerta é dita, não escondida', () => {
    const unified = unifyStructures([
      input(1, {
        attachment: { name: 'contrato.pdf' },
        delivery: analysis(1, { documentProfile: { pieceTypeCertainty: 'INCERTA', parties: [] } }),
      }),
    ]);
    expect(unified.documents[0]).toMatchObject({ title: 'contrato', pieceTypeUncertain: true });
  });

  it('o resumo e as perguntas são os do ajuste mais recente entre todas as análises', () => {
    const record = (recordedAt: string, caseSummary: string) => ({
      executionId: 'e',
      applied: 0,
      questions: [{ reason: 'ITEM_DESCONHECIDO' as const }],
      caseSummary,
      recordedAt,
    });
    const first = input(1, {
      review: {
        items: [],
        decisions: {},
        adjustments: { '11111111-1111-4111-8111-111111111111': record('2026-11-20T10:00:00.000Z', 'Resumo antigo.') },
      },
    });
    const second = input(2, {
      review: {
        items: [],
        decisions: {},
        adjustments: { '22222222-2222-4222-8222-222222222222': record('2026-11-22T10:00:00.000Z', 'Resumo novo.') },
      },
    });
    const unified = unifyStructures([first, second]);
    expect(unified.summary).toBe('Resumo novo.');
    expect(unified.pending.filter((line) => line.startsWith('Não identifiquei'))).toHaveLength(1);
  });
});
