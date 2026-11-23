import { describe, expect, it } from 'vitest';
import {
  StructureCommandSchema,
  StructureCommandsSchema,
  resolveStructureCommands,
  structureItemsSource,
} from './structure-commands.js';
import type { EvidenceReviewItem } from './evidence-review.js';

const idA = 'a'.repeat(64);
const idB = 'b'.repeat(64);
const idC = 'c'.repeat(64);
const idX = 'd'.repeat(64);

function item(id: string, kind: EvidenceReviewItem['kind'], text = 'Texto sintético do item.'): EvidenceReviewItem {
  return {
    id,
    kind,
    text,
    classification: kind === 'TIMELINE' ? 'EXTRACTED' : 'ALLEGATION',
    sources: [],
    references: [],
    originIds: [],
    blockedReasons: [],
    ...(kind === 'TIMELINE' ? { eventDate: '2026-01-10' } : {}),
  } as EvidenceReviewItem;
}

const items = [item(idA, 'FACT'), item(idB, 'TIMELINE'), item(idC, 'EVIDENCE')];
const run = (commands: unknown[], decidedIds: string[] = []) =>
  resolveStructureCommands({
    items,
    decidedIds: new Set(decidedIds),
    commands: commands.map((c) => StructureCommandSchema.parse(c)),
  });

describe('StructureCommandSchema', () => {
  it('rejeita ALTERAR sem texto nem dataEvento', () => {
    expect(StructureCommandSchema.safeParse({ op: 'ALTERAR', itemId: idA }).success).toBe(false);
  });
  it('limita a 20 comandos', () => {
    const c = { op: 'REMOVER', itemId: idA };
    expect(StructureCommandsSchema.safeParse(Array(20).fill(c)).success).toBe(true);
    expect(StructureCommandsSchema.safeParse(Array(21).fill(c)).success).toBe(false);
  });
});

describe('resolveStructureCommands', () => {
  it('ALTERAR com texto vira ADOPT com text', () => {
    const r = run([{ op: 'ALTERAR', itemId: idA, texto: 'Novo texto do fato.' }]);
    expect(r.decisions).toEqual([{ itemId: idA, action: 'ADOPT', text: 'Novo texto do fato.' }]);
    expect(r.questions).toEqual([]);
  });
  it('ALTERAR com dataEvento em TIMELINE vira ADOPT com eventDate', () => {
    const r = run([{ op: 'ALTERAR', itemId: idB, dataEvento: '2026-02-01' }]);
    expect(r.decisions).toEqual([{ itemId: idB, action: 'ADOPT', eventDate: '2026-02-01' }]);
  });
  it('REMOVER vira DISCARD', () => {
    expect(run([{ op: 'REMOVER', itemId: idC }]).decisions).toEqual([{ itemId: idC, action: 'DISCARD' }]);
  });
  it('ACRESCENTAR vai para added', () => {
    const r = run([{ op: 'ACRESCENTAR', texto: 'Fato novo.', frase: 'trecho do relato' }]);
    expect(r.added).toEqual([{ texto: 'Fato novo.', frase: 'trecho do relato' }]);
    expect(r.decisions).toEqual([]);
  });
  it('itemId desconhecido gera ITEM_DESCONHECIDO', () => {
    const r = run([{ op: 'REMOVER', itemId: idX }]);
    expect(r.decisions).toEqual([]);
    expect(r.questions).toEqual([{ itemId: idX, reason: 'ITEM_DESCONHECIDO' }]);
  });
  it('item já decidido gera JA_DECIDIDO', () => {
    const r = run([{ op: 'REMOVER', itemId: idA }], [idA]);
    expect(r.decisions).toEqual([]);
    expect(r.questions).toEqual([{ itemId: idA, reason: 'JA_DECIDIDO' }]);
  });
  it('dataEvento em FACT gera DATA_SO_PARA_LINHA_DO_TEMPO', () => {
    const r = run([{ op: 'ALTERAR', itemId: idA, dataEvento: '2026-02-01' }]);
    expect(r.decisions).toEqual([]);
    expect(r.questions).toEqual([{ itemId: idA, reason: 'DATA_SO_PARA_LINHA_DO_TEMPO' }]);
  });
  it('ALTERAR que não muda nada gera SEM_EFEITO', () => {
    const r = run([{ op: 'ALTERAR', itemId: idA, texto: 'Texto sintético do item.' }]);
    expect(r.decisions).toEqual([]);
    expect(r.questions).toEqual([{ itemId: idA, reason: 'SEM_EFEITO' }]);
  });
  it('dois comandos para o mesmo item mantêm o último', () => {
    const r = run([
      { op: 'ALTERAR', itemId: idA, texto: 'Primeira versão.' },
      { op: 'REMOVER', itemId: idA },
    ]);
    expect(r.decisions).toEqual([{ itemId: idA, action: 'DISCARD' }]);
  });
});

describe('structureItemsSource: limite de tamanho', () => {
  const many = (count: number, size: number) =>
    Array.from({ length: count }, (_, i) =>
      item(i.toString(16).padStart(64, '0'), 'FACT', `Fato sintético número ${i}. ${'x'.repeat(size)}`),
    );

  it('análise grande demais para a lista vira TASK_CONTEXT_LIMIT, não erro de validação cru', () => {
    // ~160 itens longos passam de 100.000 caracteres.
    expect(() => structureItemsSource('delivery:grande', many(160, 700), new Set())).toThrow('TASK_CONTEXT_LIMIT');
    // Mais de 1000 itens, mesmo curtos.
    expect(() => structureItemsSource('delivery:muitos', many(1001, 1), new Set())).toThrow('TASK_CONTEXT_LIMIT');
  });

  it('análise dentro do limite continua listada', () => {
    const source = structureItemsSource('delivery:normal', many(20, 50), new Set());
    expect(source.text.length).toBeLessThanOrEqual(100000);
    expect(JSON.parse(source.text).items).toHaveLength(20);
  });
});
