import { MatterPurgeRepository, type Client } from '@forgelex/persistence';
import { DurableMatterPurgeJournal, type MatterPurgeJournal } from './matter-purge-journal.js';
import { GcsMatterPurgeObjectStore } from './matter-purge-journal-gcs.js';
import { MatterPurgeRestoreGate } from './matter-purge-restore.js';
import { MatterPurgeService } from './matter-purge-service.js';

export function createMatterLifecycleRuntime(client: Client | undefined, environment: Record<string, string | undefined>, injected?: MatterPurgeJournal) {
  const bucket = environment.FORGELEX_MATTER_PURGE_JOURNAL_BUCKET;
  const encryptionKey = environment.FORGELEX_MATTER_PURGE_JOURNAL_ENCRYPTION_KEY;
  const macSecret = environment.FORGELEX_MATTER_PURGE_JOURNAL_MAC_SECRET;
  const anchorId = environment.FORGELEX_MATTER_PURGE_JOURNAL_ANCHOR_ID;
  const secret = environment.FORGELEX_MATTER_PURGE_KEY_SECRET;
  const configured = !!(bucket || encryptionKey || macSecret || anchorId || secret);
  if (!injected && !configured) {
    if (environment.FORGELEX_MATTER_PURGE_JOURNAL_REQUIRED === 'true') throw new Error('MATTER_PURGE_JOURNAL_CONFIG_INVALID');
    return undefined;
  }
  if (!client || !secret || (!injected && (!bucket || !encryptionKey || !macSecret || !anchorId))) throw new Error('MATTER_PURGE_JOURNAL_CONFIG_INVALID');
  const journal = injected ?? new DurableMatterPurgeJournal(new GcsMatterPurgeObjectStore(bucket!), { key: Buffer.from(encryptionKey!, 'base64'), macSecret: macSecret!, anchorId: anchorId! });
  const repository = new MatterPurgeRepository(client);
  return { service: new MatterPurgeService(repository, journal, secret), gate: new MatterPurgeRestoreGate(journal, repository) };
}
