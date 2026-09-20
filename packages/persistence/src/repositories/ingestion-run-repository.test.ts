import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { IngestionRunRepository } from './ingestion-run-repository.js';
import type { Client } from '@libsql/client';

describe('IngestionRunRepository', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: IngestionRunRepository;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-ingestion-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    repository = new IngestionRunRepository(db);
  });

  afterEach(() => {
    client.close();
    try { rmSync(databasePath, { force: true }); } catch { /* SQLite pode manter o arquivo bloqueado até o worker terminar. */ }
  });

  it('registra execução, conclusão, cobertura e falha sem perder o estado', async () => {
    const running = await repository.start({ providerId: 'provider_stj_scon', court: 'STJ' });
    expect(running.status).toBe('RUNNING');

    const completed = await repository.complete(running.id, {
      documentsSeen: 12,
      documentsPublished: 10,
      coverageStart: '2020-01-01',
      coverageEnd: '2026-09-17',
    });
    expect(completed).toMatchObject({
      id: running.id,
      status: 'COMPLETED',
      documentsSeen: 12,
      documentsPublished: 10,
      coverageStart: '2020-01-01',
      coverageEnd: '2026-09-17',
    });

    const failed = await repository.start({ providerId: 'provider_stj_scon', court: 'STJ' });
    await expect(repository.fail(failed.id, { error: 'fonte interrompida' })).resolves.toMatchObject({
      id: failed.id,
      status: 'FAILED',
      error: 'fonte interrompida',
    });
  });
});
