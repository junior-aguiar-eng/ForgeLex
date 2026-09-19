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
  ) {}

  public async ingest(input: JurisprudenceIngestionInput): Promise<JurisprudenceIngestionResult> {
    const court = input.court.trim().toUpperCase();
    const run = await this.runs.start({ providerId: input.providerId, court });

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
      const published = await this.repository.upsertDocuments({
        documents,
        ingestionRunId: run.id,
      });
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
      await this.runs.fail(run.id, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}
