import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TaskDocumentSchema } from '@forgelex/domain';
import {
  FinalEditorialContextSchema,
  FinalEditorialProposalSchema,
  validateFinalEditorialProposal,
} from './final-editor-contracts.js';

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const original = '  Olá 😀. O pedido esta condicionado.  ';
function fixture(content = original) {
  const document = {
    title: 'Minuta',
    documentType: 'Manifestação',
    sections: [{ title: 'Pedido', content, sourceIds: ['s'] }],
  };
  const envelope = {
    contractVersion: '1.0.0',
    contextId: 'ctx',
    contextRevision: 2,
    deliveryId: 'delivery:e',
    draftId: 'draft',
    versionId: 'v2',
    documentHash: hash(JSON.stringify(TaskDocumentSchema.parse(document))),
  };
  const context = {
    ...envelope,
    document,
    sources: [{ id: 's', kind: 'NORM', text: 'Norma sintética.', contentHash: hash('Norma sintética.') }],
    claims: [{ id: 'c', classification: 'INFERENCE', statement: 'Pedido condicionado.', sourceIds: ['s'] }],
    requirements: [
      { id: 'r', kind: 'PROCEDURAL', statement: 'Conferir cabimento.', sourceIds: ['s'], verified: false },
    ],
    findings: [{ id: 'f', code: 'LIMITATION', severity: 'BLOCKING', statement: 'Suporte parcial.', sourceIds: ['s'] }],
    supportAudit: [
      {
        claimId: 'c',
        sourceId: 's',
        sourceContentHash: hash('Norma sintética.'),
        quoteStatus: 'MATCHED',
        quote: 'Norma sintética.',
        modelAssessment: 'PARTIAL',
      },
    ],
  };
  const change = {
    id: 'edit',
    category: 'GRAMMAR',
    sectionIndex: 0,
    sectionHash: hash(content),
    start: content.indexOf('esta'),
    end: content.indexOf('esta') + 4,
    before: 'esta',
    after: 'está',
    reason: 'Acentuação.',
    sourceIds: ['s'],
  };
  const proposal = {
    ...envelope,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [change],
    substantiveSuggestions: [] as any[],
    limitations: ['Cabimento ainda não confirmado.'],
  };
  return { context, proposal, change };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

describe('contrato editorial local sem aplicação de alterações', () => {
  it('rejeita substitutos isolados sem confundir hashes UTF-8 de textos distintos', () => {
    expect(hash('\ud800')).toBe(hash('\ufffd'));
    for (const invalid of ['\ud800', '\ud801', '\udfff']) {
      const { context, proposal, change } = fixture();
      const document = {
        ...context.document,
        sections: [{ ...context.document.sections[0], content: `Texto ${invalid}` }],
      };
      expect(
        FinalEditorialContextSchema.safeParse({
          ...context,
          document,
          documentHash: hash(JSON.stringify(TaskDocumentSchema.parse(document))),
        }).success,
      ).toBe(false);
      expect(
        FinalEditorialContextSchema.safeParse({
          ...context,
          sources: [{ ...context.sources[0], text: invalid, contentHash: hash(invalid) }],
          supportAudit: [],
        }).success,
      ).toBe(false);
      for (const field of ['before', 'after']) {
        expect(
          FinalEditorialProposalSchema.safeParse({ ...proposal, changes: [{ ...change, [field]: invalid }] }).success,
        ).toBe(false);
      }
    }
    const { context } = fixture('Texto \ufffd');
    expect(FinalEditorialContextSchema.safeParse(context).success).toBe(true);
  });

  it('rejeita auditoria duplicada por par sem impedir fontes ou claims distintos', () => {
    const { context } = fixture();
    for (const modelAssessment of ['PARTIAL', 'SUPPORTED']) {
      expect(
        FinalEditorialContextSchema.safeParse({
          ...context,
          supportAudit: [...context.supportAudit, { ...context.supportAudit[0], modelAssessment }],
        }).success,
      ).toBe(false);
    }
    const source = { ...context.sources[0], id: 's2' };
    const claim = { ...context.claims[0], id: 'c2' };
    expect(
      FinalEditorialContextSchema.safeParse({
        ...context,
        sources: [...context.sources, source],
        claims: [{ ...context.claims[0], sourceIds: ['s', 's2'] }, claim],
        supportAudit: [
          ...context.supportAudit,
          { ...context.supportAudit[0], sourceId: 's2' },
          { ...context.supportAudit[0], claimId: 'c2' },
        ],
      }).success,
    ).toBe(true);
  });

  it('retorna falha de schema sem lançar em safeParse para documento inválido', () => {
    const { context } = fixture();
    for (const sections of [[], [{ ...context.document.sections[0], content: '   ' }]]) {
      expect(
        FinalEditorialContextSchema.safeParse({
          ...context,
          document: { ...context.document, sections },
        }).success,
      ).toBe(false);
    }
  });

  it('preserva conteúdo bruto e offsets UTF-16, sem mudar a minuta ou promover suporte', () => {
    const { context, proposal } = fixture();
    const before = structuredClone({ context, proposal });
    freeze(context);
    freeze(proposal);
    expect(FinalEditorialContextSchema.parse(context).document.sections[0].content).toBe(original);
    expect(validateFinalEditorialProposal(context, proposal)).toEqual(proposal);
    expect({ context, proposal }).toEqual(before);
    expect(context.supportAudit[0].modelAssessment).toBe('PARTIAL');
    expect(context.requirements[0].verified).toBe(false);
    expect(context.findings[0].severity).toBe('BLOCKING');
  });

  it.each(['contextId', 'contextRevision', 'deliveryId', 'draftId', 'versionId', 'documentHash'])(
    'rejeita proposta de outra identidade/revisão: %s',
    (field) => {
      const { context, proposal } = fixture();
      expect(() =>
        validateFinalEditorialProposal(context, {
          ...proposal,
          [field]: field === 'contextRevision' ? 1 : field === 'documentHash' ? 'f'.repeat(64) : 'outro',
        }),
      ).toThrow();
    },
  );

  it('rejeita contexto cujo hash não corresponde ao documento e checkpoint sem envelope', () => {
    const { context, proposal } = fixture();
    expect(() => validateFinalEditorialProposal({ ...context, documentHash: '0'.repeat(64) }, proposal)).toThrow();
    expect(FinalEditorialContextSchema.safeParse({ version: 8, outputs: { document: context.document } }).success).toBe(
      false,
    );
    const { deliveryId: _id, ...missing } = context;
    expect(FinalEditorialContextSchema.safeParse(missing).success).toBe(false);
  });

  it('não trunca limites nem aceita texto em branco', () => {
    const { context, proposal, change } = fixture();
    for (const field of ['before', 'after', 'reason'])
      expect(() =>
        validateFinalEditorialProposal(context, { ...proposal, changes: [{ ...change, [field]: 'x'.repeat(4001) }] }),
      ).toThrow();
    for (const after of ['', ' \n '])
      expect(FinalEditorialProposalSchema.safeParse({ ...proposal, changes: [{ ...change, after }] }).success).toBe(
        false,
      );
    expect(
      FinalEditorialProposalSchema.safeParse({
        ...proposal,
        changes: [{ ...change, after: 'x'.repeat(4000), reason: 'r'.repeat(4000) }],
      }).success,
    ).toBe(true);
  });

  it.each([
    { sectionIndex: 99 },
    { sectionIndex: -1 },
    { sectionHash: 'a'.repeat(64) },
    { start: -1 },
    { start: 1.5 },
    { start: 3, end: 3 },
    { start: 10, end: 2 },
    { end: 99999 },
    { before: 'esta ' },
  ])('rejeita âncora inválida: %j', (invalid) => {
    const { context, proposal, change } = fixture();
    expect(() =>
      validateFinalEditorialProposal(context, { ...proposal, changes: [{ ...change, ...invalid }] }),
    ).toThrow();
  });

  it('aceita o emoji inteiro e rejeita fronteiras no meio do par substituto', () => {
    const { context, proposal, change } = fixture();
    const emoji = { ...change, start: 6, end: 8, before: '😀', after: '🙂' };
    expect(() => validateFinalEditorialProposal(context, { ...proposal, changes: [emoji] })).not.toThrow();
    for (const [start, end] of [
      [6, 7],
      [7, 8],
    ]) {
      expect(() =>
        validateFinalEditorialProposal(context, {
          ...proposal,
          changes: [{ ...emoji, start, end, before: original.slice(start, end) }],
        }),
      ).toThrow();
    }
  });

  it('mantém espaços de before/after e não equipara Unicode normalizado', () => {
    const { context, proposal, change } = fixture();
    const spaces = { ...change, start: 0, end: 6, before: '  Olá ', after: ' Olá  ' };
    expect(validateFinalEditorialProposal(context, { ...proposal, changes: [spaces] }).changes[0].after).toBe(' Olá  ');
    expect(() =>
      validateFinalEditorialProposal(context, { ...proposal, changes: [{ ...spaces, before: '  Ola\u0301 ' }] }),
    ).toThrow();
  });

  it('detecta overlap sem reordenar a entrada e permite intervalos adjacentes', () => {
    const { context, proposal, change } = fixture('aaaa');
    const a = { ...change, id: 'a', start: 0, end: 2, before: 'aa', after: 'bb' };
    const b = { ...a, id: 'b', start: 2, end: 4 };
    const input = freeze({ ...proposal, changes: [b, a] });
    expect(validateFinalEditorialProposal(context, input).changes.map((c) => c.id)).toEqual(['b', 'a']);
    expect(() =>
      validateFinalEditorialProposal(context, { ...proposal, changes: [b, { ...a, end: 3, before: 'aaa' }] }),
    ).toThrow();
  });

  it('não confunde intervalos em seções diferentes', () => {
    const { context, proposal, change } = fixture('aaaa');
    context.document.sections.push({ ...context.document.sections[0] });
    context.documentHash = hash(JSON.stringify(TaskDocumentSchema.parse(context.document)));
    const a = { ...change, start: 0, end: 2, before: 'aa' };
    expect(() =>
      validateFinalEditorialProposal(context, {
        ...proposal,
        documentHash: context.documentHash,
        changes: [a, { ...a, id: 'b', sectionIndex: 1 }],
      }),
    ).not.toThrow();
  });

  it('rejeita fontes novas na proposta, contexto inconsistente e IDs ambíguos', () => {
    const { context, proposal, change } = fixture();
    expect(() =>
      validateFinalEditorialProposal(context, { ...proposal, changes: [{ ...change, sourceIds: ['inventada'] }] }),
    ).toThrow();
    expect(
      FinalEditorialContextSchema.safeParse({ ...context, sources: [...context.sources, ...context.sources] }).success,
    ).toBe(false);
    expect(
      FinalEditorialContextSchema.safeParse({
        ...context,
        sources: [{ ...context.sources[0], contentHash: 'a'.repeat(64) }],
      }).success,
    ).toBe(false);
    expect(
      FinalEditorialContextSchema.safeParse({ ...context, claims: [...context.claims, ...context.claims] }).success,
    ).toBe(false);
    expect(
      FinalEditorialContextSchema.safeParse({ ...context, claims: [{ ...context.claims[0], sourceIds: ['ausente'] }] })
        .success,
    ).toBe(false);
    expect(() => validateFinalEditorialProposal(context, { ...proposal, changes: [change, change] })).toThrow();
  });

  it('rejeita vínculos de auditoria incoerentes sem converter a avaliação em aprovação', () => {
    const { context } = fixture();
    for (const invalid of [{ claimId: 'ausente' }, { sourceId: 'ausente' }, { sourceContentHash: 'a'.repeat(64) }])
      expect(
        FinalEditorialContextSchema.safeParse({
          ...context,
          supportAudit: [{ ...context.supportAudit[0], ...invalid }],
        }).success,
      ).toBe(false);
  });

  it('mantém sugestões substantivas ancoradas e sem patch aplicável', () => {
    const { context, proposal, change } = fixture();
    const { category: _category, after: _after, ...suggestion } = change;
    const item = { ...suggestion, id: 'substantive', reason: 'Conferir o pedido.' };
    const value = { ...proposal, substantiveSuggestions: [item] };
    expect(validateFinalEditorialProposal(context, value).substantiveSuggestions).toEqual([item]);
    for (const invalid of [{ after: 'Novo pedido' }, { sourceIds: ['nova'] }, { before: 'outro' }, { id: change.id }])
      expect(() =>
        validateFinalEditorialProposal(context, { ...proposal, substantiveSuggestions: [{ ...item, ...invalid }] }),
      ).toThrow();
  });

  it('exige decisão humana e rejeita aprovação, escrita ou documento substituto', () => {
    const { context, proposal, change } = fixture();
    for (const invalid of [
      { humanReviewRequired: false },
      { legalAssessment: 'APPROVED' },
      { status: 'APPROVED' },
      { approved: true },
      { document: context.document },
      { execute: true },
      { contractVersion: '2.0.0' },
    ])
      expect(() => validateFinalEditorialProposal(context, { ...proposal, ...invalid })).toThrow();
    expect(() =>
      validateFinalEditorialProposal(context, { ...proposal, changes: [{ ...change, tool: 'write' }] }),
    ).toThrow();
  });

  it('aceita ausência de mudanças sem fabricar aprovação e exige motivo para LIMITED', () => {
    const { context, proposal } = fixture();
    expect(validateFinalEditorialProposal(context, { ...proposal, changes: [] })).toMatchObject({
      status: 'LIMITED',
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      changes: [],
    });
    expect(() => validateFinalEditorialProposal(context, { ...proposal, changes: [], limitations: [] })).toThrow();
  });

  it('aceita o limite exato e rejeita uma proposta além dele', () => {
    const { context, proposal, change } = fixture('a'.repeat(31));
    const changes = Array.from({ length: 30 }, (_, i) => ({
      ...change,
      id: `e${i}`,
      start: i,
      end: i + 1,
      before: 'a',
      after: 'b',
    }));
    const suggestions = changes.map(({ category: _category, after: _after, ...s }) => ({ ...s, id: `s${s.id}` }));
    const value = {
      ...proposal,
      changes,
      substantiveSuggestions: suggestions,
      limitations: Array(20).fill('Limitação.'),
    };
    expect(validateFinalEditorialProposal(context, value).changes).toHaveLength(30);
    for (const invalid of [
      { changes: [...changes, { ...changes[0], id: 'extra', start: 30, end: 31 }] },
      { substantiveSuggestions: [...suggestions, { ...suggestions[0], id: 'extra' }] },
      { limitations: Array(21).fill('Limitação.') },
    ])
      expect(() => validateFinalEditorialProposal(context, { ...value, ...invalid })).toThrow();
  });
});
