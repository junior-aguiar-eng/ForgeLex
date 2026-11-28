import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import type { AgenticTaskDelivery } from '@forgelex/domain';
import { CASE_HISTORY_SOURCE_PREFIX, caseHistorySource, type CaseHistoryEntry } from './case-history-source.js';

const delivery = (overrides: Partial<AgenticTaskDelivery> = {}): AgenticTaskDelivery =>
  ({
    action: 'analyze_documents',
    contextId: 'c',
    contextRevision: 1,
    status: 'CANDIDATE',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    issues: [{ id: 'i1', statement: 'Houve contratação válida?', sourceIds: [] }],
    claims: [{ id: 'a1', classification: 'ALLEGATION', statement: 'A cliente nega o contrato.', sourceIds: [] }],
    requirements: [],
    findings: [],
    sources: [],
    ...overrides,
  }) as AgenticTaskDelivery;
const entry = (id: string, d = delivery()): CaseHistoryEntry => ({
  conversationId: id,
  objective: `Pedido ${id}`,
  delivery: d,
});

it('sem conversas anteriores não há fonte', () => {
  expect(caseHistorySource('m1', [])).toBeUndefined();
});

it('leva pedido, questões, afirmações e peça das conversas anteriores, avisando que é resultado de IA', () => {
  const piece = delivery({
    action: 'create_document',
    document: { title: 'Petição inicial', sections: [{ title: 'Dos fatos', content: 'A autora é aposentada.' }] },
  } as Partial<AgenticTaskDelivery>);
  const source = caseHistorySource('m1', [entry('b', piece), entry('a')])!;
  expect(source.kind).toBe('PREVIOUS_DELIVERY');
  expect(source.id.startsWith(CASE_HISTORY_SOURCE_PREFIX)).toBe(true);
  expect(source.contentHash).toBe(createHash('sha256').update(source.text).digest('hex'));
  const parsed = JSON.parse(source.text);
  expect(parsed.aviso).toContain('nunca como prova');
  expect(parsed.conversas[0]).toMatchObject({
    pedido: 'Pedido b',
    acao: 'create_document',
    peca: { titulo: 'Petição inicial' },
  });
  expect(parsed.conversas[0].peca.texto).toContain('A autora é aposentada.');
  expect(parsed.conversas[1]).toMatchObject({
    questoes: ['Houve contratação válida?'],
    afirmacoes: ['ALLEGATION: A cliente nega o contrato.'],
  });
});

it('histórico grande demais perde primeiro as conversas mais antigas, sem erro', () => {
  const long = delivery({
    action: 'create_document',
    document: { title: 'Peça', sections: [{ title: 'Texto', content: 'x'.repeat(15_000) }] },
  } as Partial<AgenticTaskDelivery>);
  const entries = Array.from({ length: 10 }, (_, index) => entry(`c${index}`, long));
  const parsed = JSON.parse(caseHistorySource('m1', entries)!.text);
  expect(parsed.omitidas).toBeGreaterThan(0);
  expect(parsed.conversas[0].pedido).toBe('Pedido c0');
  expect(parsed.conversas.length + parsed.omitidas).toBe(10);
});

it('estrutura e histórico do caso são fontes do servidor, fora da conferência do contexto do usuário', async () => {
  const { isServerAssembledSource } = await import('./commercial-runtime.js');
  for (const id of ['structure-context:delivery:x', 'structure:delivery:x', `${CASE_HISTORY_SOURCE_PREFIX}abc`])
    expect(isServerAssembledSource({ kind: 'PREVIOUS_DELIVERY', id })).toBe(true);
  expect(isServerAssembledSource({ kind: 'PREVIOUS_DELIVERY', id: 'delivery:abc' })).toBe(false);
  expect(isServerAssembledSource({ kind: 'USER_TEXT', id: `${CASE_HISTORY_SOURCE_PREFIX}abc` })).toBe(false);
  // Carregar o runtime comercial inteiro leva alguns segundos numa máquina lenta.
}, 30_000);
