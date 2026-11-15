import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { WebhookDispatchRecord, WebhookEndpointRecord, WebhookRepository } from '@forgelex/persistence';
import { WEBHOOK_EVENT_TYPES, WEBHOOK_TEST_EVENT_TYPE, createWebhookDeliveryHeaders, type ForgeLexWebhookEvent, type WebhookEventType } from './webhooks.js';

import { validateWebhookUrl, WebhookHttpClient, WebhookUrlBlocked, type WebhookPoster } from './webhook-http-client.js';
import { WEBHOOK_LIMITS } from '@forgelex/persistence';

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

/** A delivery attempt must end before its 30 s lease does, so the timeout is capped well below it. */
export const WEBHOOK_MAX_TIMEOUT_MS = 10_000;
export type DeliveryResult = 'delivered' | 'retrying' | 'failed';

export interface WebhookServiceOptions {
  masterKey?: string;
  /** Per delivery; values above WEBHOOK_MAX_TIMEOUT_MS are capped to it. */
  timeoutMs?: number;
  /** How a delivery reaches the network. Defaults to the pinned HTTPS client; tests inject their own. */
  poster?: WebhookPoster;
  /** Deliveries one process runs at the same time. Defaults to the global in-flight limit. */
  concurrency?: number;
}

export class WebhookService {
  private readonly poster: WebhookPoster;
  private readonly concurrency: number;
  private inFlight = 0;

  public constructor(private readonly repository: WebhookRepository, private readonly options: WebhookServiceOptions = {}) {
    this.poster = options.poster ?? new WebhookHttpClient();
    this.concurrency = Math.max(1, options.concurrency ?? WEBHOOK_LIMITS.concurrentDeliveries);
  }

  public createEndpoint(input: { tenantId: string; url: string; description?: string; secret?: string; eventTypes?: string[] }): Promise<WebhookEndpointRecord & { secret?: string }> {
    const secret = input.secret ?? `flx_whsec_${randomBytes(24).toString('base64url')}`;
    const masterKey = this.options.masterKey;
    if (!masterKey) throw new Error('WEBHOOK_MASTER_KEY_NOT_CONFIGURED');
    const eventTypes = input.eventTypes ?? [...WEBHOOK_EVENT_TYPES];
    validateWebhookUrl(input.url);
    if (eventTypes.some((type) => !WEBHOOK_EVENT_TYPES.includes(type as WebhookEventType))) throw new Error('WEBHOOK_EVENT_TYPE_INVALID');
    return this.repository.createEndpoint({ id: randomUUID(), tenantId: input.tenantId, url: input.url, description: input.description, secretCiphertext: encryptWebhookSecret(secret, masterKey), eventTypes }).then((record) => ({ ...record, secret }));
  }

  public listEndpoints(tenantId: string) { return this.repository.listEndpoints(tenantId); }
  public findEndpoint(tenantId: string, id: string) { return this.repository.findEndpoint(tenantId, id); }
  public revokeEndpoint(tenantId: string, id: string) { return this.repository.revokeEndpoint(tenantId, id); }

  /**
   * Puts a suspended endpoint back in service. The destination is checked first, so a still-blocked address is refused
   * (WEBHOOK_URL_BLOCKED) instead of being reactivated and suspended again by the next delivery. Held deliveries resume.
   * Returns false when the endpoint does not exist or is not suspended.
   */
  public async reactivateEndpoint(tenantId: string, id: string): Promise<boolean> {
    const endpoint = await this.repository.findEndpoint(tenantId, id);
    if (!endpoint || endpoint.status !== 'SUSPENDED') return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      await this.poster.check?.(endpoint.url, controller.signal);
    } finally {
      clearTimeout(timer);
    }
    return this.repository.reactivateEndpoint(tenantId, id);
  }
  public findDelivery(tenantId: string, id: string) { return this.repository.findDelivery(tenantId, id); }
  public listDeliveries(tenantId: string, endpointId?: string | readonly string[]) { return this.repository.listDeliveries(tenantId, endpointId); }
  public requeue(tenantId: string, deliveryId: string) { return this.repository.requeue(tenantId, deliveryId); }

  public async enqueue(input: { tenantId: string; type: WebhookEventType | typeof WEBHOOK_TEST_EVENT_TYPE; payload: Record<string, unknown>; endpointId?: string }): Promise<string> {
    const isTest = input.type === WEBHOOK_TEST_EVENT_TYPE;
    if (isTest && !input.endpointId) throw new Error('WEBHOOK_TEST_REQUIRES_ENDPOINT');
    // A test targets one endpoint whatever it subscribes to; every other event goes only to its subscribers.
    const endpoints = (await this.repository.listEndpoints(input.tenantId)).filter((endpoint) => endpoint.status === 'ACTIVE' && (isTest || endpoint.eventTypes.includes(input.type)));
    const event: ForgeLexWebhookEvent = { id: randomUUID(), type: input.type, tenantId: input.tenantId, occurredAt: new Date().toISOString(), payload: input.payload };
    const result = await this.repository.enqueueEvent({ id: event.id, tenantId: input.tenantId, eventType: input.type, payloadJson: JSON.stringify(event), endpointIds: input.endpointId ? endpoints.filter((endpoint) => endpoint.id === input.endpointId).map((endpoint) => endpoint.id) : endpoints.map((endpoint) => endpoint.id) });
    // A targeted event that reached no endpoint was not queued: say so instead of returning an id that references nothing.
    if (input.endpointId && result.queued + result.overflowed === 0) throw new Error('WEBHOOK_ENDPOINT_NOT_ACTIVE');
    return result.id;
  }

  private timeoutMs(): number {
    return Math.min(this.options.timeoutMs ?? WEBHOOK_MAX_TIMEOUT_MS, WEBHOOK_MAX_TIMEOUT_MS);
  }

  /**
   * Starts as many deliveries as there is free capacity and resolves when those finish. Overlapping ticks are safe: each
   * reserves its slots before claiming, so a slow endpoint holds one slot while the others keep flowing.
   */
  public async tick(): Promise<DeliveryResult[]> {
    const started: Array<Promise<DeliveryResult>> = [];
    while (this.inFlight < this.concurrency) {
      this.inFlight++;
      let dispatch;
      try {
        dispatch = await this.repository.claimDueDelivery();
      } catch (error) {
        this.inFlight--;
        throw error;
      }
      if (!dispatch) {
        this.inFlight--;
        break;
      }
      started.push(this.deliver(dispatch).finally(() => { this.inFlight--; }));
    }
    return Promise.all(started);
  }

  public async deliverOne(): Promise<DeliveryResult | 'idle'> {
    const dispatch = await this.repository.claimDueDelivery();
    return dispatch ? this.deliver(dispatch) : 'idle';
  }

  private async deliver(dispatch: WebhookDispatchRecord): Promise<DeliveryResult> {
    const masterKey = this.options.masterKey;
    if (!masterKey) {
      const status = await this.repository.markDeliveryFailure(dispatch.id, 'WEBHOOK_MASTER_KEY_NOT_CONFIGURED', dispatch.claimToken);
      return status === 'FAILED' ? 'failed' : 'retrying';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const secret = decryptWebhookSecret(dispatch.endpoint.secretCiphertext, masterKey);
      const event = JSON.parse(dispatch.payloadJson) as ForgeLexWebhookEvent;
      const headers = createWebhookDeliveryHeaders(event, secret);
      const responseStatus = await this.poster.post(dispatch.endpoint.url, headers, dispatch.payloadJson, controller.signal);
      if (responseStatus >= 200 && responseStatus < 300) {
        await this.repository.markDelivered(dispatch.id, responseStatus, dispatch.claimToken);
        return 'delivered';
      }
      const status = await this.repository.markDeliveryFailure(dispatch.id, `WEBHOOK_HTTP_${responseStatus}`, dispatch.claimToken, responseStatus);
      return status === 'FAILED' ? 'failed' : 'retrying';
    } catch (error) {
      if (error instanceof WebhookUrlBlocked) await this.repository.suspendEndpoint(dispatch.tenantId, dispatch.endpointId);
      const status = await this.repository.markDeliveryFailure(dispatch.id, error instanceof WebhookUrlBlocked ? 'WEBHOOK_URL_BLOCKED' : error instanceof Error && error.name === 'AbortError' ? 'WEBHOOK_TIMEOUT' : 'WEBHOOK_NETWORK_ERROR', dispatch.claimToken);
      return status === 'FAILED' ? 'failed' : 'retrying';
    } finally {
      clearTimeout(timer);
    }
  }
}
