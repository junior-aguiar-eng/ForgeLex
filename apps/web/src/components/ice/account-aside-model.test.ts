import { describe, expect, it } from 'vitest';
import { recentAccountActivity, summarizeApiKeys } from './account-aside-model';

const key = (over: Partial<{ id: string; name: string; keyPrefix: string; revokedAt: string | null }> = {}) => ({
  id: 'k1',
  name: 'Integração',
  keyPrefix: 'fx_live_4e21',
  scopes: ['research:read'],
  createdAt: '2026-10-01T10:00:00Z',
  revokedAt: null,
  ...over,
});
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

describe('resumo das chaves de API', () => {
  it('sem chaves devolve zeros e lista vazia', () => {
    expect(summarizeApiKeys([])).toEqual({ active: 0, revoked: 0, items: [] });
  });

  it('conta ativas e revogadas e mostra só o prefixo público de cada chave', () => {
    const summary = summarizeApiKeys([
      key({ id: 'a' }),
      key({ id: 'b', revokedAt: '2026-10-28T08:44:00Z', keyPrefix: 'fx_live_9b07' }),
    ]);
    expect(summary.active).toBe(1);
    expect(summary.revoked).toBe(1);
    expect(summary.items).toEqual([
      { id: 'a', name: 'Integração', prefix: 'fx_live_4e21', active: true },
      { id: 'b', name: 'Integração', prefix: 'fx_live_9b07', active: false },
    ]);
  });

  it('mostra no máximo três chaves, as ativas primeiro', () => {
    const keys = ['a', 'b', 'c', 'd'].map((id, index) =>
      key({ id, revokedAt: index === 0 ? '2026-10-01T00:00:00Z' : null }),
    );
    const summary = summarizeApiKeys(keys);
    expect(summary.items).toHaveLength(3);
    expect(summary.items.map((item) => item.active)).toEqual([true, true, true]);
    expect(summary.active).toBe(3);
    expect(summary.revoked).toBe(1);
  });

  it('nunca expõe segredo nem escopo no resumo', () => {
    expect(JSON.stringify(summarizeApiKeys([key()]))).not.toContain('research:read');
  });
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
