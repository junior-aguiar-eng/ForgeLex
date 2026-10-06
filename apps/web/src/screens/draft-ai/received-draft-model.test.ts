import { it, expect } from 'vitest';
import { shouldApplyReceiptResponse, adoptionChoice } from './received-draft-model';
it('ignora resposta de outro caso ou rascunho e exige escolha com edição pendente', () => {
  expect(
    shouldApplyReceiptResponse({
      requestMatterId: 'a',
      requestDraftId: 'd',
      currentMatterId: 'a',
      currentDraftId: 'd',
    }),
  ).toBe(true);
  expect(
    shouldApplyReceiptResponse({
      requestMatterId: 'a',
      requestDraftId: 'd',
      currentMatterId: 'b',
      currentDraftId: 'd',
    }),
  ).toBe(false);
  expect(
    shouldApplyReceiptResponse({
      requestMatterId: 'a',
      requestDraftId: 'd',
      currentMatterId: 'a',
      currentDraftId: 'e',
    }),
  ).toBe(false);
  expect(adoptionChoice(true)).toBe('CHOOSE');
  expect(adoptionChoice(false)).toBe('ADOPT');
});
