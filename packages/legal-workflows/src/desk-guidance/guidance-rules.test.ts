import { createGuidanceSnapshot } from '@forgelex/domain';
import { describe, expect, it } from 'vitest';
import { applyGuidanceAnswer, guidanceQuestion, initialGuidance } from './guidance-rules.js';

describe('resposta textual da orientação', () => {
  it('mantém a pergunta antiga e aceita texto livre nas conversas novas', () => {
    const current = initialGuidance();
    const { guidanceHash: _hash, ...fields } = current;
    const old = createGuidanceSnapshot({ ...fields, rulesVersion: 'mesa-v1' });
    expect(guidanceQuestion(old, 1)?.allowFreeText).toBe(false);
    const question = guidanceQuestion(current, 1)!;
    expect(question.allowFreeText).toBe(true);
    const result = applyGuidanceAnswer(current, question, {
      questionId: question.id,
      questionVersion: question.version,
      contextRevision: 1,
      selectedOptionIds: [],
      freeText: 'Quero entender como proceder.',
    });
    expect(result.area).toEqual({ value: null, status: 'unknown', origin: 'user', questionId: question.id });
    expect(guidanceQuestion(result, 2)?.id).toBe('action:2');
  });
});
