import { createHash, randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import {
  generateContentHash,
  JurisprudenceDocumentSchema,
  type JurisprudenceDocument,
} from '@forgelex/legal-data';

export interface StjOpenDataResourceContext {
  datasetId: string;
  datasetTitle: string;
  resourceId: string;
  resourceName: string;
  resourceUrl: string;
  resourceRole: 'HISTORICAL_SNAPSHOT' | 'INCREMENTAL';
  extractionDate: string;
}

export interface StjOpenDataZipEntry {
  name: string;
  classifiable: boolean;
  records: unknown[];
  warning?: string;
}

export interface StjOpenDataRawZipEntry {
  name: string;
  bytes: Uint8Array;
  classifiable: boolean;
  warning?: string;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value).trim();
  return '';
}

function cleanText(value: unknown): string {
  return text(value).replace(/\s+/g, ' ').trim();
}

function stableUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function isoDate(value: unknown, field: string): string {
  const candidate = text(value);
  const match = candidate.match(/^(\d{4})(\d{2})(\d{2})$/);
  const normalized = match ? `${match[1]}-${match[2]}-${match[3]}` : candidate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`STJ_OPEN_DATA_RECORD_INVALID:${field}`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`STJ_OPEN_DATA_RECORD_INVALID:${field}`);
  }
  return normalized;
}

function publicationDate(value: unknown): string {
  const candidate = text(value);
  const match = candidate.match(/DATA\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i)
    ?? candidate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) throw new Error('STJ_OPEN_DATA_RECORD_INVALID:dataPublicacao');
  return isoDate(`${match[3]}${match[2]}${match[1]}`, 'dataPublicacao');
}

function individualSconUrl(value: unknown): string | undefined {
  const registration = text(value).replace(/\D/g, '');
  if (!/^\d{12}$/.test(registration)) return undefined;
  return `https://processo.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=${registration}`;
}

function recordObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('STJ_OPEN_DATA_RECORD_INVALID:object');
  }
  return value as Record<string, unknown>;
}

function requiredField(record: Record<string, unknown>, field: string): string {
  const value = cleanText(record[field]);
  if (!value) throw new Error(`STJ_OPEN_DATA_RECORD_INVALID:${field}`);
  return value;
}

function normalizedLegalContent(fields: Record<string, string>): string {
  return JSON.stringify([
    fields.processNumber,
    fields.processClass,
    fields.chamber,
    fields.rapporteur,
    fields.judgmentDate,
    fields.publicationDate,
    fields.syllabus,
  ]);
}

export function parseStjOpenDataRecord(
  value: unknown,
  context: StjOpenDataResourceContext,
  capturedAt = new Date().toISOString(),
): JurisprudenceDocument {
  const record = recordObject(value);
  const sourceId = requiredField(record, 'id');
  const processNumber = requiredField(record, 'numeroProcesso');
  const processClass = requiredField(record, 'siglaClasse');
  const chamber = requiredField(record, 'nomeOrgaoJulgador');
  const rapporteur = requiredField(record, 'ministroRelator');
  const syllabus = cleanText(record.ementa);
  if (syllabus.length < 10) throw new Error('STJ_OPEN_DATA_RECORD_INVALID:ementa');
  const judgmentDate = isoDate(record.dataDecisao, 'dataDecisao');
  const publication = publicationDate(record.dataPublicacao);
  const fields = {
    processNumber,
    processClass,
    chamber,
    rapporteur,
    judgmentDate,
    publicationDate: publication,
    syllabus,
  };
  const contentHash = generateContentHash(normalizedLegalContent(fields));
  const dedupeKey = `stj_open_data_${sourceId}`;
  const document = {
    id: stableUuid(`provider_stj_open_data:${sourceId}`),
    court: 'STJ',
    processNumber,
    processClass,
    rapporteur,
    chamber,
    judgmentDate,
    publicationDate: publication,
    syllabus,
    officialUrl: individualSconUrl(record.numeroRegistro),
    dedupeKey,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    snapshot: {
      contentHash,
      capturedAt,
      provider: 'provider_stj_open_data',
    },
    provenance: {
      id: randomUUID(),
      source: {
        provider: 'provider_stj_open_data',
        court: 'STJ',
        collection: context.datasetTitle,
        documentId: sourceId,
        dedupeKey,
        sourceUrl: context.resourceUrl,
        contentHash,
        capturedAt,
      },
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH' as const,
      verifiedAt: capturedAt,
      snippet: syllabus,
      confidence: 1,
    },
  };
  return JurisprudenceDocumentSchema.parse(document);
}

export function parseStjOpenDataJson(name: string, bytes: Uint8Array): StjOpenDataZipEntry {
  if (!/\.json$/i.test(name)) {
    return { name, classifiable: false, records: [], warning: 'NON_JSON_RESOURCE' };
  }
  try {
    return { name, classifiable: true, records: [...parseStjOpenDataJsonRecords(name, bytes)] };
  } catch {
    return { name, classifiable: false, records: [], warning: 'INVALID_JSON' };
  }
}

/**
 * Lê um array JSON oficial objeto a objeto. Os snapshots do STJ podem conter
 * dezenas de milhares de registros; materializar o array inteiro antes da
 * validação faria o job consumir memória proporcional ao corpus completo.
 */
export function* parseStjOpenDataJsonRecords(name: string, bytes: Uint8Array): Generator<unknown> {
  if (!/\.json$/i.test(name)) throw new Error(`STJ_OPEN_DATA_JSON_NOT_CLASSIFIABLE:${name}`);
  const source = strFromU8(bytes).trim();
  if (!source.startsWith('[') || !source.endsWith(']')) {
    throw new Error(`STJ_OPEN_DATA_RECORD_INVALID_ROOT:${name}`);
  }
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let sawRecord = false;
  for (let index = 1; index < source.length - 1; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') {
      if (depth === 0 && character !== '{') throw new Error(`STJ_OPEN_DATA_RECORD_INVALID_ROOT:${name}`);
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      depth -= 1;
      if (depth < 0) throw new Error(`STJ_OPEN_DATA_RECORD_INVALID_JSON:${name}`);
      if (depth === 0) {
        if (objectStart < 0) throw new Error(`STJ_OPEN_DATA_RECORD_INVALID_JSON:${name}`);
        try {
          yield JSON.parse(source.slice(objectStart, index + 1));
        } catch {
          throw new Error(`STJ_OPEN_DATA_RECORD_INVALID_JSON:${name}`);
        }
        objectStart = -1;
        sawRecord = true;
      }
    }
  }
  if (inString || depth !== 0 || !sawRecord && source !== '[]') {
    throw new Error(`STJ_OPEN_DATA_RECORD_INVALID_JSON:${name}`);
  }
}

export function extractStjOpenDataZip(bytes: Uint8Array): StjOpenDataRawZipEntry[] {
  return Object.entries(unzipSync(bytes)).map(([name, content]) => ({
    name,
    bytes: content,
    classifiable: /\.json$/i.test(name),
    warning: /\.json$/i.test(name) ? undefined : 'NON_JSON_RESOURCE',
  }));
}

export function parseStjOpenDataZip(bytes: Uint8Array): StjOpenDataZipEntry[] {
  return extractStjOpenDataZip(bytes).map((entry) => entry.classifiable
    ? parseStjOpenDataJson(entry.name, entry.bytes)
    : { name: entry.name, classifiable: false, records: [], warning: entry.warning });
}
