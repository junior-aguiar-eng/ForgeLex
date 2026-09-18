import { describe, expect, it } from 'vitest';
import {
  CREDIT_PACKAGES,
  JURISPRUDENCE_SEARCH_COST_CENTS,
  calculateRefundableCents,
  validateCreditPurchase,
} from './billing-rules.js';

describe('regras comerciais do billing ForgeLex', () => {
  it('expõe os pacotes comerciais aprovados em BRL', () => {
    expect(CREDIT_PACKAGES).toEqual([
      { id: 'credits_25', amountCents: 2500 },
      { id: 'credits_50', amountCents: 5000 },
      { id: 'credits_80', amountCents: 8000 },
    ]);
  });

  it('aceita pacote conhecido e valor personalizado entre R$ 25 e R$ 500', () => {
    expect(validateCreditPurchase({ packageId: 'credits_50' })).toEqual({ amountCents: 5000, packageId: 'credits_50' });
    expect(validateCreditPurchase({ amountCents: 2500 })).toEqual({ amountCents: 2500, packageId: 'custom' });
    expect(validateCreditPurchase({ amountCents: 50000 })).toEqual({ amountCents: 50000, packageId: 'custom' });
  });

  it('rejeita valor personalizado fora dos limites ou pacote desconhecido', () => {
    expect(() => validateCreditPurchase({ amountCents: 2499 })).toThrow('BILLING_AMOUNT_INVALID');
    expect(() => validateCreditPurchase({ amountCents: 50001 })).toThrow('BILLING_AMOUNT_INVALID');
    expect(() => validateCreditPurchase({ packageId: 'credits_60' })).toThrow('BILLING_PACKAGE_INVALID');
  });

  it('cobra R$ 0,20 por busca jurisprudencial', () => {
    expect(JURISPRUDENCE_SEARCH_COST_CENTS).toBe(20);
  });

  it('limita o reembolso ao saldo ainda disponível do lote comprado', () => {
    expect(calculateRefundableCents({ purchaseAmountCents: 5000, remainingCreditCents: 3200 })).toBe(3200);
    expect(calculateRefundableCents({ purchaseAmountCents: 5000, remainingCreditCents: 0 })).toBe(0);
    expect(calculateRefundableCents({ purchaseAmountCents: 5000, remainingCreditCents: 7000 })).toBe(5000);
  });
});
