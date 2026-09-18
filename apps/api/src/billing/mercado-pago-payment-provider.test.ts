import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
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
      accessToken: 'APP_USR_test',
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
      accessToken: 'APP_USR_test',
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
      accessToken: 'APP_USR_test',
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
      transactions: { payments: [{ id: 'PAYTEST123', status: 'processed' }] },
    }));
    const provider = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test',
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
      id: '99',
      provider: 'mercadopago',
      type: 'checkout.session.completed',
      data: { object: {
        payment_status: 'paid',
        payment_intent: 'ORDTEST123',
        metadata: { purchase_id: 'purchase_1' },
      } },
    });
    expect(fetcher).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders/ORDTEST123', expect.objectContaining({ method: 'GET' }));
  });

  it('rejeita assinatura inválida antes de consultar a order', async () => {
    const fetcher = vi.fn(async () => response({}));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret', fetcher });

    await expect(provider.normalizeWebhook({
      payload: { id: 99, type: 'order', data: { id: 'ORDTEST123' } },
      dataId: 'ORDTEST123',
      requestId: 'req_1',
      signature: 'ts=1700000000,v1=invalid',
    })).rejects.toThrow('MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('consulta a transação e envia reembolso parcial idempotente na order', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ transactions: { payments: [{ id: 'PAYTEST123' }] } }))
      .mockResolvedValueOnce(response({ id: 'ORDTEST123', status: 'processed' }));
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret', fetcher });

    await provider.refundPayment({ paymentIntentId: 'ORDTEST123', amountCents: 1250, idempotencyKey: 'refund_1' });

    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.mercadopago.com/v1/orders/ORDTEST123/refund', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Idempotency-Key': 'refund_1' }),
      body: JSON.stringify({ transactions: [{ id: 'PAYTEST123', amount: '12.50' }] }),
    }));
  });

  it('mantém recarga automática e cartão salvo bloqueados até haver fluxo próprio do Mercado Pago', async () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret' });

    await expect(provider.createSetupIntent({ customerId: 'tenant_1', idempotencyKey: 'setup_1' })).rejects.toThrow('MERCADOPAGO_PAYMENT_METHODS_UNAVAILABLE');
    await expect(provider.createOffSessionPayment({
      customerId: 'tenant_1',
      paymentMethodId: 'card_1',
      amountCents: 2500,
      idempotencyKey: 'auto_1',
      metadata: {},
    })).rejects.toThrow('MERCADOPAGO_AUTO_RECHARGE_UNAVAILABLE');
  });

  it('não cria checkout sem URL HTTPS de webhook configurada', async () => {
    const provider = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', webhookSecret: 'webhook-secret' });

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
});
