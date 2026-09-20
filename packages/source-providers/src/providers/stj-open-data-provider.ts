import { createHash } from 'node:crypto';
import {
  extractStjOpenDataZip,
  parseStjOpenDataJsonRecords,
  parseStjOpenDataRecord,
  type StjOpenDataResourceContext,
} from '../historical/stj-open-data-parser.js';
import {
  StjOpenDataCatalog,
  type StjHistoricalCoveragePlan,
  type StjHistoricalResource,
} from '../historical/stj-open-data-catalog.js';
import type {
  EnumerationOptions,
  LegalSourceProvider,
  ProviderHealth,
  SearchOptions,
} from '../contracts/legal-source-provider.js';
import type { JurisprudenceDocument } from '@forgelex/legal-data';

export interface StjOpenDataBinaryFetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer | Uint8Array>;
}

export type StjOpenDataBinaryFetch = (url: string) => Promise<StjOpenDataBinaryFetchResponse>;

export interface StjOpenDataProviderOptions {
  catalog?: Pick<StjOpenDataCatalog, 'discover'>;
  fetch?: StjOpenDataBinaryFetch;
  datasetIds?: readonly string[];
  maxDownloadAttempts?: number;
  retryDelayMs?: number;
}

export interface StjOpenDataResourceResult {
  resource: StjHistoricalResource;
  resourceSha256: string;
  rawRecordCount: number;
  acceptedRecordCount: number;
  rejectedRecordCount: number;
  duplicateRecordCount: number;
  documents: JurisprudenceDocument[];
  warnings: string[];
  coverageStart?: string;
  coverageEnd?: string;
}

export interface StjOpenDataProcessOptions {
  shouldProcess?: (resourceSha256: string) => Promise<boolean> | boolean;
  onBatch?: (documents: JurisprudenceDocument[]) => Promise<void> | void;
}

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function inDateRange(document: JurisprudenceDocument, options: SearchOptions | EnumerationOptions): boolean {
  return (!options.fromDate || document.judgmentDate >= options.fromDate)
    && (!options.toDate || document.judgmentDate <= options.toDate);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class StjOpenDataProvider implements LegalSourceProvider {
  public readonly id = 'provider_stj_open_data';
  public readonly name = 'STJ Open Data Oficial';
  public readonly isOfficial = true;

  private readonly catalog: Pick<StjOpenDataCatalog, 'discover'>;
  private readonly fetcher: StjOpenDataBinaryFetch;
  private readonly datasetIds?: readonly string[];
  private readonly maxDownloadAttempts: number;
  private readonly retryDelayMs: number;

  public constructor(options: StjOpenDataProviderOptions = {}) {
    this.catalog = options.catalog ?? new StjOpenDataCatalog();
    this.fetcher = options.fetch ?? (globalThis.fetch as unknown as StjOpenDataBinaryFetch);
    this.datasetIds = options.datasetIds;
    this.maxDownloadAttempts = Math.max(1, options.maxDownloadAttempts ?? 3);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);
  }

  public supportsCourt(court: string): boolean {
    return court.trim().toUpperCase() === 'STJ';
  }

  public async discover(): Promise<StjHistoricalCoveragePlan> {
    return this.catalog.discover(this.datasetIds);
  }

  public async loadResource(resource: StjHistoricalResource): Promise<StjOpenDataResourceResult> {
    const documents: JurisprudenceDocument[] = [];
    const result = await this.processResource(resource, {
      onBatch: async (batch) => {
        documents.push(...batch);
      },
    });
    return { ...result, documents };
  }

  public async processResource(resource: StjHistoricalResource, options: StjOpenDataProcessOptions = {}): Promise<Omit<StjOpenDataResourceResult, 'documents'>> {
    if (resource.role === 'UNCLASSIFIED') throw new Error(`STJ_OPEN_DATA_RESOURCE_NOT_CLASSIFIABLE:${resource.resourceId}`);
    const response = await this.downloadResource(resource);
    const bytes = asBytes(await response.arrayBuffer());
    const resourceSha256 = createHash('sha256').update(bytes).digest('hex');
    if (options.shouldProcess && !(await options.shouldProcess(resourceSha256))) {
      return {
        resource,
        resourceSha256,
        rawRecordCount: 0,
        acceptedRecordCount: 0,
        rejectedRecordCount: 0,
        duplicateRecordCount: 0,
        warnings: [],
      };
    }
    const entries = resource.format === 'ZIP'
      ? extractStjOpenDataZip(bytes)
      : [{ name: resource.name, bytes, classifiable: true }];
    const context: StjOpenDataResourceContext = {
      datasetId: resource.datasetId,
      datasetTitle: resource.datasetTitle,
      resourceId: resource.resourceId,
      resourceName: resource.name,
      resourceUrl: resource.url,
      resourceRole: resource.role,
      extractionDate: resource.extractionDate,
    };
    const warnings = entries
      .filter((entry) => !entry.classifiable && entry.warning)
      .map((entry) => `${entry.name}:${entry.warning}`);
    const bySourceId = new Map<string, string>();
    let rawRecordCount = 0;
    let rejectedRecordCount = 0;
    let duplicateRecordCount = 0;
    let acceptedRecordCount = 0;
    let batch: JurisprudenceDocument[] = [];
    let coverageStart: string | undefined;
    let coverageEnd: string | undefined;

    for (const entry of entries) {
      if (!entry.classifiable) continue;
      let records: Generator<unknown>;
      try {
        records = parseStjOpenDataJsonRecords(entry.name, entry.bytes);
      } catch (error) {
        throw new Error(`STJ_OPEN_DATA_RESOURCE_INVALID_JSON:${resource.resourceId}:${entry.name}:${error instanceof Error ? error.message : 'UNKNOWN'}`);
      }
      for (const rawRecord of records) {
        rawRecordCount += 1;
        try {
          const document = parseStjOpenDataRecord(rawRecord, context);
          const sourceId = document.provenance.source.documentId;
          const priorHash = bySourceId.get(sourceId);
          if (priorHash) {
            if (priorHash !== document.snapshot.contentHash) {
              throw new Error(`STJ_OPEN_DATA_RESOURCE_CONFLICT:${resource.resourceId}:${sourceId}`);
            }
            duplicateRecordCount += 1;
            continue;
          }
          bySourceId.set(sourceId, document.snapshot.contentHash);
          acceptedRecordCount += 1;
          batch.push(document);
          if (batch.length >= 10) {
            await options.onBatch?.(batch);
            batch = [];
          }
          coverageStart = !coverageStart || document.judgmentDate < coverageStart ? document.judgmentDate : coverageStart;
          coverageEnd = !coverageEnd || document.judgmentDate > coverageEnd ? document.judgmentDate : coverageEnd;
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('STJ_OPEN_DATA_RESOURCE_CONFLICT:')) throw error;
          rejectedRecordCount += 1;
        }
      }
    }
    if (batch.length > 0) await options.onBatch?.(batch);

    return {
      resource,
      resourceSha256,
      rawRecordCount,
      acceptedRecordCount,
      rejectedRecordCount,
      duplicateRecordCount,
      warnings,
      coverageStart,
      coverageEnd,
    };
  }

  public async *enumerate(options: EnumerationOptions): AsyncIterable<JurisprudenceDocument> {
    if (!this.supportsCourt(options.court)) return;
    const plan = await this.discover();
    for (const resource of plan.resources) {
      const result = await this.loadResource(resource);
      for (const document of result.documents) {
        if (inDateRange(document, options)) yield document;
      }
    }
  }

  public async search(_query: string, _options: SearchOptions = {}): Promise<JurisprudenceDocument[]> {
    return [];
  }

  private async downloadResource(resource: StjHistoricalResource): Promise<StjOpenDataBinaryFetchResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxDownloadAttempts; attempt += 1) {
      try {
        const response = await this.fetcher(resource.url);
        if (response.ok) return response;
        const error = new Error(`STJ_OPEN_DATA_RESOURCE_FAILED:${resource.resourceId}:HTTP_${response.status}`);
        if (response.status < 500 || attempt === this.maxDownloadAttempts) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (attempt === this.maxDownloadAttempts) throw error;
      }
      await wait(this.retryDelayMs * attempt);
    }
    throw lastError instanceof Error ? lastError : new Error(`STJ_OPEN_DATA_RESOURCE_FAILED:${resource.resourceId}`);
  }

  public async health(): Promise<ProviderHealth> {
    return {
      providerId: this.id,
      status: 'AVAILABLE',
      checkedAt: new Date().toISOString(),
      detail: 'Provider enumerável para aquisição histórica; não é caminho de resposta comercial direta.',
    };
  }
}
