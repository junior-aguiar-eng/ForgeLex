import { describe, expect, it } from 'vitest';
import {
  JurisprudenceIngestionService,
  JurisprudenceSearchService,
  type IngestionRunPort,
  type JurisprudenceIngestionRepository,
} from '../index.js';
import { generateContentHash, generateDedupeKey, type JurisprudenceDocument } from '../contracts/jurisprudence-document.js';

const document: JurisprudenceDocument = {
  id: '88888888-8888-4888-8888-888888888888',
  court: 'STJ',
  processNumber: 'REsp 1.823.450/SP',
  processClass: 'REsp',
  rapporteur: 'Min. Nancy Andrighi',
  judgmentDate: '2023-04-18',
  publicationDate: '2023-04-24',
  syllabus: 'CIVIL. RESPONSABILIDADE CIVIL. EMENTA COM CONTEUDO SUFICIENTE PARA TESTE.',
  fullText: 'Inteiro teor.',
  officialUrl: 'https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202300000000',
  dedupeKey: generateDedupeKey('STJ', 'REsp 1.823.450/SP', '2023-04-18'),
  firstSeenAt: '2026-09-18T00:00:00.000Z',
  lastSeenAt: '2026-09-18T00:00:00.000Z',
  snapshot: {
    contentHash: generateContentHash('CIVIL. RESPONSABILIDADE CIVIL. EMENTA COM CONTEUDO SUFICIENTE PARA TESTE.Inteiro teor.'),
    capturedAt: '2026-09-18T00:00:00.000Z',
    provider: 'provider_stj_scon',
  },
  provenance: {
    id: '99999999-9999-4999-8999-999999999999',
    source: {
      provider: 'provider_stj_scon',
      court: 'STJ',
      documentId: 'REsp 1.823.450/SP',
      sourceUrl: 'https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202300000000',
    },
    verified: true,
    verificationMethod: 'OFFICIAL_SOURCE_HASH',
    verifiedAt: '2026-09-18T00:00:00.000Z',
    snippet: 'CIVIL. RESPONSABILIDADE CIVIL. EMENTA COM CONTEUDO SUFICIENTE PARA TESTE.',
    confidence: 1,
  },
};

class FakeIngestionRepository implements JurisprudenceIngestionRepository {
  public calls: JurisprudenceDocument[][] = [];
  public async upsertDocuments(input: { documents: JurisprudenceDocument[]; ingestionRunId: string }): Promise<{ documentsPublished: number }> {
    this.calls.push(input.documents);
    return { documentsPublished: input.documents.length };
  }
}

class FakeRuns implements IngestionRunPort {
  public started = 0;
  public completed: string[] = [];
  public failed: string[] = [];
  public async start(): Promise<{ id: string }> { this.started += 1; return { id: 'run-1' }; }
  public async complete(id: string): Promise<void> { this.completed.push(id); }
  public async fail(id: string): Promise<void> { this.failed.push(id); }
}

class FakeSourceManifest {
  public staged: JurisprudenceDocument[] = [];
  public completed: string[] = [];
  public failed: string[] = [];
  public async start(): Promise<{ id: string }> { return { id: 'manifest-1' }; }
  public async stageBatch(input: { records: Array<{ document: JurisprudenceDocument }> }): Promise<void> {
    this.staged.push(...input.records.map((record) => record.document));
  }
  public async publishStaged(): Promise<{ publishedRecordCount: number }> {
    return { publishedRecordCount: this.staged.length };
  }
  public async complete(input: { manifestId: string }): Promise<void> { this.completed.push(input.manifestId); }
  public async fail(input: { manifestId: string }): Promise<void> { this.failed.push(input.manifestId); }
}

describe('data plane jurisprudencial', () => {
  it('ingere em lote e somente publica depois da validação completa', async () => {
    const repository = new FakeIngestionRepository();
    const runs = new FakeRuns();
    const service = new JurisprudenceIngestionService(repository, runs);

    const result = await service.ingest({
      providerId: 'provider_stj_scon',
      court: 'STJ',
      documents: [document],
    });

    expect(result).toMatchObject({ ingestionRunId: 'run-1', documentsSeen: 1, documentsPublished: 1 });
    expect(repository.calls).toHaveLength(1);
    expect(runs.completed).toEqual(['run-1']);
    expect(runs.failed).toEqual([]);
  });

  it('marca falha e não publica versão parcial quando um documento viola o escopo', async () => {
    const repository = new FakeIngestionRepository();
    const runs = new FakeRuns();
    const service = new JurisprudenceIngestionService(repository, runs);

    await expect(service.ingest({
      providerId: 'provider_stj_scon',
      court: 'STJ',
      documents: [document, { ...document, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', court: 'STF' }],
    })).rejects.toThrow('INGESTION_COURT_MISMATCH');

    expect(repository.calls).toHaveLength(0);
    expect(runs.completed).toEqual([]);
    expect(runs.failed).toEqual(['run-1']);
  });

  it('expõe a busca persistida como serviço independente da aquisição oficial', async () => {
    const searched: string[] = [];
    const service = new JurisprudenceSearchService({
      async search(options) {
        searched.push(options.query);
        return [document];
      },
    });

    await expect(service.search({ query: 'responsabilidade', court: 'STJ', limit: 10 })).resolves.toEqual([document]);
    expect(searched).toEqual(['responsabilidade']);
  });

  it('usa staging e publicação do manifesto quando o recurso possui proveniência de carga', async () => {
    const repository = new FakeIngestionRepository();
    const runs = new FakeRuns();
    const manifests = new FakeSourceManifest();
    const service = new JurisprudenceIngestionService(repository, runs, manifests);

    const result = await service.ingest({
      providerId: 'provider_stj_scon',
      court: 'STJ',
      documents: [document],
      sourceManifest: {
        datasetId: 'dataset-1',
        datasetTitle: 'Dataset STJ',
        resourceId: 'resource-1',
        resourceName: '20220508.json',
        resourceUrl: 'https://dados.example/resource-1',
        resourceRole: 'INCREMENTAL',
        extractionDate: '2022-05-08',
        resourceSha256: 'a'.repeat(64),
      },
    });

    expect(result.documentsPublished).toBe(1);
    expect(repository.calls).toHaveLength(0);
    expect(manifests.staged).toHaveLength(1);
    expect(manifests.completed).toEqual(['manifest-1']);
    expect(manifests.failed).toEqual([]);
  });
});
