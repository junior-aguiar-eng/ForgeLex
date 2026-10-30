import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { ForgeLexDatabase } from '../db.js';
import { agenticTenantGuards } from '../schema/schema.js';

export const agenticTenantKey = (tenantId: string): string => createHash('sha256').update('forgelex-agentic-tenant-v1\0').update(tenantId).digest('hex');

/** Caller owns the transaction. Always acquire before conversation, matter or wallet locks. */
export async function lockAgenticTenant(db: ForgeLexDatabase, tenantId: string): Promise<void> {
  const key = agenticTenantKey(tenantId);
  await db.insert(agenticTenantGuards).values({ tenantKey: key, closed: 0 }).onConflictDoNothing();
  const [row] = await db.update(agenticTenantGuards).set({ closed: sql`${agenticTenantGuards.closed}` }).where(eq(agenticTenantGuards.tenantKey, key)).returning();
  if (!row || row.closed !== 0) throw new Error('AGENTIC_TENANT_CLOSED');
}

interface Executor { execute(statement: { sql: string; args: (string | number | null)[] }): Promise<{ rows: unknown[] }>; }
/** Expurgo holds this same lock until commit. The marker contains no direct tenant/user identifier. */
export async function closeAgenticTenant(tx: Executor, tenantId: string): Promise<void> {
  const key = agenticTenantKey(tenantId);
  await tx.execute({ sql: 'INSERT INTO agentic_tenant_guards(tenant_key,closed) VALUES(?,0) ON CONFLICT(tenant_key) DO NOTHING', args: [key] });
  await tx.execute({ sql: 'UPDATE agentic_tenant_guards SET closed=1 WHERE tenant_key=?', args: [key] });
}

export async function holdAgenticTenant(tx: Executor, tenantId: string): Promise<void> {
  const key = agenticTenantKey(tenantId);
  await tx.execute({ sql: 'INSERT INTO agentic_tenant_guards(tenant_key,closed) VALUES(?,0) ON CONFLICT(tenant_key) DO NOTHING', args: [key] });
  await tx.execute({ sql: 'UPDATE agentic_tenant_guards SET closed=closed WHERE tenant_key=?', args: [key] });
  const result = await tx.execute({ sql: 'SELECT closed FROM agentic_tenant_guards WHERE tenant_key=?', args: [key] });
  if (Number((result.rows[0] as { closed?: number })?.closed) !== 0) throw new Error('AGENTIC_TENANT_CLOSED');
}
