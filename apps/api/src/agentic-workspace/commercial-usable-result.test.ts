import { describe, expect, it } from 'vitest';
import type { AgenticTaskDelivery } from '@forgelex/domain';
import { CASE_TASK_LIMITATION_CODES } from '@forgelex/legal-workflows';
import { hasUsableResult } from './commercial-runtime.js';

const delivery = (parts: Partial<AgenticTaskDelivery>) =>
  ({
    action: 'review_text',
    claims: [],
    findings: [],
    sources: [{ id: 's1' }],
    ...parts,
  }) as unknown as AgenticTaskDelivery;
const finding = (code: string, sourceIds = ['s1']) => ({
  id: code,
  code,
  severity: 'BLOCKING',
  statement: 'x',
  sourceIds,
});

describe('entrega utilizável para cobrança', () => {
  it.each(CASE_TASK_LIMITATION_CODES)('o código de limitação %s fundamentado não torna a entrega cobrável', (code) => {
    expect(hasUsableResult(delivery({ findings: [finding(code)] as never }))).toBe(false);
  });
  it('apontamento de revisão fundamentado em fonte da entrega é cobrável', () => {
    expect(hasUsableResult(delivery({ findings: [finding('DEADLINE_MISSED_BY_FILING')] as never }))).toBe(true);
  });
  it('apontamento sem fonte, ou com fonte fora da entrega, não é cobrável', () => {
    expect(hasUsableResult(delivery({ findings: [finding('DEADLINE_MISSED_BY_FILING', [])] as never }))).toBe(false);
    expect(hasUsableResult(delivery({ findings: [finding('DEADLINE_MISSED_BY_FILING', ['other'])] as never }))).toBe(
      false,
    );
  });
  it('afirmação fundamentada é cobrável e a ação precisa coincidir com a pedida', () => {
    const claims = [{ id: 'c', statement: 'x', sourceIds: ['s1'] }] as never;
    expect(hasUsableResult(delivery({ claims }))).toBe(true);
    expect(hasUsableResult(delivery({ claims }), 'research_question')).toBe(false);
  });
});
