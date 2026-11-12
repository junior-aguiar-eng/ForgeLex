import { afterEach, describe, expect, it } from 'vitest';
import { matchesDeskPiece, selectDeskExecution, selectDeskPiece } from '../agentic-workspace/desk-selection';
import { deskLocation, readDeskLocation } from './desk-location';

const sizeDescriptor = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size');

function removeUrlSearchParamsSize(): void {
  Reflect.deleteProperty(URLSearchParams.prototype, 'size');
  expect(new URLSearchParams('a=1').size).toBeUndefined();
}

afterEach(() => {
  if (sizeDescriptor) Object.defineProperty(URLSearchParams.prototype, 'size', sizeDescriptor);
});

describe('navegadores sem URLSearchParams.size', () => {
  const selection = readDeskLocation('/app/trabalho?executionId=E&conversationId=C&contextRevision=2&matterId=M');

  it('gera a mesma URL com e sem a propriedade', () => {
    const expected = deskLocation(selection);
    expect(expected).toBe('/app/trabalho?executionId=E&conversationId=C&matterId=M&contextRevision=2');
    removeUrlSearchParamsSize();
    expect(deskLocation(selection)).toBe(expected);
  });

  it('mantém o caminho limpo quando não há seleção', () => {
    removeUrlSearchParamsSize();
    expect(deskLocation({})).toBe('/app/trabalho');
  });
});

describe('seleção da Mesa', () => {
  it('migra o alias com retorno e preserva a revisão e a peça no link canônico', () => {
    const selection = readDeskLocation(
      '/rascunhos?returnExecution=E&conversationId=C&contextRevision=0&matterId=M&draftId=P&versionId=V&deliveryId=D',
    );
    expect(readDeskLocation(deskLocation(selection))).toEqual({
      executionId: 'E',
      conversationId: 'C',
      contextRevision: 0,
      matterId: 'M',
      draftId: 'P',
      versionId: 'V',
      deliveryId: 'D',
    });
  });

  it('abre outra conversa sem transportar peça ou orientação', () => {
    const selection = readDeskLocation('/app/trabalho?executionId=E&conversationId=C&contextRevision=3&draftId=P');
    expect(selectDeskExecution(selection, 'E')).toBe(selection);
    expect(deskLocation(selectDeskExecution(selection, 'F'))).toBe('/app/trabalho?executionId=F');
    expect(deskLocation(selectDeskExecution(selection))).toBe('/app/trabalho');
  });

  it('preserva a orientação sem execução no mesmo caso e descarta seu vínculo ao mudar de caso', () => {
    const selection = readDeskLocation('/app/trabalho?conversationId=C&contextRevision=2&matterId=A');
    expect(deskLocation(selectDeskPiece(selection, { matterId: 'A', draftId: 'P', versionId: 'V' }))).toBe(
      '/app/trabalho?conversationId=C&matterId=A&draftId=P&versionId=V&contextRevision=2',
    );
    expect(deskLocation(selectDeskPiece(selection, { matterId: 'B' }))).toBe('/app/trabalho?matterId=B');
  });

  it('só vincula ao pedido o buffer da versão e da entrega selecionadas', () => {
    const piece = { title: 'Peça', matterId: 'A', draftId: 'P', versionId: 'V', dirty: true };
    expect(matchesDeskPiece({ matterId: 'A', draftId: 'P', versionId: 'V' }, piece)).toBe(true);
    expect(matchesDeskPiece({ matterId: 'A', draftId: 'P', versionId: 'outra' }, piece)).toBe(false);
    expect(matchesDeskPiece({ matterId: 'B', draftId: 'P' }, piece)).toBe(false);
    const local = { ...piece, matterId: '', draftId: '', versionId: '', deliveryId: 'D' };
    expect(matchesDeskPiece({ deliveryId: 'D' }, local)).toBe(true);
    expect(matchesDeskPiece({ deliveryId: 'outra' }, local)).toBe(false);
  });
});
