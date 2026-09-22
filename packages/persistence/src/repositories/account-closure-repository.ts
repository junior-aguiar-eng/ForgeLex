import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';

export type AccountClosureStatus =
  | 'REQUESTED'
  | 'ACCESS_BLOCKED'
  | 'IDENTITY_REMOVED'
  | 'CREDENTIALS_REVOKED'
  | 'CONTENT_PURGING'
  | 'RETAINED_ONLY'
  | 'COMPLETED'
  | 'RECONCILIATION_REQUIRED';

export type AccountClosureStepType =
  | 'DELETE_SUPABASE_IDENTITY'
  | 'PURGE_PRIVATE_CONTENT'
  | 'MINIMIZE_RETAINED_RECORDS'
  | 'REMOVE_LOCAL_IDENTITY'
  | 'VERIFY_RESIDUALS';

export type AccountClosureStepStatus = 'PENDING' | 'LEASED' | 'RETRYABLE' | 'COMPLETED' | 'FAILED';

export interface AccountClosureRecord {
  id: string;
  subjectId?: string;
  userId?: string;
  tenantId?: string;
  subjectHash: string;
  userHash: string;
  tenantHash: string;
  statusTokenHash: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  policyVersion: string;
  status: AccountClosureStatus;
  requestedAt: string;
  updatedAt: string;
  accessBlockedAt?: string;
  identityRemovedAt?: string;
  completedAt?: string;
  nextAttemptAt?: string;
  attemptCount: number;
  lastErrorCode?: string;
}

export interface AccountClosureStepRecord {
  id: string;
  closureId: string;
  stepType: AccountClosureStepType;
  status: AccountClosureStepStatus;
  attemptCount: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface RetentionExceptionRecord {
  id: string;
  closureId: string;
  category: string;
  legalBasisReference: string;
  authorityReference: string;
  responsible: string;
  startsAt: string;
  reviewAt: string;
  endsAt?: string;
  status: string;
}

export interface CreateAccountClosureInput {
  id: string;
  subjectId: string;
  userId: string;
  tenantId: string;
  subjectHash: string;
  userHash: string;
  tenantHash: string;
  statusTokenHash: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  policyVersion: string;
  requestedAt: string;
}

export interface ClaimedClosureStep {
  closure: AccountClosureRecord;
  step: AccountClosureStepRecord;
}

const orderedStepTypes: readonly AccountClosureStepType[] = [
  'DELETE_SUPABASE_IDENTITY',
  'PURGE_PRIVATE_CONTENT',
  'MINIMIZE_RETAINED_RECORDS',
  'REMOVE_LOCAL_IDENTITY',
  'VERIFY_RESIDUALS',
];

const stepOrderSql = `CASE step_type
  WHEN 'DELETE_SUPABASE_IDENTITY' THEN 1
  WHEN 'PURGE_PRIVATE_CONTENT' THEN 2
  WHEN 'MINIMIZE_RETAINED_RECORDS' THEN 3
  WHEN 'REMOVE_LOCAL_IDENTITY' THEN 4
  WHEN 'VERIFY_RESIDUALS' THEN 5
  ELSE 99 END`;

function optionalText(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function closureFromRow(row: Record<string, unknown>): AccountClosureRecord {
  return {
    id: String(row.id),
    subjectId: optionalText(row.subject_id),
    userId: optionalText(row.user_id),
    tenantId: optionalText(row.tenant_id),
    subjectHash: String(row.subject_hash),
    userHash: String(row.user_hash),
    tenantHash: String(row.tenant_hash),
    statusTokenHash: String(row.status_token_hash),
    idempotencyKeyHash: String(row.idempotency_key_hash),
    requestFingerprint: String(row.request_fingerprint),
    policyVersion: String(row.policy_version),
    status: String(row.status) as AccountClosureStatus,
    requestedAt: String(row.requested_at),
    updatedAt: String(row.updated_at),
    accessBlockedAt: optionalText(row.access_blocked_at),
    identityRemovedAt: optionalText(row.identity_removed_at),
    completedAt: optionalText(row.completed_at),
    nextAttemptAt: optionalText(row.next_attempt_at),
    attemptCount: Number(row.attempt_count),
    lastErrorCode: optionalText(row.last_error_code),
  };
}

function stepFromRow(row: Record<string, unknown>): AccountClosureStepRecord {
  return {
    id: String(row.id),
    closureId: String(row.closure_id),
    stepType: String(row.step_type) as AccountClosureStepType,
    status: String(row.status) as AccountClosureStepStatus,
    attemptCount: Number(row.attempt_count),
    leaseOwner: optionalText(row.lease_owner),
    leaseExpiresAt: optionalText(row.lease_expires_at),
    nextAttemptAt: optionalText(row.next_attempt_at),
    lastErrorCode: optionalText(row.last_error_code),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: optionalText(row.completed_at),
  };
}

export class AccountClosureRepository {
  public constructor(private readonly client: Client) {}

  public async create(input: CreateAccountClosureInput): Promise<AccountClosureRecord> {
    const transaction = await this.client.transaction();
    try {
      await transaction.execute({
        sql: `INSERT INTO account_closures (
          id, subject_id, user_id, tenant_id, subject_hash, user_hash, tenant_hash,
          status_token_hash, idempotency_key_hash, request_fingerprint, policy_version,
          status, requested_at, updated_at, next_attempt_at, attempt_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, 0)`,
        args: [
          input.id,
          input.subjectId,
          input.userId,
          input.tenantId,
          input.subjectHash,
          input.userHash,
          input.tenantHash,
          input.statusTokenHash,
          input.idempotencyKeyHash,
          input.requestFingerprint,
          input.policyVersion,
          input.requestedAt,
          input.requestedAt,
          input.requestedAt,
        ],
      });

      for (const stepType of orderedStepTypes) {
        await transaction.execute({
          sql: `INSERT INTO account_closure_steps (
            id, closure_id, step_type, status, attempt_count, next_attempt_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
          args: [randomUUID(), input.id, stepType, input.requestedAt, input.requestedAt, input.requestedAt],
        });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    const created = await this.findById(input.id);
    if (!created) throw new Error('ACCOUNT_CLOSURE_CREATE_FAILED');
    return created;
  }

  public async findBySubjectHash(subjectHash: string): Promise<AccountClosureRecord | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM account_closures WHERE subject_hash = ?',
      args: [subjectHash],
    });
    return result.rows[0] ? closureFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  public async findById(id: string): Promise<AccountClosureRecord | undefined> {
    const result = await this.client.execute({ sql: 'SELECT * FROM account_closures WHERE id = ?', args: [id] });
    return result.rows[0] ? closureFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  public async findByStatusTokenHash(id: string, tokenHash: string): Promise<AccountClosureRecord | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM account_closures WHERE id = ? AND status_token_hash = ?',
      args: [id, tokenHash],
    });
    return result.rows[0] ? closureFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  public async listSteps(closureId: string): Promise<AccountClosureStepRecord[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM account_closure_steps WHERE closure_id = ? ORDER BY ${stepOrderSql}`,
      args: [closureId],
    });
    return result.rows.map((row) => stepFromRow(row as Record<string, unknown>));
  }

  public async claimNextStep(input: { now: string; leaseOwner: string; leaseExpiresAt: string }): Promise<ClaimedClosureStep | undefined> {
    const dialect = (this.client as Client & { forgelexDialect?: 'sqlite' | 'postgres' }).forgelexDialect ?? 'sqlite';
    const eligibility = `s.status IN ('PENDING', 'RETRYABLE', 'LEASED')
      AND (s.status != 'LEASED' OR s.lease_expires_at <= ?)
      AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= ?)
      AND c.status NOT IN ('COMPLETED', 'RECONCILIATION_REQUIRED')
      AND NOT EXISTS (
        SELECT 1 FROM account_closure_steps prior
        WHERE prior.closure_id = s.closure_id
          AND prior.status != 'COMPLETED'
          AND (${stepOrderSql.replaceAll('step_type', 'prior.step_type')}) < (${stepOrderSql.replaceAll('step_type', 's.step_type')})
      )`;

    const claimed = dialect === 'postgres'
      ? await this.client.execute({
          sql: `WITH candidate AS (
            SELECT s.id FROM account_closure_steps s
            JOIN account_closures c ON c.id = s.closure_id
            WHERE ${eligibility}
            ORDER BY s.next_attempt_at ASC, s.created_at ASC
            FOR UPDATE SKIP LOCKED LIMIT 1
          )
          UPDATE account_closure_steps s
          SET status = 'LEASED', attempt_count = s.attempt_count + 1,
              lease_owner = ?, lease_expires_at = ?, updated_at = ?
          FROM candidate WHERE s.id = candidate.id RETURNING s.id`,
          args: [input.now, input.now, input.leaseOwner, input.leaseExpiresAt, input.now],
        })
      : await this.client.execute({
          sql: `UPDATE account_closure_steps
          SET status = 'LEASED', attempt_count = attempt_count + 1,
              lease_owner = ?, lease_expires_at = ?, updated_at = ?
          WHERE id = (
            SELECT s.id FROM account_closure_steps s
            JOIN account_closures c ON c.id = s.closure_id
            WHERE ${eligibility}
            ORDER BY s.next_attempt_at ASC, s.created_at ASC LIMIT 1
          )
          AND status IN ('PENDING', 'RETRYABLE', 'LEASED')
          AND (status != 'LEASED' OR lease_expires_at <= ?)
          RETURNING id`,
          args: [
            input.leaseOwner,
            input.leaseExpiresAt,
            input.now,
            input.now,
            input.now,
            input.now,
          ],
        });

    const claimedId = claimed.rows[0] ? String((claimed.rows[0] as Record<string, unknown>).id) : undefined;
    if (!claimedId) return undefined;
    const step = await this.findStepById(claimedId);
    if (!step) throw new Error('ACCOUNT_CLOSURE_CLAIMED_STEP_NOT_FOUND');
    const closure = await this.findById(step.closureId);
    if (!closure) throw new Error('ACCOUNT_CLOSURE_NOT_FOUND');
    return { closure, step };
  }

  public async completeStep(input: {
    closureId: string;
    stepType: AccountClosureStepType;
    now: string;
    nextStatus: AccountClosureStatus;
  }): Promise<void> {
    const transaction = await this.client.transaction();
    try {
      const completed = await transaction.execute({
        sql: `UPDATE account_closure_steps
          SET status = 'COMPLETED', lease_owner = NULL, lease_expires_at = NULL,
              next_attempt_at = NULL, last_error_code = NULL, completed_at = ?, updated_at = ?
          WHERE closure_id = ? AND step_type = ? AND status = 'LEASED'`,
        args: [input.now, input.now, input.closureId, input.stepType],
      });
      if (completed.rowsAffected === 0) {
        const existing = await transaction.execute({
          sql: 'SELECT status FROM account_closure_steps WHERE closure_id = ? AND step_type = ?',
          args: [input.closureId, input.stepType],
        });
        if (String(existing.rows[0]?.status) !== 'COMPLETED') throw new Error('ACCOUNT_CLOSURE_STEP_NOT_LEASED');
        await transaction.commit();
        return;
      }

      await transaction.execute({
        sql: `UPDATE account_closures
          SET status = ?, updated_at = ?,
              identity_removed_at = CASE WHEN ? = 'IDENTITY_REMOVED' THEN ? ELSE identity_removed_at END,
              completed_at = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_at END,
              next_attempt_at = CASE WHEN ? IN ('COMPLETED', 'RECONCILIATION_REQUIRED') THEN NULL ELSE ? END,
              last_error_code = NULL
          WHERE id = ?`,
        args: [
          input.nextStatus,
          input.now,
          input.nextStatus,
          input.now,
          input.nextStatus,
          input.now,
          input.nextStatus,
          input.now,
          input.closureId,
        ],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  public async retryStep(input: {
    closureId: string;
    stepType: AccountClosureStepType;
    now: string;
    nextAttemptAt: string;
    errorCode: string;
    terminal: boolean;
  }): Promise<void> {
    const transaction = await this.client.transaction();
    try {
      const retried = await transaction.execute({
        sql: `UPDATE account_closure_steps
          SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
              next_attempt_at = ?, last_error_code = ?, updated_at = ?
          WHERE closure_id = ? AND step_type = ? AND status = 'LEASED'`,
        args: [
          input.terminal ? 'FAILED' : 'RETRYABLE',
          input.terminal ? null : input.nextAttemptAt,
          input.errorCode,
          input.now,
          input.closureId,
          input.stepType,
        ],
      });
      if (retried.rowsAffected === 0) throw new Error('ACCOUNT_CLOSURE_STEP_NOT_LEASED');

      await transaction.execute(input.terminal
        ? {
            sql: `UPDATE account_closures
              SET status = 'RECONCILIATION_REQUIRED', attempt_count = attempt_count + 1,
                  last_error_code = ?, updated_at = ?, next_attempt_at = NULL
              WHERE id = ?`,
            args: [input.errorCode, input.now, input.closureId],
          }
        : {
            sql: `UPDATE account_closures
              SET attempt_count = attempt_count + 1, last_error_code = ?,
                  updated_at = ?, next_attempt_at = ?
              WHERE id = ?`,
            args: [input.errorCode, input.now, input.nextAttemptAt, input.closureId],
          });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  private async findStepById(id: string): Promise<AccountClosureStepRecord | undefined> {
    const result = await this.client.execute({ sql: 'SELECT * FROM account_closure_steps WHERE id = ?', args: [id] });
    return result.rows[0] ? stepFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }
}
