import { createHash } from 'node:crypto';

export function searchOperationFingerprint(input: {
  userId?: string;
  query: string;
  court?: string;
  judgmentYear?: number;
  limit: number;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'research.search_case_law',
        input.userId ?? null,
        input.query.trim(),
        input.court?.trim().toUpperCase() || 'STJ',
        input.judgmentYear ?? null,
        input.limit,
      ]),
    )
    .digest('hex');
}
