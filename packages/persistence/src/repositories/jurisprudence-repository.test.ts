import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { JurisprudenceRepository } from './jurisprudence-repository.js';
import { IngestionRunRepository } from './ingestion-run-repository.js';
import {
  generateContentHash,
  generateDedupeKey,
  type JurisprudenceDocument,
} from '@forgelex/legal-data';
import type { Client } from '@libsql/client';

function createDocument(overrides: Partial<JurisprudenceDocument> = {}): JurisprudenceDocument {
  const now = '2026-09-18T00:00:00.000Z';
  const processNumber = overrides.processNumber ?? 'REsp 1.823.450/SP';
  const judgmentDate = overrides.judgmentDate ?? '2023-04-18';
  const syllabus = overrides.syllabus ?? 'CIVIL. RESPONSABILIDADE CIVIL. DANO MORAL. EMENTA TESTE SUFICIENTE.';
  const fullText = overrides.fullText ?? 'Inteiro teor oficial do julgamento para teste.';
  const contentHash = generateContentHash(`${syllabus}${fullText}`);

  return {
    id: overrides.id ?? '11111111-1111-4111-8111-111111111111',
    court: overrides.court ?? 'STJ',
    processNumber,
    processClass: overrides.processClass ?? 'REsp',
    rapporteur: overrides.rapporteur ?? 'Min. Nancy Andrighi',
    chamber: overrides.chamber ?? 'Terceira Turma',
    judgmentDate,
    publicationDate: overrides.publicationDate ?? '2023-04-24',
    syllabus,
    fullText,
    officialUrl: overrides.officialUrl ?? 'https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202300000000',
    dedupeKey: overrides.dedupeKey ?? generateDedupeKey('STJ', processNumber, judgmentDate),
    firstSeenAt: overrides.firstSeenAt ?? now,
    lastSeenAt: overrides.lastSeenAt ?? now,
    snapshot: overrides.snapshot ?? {
      contentHash,
      capturedAt: now,
      provider: 'provider_stj_scon',
    },
    provenance: overrides.provenance ?? {
      id: '22222222-2222-4222-8222-222222222222',
      source: {
        provider: 'provider_stj_scon',
        court: 'STJ',
        documentId: processNumber,
        sourceUrl: 'https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202300000000',
        dedupeKey: generateDedupeKey('STJ', processNumber, judgmentDate),
        contentHash,
        capturedAt: now,
      },
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH',
      verifiedAt: now,
      snippet: syllabus,
      confidence: 1,
    },
  };
}

describe('JurisprudenceRepository', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: JurisprudenceRepository;
  let runId: string;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-jurisprudence-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    repository = new JurisprudenceRepository(db);
    runId = (await new IngestionRunRepository(db).start({ providerId: 'provider_stj_scon', court: 'STJ' })).id;
  });

  afterEach(() => {
    client.close();
    try { rmSync(databasePath, { force: true }); } catch { /* SQLite pode manter o arquivo bloqueado até o worker terminar. */ }
  });

  it('persiste o corpus global sem tenant e preserva proveniência completa', async () => {
    const document = createDocument();
    await repository.upsertDocument({ document, ingestionRunId: runId });

    const recovered = await repository.getByProcessNumber({ court: 'STJ', processNumber: document.processNumber });
    expect(recovered).toMatchObject({
      id: document.id,
      court: 'STJ',
      processClass: 'REsp',
      officialUrl: document.officialUrl,
      provenance: document.provenance,
      firstSeenAt: document.firstSeenAt,
      lastSeenAt: document.lastSeenAt,
    });
    expect(await repository.search({ query: 'responsabilidade dano', court: 'STJ', limit: 10 })).toHaveLength(1);

    const tenantAView = await repository.search({ query: 'responsabilidade', court: 'STJ', limit: 10 });
    const tenantBView = await repository.search({ query: 'responsabilidade', court: 'STJ', limit: 10 });
    expect(tenantAView).toEqual(tenantBView);
  });

  it('faz upsert idempotente e cria nova versão somente quando o hash muda', async () => {
    const first = createDocument();
    const replay = createDocument({
      id: '33333333-3333-4333-8333-333333333333',
      firstSeenAt: '2026-09-19T00:00:00.000Z',
      lastSeenAt: '2026-09-19T00:00:00.000Z',
    });
    await repository.upsertDocument({ document: first, ingestionRunId: runId });
    await repository.upsertDocument({ document: replay, ingestionRunId: runId });
    expect(await repository.listVersions(first.id)).toHaveLength(1);

    const changed = createDocument({
      id: '44444444-4444-4444-8444-444444444444',
      syllabus: 'CIVIL. RESPONSABILIDADE CIVIL. DANO MORAL. NOVA EMENTA OFICIAL COM ALTERAÇÃO MATERIAL.',
      lastSeenAt: '2026-09-20T00:00:00.000Z',
    });
    await repository.upsertDocument({ document: changed, ingestionRunId: runId });

    const versions = await repository.listVersions(first.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2]);
    expect((await repository.getByProcessNumber({ court: 'STJ', processNumber: first.processNumber }))?.firstSeenAt)
      .toBe(first.firstSeenAt);
    expect((await repository.getByProcessNumber({ court: 'STJ', processNumber: first.processNumber }))?.lastSeenAt)
      .toBe(changed.lastSeenAt);
  });

  it('deduplica por tribunal, processo e data mesmo com ids e proveniências diferentes', async () => {
    const first = createDocument();
    const duplicate = createDocument({
      id: '55555555-5555-4555-8555-555555555555',
      provenance: {
        ...first.provenance,
        id: '66666666-6666-4666-8666-666666666666',
        source: { ...first.provenance.source, provider: 'provider_other_official' },
      },
    });
    await repository.upsertDocument({ document: first, ingestionRunId: runId });
    await repository.upsertDocument({ document: duplicate, ingestionRunId: runId });

    expect(await repository.search({ query: first.processNumber, court: 'STJ', limit: 10 })).toHaveLength(1);
    expect(await repository.listVersions(first.id)).toHaveLength(1);
  });

  it('filtra por tribunal e intervalo de julgamento', async () => {
    await repository.upsertDocuments({
      ingestionRunId: runId,
      documents: [
        createDocument(),
        createDocument({
          id: '77777777-7777-4777-8777-777777777777',
          court: 'STF',
          processNumber: 'ADI 6.387/DF',
          judgmentDate: '2020-05-07',
          dedupeKey: generateDedupeKey('STF', 'ADI 6.387/DF', '2020-05-07'),
        }),
      ],
    });

    expect(await repository.search({ query: 'ementa', court: 'STJ', fromDate: '2023-01-01', toDate: '2023-12-31', limit: 10 }))
      .toHaveLength(1);
    expect(await repository.search({ query: 'ementa', court: 'STJ', fromDate: '2024-01-01', limit: 10 }))
      .toHaveLength(0);
  });

  it('faz rollback do lote inteiro quando uma versão é inválida', async () => {
    const first = createDocument();
    const invalid = { ...createDocument({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), syllabus: 'curto' } as JurisprudenceDocument;

    await expect(repository.upsertDocuments({
      ingestionRunId: runId,
      documents: [first, invalid],
    })).rejects.toThrow();

    expect(await repository.search({ query: 'responsabilidade', court: 'STJ', limit: 10 })).toEqual([]);
    expect(await repository.listVersions(first.id)).toEqual([]);
  });
});
