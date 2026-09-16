import { FactsEvidenceRepository } from '@forgelex/persistence';
import {
  EvidenceCoverage,
  EvidenceItem,
  EvidenceLink,
  EvidenceSourceLink,
  EvidenceSourceRelation,
  EvidenceType,
  Fact,
  FactCategory,
  FactSourceLink,
  FactSourceRelation,
  TimelineEvent,
} from '@forgelex/domain';

export interface FactsEvidenceContext {
  tenantId: string;
  userId: string;
  matterId?: string;
}

export interface CandidateFactInput {
  statement: string;
  category?: FactCategory;
  sourceAnchorId?: string;
}

export interface FactsListResponse {
  items: Fact[];
  coverage: EvidenceCoverage[];
}

export interface FactSupportResponse {
  fact: Fact;
  sourceLinks: FactSourceLink[];
  evidenceLinks: EvidenceLink[];
  evidenceSourceLinks: EvidenceSourceLink[];
  coverage: EvidenceCoverage;
}

export interface EvidenceMappingInput {
  factId: string;
  evidenceItemId?: string;
  evidence?: {
    title: string;
    description?: string;
    evidenceType?: EvidenceType;
    status?: 'AVAILABLE' | 'MISSING' | 'CONTESTED';
  };
  anchorIds?: string[];
  relation?: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
  note?: string;
}

export interface EvidenceMappingResponse {
  evidence: EvidenceItem;
  evidenceLink: EvidenceLink;
  sourceLinks: EvidenceSourceLink[];
}

export class FactsEvidenceService {
  public constructor(private readonly repository: FactsEvidenceRepository) {}

  public async extractCandidateFacts(
    context: FactsEvidenceContext,
    input: { matterId?: string; facts: CandidateFactInput[] },
  ): Promise<Fact[]> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    const facts: Fact[] = [];
    for (const candidate of input.facts) {
      const fact = await this.repository.createFact({
        tenantId: context.tenantId,
        matterId,
        createdBy: context.userId,
        statement: candidate.statement,
        category: candidate.category,
        status: 'ASSERTED',
      });
      if (candidate.sourceAnchorId) {
        await this.repository.linkFactToAnchor({
          tenantId: context.tenantId,
          matterId,
          factId: fact.id,
          documentAnchorId: candidate.sourceAnchorId,
          relation: 'SUPPORTS',
        });
      }
      facts.push(fact);
    }
    return facts;
  }

  public async listFacts(context: FactsEvidenceContext, inputMatterId?: string): Promise<FactsListResponse> {
    const matterId = this.resolveMatterId(inputMatterId, context.matterId);
    const [items, coverage] = await Promise.all([
      this.repository.listFacts(context.tenantId, matterId),
      this.repository.getEvidenceCoverage(context.tenantId, matterId),
    ]);
    return { items, coverage };
  }

  public async findSupport(
    context: FactsEvidenceContext,
    input: { matterId?: string; factId: string },
  ): Promise<FactSupportResponse> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    return await this.repository.getFactSupport(context.tenantId, matterId, input.factId);
  }

  public async mapEvidenceSupport(
    context: FactsEvidenceContext,
    input: EvidenceMappingInput & { matterId?: string },
  ): Promise<EvidenceMappingResponse> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    if (!(await this.repository.getFact(context.tenantId, matterId, input.factId))) {
      throw new Error('FACT_NOT_FOUND: fato não localizado no matter do tenant autenticado.');
    }
    const evidence = input.evidenceItemId
      ? await this.repository.getEvidenceItem(context.tenantId, matterId, input.evidenceItemId)
      : input.evidence
        ? await this.repository.createEvidenceItem({
            tenantId: context.tenantId,
            matterId,
            createdBy: context.userId,
            ...input.evidence,
          })
        : undefined;
    if (!evidence) {
      throw new Error(
        input.evidenceItemId
          ? 'EVIDENCE_NOT_FOUND: item de prova não localizado no matter do tenant autenticado.'
          : 'EVIDENCE_REQUIRED: informe evidenceItemId ou os dados de um novo item de prova.',
      );
    }

    const evidenceLink = await this.repository.linkEvidenceToFact({
      tenantId: context.tenantId,
      matterId,
      factId: input.factId,
      evidenceItemId: evidence.id,
      relation: input.relation ?? 'SUPPORTS',
      note: input.note,
    });
    for (const anchorId of input.anchorIds ?? []) {
      await this.repository.linkEvidenceToAnchor({
        tenantId: context.tenantId,
        matterId,
        evidenceItemId: evidence.id,
        documentAnchorId: anchorId,
        relation: this.toEvidenceSourceRelation(input.relation ?? 'SUPPORTS'),
        note: input.note,
      });
    }
    return {
      evidence,
      evidenceLink,
      sourceLinks: await this.repository.listEvidenceSourceLinks(context.tenantId, matterId, evidence.id),
    };
  }

  public async linkFactToAnchor(context: FactsEvidenceContext, input: {
    matterId?: string;
    factId: string;
    documentAnchorId: string;
    relation: FactSourceRelation;
    note?: string;
  }): Promise<FactSourceLink> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    return await this.repository.linkFactToAnchor({
      tenantId: context.tenantId,
      matterId,
      factId: input.factId,
      documentAnchorId: input.documentAnchorId,
      relation: input.relation,
      note: input.note,
    });
  }

  public async linkEvidenceToFact(context: FactsEvidenceContext, input: {
    matterId?: string;
    factId: string;
    evidenceItemId: string;
    relation: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
    note?: string;
  }): Promise<EvidenceLink> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    return await this.repository.linkEvidenceToFact({
      tenantId: context.tenantId,
      matterId,
      factId: input.factId,
      evidenceItemId: input.evidenceItemId,
      relation: input.relation,
      note: input.note,
    });
  }

  public async getCoverage(context: FactsEvidenceContext, inputMatterId?: string): Promise<EvidenceCoverage[]> {
    const matterId = this.resolveMatterId(inputMatterId, context.matterId);
    return await this.repository.getEvidenceCoverage(context.tenantId, matterId);
  }

  public async createFact(context: FactsEvidenceContext, input: {
    matterId?: string;
    statement: string;
    category?: FactCategory;
    status?: 'ASSERTED' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED';
  }): Promise<Fact> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    return await this.repository.createFact({
      tenantId: context.tenantId,
      matterId,
      createdBy: context.userId,
      statement: input.statement,
      category: input.category,
      status: input.status,
    });
  }

  public async listEvidence(context: FactsEvidenceContext, inputMatterId?: string): Promise<EvidenceItem[]> {
    const matterId = this.resolveMatterId(inputMatterId, context.matterId);
    return await this.repository.listEvidenceItems(context.tenantId, matterId);
  }

  public async createEvidence(context: FactsEvidenceContext, input: {
    matterId?: string;
    title: string;
    description?: string;
    evidenceType?: EvidenceType;
    status?: 'AVAILABLE' | 'MISSING' | 'CONTESTED';
  }): Promise<EvidenceItem> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    return await this.repository.createEvidenceItem({
      tenantId: context.tenantId,
      matterId,
      createdBy: context.userId,
      title: input.title,
      description: input.description,
      evidenceType: input.evidenceType,
      status: input.status,
    });
  }

  public async listTimeline(context: FactsEvidenceContext, inputMatterId?: string): Promise<TimelineEvent[]> {
    const matterId = this.resolveMatterId(inputMatterId, context.matterId);
    return await this.repository.listTimelineEvents(context.tenantId, matterId);
  }

  public async createTimeline(context: FactsEvidenceContext, input: {
    matterId?: string;
    title: string;
    eventDate: string;
    description?: string;
    sourceAnchorId?: string;
  }): Promise<TimelineEvent> {
    const matterId = this.resolveMatterId(input.matterId, context.matterId);
    return await this.repository.createTimelineEvent({
      tenantId: context.tenantId,
      matterId,
      createdBy: context.userId,
      title: input.title,
      eventDate: input.eventDate,
      description: input.description,
      sourceAnchorId: input.sourceAnchorId,
    });
  }

  private resolveMatterId(inputMatterId: string | undefined, contextMatterId: string | undefined): string {
    if (inputMatterId && contextMatterId && inputMatterId !== contextMatterId) {
      throw new Error('MATTER_SCOPE_MISMATCH: matter do parâmetro diverge do matter do contexto.');
    }
    const matterId = inputMatterId ?? contextMatterId;
    if (!matterId) throw new Error('MATTER_REQUIRED: informe o matter da operação.');
    return matterId;
  }

  private toEvidenceSourceRelation(relation: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT'): EvidenceSourceRelation {
    if (relation === 'SUPPORTS') return 'PROVES';
    if (relation === 'CONTRADICTS') return 'REFUTES';
    return 'CONTEXT';
  }
}
