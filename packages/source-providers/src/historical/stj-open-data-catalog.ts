export const STJ_OPEN_DATA_DATASET_IDS = [
  'espelhos-de-acordaos-corte-especial',
  'espelhos-de-acordaos-primeira-secao',
  'espelhos-de-acordaos-segunda-secao',
  'espelhos-de-acordaos-terceira-secao',
  'espelhos-de-acordaos-primeira-turma',
  'espelhos-de-acordaos-segunda-turma',
  'espelhos-de-acordaos-terceira-turma',
  'espelhos-de-acordaos-quarta-turma',
  'espelhos-de-acordaos-quinta-turma',
  'espelhos-de-acordaos-sexta-turma',
] as const;

export interface StjOpenDataFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type StjOpenDataFetch = (url: string) => Promise<StjOpenDataFetchResponse>;

export interface StjOpenDataCatalogOptions {
  baseUrl?: string;
  fetch?: StjOpenDataFetch;
}

interface StjOpenDataResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

interface StjOpenDataPackage {
  name: string;
  title: string;
  resources: StjOpenDataResource[];
}

export type StjHistoricalResourceRole = 'HISTORICAL_SNAPSHOT' | 'INCREMENTAL';

export interface StjHistoricalResource {
  datasetId: string;
  datasetTitle: string;
  resourceId: string;
  name: string;
  format: 'ZIP' | 'JSON';
  url: string;
  extractionDate: string;
  role: StjHistoricalResourceRole;
}

export interface StjHistoricalCoveragePlan {
  datasets: string[];
  resources: StjHistoricalResource[];
  unclassifiedResources: string[];
  warnings: string[];
}

const DEFAULT_BASE_URL = 'https://dadosabertos.web.stj.jus.br/api/3/action';

function isPackage(value: unknown): value is StjOpenDataPackage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { name?: unknown; title?: unknown; resources?: unknown };
  return typeof candidate.name === 'string'
    && typeof candidate.title === 'string'
    && Array.isArray(candidate.resources);
}

function parseResource(value: unknown): StjOpenDataResource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { id?: unknown; name?: unknown; format?: unknown; url?: unknown };
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.format !== 'string' || typeof candidate.url !== 'string') {
    return undefined;
  }
  return { id: candidate.id, name: candidate.name, format: candidate.format.toUpperCase(), url: candidate.url };
}

function parseExtractionDate(name: string): string | undefined {
  const match = name.match(/^(\d{4})(\d{2})(\d{2})?\.(?:zip|json)$/i);
  if (!match) return undefined;
  return match[3] ? `${match[1]}-${match[2]}-${match[3]}` : `${match[1]}-${match[2]}`;
}

function packageUrl(baseUrl: string, datasetId: string): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/package_show`);
  url.searchParams.set('id', datasetId);
  return url.toString();
}

export class StjOpenDataCatalog {
  private readonly baseUrl: string;
  private readonly fetcher: StjOpenDataFetch;

  public constructor(options: StjOpenDataCatalogOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetcher = options.fetch ?? (globalThis.fetch as unknown as StjOpenDataFetch);
  }

  public async discover(datasetIds: readonly string[] = STJ_OPEN_DATA_DATASET_IDS): Promise<StjHistoricalCoveragePlan> {
    const resources: StjHistoricalResource[] = [];
    const unclassifiedResources: string[] = [];
    const warnings: string[] = [];

    for (const datasetId of datasetIds) {
      const response = await this.fetcher(packageUrl(this.baseUrl, datasetId));
      if (!response.ok) throw new Error(`STJ_OPEN_DATA_CATALOG_FAILED:${datasetId}:HTTP_${response.status}`);
      const payload = await response.json() as { success?: unknown; result?: unknown };
      const packageData = payload.result;
      if (payload.success !== true || !isPackage(packageData)) {
        throw new Error(`STJ_OPEN_DATA_CATALOG_INVALID_RESPONSE:${datasetId}`);
      }
      const parsedResources = packageData.resources.map(parseResource).filter((resource): resource is StjOpenDataResource => Boolean(resource));
      const dataResources = parsedResources
        .map((resource) => ({ resource, extractionDate: parseExtractionDate(resource.name) }))
        .filter((item): item is { resource: StjOpenDataResource; extractionDate: string } => Boolean(item.extractionDate) && ['ZIP', 'JSON'].includes(item.resource.format) && item.resource.url.length > 0)
        .sort((left, right) => left.extractionDate.localeCompare(right.extractionDate) || left.resource.name.localeCompare(right.resource.name));

      const dataResourceIds = new Set(dataResources.map((item) => item.resource.id));
      for (const resource of parsedResources) {
        if (!dataResourceIds.has(resource.id)) unclassifiedResources.push(resource.name || resource.id);
      }
      if (dataResources.length === 0) {
        warnings.push(`NO_ENUMERABLE_RESOURCES:${datasetId}`);
        continue;
      }
      if (dataResources[0].resource.format !== 'ZIP') {
        warnings.push(`HISTORICAL_SNAPSHOT_NOT_ZIP:${datasetId}`);
      }

      dataResources.forEach((item, index) => {
        resources.push({
          datasetId,
          datasetTitle: packageData.title,
          resourceId: item.resource.id,
          name: item.resource.name,
          format: item.resource.format as 'ZIP' | 'JSON',
          url: item.resource.url,
          extractionDate: item.extractionDate,
          role: index === 0 ? 'HISTORICAL_SNAPSHOT' : 'INCREMENTAL',
        });
      });
    }

    return { datasets: [...datasetIds], resources, unclassifiedResources, warnings };
  }
}
