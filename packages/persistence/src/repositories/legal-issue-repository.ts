import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { LegalIssue, LegalIssueSchema, LegalIssueStatus } from '@forgelex/domain';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';

function toLegalIssue(row: typeof schema.legalIssues.$inferSelect): LegalIssue {
  return LegalIssueSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    statement: row.statement,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class LegalIssueRepository {
  private readonly matterRepository: MatterRepository;

  public constructor(private readonly db: ForgeLexDatabase) {
    this.matterRepository = new MatterRepository(db);
  }

  public async createIssue(input: {
    tenantId: string;
    matterId: string;
    createdBy: string;
    statement: string;
    status?: LegalIssueStatus;
  }): Promise<LegalIssue> {
    if (!(await this.matterRepository.getMatter(input.tenantId, input.matterId))) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }

    const now = new Date().toISOString();
    const issue = LegalIssueSchema.parse({
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      statement: input.statement,
      status: input.status ?? 'OPEN',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    await this.db.insert(schema.legalIssues).values(issue);
    return issue;
  }

  public async listIssues(tenantId: string, matterId: string): Promise<LegalIssue[]> {
    const rows = await this.db
      .select()
      .from(schema.legalIssues)
      .where(and(eq(schema.legalIssues.tenantId, tenantId), eq(schema.legalIssues.matterId, matterId)))
      .orderBy(desc(schema.legalIssues.updatedAt));
    return rows.map(toLegalIssue);
  }

}
