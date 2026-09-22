import { createHash, randomUUID } from 'node:crypto';
import {
  AuthorityVerificationQuery,
  AuthorityVerificationResult,
  LegalSourceProvider,
  ProviderHealth,
  SearchOptions,
} from '../contracts/legal-source-provider.js';
import {
  generateContentHash,
  generateDedupeKey,
  JurisprudenceDocument,
  JurisprudenceDocumentSchema,
} from '@forgelex/legal-data';

export interface StjSconFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export type StjSconFetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<StjSconFetchResponse>;

export interface StjSconProviderOptions {
  baseUrl?: string;
  fetch?: StjSconFetch;
  timeoutMs?: number;
  userAgent?: string;
}

interface ParsedStjResult {
  processNumber: string;
  rapporteur: string;
  chamber?: string;
  judgmentDate: string;
  publicationDate: string;
  syllabus: string;
  sourceUrl: string;
}

const DEFAULT_BASE_URL = 'https://processo.stj.jus.br/SCON';
const DEFAULT_USER_AGENT = 'ForgeLexResearch/0.1 (+https://forgelex.ai)';

function normalizeDate(value: string): string {
  const brazilianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return brazilianDate ? `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}` : value.slice(0, 10);
}

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&ccedil;': 'ç',
    '&Ccedil;': 'Ç',
    '&atilde;': 'ã',
    '&Atilde;': 'Ã',
    '&otilde;': 'õ',
    '&Otilde;': 'Õ',
    '&aacute;': 'á',
    '&Aacute;': 'Á',
    '&eacute;': 'é',
    '&Eacute;': 'É',
    '&iacute;': 'í',
    '&Iacute;': 'Í',
    '&oacute;': 'ó',
    '&Oacute;': 'Ó',
    '&uacute;': 'ú',
    '&Uacute;': 'Ú',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z]+;/gi, (entity) => namedEntities[entity] ?? entity);
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decodeHtml(match[1]) : undefined;
}

function extractField(block: string, labels: string[]): string | undefined {
  const labelPattern = labels.join('|');
  const match = cleanText(block).match(
    new RegExp(
      `(?:${labelPattern})\\s*:?[\\s\\-]*(.*?)(?=\\s+(?:Relator(?:a)?|Ministro(?:a)? relator|Órgão julgador|Órgão|Data do julgamento|Data de publicação|Publicação|Publicado|DJe)\\s*:|$)`,
      'i'
    )
  );
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function extractDate(block: string, labels: string[]): string | undefined {
  const labelPattern = labels.join('|');
  const match = cleanText(block).match(
    new RegExp(`(?:${labelPattern})[^0-9]{0,20}(\\d{2}\\/\\d{2}\\/\\d{4})`, 'i')
  );
  return match?.[1];
}

function extractSconField(block: string, label: string): string | undefined {
  const match = block.match(
    new RegExp(
      `<div[^>]*class=["'][^"']*docTitulo[^"']*["'][^>]*>\\s*${label}[\\s\\S]*?<div[^>]*class=["'][^"']*docTexto[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`,
      'i'
    )
  );
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function parseBlock(block: string, pageUrl: string): ParsedStjResult | undefined {
  const text = cleanText(block);
  const processMatch = text.match(
    /\b(?:AgInt\s+no\s+REsp|AgInt\s+em\s+REsp|REsp|AREsp|HC|RHC|RMS|CC|MS|EDcl)\s+[\d.]+\s*(?:\/|-)\s*[A-Z]{2}\b/i
  );
  const sconSyllabus = block.match(/<textarea\b[^>]*class=["'][^"']*textareaSemformatacao[^"']*["'][^>]*>([\s\S]*?)<\/textarea>/i);
  const syllabusElement = block.match(
    /<(?:div|p|span)[^>]*class=["'][^"']*ementa[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|span)>/i
  );
  const sourcePath = block.match(/inteiro_teor\(['"]([^'"]+GetInteiroTeorDoAcordao[^'"]*)['"]\)/i)?.[1];
  const sourceAnchor = block.match(/<a\b[^>]*href=["'][^"']*(?:inteiro|acordao|processo)[^"']*["'][^>]*>/i);
  const sourceHref = sourcePath ?? (sourceAnchor ? attribute(sourceAnchor[0], 'href') : undefined);
  const sourceUrl = sourceHref ? new URL(decodeHtml(sourceHref), pageUrl).toString() : pageUrl;

  if (!processMatch) return undefined;

  const syllabus = cleanText(sconSyllabus?.[1] ?? syllabusElement?.[1] ?? extractSconField(block, 'Ementa') ?? extractField(block, ['Ementa']) ?? '');
  const rapporteur = extractSconField(block, 'Relator(?:a)?') ?? extractField(block, ['Relator(?:a)?', 'Ministro(?:a)? relator']) ?? '';
  const chamber = extractSconField(block, 'Órgão\\s+Julgador') ?? extractField(block, ['Órgão julgador', 'Órgão', 'Turma', 'Seção']);
  const judgmentDate = extractDate(extractSconField(block, 'Data\\s+do\\s+Julgamento') ?? block, ['Data do julgamento', 'Julgamento', 'Julgado']) ?? extractSconField(block, 'Data\\s+do\\s+Julgamento')?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '';
  const publicationDate = extractSconField(block, 'Data\\s+da\\s+Publicação(?:\\/Fonte)?')?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? extractDate(block, ['Data de publicação', 'Publicação', 'Publicado', 'DJe']) ?? judgmentDate;

  if (syllabus.length < 10 || rapporteur.length < 2 || !judgmentDate || !publicationDate) {
    return undefined;
  }

  return {
    processNumber: processMatch[0],
    rapporteur,
    chamber,
    judgmentDate,
    publicationDate,
    syllabus,
    sourceUrl,
  };
}

/**
 * Extrai apenas os campos necessários à proveniência a partir de resultados
 * HTML do SCON. O parser falha fechado: uma página que não seja reconhecida
 * não é convertida em um resultado aparentemente válido.
 */
export function parseStjSconResults(html: string, pageUrl: string): ParsedStjResult[] {
  const withoutNoise = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const blocks = [
    ...Array.from(
      withoutNoise.matchAll(/<a\s+name=["']DOC\d+["'][\s\S]*?(?=<a\s+name=["']DOC\d+["']|<div\s+class=["']paginacao|$)/gi),
      (match) => match[0]
    ),
    ...Array.from(withoutNoise.matchAll(/<article\b[\s\S]*?<\/article>/gi), (match) => match[0]),
    ...Array.from(
      withoutNoise.matchAll(/<div\b[^>]*class=["'][^"']*(?:resultado|acordao|jurisprudencia)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi),
      (match) => match[0]
    ),
  ];

  const parsed = blocks.map((block) => parseBlock(block, pageUrl)).filter((item): item is ParsedStjResult => Boolean(item));
  if (parsed.length > 0) return parsed;

  // Algumas respostas do SCON usam tabelas ou marcação legada sem um
  // contêiner semântico estável. Nesse caso, processamos cada janela textual
  // delimitada por números de processo, preservando o mesmo fail-closed.
  const plainText = cleanText(withoutNoise);
  const processPattern = /\b(?:AgInt\s+no\s+REsp|AgInt\s+em\s+REsp|REsp|AREsp|HC|RHC|RMS|CC|MS|EDcl)\s+[\d.]+\s*(?:\/|-)\s*[A-Z]{2}\b/gi;
  const processMatches = Array.from(plainText.matchAll(processPattern));
  const windowed = processMatches
    .map((match, index) => plainText.slice(match.index ?? 0, processMatches[index + 1]?.index ?? (match.index ?? 0) + 2500))
    .map((text) => parseBlock(text, pageUrl))
    .filter((item): item is ParsedStjResult => Boolean(item));
  if (windowed.length > 0) return windowed;

  const normalized = plainText;
  if (/nenhum\s+(?:acórdão|acordao|resultado)|não\s+foram\s+encontrad/i.test(normalized)) return [];

  throw new Error('SOURCE_PROVIDER_PARSE_FAILED: resposta do SCON não contém resultados reconhecíveis.');
}

function stableUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function documentFromParsed(parsed: ParsedStjResult, capturedAt: string): JurisprudenceDocument {
  const content = `${parsed.processNumber}\n${parsed.rapporteur}\n${parsed.judgmentDate}\n${parsed.publicationDate}\n${parsed.syllabus}`;
  const dedupeKey = generateDedupeKey('STJ', parsed.processNumber, parsed.judgmentDate);
  const document: JurisprudenceDocument = {
    id: stableUuid(`stj-scon:${dedupeKey}`),
    court: 'STJ',
    processNumber: parsed.processNumber,
    rapporteur: parsed.rapporteur,
    chamber: parsed.chamber,
    judgmentDate: parsed.judgmentDate,
    publicationDate: parsed.publicationDate,
    syllabus: parsed.syllabus,
    dedupeKey,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    snapshot: {
      contentHash: generateContentHash(content),
      capturedAt,
      provider: 'provider_stj_scon',
    },
    provenance: {
      id: randomUUID(),
      source: {
        provider: 'provider_stj_scon',
        court: 'STJ',
        collection: 'SCON/Jurisprudência',
        documentId: parsed.processNumber,
        dedupeKey,
        sourceUrl: parsed.sourceUrl,
        contentHash: generateContentHash(content),
        capturedAt,
      },
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH',
      verifiedAt: capturedAt,
      snippet: parsed.syllabus,
      confidence: 0.98,
    },
  };

  return JurisprudenceDocumentSchema.parse(document);
}

export class StjSconProvider implements LegalSourceProvider {
  public readonly id = 'provider_stj_scon';
  public readonly name = 'STJ SCON Oficial';
  public readonly isOfficial = true;

  private readonly baseUrl: string;
  private readonly fetcher: StjSconFetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: StjSconProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetcher = options.fetch ?? (globalThis.fetch as unknown as StjSconFetch);
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  public supportsCourt(court: string): boolean {
    return court.trim().toUpperCase() === 'STJ';
  }

  public buildSearchUrl(query: string, limit = 20): string {
    const url = new URL(`${this.baseUrl}/pesquisar.jsp`);
    url.searchParams.set('O', 'JT');
    url.searchParams.set('b', 'ACOR');
    url.searchParams.set('livre', query);
    url.searchParams.set('l', String(Math.min(Math.max(limit, 1), 20)));
    url.searchParams.set('p', 'false');
    url.searchParams.set('i', '1');
    url.searchParams.set('operador', 'AND');
    url.searchParams.set('ordenacao', 'TEMA,-DTPB,@NUM,CLAS');
    return url.toString();
  }

  private async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
      const body = response.arrayBuffer
        ? new TextDecoder('windows-1252').decode(await response.arrayBuffer())
        : await response.text();
      if (/verificação automática em andamento|<title>\s*(?:just a moment|checking your browser)/i.test(body)) {
        throw new Error('SOURCE_PROVIDER_BLOCKED: SCON recusou a consulta automatizada.');
      }
      if (!response.ok) {
        throw new Error(`SOURCE_PROVIDER_UNAVAILABLE: SCON respondeu HTTP ${response.status}.`);
      }
      return body;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`SOURCE_PROVIDER_TIMEOUT: SCON não respondeu em ${this.timeoutMs}ms.`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  public async search(query: string, options: SearchOptions = {}): Promise<JurisprudenceDocument[]> {
    if (options.court && !this.supportsCourt(options.court)) return [];

    const pageUrl = this.buildSearchUrl(query, options.limit);
    const html = await this.fetchPage(pageUrl);
    const capturedAt = new Date().toISOString();
    const documents = parseStjSconResults(html, pageUrl).map((item) => documentFromParsed(item, capturedAt));
    return documents.slice(0, options.limit ?? 20);
  }

  public async verifyAuthority(query: AuthorityVerificationQuery): Promise<AuthorityVerificationResult> {
    const checkedAt = new Date().toISOString();
    const documents = await this.search(query.processNumber, { court: query.court, limit: 10 });
    const normalizedNumber = query.processNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const document = documents.find(
      (item) => item.processNumber.replace(/[^a-z0-9]/gi, '').toUpperCase() === normalizedNumber
    );

    if (!document) {
      return { status: 'NOT_FOUND', providerId: this.id, checkedAt };
    }
    if (query.judgmentDate && normalizeDate(query.judgmentDate) !== normalizeDate(document.judgmentDate)) {
      return {
        status: 'CONFLICTING_METADATA',
        providerId: this.id,
        checkedAt,
        document,
        reason: 'A data de julgamento informada diverge da fonte oficial.',
      };
    }
    return { status: 'VERIFIED_OFFICIAL', providerId: this.id, checkedAt, document };
  }

  public async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      await this.fetchPage(this.buildSearchUrl('responsabilidade civil', 1));
      return { providerId: this.id, status: 'AVAILABLE', checkedAt };
    } catch (error) {
      return {
        providerId: this.id,
        status: /BLOCKED|TIMEOUT|HTTP 403/i.test(error instanceof Error ? error.message : '') ? 'DEGRADED' : 'UNAVAILABLE',
        checkedAt,
        detail: error instanceof Error ? error.message : 'Falha desconhecida no SCON.',
      };
    }
  }
}
