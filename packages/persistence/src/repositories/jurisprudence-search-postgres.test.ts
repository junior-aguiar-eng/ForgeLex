import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { JurisprudenceRepository } from './jurisprudence-repository.js';

const databaseUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
const local = Boolean(
  databaseUrl && /^postgres(?:ql)?:\/\/(?:[^/]+@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(databaseUrl),
);
const documentCount = process.env.FORGELEX_P2_SEARCH_SCALE === 'incident' ? 33_759 : 4_000;

interface PlanNode {
  'Node Type': string;
  'Plan Width': number;
  'Sort Space Type'?: string;
  'Actual Rows': number;
  Plans?: PlanNode[];
}

function sortNodes(node: PlanNode): PlanNode[] {
  return [...(node['Node Type'].includes('Sort') ? [node] : []), ...(node.Plans ?? []).flatMap(sortNodes)];
}

describe.skipIf(!local)('Busca PostgreSQL com candidatos extensos', () => {
  it(
    'ordena apenas a projeção compacta antes de carregar o conteúdo jurídico',
    async () => {
      const { db, client } = await createDatabase({ url: databaseUrl! });
      const runId = randomUUID();
      const court = `P2_${randomUUID()}`.toUpperCase();
      const now = '2026-10-02T00:00:00.000Z';
      try {
        await runPersistenceMigrations(client);
        await client.execute({
          sql: `INSERT INTO jurisprudence_ingestion_runs
          (id, provider_id, court, status, started_at, completed_at)
          VALUES (?, 'p2-local', ?, 'COMPLETED', ?, ?)`,
          args: [runId, court, now, now],
        });
        await client.execute({
          sql: `INSERT INTO jurisprudence_documents
          (id, court, process_number, normalized_process_number, search_text, search_identity_text,
           search_authority_text, content_hash, dedupe_key, current_version_id, first_seen_at,
           last_seen_at, ingestion_run_id, created_at, updated_at)
          SELECT md5(? || n)::uuid::text, ?, 'REsp ' || n, n::text,
            CASE WHEN n % 2 = 0 THEN 'juros' ELSE 'capitalizados' END || repeat(' fundamento', 1000),
            n::text, 'relator', repeat('a', 64), ? || n, md5(? || 'v' || n)::uuid::text, ?, ?, ?, ?, ?
          FROM generate_series(1, ?) AS n`,
          args: [runId, court, runId, runId, now, now, runId, now, now, documentCount],
        });
        const provenance = JSON.stringify({
          id: randomUUID(),
          source: {
            provider: 'p2-local',
            court,
            documentId: 'local',
            sourceUrl: 'https://example.test/local',
            dedupeKey: 'local',
            contentHash: 'a'.repeat(64),
            capturedAt: now,
          },
          verified: true,
          verificationMethod: 'OFFICIAL_SOURCE_HASH',
          verifiedAt: now,
          snippet: 'EMENTA LOCAL SUFICIENTE PARA REGRESSÃO.',
          confidence: 1,
        });
        await client.execute({
          sql: `INSERT INTO jurisprudence_document_versions
          (id, document_id, version_number, process_number, rapporteur, judgment_date,
           publication_date, syllabus, full_text, provider_id, content_hash, verification_status,
           provenance_json, publication_status, ingestion_run_id, captured_at, created_at)
          SELECT md5(? || 'v' || n)::uuid::text, md5(? || n)::uuid::text, 1, 'REsp ' || n, 'Relator local',
            '2026-01-' || lpad((n % 28 + 1)::text, 2, '0'), '2026-01-30',
            'EMENTA LOCAL. JUROS OU CAPITALIZADOS. ' || repeat('fundamento jurídico ', 1000),
            repeat('inteiro teor local ', 1000), 'p2-local', repeat('a', 64),
            'VERIFIED_OFFICIAL', ?, 'PUBLISHED', ?, ?, ?
          FROM generate_series(1, ?) AS n`,
          args: [runId, runId, provenance, runId, now, now, documentCount],
        });
        await client.execute('ANALYZE jurisprudence_documents');
        await client.execute('ANALYZE jurisprudence_document_versions');

        const statements: Array<{ query: string; parameters: unknown[] }> = [];
        const postgresClient = (
          db as unknown as {
            $client: { options: { debug?: (id: number, query: string, parameters: unknown[]) => void } };
          }
        ).$client;
        postgresClient.options.debug = (_id, query, parameters) => {
          statements.push({ query, parameters });
        };
        const repository = new JurisprudenceRepository(db);
        const results = await repository.search({ query: 'juros OR capitalizados', court, limit: 3 });
        expect(results).toHaveLength(3);
        expect(results.every((document) => document.fullText?.includes('inteiro teor local'))).toBe(true);
        expect(results.every((document) => document.snapshot.contentHash === 'a'.repeat(64))).toBe(true);
        const statement = [...statements].reverse().find((entry) => entry.query.includes('jurisprudence_documents'))!;
        expect(statement).toBeDefined();
        postgresClient.options.debug = undefined;
        const explain = await client.execute({
          sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.query}`,
          args: statement.parameters,
        });
        const rawPlan = explain.rows[0]?.['QUERY PLAN'];
        const plan = (typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan) as Array<{ Plan: PlanNode }>;
        const sorts = sortNodes(plan[0]!.Plan);
        const evidence = {
          observedAt: new Date().toISOString(),
          environment: 'local-synthetic-postgres',
          documents: documentCount,
          sorts: sorts.map((node) => ({
            type: node['Node Type'],
            width: node['Plan Width'],
            space: node['Sort Space Type'],
            inputRows: node.Plans?.[0]?.['Actual Rows'],
          })),
          executionMs: (plan[0] as unknown as Record<string, unknown>)['Execution Time'],
        };
        await mkdir('temp', { recursive: true });
        await writeFile('temp/p2-search-plan.json', JSON.stringify(evidence, null, 2));
        expect(sorts.length).toBeGreaterThan(0);
        // Wide ementa/full-text/provenance must not enter the ranking sort.
        const candidateSorts = sorts.filter((node) => (node.Plans?.[0]?.['Actual Rows'] ?? 0) > 3);
        expect(candidateSorts.length).toBeGreaterThan(0);
        expect(candidateSorts.every((node) => node['Plan Width'] < 256)).toBe(true);
        expect(sorts.every((node) => node['Sort Space Type'] !== 'Disk')).toBe(true);

        // Eligibility/date reads for each candidate must not fetch the wide
        // version heap. VACUUM is confined to this disposable local database.
        await client.execute('VACUUM (ANALYZE) jurisprudence_document_versions');
        const selectedVersion = await client.execute({
          sql: 'SELECT current_version_id FROM jurisprudence_documents WHERE id = ?',
          args: [results[0]!.id],
        });
        const metadataPlan = await client.execute({
          sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
            SELECT id, judgment_date, publication_status, source_manifest_id
            FROM jurisprudence_document_versions WHERE id = ?`,
          args: [selectedVersion.rows[0]!.current_version_id],
        });
        const rawMetadataPlan = metadataPlan.rows[0]?.['QUERY PLAN'];
        const metadata = (typeof rawMetadataPlan === 'string' ? JSON.parse(rawMetadataPlan) : rawMetadataPlan) as Array<{
          Plan: { 'Node Type': string; 'Index Name': string; 'Heap Fetches': number };
        }>;
        expect(metadata[0]!.Plan['Node Type']).toBe('Index Only Scan');
        expect(metadata[0]!.Plan['Index Name']).toBe('jurisprudence_versions_search_metadata_idx');
        expect(metadata[0]!.Plan['Heap Fetches']).toBe(0);

        // A busca padrão exige ambos; a busca ampla continua disponível com OR explícito.
        expect(await repository.search({ query: 'juros capitalizados', court, limit: 3 })).toEqual([]);
        expect(await repository.search({ query: 'juros', court, limit: 100 })).toHaveLength(100);
        expect(await repository.search({ query: 'capitalizados', court, limit: 100 })).toHaveLength(100);
        expect(await repository.search({ query: '"juros capitalizados"', court, limit: 3 })).toEqual([]);
        const filtered = await repository.search({
          query: 'juros OR capitalizados',
          court,
          fromDate: '2026-01-25',
          toDate: '2026-01-28',
          limit: 3,
        });
        expect(filtered).toHaveLength(3);
        expect(
          filtered.every((document) => document.judgmentDate >= '2026-01-25' && document.judgmentDate <= '2026-01-28'),
        ).toBe(true);
        expect(await repository.search({ query: 'capitalizados', court, processNumber: '1', limit: 3 })).toHaveLength(
          1,
        );
        await client.execute({
          sql: 'UPDATE jurisprudence_document_versions SET publication_status = ? WHERE document_id = ?',
          args: [
            'STAGED',
            (await repository.search({ query: 'capitalizados', court, processNumber: '1', limit: 3 }))[0]!.id,
          ],
        });
        expect(await repository.search({ query: 'capitalizados', court, processNumber: '1', limit: 3 })).toEqual([]);
      } finally {
        await client.execute({
          sql: 'DELETE FROM jurisprudence_document_versions WHERE ingestion_run_id = ?',
          args: [runId],
        });
        await client.execute({ sql: 'DELETE FROM jurisprudence_documents WHERE ingestion_run_id = ?', args: [runId] });
        await client.execute({ sql: 'DELETE FROM jurisprudence_ingestion_runs WHERE id = ?', args: [runId] });
        client.close();
      }
    },
    documentCount > 4_000 ? 120_000 : 30_000,
  );
});
