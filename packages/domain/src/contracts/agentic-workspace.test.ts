import { describe, expect, it } from 'vitest';
import {
  AgenticContextSchema,
  LegalAnswerSchema,
  LegalQuestionSchema,
  validateLegalAnswer,
} from './agentic-workspace.js';
const question = {
  id: 'q',
  version: 1,
  contextRevision: 1,
  prompt: 'Finalidade?',
  selection: 'single' as const,
  options: [{ id: 'a', label: 'Pesquisar' }],
  allowFreeText: false,
  allowUnknown: false,
  reason: 'Escopo',
};
const answer = { questionId: 'q', questionVersion: 1, contextRevision: 1, selectedOptionIds: ['a'] };
describe('contratos de diálogo jurídico', () => {
  it('valida escolha e não cria respostas pré-marcadas', () => {
    expect(validateLegalAnswer(LegalQuestionSchema.parse(question), answer)).toEqual(answer);
    expect(LegalAnswerSchema.safeParse({ ...answer, selectedOptionIds: [] }).success).toBe(false);
  });
  it('rejeita opções duplicadas e modos incoerentes de pergunta', () => {
    for (const change of [
      { options: [...question.options, ...question.options] },
      { selection: 'free_text' },
      { options: [] },
    ])
      expect(LegalQuestionSchema.safeParse({ ...question, ...change }).success).toBe(false);
  });
  it('rejeita texto/unknown sem permissão e seleção duplicada', () => {
    for (const change of [
      { freeText: 'outro' },
      { selectedOptionIds: [], unknown: true },
      { selectedOptionIds: ['a', 'a'] },
    ])
      expect(() => validateLegalAnswer(question, { ...answer, ...change })).toThrow();
  });
  it('preserva origem textual e rejeita origem documental sem referência', () => {
    expect(AgenticContextSchema.parse({ text: '', origin: 'USER', documents: [] }).documents).toEqual([]);
    expect(AgenticContextSchema.safeParse({ text: 'extraído', origin: 'DOCUMENT', documents: [] }).success).toBe(false);
  });
});
