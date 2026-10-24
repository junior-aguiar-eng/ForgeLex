import { LegalWorkContextSchema } from './context-packet.js';
import { describe, expect, it } from 'vitest';
import { LEGAL_ACTION_CATALOG } from './agent-catalog.js';
import { validateLegalWorkHandoff, LEGAL_WORKFLOW_CONTRACTS } from './legal-work-contracts.js';

const source = { id: 'source-1', contentHash: 'a'.repeat(64), kind: 'USER_TEXT' };
const context = {
  action: 'analyze_documents',
  contextId: 'task-1',
  contextRevision: 1,
  objective: 'Analisar o material fornecido',
  constraints: [],
  sources: [source],
};
const finding = {
  statement: 'O texto contém uma alegação ainda não comprovada.',
  classification: 'ALLEGATION',
  sourceIds: ['source-1'],
};
const delivery = {
  contextId: 'task-1',
  contextRevision: 1,
  action: 'analyze_documents',
  status: 'CANDIDATE',
  humanReviewRequired: true,
  limitations: [],
  findings: [finding],
};

describe('A0: contratos de análise, redação e revisão', () => {
  it('aceita análise candidata com vínculo de origem sem confirmar fatos', () => {
    expect(validateLegalWorkHandoff(context, delivery).action).toBe('analyze_documents');
    expect(() =>
      validateLegalWorkHandoff(context, { ...delivery, findings: [{ ...finding, classification: 'CONFIRMED_FACT' }] }),
    ).toThrow();
  });
  it('rejeita handoff de outro contexto ou revisão antiga', () => {
    expect(() => validateLegalWorkHandoff(context, { ...delivery, contextId: 'other' })).toThrow();
    expect(() => validateLegalWorkHandoff(context, { ...delivery, contextRevision: 2 })).toThrow();
  });
  it('rejeita referências desconhecidas e inferência sem fonte', () => {
    expect(() =>
      validateLegalWorkHandoff(context, { ...delivery, findings: [{ ...finding, sourceIds: ['missing'] }] }),
    ).toThrow();
    expect(() =>
      validateLegalWorkHandoff(context, { ...delivery, findings: [{ ...finding, sourceIds: [] }] }),
    ).toThrow();
    expect(() =>
      validateLegalWorkHandoff(context, {
        ...delivery,
        findings: [{ ...finding, classification: 'INFERENCE', sourceIds: [] }],
      }),
    ).toThrow();
  });
  it('aceita lacuna explícita sem inventar fonte e exige motivo da entrega limitada', () => {
    const gap = { statement: 'A data do ato não foi fornecida.', classification: 'GAP', sourceIds: [] };
    expect(() =>
      validateLegalWorkHandoff(context, {
        ...delivery,
        status: 'LIMITED',
        findings: [gap],
        limitations: ['Data não informada.'],
      }),
    ).not.toThrow();
    expect(() => validateLegalWorkHandoff(context, { ...delivery, status: 'LIMITED' })).toThrow();
  });
  it('rejeita fontes duplicadas, contexto excessivo e documento sem versão', () => {
    expect(LegalWorkContextSchema.safeParse({ ...context, sources: [source, source] }).success).toBe(false);
    expect(LegalWorkContextSchema.safeParse({ ...context, objective: 'x'.repeat(4001) }).success).toBe(false);
    expect(LegalWorkContextSchema.safeParse({ ...context, sources: [{ ...source, kind: 'DOCUMENT' }] }).success).toBe(
      false,
    );
    expect(
      LegalWorkContextSchema.safeParse({ ...context, sources: [{ ...source, contentHash: 'z'.repeat(64) }] }).success,
    ).toBe(false);
  });
  it('aceita redação candidata e rejeita fonte inexistente ou aprovação automática', () => {
    const draft = {
      ...delivery,
      action: 'create_document',
      title: 'Minuta para revisão',
      sections: [{ title: 'Fatos', content: 'Segundo o relato fornecido.', sourceIds: ['source-1'] }],
    };
    delete (draft as Partial<typeof delivery>).findings;
    expect(() => validateLegalWorkHandoff({ ...context, action: 'create_document' }, draft)).not.toThrow();
    expect(() =>
      validateLegalWorkHandoff({ ...context, action: 'create_document' }, { ...draft, humanReviewRequired: false }),
    ).toThrow();
    expect(() =>
      validateLegalWorkHandoff(
        { ...context, action: 'create_document' },
        { ...draft, sections: [{ ...draft.sections[0], sourceIds: ['missing'] }] },
      ),
    ).toThrow();
  });
  it('revisão exige alvo versionado e não equivale a aprovação', () => {
    const review = { ...delivery, action: 'review_text', targetSourceId: 'source-1' };
    expect(() => validateLegalWorkHandoff({ ...context, action: 'review_text' }, review)).not.toThrow();
    expect(() =>
      validateLegalWorkHandoff({ ...context, action: 'review_text' }, { ...review, targetSourceId: 'missing' }),
    ).toThrow();
    expect(() =>
      validateLegalWorkHandoff({ ...context, action: 'review_text' }, { ...review, status: 'APPROVED' }),
    ).toThrow();
  });
  it('rejeita entrega de outro workflow mesmo com contexto e fontes válidos', () => {
    expect(() => validateLegalWorkHandoff({ ...context, action: 'review_text' }, delivery)).toThrow();
    const workflow = LEGAL_WORKFLOW_CONTRACTS.find((item) => item.action === 'review_text')!;
    expect(workflow.outputSchema.safeParse(delivery).success).toBe(false);
  });
  it('exige fonte na redação ou lacuna expressa em entrega limitada', () => {
    const draft = {
      contextId: 'task-1',
      contextRevision: 1,
      action: 'create_document',
      status: 'CANDIDATE',
      humanReviewRequired: true,
      limitations: [],
      title: 'Minuta',
      sections: [{ title: 'Fatos', content: 'A parte afirma ter pago.', sourceIds: [] }],
    };
    const input = { ...context, action: 'create_document' };
    expect(() => validateLegalWorkHandoff(input, draft)).toThrow();
    const limitedDraft = {
      ...draft,
      status: 'LIMITED',
      limitations: ['Origem factual ainda não informada.'],
      sections: [{ ...draft.sections[0], supportStatus: 'UNSUPPORTED' }],
    };
    expect(() => validateLegalWorkHandoff(input, limitedDraft)).not.toThrow();
  });
  it('vincula as quatro ações a contratos versionados sem habilitar execução', () => {
    expect(LEGAL_WORKFLOW_CONTRACTS).toHaveLength(4);
    for (const action of LEGAL_ACTION_CATALOG) {
      expect(action.contractStatus).toBe('DEFINED');
      expect(action.executionEnabled).toBe(false);
      expect(LEGAL_WORKFLOW_CONTRACTS.find((workflow) => workflow.action === action.id)?.executionEnabled).toBe(false);
    }
  });
  it('aceita referências explícitas de questões e seções no contexto mínimo', () => {
    for (const kind of ['ISSUE', 'DRAFT_SECTION']) {
      expect(LegalWorkContextSchema.safeParse({ ...context, sources: [{ ...source, kind }] }).success).toBe(true);
    }
  });
});
