import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StripePaymentProvider } from './stripe-payment-provider.js';

function signature(payload: string, secret: string, timestamp = 1_700_000_000): string {
  const signed = `${timestamp}.${payload}`;
  const digest = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('StripePaymentProvider', () => {
  it('valida assinatura do webhook sobre o corpo bruto', () => {
    const provider = new StripePaymentProvider({ secretKey: 'sk_test', webhookSecret: 'whsec_test', clock: () => 1_700_000_000 });
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });

    expect(provider.verifyWebhook(payload, signature(payload, 'whsec_test'))).toMatchObject({ id: 'evt_1', type: 'checkout.session.completed' });
    expect(() => provider.verifyWebhook(payload, signature(payload, 'wrong'))).toThrow('STRIPE_SIGNATURE_INVALID');
  });

  it('cria Checkout em BRL com metadata e chave de idempotência', async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const provider = new StripePaymentProvider({
      secretKey: 'sk_test',
      webhookSecret: 'whsec_test',
      fetcher: async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }), { status: 200 });
      },
    });

    const result = await provider.createCheckout({
      amountCents: 5000,
      tenantId: 'tenant_a',
      userId: 'user_a',
      purchaseId: 'purchase_a',
      successUrl: 'http://localhost:3000/credits?purchase=purchase_a',
      cancelUrl: 'http://localhost:3000/credits?canceled=purchase_a',
      idempotencyKey: 'checkout:purchase_a',
    });

    expect(result).toEqual({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' });
    expect(request?.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(request?.init.headers).toMatchObject({ Authorization: 'Bearer sk_test', 'Idempotency-Key': 'checkout:purchase_a' });
    const body = String(request?.init.body);
    expect(body).toContain('price_data%5D%5Bcurrency%5D=brl');
    expect(body).toContain('price_data%5D%5Bunit_amount%5D=5000');
    expect(body).toContain('metadata%5Btenant_id%5D=tenant_a');
    expect(body).toContain('payment_method_types%5B%5D=card');
    expect(body).toContain('payment_method_types%5B%5D=pix');
  });

  it('cria refund parcial pelo PaymentIntent com idempotência', async () => {
    let request: { init: RequestInit } | undefined;
    const provider = new StripePaymentProvider({
      secretKey: 'sk_test',
      webhookSecret: 'whsec_test',
      fetcher: async (_url, init) => {
        request = { init };
        return new Response(JSON.stringify({ id: 're_test_1', status: 'succeeded' }), { status: 200 });
      },
    });

    await provider.refundPayment({ paymentIntentId: 'pi_test_1', amountCents: 3200, idempotencyKey: 'refund:purchase_a' });

    expect(request?.init.headers).toMatchObject({ Authorization: 'Bearer sk_test', 'Idempotency-Key': 'refund:purchase_a' });
    expect(String(request?.init.body)).toContain('payment_intent=pi_test_1');
    expect(String(request?.init.body)).toContain('amount=3200');
  });

  it('cria Customer e lista apenas dados públicos dos cartões', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const provider = new StripePaymentProvider({
      secretKey: 'sk_test',
      webhookSecret: 'whsec_test',
      fetcher: async (url, init) => {
        requests.push({ url: String(url), init });
        if (String(url).endsWith('/customers')) {
          return new Response(JSON.stringify({ id: 'cus_test_1' }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [{ id: 'pm_1', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }] }), { status: 200 });
      },
    });

    await expect(provider.createCustomer({ tenantId: 'tenant_a', idempotencyKey: 'customer:tenant_a' })).resolves.toEqual({ id: 'cus_test_1' });
    await expect(provider.listPaymentMethods('cus_test_1')).resolves.toEqual([{ id: 'pm_1', type: 'card', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }]);
    expect(requests[0].init.headers).toMatchObject({ 'Idempotency-Key': 'customer:tenant_a' });
    expect(requests[1].init.method).toBe('GET');
  });
});
