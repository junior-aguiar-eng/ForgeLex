import { z } from 'zod';

export const LifecycleStateSchema = z.enum(['ACTIVE', 'ARCHIVED', 'TRASHED', 'PURGED']);
export type LifecycleState = z.infer<typeof LifecycleStateSchema>;
export const LifecycleViewSchema = z.enum(['active', 'archived', 'trash']);
export type LifecycleView = z.infer<typeof LifecycleViewSchema>;
export type LifecycleAction = 'archive' | 'trash' | 'restore';
export interface LifecycleTarget { tenantId: string; matterId: string; documentId?: string; expectedMatterRevision?: number; }
export interface LifecycleActor {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  authType: 'web_session';
  scopes: string[];
}
export const LifecycleCommandSchema = z.object({ expectedLifecycleRevision: z.number().int().nonnegative() }).strict();
export type LifecycleCommand = z.infer<typeof LifecycleCommandSchema>;
export const PurgeCommandSchema = LifecycleCommandSchema.extend({ confirmation: z.string().min(1) }).strict();
export type PurgeCommand = z.infer<typeof PurgeCommandSchema>;
export const LifecycleFieldsSchema = z.object({
  lifecycleState: LifecycleStateSchema.default('ACTIVE'),
  lifecycleRevision: z.number().int().nonnegative().default(0),
  previousLifecycleState: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  archivedAt: z.string().datetime().optional(),
  archivedBy: z.string().optional(),
  trashedAt: z.string().datetime().optional(),
  trashedBy: z.string().optional(),
  restoredAt: z.string().datetime().optional(),
  restoredBy: z.string().optional(),
  purgedAt: z.string().datetime().optional(),
  purgedBy: z.string().optional(),
});
export interface LifecycleResult {
  id: string; lifecycleState: LifecycleState; lifecycleRevision: number;
  archivedAt?: string; trashedAt?: string; purgedAt?: string;
}
