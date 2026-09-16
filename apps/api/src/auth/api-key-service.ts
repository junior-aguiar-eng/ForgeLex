import { randomBytes, randomUUID } from 'node:crypto';
import type { ApiKeyRepository, StoredApiKey } from '@forgelex/persistence';
import { hashApiKey } from './fastify-auth.js';

export interface PublicApiKey {
  id: string;
  tenantId: string;
  subjectId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  roles: string[];
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
}

export interface CreatedApiKey extends PublicApiKey {
  token: string;
}

function toPublicApiKey(record: StoredApiKey): PublicApiKey {
  return {
    id: record.id,
    tenantId: record.tenantId,
    subjectId: record.subjectId,
    userId: record.userId,
    name: record.name,
    keyPrefix: record.keyPrefix,
    roles: [...record.roles],
    scopes: [...record.scopes],
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  };
}

export class ApiKeyService {
  public constructor(private readonly repository: ApiKeyRepository) {}

  public async create(input: {
    tenantId: string;
    subjectId: string;
    userId: string;
    name: string;
    roles: string[];
    scopes: string[];
  }): Promise<CreatedApiKey> {
    const token = `flx_live_${randomBytes(24).toString('base64url')}`;
    const record = await this.repository.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      subjectId: input.subjectId,
      userId: input.userId,
      name: input.name,
      keyPrefix: token.slice(0, 16),
      tokenHash: hashApiKey(token),
      roles: input.roles,
      scopes: input.scopes,
    });
    return { ...toPublicApiKey(record), token };
  }

  public async list(tenantId: string): Promise<PublicApiKey[]> {
    const records = await this.repository.listByTenant(tenantId);
    return records.map(toPublicApiKey);
  }

  public async revoke(tenantId: string, id: string): Promise<PublicApiKey | undefined> {
    const revoked = await this.repository.revoke(tenantId, id);
    return revoked ? toPublicApiKey(revoked) : undefined;
  }
}
