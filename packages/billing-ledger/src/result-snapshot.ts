import { gunzipSync, gzipSync } from 'node:zlib';
import { DomainError } from '@forgelex/domain';
export const MAX_RESULT_SNAPSHOT_BYTES = 8_388_608;
export function encodeResultSnapshot(result: unknown): string {
  const raw = JSON.stringify(result);
  const compressed = `gzip:${gzipSync(raw).toString('base64')}`;
  const snapshot = Buffer.byteLength(compressed, 'utf8') < Buffer.byteLength(raw, 'utf8') ? compressed : raw;
  if (Buffer.byteLength(snapshot, 'utf8') > MAX_RESULT_SNAPSHOT_BYTES)
    throw new DomainError('OPERATION_RESULT_TOO_LARGE', 'Resultado excede o limite de recuperação.');
  return snapshot;
}
export function decodeResultSnapshot<T = unknown>(snapshot: string): T {
  try {
    if (Buffer.byteLength(snapshot, 'utf8') > MAX_RESULT_SNAPSHOT_BYTES) throw new Error('oversize');
    return JSON.parse(
      snapshot.startsWith('gzip:') ? gunzipSync(Buffer.from(snapshot.slice(5), 'base64')).toString('utf8') : snapshot,
    ) as T;
  } catch {
    throw new DomainError('IDEMPOTENCY_RESULT_INVALID', 'Os resultados conservados não estão disponíveis.');
  }
}
