import { and, asc, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import {
  ApprovalDecision,
  ApprovalDecisionSchema,
  ApprovalRequest,
  ApprovalRequestSchema,
  ApprovalToken,
  ApprovalTokenSchema,
  CitationAnchor,
  CitationAnchorSchema,
  Draft,
  DraftReviewFinding,
  DraftReviewFindingSchema,
  DraftSchema,
  DraftSection,
  DraftSectionSchema,
  DraftVersion,
  DraftVersionSchema,
} from '@forgelex/domain';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';

function parseIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
}

function toDraft(row: typeof schema.drafts.$inferSelect): Draft {
  return DraftSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    title: row.title,
    status: row.status,
    currentVersionId: row.currentVersionId ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDraftVersion(row: typeof schema.draftVersions.$inferSelect): DraftVersion {
  return DraftVersionSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    draftId: row.draftId,
    versionNumber: row.versionNumber,
    source: row.source,
    contentHash: row.contentHash,
    status: row.status,
    createdBy: row.createdBy,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
  });
}

function toDraftSection(row: typeof schema.draftSections.$inferSelect): DraftSection {
  return DraftSectionSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    draftId: row.draftId,
    draftVersionId: row.draftVersionId,
    ordinal: row.ordinal,
    title: row.title,
    content: row.content,
    linkedFactIds: parseIds(row.linkedFactIds),
    linkedEvidenceIds: parseIds(row.linkedEvidenceIds),
    linkedAuthorityIds: parseIds(row.linkedAuthorityIds),
    createdAt: row.createdAt,
  });
}

function toCitationAnchor(row: typeof schema.citationAnchors.$inferSelect): CitationAnchor {
  return CitationAnchorSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    draftId: row.draftId,
    draftVersionId: row.draftVersionId,
    sectionId: row.sectionId,
    targetType: row.targetType,
    targetId: row.targetId,
    citationText: row.citationText,
    verified: row.verified,
    createdAt: row.createdAt,
  });
}

function toReviewFinding(row: typeof schema.draftReviewFindings.$inferSelect): DraftReviewFinding {
  return DraftReviewFindingSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    draftId: row.draftId,
    draftVersionId: row.draftVersionId,
    reviewType: row.reviewType,
    severity: row.severity,
    code: row.code,
    message: row.message,
    sectionId: row.sectionId ?? undefined,
    targetId: row.targetId ?? undefined,
    createdAt: row.createdAt,
  });
}

function toApprovalRequest(row: typeof schema.draftApprovalRequests.$inferSelect): ApprovalRequest {
  return ApprovalRequestSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    draftId: row.draftId,
    draftVersionId: row.draftVersionId,
    requestedBy: row.requestedBy,
    proposedAction: row.proposedAction,
    status: row.status,
    requestedAt: row.requestedAt,
    decidedAt: row.decidedAt ?? undefined,
    decidedBy: row.decidedBy ?? undefined,
    decisionReason: row.decisionReason ?? undefined,
  });
}

function toApprovalToken(row: typeof schema.draftApprovalTokens.$inferSelect): ApprovalToken {
  return ApprovalTokenSchema.parse({
    id: row.id,
    requestId: row.requestId,
    tenantId: row.tenantId,
    tokenHash: row.tokenHash,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt ?? undefined,
    usedAt: row.usedAt ?? undefined,
  });
}

export interface DraftSectionInput {
  ordinal: number;
  title: string;
  content: string;
  linkedFactIds?: string[];
  linkedEvidenceIds?: string[];
  linkedAuthorityIds?: string[];
}

export interface CitationAnchorInput {
  sectionOrdinal: number;
  targetType: 'AUTHORITY' | 'FACT' | 'EVIDENCE';
  targetId: string;
  citationText: string;
  verified: boolean;
}

export interface DraftVersionBundle {
  version: DraftVersion;
  sections: DraftSection[];
  citations: CitationAnchor[];
}

export interface ApprovalResolution {
  request: ApprovalRequest;
  decision: ApprovalDecision;
  token: ApprovalToken;
}

export class DraftRepository {
  private readonly matterRepository: MatterRepository;

  public constructor(private readonly db: ForgeLexDatabase) {
    this.matterRepository = new MatterRepository(db);
  }

  public async createDraft(input: {
    tenantId: string;
    matterId: string;
    title: string;
    createdBy: string;
  }): Promise<Draft> {
    await this.requireMatter(input.tenantId, input.matterId);
    const draft = DraftSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      title: input.title,
      status: 'DRAFT',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await this.db.insert(schema.drafts).values({ ...draft, currentVersionId: null });
    return draft;
  }

  public async getDraft(tenantId: string, matterId: string, draftId: string): Promise<Draft | undefined> {
    const rows = await this.db
      .select()
      .from(schema.drafts)
      .innerJoin(schema.matters, eq(schema.drafts.matterId, schema.matters.id))
      .where(and(
        eq(schema.drafts.id, draftId),
        eq(schema.drafts.tenantId, tenantId),
        eq(schema.drafts.matterId, matterId),
        eq(schema.matters.tenantId, tenantId),
      ))
      .limit(1);
    return rows[0] ? toDraft(rows[0].drafts) : undefined;
  }

  public async listDrafts(tenantId: string, matterId: string): Promise<Draft[]> {
    const rows = await this.db
      .select({ draft: schema.drafts })
      .from(schema.drafts)
      .innerJoin(schema.matters, eq(schema.drafts.matterId, schema.matters.id))
      .where(and(
        eq(schema.drafts.tenantId, tenantId),
        eq(schema.drafts.matterId, matterId),
        eq(schema.matters.tenantId, tenantId),
      ))
      .orderBy(desc(schema.drafts.updatedAt));
    return rows.map((row) => toDraft(row.draft));
  }

  public async createVersion(input: {
    tenantId: string;
    matterId: string;
    draftId: string;
    title: string;
    createdBy: string;
    source: 'HUMAN' | 'WORKFLOW' | 'SYSTEM';
    status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVAL_PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
    contentHash: string;
    notes?: string;
    sections: DraftSectionInput[];
    citations?: CitationAnchorInput[];
  }): Promise<DraftVersionBundle> {
    const draft = await this.getDraft(input.tenantId, input.matterId, input.draftId);
    if (!draft) throw new Error('DRAFT_NOT_FOUND: rascunho não localizado no matter do tenant autenticado.');
    if (input.sections.length === 0) throw new Error('DRAFT_SECTIONS_REQUIRED: a versão precisa conter ao menos uma seção.');

    const previousVersions = await this.listVersions(input.tenantId, input.matterId, input.draftId);
    const version = DraftVersionSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      draftId: input.draftId,
      versionNumber: (previousVersions[0]?.versionNumber ?? 0) + 1,
      source: input.source,
      contentHash: input.contentHash,
      status: input.status ?? 'DRAFT',
      createdBy: input.createdBy,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    });
    const createdAt = new Date().toISOString();
    const sections = input.sections.map((item) => DraftSectionSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      draftId: input.draftId,
      draftVersionId: version.id,
      ordinal: item.ordinal,
      title: item.title,
      content: item.content,
      linkedFactIds: item.linkedFactIds ?? [],
      linkedEvidenceIds: item.linkedEvidenceIds ?? [],
      linkedAuthorityIds: item.linkedAuthorityIds ?? [],
      createdAt,
    }));
    const sectionByOrdinal = new Map(sections.map((section) => [section.ordinal, section]));
    const citations = (input.citations ?? []).map((item) => {
      const section = sectionByOrdinal.get(item.sectionOrdinal);
      if (!section) throw new Error(`DRAFT_SECTION_NOT_FOUND: ordinal ${item.sectionOrdinal} não existe na versão.`);
      return CitationAnchorSchema.parse({
        id: randomUUID(),
        tenantId: input.tenantId,
        matterId: input.matterId,
        draftId: input.draftId,
        draftVersionId: version.id,
        sectionId: section.id,
        targetType: item.targetType,
        targetId: item.targetId,
        citationText: item.citationText,
        verified: item.verified,
        createdAt,
      });
    });

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.draftVersions).values({ ...version });
      await tx.insert(schema.draftSections).values(sections.map((section) => ({
        ...section,
        linkedFactIds: JSON.stringify(section.linkedFactIds),
        linkedEvidenceIds: JSON.stringify(section.linkedEvidenceIds),
        linkedAuthorityIds: JSON.stringify(section.linkedAuthorityIds),
      })));
      if (citations.length > 0) await tx.insert(schema.citationAnchors).values(citations.map((citation) => ({ ...citation })));
      await tx.update(schema.drafts).set({
        title: input.title,
        status: version.status,
        currentVersionId: version.id,
        updatedAt: createdAt,
      }).where(and(
        eq(schema.drafts.id, input.draftId),
        eq(schema.drafts.tenantId, input.tenantId),
        eq(schema.drafts.matterId, input.matterId),
      ));
    });
    return { version, sections, citations };
  }

  public async getCurrentVersion(tenantId: string, matterId: string, draftId: string): Promise<DraftVersionBundle | undefined> {
    const draft = await this.getDraft(tenantId, matterId, draftId);
    if (!draft?.currentVersionId) return undefined;
    return this.getVersion(tenantId, matterId, draftId, draft.currentVersionId);
  }

  public async getVersion(tenantId: string, matterId: string, draftId: string, versionId: string): Promise<DraftVersionBundle | undefined> {
    const versionRows = await this.db
      .select({ version: schema.draftVersions })
      .from(schema.draftVersions)
      .innerJoin(schema.drafts, eq(schema.draftVersions.draftId, schema.drafts.id))
      .innerJoin(schema.matters, eq(schema.draftVersions.matterId, schema.matters.id))
      .where(and(
        eq(schema.draftVersions.id, versionId),
        eq(schema.draftVersions.draftId, draftId),
        eq(schema.draftVersions.tenantId, tenantId),
        eq(schema.draftVersions.matterId, matterId),
        eq(schema.drafts.tenantId, tenantId),
        eq(schema.matters.tenantId, tenantId),
      ))
      .limit(1);
    if (!versionRows[0]) return undefined;
    const sections = await this.db.select().from(schema.draftSections)
      .where(and(eq(schema.draftSections.draftVersionId, versionId), eq(schema.draftSections.tenantId, tenantId)))
      .orderBy(asc(schema.draftSections.ordinal));
    const citations = await this.db.select().from(schema.citationAnchors)
      .where(and(eq(schema.citationAnchors.draftVersionId, versionId), eq(schema.citationAnchors.tenantId, tenantId)))
      .orderBy(asc(schema.citationAnchors.createdAt));
    return {
      version: toDraftVersion(versionRows[0].version),
      sections: sections.map(toDraftSection),
      citations: citations.map(toCitationAnchor),
    };
  }

  public async listVersions(tenantId: string, matterId: string, draftId: string): Promise<DraftVersion[]> {
    const rows = await this.db
      .select({ version: schema.draftVersions })
      .from(schema.draftVersions)
      .innerJoin(schema.drafts, eq(schema.draftVersions.draftId, schema.drafts.id))
      .innerJoin(schema.matters, eq(schema.draftVersions.matterId, schema.matters.id))
      .where(and(
        eq(schema.draftVersions.tenantId, tenantId),
        eq(schema.draftVersions.matterId, matterId),
        eq(schema.draftVersions.draftId, draftId),
        eq(schema.drafts.tenantId, tenantId),
        eq(schema.matters.tenantId, tenantId),
      ))
      .orderBy(desc(schema.draftVersions.versionNumber));
    return rows.map((row) => toDraftVersion(row.version));
  }

  public async createReviewFindings(findings: Omit<DraftReviewFinding, 'id' | 'createdAt'>[]): Promise<DraftReviewFinding[]> {
    const now = new Date().toISOString();
    const values = findings.map((finding) => DraftReviewFindingSchema.parse({ ...finding, id: randomUUID(), createdAt: now }));
    if (values.length > 0) await this.db.insert(schema.draftReviewFindings).values(values.map((finding) => ({ ...finding })));
    return values;
  }

  public async listReviewFindings(tenantId: string, matterId: string, draftId: string, versionId?: string): Promise<DraftReviewFinding[]> {
    const conditions = [
      eq(schema.draftReviewFindings.tenantId, tenantId),
      eq(schema.draftReviewFindings.matterId, matterId),
      eq(schema.draftReviewFindings.draftId, draftId),
    ];
    if (versionId) conditions.push(eq(schema.draftReviewFindings.draftVersionId, versionId));
    const rows = await this.db.select().from(schema.draftReviewFindings).where(and(...conditions)).orderBy(desc(schema.draftReviewFindings.createdAt));
    return rows.map(toReviewFinding);
  }

  public async createApprovalRequest(input: {
    tenantId: string;
    matterId: string;
    draftId: string;
    draftVersionId: string;
    requestedBy: string;
    proposedAction: string;
    expiresAt?: string;
  }): Promise<{ request: ApprovalRequest; token: string }> {
    const version = await this.getVersion(input.tenantId, input.matterId, input.draftId, input.draftVersionId);
    if (!version) throw new Error('DRAFT_VERSION_NOT_FOUND: versão não localizada no matter do tenant autenticado.');
    const pending = await this.db.select().from(schema.draftApprovalRequests).where(and(
      eq(schema.draftApprovalRequests.tenantId, input.tenantId),
      eq(schema.draftApprovalRequests.draftId, input.draftId),
      eq(schema.draftApprovalRequests.draftVersionId, input.draftVersionId),
      eq(schema.draftApprovalRequests.status, 'PENDING'),
    )).limit(1);
    if (pending[0]) throw new Error('APPROVAL_ALREADY_PENDING: já existe aprovação pendente para esta versão.');

    const rawToken = randomUUID();
    const request = ApprovalRequestSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      draftId: input.draftId,
      draftVersionId: input.draftVersionId,
      requestedBy: input.requestedBy,
      proposedAction: input.proposedAction,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    });
    const token = ApprovalTokenSchema.parse({
      id: randomUUID(),
      requestId: request.id,
      tenantId: input.tenantId,
      tokenHash: createHash('sha256').update(rawToken, 'utf8').digest('hex'),
      issuedAt: request.requestedAt,
      expiresAt: input.expiresAt,
    });
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.draftApprovalRequests).values({ ...request, decidedAt: null, decidedBy: null, decisionReason: null });
      await tx.insert(schema.draftApprovalTokens).values({ ...token, usedAt: null });
      await tx.update(schema.drafts).set({ status: 'APPROVAL_PENDING', updatedAt: request.requestedAt }).where(and(
        eq(schema.drafts.id, input.draftId),
        eq(schema.drafts.tenantId, input.tenantId),
        eq(schema.drafts.matterId, input.matterId),
      ));
    });
    return { request, token: rawToken };
  }

  public async listApprovalRequests(tenantId: string, matterId?: string): Promise<ApprovalRequest[]> {
    const conditions = [eq(schema.draftApprovalRequests.tenantId, tenantId)];
    if (matterId) conditions.push(eq(schema.draftApprovalRequests.matterId, matterId));
    const rows = await this.db.select().from(schema.draftApprovalRequests).where(and(...conditions)).orderBy(desc(schema.draftApprovalRequests.requestedAt));
    return rows.map(toApprovalRequest);
  }

  public async resolveApproval(input: {
    tenantId: string;
    token: string;
    decision: 'APPROVED' | 'REJECTED';
    decidedBy: string;
    reason?: string;
  }): Promise<ApprovalResolution> {
    const tokenHash = createHash('sha256').update(input.token, 'utf8').digest('hex');
    const tokenRows = await this.db.select().from(schema.draftApprovalTokens).where(and(
      eq(schema.draftApprovalTokens.tenantId, input.tenantId),
      eq(schema.draftApprovalTokens.tokenHash, tokenHash),
    )).limit(1);
    const tokenRow = tokenRows[0];
    if (!tokenRow) throw new Error('APPROVAL_TOKEN_INVALID: token de aprovação inválido.');
    if (tokenRow.usedAt) throw new Error('APPROVAL_TOKEN_USED: token de aprovação já utilizado.');
    if (tokenRow.expiresAt && tokenRow.expiresAt <= new Date().toISOString()) throw new Error('APPROVAL_TOKEN_EXPIRED: token de aprovação expirado.');

    const requestRows = await this.db.select().from(schema.draftApprovalRequests).where(and(
      eq(schema.draftApprovalRequests.id, tokenRow.requestId),
      eq(schema.draftApprovalRequests.tenantId, input.tenantId),
    )).limit(1);
    const requestRow = requestRows[0];
    if (!requestRow) throw new Error('APPROVAL_REQUEST_NOT_FOUND: solicitação de aprovação não localizada.');
    if (requestRow.status !== 'PENDING') throw new Error('APPROVAL_NOT_PENDING: solicitação de aprovação já decidida.');

    const decidedAt = new Date().toISOString();
    const decision = ApprovalDecisionSchema.parse({
      id: randomUUID(),
      requestId: requestRow.id,
      tenantId: input.tenantId,
      decision: input.decision,
      decidedBy: input.decidedBy,
      reason: input.reason,
      decidedAt,
    });
    const status = input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await this.db.transaction(async (tx) => {
      await tx.update(schema.draftApprovalRequests).set({
        status,
        decidedAt,
        decidedBy: input.decidedBy,
        decisionReason: input.reason ?? null,
      }).where(and(eq(schema.draftApprovalRequests.id, requestRow.id), eq(schema.draftApprovalRequests.status, 'PENDING')));
      await tx.insert(schema.draftApprovalDecisions).values({ ...decision });
      await tx.update(schema.draftApprovalTokens).set({ usedAt: decidedAt }).where(eq(schema.draftApprovalTokens.id, tokenRow.id));
      await tx.update(schema.drafts).set({ status, updatedAt: decidedAt }).where(and(
        eq(schema.drafts.id, requestRow.draftId),
        eq(schema.drafts.tenantId, input.tenantId),
        eq(schema.drafts.matterId, requestRow.matterId),
      ));
    });
    const updatedRequest = await this.db.select().from(schema.draftApprovalRequests).where(eq(schema.draftApprovalRequests.id, requestRow.id)).limit(1);
    const updatedToken = await this.db.select().from(schema.draftApprovalTokens).where(eq(schema.draftApprovalTokens.id, tokenRow.id)).limit(1);
    if (!updatedRequest[0] || !updatedToken[0]) throw new Error('APPROVAL_PERSISTENCE_FAILED: decisão não pôde ser recuperada.');
    return { request: toApprovalRequest(updatedRequest[0]), decision, token: toApprovalToken(updatedToken[0]) };
  }

  private async requireMatter(tenantId: string, matterId: string): Promise<void> {
    if (!(await this.matterRepository.getMatter(tenantId, matterId))) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }
  }
}
