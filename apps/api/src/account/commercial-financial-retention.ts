import { createHash } from 'node:crypto';
import type { Client } from '@forgelex/persistence';
import type { BillingRetentionInput } from './account-closure-billing-retention.js';

type Executor = Pick<Client, 'execute'>;
const pending = () => new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING');
function payload(value: unknown): Record<string, unknown> {
  try {
    const data = JSON.parse(String(value));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw pending();
    return data;
  } catch {
    throw pending();
  }
}
const money = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Runs under the same ledger account lock as reservations and releases. */
export async function assertCommercialClosureReady(client: Executor, tenantId: string) {
  const executions = await client.execute({
    sql: 'SELECT id,idempotency_key,status,payload_json FROM commercial_executions WHERE tenant_id=?',
    args: [tenantId],
  });
  const calls = await client.execute({
    sql: 'SELECT id,call_id,status,payload_json FROM commercial_calls WHERE tenant_id=?',
    args: [tenantId],
  });
  for (const row of executions.rows) {
    const data = payload(row.payload_json);
    if (
      !['COMPLETED', 'FAILED', 'CANCELLED'].includes(String(row.status)) ||
      row.status !== data.status ||
      !money(data.reservedCents) ||
      !money(data.chargedCents) ||
      !money(data.releasedCents) ||
      !money(data.expiredPromoCents ?? 0) ||
      data.reservedCents !== data.chargedCents + data.releasedCents + Number(data.expiredPromoCents ?? 0)
    )
      throw pending();
  }
  for (const row of calls.rows) {
    const data = payload(row.payload_json);
    if (
      !['SETTLED', 'VOID', 'UNCERTAIN'].includes(String(row.status)) ||
      row.status !== data.status ||
      !money(data.upperBoundMicroUsd) ||
      (row.status === 'UNCERTAIN' ? data.actualMicroUsd !== null : !money(data.actualMicroUsd))
    )
      throw pending();
  }
  return { executions: executions.rows, calls: calls.rows };
}

export async function minimizeCommercialFinance(client: Executor, input: BillingRetentionInput) {
  const { executions, calls } = await assertCommercialClosureReady(client, input.tenantId);
  const retainedKey = (value: unknown) =>
    createHash('sha256')
      .update('forgelex-closed-commercial\0')
      .update(input.tenantPseudonym)
      .update('\0')
      .update(String(value))
      .digest('hex');
  const retain = (source: Record<string, unknown>, allowed: string[]) =>
    Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  const numericSnapshot = (raw: unknown, fields: string[]) => {
    if (raw === undefined) return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw pending();
    const data = retain(raw as Record<string, unknown>, fields);
    if (Object.values(data).some((value) => !money(value))) throw pending();
    return data;
  };
  for (const row of executions) {
    const data = retain(payload(row.payload_json), [
      'id',
      'accountId',
      'executionId',
      'status',
      'currency',
      'policyVersion',
      'reservedCents',
      'chargedCents',
      'releasedCents',
      'expiredPromoCents',
      'measuredMicroUsd',
      'uncertainMicroUsd',
      'createdAt',
      'finalizedAt',
      'reservedPaidCents',
      'reservedPromoCents',
      'promoExpiresAt',
      'firstAuthorizedAt',
    ]);
    const policy = numericSnapshot(payload(row.payload_json).policy, [
      'reserveCents',
      'minimumCents',
      'maxInferenceMicroUsd',
      'maxCalls',
      'dailyLimitCents',
      'monthlyLimitCents',
      'maxOutputTokens',
      'maxDurationMs',
      'inputMicroUsdPerMillion',
      'outputMicroUsdPerMillion',
      'cachedInputMicroUsdPerMillion',
      'centsPerUsd',
      'fixedCents',
    ]);
    if (policy) data.policy = policy;
    await client.execute({
      sql: 'UPDATE commercial_executions SET tenant_id=?,user_id=?,idempotency_key=?,payload_json=? WHERE id=?',
      args: [
        input.tenantPseudonym,
        input.userPseudonym,
        retainedKey(row.idempotency_key),
        JSON.stringify({ ...data, tenantId: input.tenantPseudonym, userId: input.userPseudonym }),
        String(row.id),
      ],
    });
  }
  for (const row of calls) {
    const data = retain(payload(row.payload_json), [
      'id',
      'executionId',
      'status',
      'inputTokens',
      'maxOutputTokens',
      'upperBoundMicroUsd',
      'actualMicroUsd',
      'authorizedAt',
      'settledAt',
    ]);
    const usage = numericSnapshot(payload(row.payload_json).usage, [
      'inputTokens',
      'outputTokens',
      'cachedInputTokens',
    ]);
    if (usage) data.usage = usage;
    await client.execute({
      sql: 'UPDATE commercial_calls SET tenant_id=?,user_id=?,call_id=?,payload_json=? WHERE id=?',
      args: [
        input.tenantPseudonym,
        input.userPseudonym,
        retainedKey(row.call_id),
        JSON.stringify({
          ...data,
          callId: retainedKey(row.call_id),
          tenantId: input.tenantPseudonym,
          userId: input.userPseudonym,
        }),
        String(row.id),
      ],
    });
  }
}
