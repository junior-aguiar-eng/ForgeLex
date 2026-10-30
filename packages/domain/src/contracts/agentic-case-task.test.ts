import { describe, expect, it } from 'vitest';
import { AgenticTaskDeliverySchema, TaskRequirementSchema } from './agentic-case-task.js';

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
