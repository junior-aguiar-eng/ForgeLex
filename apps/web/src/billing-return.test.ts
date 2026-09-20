import { describe, expect, it } from 'vitest';
import { parseBillingReturn } from './billing-return';

describe('retorno do checkout de billing', () => {
  it('interpreta pagamento aprovado e preserva o identificador da compra', () => {
    expect(parseBillingReturn('?billing_purchase=purchase-1&status=approved&collection_status=approved&payment_id=payment-1')).toEqual({
      purchaseId: 'purchase-1',
      paymentId: 'payment-1',
      outcome: 'approved',
    });
  });

  it('interpreta pagamento pendente sem tratá-lo como crédito confirmado', () => {
    expect(parseBillingReturn('?billing_purchase=purchase-2&status=pending')).toEqual({
      purchaseId: 'purchase-2',
      paymentId: undefined,
      outcome: 'pending',
    });
  });

  it('interpreta retorno cancelado sem inventar uma compra', () => {
    expect(parseBillingReturn('?billing_canceled=purchase-3')).toEqual({
      purchaseId: 'purchase-3',
      paymentId: undefined,
      outcome: 'canceled',
    });
  });
});
