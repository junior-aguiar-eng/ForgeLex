import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function digestClosureValue(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function deriveClosureStatusToken(secret: string, subjectId: string, idempotencyKey: string): string {
  const digest = createHmac('sha256', secret)
    .update('forgelex-account-closure-status\0', 'utf8')
    .update(subjectId, 'utf8')
    .update('\0', 'utf8')
    .update(idempotencyKey, 'utf8')
    .digest('base64url');
  return `flx_close_${digest}`;
}

export function verifyClosureStatusToken(
  secret: string,
  subjectId: string,
  idempotencyKey: string,
  candidate: string,
): boolean {
  const expected = Buffer.from(deriveClosureStatusToken(secret, subjectId, idempotencyKey), 'utf8');
  const received = Buffer.from(candidate, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function fingerprintClosureRequest(input: { confirmation: string; policyVersion: string }): string {
  return createHash('sha256')
    .update(JSON.stringify([input.confirmation, input.policyVersion]), 'utf8')
    .digest('hex');
}
