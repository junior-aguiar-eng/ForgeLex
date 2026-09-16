import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { LegalThesis, LegalThesisSchema, LegalThesisStatus } from '@forgelex/domain';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { LegalIssueRepository } from './legal-issue-repository.js';
import { MatterAuthorityRepository } from './matter-authority-repository.js';
import { MatterRepository } from './matter-repository.js';

function parseIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function toLegalThesis(row: typeof schema.legalTheses.$inferSelect): LegalThesis {
  return LegalThesisSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    title: row.title,
    statement: row.statement,
    rationale: row.rationale ?? undefined,
    issueIds: parseIds(row.issueIds),
    factIds: parseIds(row.factIds),
    evidenceIds: parseIds(row.evidenceIds),
    authorityIds: parseIds(row.authorityIds),
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export interface LegalThesisInput {
  tenantId: string;
  matterId: string;
  createdBy: string;
  title: string;
  statement: string;
  rationale?: string;
  issueIds?: string[];
  factIds?: string[];
  evidenceIds?: string[];
  authorityIds?: string[];
  status?: LegalThesisStatus;
}

export class LegalThesisRepository {
  private readonly matterRepository: MatterRepository;
  private readonly factsEvidenceRepository: FactsEvidenceRepository;
  private readonly legalIssueRepository: LegalIssueRepository;
  private readonly matterAuthorityRepository: MatterAuthorityRepository;

  public constructor(private readonly db: ForgeLexDatabase) {
    this.matterRepository = new MatterRepository(db);
    this.factsEvidenceRepository = new FactsEvidenceRepository(db);
    this.legalIssueRepository = new LegalIssueRepository(db);
    this.matterAuthorityRepository = new MatterAuthorityRepository(db);
  }

  public async createThesis(input: LegalThesisInput): Promise<LegalThesis> {
    await this.requireMatter(input.tenantId, input.matterId);
    const issueIds = [...new Set(input.issueIds ?? [])];
    const factIds = [...new Set(input.factIds ?? [])];
    const evidenceIds = [...new Set(input.evidenceIds ?? [])];
    const authorityIds = [...new Set(input.authorityIds ?? [])];
    await this.validateLinks(input.tenantId, input.matterId, { issueIds, factIds, evidenceIds, authorityIds });

    const now = new Date().toISOString();
    const thesis = LegalThesisSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      title: input.title,
      statement: input.statement,
      rationale: input.rationale,
      issueIds,
      factIds,
      evidenceIds,
      authorityIds,
      status: input.status ?? 'PROPOSED',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.insert(schema.legalTheses).values({
      ...thesis,
      issueIds: JSON.stringify(thesis.issueIds),
      factIds: JSON.stringify(thesis.factIds),
      evidenceIds: JSON.stringify(thesis.evidenceIds),
      authorityIds: JSON.stringify(thesis.authorityIds),
    });
    return thesis;
  }

  public async listTheses(tenantId: string, matterId: string): Promise<LegalThesis[]> {
    const rows = await this.db
      .select()
      .from(schema.legalTheses)
      .innerJoin(schema.matters, eq(schema.legalTheses.matterId, schema.matters.id))
      .where(and(
        eq(schema.legalTheses.tenantId, tenantId),
        eq(schema.legalTheses.matterId, matterId),
        eq(schema.matters.tenantId, tenantId),
      ))
      .orderBy(desc(schema.legalTheses.updatedAt));
    return rows.map((row) => toLegalThesis(row.legal_theses));
  }

  public async getThesis(tenantId: string, matterId: string, thesisId: string): Promise<LegalThesis | undefined> {
    const rows = await this.db
      .select({ thesis: schema.legalTheses })
      .from(schema.legalTheses)
      .innerJoin(schema.matters, eq(schema.legalTheses.matterId, schema.matters.id))
      .where(and(
        eq(schema.legalTheses.id, thesisId),
        eq(schema.legalTheses.tenantId, tenantId),
        eq(schema.legalTheses.matterId, matterId),
        eq(schema.matters.tenantId, tenantId),
      ))
      .limit(1);
    return rows[0] ? toLegalThesis(rows[0].thesis) : undefined;
  }

  private async validateLinks(
    tenantId: string,
    matterId: string,
    links: { issueIds: string[]; factIds: string[]; evidenceIds: string[]; authorityIds: string[] },
  ): Promise<void> {
    const [issues, facts, evidence, authorities] = await Promise.all([
      this.legalIssueRepository.listIssues(tenantId, matterId),
      this.factsEvidenceRepository.listFacts(tenantId, matterId),
      this.factsEvidenceRepository.listEvidenceItems(tenantId, matterId),
      this.matterAuthorityRepository.listAuthorities(tenantId, matterId),
    ]);
    const collections: Array<[string, string[], string[]]> = [
      ['ISSUE', links.issueIds, issues.map((item) => item.id)],
      ['FACT', links.factIds, facts.map((item) => item.id)],
      ['EVIDENCE', links.evidenceIds, evidence.map((item) => item.id)],
      ['AUTHORITY', links.authorityIds, authorities.map((item) => item.id)],
    ];
    for (const [kind, requested, available] of collections) {
      const availableIds = new Set(available);
      const missing = requested.find((id) => !availableIds.has(id));
      if (missing) throw new Error(`THESIS_${kind}_NOT_FOUND: vínculo ${missing} não pertence ao matter do tenant autenticado.`);
    }
  }

  private async requireMatter(tenantId: string, matterId: string): Promise<void> {
    if (!(await this.matterRepository.getMatter(tenantId, matterId))) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }
  }
}
