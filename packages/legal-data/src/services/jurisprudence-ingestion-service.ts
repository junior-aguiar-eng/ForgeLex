import {
  JurisprudenceDocumentSchema,
  type JurisprudenceDocument,
} from '../contracts/jurisprudence-document.js';

export interface IngestionRunPort {
  start(input: { providerId: string; court: string; startedAt?: string }): Promise<{ id: string }>;
  complete(id: string, input: {
    documentsSeen: number;
    documentsPublished: number;
    coverageStart?: string;
    coverageEnd?: string;
  }): Promise<unknown>;
  fail(id: string, input: { error: string }): Promise<unknown>;
}

export interface JurisprudenceIngestionRepository {
  upsertDocuments(input: {
    documents: JurisprudenceDocument[];
    ingestionRunId: string;
  }): Promise<{ documentsPublished: number }>;
}

export interface JurisprudenceIngestionInput {
  providerId: string;
  court: string;
  documents: Iterable<JurisprudenceDocument> | AsyncIterable<JurisprudenceDocument>;
  sourceManifest?: SourceManifestInput;
}

export interface SourceManifestInput {
  datasetId: string;
  datasetTitle: string;
  resourceId: string;
  resourceName: string;
  resourceUrl: string;
  resourceRole: 'HISTORICAL_SNAPSHOT' | 'INCREMENTAL' | 'UNCLASSIFIED';
  extractionDate: string;
  resourceSha256: string;
  warnings?: string[];
}

export interface JurisprudenceSourceManifestPort {
  start(input: SourceManifestInput & { ingestionRunId: string }): Promise<{ id: string }>;
  stageBatch(input: {
    manifestId: string;
    records: Array<{
      recordOrdinal: number;
      sourceRecordId: string;
      dedupeKey: string;
      contentHash: string;
      document: JurisprudenceDocument;
    }>;
  }): Promise<void>;
  publishStaged(manifestId: string): Promise<{ publishedRecordCount: number }>;
  complete(input: {
    manifestId: string;
    rawRecordCount: number;
    acceptedRecordCount: number;
    rejectedRecordCount: number;
    duplicateRecordCount: number;
    publishedRecordCount: number;
    coverageStart?: string;
    coverageEnd?: string;
    warnings?: string[];
  }): Promise<unknown>;
  fail(input: { manifestId: string; error: string }): Promise<unknown>;
}

export interface JurisprudenceIngestionResult {
  ingestionRunId: string;
  documentsSeen: number;
  documentsPublished: number;
  coverageStart?: string;
  coverageEnd?: string;
}

export class JurisprudenceIngestionService {
  public constructor(
    private readonly repository: JurisprudenceIngestionRepository,
    private readonly runs: IngestionRunPort,
    private readonly sourceManifests?: JurisprudenceSourceManifestPort,
  ) {}

  public async ingest(input: JurisprudenceIngestionInput): Promise<JurisprudenceIngestionResult> {
    const court = input.court.trim().toUpperCase();
    const run = await this.runs.start({ providerId: input.providerId, court });
    let manifestId: string | undefined;

    try {
      const documents: JurisprudenceDocument[] = [];
      for await (const candidate of input.documents) {
        const document = JurisprudenceDocumentSchema.parse(candidate);
        if (document.court.trim().toUpperCase() !== court) {
          throw new Error('INGESTION_COURT_MISMATCH');
        }
        if (document.provenance.source.provider !== input.providerId) {
          throw new Error('INGESTION_PROVIDER_MISMATCH');
        }
        documents.push(document);
      }

      const coverageStart = documents.map((document) => document.judgmentDate).sort()[0];
      const coverageEnd = documents.map((document) => document.judgmentDate).sort().at(-1);
      let published: { documentsPublished: number };
      if (input.sourceManifest && !this.sourceManifests) {
        throw new Error('INGESTION_SOURCE_MANIFEST_PORT_REQUIRED');
      }
      if (input.sourceManifest && this.sourceManifests) {
        const manifest = await this.sourceManifests.start({ ...input.sourceManifest, ingestionRunId: run.id });
        manifestId = manifest.id;
        await this.sourceManifests.stageBatch({
          manifestId,
          records: documents.map((document, recordOrdinal) => ({
            recordOrdinal,
            sourceRecordId: document.provenance.source.documentId,
            dedupeKey: document.dedupeKey,
            contentHash: document.snapshot.contentHash,
            document,
          })),
        });
        const staged = await this.sourceManifests.publishStaged(manifestId);
        await this.sourceManifests.complete({
          manifestId,
          rawRecordCount: documents.length,
          acceptedRecordCount: documents.length,
          rejectedRecordCount: 0,
          duplicateRecordCount: 0,
          publishedRecordCount: staged.publishedRecordCount,
          coverageStart,
          coverageEnd,
          warnings: input.sourceManifest.warnings,
        });
        published = { documentsPublished: staged.publishedRecordCount };
      } else {
        published = await this.repository.upsertDocuments({
          documents,
          ingestionRunId: run.id,
        });
      }
      await this.runs.complete(run.id, {
        documentsSeen: documents.length,
        documentsPublished: published.documentsPublished,
        coverageStart,
        coverageEnd,
      });
      return {
        ingestionRunId: run.id,
        documentsSeen: documents.length,
        documentsPublished: published.documentsPublished,
        coverageStart,
        coverageEnd,
      };
    } catch (error) {
      if (manifestId && this.sourceManifests) {
        try {
          await this.sourceManifests.fail({
            manifestId,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // A falha no diagnóstico do manifesto não pode ocultar a falha da carga.
        }
      }
      await this.runs.fail(run.id, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}
