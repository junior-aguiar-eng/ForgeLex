import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CaseLaw, CaseLawSchema, SavedAuthority, SavedAuthoritySchema } from '@forgelex/domain';
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
