import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';

export type AccountStatus = 'ACTIVE' | 'DISABLED';
export type MembershipStatus = 'ACTIVE' | 'REVOKED';
export type MembershipRole = 'OWNER' | 'MEMBER';

export interface StoredAccount {
  user: {
    id: string;
    supabaseUserId: string;
    email: string;
    displayName: string;
    status: AccountStatus;
    createdAt: string;
    updatedAt: string;
    deactivatedAt?: string;
  };
  tenant: {
    id: string;
    name: string;
    status: AccountStatus;
    createdAt: string;
    updatedAt: string;
    deactivatedAt?: string;
  };
  membership: {
    id: string;
    role: MembershipRole;
    status: MembershipStatus;
    createdAt: string;
    updatedAt: string;
    revokedAt?: string;
  };
}

export interface BootstrapAccountInput {
  supabaseUserId: string;
  email: string;
  displayName: string;
}

function deterministicId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32)}`;
}

function optionalDate(value: string | null): string | undefined {
  return value ?? undefined;
}

function toStoredAccount(row: {
  user: typeof schema.forgelexUserProfiles.$inferSelect;
  tenant: typeof schema.forgelexTenants.$inferSelect;
  membership: typeof schema.forgelexTenantMemberships.$inferSelect;
}): StoredAccount {
  return {
    user: {
      id: row.user.id,
      supabaseUserId: row.user.supabaseUserId,
      email: row.user.email,
      displayName: row.user.displayName,
      status: row.user.status as AccountStatus,
      createdAt: row.user.createdAt,
      updatedAt: row.user.updatedAt,
      deactivatedAt: optionalDate(row.user.deactivatedAt),
    },
    tenant: {
      id: row.tenant.id,
      name: row.tenant.name,
      status: row.tenant.status as AccountStatus,
      createdAt: row.tenant.createdAt,
      updatedAt: row.tenant.updatedAt,
      deactivatedAt: optionalDate(row.tenant.deactivatedAt),
    },
    membership: {
      id: row.membership.id,
      role: row.membership.role as MembershipRole,
      status: row.membership.status as MembershipStatus,
      createdAt: row.membership.createdAt,
      updatedAt: row.membership.updatedAt,
      revokedAt: optionalDate(row.membership.revokedAt),
    },
  };
}

export class AccountRepository {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async bootstrap(input: BootstrapAccountInput): Promise<StoredAccount> {
    const supabaseUserId = input.supabaseUserId.trim();
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const userId = deterministicId('user', supabaseUserId);
    const tenantId = deterministicId('tenant', supabaseUserId);
    const membershipId = deterministicId('membership', supabaseUserId);
    const now = new Date().toISOString();

    return this.db.transaction(async (tx) => {
      await tx
        .insert(schema.forgelexUserProfiles)
        .values({
          id: userId,
          supabaseUserId,
          email,
          displayName,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          deactivatedAt: null,
        })
        .onConflictDoNothing({ target: schema.forgelexUserProfiles.supabaseUserId });

      await tx
        .update(schema.forgelexUserProfiles)
        .set({ email, displayName, updatedAt: now })
        .where(eq(schema.forgelexUserProfiles.supabaseUserId, supabaseUserId));

      await tx
        .insert(schema.forgelexTenants)
        .values({
          id: tenantId,
          name: `Espaço de ${displayName}`,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          deactivatedAt: null,
        })
        .onConflictDoNothing({ target: schema.forgelexTenants.id });

      const profile = await tx
        .select()
        .from(schema.forgelexUserProfiles)
        .where(eq(schema.forgelexUserProfiles.supabaseUserId, supabaseUserId))
        .limit(1);
      if (!profile[0]) throw new Error('ACCOUNT_PROFILE_NOT_FOUND');

      await tx
        .insert(schema.forgelexTenantMemberships)
        .values({
          id: membershipId,
          tenantId,
          userId: profile[0].id,
          role: 'OWNER',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
        })
        .onConflictDoNothing({ target: [schema.forgelexTenantMemberships.tenantId, schema.forgelexTenantMemberships.userId] });

      const rows = await tx
        .select({ user: schema.forgelexUserProfiles, tenant: schema.forgelexTenants, membership: schema.forgelexTenantMemberships })
        .from(schema.forgelexUserProfiles)
        .innerJoin(schema.forgelexTenantMemberships, eq(schema.forgelexTenantMemberships.userId, schema.forgelexUserProfiles.id))
        .innerJoin(schema.forgelexTenants, eq(schema.forgelexTenants.id, schema.forgelexTenantMemberships.tenantId))
        .where(and(
          eq(schema.forgelexUserProfiles.supabaseUserId, supabaseUserId),
          eq(schema.forgelexTenantMemberships.tenantId, tenantId),
        ))
        .limit(1);
      if (!rows[0]) throw new Error('ACCOUNT_MEMBERSHIP_NOT_FOUND');
      return toStoredAccount(rows[0]);
    });
  }

  public async findBySupabaseUserId(supabaseUserId: string): Promise<StoredAccount | undefined> {
    const rows = await this.db
      .select({ user: schema.forgelexUserProfiles, tenant: schema.forgelexTenants, membership: schema.forgelexTenantMemberships })
      .from(schema.forgelexUserProfiles)
      .innerJoin(schema.forgelexTenantMemberships, eq(schema.forgelexTenantMemberships.userId, schema.forgelexUserProfiles.id))
      .innerJoin(schema.forgelexTenants, eq(schema.forgelexTenants.id, schema.forgelexTenantMemberships.tenantId))
      .where(eq(schema.forgelexUserProfiles.supabaseUserId, supabaseUserId))
      .limit(1);
    return rows[0] ? toStoredAccount(rows[0]) : undefined;
  }

  public async findByUserAndTenant(userId: string, tenantId: string): Promise<StoredAccount | undefined> {
    const rows = await this.db
      .select({ user: schema.forgelexUserProfiles, tenant: schema.forgelexTenants, membership: schema.forgelexTenantMemberships })
      .from(schema.forgelexUserProfiles)
      .innerJoin(schema.forgelexTenantMemberships, eq(schema.forgelexTenantMemberships.userId, schema.forgelexUserProfiles.id))
      .innerJoin(schema.forgelexTenants, eq(schema.forgelexTenants.id, schema.forgelexTenantMemberships.tenantId))
      .where(and(
        eq(schema.forgelexUserProfiles.id, userId),
        eq(schema.forgelexTenantMemberships.tenantId, tenantId),
      ))
      .limit(1);
    return rows[0] ? toStoredAccount(rows[0]) : undefined;
  }
}
