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

export interface BeginAccountClosureInput {
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
  now: string;
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

function assertCompletionTransition(stepType: AccountClosureStepType, nextStatus: AccountClosureStatus): void {
  const invalid = stepType === 'VERIFY_RESIDUALS'
    ? nextStatus !== 'COMPLETED'
    : ['REQUESTED', 'ACCESS_BLOCKED', 'COMPLETED', 'RECONCILIATION_REQUIRED'].includes(nextStatus);
  if (invalid) throw new Error('ACCOUNT_CLOSURE_INVALID_TRANSITION');
}

function assertErrorCode(errorCode: string): void {
  if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(errorCode)) {
    throw new Error('ACCOUNT_CLOSURE_ERROR_CODE_INVALID');
  }
}

function assertReplayCompatible(existing: AccountClosureRecord, input: BeginAccountClosureInput): void {
  if (
    existing.idempotencyKeyHash !== input.idempotencyKeyHash ||
    existing.requestFingerprint !== input.requestFingerprint
  ) {
    throw new Error('ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT');
  }
  if (existing.statusTokenHash !== input.statusTokenHash) {
    throw new Error('ACCOUNT_CLOSURE_STATUS_TOKEN_MISMATCH');
  }
}

export class AccountClosureRepository {
  public constructor(private readonly client: Client) {}

  public async begin(input: BeginAccountClosureInput): Promise<{ closure: AccountClosureRecord; replay: boolean }> {
    const dialect = (this.client as Client & { forgelexDialect?: 'sqlite' | 'postgres' }).forgelexDialect ?? 'sqlite';
    const lockClause = dialect === 'postgres' ? ' FOR UPDATE' : '';
    const transaction = await this.client.transaction();
    try {
      const existingResult = await transaction.execute({
        sql: 'SELECT * FROM account_closures WHERE subject_hash = ?',
        args: [input.subjectHash],
      });
      const existingRow = existingResult.rows[0] as Record<string, unknown> | undefined;
      if (existingRow) {
        const existing = closureFromRow(existingRow);
        assertReplayCompatible(existing, input);
        await transaction.commit();
        return { closure: existing, replay: true };
      }

      const accountResult = await transaction.execute({
        sql: `SELECT u.supabase_user_id, u.status AS user_status,
          t.status AS tenant_status, m.role, m.status AS membership_status
          FROM forgelex_user_profiles u
          JOIN forgelex_tenant_memberships m ON m.user_id = u.id
          JOIN forgelex_tenants t ON t.id = m.tenant_id
          WHERE u.id = ? AND u.supabase_user_id = ? AND t.id = ? AND m.tenant_id = ?
          LIMIT 1${lockClause}`,
        args: [input.userId, input.subjectId, input.tenantId, input.tenantId],
      });
      const account = accountResult.rows[0] as Record<string, unknown> | undefined;
      if (
        !account ||
        String(account.user_status) !== 'ACTIVE' ||
        String(account.tenant_status) !== 'ACTIVE' ||
        String(account.membership_status) !== 'ACTIVE'
      ) {
        throw new Error('ACCOUNT_CLOSURE_ACCOUNT_NOT_ACTIVE');
      }

      const membershipsResult = await transaction.execute({
        sql: `SELECT user_id, role FROM forgelex_tenant_memberships
          WHERE tenant_id = ? AND status = 'ACTIVE'${lockClause}`,
        args: [input.tenantId],
      });
      if (
        membershipsResult.rows.length !== 1 ||
        String(membershipsResult.rows[0]?.user_id) !== input.userId ||
        String(membershipsResult.rows[0]?.role) !== 'OWNER'
      ) {
        throw new Error('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
      }
      const userMemberships = await transaction.execute({
        sql: `SELECT tenant_id FROM forgelex_tenant_memberships
          WHERE user_id = ? AND status = 'ACTIVE'${lockClause}`,
        args: [input.userId],
      });
      if (
        userMemberships.rows.length !== 1 ||
        String(userMemberships.rows[0]?.tenant_id) !== input.tenantId
      ) {
        throw new Error('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
      }

      await transaction.execute({
        sql: `INSERT INTO account_closures (
          id, subject_id, user_id, tenant_id, subject_hash, user_hash, tenant_hash,
          status_token_hash, idempotency_key_hash, request_fingerprint, policy_version,
          status, requested_at, updated_at, access_blocked_at, next_attempt_at, attempt_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCESS_BLOCKED', ?, ?, ?, ?, 0)`,
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
          input.now,
          input.now,
          input.now,
          input.now,
        ],
      });
      for (const stepType of orderedStepTypes) {
        await transaction.execute({
          sql: `INSERT INTO account_closure_steps (
            id, closure_id, step_type, status, attempt_count, next_attempt_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
          args: [randomUUID(), input.id, stepType, input.now, input.now, input.now],
        });
      }

      const userUpdate = await transaction.execute({
        sql: `UPDATE forgelex_user_profiles
          SET status = 'DISABLED', updated_at = ?, deactivated_at = ?
          WHERE id = ? AND status = 'ACTIVE'`,
        args: [input.now, input.now, input.userId],
      });
      const tenantUpdate = await transaction.execute({
        sql: `UPDATE forgelex_tenants
          SET status = 'DISABLED', updated_at = ?, deactivated_at = ?
          WHERE id = ? AND status = 'ACTIVE'`,
        args: [input.now, input.now, input.tenantId],
      });
      const membershipUpdate = await transaction.execute({
        sql: `UPDATE forgelex_tenant_memberships
          SET status = 'REVOKED', updated_at = ?, revoked_at = ?
          WHERE tenant_id = ? AND user_id = ? AND status = 'ACTIVE'`,
        args: [input.now, input.now, input.tenantId, input.userId],
      });
      if (userUpdate.rowsAffected !== 1 || tenantUpdate.rowsAffected !== 1 || membershipUpdate.rowsAffected !== 1) {
        throw new Error('ACCOUNT_CLOSURE_CONCURRENT_ACCOUNT_CHANGE');
      }
      await transaction.execute({
        sql: 'UPDATE api_keys SET revoked_at = ? WHERE tenant_id = ? AND revoked_at IS NULL',
        args: [input.now, input.tenantId],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      const existing = await this.findBySubjectHash(input.subjectHash);
      if (existing) {
        assertReplayCompatible(existing, input);
        return { closure: existing, replay: true };
      }
      throw error;
    }

    const created = await this.findById(input.id);
    if (!created) throw new Error('ACCOUNT_CLOSURE_CREATE_FAILED');
    return { closure: created, replay: false };
  }

  public async isBlocked(input: {
    subjectId: string;
    userId: string;
    tenantId: string;
    subjectHash?: string;
    userHash?: string;
    tenantHash?: string;
  }): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT 1 AS blocked FROM account_closures
        WHERE subject_id = ? OR user_id = ? OR tenant_id = ?
          OR (? IS NOT NULL AND subject_hash = ?)
          OR (? IS NOT NULL AND user_hash = ?)
          OR (? IS NOT NULL AND tenant_hash = ?)
        LIMIT 1`,
      args: [
        input.subjectId,
        input.userId,
        input.tenantId,
        input.subjectHash ?? null,
        input.subjectHash ?? null,
        input.userHash ?? null,
        input.userHash ?? null,
        input.tenantHash ?? null,
        input.tenantHash ?? null,
      ],
    });
    return result.rows.length > 0;
  }

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
    assertCompletionTransition(input.stepType, input.nextStatus);
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
    assertErrorCode(input.errorCode);
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
