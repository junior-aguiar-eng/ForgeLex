import { requestApiWithToken } from '../api-client';
import type { DocumentReference } from '../documents/document-reader-model';
import type { DraftReviewFinding, DraftReviewRun } from '../screens/draft-review/review-model';

/** Modelo local da tela de peças (`DraftStudioScreen`): os dados que a API devolve e a seção editável. */

export interface Matter {
  id: string;
  title: string;
  practiceArea?: string;
  jurisdiction?: string;
}

export interface Draft {
  id: string;
  matterId: string;
  title: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVAL_PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  currentVersionId?: string;
  updatedAt: string;
}

export interface DraftSection {
  id: string;
  ordinal: number;
  title: string;
  content: string;
  linkedFactIds: string[];
  linkedEvidenceIds: string[];
  linkedAuthorityIds: string[];
  linkedThesisIds: string[];
}

export interface LegalIssue {
  id: string;
  statement: string;
  status: string;
}

export interface Fact {
  id: string;
  statement: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
}

export interface SavedAuthority {
  id: string;
  authority: { court: string; processNumber: string; syllabus: string };
}

export interface LegalThesis {
  id: string;
  title: string;
  statement: string;
  issueIds: string[];
  factIds: string[];
  evidenceIds: string[];
  authorityIds: string[];
}

export interface DraftVersion {
  id: string;
  versionNumber: number;
  contentHash: string;
  status: Draft['status'];
  createdAt: string;
}

export interface DraftDetails {
  draft: Draft;
  currentVersion?: { version: DraftVersion; sections: DraftSection[]; citations: Citation[] };
  versions: DraftVersion[];
  reviewFindings: DraftReviewFinding[];
  latestReviewRun?: DraftReviewRun;
  currentReviewRun?: DraftReviewRun;
  reviewContextChanged: boolean;
  documentReferences?: DocumentReference[];
  approvals?: { id: string; draftVersionId: string; status: string }[];
}

export interface DraftWriteResponse {
  draft: Draft;
  version: DraftVersion;
  sections: DraftSection[];
  citations: Citation[];
}

export interface Citation {
  id: string;
  sectionId: string;
  targetType: 'AUTHORITY' | 'FACT' | 'EVIDENCE';
  targetId: string;
  citationText: string;
  verified: boolean;
}

export interface EditableSection {
  ordinal?: number;
  title: string;
  content: string;
  linkedFactIds: string[];
  linkedEvidenceIds: string[];
  linkedAuthorityIds: string[];
  linkedThesisIds: string[];
}

export function initialToken(): string {
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

export async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  return requestApiWithToken<T>(path, token, init);
}

export const statusLabel: Record<Draft['status'], string> = {
  DRAFT: 'Rascunho',
  IN_REVIEW: 'Em revisão',
  APPROVAL_PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  ARCHIVED: 'Arquivado',
};
