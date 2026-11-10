import { describe, expect, it } from 'vitest';
import { AgenticTaskDeliverySchema, TaskRequirementSchema, TaskSourceSchema } from './agentic-case-task.js';
import { MAX_SOURCE_TEXT_CHARS, exceedsSourceTextLimit } from './agentic-limits.js';
import { TaskEvidenceReferenceSchema } from './task-evidence.js';

const legacy = { id: 'r1', statement: 'Requisito pendente.', sourceIds: [], verified: false };

describe('classificação de requisitos de tarefa', () => {
  it('preserva o payload histórico sem inserir classificação na leitura', () => {
    expect(TaskRequirementSchema.parse(legacy)).toEqual(legacy);
    const delivery = {
      action: 'create_document',
      contextId: 'c',
      contextRevision: 1,
      status: 'LIMITED',
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      issues: [],
      claims: [],
      requirements: [legacy],
      findings: [],
      sources: [],
    };
    const parsed = AgenticTaskDeliverySchema.parse(delivery);
    expect(parsed).toEqual(delivery);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(delivery));
  });

  it.each(['EDITORIAL', 'PROCEDURAL'])('aceita classificação explícita %s', (kind) => {
    expect(TaskRequirementSchema.parse({ ...legacy, kind }).kind).toBe(kind);
  });

  it('recusa classificação não definida pelo contrato', () => {
    expect(() => TaskRequirementSchema.parse({ ...legacy, kind: 'APPROVED_LEGAL' })).toThrow();
  });
});

describe('limites de tamanho do texto de entrada', () => {
  const source = (text: string) => ({
    id: 's1',
    kind: 'USER_TEXT' as const,
    text,
    contentHash: 'a'.repeat(64),
  });
  it('aceita fonte de até 100.000 caracteres e recusa uma acima', () => {
    expect(TaskSourceSchema.safeParse(source('a'.repeat(MAX_SOURCE_TEXT_CHARS))).success).toBe(true);
    expect(TaskSourceSchema.safeParse(source('a'.repeat(MAX_SOURCE_TEXT_CHARS + 1))).success).toBe(false);
  });
  it('mede por caracteres e por bytes UTF-8', () => {
    expect(exceedsSourceTextLimit('a'.repeat(MAX_SOURCE_TEXT_CHARS))).toBe(false);
    expect(exceedsSourceTextLimit('a'.repeat(MAX_SOURCE_TEXT_CHARS + 1))).toBe(true);
    // 60.000 caracteres acentuados ocupam 120.000 bytes: dentro do limite de caracteres, fora do de bytes.
    expect(exceedsSourceTextLimit('á'.repeat(60000))).toBe(true);
    expect(exceedsSourceTextLimit('á'.repeat(50000))).toBe(false);
  });
  it('deixa a posição da evidência chegar ao fim de uma fonte de tamanho máximo', () => {
    const reference = { sourceId: 's1', quote: 'x', start: MAX_SOURCE_TEXT_CHARS, relation: 'SUPPORTS' as const };
    expect(TaskEvidenceReferenceSchema.safeParse(reference).success).toBe(true);
    expect(TaskEvidenceReferenceSchema.safeParse({ ...reference, start: MAX_SOURCE_TEXT_CHARS + 1 }).success).toBe(
      false,
    );
  });
});
