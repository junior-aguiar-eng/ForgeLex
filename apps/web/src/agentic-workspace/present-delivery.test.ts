import { describe, expect, it } from 'vitest';
import type { Delivery } from './execution-model';
import { presentDelivery, deliveryPlainText } from './present-delivery';
import { readFileSync } from 'node:fs';

const deskReview = JSON.parse(
  readFileSync('tests/fixtures/editorial/desk-review.json', 'utf8'),
) as Delivery['delivery'];

describe('revisão na conversa com a entrega sintética de 06/11', () => {
  it('apresenta os achados uma vez sem planejamento nem requisitos operacionais', () => {
    const before = JSON.stringify(deskReview);
    const view = presentDelivery(deskReview);
    const text = deliveryPlainText(view);
    expect(view.blocks).toHaveLength(3);
    for (const finding of deskReview.findings.slice(0, 3)) expect(text).toContain(finding.statement);
    expect(text).not.toMatch(/EDITORIAL:|DRAFT|Questões|Afirmações|review-source|salvar versão/);
    expect(view.blocks.every((block) => block.citations.length === 1)).toBe(true);
    expect(view.sources).toHaveLength(2);
    expect(JSON.stringify(deskReview)).toBe(before);
  });

  it('preserva as afirmações e os requisitos de revisões com fatos do caso ou escopo indefinido', () => {
    for (const variant of ['case', 'procedural', 'legacy']) {
      const d = structuredClone(deskReview);
      if (variant === 'case') {
        d.sources.push({
          id: 'fact',
          kind: 'CASE_FACT',
          approvedItem: { text: 'Fato aprovado', status: 'APPROVED', sources: [] },
        });
        d.claims[0].sourceIds = ['fact'];
      } else if (variant === 'procedural') {
        d.requirements[0].kind = 'PROCEDURAL';
      } else {
        d.requirements = [];
      }
      const view = presentDelivery(d);
      expect(view.blocks.some((block) => block.text === d.claims[0].statement && block.citations.length > 0)).toBe(
        true,
      );
      if (d.requirements.length)
        expect(view.blocks.some((block) => block.text === d.requirements[0].statement)).toBe(true);
    }
  });

  it('mantém divergências com outros valores, fontes ou mais de uma ocorrência', () => {
    for (const change of ['values', 'source', 'multiple', 'blocking', 'wrong-sum']) {
      const d = structuredClone(deskReview);
      if (change === 'values') d.findings[1].statement = d.findings[1].statement.replaceAll('200,00', '250,00');
      if (change === 'source') d.findings[1].sourceIds = ['other'];
      if (change === 'multiple') d.findings.push({ ...d.findings[3], id: 'another-location' });
      if (change === 'blocking') d.findings[3].severity = 'BLOCKING';
      if (change === 'wrong-sum')
        d.findings[1].statement = d.findings[1].statement.replace('somam R$ 300,00', 'somam R$ 200,00');
      expect(presentDelivery(d).blocks.some((block) => block.text === d.findings[3].statement)).toBe(true);
    }
  });

  it('não confunde ausência de achados com validação jurídica e mantém limitações', () => {
    const d: Delivery['delivery'] = { ...deskReview, findings: [] };
    const text = deliveryPlainText(presentDelivery(d));
    expect(text).toContain('Nenhuma alteração foi sugerida');
    expect(text).not.toMatch(/EDITORIAL:|DRAFT|review-source/);
    d.findings = [
      {
        id: 'limit',
        code: 'SOURCE_UNAVAILABLE',
        statement: 'Não foi possível ler o anexo.',
        severity: 'BLOCKING',
        sourceIds: [],
      },
    ];
    const limited = deliveryPlainText(presentDelivery(d));
    expect(limited).toContain('Não foi possível ler o anexo.');
    expect(limited).not.toContain('Nenhuma alteração');
  });

  it('preserva requisito não verificado sem duplicá-lo quando já consta dos achados', () => {
    const d: Delivery['delivery'] = {
      ...deskReview,
      findings: [],
      requirements: [
        {
          id: 'gap',
          kind: 'EDITORIAL',
          statement: 'A referência ao anexo não pôde ser conferida.',
          verified: false,
          sourceIds: ['review-source-2'],
        },
      ],
    };
    const text = deliveryPlainText(presentDelivery(d));
    expect(text).toContain('A referência ao anexo não pôde ser conferida.');
    expect(text).not.toContain('Nenhuma alteração');
    d.findings.push({
      id: 'gap-finding',
      code: 'EDITORIAL_REQUIREMENT_UNVERIFIED',
      statement: d.requirements[0].statement,
      sourceIds: ['review-source-2'],
      severity: 'WARNING',
    });
    const single = presentDelivery(d);
    expect(single.blocks).toHaveLength(1);
    expect(single.blocks[0].citations).toHaveLength(1);
    d.requirements[0].sourceIds = ['review-source-1'];
    expect(presentDelivery(d).blocks[0].citations).toHaveLength(2);
  });
});

it('historical D01 already presents five issues without exposing scoped identifiers', () => {
  const run = JSON.parse(
    readFileSync('docs/architecture/evidence/2026-11-03-verifier-v8/real/D01-analyze-candidate.json', 'utf8'),
  );
  const view = presentDelivery(run.delivery),
    text = deliveryPlainText(view);
  expect(run.delivery.issues).toHaveLength(5);
  for (const issue of run.delivery.issues) expect(text).toContain(issue.statement);
  expect(text).not.toMatch(/0623a0beb6|fe5a1143d1/);
});
it('reviewed output separates corrections, questions, document fitness and integrity from technical audit', () => {
  const d = base({
    action: 'review_text',
    claims: [
      { id: 'opaque:c1', classification: 'DOCUMENT_RECORD', statement: 'Pagamento: não informado.', sourceIds: ['a'] },
    ],
    requirements: [
      {
        id: 'opaque:r1',
        kind: 'EDITORIAL',
        statement: 'Retirar conclusão de quitação.',
        verified: false,
        sourceIds: ['a'],
      },
    ] as any,
    review: {
      version: 1,
      questions: [{ prompt: 'Qual é a pretensão?', reason: 'A finalidade não foi informada.', sourceIds: ['a'] }],
      documentAssessments: [
        {
          sourceId: 'a',
          aspects: [{ aspect: 'PARTIES', status: 'NOT_PROVIDED' }],
          conclusion: 'O recorte não vincula o crédito ao devedor.',
        },
      ],
      integrityAlerts: [
        { kind: 'EMBEDDED_INSTRUCTION', statement: 'Conferir a origem do documento.', sourceIds: ['a'] },
      ],
      technicalFindings: [{ statement: 'CAPABILITY_UNAVAILABLE secret technical' }],
    } as any,
  });
  const view = presentDelivery(d),
    text = deliveryPlainText(view);
  for (const title of [
    'Correções propostas',
    'Perguntas e lacunas',
    'Aptidão dos documentos',
    'Integridade dos documentos',
  ])
    expect(text).toContain(title);
  expect(text).toContain('Registro documental');
  expect(text).not.toMatch(/opaque:|CAPABILITY_UNAVAILABLE|Requisito de forma não verificado/);
  expect(text.split('Retirar conclusão de quitação.')).toHaveLength(2);
  expect(view.pending).not.toContain('Requisito não verificado: Retirar conclusão de quitação.');
});

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
