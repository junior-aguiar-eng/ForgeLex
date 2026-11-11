import type { DeskPiece } from './desk-model';

export interface DeskDocumentSelection {
  matterId?: string;
  draftId?: string;
  versionId?: string;
  deliveryId?: string;
}

export interface DeskSelection extends DeskDocumentSelection {
  executionId?: string;
  conversationId?: string;
  contextRevision?: number;
  piece?: boolean;
}

export function selectDeskExecution(selection: DeskSelection, executionId?: string): DeskSelection {
  return executionId && executionId === selection.executionId ? selection : { executionId };
}

export function hasDeskPiece(selection: DeskSelection): boolean {
  return Boolean(selection.piece || selection.matterId || selection.draftId || selection.deliveryId);
}

export function selectDeskPiece(selection: DeskSelection, document: DeskDocumentSelection): DeskSelection {
  const keepConversation = Boolean(selection.executionId) || selection.matterId === document.matterId;
  return {
    executionId: selection.executionId,
    conversationId: keepConversation ? selection.conversationId : undefined,
    contextRevision: keepConversation ? selection.contextRevision : undefined,
    matterId: document.matterId,
    draftId: document.draftId,
    versionId: document.versionId,
    deliveryId: document.deliveryId,
    piece: true,
  };
}

export function matchesDeskPiece(selection: DeskSelection, piece: DeskPiece): boolean {
  return (
    (selection.matterId ?? '') === piece.matterId &&
    (selection.draftId ?? '') === piece.draftId &&
    (!piece.draftId || Boolean(piece.versionId)) &&
    (!selection.versionId || selection.versionId === piece.versionId) &&
    (!selection.deliveryId || Boolean(selection.draftId) || selection.deliveryId === piece.deliveryId)
  );
}
