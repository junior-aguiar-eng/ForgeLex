export function shouldApplyReceiptResponse(input: {
  requestMatterId: string;
  requestDraftId: string;
  currentMatterId: string;
  currentDraftId: string;
}) {
  return input.requestMatterId === input.currentMatterId && input.requestDraftId === input.currentDraftId;
}
export const adoptionChoice = (dirty: boolean) => (dirty ? 'CHOOSE' : 'ADOPT');
export type Receipt = {
  id: string;
  draftId: string;
  versionId: string;
  versionNumber: number;
  receivedAt: string;
  application: { clientId: string; label?: string };
};
