import { createHash } from 'node:crypto';
import {
  ApprovalRequest,
  CitationAnchor,
  Draft,
  DraftReviewFinding,
  DraftSection,
  DraftVersion,
} from '@forgelex/domain';
import {
  CitationAnchorInput,
  DraftRepository,
  DraftSectionInput,
  DraftVersionBundle,
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
}

export interface DraftDetails {
  draft: Draft;
  currentVersion?: DraftVersionBundle;
  versions: DraftVersion[];
  reviewFindings: DraftReviewFinding[];
  approvals: ApprovalRequest[];
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
  public constructor(private readonly repository: DraftRepository) {}

  public async createDraft(context: DraftContext, input: DraftContentInput): Promise<DraftWriteResult> {
    const draft = await this.repository.createDraft({
      tenantId: context.tenantId,
      matterId: context.matterId,
      title: input.title,
      createdBy: context.userId,
    });
    return this.writeVersion(context, draft.id, input, 'HUMAN');
  }

  public async updateDraft(context: DraftContext, draftId: string, input: DraftContentInput): Promise<DraftWriteResult> {
    await this.requireDraft(context, draftId);
    return this.writeVersion(context, draftId, input, 'HUMAN');
  }

  public async getDraft(context: DraftContext, draftId: string): Promise<DraftDetails> {
    const draft = await this.requireDraft(context, draftId);
    const [currentVersion, versions, reviewFindings, approvals] = await Promise.all([
      this.repository.getCurrentVersion(context.tenantId, context.matterId, draftId),
      this.repository.listVersions(context.tenantId, context.matterId, draftId),
      this.repository.listReviewFindings(context.tenantId, context.matterId, draftId),
      this.repository.listApprovalRequests(context.tenantId, context.matterId),
    ]);
    return {
      draft,
      currentVersion,
      versions,
      reviewFindings,
      approvals: approvals.filter((approval) => approval.draftId === draftId),
    };
  }

  public async requestApproval(context: DraftContext, draftId: string, versionId?: string): Promise<{ request: ApprovalRequest; token: string }> {
    const draft = await this.requireDraft(context, draftId);
    const version = versionId
      ? await this.repository.getVersion(context.tenantId, context.matterId, draftId, versionId)
      : await this.repository.getCurrentVersion(context.tenantId, context.matterId, draftId);
    if (!version) throw new Error('DRAFT_VERSION_NOT_FOUND: o rascunho não possui a versão solicitada.');
    const findings = await this.repository.listReviewFindings(context.tenantId, context.matterId, draftId, version.version.id);
    if (findings.some((finding) => finding.severity === 'BLOCKING')) {
      throw new Error('DRAFT_REVIEW_BLOCKED: a versão possui apontamentos bloqueadores de revisão.');
    }
    return this.repository.createApprovalRequest({
      tenantId: context.tenantId,
      matterId: context.matterId,
      draftId: draft.id,
      draftVersionId: version.version.id,
      requestedBy: context.userId,
      proposedAction: 'Aprovar a versão para uso externo após conferência humana.',
    });
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

  private async writeVersion(context: DraftContext, draftId: string, input: DraftContentInput, source: 'HUMAN' | 'WORKFLOW' | 'SYSTEM'): Promise<DraftWriteResult> {
    const bundle = await this.repository.createVersion({
      tenantId: context.tenantId,
      matterId: context.matterId,
      draftId,
      title: input.title,
      createdBy: context.userId,
      source,
      status: 'DRAFT',
      contentHash: hashDraftContent(input),
      notes: input.notes,
      sections: input.sections,
      citations: input.citations,
    });
    return { draft: (await this.requireDraft(context, draftId)), ...bundle };
  }

  private async requireDraft(context: DraftContext, draftId: string): Promise<Draft> {
    const draft = await this.repository.getDraft(context.tenantId, context.matterId, draftId);
    if (!draft) throw new Error('DRAFT_NOT_FOUND: rascunho não localizado no matter do tenant autenticado.');
    return draft;
  }
}
