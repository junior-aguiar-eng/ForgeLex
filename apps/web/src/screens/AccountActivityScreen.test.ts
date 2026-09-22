import { describe, expect, it } from 'vitest';
import { summarizeActivities, type BillingActivity } from './AccountActivityScreen';

const now = new Date('2026-09-22T12:00:00.000Z');

describe('atividade da conta', () => {
  it('calcula métricas apenas de operações faturáveis reais dos últimos 30 dias', () => {
    const activities: BillingActivity[] = [
      { id: 'mcp-1', type: 'DEBIT', amountCents: 20, status: 'SETTLED', date: '2026-09-21T12:00:00.000Z', capability: 'research.search_case_law', channel: 'MCP' },
      { id: 'rest-1', type: 'DEBIT', amountCents: 20, status: 'SETTLED', date: '2026-08-23T12:00:00.000Z', capability: 'research.search_case_law', channel: 'REST' },
      { id: 'old', type: 'DEBIT', amountCents: 20, status: 'SETTLED', date: '2026-08-22T11:59:59.000Z', capability: 'research.search_case_law', channel: 'WEB' },
    ];

    expect(summarizeActivities(activities, now)).toEqual({ operations: 2, spentCents: 40, lastUsedAt: '2026-09-21T12:00:00.000Z' });
  });

  it('mantém o estado vazio sem inferir uso a partir do saldo ou de créditos promocionais', () => {
    expect(summarizeActivities([], now)).toEqual({ operations: 0, spentCents: 0, lastUsedAt: null });
  });
});
