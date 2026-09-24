import { createHmac, timingSafeEqual } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import type { AccountClosureJournal, JournalEvent, JournalKind } from './account-closure-journal.js';

function pathFor(key: string, kind: JournalKind): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('ACCOUNT_CLOSURE_JOURNAL_KEY_INVALID');
  return `closures/${key}/${kind}.json`;
}

function eventFromPath(path: string): { key: string; kind: JournalKind } {
  const match = /^closures\/([a-f0-9]{64})\/(PREPARED|ACCEPTED|ABORTED)\.json$/.exec(path);
  if (!match) throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
  return { key: match[1]!, kind: match[2]! as JournalKind };
}

export class GcsAccountClosureJournal implements AccountClosureJournal {
  private readonly bucket;

  public constructor(
    bucketName: string,
    private readonly macSecret: string,
    storage: Storage = new Storage(),
  ) {
    if (!bucketName.trim() || Buffer.byteLength(macSecret, 'utf8') < 32) {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFIG_INVALID');
    }
    this.bucket = storage.bucket(bucketName);
  }

  private mac(payload: JournalEvent): string {
    return createHmac('sha256', this.macSecret).update(JSON.stringify(payload), 'utf8').digest('hex');
  }

  private anchorMac(anchorId: string): string {
    return createHmac('sha256', this.macSecret)
      .update('forgelex-account-closure-anchor\0')
      .update(anchorId)
      .digest('hex');
  }

  public async assertAnchor(expectedId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(expectedId)) throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFIG_INVALID');
    let body: Buffer;
    try {
      [body] = await this.bucket.file('closures/anchor.json').download();
    } catch (error) {
      if ((error as { code?: number }).code === 404)
        throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY', { cause: error });
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE', { cause: error });
    }
    try {
      const value = JSON.parse(body.toString('utf8')) as { anchorId: string; mac: string };
      const expected = Buffer.from(this.anchorMac(value.anchorId), 'hex');
      const received = Buffer.from(value.mac, 'hex');
      if (value.anchorId !== expectedId || expected.length !== received.length || !timingSafeEqual(expected, received))
        throw new Error('invalid anchor');
    } catch {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
    }
  }

  private decode(raw: Buffer, path: string): JournalEvent {
    try {
      const parsed: unknown = JSON.parse(raw.toString('utf8'));
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid envelope');
      const envelope = parsed as { payload?: JournalEvent; mac?: string };
      if (!envelope.payload || typeof envelope.mac !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.mac)) {
        throw new Error('invalid envelope');
      }
      const expected = Buffer.from(this.mac(envelope.payload), 'hex');
      if (!timingSafeEqual(expected, Buffer.from(envelope.mac, 'hex'))) throw new Error('invalid mac');
      const event = envelope.payload;
      const location = eventFromPath(path);
      if (
        event.schemaVersion !== 1 ||
        event.key !== location.key ||
        event.kind !== location.kind ||
        typeof event.closureId !== 'string'
      )
        throw new Error('invalid event');
      return event;
    } catch {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
    }
  }

  public async append(event: JournalEvent): Promise<'created' | 'exists'> {
    const path = pathFor(event.key, event.kind);
    const body = Buffer.from(JSON.stringify({ payload: event, mac: this.mac(event) }), 'utf8');
    try {
      await this.bucket.file(path).save(body, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      return 'created';
    } catch (error) {
      if ((error as { code?: number }).code === 412) return 'exists';
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE', { cause: error });
    }
  }

  public async read(key: string, kind: JournalKind): Promise<JournalEvent | undefined> {
    const path = pathFor(key, kind);
    try {
      const [body] = await this.bucket.file(path).download();
      return this.decode(body, path);
    } catch (error) {
      if ((error as { code?: number }).code === 404) return undefined;
      if (error instanceof Error && error.message === 'ACCOUNT_CLOSURE_JOURNAL_INTEGRITY') throw error;
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE', { cause: error });
    }
  }

  public async list(): Promise<JournalEvent[]> {
    try {
      const [files] = await this.bucket.getFiles({ prefix: 'closures/', autoPaginate: true });
      const events: JournalEvent[] = [];
      for (const file of [...files].sort((left, right) => left.name.localeCompare(right.name))) {
        if (file.name === 'closures/anchor.json') continue;
        const { key, kind } = eventFromPath(file.name);
        const event = await this.read(key, kind);
        if (!event) throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
        events.push(event);
      }
      return events;
    } catch (error) {
      if (error instanceof Error && error.message === 'ACCOUNT_CLOSURE_JOURNAL_INTEGRITY') throw error;
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE', { cause: error });
    }
  }
}
