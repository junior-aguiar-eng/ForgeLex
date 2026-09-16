import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  EvidenceCoverage,
  EvidenceCoverageSchema,
  EvidenceItem,
  EvidenceItemSchema,
  EvidenceLink,
  EvidenceLinkSchema,
  EvidenceSourceLink,
  EvidenceSourceLinkSchema,
  EvidenceSourceRelation,
  EvidenceType,
  Fact,
  FactEvidenceRelation,
  FactSchema,
  FactSourceLink,
  FactSourceLinkSchema,
  FactSourceRelation,
  FactCategory,
  FactStatus,
  TimelineEvent,
  TimelineEventSchema,
} from '@forgelex/domain';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';

function toFact(row: typeof schema.facts.$inferSelect): Fact {
  return FactSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    statement: row.statement,
    category: row.category,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toFactSourceLink(row: typeof schema.factSourceLinks.$inferSelect): FactSourceLink {
  return FactSourceLinkSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    factId: row.factId,
    documentAnchorId: row.documentAnchorId,
    relation: row.relation,
    note: row.note ?? undefined,
    createdAt: row.createdAt,
  });
}

function toEvidenceItem(row: typeof schema.evidenceItems.$inferSelect): EvidenceItem {
  return EvidenceItemSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    title: row.title,
    description: row.description ?? undefined,
    evidenceType: row.evidenceType,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toEvidenceSourceLink(row: typeof schema.evidenceSourceLinks.$inferSelect): EvidenceSourceLink {
  return EvidenceSourceLinkSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    evidenceItemId: row.evidenceItemId,
    documentAnchorId: row.documentAnchorId,
    relation: row.relation,
    note: row.note ?? undefined,
    createdAt: row.createdAt,
  });
}

function toEvidenceLink(row: typeof schema.evidenceLinks.$inferSelect): EvidenceLink {
  return EvidenceLinkSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    factId: row.factId,
    evidenceItemId: row.evidenceItemId,
    relation: row.relation,
    note: row.note ?? undefined,
    createdAt: row.createdAt,
  });
}

function toTimelineEvent(row: typeof schema.timelineEvents.$inferSelect): TimelineEvent {
  return TimelineEventSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    title: row.title,
    eventDate: row.eventDate,
    description: row.description ?? undefined,
    sourceAnchorId: row.sourceAnchorId ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  });
}

export interface FactSupport {
  fact: Fact;
  sourceLinks: FactSourceLink[];
  evidenceLinks: EvidenceLink[];
  evidenceSourceLinks: EvidenceSourceLink[];
  coverage: EvidenceCoverage;
}

export class FactsEvidenceRepository {
  private readonly matterRepository: MatterRepository;

  public constructor(private readonly db: ForgeLexDatabase) {
    this.matterRepository = new MatterRepository(db);
  }

  public async createFact(input: {
    tenantId: string;
    matterId: string;
    createdBy: string;
    statement: string;
    category?: FactCategory;
    status?: FactStatus;
  }): Promise<Fact> {
    await this.requireMatter(input.tenantId, input.matterId);
    const now = new Date().toISOString();
    const fact = FactSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      statement: input.statement,
      category: input.category ?? 'FACTUAL',
      status: input.status ?? 'ASSERTED',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.insert(schema.facts).values({ ...fact });
    return fact;
  }

  public async listFacts(tenantId: string, matterId: string): Promise<Fact[]> {
    const rows = await this.db
      .select({ fact: schema.facts })
      .from(schema.facts)
      .innerJoin(schema.matters, eq(schema.facts.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.facts.tenantId, tenantId),
          eq(schema.facts.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.facts.createdAt));
    return rows.map((row) => toFact(row.fact));
  }

  public async getFact(tenantId: string, matterId: string, factId: string): Promise<Fact | undefined> {
    const rows = await this.db
      .select({ fact: schema.facts })
      .from(schema.facts)
      .innerJoin(schema.matters, eq(schema.facts.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.facts.id, factId),
          eq(schema.facts.tenantId, tenantId),
          eq(schema.facts.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .limit(1);
    return rows[0] ? toFact(rows[0].fact) : undefined;
  }

  public async linkFactToAnchor(input: {
    tenantId: string;
    matterId: string;
    factId: string;
    documentAnchorId: string;
    relation: FactSourceRelation;
    note?: string;
  }): Promise<FactSourceLink> {
    await this.requireFact(input.tenantId, input.matterId, input.factId);
    await this.requireAnchor(input.tenantId, input.matterId, input.documentAnchorId);
    const link = FactSourceLinkSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      factId: input.factId,
      documentAnchorId: input.documentAnchorId,
      relation: input.relation,
      note: input.note,
      createdAt: new Date().toISOString(),
    });
    await this.db.insert(schema.factSourceLinks).values({ ...link });
    return link;
  }

  public async listFactSourceLinks(
    tenantId: string,
    matterId: string,
    factId?: string,
  ): Promise<FactSourceLink[]> {
    const conditions = [
      eq(schema.factSourceLinks.tenantId, tenantId),
      eq(schema.factSourceLinks.matterId, matterId),
      eq(schema.facts.tenantId, tenantId),
      eq(schema.facts.matterId, matterId),
      eq(schema.matters.tenantId, tenantId),
    ];
    if (factId) conditions.push(eq(schema.factSourceLinks.factId, factId));
    const rows = await this.db
      .select({ link: schema.factSourceLinks })
      .from(schema.factSourceLinks)
      .innerJoin(schema.facts, eq(schema.factSourceLinks.factId, schema.facts.id))
      .innerJoin(schema.matters, eq(schema.facts.matterId, schema.matters.id))
      .where(and(...conditions))
      .orderBy(asc(schema.factSourceLinks.createdAt));
    return rows.map((row) => toFactSourceLink(row.link));
  }

  public async createEvidenceItem(input: {
    tenantId: string;
    matterId: string;
    createdBy: string;
    title: string;
    description?: string;
    evidenceType?: EvidenceType;
    status?: 'AVAILABLE' | 'MISSING' | 'CONTESTED';
  }): Promise<EvidenceItem> {
    await this.requireMatter(input.tenantId, input.matterId);
    const now = new Date().toISOString();
    const item = EvidenceItemSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      title: input.title,
      description: input.description,
      evidenceType: input.evidenceType ?? 'DOCUMENT',
      status: input.status ?? 'AVAILABLE',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.insert(schema.evidenceItems).values({ ...item });
    return item;
  }

  public async listEvidenceItems(tenantId: string, matterId: string): Promise<EvidenceItem[]> {
    const rows = await this.db
      .select({ item: schema.evidenceItems })
      .from(schema.evidenceItems)
      .innerJoin(schema.matters, eq(schema.evidenceItems.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.evidenceItems.tenantId, tenantId),
          eq(schema.evidenceItems.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.evidenceItems.createdAt));
    return rows.map((row) => toEvidenceItem(row.item));
  }

  public async getEvidenceItem(
    tenantId: string,
    matterId: string,
    evidenceItemId: string,
  ): Promise<EvidenceItem | undefined> {
    const rows = await this.db
      .select({ item: schema.evidenceItems })
      .from(schema.evidenceItems)
      .innerJoin(schema.matters, eq(schema.evidenceItems.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.evidenceItems.id, evidenceItemId),
          eq(schema.evidenceItems.tenantId, tenantId),
          eq(schema.evidenceItems.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .limit(1);
    return rows[0] ? toEvidenceItem(rows[0].item) : undefined;
  }

  public async linkEvidenceToAnchor(input: {
    tenantId: string;
    matterId: string;
    evidenceItemId: string;
    documentAnchorId: string;
    relation: EvidenceSourceRelation;
    note?: string;
  }): Promise<EvidenceSourceLink> {
    await this.requireEvidenceItem(input.tenantId, input.matterId, input.evidenceItemId);
    await this.requireAnchor(input.tenantId, input.matterId, input.documentAnchorId);
    const link = EvidenceSourceLinkSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      evidenceItemId: input.evidenceItemId,
      documentAnchorId: input.documentAnchorId,
      relation: input.relation,
      note: input.note,
      createdAt: new Date().toISOString(),
    });
    await this.db.insert(schema.evidenceSourceLinks).values({ ...link });
    return link;
  }

  public async listEvidenceSourceLinks(
    tenantId: string,
    matterId: string,
    evidenceItemId?: string,
  ): Promise<EvidenceSourceLink[]> {
    const conditions = [
      eq(schema.evidenceSourceLinks.tenantId, tenantId),
      eq(schema.evidenceSourceLinks.matterId, matterId),
      eq(schema.evidenceItems.tenantId, tenantId),
      eq(schema.evidenceItems.matterId, matterId),
      eq(schema.matters.tenantId, tenantId),
    ];
    if (evidenceItemId) conditions.push(eq(schema.evidenceSourceLinks.evidenceItemId, evidenceItemId));
    const rows = await this.db
      .select({ link: schema.evidenceSourceLinks })
      .from(schema.evidenceSourceLinks)
      .innerJoin(schema.evidenceItems, eq(schema.evidenceSourceLinks.evidenceItemId, schema.evidenceItems.id))
      .innerJoin(schema.matters, eq(schema.evidenceItems.matterId, schema.matters.id))
      .where(and(...conditions))
      .orderBy(asc(schema.evidenceSourceLinks.createdAt));
    return rows.map((row) => toEvidenceSourceLink(row.link));
  }

  public async linkEvidenceToFact(input: {
    tenantId: string;
    matterId: string;
    factId: string;
    evidenceItemId: string;
    relation: FactEvidenceRelation;
    note?: string;
  }): Promise<EvidenceLink> {
    await this.requireFact(input.tenantId, input.matterId, input.factId);
    await this.requireEvidenceItem(input.tenantId, input.matterId, input.evidenceItemId);
    const link = EvidenceLinkSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      factId: input.factId,
      evidenceItemId: input.evidenceItemId,
      relation: input.relation,
      note: input.note,
      createdAt: new Date().toISOString(),
    });
    await this.db.insert(schema.evidenceLinks).values({ ...link });
    return link;
  }

  public async listEvidenceLinks(
    tenantId: string,
    matterId: string,
    factId?: string,
  ): Promise<EvidenceLink[]> {
    const conditions = [
      eq(schema.evidenceLinks.tenantId, tenantId),
      eq(schema.evidenceLinks.matterId, matterId),
      eq(schema.facts.tenantId, tenantId),
      eq(schema.facts.matterId, matterId),
      eq(schema.evidenceItems.tenantId, tenantId),
      eq(schema.evidenceItems.matterId, matterId),
      eq(schema.matters.tenantId, tenantId),
    ];
    if (factId) conditions.push(eq(schema.evidenceLinks.factId, factId));
    const rows = await this.db
      .select({ link: schema.evidenceLinks })
      .from(schema.evidenceLinks)
      .innerJoin(schema.facts, eq(schema.evidenceLinks.factId, schema.facts.id))
      .innerJoin(schema.evidenceItems, eq(schema.evidenceLinks.evidenceItemId, schema.evidenceItems.id))
      .innerJoin(schema.matters, eq(schema.facts.matterId, schema.matters.id))
      .where(and(...conditions))
      .orderBy(asc(schema.evidenceLinks.createdAt));
    return rows.map((row) => toEvidenceLink(row.link));
  }

  public async getEvidenceCoverage(tenantId: string, matterId: string): Promise<EvidenceCoverage[]> {
    const facts = await this.listFacts(tenantId, matterId);
    const sourceLinks = await this.listFactSourceLinks(tenantId, matterId);
    const evidenceLinks = await this.listEvidenceLinks(tenantId, matterId);
    const calculatedAt = new Date().toISOString();

    return facts.map((fact) => {
      const factSourceLinks = sourceLinks.filter((link) => link.factId === fact.id);
      const factEvidenceLinks = evidenceLinks.filter((link) => link.factId === fact.id);
      const supportingEvidenceCount = factEvidenceLinks.filter((link) => link.relation === 'SUPPORTS').length;
      const contradictingEvidenceCount = factEvidenceLinks.filter((link) => link.relation === 'CONTRADICTS').length;
      const contextualEvidenceCount = factEvidenceLinks.filter((link) => link.relation === 'CONTEXT').length;
      const supportingAnchorCount = factSourceLinks.filter((link) => link.relation === 'SUPPORTS').length;
      const contradictingAnchorCount = factSourceLinks.filter((link) => link.relation === 'CONTRADICTS').length;
      const contextualAnchorCount = factSourceLinks.filter((link) => link.relation === 'CONTEXT').length;
      const hasSupport = supportingEvidenceCount > 0 || supportingAnchorCount > 0;
      const hasContradiction = contradictingEvidenceCount > 0 || contradictingAnchorCount > 0;
      const hasContext = contextualEvidenceCount > 0 || contextualAnchorCount > 0;
      const coverage = hasContradiction && hasSupport
        ? 'CONFLICTING'
        : hasSupport
          ? 'SUPPORTED'
          : hasContext
            ? 'PARTIAL'
            : 'UNSUPPORTED';

      return EvidenceCoverageSchema.parse({
        id: randomUUID(),
        tenantId,
        matterId,
        factId: fact.id,
        supportingEvidenceCount,
        contradictingEvidenceCount,
        contextualEvidenceCount,
        supportingAnchorCount,
        contradictingAnchorCount,
        coverage,
        calculatedAt,
      });
    });
  }

  public async getFactSupport(tenantId: string, matterId: string, factId: string): Promise<FactSupport> {
    const fact = await this.getFact(tenantId, matterId, factId);
    if (!fact) throw new Error('FACT_NOT_FOUND: fato não localizado no matter do tenant autenticado.');
    const [sourceLinks, evidenceLinks, evidenceSourceLinks, coverage] = await Promise.all([
      this.listFactSourceLinks(tenantId, matterId, factId),
      this.listEvidenceLinks(tenantId, matterId, factId),
      this.listEvidenceSourceLinks(tenantId, matterId),
      this.getEvidenceCoverage(tenantId, matterId),
    ]);
    return {
      fact,
      sourceLinks,
      evidenceLinks,
      evidenceSourceLinks: evidenceSourceLinks.filter((link) =>
        evidenceLinks.some((evidenceLink) => evidenceLink.evidenceItemId === link.evidenceItemId),
      ),
      coverage: coverage.find((item) => item.factId === factId) ?? this.emptyCoverage(tenantId, matterId, factId),
    };
  }

  public async createTimelineEvent(input: {
    tenantId: string;
    matterId: string;
    createdBy: string;
    title: string;
    eventDate: string;
    description?: string;
    sourceAnchorId?: string;
  }): Promise<TimelineEvent> {
    await this.requireMatter(input.tenantId, input.matterId);
    if (input.sourceAnchorId) {
      await this.requireAnchor(input.tenantId, input.matterId, input.sourceAnchorId);
    }
    const event = TimelineEventSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      title: input.title,
      eventDate: input.eventDate,
      description: input.description,
      sourceAnchorId: input.sourceAnchorId,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    });
    await this.db.insert(schema.timelineEvents).values({ ...event });
    return event;
  }

  public async listTimelineEvents(tenantId: string, matterId: string): Promise<TimelineEvent[]> {
    const rows = await this.db
      .select({ event: schema.timelineEvents })
      .from(schema.timelineEvents)
      .innerJoin(schema.matters, eq(schema.timelineEvents.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.timelineEvents.tenantId, tenantId),
          eq(schema.timelineEvents.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .orderBy(asc(schema.timelineEvents.eventDate), asc(schema.timelineEvents.createdAt));
    return rows.map((row) => toTimelineEvent(row.event));
  }

  private async requireMatter(tenantId: string, matterId: string): Promise<void> {
    if (!(await this.matterRepository.getMatter(tenantId, matterId))) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }
  }

  private async requireFact(tenantId: string, matterId: string, factId: string): Promise<void> {
    if (!(await this.getFact(tenantId, matterId, factId))) {
      throw new Error('FACT_NOT_FOUND: fato não localizado no matter do tenant autenticado.');
    }
  }

  private async requireEvidenceItem(tenantId: string, matterId: string, evidenceItemId: string): Promise<void> {
    if (!(await this.getEvidenceItem(tenantId, matterId, evidenceItemId))) {
      throw new Error('EVIDENCE_NOT_FOUND: item de prova não localizado no matter do tenant autenticado.');
    }
  }

  private async requireAnchor(tenantId: string, matterId: string, documentAnchorId: string): Promise<void> {
    const rows = await this.db
      .select({ id: schema.documentAnchors.id })
      .from(schema.documentAnchors)
      .innerJoin(schema.documentVersions, eq(schema.documentAnchors.documentVersionId, schema.documentVersions.id))
      .innerJoin(schema.legalDocuments, eq(schema.documentVersions.documentId, schema.legalDocuments.id))
      .innerJoin(schema.matters, eq(schema.legalDocuments.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.documentAnchors.id, documentAnchorId),
          eq(schema.legalDocuments.tenantId, tenantId),
          eq(schema.legalDocuments.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
          eq(schema.matters.id, matterId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new Error('ANCHOR_NOT_FOUND: âncora não localizada no matter do tenant autenticado.');
    }
  }

  private emptyCoverage(tenantId: string, matterId: string, factId: string): EvidenceCoverage {
    return EvidenceCoverageSchema.parse({
      id: randomUUID(),
      tenantId,
      matterId,
      factId,
      supportingEvidenceCount: 0,
      contradictingEvidenceCount: 0,
      contextualEvidenceCount: 0,
      supportingAnchorCount: 0,
      contradictingAnchorCount: 0,
      coverage: 'UNSUPPORTED',
      calculatedAt: new Date().toISOString(),
    });
  }
}
