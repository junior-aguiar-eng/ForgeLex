import { createHash } from 'node:crypto';
import {
  ApprovalRequest,
  CitationAnchor,
  Draft,
  DraftReviewFinding,
  DraftSection,
  DraftVersion,
  DraftReviewRun,
} from '@forgelex/domain';
import {
  CitationAnchorInput,
  DraftRepository,
  DraftReviewRunRepository,
  DraftSectionInput,
  type ManualDraftWriteInput,
  DraftVersionBundle,
  reviewContextHash,
  type DraftReviewContextSnapshot,
} from '@forgelex/persistence';

export interface DraftContext {
  tenantId: string;
  userId: string;
  matterId: string;
}

export interface DraftContentInput {
  title: string;
  sections: DraftSectionInput[];
  citations?: CitationAnchorInput[];
  notes?: string;
  baseVersionId?: string;
  expectedCurrentVersionId?: string;
}

export interface DraftDetails {
  draft: Draft;
  currentVersion?: DraftVersionBundle;
  versions: DraftVersion[];
  reviewFindings: DraftReviewFinding[];
  approvals: ApprovalRequest[];
  latestReviewRun?: DraftReviewRun;
  currentReviewRun?: DraftReviewRun;
  reviewContextChanged: boolean;
  documentReferences: DraftReviewContextSnapshot['documentReferences'];
}

export interface DraftWriteResult {
  draft: Draft;
  version: DraftVersion;
  sections: DraftSection[];
  citations: CitationAnchor[];
}

function hashDraftContent(input: DraftContentInput): string {
  return createHash('sha256')
    .update(JSON.stringify({ title: input.title, sections: input.sections, citations: input.citations ?? [] }), 'utf8')
    .digest('hex');
}

export class DraftingService {
  public constructor(private readonly repository: DraftRepository, private readonly runs: DraftReviewRunRepository = repository.reviewRuns()) {}

  public async createDraft(context: DraftContext, input: DraftContentInput): Promise<DraftWriteResult> {
    return this.repository.saveManual(this.manualWriteInput(context, input));
  }

  public async updateDraft(context: DraftContext, draftId: string, input: DraftContentInput): Promise<DraftWriteResult> {
    return this.repository.saveManual(this.manualWriteInput(context, input, draftId));
  }

  public saveCommand(context: DraftContext, commandId: string, input: DraftContentInput, draftId?: string) {
    return this.repository.saveManualCommand(this.manualWriteInput(context, input, draftId), commandId);
  }

  public recoverSave(context: DraftContext, commandId: string) {
    return this.repository.recoverManualSave({ ...context, commandId });
  }

  /** Arquiva ou restaura o rascunho sem apagar versões, revisões, aprovações nem recibos. */
  public async setArchived(context: DraftContext, draftId: string, archived: boolean) {
    await this.requireDraft(context, draftId);
    return this.repository.setArchived({ tenantId: context.tenantId, matterId: context.matterId, draftId }, archived);
  }

  public async getDraft(context: DraftContext, draftId: string, audience: 'web_history' | 'work' = 'work'): Promise<DraftDetails> {
    const draft = await this.requireDraft(context, draftId);
    const [currentVersion, versions, reviewFindings, approvals] = await Promise.all([
      this.repository.getCurrentVersion(context.tenantId, context.matterId, draftId),
      this.repository.listVersions(context.tenantId, context.matterId, draftId),
      this.repository.listReviewFindings(context.tenantId, context.matterId, draftId),
      this.repository.listApprovalRequests(context.tenantId, context.matterId),
    ]);
    const latestReviewRun = currentVersion && this.runs ? await this.runs.getLatest(context, draftId, currentVersion.version.id) : undefined;
    const currentReviewRun = currentVersion && this.runs ? await this.runs.getLatest(context, draftId, currentVersion.version.id, true) : undefined;
    const snapshot = currentVersion ? await this.repository.reviewContext(context,currentVersion,audience) : undefined;
    const reviewContextChanged = Boolean(latestReviewRun && snapshot && latestReviewRun.contextHash !== reviewContextHash(snapshot));
    return {
      draft,
      currentVersion,
      versions,
      reviewFindings: currentReviewRun ? reviewFindings.filter(f => f.reviewRunId === currentReviewRun.id) : [],
      latestReviewRun,
      currentReviewRun,
      reviewContextChanged,
      documentReferences:snapshot?.documentReferences??[],
      approvals: approvals.filter((approval) => approval.draftId === draftId),
    };
  }

  public async requestApproval(context: DraftContext, draftId: string, versionId?: string): Promise<{ request: ApprovalRequest; token: string }> {
    const draft = await this.requireDraft(context, draftId);
    const version = versionId
      ? await this.repository.getVersion(context.tenantId, context.matterId, draftId, versionId)
      : await this.repository.getCurrentVersion(context.tenantId, context.matterId, draftId);
    if (!version) throw new Error('DRAFT_VERSION_NOT_FOUND: o rascunho não possui a versão solicitada.');
    return this.repository.createApprovalRequest({
      tenantId: context.tenantId,
      matterId: context.matterId,
      draftId: draft.id,
      draftVersionId: version.version.id,
      requestedBy: context.userId,
      proposedAction: 'Aprovar a versão para uso externo após conferência humana.',
    });
  }

  public async reissueApproval(context: DraftContext, draftId: string, requestId: string, versionId: string) {
    await this.requireDraft(context, draftId);
    return this.repository.reissueApprovalToken({...context,draftId,requestId,draftVersionId:versionId});
  }

  public async resolveApproval(context: Omit<DraftContext, 'matterId'> & { matterId?: string }, token: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    return this.repository.resolveApproval({
      tenantId: context.tenantId,
      token,
      decision,
      decidedBy: context.userId,
      reason,
    });
  }

  private manualWriteInput(context: DraftContext, input: DraftContentInput, draftId?: string): ManualDraftWriteInput {
    return {
      tenantId: context.tenantId,
      matterId: context.matterId,
      draftId,
      title: input.title,
      createdBy: context.userId,
      contentHash: hashDraftContent(input),
      notes: input.notes,
      baseVersionId: input.baseVersionId,
      expectedCurrentVersionId: input.expectedCurrentVersionId,
      sections: input.sections,
      citations: input.citations,
    };
  }

  private async requireDraft(context: DraftContext, draftId: string): Promise<Draft> {
    const draft = await this.repository.getDraft(context.tenantId, context.matterId, draftId);
    if (!draft) throw new Error('DRAFT_NOT_FOUND: rascunho não localizado no matter do tenant autenticado.');
    return draft;
  }
}
