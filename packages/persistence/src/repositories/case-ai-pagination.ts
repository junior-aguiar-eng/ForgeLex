import { createHash } from 'node:crypto';
import { z } from 'zod';
export const CASE_RESPONSE_BYTES = 24 * 1024;
export function caseBinding(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
const cursorSchema = z.object({ binding: z.string().length(64), position: z.number().int().nonnegative() }).strict();
export function caseCursor(binding: string, position: number) {
  return Buffer.from(JSON.stringify({ binding, position })).toString('base64url');
}
export function casePosition(cursor: string | undefined, binding: string): number {
  if (!cursor) return 0;
  try {
    if (cursor.length > 1024) throw new Error();
    const v = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
    if (v.binding !== binding) throw new Error();
    return v.position;
  } catch {
    throw new Error('CASE_CURSOR_INVALID: Atualize a consulta.');
  }
}
export function shortText(value: string, limit = 300) {
  return Array.from(value).slice(0, limit).join('');
}
export function boundedItems<T>(
  items: T[],
  position: number,
  limit: number,
  base: object,
  binding: string,
  mcp = false,
): { items: T[]; nextCursor?: string } {
  if (position > items.length) throw new Error('CASE_CURSOR_INVALID');
  const chosen: T[] = [];
  const count = Math.min(50, Math.max(1, limit));
  for (let i = position; i < items.length && chosen.length < count; i++) {
    const candidate = [...chosen, items[i]];
    const payload = { ...base, items: candidate, nextCursor: caseCursor(binding, i + 1) };
    // Include both MCP representations and escaping, plus room for the request id.
    const wire = mcp
      ? {
          jsonrpc: '2.0',
          id: 'x'.repeat(1024),
          result: {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: payload }) }],
            structuredContent: payload,
            isError: false,
            billing: { mode: 'FREE', chargedCents: 0, isReplay: false },
          },
        }
      : payload;
    if (Buffer.byteLength(JSON.stringify(wire)) > CASE_RESPONSE_BYTES) break;
    chosen.push(items[i]);
  }
  if (!chosen.length && position < items.length) throw new Error('CASE_ITEM_TOO_LARGE');
  const end = position + chosen.length;
  return { items: chosen, ...(end < items.length ? { nextCursor: caseCursor(binding, end) } : {}) };
}
