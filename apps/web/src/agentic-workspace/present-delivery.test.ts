import { describe, expect, it } from 'vitest';
import type { Delivery } from './execution-model';
import { presentDelivery } from './present-delivery';

const source = (id: string, kind = 'DOCUMENT') => ({ id, kind, contentHash: 'hash-' + id, versionId: 'v-' + id });
const base = (parts: Partial<Delivery['delivery']>): Delivery['delivery'] => ({
  action: 'create_document',
  status: 'LIMITED',
  humanReviewRequired: true,
  legalAssessment: 'NOT_EVALUATED',
  issues: [],
  claims: [],
  requirements: [],
  findings: [],
  sources: [source('a'), source('b', 'NORM'), source('c', 'AUTHORITY')],
  ...parts,
});
const finding = (code: string, statement = 'x', id = `${code}:1`) => ({
  id,
  code,
  statement,
  severity: 'BLOCKING',
  sourceIds: [],
});

describe('apresentação da entrega', () => {
  it('numera as fontes pela ordem de citação e lista as não citadas ao final', () => {
    const view = presentDelivery(
      base({
        document: {
          title: 'Requerimento',
          documentType: 'x',
          sections: [
            { title: 'Fatos', content: 'Texto 1', sourceIds: ['b', 'a'] },
            { title: 'Pedidos', content: 'Texto 2', sourceIds: ['a', 'desconhecida'] },
          ],
        },
      }),
    );
    expect(view.title).toBe('Requerimento');
    expect(view.isDocument).toBe(true);
    expect(view.blocks.filter((b) => b.kind === 'paragraph').map((b) => b.citations)).toEqual([[1, 2], [2]]);
    expect(view.sources.map((s) => [s.n, s.id, s.label])).toEqual([
      [1, 'b', 'Norma'],
      [2, 'a', 'Documento do caso'],
      [3, 'c', 'Jurisprudência'],
    ]);
  });
  it('apresenta análise com marcadores de afirmação e sem códigos internos', () => {
    const view = presentDelivery(
      base({
        action: 'analyze_documents',
        issues: [{ id: 'i', statement: 'Qual o prazo?', sourceIds: ['a'] }],
        claims: [{ id: 'c1', statement: 'O prazo é de 30 dias', classification: 'ALLEGATION', sourceIds: ['a'] }],
      }),
    );
    expect(view.title).toBe('Análise dos documentos');
    expect(view.blocks.map((b) => [b.kind, b.text, b.tag, b.citations])).toEqual([
      ['heading', 'Questões', undefined, []],
      ['item', 'Qual o prazo?', undefined, [1]],
      ['heading', 'Afirmações', undefined, []],
      ['item', 'O prazo é de 30 dias', 'Alegação', [1]],
    ]);
  });
  it('agrupa seções sem fonte, remove duplicatas e mantém apontamentos do próprio modelo', () => {
    const view = presentDelivery(
      base({
        findings: [
          finding('UNSUPPORTED_SECTION', 'Endereçamento'),
          finding('UNSUPPORTED_SECTION', 'Fundamentos', 'UNSUPPORTED_SECTION:2'),
          finding('PROCEDURAL_REQUIREMENTS_NOT_EVALUATED'),
          finding('PROCEDURAL_REQUIREMENTS_NOT_EVALUATED', 'outra', 'PROCEDURAL_REQUIREMENTS_NOT_EVALUATED:2'),
          finding('PRAZO_VENCIDO', 'O prazo para recorrer já terminou'),
        ],
        requirements: [
          { id: 'r', statement: 'Procuração com poderes especiais', verified: false, sourceIds: [] },
          { id: 'ok', statement: 'Já verificado', verified: true, sourceIds: [] },
        ],
      }),
    );
    expect(view.pending).toEqual([
      'Não avaliei os requisitos processuais; o texto é preliminar.',
      'O prazo para recorrer já terminou',
      'As seções “Endereçamento”, “Fundamentos” não têm fonte indicada.',
      'Requisito não verificado: Procuração com poderes especiais',
    ]);
  });
  it('lê o código no identificador quando o campo não vem na resposta', () => {
    const view = presentDelivery(
      base({ findings: [{ ...finding('X'), code: undefined, id: 'SEARCH_NO_RESULTS:abc' }] }),
    );
    expect(view.pending[0]).toContain('A pesquisa não retornou resultados');
  });
  it('nunca expõe hash, versão ou identificadores das fontes no texto apresentado', () => {
    const view = presentDelivery(
      base({
        document: { title: 'T', documentType: 'x', sections: [{ title: 'S', content: 'C', sourceIds: ['a'] }] },
      }),
    );
    const visible = JSON.stringify({
      blocks: view.blocks,
      pending: view.pending,
      labels: view.sources.map((s) => s.label),
    });
    expect(visible).not.toMatch(/hash-|v-a/);
  });
});
