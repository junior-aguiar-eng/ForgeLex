import { and, desc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';

export interface StoredApiKey {
  id: string;
  tenantId: string;
  subjectId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  tokenHash: string;
  roles: string[];
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
}

export interface CreateApiKeyRecord {
  id?: string;
  tenantId: string;
  subjectId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  tokenHash: string;
  roles: string[];
  scopes: string[];
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function toStoredApiKey(row: typeof schema.apiKeys.$inferSelect): StoredApiKey {
  return {
    id: row.id,
    tenantId: row.tenantId,
    subjectId: row.subjectId,
    userId: row.userId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    tokenHash: row.tokenHash,
    roles: parseStringArray(row.roles),
    scopes: parseStringArray(row.scopes),
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? undefined,
  };
}

export class ApiKeyRepository {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async create(input: CreateApiKeyRecord): Promise<StoredApiKey> {
    const record = {
      id: input.id ?? randomUUID(),
      tenantId: input.tenantId,
      subjectId: input.subjectId,
      userId: input.userId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      tokenHash: input.tokenHash,
      roles: JSON.stringify(input.roles),
      scopes: JSON.stringify(input.scopes),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    await this.db.insert(schema.apiKeys).values(record);
    return toStoredApiKey({ ...record, roles: record.roles, scopes: record.scopes });
  }

  public async findActiveByTokenHash(tokenHash: string): Promise<StoredApiKey | undefined> {
    const rows = await this.db
      .select()
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.tokenHash, tokenHash), isNull(schema.apiKeys.revokedAt)))
      .limit(1);
    return rows[0] ? toStoredApiKey(rows[0]) : undefined;
  }

  public async listByTenant(tenantId: string): Promise<StoredApiKey[]> {
    const rows = await this.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.tenantId, tenantId))
      .orderBy(desc(schema.apiKeys.createdAt));
    return rows.map(toStoredApiKey);
  }

  public async revoke(tenantId: string, id: string): Promise<StoredApiKey | undefined> {
    const existing = await this.db
      .select()
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.tenantId, tenantId), isNull(schema.apiKeys.revokedAt)))
      .limit(1);
    if (!existing[0]) return undefined;

    const revokedAt = new Date().toISOString();
    await this.db
      .update(schema.apiKeys)
      .set({ revokedAt })
      .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.tenantId, tenantId), isNull(schema.apiKeys.revokedAt)));

    return toStoredApiKey({ ...existing[0], revokedAt });
  }

  public async revokeAllByTenant(tenantId: string, revokedAt = new Date().toISOString()): Promise<number> {
    const result = await this.db
      .update(schema.apiKeys)
      .set({ revokedAt })
      .where(and(eq(schema.apiKeys.tenantId, tenantId), isNull(schema.apiKeys.revokedAt)));
    const count = result as unknown as { rowsAffected?: number; rowCount?: number; count?: number };
    return count.rowsAffected ?? count.rowCount ?? count.count ?? 0;
  }
}
