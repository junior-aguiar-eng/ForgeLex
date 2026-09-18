import { createHmac, timingSafeEqual } from 'node:crypto';

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface StripePaymentProviderOptions {
  secretKey: string;
  webhookSecret: string;
  fetcher?: Fetcher;
  clock?: () => number;
  signatureToleranceSeconds?: number;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeCheckoutInput {
  amountCents: number;
  tenantId: string;
  userId: string;
  purchaseId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  customerId?: string;
}

export interface StripePaymentMethodSummary {
  id: string;
  type: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

export class StripePaymentProvider {
  public readonly providerName = 'stripe';
  private readonly fetcher: Fetcher;
  private readonly clock: () => number;

  public constructor(private readonly options: StripePaymentProviderOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    if (!options.secretKey.trim() || !options.webhookSecret.trim()) throw new Error('STRIPE_NOT_CONFIGURED');
  }

  public async createCheckout(input: StripeCheckoutInput): Promise<{ id: string; url: string }> {
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.append('payment_method_types[]', 'card');
    body.append('payment_method_types[]', 'pix');
    body.set('line_items[0][price_data][currency]', 'brl');
    body.set('line_items[0][price_data][product_data][name]', 'Créditos ForgeLex');
    body.set('line_items[0][price_data][unit_amount]', String(input.amountCents));
    body.set('line_items[0][quantity]', '1');
    body.set('client_reference_id', input.purchaseId);
    body.set('success_url', input.successUrl);
    body.set('cancel_url', input.cancelUrl);
    body.set('payment_intent_data[setup_future_usage]', 'off_session');
    body.set('metadata[tenant_id]', input.tenantId);
    body.set('metadata[user_id]', input.userId);
    body.set('metadata[purchase_id]', input.purchaseId);
    if (input.customerId) body.set('customer', input.customerId);
    const response = await this.request('/v1/checkout/sessions', body, input.idempotencyKey);
    const id = typeof response.id === 'string' ? response.id : '';
    const url = typeof response.url === 'string' ? response.url : '';
    if (!id || !url) throw new Error('STRIPE_CHECKOUT_INVALID_RESPONSE');
    return { id, url };
  }

  public async createCustomer(input: { tenantId: string; idempotencyKey: string }): Promise<{ id: string }> {
    const body = new URLSearchParams({ 'metadata[tenant_id]': input.tenantId });
    const response = await this.request('/v1/customers', body, input.idempotencyKey);
    const id = typeof response.id === 'string' ? response.id : '';
    if (!id) throw new Error('STRIPE_CUSTOMER_INVALID_RESPONSE');
    return { id };
  }

  public async listPaymentMethods(customerId: string): Promise<StripePaymentMethodSummary[]> {
    const response = await this.fetcher(`https://api.stripe.com/v1/payment_methods?customer=${encodeURIComponent(customerId)}&type=card`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.options.secretKey}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`STRIPE_REQUEST_FAILED:${response.status}`);
    const items = Array.isArray((data as { data?: unknown }).data) ? (data as { data: unknown[] }).data : [];
    return items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const card = record.card && typeof record.card === 'object' ? record.card as Record<string, unknown> : {};
      if (typeof record.id !== 'string' || typeof record.type !== 'string') return [];
      return [{
        id: record.id,
        type: record.type,
        ...(typeof card.brand === 'string' ? { brand: card.brand } : {}),
        ...(typeof card.last4 === 'string' ? { last4: card.last4 } : {}),
        ...(typeof card.exp_month === 'number' ? { expMonth: card.exp_month } : {}),
        ...(typeof card.exp_year === 'number' ? { expYear: card.exp_year } : {}),
      }];
    });
  }

  public async createSetupIntent(input: { customerId: string; idempotencyKey: string }): Promise<{ id: string; clientSecret: string }> {
    const body = new URLSearchParams({ customer: input.customerId, usage: 'off_session', 'payment_method_types[]': 'card' });
    const response = await this.request('/v1/setup_intents', body, input.idempotencyKey);
    const id = typeof response.id === 'string' ? response.id : '';
    const clientSecret = typeof response.client_secret === 'string' ? response.client_secret : '';
    if (!id || !clientSecret) throw new Error('STRIPE_SETUP_INTENT_INVALID_RESPONSE');
    return { id, clientSecret };
  }

  public async createOffSessionPayment(input: {
    customerId: string;
    paymentMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({
      amount: String(input.amountCents),
      currency: 'brl',
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: 'true',
      confirm: 'true',
    });
    for (const [key, value] of Object.entries(input.metadata)) body.set(`metadata[${key}]`, value);
    return this.request('/v1/payment_intents', body, input.idempotencyKey);
  }

  public async refundPayment(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string }): Promise<Record<string, unknown>> {
    const body = new URLSearchParams({ payment_intent: input.paymentIntentId, amount: String(input.amountCents) });
    return this.request('/v1/refunds', body, input.idempotencyKey);
  }

  public verifyWebhook(payload: string, signature: string): StripeWebhookEvent {
    const parts = new Map(signature.split(',').map((part) => {
      const [key, value] = part.split('=', 2);
      return [key, value] as const;
    }));
    const timestamp = Number(parts.get('t'));
    const receivedSignature = parts.get('v1');
    const tolerance = this.options.signatureToleranceSeconds ?? 300;
    if (!Number.isInteger(timestamp) || !receivedSignature || Math.abs(this.clock() - timestamp) > tolerance) {
      throw new Error('STRIPE_SIGNATURE_INVALID');
    }
    const expected = createHmac('sha256', this.options.webhookSecret).update(`${timestamp}.${payload}`).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(receivedSignature, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
      throw new Error('STRIPE_SIGNATURE_INVALID');
    }
    let event: unknown;
    try { event = JSON.parse(payload); } catch { throw new Error('STRIPE_PAYLOAD_INVALID'); }
    if (!event || typeof event !== 'object' || typeof (event as { id?: unknown }).id !== 'string' || typeof (event as { type?: unknown }).type !== 'string') {
      throw new Error('STRIPE_PAYLOAD_INVALID');
    }
    return event as StripeWebhookEvent;
  }

  private async request(path: string, body: URLSearchParams, idempotencyKey: string): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`https://api.stripe.com${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: body.toString(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`STRIPE_REQUEST_FAILED:${response.status}`);
    return data as Record<string, unknown>;
  }
}
