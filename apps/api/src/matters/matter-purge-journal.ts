import type { MatterPurgeIntent } from '@forgelex/domain';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export type PurgeIntent = MatterPurgeIntent;
export interface JournalObjectStore { read(key: string): Promise<string | undefined>; writeOnce(key: string, value: string): Promise<boolean>; list(): Promise<string[]>; }
export type PurgeJournalEvent = { kind: 'PREPARED'; intent: PurgeIntent } | { kind: 'COMPLETED' | 'ABORTED'; operationId: string; recordedAt: string };
export interface MatterPurgeJournal { prepare(intent: PurgeIntent): Promise<void>; complete(operationId: string): Promise<void>; abortVerified(operationId: string): Promise<void>; list(): Promise<PurgeJournalEvent[]>; assertAnchor(): Promise<void>; }
export class DurableMatterPurgeJournal implements MatterPurgeJournal {
  constructor(private readonly store: JournalObjectStore, private readonly options: { key: Buffer; macSecret: string; anchorId: string }) {
    if (options.key.length !== 32 || Buffer.byteLength(options.macSecret) < 32 || !/^[a-zA-Z0-9_-]{16,128}$/.test(options.anchorId)) throw new Error('MATTER_PURGE_JOURNAL_CONFIG_INVALID');
  }
  private mac(payload: unknown): string { return createHmac('sha256', this.options.macSecret).update('forgelex-matter-purge-v1\0').update(JSON.stringify(payload)).digest('hex'); }
  private encode(payload: unknown): string { return JSON.stringify({ payload, mac: this.mac(payload) }); }
  private decode(body: string): Record<string, unknown> {
    try {
      const envelope = JSON.parse(body) as { payload: Record<string, unknown>; mac: string };
      if (!/^[a-f0-9]{64}$/.test(envelope.mac) || !timingSafeEqual(Buffer.from(envelope.mac, 'hex'), Buffer.from(this.mac(envelope.payload), 'hex'))) throw new Error('bad mac');
      if (envelope.payload.schemaVersion !== 1) throw new Error('bad version');
      return envelope.payload;
    } catch { throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY'); }
  }
  private path(operationId: string, kind: 'PREPARED' | 'TERMINAL'): string {
    if (!/^[a-f0-9]{64}$/.test(operationId)) throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
    return `matter-lifecycle/${operationId}/${kind}.json`;
  }
  async provisionAnchor(): Promise<void> {
    await this.store.writeOnce('matter-lifecycle/anchor.json', this.encode({ schemaVersion: 1, anchorId: this.options.anchorId }));
    await this.assertAnchor();
  }
  async assertAnchor(): Promise<void> {
    const body = await this.store.read('matter-lifecycle/anchor.json');
    if (!body) throw new Error('MATTER_PURGE_JOURNAL_ANCHOR_MISSING');
    if (this.decode(body).anchorId !== this.options.anchorId) throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
  }
  private event(body: string, path: string): PurgeJournalEvent {
    try {
      const payload = this.decode(body);
      const match = /^matter-lifecycle\/([a-f0-9]{64})\/(PREPARED|TERMINAL)\.json$/.exec(path);
      if (!match || payload.operationId !== match[1]) throw new Error('path mismatch');
      if (match[2] === 'TERMINAL') {
        const terminal = z.object({ schemaVersion: z.literal(1), kind: z.enum(['COMPLETED', 'ABORTED']), operationId: z.string(), recordedAt: z.string().datetime() }).strict().parse(payload);
        return { kind: terminal.kind, operationId: terminal.operationId, recordedAt: terminal.recordedAt };
      }
      const sealed = z.object({ schemaVersion: z.literal(1), kind: z.literal('PREPARED'), operationId: z.string(), nonce: z.string(), ciphertext: z.string(), tag: z.string() }).strict().parse(payload);
      const nonce = Buffer.from(sealed.nonce, 'base64'), tag = Buffer.from(sealed.tag, 'base64');
      if (nonce.length !== 12 || tag.length !== 16) throw new Error('invalid seal');
      const decipher = createDecipheriv('aes-256-gcm', this.options.key, nonce);
      decipher.setAAD(Buffer.from(`forgelex-matter-purge-v1\0${sealed.operationId}`));
      decipher.setAuthTag(tag);
      const intent = PurgeIntentSchema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8')));
      if (intent.operationId !== match[1]) throw new Error('intent mismatch');
      return { kind: 'PREPARED', intent };
    } catch { throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY'); }
  }
  async prepare(rawIntent: PurgeIntent): Promise<void> {
    const intent = PurgeIntentSchema.parse(rawIntent);
    await this.assertAnchor();
    const path = this.path(intent.operationId, 'PREPARED');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.options.key, nonce);
    cipher.setAAD(Buffer.from(`forgelex-matter-purge-v1\0${intent.operationId}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(intent), 'utf8'), cipher.final()]);
    const payload = { schemaVersion: 1, kind: 'PREPARED', operationId: intent.operationId, nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
    if (await this.store.writeOnce(path, this.encode(payload))) return;
    const existing = await this.store.read(path);
    if (!existing) throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
    const event = this.event(existing, path);
    if (event.kind !== 'PREPARED' || event.intent.fingerprint !== intent.fingerprint || event.intent.expectedLifecycleRevision !== intent.expectedLifecycleRevision || JSON.stringify(event.intent.target) !== JSON.stringify(intent.target)) throw new Error('MATTER_PURGE_JOURNAL_CONFLICT');
  }
  private async terminal(operationId: string, kind: 'COMPLETED' | 'ABORTED'): Promise<void> {
    const preparedPath = this.path(operationId, 'PREPARED');
    const prepared = await this.store.read(preparedPath);
    if (!prepared || this.event(prepared, preparedPath).kind !== 'PREPARED') throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
    // Both outcomes contend for ONE immutable object, preventing opposite-terminal races.
    const path = this.path(operationId, 'TERMINAL');
    if (await this.store.writeOnce(path, this.encode({ schemaVersion: 1, kind, operationId, recordedAt: new Date().toISOString() }))) return;
    const existing = await this.store.read(path);
    if (!existing || this.event(existing, path).kind !== kind) throw new Error('MATTER_PURGE_JOURNAL_CONFLICT');
  }
  async complete(operationId: string): Promise<void> { await this.terminal(operationId, 'COMPLETED'); }
  async abortVerified(operationId: string): Promise<void> { await this.terminal(operationId, 'ABORTED'); }
  async list(): Promise<PurgeJournalEvent[]> {
    await this.assertAnchor();
    const result: PurgeJournalEvent[] = [];
    for (const path of (await this.store.list()).sort()) {
      if (path === 'matter-lifecycle/anchor.json') continue;
      const body = await this.store.read(path);
      if (!body) throw new Error('MATTER_PURGE_JOURNAL_INTEGRITY');
      result.push(this.event(body, path));
    }
    return result;
  }
}

const PurgeIntentSchema = z.object({ operationId: z.string().regex(/^[a-f0-9]{64}$/), target: z.object({ tenantId: z.string().min(1), matterId: z.string().min(1), documentId: z.string().min(1).optional() }).strict(), expectedLifecycleRevision: z.number().int().nonnegative(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), preparedAt: z.string().datetime() }).strict();
