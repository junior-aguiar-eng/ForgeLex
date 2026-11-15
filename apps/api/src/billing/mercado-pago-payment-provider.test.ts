import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentProviderRejectedError } from './billing-operations.js';
import { MercadoPagoPaymentProvider } from './mercado-pago-payment-provider.js';

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MercadoPagoPaymentProvider', () => {
  it('cria uma order Checkout Pro em BRL com idempotência e URLs de retorno', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'ORDTEST123',
      checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTEST123',
    }));
    const provider = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test', now: () => 1700000000000,
      webhookSecret: 'webhook-secret',
      notificationUrl: 'https://api.forgelex.test/api/v2/webhooks/mercadopago',
      fetcher,
    });

    const checkout = await provider.createCheckout({
      amountCents: 5000,
      tenantId: 'tenant_1',
      userId: 'user_1',
      purchaseId: 'purchase_1',
      successUrl: 'https://app.forgelex.test/?billing_purchase=purchase_1',
      cancelUrl: 'https://app.forgelex.test/?billing_canceled=purchase_1',
      idempotencyKey: 'checkout_1',
    });

    expect(checkout).toEqual({
      id: 'ORDTEST123',
      url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTEST123',
    });
    expect(fetcher).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer APP_USR_test',
        'X-Idempotency-Key': 'checkout_1',
      }),
    }));
    const init = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      type: 'online',
      processing_mode: 'manual',
      total_amount: '50.00',
      external_reference: 'purchase_1',
      config: {
        online: {
          success_url: 'https://app.forgelex.test/?billing_purchase=purchase_1',
          failure_url: 'https://app.forgelex.test/?billing_canceled=purchase_1',
          pending_url: 'https://app.forgelex.test/?billing_canceled=purchase_1',
          auto_return: 'approved',
        },
      },
    });
  });

  it('envia itens compatíveis com a API atual de Orders do Mercado Pago', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'ORDTEST124',
      checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTEST124',
    }));
    const provider = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test', now: () => 1700000000000,
      webhookSecret: 'webhook-secret',
      notificationUrl: 'https://api.forgelex.test/api/v2/webhooks/mercadopago',
      fetcher,
    });

    await provider.createCheckout({
      amountCents: 5000,
      tenantId: 'tenant_1',
      userId: 'user_1',
      purchaseId: 'purchase_2',
      successUrl: 'https://app.forgelex.test/?billing_purchase=purchase_2',
      cancelUrl: 'https://app.forgelex.test/?billing_canceled=purchase_2',
      idempotencyKey: 'checkout_2',
    });

    const init = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { items: Array<Record<string, unknown>> };
    expect(body.items).toEqual([{
      title: 'Créditos ForgeLex',
      unit_price: '50.00',
      quantity: 1,
    }]);
  });

  it('usa a configuração de webhook da aplicação sem enviar propriedade rejeitada na order', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'ORDTEST125',
      checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTEST125',
    }));
    const provider = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test', now: () => 1700000000000,
      webhookSecret: 'webhook-secret',
      notificationUrl: 'https://api.forgelex.test/api/v2/webhooks/mercadopago',
      fetcher,
    });

    await provider.createCheckout({
      amountCents: 5000,
      tenantId: 'tenant_1',
      userId: 'user_1',
      purchaseId: 'purchase_3',
      successUrl: 'https://app.forgelex.test/?billing_purchase=purchase_3',
      cancelUrl: 'https://app.forgelex.test/?billing_canceled=purchase_3',
      idempotencyKey: 'checkout_3',
    });

    const init = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { config: Record<string, unknown> };
    expect(body.config).not.toHaveProperty('notification_url');
  });

  it('valida a assinatura HMAC e normaliza uma order processada para o ledger', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'ORDTEST123',
      status: 'processed',
      external_reference: 'purchase_1',
      total_amount: '50.00',
      currency: 'BRL',
      transactions: { payments: [{ id: 'PAYTEST123', status: 'processed' }] },
    }));
    const provider = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test', now: () => 1700000000000,
      webhookSecret: 'webhook-secret',
      fetcher,
      clock: () => 1700000000,
    });
    const payload = { id: 99, type: 'order', action: 'order.updated', data: { id: 'ORDTEST123' } };
    const timestamp = '1700000000';
    const manifest = 'id:ordtest123;request-id:req_1;ts:1700000000;';
    const signature = `ts=${timestamp},v1=${createHmac('sha256', 'webhook-secret').update(manifest).digest('hex')}`;

    const event = await provider.normalizeWebhook({
      payload,
      dataId: 'ORDTEST123',
      requestId: 'req_1',
      signature,
    });

    expect(event).toMatchObject({
      id: 'order:ORDTEST123:paid',
      provider: 'mercadopago',
      type: 'payment.approved',
      data: { object: {
        payment_status: 'paid',
        provider_payment_id: 'ORDTEST123',
        provider_checkout_id: 'ORDTEST123',
        amount_total: 5000,
        currency: 'brl',
        external_reference: 'purchase_1',
        metadata: { purchase_id: 'purchase_1' },
      } },
    });
    expect(fetcher).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders/ORDTEST123', expect.objectContaining({ method: 'GET' }));
  });

  it('normaliza pagamento com order aninhada para a mesma identidade de checkout', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'PAYTEST123',
      status: 'approved',
      external_reference: 'purchase_1',
      transaction_amount: 50,
      currency_id: 'BRL',
      order: { id: 'ORDTEST123' },
    }));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret', fetcher });
    const manifest = 'id:paytest123;request-id:req_2;ts:1700000000;';
    const signature = `ts=1700000000,v1=${createHmac('sha256', 'webhook-secret').update(manifest).digest('hex')}`;

    const event = await provider.normalizeWebhook({
      payload: { type: 'payment', action: 'payment.updated' },
      dataId: 'PAYTEST123',
      requestId: 'req_2',
      signature,
    });

    expect(event.data.object).toMatchObject({
      provider_payment_id: 'ORDTEST123',
      provider_checkout_id: 'ORDTEST123',
      amount_total: 5000,
      currency: 'brl',
      external_reference: 'purchase_1',
      metadata: { purchase_id: 'purchase_1' },
    });
  });

  it('distingue mudança de status sem id de notificação e preserva replay', async () => {
    let status = 'created';
    const fetcher = vi.fn(async () => response({ id: 'ORDTEST123', status, external_reference: 'purchase_1', total_amount: '25.00', currency: 'BRL' }));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret', fetcher });
    const manifest = 'id:ordtest123;request-id:req_1;ts:1700000000;';
    const signature = `ts=1700000000,v1=${createHmac('sha256', 'webhook-secret').update(manifest).digest('hex')}`;
    const input = { payload: { type: 'order' }, dataId: 'ORDTEST123', requestId: 'req_1', signature };
    const pending = await provider.normalizeWebhook(input);
    status = 'processed';
    const paid = await provider.normalizeWebhook(input);
    const replay = await provider.normalizeWebhook(input);
    expect(pending.type).toBe('payment.processing');
    expect(paid.type).toBe('payment.approved');
    expect(paid.id).not.toBe(pending.id);
    expect(replay.id).toBe(paid.id);
  });

  it('rejeita assinatura inválida antes de consultar a order', async () => {
    const fetcher = vi.fn(async () => response({}));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret', fetcher });

    await expect(provider.normalizeWebhook({
      payload: { id: 99, type: 'order', data: { id: 'ORDTEST123' } },
      dataId: 'ORDTEST123',
      requestId: 'req_1',
      signature: 'ts=1700000000,v1=invalid',
    })).rejects.toThrow('MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([[400], [404], [422]])('classifica HTTP %i do provedor como recusa definitiva', async (status) => {
    const fetcher = vi.fn(async () => response({ message: 'rejected' }, status));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret', fetcher });
    const failure = await provider.refundPayment({ providerPaymentId: 'ORDTEST123', amountCents: 1000, idempotencyKey: 'refund:1' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PaymentProviderRejectedError);
    expect((failure as Error).message).toBe(`MERCADOPAGO_REQUEST_FAILED:${status}`);
  });

  it.each([[408], [409], [425], [429], [500], [503]])('mantem HTTP %i do provedor como resultado desconhecido', async (status) => {
    const fetcher = vi.fn(async () => response({ message: 'later' }, status));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret', fetcher });
    const failure = await provider.refundPayment({ providerPaymentId: 'ORDTEST123', amountCents: 1000, idempotencyKey: 'refund:1' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PaymentProviderRejectedError);
    expect((failure as Error).message).toBe(`MERCADOPAGO_REQUEST_FAILED:${status}`);
  });

  it('trata ordem sem pagamento vinculado como recusa definitiva e timeout como desconhecido', async () => {
    const noPayment = vi.fn(async () => response({ transactions: { payments: [] } }));
    const rejected = await new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret', fetcher: noPayment })
      .refundPayment({ providerPaymentId: 'ORDTEST123', amountCents: 1000, idempotencyKey: 'refund:1' }).catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(PaymentProviderRejectedError);
    expect((rejected as Error).message).toBe('MERCADOPAGO_PAYMENT_NOT_FOUND');

    const timedOut = vi.fn(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
    const unknown = await new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret', fetcher: timedOut })
      .refundPayment({ providerPaymentId: 'ORDTEST123', amountCents: 1000, idempotencyKey: 'refund:1' }).catch((error: unknown) => error);
    expect(unknown).not.toBeInstanceOf(PaymentProviderRejectedError);
  });

  it('consulta a transação e envia reembolso parcial idempotente na order', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ transactions: { payments: [{ id: 'PAYTEST123' }] } }))
      .mockResolvedValueOnce(response({ id: 'ORDTEST123', status: 'processed' }));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret', fetcher });

    await provider.refundPayment({ providerPaymentId: 'ORDTEST123', amountCents: 1250, idempotencyKey: 'refund_1' });

    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.mercadopago.com/v1/orders/ORDTEST123/refund', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Idempotency-Key': 'refund_1' }),
      body: JSON.stringify({ transactions: [{ id: 'PAYTEST123', amount: '12.50' }] }),
    }));
  });

  it('mantém recarga automática e cartão salvo bloqueados até haver fluxo próprio do Mercado Pago', async () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret' });

    await expect(provider.createPaymentMethodSetup({ customerId: 'tenant_1', idempotencyKey: 'setup_1' })).rejects.toThrow('MERCADOPAGO_PAYMENT_METHODS_UNAVAILABLE');
    await expect(provider.createOffSessionPayment({
      customerId: 'tenant_1',
      paymentMethodId: 'card_1',
      amountCents: 2500,
      idempotencyKey: 'auto_1',
      metadata: {},
    })).rejects.toThrow('MERCADOPAGO_AUTO_RECHARGE_UNAVAILABLE');
  });

  it('não cria checkout sem URL HTTPS de webhook configurada', async () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret' });

    await expect(provider.createCheckout({
      amountCents: 2500,
      tenantId: 'tenant_1',
      userId: 'user_1',
      purchaseId: 'purchase_1',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
      idempotencyKey: 'checkout_2',
    })).rejects.toThrow('MERCADOPAGO_NOTIFICATION_URL_REQUIRED');
  });
  it('ignora o id não assinado do corpo na identidade do evento', async () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000,
      fetcher: async () => response({ id: 'ORD1', status: 'processed', external_reference: 'purchase', total_amount: '25.00', currency: 'BRL' }) });
    const signature = `ts=1700000000000,v1=${createHmac('sha256', 'secret').update('id:ord1;request-id:req;ts:1700000000000;').digest('hex')}`;
    const input = { dataId: 'ORD1', requestId: 'req', signature };
    const first = await provider.normalizeWebhook({ ...input, payload: { id: 'attacker-1', type: 'order' } });
    const second = await provider.normalizeWebhook({ ...input, payload: { id: 'attacker-2', type: 'order' } });
    expect(first.id).toBe(second.id);
  });

  it.each([1700000000000 - 300001, 1700000000000 + 60001])('rejeita timestamp assinado fora da janela: %s', async (ts) => {
    let calls = 0;
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000,
      fetcher: async () => { calls++; return response({}); } });
    const signature = `ts=${ts},v1=${createHmac('sha256', 'secret').update(`id:ord1;request-id:req;ts:${ts};`).digest('hex')}`;
    await expect(provider.normalizeWebhook({ payload: { type: 'order' }, dataId: 'ORD1', requestId: 'req', signature })).rejects.toThrow('MERCADOPAGO_WEBHOOK_EXPIRED');
    expect(calls).toBe(0);
  });

  it('não permite timestamp duplicado produzir recibos diferentes com a mesma assinatura', () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000 });
    const signature = `ts=1700000000000,v1=${createHmac('sha256', 'secret').update('id:ord1;request-id:req;ts:1700000000000;').digest('hex')}`;
    expect(() => provider.verifiedDeliveryId({ payload: {}, dataId: 'ORD1', requestId: 'req', signature: `ts=1700000000001,${signature}` })).toThrow('MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID');
  });

  it.each([['25.00', 'brl'], ['24.00', undefined]] as const)('obtém moeda ausente da order somente por pagamento vinculado com valor %s', async (paidAmount, currency) => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000,
      fetcher: async (url) => String(url).includes('/orders/')
        ? response({ id: 'ORD1', status: 'processed', total_amount: '25.00', external_reference: 'purchase', transactions: { payments: [{ id: 'PAY1', reference_id: '12345' }] } })
        : response({ id: 12345, status: 'approved', transaction_amount: paidAmount, currency_id: 'BRL', external_reference: 'purchase' }) });
    const signature = `ts=1700000000000,v1=${createHmac('sha256', 'secret').update('id:ord1;request-id:req;ts:1700000000000;').digest('hex')}`;
    const event = await provider.normalizeWebhook({ payload: { type: 'order' }, dataId: 'ORD1', requestId: 'req', signature });
    expect(event.data.object.currency).toBe(currency);
  });

  it('normaliza espaços da assinatura antes de calcular o recibo', () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000 });
    const hash = createHmac('sha256', 'secret').update('id:ord1;request-id:req;ts:1700000000000;').digest('hex');
    const input = { payload: {}, dataId: 'ORD1', requestId: 'req', signature: `ts=1700000000000,v1=${hash}` };
    expect(provider.verifiedDeliveryId({ ...input, signature: `ts= 1700000000000,v1=${hash}` })).toBe(provider.verifiedDeliveryId(input));
    expect(() => provider.verifiedDeliveryId({ ...input, signature: `ts =1,${input.signature}` })).toThrow('MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID');
  });

});
