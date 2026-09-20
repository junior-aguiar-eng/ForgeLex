import { describe, expect, it } from 'vitest';
import { redactEvidence } from './redact-evidence.mjs';

describe('redactEvidence', () => {
  it.each(['authorization', 'cookie', 'token', 'secret', 'password', 'conversation', 'files', 'history', 'documentContent'])('rejeita chave proibida %s', (key) => {
    expect(() => redactEvidence({ [key]: 'sensitive' })).toThrow('EVIDENCE_FORBIDDEN_KEY');
  });

  it('redige texto jurídico e preserva evidência operacional', () => {
    const result = redactEvidence({ timestamp: '2026-09-20T00:00:00Z', requestId: 'req_1', operationId: 'op_1', hash: 'abc', code: 'OK', status: 200, latencyMs: 12, count: 1, chargedCents: 20, query: 'vazamento de dados', fullText: 'inteiro teor' });
    expect(result).toMatchObject({ requestId: 'req_1', status: 200, chargedCents: 20 });
    expect(result.query).toMatch(/^\[REDACTED:/);
    expect(result.fullText).toMatch(/^\[REDACTED:/);
  });
});
