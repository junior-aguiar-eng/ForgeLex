import { LegalIssue, LegalThesis, ThesisMap } from '@forgelex/domain';
import { LegalIssueRepository, LegalThesisInput, LegalThesisRepository } from '@forgelex/persistence';

export interface StrategyContext {
  tenantId: string;
  userId: string;
  matterId: string;
}

export interface ThesisInput {
  title: string;
  statement: string;
  rationale?: string;
  issueIds?: string[];
  factIds?: string[];
  evidenceIds?: string[];
  authorityIds?: string[];
  status?: 'PROPOSED' | 'REVIEWED' | 'REJECTED';
}

export class StrategyService {
  public constructor(
    private readonly thesisRepository: LegalThesisRepository,
    private readonly issueRepository: LegalIssueRepository,
  ) {}

  public async identifyIssues(context: StrategyContext): Promise<LegalIssue[]> {
    return this.issueRepository.listIssues(context.tenantId, context.matterId);
  }

  public async createThesis(context: StrategyContext, input: ThesisInput): Promise<LegalThesis> {
    const thesisInput: LegalThesisInput = {
      tenantId: context.tenantId,
      matterId: context.matterId,
      createdBy: context.userId,
      ...input,
    };
    return this.thesisRepository.createThesis(thesisInput);
  }

  public async buildThesisMap(context: StrategyContext): Promise<ThesisMap> {
    const [issues, theses] = await Promise.all([
      this.identifyIssues(context),
      this.thesisRepository.listTheses(context.tenantId, context.matterId),
    ]);
    return {
      matterId: context.matterId,
      issues,
      theses,
      generatedAt: new Date().toISOString(),
    };
  }
}
