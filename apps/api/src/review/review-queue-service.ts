import { DraftRepository, ResearchMemoRepository, type ForgeLexDatabase } from '@forgelex/persistence';

export interface ReviewQueueItem {
  id: string;
  kind: 'DRAFT' | 'RESEARCH_MEMO';
  matterId: string;
  targetId: string;
  title: string;
  summary: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  decidedAt?: string;
  actionUrl: string;
}

export class ReviewQueueService {
  private readonly drafts: DraftRepository;
  private readonly memos: ResearchMemoRepository;

  public constructor(db: ForgeLexDatabase) {
    this.drafts = new DraftRepository(db);
    this.memos = new ResearchMemoRepository(db);
  }

  public async list(tenantId: string): Promise<ReviewQueueItem[]> {
    const [requests, memos] = await Promise.all([
      this.drafts.listApprovalRequests(tenantId),
      this.memos.listPendingForTenant(tenantId),
    ]);
    const draftItems = await Promise.all(requests.map(async (request): Promise<ReviewQueueItem> => {
      const draft = await this.drafts.getDraft(tenantId, request.matterId, request.draftId);
      return {
        id: request.id,
        kind: 'DRAFT',
        matterId: request.matterId,
        targetId: request.draftId,
        title: draft?.title ?? 'Minuta jurídica',
        summary: request.proposedAction.slice(0, 500),
        status: request.status === 'EXPIRED' ? 'REJECTED' : request.status,
        requestedAt: request.requestedAt,
        decidedAt: request.decidedAt,
        actionUrl: '/api/v2/draft-approvals/resolve',
      };
    }));
    const memoItems: ReviewQueueItem[] = memos.map((memo) => ({
      id: memo.id,
      kind: 'RESEARCH_MEMO',
      matterId: memo.matterId,
      targetId: memo.id,
      title: memo.memo.title,
      summary: memo.memo.executiveSummary.slice(0, 500),
      status: 'PENDING',
      requestedAt: memo.createdAt,
      actionUrl: `/api/v2/matters/${memo.matterId}/research-memos/${memo.id}/review`,
    }));
    return [...draftItems, ...memoItems].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }
}
