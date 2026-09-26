import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const kinds = new Set(['PREPARED', 'ACCEPTED', 'ABORTED']);

export class FileAccountClosureJournal {
  constructor(directory, macSecret) {
    if (!directory || Buffer.byteLength(macSecret, 'utf8') < 32) {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFIG_INVALID');
    }
    this.directory = resolve(directory);
    this.macSecret = macSecret;
  }

  path(key, kind) {
    if (!/^[a-f0-9]{64}$/.test(key) || !kinds.has(kind)) {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
    }
    return join(this.directory, key, `${kind}.json`);
  }

  mac(payload) {
    return createHmac('sha256', this.macSecret).update(JSON.stringify(payload)).digest('hex');
  }

  anchorMac(anchorId) {
    return createHmac('sha256', this.macSecret)
      .update('forgelex-account-closure-anchor\0')
      .update(anchorId)
      .digest('hex');
  }

  async initializeAnchor(anchorId) {
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(anchorId)) throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFIG_INVALID');
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, 'anchor.json'), JSON.stringify({ anchorId, mac: this.anchorMac(anchorId) }), {
      flag: 'wx',
      mode: 0o600,
    });
  }

  async assertAnchor(expectedId) {
    let raw;
    try {
      raw = await readFile(join(this.directory, 'anchor.json'), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY', { cause: error });
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE', { cause: error });
    }
    try {
      const value = JSON.parse(raw);
      const expected = Buffer.from(this.anchorMac(value.anchorId), 'hex');
      const received = Buffer.from(value.mac, 'hex');
      if (value.anchorId !== expectedId || expected.length !== received.length || !timingSafeEqual(expected, received))
        throw new Error('invalid anchor');
    } catch {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
    }
  }

  async append(event) {
    const path = this.path(event.key, event.kind);
    await mkdir(join(this.directory, event.key), { recursive: true });
    const data = JSON.stringify({ payload: event, mac: this.mac(event) });
    try {
      await writeFile(path, data, { flag: 'wx', mode: 0o600 });
      return 'created';
    } catch (error) {
      if (error.code === 'EEXIST') return 'exists';
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE');
    }
  }

  async read(key, kind) {
    let raw;
    try {
      raw = await readFile(this.path(key, kind), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE');
    }
    try {
      const envelope = JSON.parse(raw);
      const expected = Buffer.from(this.mac(envelope.payload), 'hex');
      const received = Buffer.from(envelope.mac, 'hex');
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received) ||
        envelope.payload.schemaVersion !== 1 ||
        envelope.payload.key !== key ||
        envelope.payload.kind !== kind
      ) {
        throw new Error('invalid event');
      }
      return envelope.payload;
    } catch {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
    }
  }

  async list() {
    let keys;
    try {
      keys = await readdir(this.directory);
    } catch {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE');
    }
    const events = [];
    for (const key of keys.sort()) {
      if (key === 'anchor.json') continue;
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
      const names = await readdir(join(this.directory, key));
      for (const name of names.sort()) {
        const kind = name.replace(/\.json$/, '');
        if (`${kind}.json` !== name || !kinds.has(kind)) throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
        const event = await this.read(key, kind);
        if (!event) throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
        events.push(event);
      }
    }
    return events;
  }
}
