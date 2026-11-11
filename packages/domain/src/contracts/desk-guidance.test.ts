import { describe, expect, it } from 'vitest';
import { AgenticContextSchema, validateLegalAnswer, type LegalQuestion } from './agentic-workspace.js';
import {
  createGuidanceSnapshot,
  createSkillBinding,
  DecisionValueSchema,
  GuidanceSnapshotSchema,
  SkillBindingSchema,
} from './desk-guidance.js';

const unknown = { value: null, status: 'unknown', origin: 'user' } as const;
const input = {
  protocolVersion: 1 as const,
  rulesVersion: 'mesa-v1',
  revision: 1,
  area: { value: 'penal', status: 'confirmed', origin: 'user' } as const,
  action: { value: 'review_text', status: 'known', origin: 'user' } as const,
  documentType: unknown,
  partyRole: unknown,
  stage: unknown,
  activeQuestionId: null,
};
const question: LegalQuestion = {
  id: 'area',
  version: 2,
  contextRevision: 3,
  prompt: 'Qual área?',
  selection: 'single',
  options: [{ id: 'penal', label: 'Penal' }],
  allowFreeText: true,
  allowUnknown: true,
  reason: 'Delimitar a tarefa',
};
const answer = { questionId: 'area', questionVersion: 2, contextRevision: 3, selectedOptionIds: ['penal'] };
const skill = {
  id: 'forma-teste',
  version: 3,
  contentHash: 'a'.repeat(64),
  role: 'legal-drafter',
  issueIds: ['b', 'a'],
};

describe('orientação interna da Mesa', () => {
  it('conserva escolha, desconhecimento, proposta e confirmação com suas origens', () => {
    const decisions = [
      unknown,
      input.action,
      input.area,
      { value: 'penal', status: 'proposed', origin: 'model' },
      { value: 'instrucao', status: 'known', origin: 'document', evidenceIds: ['doc-1'] },
    ];
    expect(decisions.map((decision) => DecisionValueSchema.parse(decision))).toEqual(decisions);
  });

  it('recusa decisão vazia, desconhecimento com valor e hipótese marcada como confirmação do modelo', () => {
    for (const decision of [
      { ...input.area, value: '' },
      { ...unknown, value: 'penal' },
      { ...input.area, origin: 'model' },
      { value: 'penal', status: 'known', origin: 'document' },
      { ...input.area, value: 'texto livre no campo codificado' },
    ]) {
      expect(DecisionValueSchema.safeParse(decision).success).toBe(false);
    }
  });

  it('reutiliza a validação de resposta vazia, opção inexistente e pergunta obsoleta', () => {
    expect(() => validateLegalAnswer(question, { ...answer, selectedOptionIds: [] })).toThrow('EMPTY_ANSWER');
    expect(() => validateLegalAnswer(question, { ...answer, selectedOptionIds: ['fora-da-lista'] })).toThrow(
      'INVALID_ANSWER',
    );
    expect(() => validateLegalAnswer(question, { ...answer, questionVersion: 1 })).toThrow('QUESTION_EXPIRED');
    expect(() => validateLegalAnswer(question, { ...answer, contextRevision: 2 })).toThrow('QUESTION_EXPIRED');
    expect(validateLegalAnswer(question, { ...answer, selectedOptionIds: [], unknown: true }).unknown).toBe(true);
  });

  it('fixa o hash de uma configuração conhecida e ignora ordem de chaves e identificadores da pergunta', () => {
    const area = { value: 'penal', status: 'known', origin: 'document', evidenceIds: ['b', 'a'] } as const;
    const first = createGuidanceSnapshot({ ...input, area: { ...area, evidenceIds: [...area.evidenceIds] } });
    const second = createGuidanceSnapshot({
      ...input,
      revision: 2,
      activeQuestionId: 'outra',
      area: { evidenceIds: ['a', 'b'], questionId: 'pergunta', origin: 'document', status: 'known', value: 'penal' },
    });
    expect(first.guidanceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.guidanceHash).toBe(second.guidanceHash);
    expect(createGuidanceSnapshot({ ...input, rulesVersion: 'mesa-v2' }).guidanceHash).not.toBe(
      createGuidanceSnapshot(input).guidanceHash,
    );
    expect(createGuidanceSnapshot({ ...input, area: { ...input.area, value: 'civel' } }).guidanceHash).not.toBe(
      createGuidanceSnapshot(input).guidanceHash,
    );
  });

  it('valida conteúdo do snapshot e mantém chaves de autorização fora do contrato', () => {
    const snapshot = createGuidanceSnapshot(input);
    expect(GuidanceSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(GuidanceSnapshotSchema.safeParse({ ...snapshot, area: unknown }).success).toBe(false);
    for (const key of ['authorizationId', 'idempotencyKey', 'commandId']) {
      expect(GuidanceSnapshotSchema.safeParse({ ...snapshot, [key]: snapshot.guidanceHash }).success).toBe(false);
    }
  });

  it('lê o contexto histórico e o contexto com orientação opcional', () => {
    const legacy = { text: '', origin: 'USER', documents: [] };
    const guidance = createGuidanceSnapshot(input);
    expect(AgenticContextSchema.parse(legacy)).toEqual(legacy);
    expect(AgenticContextSchema.parse({ ...legacy, guidance })).toEqual({ ...legacy, guidance });
  });

  it('fixa resolução por catálogo, contexto, papéis e versões sem depender da ordem do conjunto', () => {
    const { guidanceHash } = createGuidanceSnapshot(input);
    const bind = (entries = [skill, { ...skill, id: 'materia-teste' }], contextRevision = 1, catalogVersion = 'v1') =>
      createSkillBinding({ guidanceHash, contextRevision, catalogVersion, entries });
    const first = bind();
    expect(SkillBindingSchema.parse(first)).toEqual(first);
    expect(bind([{ ...skill, id: 'materia-teste', issueIds: ['a', 'b'] }, skill]).resolutionHash).toBe(
      first.resolutionHash,
    );
    expect(bind(undefined, 2).resolutionHash).not.toBe(first.resolutionHash);
    expect(bind(undefined, 1, 'v2').resolutionHash).not.toBe(first.resolutionHash);
    expect(
      bind([
        { ...skill, version: 4 },
        { ...skill, id: 'materia-teste' },
      ]).resolutionHash,
    ).not.toBe(first.resolutionHash);
    expect(() => bind([skill, { ...skill, version: 4 }])).toThrow();
    expect(SkillBindingSchema.safeParse({ ...first, commandId: first.resolutionHash }).success).toBe(false);
  });
});
