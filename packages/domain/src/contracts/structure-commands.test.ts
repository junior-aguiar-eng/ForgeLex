import { describe, expect, it } from 'vitest';
import {
  StructureCommandSchema,
  StructureCommandsSchema,
  resolveStructureCommands,
  structureItemsSource,
  structureContextSource,
  readStructureContext,
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

describe('structureContextSource (E3)', () => {
  const many = (count: number, size: number) =>
    Array.from({ length: count }, (_, i) =>
      item(i.toString(16).padStart(64, '0'), 'FACT', `Fato sintético número ${i}. ${'x'.repeat(size)}`),
    );
  const decide = (entries: [string, 'ADOPT' | 'DISCARD'][]) => new Map(entries);

  it('sem decisão vira A_CONFIRMAR, ADOPT vira CONFIRMADO e DISCARD não aparece', () => {
    const source = structureContextSource(
      'delivery:x',
      [item(idA, 'FACT'), item(idB, 'FACT'), item(idC, 'FACT')],
      decide([
        [idA, 'ADOPT'],
        [idC, 'DISCARD'],
      ]),
      'Resumo sintético do caso.',
    )!;
    expect(source.id).toBe('structure-context:delivery:x');
    expect(source.kind).toBe('PREVIOUS_DELIVERY');
    const body = JSON.parse(source.text);
    expect(body.summary).toBe('Resumo sintético do caso.');
    expect(body.items.map((i: { id: string; state: string }) => [i.id, i.state])).toEqual([
      [idA, 'CONFIRMADO'],
      [idB, 'A_CONFIRMAR'],
    ]);
    expect(body.items[0]).toMatchObject({ label: 'F1', kind: 'FACT', classification: 'ALLEGATION' });
  });

  it('item acrescentado pelo usuário leva userAdded e fica a confirmar', () => {
    const added = { ...item(idA, 'FACT'), userAdded: true as const };
    const body = JSON.parse(structureContextSource('d', [added], new Map())!.text);
    expect(body.items[0]).toMatchObject({ state: 'A_CONFIRMAR', userAdded: true });
  });

  it('estrutura grande: cabe, mantém resumo e confirmados primeiro e diz quantos itens ficaram de fora', () => {
    const list = many(160, 700);
    const decisions = decide([[list[159]!.id, 'ADOPT']]);
    const source = structureContextSource('delivery:grande', list, decisions, 'Resumo.')!;
    expect(source.text.length).toBeLessThanOrEqual(100000);
    const body = JSON.parse(source.text);
    expect(body.summary).toBe('Resumo.');
    expect(body.omitted).toBeGreaterThan(0);
    expect(body.items.length + body.omitted).toBe(160);
    expect(body.items[0].id).toBe(list[159]!.id);
  });

  it('sem itens e sem resumo não há fonte', () => {
    expect(structureContextSource('d', [], new Map())).toBeUndefined();
    expect(structureContextSource('d', [item(idA, 'FACT')], decide([[idA, 'DISCARD']]))).toBeUndefined();
  });

  it('readStructureContext devolve só os A_CONFIRMAR e rejeita fonte adulterada ou duplicada', () => {
    const source = structureContextSource('d', [item(idA, 'FACT'), item(idB, 'FACT')], decide([[idA, 'ADOPT']]))!;
    expect([...readStructureContext([source])!.keys()]).toEqual([idB]);
    expect(readStructureContext([])).toBeUndefined();
    expect(() => readStructureContext([{ ...source, text: source.text.replace('Texto', 'Outro') }])).toThrow(
      'STRUCTURE_SOURCE_CONFLICT',
    );
    expect(() => readStructureContext([source, { ...source, id: source.id + '2' }])).toThrow(
      'STRUCTURE_SOURCE_CONFLICT',
    );
  });

  it('E4: as linhas de documento entram na fonte, antes dos itens, e a fonte lida continua válida', () => {
    const docs = ['Documento 1: Petição inicial; partes: Maria (autor)', 'Documento 2: contrato; lido em 3 partes'];
    const source = structureContextSource('case:m', [item(idA, 'FACT')], new Map(), 'Resumo.', docs)!;
    const body = JSON.parse(source.text);
    expect(body.documents).toEqual(docs);
    expect(Object.keys(body)).toEqual(['summary', 'documents', 'items']);
    expect([...readStructureContext([source])!.keys()]).toEqual([idA]);
  });

  it('E4: o corte por tamanho mantém as linhas de documento e o resumo', () => {
    const list = Array.from({ length: 160 }, (_, i) =>
      item(i.toString(16).padStart(64, '0'), 'FACT', `Fato sintético número ${i}. ${'x'.repeat(700)}`),
    );
    const source = structureContextSource('case:m', list, new Map(), 'Resumo.', ['Documento 1: processo'])!;
    const body = JSON.parse(source.text);
    expect(source.text.length).toBeLessThanOrEqual(100000);
    expect(body.documents).toEqual(['Documento 1: processo']);
    expect(body.summary).toBe('Resumo.');
    expect(body.omitted).toBeGreaterThan(0);
  });
});
