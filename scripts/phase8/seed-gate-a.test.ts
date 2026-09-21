import { describe, expect, it, vi } from 'vitest';
import { assertRemoteSeed, seedGateA } from './seed-gate-a.mjs';

describe('phase8:seed-gate-a', () => {
  it('exige confirmação e banco remoto', () => {
    expect(() => assertRemoteSeed('postgres://u:p@localhost/db', 'confirmed')).toThrow('REMOTE_SEED_TARGET_REQUIRED');
    expect(() => assertRemoteSeed('postgres://u:p@localhost/db', 'confirmed', 'cloud-sql-auth-proxy')).not.toThrow();
    expect(() => assertRemoteSeed('postgres://u:p@db.example.test/db', '')).toThrow('REMOTE_SEED_NOT_CONFIRMED');
  });

  it('executa busca com resultado, vazia, verificação e replay', async () => {
    const documents = [{ court: 'STJ', dedupeKey: 'dedupe', snapshot: { contentHash: 'hash' } }];
    const provider = { id: 'fixture', search: vi.fn(async (query: string) => query === 'vazamento' ? documents : []) };
    const ingestion = { ingest: vi.fn(async () => ({ documentsPublished: 1 })) };
    const result = await seedGateA({ provider, ingestion });
    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(ingestion.ingest).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ resultCount: 1, emptyCount: 0, verified: true, replayed: true });
  });
});
