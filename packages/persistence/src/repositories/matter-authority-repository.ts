import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CaseLaw, CaseLawSchema, SavedAuthority, SavedAuthoritySchema } from '@forgelex/domain';
type AuthorityVerificationSnapshot = {
  status: 'VERIFIED_OFFICIAL' | 'VERIFIED_PROVIDER' | 'UNVERIFIED' | 'CONFLICTING_METADATA' | 'NOT_FOUND';
  providerId?: string; checkedAt: string; authority?: CaseLaw; reason?: string;
};
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';

export interface SaveAuthorityInput {
  tenantId: string;
  matterId: string;
  savedBy: string;
  authority: CaseLaw;
}

export interface SaveAuthorityResult {
  record: SavedAuthority;
  created: boolean;
}

function toSavedAuthority(row: typeof schema.matterAuthorities.$inferSelect): SavedAuthority {
  let authority: unknown;
  try {
    authority = JSON.parse(row.authorityJson);
  } catch {
    throw new Error('AUTHORITY_PERSISTENCE_INVALID: a autoridade persistida contém JSON inválido.');
  }

  return SavedAuthoritySchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    authority,
    savedBy: row.savedBy,
    savedAt: row.savedAt,
  });
}

export class MatterAuthorityRepository {
  private readonly matterRepository: MatterRepository;

  public constructor(private readonly db: ForgeLexDatabase) {
    this.matterRepository = new MatterRepository(db);
  }

  public async saveAuthority(input: SaveAuthorityInput): Promise<SaveAuthorityResult> {
    await this.requireMatter(input.tenantId, input.matterId);
    const authority = CaseLawSchema.parse(input.authority);
    const existing = await this.findByDedupeKey(input.tenantId, input.matterId, authority.dedupeKey);
    if (existing) return { record: existing, created: false };

    const record = {
      id: randomUUID(),
      tenantId: input.tenantId,
      matterId: input.matterId,
      authorityId: authority.id,
      dedupeKey: authority.dedupeKey,
      authorityJson: JSON.stringify(authority),
      savedBy: input.savedBy,
      savedAt: new Date().toISOString(),
    };

    await this.db
      .insert(schema.matterAuthorities)
      .values(record)
      .onConflictDoNothing({ target: [schema.matterAuthorities.matterId, schema.matterAuthorities.dedupeKey] });

    const persisted = await this.findByDedupeKey(input.tenantId, input.matterId, authority.dedupeKey);
    if (!persisted) {
      throw new Error('AUTHORITY_PERSISTENCE_FAILED: a autoridade não pôde ser recuperada após o salvamento.');
    }
    return { record: persisted, created: persisted.id === record.id };
  }

  public async listAuthorities(tenantId: string, matterId: string): Promise<SavedAuthority[]> {
    const rows = await this.db
      .select()
      .from(schema.matterAuthorities)
      .innerJoin(schema.matters, eq(schema.matterAuthorities.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.matterAuthorities.tenantId, tenantId),
          eq(schema.matterAuthorities.matterId, matterId),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .orderBy(desc(schema.matterAuthorities.savedAt));
    return rows.map((row) => toSavedAuthority(row.matter_authorities));
  }

  public async recordVerification(input: {
    tenantId: string; matterId: string; savedAuthorityId: string; createdBy: string; verification: AuthorityVerificationSnapshot;
  }): Promise<void> {
    await this.requireMatter(input.tenantId, input.matterId);
    const authority = (await this.listAuthorities(input.tenantId, input.matterId)).find((item) => item.id === input.savedAuthorityId);
    if (!authority) throw new Error('MATTER_AUTHORITY_NOT_FOUND');
    await this.db.insert(schema.matterAuthorityVerifications).values({ id: randomUUID(), tenantId: input.tenantId,
      matterId: input.matterId, savedAuthorityId: input.savedAuthorityId, status: input.verification.status,
      checkedAt: input.verification.checkedAt, providerId: input.verification.providerId ?? null,
      reason: input.verification.reason ?? null,
      authoritySnapshotJson: input.verification.authority ? JSON.stringify(input.verification.authority) : null,
      createdBy: input.createdBy, createdAt: new Date().toISOString() });
  }

  public async listVerifications(tenantId: string, matterId: string, savedAuthorityId: string): Promise<Array<{
    id: string; status: AuthorityVerificationSnapshot['status']; checkedAt: string; providerId?: string;
    reason?: string; authoritySnapshot?: CaseLaw;
  }>> {
    const rows = await this.db.select().from(schema.matterAuthorityVerifications).where(and(
      eq(schema.matterAuthorityVerifications.tenantId, tenantId), eq(schema.matterAuthorityVerifications.matterId, matterId),
      eq(schema.matterAuthorityVerifications.savedAuthorityId, savedAuthorityId),
    )).orderBy(schema.matterAuthorityVerifications.createdAt);
    return rows.map((row) => ({ id: row.id, status: row.status as AuthorityVerificationSnapshot['status'], checkedAt: row.checkedAt,
      providerId: row.providerId ?? undefined, reason: row.reason ?? undefined,
      authoritySnapshot: row.authoritySnapshotJson ? CaseLawSchema.parse(JSON.parse(row.authoritySnapshotJson)) : undefined }));
  }

  private async findByDedupeKey(
    tenantId: string,
    matterId: string,
    dedupeKey: string,
  ): Promise<SavedAuthority | undefined> {
    const rows = await this.db
      .select()
      .from(schema.matterAuthorities)
      .innerJoin(schema.matters, eq(schema.matterAuthorities.matterId, schema.matters.id))
      .where(
        and(
          eq(schema.matterAuthorities.tenantId, tenantId),
          eq(schema.matterAuthorities.matterId, matterId),
          eq(schema.matterAuthorities.dedupeKey, dedupeKey),
          eq(schema.matters.tenantId, tenantId),
        ),
      )
      .limit(1);
    return rows[0] ? toSavedAuthority(rows[0].matter_authorities) : undefined;
  }

  private async requireMatter(tenantId: string, matterId: string): Promise<void> {
    if (!(await this.matterRepository.getMatter(tenantId, matterId))) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }
  }
}
