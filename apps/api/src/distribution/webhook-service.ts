import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { WebhookEndpointRecord, WebhookRepository } from '@forgelex/persistence';
import { WEBHOOK_EVENT_TYPES, createWebhookDeliveryHeaders, type ForgeLexWebhookEvent, type WebhookEventType } from './webhooks.js';

const ALGORITHM = 'aes-256-gcm';

function encryptionKey(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptWebhookSecret(secret: string, masterKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(masterKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptWebhookSecret(value: string, masterKey: string): string {
  const [ivText, tagText, ciphertextText] = value.split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('WEBHOOK_SECRET_INVALID');
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(masterKey), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
}

export interface WebhookServiceOptions {
  masterKey?: string;
  timeoutMs?: number;
}

export class WebhookService {
  public constructor(private readonly repository: WebhookRepository, private readonly options: WebhookServiceOptions = {}) {}

  public createEndpoint(input: { tenantId: string; url: string; description?: string; secret?: string; eventTypes?: string[] }): Promise<WebhookEndpointRecord & { secret?: string }> {
    const secret = input.secret ?? `flx_whsec_${randomBytes(24).toString('base64url')}`;
    const masterKey = this.options.masterKey;
    if (!masterKey) throw new Error('WEBHOOK_MASTER_KEY_NOT_CONFIGURED');
    const eventTypes = input.eventTypes ?? [...WEBHOOK_EVENT_TYPES];
    if (!/^https:\/\//i.test(input.url) && !/^http:\/\/localhost(?::\d+)?(?:\/|$)/i.test(input.url)) throw new Error('WEBHOOK_URL_INVALID');
    if (eventTypes.some((type) => !WEBHOOK_EVENT_TYPES.includes(type as WebhookEventType))) throw new Error('WEBHOOK_EVENT_TYPE_INVALID');
    return this.repository.createEndpoint({ id: randomUUID(), tenantId: input.tenantId, url: input.url, description: input.description, secretCiphertext: encryptWebhookSecret(secret, masterKey), eventTypes }).then((record) => ({ ...record, secret }));
  }

  public listEndpoints(tenantId: string) { return this.repository.listEndpoints(tenantId); }
  public revokeEndpoint(tenantId: string, id: string) { return this.repository.revokeEndpoint(tenantId, id); }
  public listDeliveries(tenantId: string, endpointId?: string) { return this.repository.listDeliveries(tenantId, endpointId); }
  public requeue(tenantId: string, deliveryId: string) { return this.repository.requeue(tenantId, deliveryId); }

  public async enqueue(input: { tenantId: string; type: WebhookEventType; payload: Record<string, unknown>; endpointId?: string }): Promise<string> {
    const endpoints = (await this.repository.listEndpoints(input.tenantId)).filter((endpoint) => endpoint.eventTypes.includes(input.type) && endpoint.status === 'ACTIVE');
    const event: ForgeLexWebhookEvent = { id: randomUUID(), type: input.type, tenantId: input.tenantId, occurredAt: new Date().toISOString(), payload: input.payload };
    return this.repository.enqueueEvent({ id: event.id, tenantId: input.tenantId, eventType: input.type, payloadJson: JSON.stringify(event), endpointIds: input.endpointId ? endpoints.filter((endpoint) => endpoint.id === input.endpointId).map((endpoint) => endpoint.id) : endpoints.map((endpoint) => endpoint.id) });
  }

  public async deliverOne(fetcher: typeof fetch = fetch): Promise<'delivered' | 'retrying' | 'failed' | 'idle'> {
    const dispatch = await this.repository.claimDueDelivery();
    if (!dispatch) return 'idle';
    const masterKey = this.options.masterKey;
    if (!masterKey) {
      const status = await this.repository.markDeliveryFailure(dispatch.id, 'WEBHOOK_MASTER_KEY_NOT_CONFIGURED');
      return status === 'FAILED' ? 'failed' : 'retrying';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const secret = decryptWebhookSecret(dispatch.endpoint.secretCiphertext, masterKey);
      const event = JSON.parse(dispatch.payloadJson) as ForgeLexWebhookEvent;
      const headers = createWebhookDeliveryHeaders(event, secret);
      const response = await fetcher(dispatch.endpoint.url, { method: 'POST', headers, body: dispatch.payloadJson, signal: controller.signal });
      const responseExcerpt = (await response.text()).slice(0, 500);
      if (response.status >= 200 && response.status < 300) {
        await this.repository.markDelivered(dispatch.id, response.status, responseExcerpt);
        return 'delivered';
      }
      const status = await this.repository.markDeliveryFailure(dispatch.id, `WEBHOOK_HTTP_${response.status}`, response.status, responseExcerpt);
      return status === 'FAILED' ? 'failed' : 'retrying';
    } catch (error) {
      const status = await this.repository.markDeliveryFailure(dispatch.id, error instanceof Error && error.name === 'AbortError' ? 'WEBHOOK_TIMEOUT' : 'WEBHOOK_NETWORK_ERROR');
      return status === 'FAILED' ? 'failed' : 'retrying';
    } finally {
      clearTimeout(timer);
    }
  }
}
