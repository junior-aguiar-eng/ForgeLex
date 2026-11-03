export interface EditorialItem {
  id: string;
  sectionIndex: number;
  sectionHash: string;
  start: number;
  end: number;
  before: string;
  after?: string;
  reason: string;
  sourceIds: string[];
  category?: string;
}
export interface EditorialProposal {
  contractVersion: string;
  contextId: string;
  contextRevision: number;
  deliveryId: string;
  draftId: string;
  versionId: string;
  documentHash: string;
  status: string;
  humanReviewRequired: true;
  legalAssessment: 'NOT_EVALUATED';
  changes: EditorialItem[];
  substantiveSuggestions: EditorialItem[];
  limitations: string[];
}
export type EditorialAction = 'ACCEPT' | 'REJECT' | 'DEFER';
export interface EditorialDecision {
  itemId: string;
  action: EditorialAction;
  reason: string;
}
export interface EditorialReview {
  application?: {
    commandId: string;
    proposalHash: string;
    itemIds: string[];
    baseVersionId: string;
    versionId: string;
    versionNumber: number;
    contentHash: string;
    appliedBy: string;
    appliedAt: string;
    reason: string;
  };
  contextHash: string | null;
  stale?: boolean;
  reconciliation?: { commandId: string; status: 'RECORDED' | 'NOT_RECORDED' };
  revision: number;
  proposal?: EditorialProposal;
  context: {
    document: { title: string; sections: { title: string; content: string }[] };
    requirements: { id: string; verified: boolean; statement: string }[];
    findings: { id: string; statement: string }[];
    sources: { id: string; kind: string; text: string }[];
  } | null;
  history: {
    commandId: string;
    contextHash: string;
    proposalHash: string;
    proposal: EditorialProposal;
    decision: EditorialDecision;
    decidedBy: string;
    decidedAt: string;
  }[];
}
export const editorialActionLabels: Record<EditorialAction, string> = {
  ACCEPT: 'Concordar',
  REJECT: 'Rejeitar',
  DEFER: 'Adiar',
};
