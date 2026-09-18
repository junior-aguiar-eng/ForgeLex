import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider } from './billing-operations.js';

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface MercadoPagoPaymentProviderOptions {
  accessToken: string;
  webhookSecret: string;
  notificationUrl?: string;
  fetcher?: Fetcher;
  apiBaseUrl?: string;
}

export interface MercadoPagoCheckoutInput {
  amountCents: number;
  tenantId: string;
  userId: string;
  purchaseId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  customerId?: string;
}

export interface MercadoPagoWebhookEvent {
  id: string;
  provider: 'mercadopago';
  type: string;
  data: { object: Record<string, unknown> };
}

export interface MercadoPagoWebhookInput {
  payload: Record<string, unknown>;
  dataId: string;
  requestId: string;
  signature: string;
}

interface MercadoPagoOrder {
  id?: unknown;
  status?: unknown;
  external_reference?: unknown;
  total_amount?: unknown;
  transactions?: unknown;
  payment?: unknown;
}

export class MercadoPagoPaymentProvider implements PaymentProvider {
  public readonly providerName = 'mercadopago';
  public readonly supportsAutoRecharge = false;
  private readonly fetcher: Fetcher;
  private readonly apiBaseUrl: string;

  public constructor(private readonly options: MercadoPagoPaymentProviderOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.mercadopago.com').replace(/\/$/, '');
    if (!options.accessToken.trim() || !options.webhookSecret.trim()) throw new Error('MERCADOPAGO_NOT_CONFIGURED');
    if (options.notificationUrl && new URL(options.notificationUrl).protocol !== 'https:') throw new Error('MERCADOPAGO_NOTIFICATION_URL_INVALID');
  }

  public async createCustomer(input: { tenantId: string; idempotencyKey: string }): Promise<{ id: string }> {
    void input.idempotencyKey;
    // A order do Mercado Pago não exige um Customer para o Checkout Pro.
    // Mantemos uma referência estável para a conta existente do billing.
    return { id: `mercadopago:${input.tenantId}` };
  }

  public async createCheckout(input: MercadoPagoCheckoutInput): Promise<{ id: string; url: string }> {
    if (!this.options.notificationUrl) throw new Error('MERCADOPAGO_NOTIFICATION_URL_REQUIRED');
    const amount = this.formatAmount(input.amountCents);
    const body: Record<string, unknown> = {
      type: 'online',
      processing_mode: 'manual',
      capture_mode: 'automatic_async',
      total_amount: amount,
      external_reference: input.purchaseId,
      description: 'Créditos ForgeLex',
      items: [{
        title: 'Créditos ForgeLex',
        unit_price: amount,
        quantity: 1,
      }],
      config: {
        online: {
          success_url: input.successUrl,
          failure_url: input.cancelUrl,
          pending_url: input.cancelUrl,
          auto_return: 'approved',
        },
      },
    };
    const response = await this.request('/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify(body),
    });
    const id = typeof response.id === 'string' ? response.id : '';
    const url = typeof response.checkout_url === 'string' ? response.checkout_url : '';
    if (!id || !url) throw new Error('MERCADOPAGO_CHECKOUT_INVALID_RESPONSE');
    return { id, url };
  }

  public async createPaymentMethodSetup(input: { customerId: string; idempotencyKey: string; tenantId?: string }): Promise<{ id: string; clientSecret: string }> {
    void input;
    throw new Error('MERCADOPAGO_PAYMENT_METHODS_UNAVAILABLE');
  }

  public async listPaymentMethods(customerId: string): Promise<Array<{ id: string; type: string; brand?: string; last4?: string; expMonth?: number; expYear?: number }>> {
    void customerId;
    return [];
  }

  public async createOffSessionPayment(input: {
    customerId: string;
    paymentMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    void input;
    throw new Error('MERCADOPAGO_AUTO_RECHARGE_UNAVAILABLE');
  }

  public async refundPayment(input: { providerPaymentId: string; amountCents: number; idempotencyKey: string }): Promise<Record<string, unknown>> {
    const order = await this.request(`/v1/orders/${encodeURIComponent(input.providerPaymentId)}`, { method: 'GET' }) as MercadoPagoOrder;
    const paymentId = this.extractPaymentId(order);
    if (!paymentId) throw new Error('MERCADOPAGO_PAYMENT_NOT_FOUND');
    return this.request(`/v1/orders/${encodeURIComponent(input.providerPaymentId)}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ transactions: [{ id: paymentId, amount: this.formatAmount(input.amountCents) }] }),
    });
  }

  public async normalizeWebhook(input: MercadoPagoWebhookInput): Promise<MercadoPagoWebhookEvent> {
    this.verifyWebhook(input);
    const resourceType = input.payload.type === 'payment' || String(input.payload.action ?? '').startsWith('payment')
      ? 'payment'
      : 'order';
    const resource = await this.request(
      resourceType === 'payment' ? `/v1/payments/${encodeURIComponent(input.dataId)}` : `/v1/orders/${encodeURIComponent(input.dataId)}`,
      { method: 'GET' },
    );
    const status = this.resolveStatus(resourceType, resource);
    const purchaseId = typeof resource.external_reference === 'string' ? resource.external_reference : undefined;
    const providerReference = resourceType === 'order'
      ? (typeof resource.id === 'string' ? resource.id : input.dataId)
      : (typeof resource.order_id === 'string' ? resource.order_id : input.dataId);
    const eventType = status === 'paid'
      ? 'payment.approved'
      : status === 'failed'
        ? 'payment.failed'
        : status === 'refunded'
          ? 'payment.refunded'
          : 'payment.processing';
    const eventId = input.payload.id === undefined || input.payload.id === null
      ? `${resourceType}:${input.dataId}`
      : String(input.payload.id);
    return {
      id: eventId,
      provider: 'mercadopago',
      type: eventType,
      data: {
        object: {
          id: providerReference,
          payment_status: status,
          provider_payment_id: providerReference,
          ...(purchaseId ? { metadata: { purchase_id: purchaseId } } : {}),
          ...(typeof resource.total_amount === 'string' ? { amount_total: Math.round(Number(resource.total_amount) * 100) } : {}),
        },
      },
    };
  }

  public verifyWebhook(input: Pick<MercadoPagoWebhookInput, 'dataId' | 'requestId' | 'signature'>): void {
    const parts = new Map(input.signature.split(',').map((part) => {
      const [key, value] = part.split('=', 2);
      return [key.trim(), value?.trim() ?? ''] as const;
    }));
    const timestamp = parts.get('ts');
    const receivedSignature = parts.get('v1');
    if (!timestamp || !receivedSignature || !input.dataId || !input.requestId) throw new Error('MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID');
    const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${timestamp};`;
    const expected = createHmac('sha256', this.options.webhookSecret).update(manifest).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(receivedSignature, 'utf8');
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
      throw new Error('MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID');
    }
  }

  private async request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.options.accessToken}`,
        ...(init.headers ?? {}),
      },
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`MERCADOPAGO_REQUEST_FAILED:${response.status}`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('MERCADOPAGO_INVALID_RESPONSE');
    return data as Record<string, unknown>;
  }

  private resolveStatus(resourceType: 'order' | 'payment', resource: Record<string, unknown>): 'paid' | 'processing' | 'failed' | 'refunded' {
    const status = String(resource.status ?? '').toLowerCase();
    if (status === 'processed' || status === 'approved') return 'paid';
    if (status === 'refunded') return 'refunded';
    if (resourceType === 'payment' && ['rejected', 'cancelled', 'cancelled_by_user'].includes(status)) return 'failed';
    if (resourceType === 'order' && ['failed', 'canceled'].includes(status)) return 'failed';
    return 'processing';
  }

  private extractPaymentId(order: MercadoPagoOrder): string | undefined {
    const transactions = order.transactions;
    if (!transactions || typeof transactions !== 'object') return undefined;
    const payments = (transactions as { payments?: unknown }).payments;
    if (!Array.isArray(payments)) return undefined;
    const payment = payments.find((item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string');
    return payment && typeof (payment as { id?: unknown }).id === 'string' ? (payment as { id: string }).id : undefined;
  }

  private formatAmount(amountCents: number): string {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('MERCADOPAGO_AMOUNT_INVALID');
    return (amountCents / 100).toFixed(2);
  }
}
