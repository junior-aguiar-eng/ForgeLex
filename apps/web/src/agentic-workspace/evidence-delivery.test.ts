import { expect, it } from 'vitest';
import { presentDelivery, deliveryPlainText } from './present-delivery';

it.each([false, true])(
  'keeps uncovered issues and claims visible and copied, including an empty matrix: %s',
  (empty) => {
    const delivery: any = {
      action: 'analyze_evidence',
      sources: [{ id: 'd', kind: 'DOCUMENT' }],
      requirements: [],
      findings: [],
      issues: [
        { id: 'i', statement: 'Questão coberta', sourceIds: ['d'] },
        { id: 'late-i', statement: 'Questão descoberta', sourceIds: ['d'] },
      ],
      claims: [
        { id: 'c', statement: 'Afirmação coberta', classification: 'ALLEGATION', sourceIds: ['d'] },
        { id: 'late-c', statement: 'Afirmação posterior', classification: 'INFERENCE', sourceIds: ['d'] },
      ],
      evidenceMatrix: {
        rows: empty
          ? []
          : [{ id: 'r', claimId: 'c', issueIds: ['i'], references: [], gaps: [], coverage: 'UNSUPPORTED' }],
        chronology: [],
        contradictions: [],
      },
    };
    const view = presentDelivery(delivery),
      copied = deliveryPlainText(view);
    for (const phrase of ['Questão descoberta', 'Afirmação posterior', 'Questão coberta', 'Afirmação coberta']) {
      expect(view.blocks.filter((b) => b.text === phrase)).toHaveLength(1);
      expect(copied).toContain(phrase);
    }
    expect(copied).not.toMatch(/matriz|cobertura|orquestração/i);
  },
);

it('presents evidence relations, exact quotes, uncertain chronology and contradictions with source citations', () => {
  const delivery: any = {
    action: 'analyze_evidence',
    issues: [{ id: 'i', statement: 'Pagamento?', sourceIds: ['d'] }],
    claims: [{ id: 'c', statement: 'Pagamento relatado', classification: 'ALLEGATION', sourceIds: ['d'] }],
    sources: [{ id: 'd', kind: 'DOCUMENT' }],
    findings: [],
    requirements: [],
    evidenceMatrix: {
      assessment: 'MODEL_PROPOSAL_NOT_FACT_CONFIRMATION',
      rows: [
        {
          id: 'r',
          claimId: 'c',
          issueIds: ['i'],
          coverage: 'DOCUMENT_LINKED',
          gaps: ['Falta o original'],
          references: [{ sourceId: 'd', quote: 'Pago', start: 0, relation: 'SUPPORTS', quoteStatus: 'MATCHED' }],
        },
      ],
      chronology: [
        {
          id: 'e',
          description: 'Evento relatado',
          claimIds: ['c'],
          dateText: 'em outubro',
          sortDate: null,
          dateStatus: 'UNCERTAIN',
          reference: { sourceId: 'd', quote: 'em outubro', quoteStatus: 'MATCHED' },
        },
      ],
      contradictions: [{ id: 'x', claimIds: ['c'], explanation: 'Divergência entre relatos' }],
    },
  };
  const view = presentDelivery(delivery);
  const plain = deliveryPlainText(view);
  expect(view.title).toBe('Análise de fatos e provas');
  for (const text of [
    'Pagamento?',
    'Pago',
    'Trecho relacionado',
    'Falta o original',
    'Data a confirmar: em outubro',
    'Divergência entre relatos',
  ])
    expect(plain).toContain(text);
  expect(view.blocks.find((b) => b.text.includes('Pago'))?.citations).toEqual([1]);
  expect(plain).toContain('Alegação: Pagamento relatado');
  expect(plain).not.toMatch(/matriz|cobertura|MODEL_PROPOSAL|MATCHED|DOCUMENT_LINKED|hash|orquestração/i);
});

it('mantém o aviso sobre trecho não conferido sem exibir o estado interno', () => {
  const delivery: any = {
    action: 'analyze_evidence',
    sources: [{ id: 'd', kind: 'DOCUMENT' }],
    requirements: [],
    findings: [],
    issues: [],
    claims: [{ id: 'c', statement: 'Relato da parte', classification: 'ALLEGATION', sourceIds: ['d'] }],
    evidenceMatrix: {
      rows: [
        {
          claimId: 'c',
          issueIds: [],
          coverage: 'INVALID_REFERENCE',
          gaps: ['Falta o recibo'],
          references: [{ sourceId: 'd', quote: 'Recebido', relation: 'CONTRADICTS', quoteStatus: 'MISMATCH' }],
        },
      ],
      chronology: [],
      contradictions: [],
    },
  };
  const plain = deliveryPlainText(presentDelivery(delivery));
  expect(plain).toContain('Trecho contrário ao relato: “Recebido”');
  expect(plain).toContain('Não foi possível conferir este trecho na fonte.');
  expect(plain).toContain('Falta o recibo');
  expect(plain).not.toMatch(/INVALID_REFERENCE|MISMATCH|matriz/i);
});
