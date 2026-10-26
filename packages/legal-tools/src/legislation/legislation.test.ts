import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, LegislationRepository } from '@forgelex/persistence';
import { LegislationCatalog } from '@forgelex/source-catalog';
import { IndexedLegislationProvider } from '@forgelex/source-providers';
import { LegislationService } from '@forgelex/legal-data';
import { createGetLegislationTool } from './get-legislation.js';
import { LEGAL_TOOL_CONTRACTS } from '../gateway/legal-tool-gateway.js';
import { RESEARCH_AUTHORITY_WORKFLOW } from '../../../legal-agents/src/instructions/research-authority.js';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
// Deliberately synthetic: no Brazilian rule or applicability is asserted by this fixture.
const url = 'https://www.planalto.gov.br/fixture-not-a-real-law.htm';
const coverage = [
  { sourceId: 'synthetic', normId: 'fixture-law', provisionIds: ['art-1'], officialUrl: url, currentVersionId: 'v2' },
];
const clients: Array<{ close(): void }> = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});
async function fixture() {
  const { db, client } = await createDatabase({ url: 'file::memory:' });
  clients.push(client);
  await runPersistenceMigrations(client);
  const repository = new LegislationRepository(db);
  const catalog = new LegislationCatalog(coverage);
  const service = new LegislationService(repository, (n, p) => catalog.find(n, p));
  const provider = new IndexedLegislationProvider(repository, catalog);
  return { db, client, repository, service, provider };
}
function record(versionId = 'v1', from = '2000-01-01', to: string | null = '2020-01-01') {
  const text = versionId === 'v1' ? 'Texto sintético anterior.' : 'Texto sintético posterior.';
  const snapshotText = `Cabeçalho sintético\n${text}\nFim`;
  const offset = snapshotText.indexOf(text);
  return {
    document: {
      sourceId: 'synthetic',
      normId: 'fixture-law',
      provisionId: 'art-1',
      versionId,
      text,
      officialUrl: url,
      capturedAt: '2026-10-26T00:00:00Z',
      effectiveFrom: from,
      effectiveTo: to,
      contentHash: sha(text),
      snapshotHash: sha(snapshotText),
      start: offset,
      end: offset + text.length,
      curationEvidence: 'synthetic-curation-only',
    },
    snapshotText,
  };
}
const request = { normId: 'fixture-law', provisionId: 'art-1', selector: { kind: 'EXACT' as const, versionId: 'v1' } };
describe('recuperação normativa interna, delimitada e versionada', () => {
  it('o workflow técnico STJ exige somente capabilities reais do gateway existente', () => {
    expect(RESEARCH_AUTHORITY_WORKFLOW.steps.map((s) => s.toolName)).toEqual(LEGAL_TOOL_CONTRACTS.map((c) => c.name));
  });
  it('recupera texto, versão, URL e trecho do snapshot persistido após nova instância', async () => {
    const f = await fixture();
    await f.service.ingest(record());
    const fresh = new IndexedLegislationProvider(new LegislationRepository(f.db), new LegislationCatalog(coverage));
    const result = await fresh.retrieve(request);
    expect(result).toMatchObject({
      status: 'FOUND',
      temporalBasis: 'EXACT_VERSION',
      legalApplicability: 'NOT_EVALUATED',
      freshness: 'SNAPSHOT_ONLY',
      document: { versionId: 'v1', text: record().document.text, officialUrl: url },
    });
    expect(JSON.stringify(result)).not.toContain('snapshotText');
  });
  it('distingue versão indicada como atual de período registrado para a data solicitada', async () => {
    const f = await fixture();
    await f.service.ingest(record());
    await f.service.ingest(record('v2', '2020-01-01', null));
    expect(await f.provider.retrieve({ ...request, selector: { kind: 'CURRENT' } })).toMatchObject({
      status: 'FOUND',
      temporalBasis: 'CATALOG_CURRENT',
      document: { versionId: 'v2' },
    });
    expect(await f.provider.retrieve({ ...request, selector: { kind: 'ON_DATE', date: '2019-12-31' } })).toMatchObject({
      status: 'FOUND',
      temporalBasis: 'RECORDED_PERIOD',
      document: { versionId: 'v1' },
    });
    expect(await f.provider.retrieve({ ...request, selector: { kind: 'ON_DATE', date: '2020-01-01' } })).toMatchObject({
      status: 'FOUND',
      document: { versionId: 'v2' },
      legalApplicability: 'NOT_EVALUATED',
    });
  });
  it('não substitui versão ausente pela atual e não promete norma fora da cobertura', async () => {
    const f = await fixture();
    await f.service.ingest(record('v2', '2020-01-01', null));
    expect(await f.provider.retrieve(request)).toMatchObject({ status: 'LIMITED', reason: 'VERSION_UNAVAILABLE' });
    expect(await f.provider.retrieve({ ...request, normId: 'other' })).toMatchObject({
      status: 'LIMITED',
      reason: 'OUT_OF_COVERAGE',
    });
    expect(await f.provider.retrieve({ ...request, provisionId: 'art-2' })).toMatchObject({
      status: 'LIMITED',
      reason: 'OUT_OF_COVERAGE',
    });
    expect(
      await new IndexedLegislationProvider(f.repository, new LegislationCatalog()).retrieve(request),
    ).toMatchObject({ status: 'LIMITED', reason: 'OUT_OF_COVERAGE' });
  });
  it('separa fonte indisponível de versão não localizada', async () => {
    const f = await fixture();
    expect(await f.provider.retrieve(request)).toMatchObject({ reason: 'VERSION_UNAVAILABLE' });
    const provider = new IndexedLegislationProvider(
      {
        listVersions: async () => {
          throw new Error('private-db-error');
        },
      },
      new LegislationCatalog(coverage),
    );
    const result = await provider.retrieve(request);
    expect(result).toMatchObject({ status: 'LIMITED', reason: 'SOURCE_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('private-db-error');
  });
  it.each(['text', 'snapshotHash', 'identity', 'url', 'range'])('rejeita ingestão incorreta: %s', async (kind) => {
    const f = await fixture();
    const input = record();
    if (kind === 'text') input.document.text = 'Texto adulterado';
    if (kind === 'snapshotHash') input.document.snapshotHash = 'a'.repeat(64);
    if (kind === 'identity') input.document.normId = 'other';
    if (kind === 'url') input.document.officialUrl = 'https://www.planalto.gov.br.evil.test/fixture';
    if (kind === 'range') input.document.start++;
    await expect(f.service.ingest(input)).rejects.toThrow();
    expect(await f.repository.listVersions('fixture-law', 'art-1')).toEqual([]);
  });
  it('detecta recuperação trocada/corrompida mesmo após a ingestão', async () => {
    const f = await fixture();
    const input = record();
    const provider = new IndexedLegislationProvider(
      { listVersions: async () => [{ ...input, document: { ...input.document, normId: 'other' } }] },
      new LegislationCatalog(coverage),
    );
    expect(await provider.retrieve(request)).toMatchObject({ status: 'LIMITED', reason: 'SOURCE_INVALID' });
  });
  it.each(['payload-version', 'indexed-version', 'json', 'date'])(
    'detecta integridade da linha persistida: %s',
    async (kind) => {
      const f = await fixture();
      await f.service.ingest(record());
      if (kind === 'indexed-version') {
        await f.client.execute("UPDATE legislation_versions SET version_id='v2'");
      } else {
        const altered = kind === 'payload-version' ? record('v2', '2020-01-01', null) : record();
        if (kind === 'date') altered.document.effectiveFrom = 'invalid-date';
        await f.client.execute({
          sql: 'UPDATE legislation_versions SET payload_json=?',
          args: [kind === 'json' ? '{' : JSON.stringify(altered)],
        });
      }
      const result = await f.provider.retrieve(
        kind === 'payload-version' ? { ...request, selector: { kind: 'EXACT', versionId: 'v2' } } : request,
      );
      expect(result).toMatchObject({ status: 'LIMITED', reason: 'SOURCE_INVALID' });
    },
  );
  it('preserva versões imutáveis e retry não duplica a mesma captura', async () => {
    const f = await fixture();
    await f.service.ingest(record());
    await f.service.ingest(record());
    expect(await f.repository.listVersions('fixture-law', 'art-1')).toHaveLength(1);
    const other = record();
    other.document.effectiveTo = '2019-01-01';
    await expect(f.service.ingest(other)).rejects.toThrow('LEGISLATION_VERSION_CONFLICT');
    expect((await f.provider.retrieve(request)).status).toBe('FOUND');
  });
  it('rejeita trecho cujo fim ultrapassa o snapshot, mesmo quando slice truncaria o índice', async () => {
    const f = await fixture();
    const input = record();
    input.snapshotText = input.document.text;
    input.document.snapshotHash = sha(input.snapshotText);
    input.document.start = 0;
    input.document.end = input.snapshotText.length + 100;
    await expect(f.service.ingest(input)).rejects.toThrow('LEGISLATION_SOURCE_INVALID');
  });
  it('intervalo sobreposto e lacuna temporal produzem limitação sem escolha arbitrária', async () => {
    const f = await fixture();
    await f.service.ingest(record());
    await f.service.ingest(record('v2', '2019-01-01', null));
    expect(await f.provider.retrieve({ ...request, selector: { kind: 'ON_DATE', date: '2019-06-01' } })).toMatchObject({
      reason: 'AMBIGUOUS_VERSION',
    });
    expect(await f.provider.retrieve({ ...request, selector: { kind: 'ON_DATE', date: '1999-01-01' } })).toMatchObject({
      reason: 'VERSION_UNAVAILABLE',
    });
  });
  it('tool interna exige seletor explícito e não muda o gateway STJ', async () => {
    const f = await fixture();
    const tool = createGetLegislationTool(f.provider);
    expect(tool.name).toBe('research.get_legislation');
    expect(tool.inputSchema.safeParse({ normId: 'fixture-law', provisionId: 'art-1' }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ ...request, selector: { kind: 'ON_DATE', date: '2026-02-30' } }).success).toBe(
      false,
    );
    const output = await tool.execute(request, {} as never);
    expect(output).toMatchObject({
      success: true,
      data: { status: 'LIMITED', reason: 'VERSION_UNAVAILABLE', legalApplicability: 'NOT_EVALUATED' },
    });
    expect(LEGAL_TOOL_CONTRACTS.map((c) => c.name)).toEqual([
      'research.search_case_law',
      'research.get_authority',
      'research.verify_authority',
    ]);
  });
});
