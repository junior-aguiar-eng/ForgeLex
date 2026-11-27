import { describe, expect, it } from 'vitest';
import { recentAccountActivity } from './account-aside-model';

const tx = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  type: 'DEBIT',
  amountCents: 20,
  status: 'POSTED',
  date: '2026-11-10T10:00:00Z',
  capability: null,
  channel: null,
  technical: null,
  ...over,
});

describe('atividade recente da conta', () => {
  it('ordena do mais recente ao mais antigo e limita a três', () => {
    const items = recentAccountActivity([
      tx({ id: '1', date: '2026-11-01T10:00:00Z' }),
      tx({ id: '2', date: '2026-11-04T10:00:00Z' }),
      tx({ id: '3', date: '2026-11-03T10:00:00Z' }),
      tx({ id: '4', date: '2026-11-02T10:00:00Z' }),
    ]);
    expect(items.map((item) => item.id)).toEqual(['2', '3', '4']);
  });

  it('usa os mesmos rótulos dos lançamentos da conta', () => {
    const [credit, refund, use, work] = recentAccountActivity(
      [
        tx({ id: 'c', type: 'CREDIT', amountCents: 10000, date: '2026-11-04T10:00:00Z' }),
        tx({ id: 'r', type: 'REFUND', amountCents: 20, date: '2026-11-03T10:00:00Z' }),
        tx({ id: 'u', type: 'DEBIT', date: '2026-11-02T10:00:00Z' }),
        tx({ id: 'w', type: 'DEBIT', capability: 'agentic.commercial_execution', date: '2026-11-01T10:00:00Z' }),
      ],
      4,
    );
    expect(credit.label).toBe('Crédito');
    expect(refund.label).toBe('Reembolso');
    expect(use.label).toBe('Uso');
    expect(work.label).toBe('Trabalho jurídico');
  });

  it('carrega o valor em centavos do serviço, sem recalcular', () => {
    const [item] = recentAccountActivity([tx({ amountCents: 1234 })]);
    expect(item.amountCents).toBe(1234);
  });

  it('sem lançamentos devolve lista vazia', () => {
    expect(recentAccountActivity([])).toEqual([]);
  });
});
