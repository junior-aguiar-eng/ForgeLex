import {
  DraftReviewFinding,
  DraftReviewFindingSchema,
  DraftReviewSeverity,
  DraftReviewType,
} from '@forgelex/domain';
import { DraftRepository } from '@forgelex/persistence';
import { FactsEvidenceService } from '../facts-evidence/facts-evidence-service.js';
import { DraftContext } from '../drafting/draft-service.js';

export interface ReviewResult {
  draftId: string;
  draftVersionId: string;
  findings: DraftReviewFinding[];
  blockingCount: number;
  warningCount: number;
  status: 'PASSED' | 'WARNINGS' | 'BLOCKED';
}

type DraftReviewFindingInput = Omit<DraftReviewFinding, 'id' | 'createdAt'>;

export class DraftReviewService {
  public constructor(
    private readonly repository: DraftRepository,
    private readonly factsEvidenceService: FactsEvidenceService,
  ) {}

  public async verifyCitations(context: DraftContext, draftId: string, versionId?: string): Promise<ReviewResult> {
    const version = await this.requireVersion(context, draftId, versionId);
    const findings = version.citations.flatMap((citation) => {
      if (!citation.verified) {
        return [this.finding(context, draftId, version.version.id, 'CITATION', 'BLOCKING', 'CITATION_NOT_VERIFIED', 'A citação não possui verificação positiva.', citation.sectionId, citation.targetId)];
      }
      const section = version.sections.find((item) => item.id === citation.sectionId);
      const linkedIds = citation.targetType === 'AUTHORITY'
        ? section?.linkedAuthorityIds ?? []
        : citation.targetType === 'FACT'
          ? section?.linkedFactIds ?? []
          : section?.linkedEvidenceIds ?? [];
      return linkedIds.includes(citation.targetId)
        ? []
        : [this.finding(context, draftId, version.version.id, 'CITATION', 'BLOCKING', 'CITATION_TARGET_NOT_LINKED', 'A citação verificada não está vinculada à seção correspondente.', citation.sectionId, citation.targetId)];
    });
    if (version.citations.length === 0) {
      findings.push(this.finding(context, draftId, version.version.id, 'CITATION', 'WARNING', 'CITATIONS_MISSING', 'A versão não possui âncoras de citação registradas.'));
    }
    return this.persistResult(draftId, version.version.id, findings);
  }

  public async checkFactSupport(context: DraftContext, draftId: string, versionId?: string): Promise<ReviewResult> {
    const version = await this.requireVersion(context, draftId, versionId);
    const facts = await this.factsEvidenceService.listFacts({
      tenantId: context.tenantId,
      userId: context.userId,
      matterId: context.matterId,
    });
    const factsById = new Map(facts.items.map((fact) => [fact.id, fact]));
    const coverageByFactId = new Map(facts.coverage.map((item) => [item.factId, item]));
    const linkedFactIds = [...new Set(version.sections.flatMap((section) => section.linkedFactIds))];
    const findings = linkedFactIds.flatMap((factId) => {
      const fact = factsById.get(factId);
      if (!fact) return [this.finding(context, draftId, version.version.id, 'FACT_SUPPORT', 'BLOCKING', 'FACT_NOT_FOUND', 'A seção referencia um fato que não pertence ao matter autenticado.', undefined, factId)];
      const coverage = coverageByFactId.get(factId);
      if (!coverage || coverage.coverage === 'UNSUPPORTED' || coverage.coverage === 'CONFLICTING') {
        return [this.finding(context, draftId, version.version.id, 'FACT_SUPPORT', 'BLOCKING', 'FACT_SUPPORT_INSUFFICIENT', `O fato "${fact.statement}" não possui cobertura suficiente para uso sem revisão.`, undefined, factId)];
      }
      if (coverage.coverage === 'PARTIAL') {
        return [this.finding(context, draftId, version.version.id, 'FACT_SUPPORT', 'WARNING', 'FACT_SUPPORT_PARTIAL', `O fato "${fact.statement}" possui cobertura parcial.`, undefined, factId)];
      }
      return [];
    });
    if (linkedFactIds.length === 0) findings.push(this.finding(context, draftId, version.version.id, 'FACT_SUPPORT', 'WARNING', 'FACTS_NOT_LINKED', 'A versão não possui fatos vinculados às seções.'));
    return this.persistResult(draftId, version.version.id, findings);
  }

  public async adversarialReview(context: DraftContext, draftId: string, versionId?: string): Promise<ReviewResult> {
    const version = await this.requireVersion(context, draftId, versionId);
    const findings: DraftReviewFindingInput[] = [];
    const emptySections = version.sections.filter((section) => section.content.trim().length === 0);
    for (const section of emptySections) {
      findings.push(this.finding(context, draftId, version.version.id, 'ADVERSARIAL', 'BLOCKING', 'SECTION_CONTENT_EMPTY', `A seção "${section.title}" não possui conteúdo.`, section.id));
    }
    if (version.sections.every((section) => section.linkedAuthorityIds.length === 0)) {
      findings.push(this.finding(context, draftId, version.version.id, 'ADVERSARIAL', 'WARNING', 'AUTHORITIES_NOT_LINKED', 'Nenhuma autoridade está vinculada à versão.'));
    }
    if (version.sections.every((section) => section.linkedFactIds.length === 0)) {
      findings.push(this.finding(context, draftId, version.version.id, 'ADVERSARIAL', 'WARNING', 'FACTS_NOT_LINKED', 'Nenhum fato está vinculado à versão.'));
    }
    if (version.sections.length < 2) {
      findings.push(this.finding(context, draftId, version.version.id, 'ADVERSARIAL', 'WARNING', 'OUTLINE_TOO_SMALL', 'A versão possui uma única seção; revisar a estrutura antes da aprovação.'));
    }
    return this.persistResult(draftId, version.version.id, findings);
  }

  public async runAll(context: DraftContext, draftId: string, versionId?: string): Promise<ReviewResult> {
    const results = await Promise.all([
      this.verifyCitations(context, draftId, versionId),
      this.checkFactSupport(context, draftId, versionId),
      this.adversarialReview(context, draftId, versionId),
    ]);
    const findings = results.flatMap((result) => result.findings);
    return this.summarize(draftId, results[0].draftVersionId, findings);
  }

  private async requireVersion(context: DraftContext, draftId: string, versionId?: string) {
    const version = versionId
      ? await this.repository.getVersion(context.tenantId, context.matterId, draftId, versionId)
      : await this.repository.getCurrentVersion(context.tenantId, context.matterId, draftId);
    if (!version) throw new Error('DRAFT_VERSION_NOT_FOUND: versão não localizada no matter do tenant autenticado.');
    return version;
  }

  private finding(
    context: DraftContext,
    draftId: string,
    draftVersionId: string,
    reviewType: DraftReviewType,
    severity: DraftReviewSeverity,
    code: string,
    message: string,
    sectionId?: string,
    targetId?: string,
  ): Omit<DraftReviewFinding, 'id' | 'createdAt'> {
    return DraftReviewFindingSchema.omit({ id: true, createdAt: true }).parse({
      tenantId: context.tenantId,
      matterId: context.matterId,
      draftId,
      draftVersionId,
      reviewType,
      severity,
      code,
      message,
      sectionId,
      targetId,
    });
  }

  private async persistResult(draftId: string, draftVersionId: string, findings: DraftReviewFindingInput[]): Promise<ReviewResult> {
    const created = await this.repository.createReviewFindings(findings);
    return this.summarize(draftId, draftVersionId, created);
  }

  private summarize(draftId: string, draftVersionId: string, findings: DraftReviewFinding[]): ReviewResult {
    const blockingCount = findings.filter((finding) => finding.severity === 'BLOCKING').length;
    const warningCount = findings.filter((finding) => finding.severity === 'WARNING').length;
    return {
      draftId,
      draftVersionId,
      findings,
      blockingCount,
      warningCount,
      status: blockingCount > 0 ? 'BLOCKED' : warningCount > 0 ? 'WARNINGS' : 'PASSED',
    };
  }
}
