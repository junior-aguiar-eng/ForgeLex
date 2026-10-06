import { Storage } from '@google-cloud/storage';
import type { JournalObjectStore } from './matter-purge-journal.js';

export class GcsMatterPurgeObjectStore implements JournalObjectStore {
  private readonly bucket;
  constructor(bucketName: string, storage: Storage = new Storage()) {
    if (!bucketName.trim()) throw new Error('MATTER_PURGE_JOURNAL_CONFIG_INVALID');
    this.bucket = storage.bucket(bucketName);
  }
  async read(key: string): Promise<string | undefined> {
    try { const [body] = await this.bucket.file(key).download(); return body.toString('utf8'); }
    catch (error) { if ((error as { code?: number }).code === 404) return undefined; throw new Error('MATTER_PURGE_JOURNAL_UNAVAILABLE', { cause: error }); }
  }
  async writeOnce(key: string, value: string): Promise<boolean> {
    try { await this.bucket.file(key).save(Buffer.from(value), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } }); return true; }
    catch (error) { if ((error as { code?: number }).code === 412) return false; throw new Error('MATTER_PURGE_JOURNAL_UNAVAILABLE', { cause: error }); }
  }
  async list(): Promise<string[]> {
    try { const [files] = await this.bucket.getFiles({ prefix: 'matter-lifecycle/', autoPaginate: true }); return files.map(file => file.name); }
    catch (error) { throw new Error('MATTER_PURGE_JOURNAL_UNAVAILABLE', { cause: error }); }
  }
}
