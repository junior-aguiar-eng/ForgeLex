import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateContentHash, generateDedupeKey, type JurisprudenceDocument } from '@forgelex/legal-data';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { IngestionRunRepository } from './ingestion-run-repository.js';
import { JurisprudenceRepository } from './jurisprudence-repository.js';

const postgresUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
const localPostgres = Boolean(postgresUrl && /^postgres(?:ql)?:\/\/(?:[^/]+@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(postgresUrl));

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !localPostgres)('Consulta jurisprudencial — ' + dialect, () => {
    const court = 'QUERY_' + randomUUID().toUpperCase();
    const databasePath = join(tmpdir(), 'forgelex-query-' + randomUUID() + '.db');
    let connection: Awaited<ReturnType<typeof createDatabase>>;
    let repository: JurisprudenceRepository;
    let runId: string;
    let documents: JurisprudenceDocument[];

    beforeAll(async () => {
      connection = await createDatabase({ url: dialect === 'postgres' ? postgresUrl! : pathToFileURL(databasePath).toString() });
      await runPersistenceMigrations(connection.client);
      repository = new JurisprudenceRepository(connection.db);
      const runs = new IngestionRunRepository(connection.db);
      runId = (await runs.start({ providerId: 'query-local', court })).id;
      await runs.complete(runId, { documentsSeen: 5, documentsPublished: 5 });
      documents = [
        ['2026-01-10', 'PENAL. LEI MARIA DA PENHA. VIOLÊNCIA DOMÉSTICA E FAMILIAR.'],
        ['2025-01-10', 'PENAL. MARIA PENHA. VIOLÊNCIA DOMÉSTICA FAMILIAR.'],
        ['2026-01-10', 'CIVIL. RESPONSABILIDADE DA ADMINISTRAÇÃO. COBRANÇA E CONTRATO.'],
        ['2026-01-10', 'PENAL. MARIA. VIOLÊNCIA DOMÉSTICA.'],
        ['2026-01-10', 'CIVIL. JUROS CAPITALIZADOS. CONTRATO.'],
      ].map(([judgmentDate, syllabus], index) => {
        const processNumber = 'REsp ' + (100 + index);
        const contentHash = generateContentHash(syllabus!);
        const dedupeKey = generateDedupeKey(court, processNumber, judgmentDate!);
        const capturedAt = '2026-10-04T00:00:00.000Z';
        return {
          id: randomUUID(), court, processNumber, rapporteur: 'Relator local', judgmentDate: judgmentDate!,
          publicationDate: judgmentDate!, syllabus: syllabus!, fullText: syllabus!, dedupeKey,
          firstSeenAt: capturedAt, lastSeenAt: capturedAt,
          snapshot: { contentHash, capturedAt, provider: 'query-local' },
          provenance: {
            id: randomUUID(),
            source: { provider: 'query-local', court, documentId: processNumber, dedupeKey, contentHash, capturedAt },
            verified: true, verificationMethod: 'OFFICIAL_SOURCE_HASH' as const,
            verifiedAt: capturedAt, snippet: syllabus!, confidence: 1,
          },
        };
      });
      await repository.upsertDocuments({ documents, ingestionRunId: runId });
    });

    afterAll(async () => {
      if (!connection) return;
      if (dialect === 'postgres') {
        await connection.client.execute({ sql: 'DELETE FROM jurisprudence_document_versions WHERE ingestion_run_id = ?', args: [runId] });
        await connection.client.execute({ sql: 'DELETE FROM jurisprudence_documents WHERE ingestion_run_id = ?', args: [runId] });
        await connection.client.execute({ sql: 'DELETE FROM jurisprudence_ingestion_runs WHERE id = ?', args: [runId] });
      }
      connection.client.close();
      if (dialect === 'sqlite') rmSync(databasePath, { force: true });
    });

    const cases: Array<[string, string, number[]]> = [
      ['exige os termos relevantes e ignora preposições fora de aspas', 'Maria da Penha', [0, 1]],
      ['normaliza acentos sem ampliar a busca por OR', 'maria penha violência doméstica', [0, 1]],
      ['preserva preposições na frase exata', '"Maria da Penha"', [0]],
      ['preserva palavras de uma letra na frase exata', '"violência doméstica e familiar"', [0]],
      ['permite alternativas somente com OR explícito', 'maria penha OR juros', [0, 1, 4]],
      ['combina frase exata com OR explícito', '"Maria da Penha" OR juros', [0, 4]],
      ['não pesquisa apenas preposições', 'da de com para', []],
      ['preserva busca por um único termo', 'contrato', [2, 4]],
      ['trata o ano no texto como termo e não como filtro de julgamento', 'maria penha 2026', []],
      ['não transforma pontuação dentro de um termo em operador OR', 'maria/or/penha', []],
      ['não transforma OR com pontuação em alternativa implícita', '"Maria da Penha" OR, contrato', []],
    ];
    for (const [name, query, indexes] of cases) {
      it(name, async () => {
        const result = await repository.search({ query, court, limit: 10 });
        expect(result.map(document => document.id).sort()).toEqual(indexes.map(index => documents[index]!.id).sort());
      });
    }

    it('aplica o intervalo de julgamento à consulta por todos os termos', async () => {
      const result = await repository.search({ query: 'Maria da Penha', court, fromDate: '2026-01-01', toDate: '2026-12-31', limit: 10 });
      expect(result.map(document => document.id)).toEqual([documents[0]!.id]);
    });
  });
}
