import { z } from 'zod';

export const DATAJUD_TJAL_ENDPOINT = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjal/_search';
export const DATAJUD_NOTICE = 'Fonte: CNJ / DataJud, com dados remetidos pelo TJAL. Os registros podem estar incompletos ou desatualizados. Uma resposta vazia não comprova a inexistência do processo ou de movimentações. Confirme as informações e os prazos no tribunal.';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 20;

function normalizeTjalNumber(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^(?:\d{20}|\d{7}-\d{2}\.\d{4}\.8\.02\.\d{4})$/.test(trimmed)) return undefined;
  const number = trimmed.replace(/[-.]/g, '');
  if (number.slice(13, 16) !== '802') return undefined;
  const check = 98n - BigInt(`${number.slice(0, 7)}${number.slice(9)}00`) % 97n;
  return number.slice(7, 9) === check.toString().padStart(2, '0') ? number : undefined;
}

export const DataJudProcessRequestSchema = z.object({
  processNumber: z.string().max(25).transform((value, context) => {
    const normalized = normalizeTjalNumber(value);
    if (!normalized) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe um número CNJ válido do TJAL.' });
      return z.NEVER;
    }
    return normalized;
  }),
}).strict();

const namedCode = z.object({ codigo: z.number().int(), nome: z.string().max(2000) });
const movementSchema = namedCode.extend({
  dataHora: z.string().max(100).datetime({ offset: true }),
  complementosTabelados: z.array(z.object({
    codigo: z.number().int(), descricao: z.string().max(2000).optional(),
    valor: z.union([z.number(), z.string().max(2000)]).optional(), nome: z.string().max(2000).optional(),
  })).max(100).optional(),
  orgaoJulgador: z.object({ codigoOrgao: z.number().int(), nomeOrgao: z.string().max(2000) }).optional(),
});
const recordSchema = z.object({
  id: z.string().min(1).max(300), tribunal: z.literal('TJAL'), numeroProcesso: z.string(), nivelSigilo: z.literal(0),
  grau: z.string().max(40).optional(), dataAjuizamento: z.string().max(100).optional(),
  classe: namedCode.optional(), assuntos: z.array(namedCode).max(500).optional(),
  orgaoJulgador: namedCode.extend({ codigoMunicipioIBGE: z.number().int().optional() }).optional(),
  movimentos: z.array(movementSchema).max(10000).optional(),
  dataHoraUltimaAtualizacao: z.string().max(100).optional(), '@timestamp': z.string().max(100).optional(),
});
const responseSchema = z.object({
  timed_out: z.literal(false), _shards: z.object({ failed: z.literal(0) }),
  hits: z.object({
    total: z.object({ value: z.number().int().nonnegative(), relation: z.enum(['eq', 'gte']) }),
    hits: z.array(z.object({ _source: recordSchema })).max(MAX_RECORDS),
  }),
});

export type DataJudErrorCode = 'DATAJUD_UNAVAILABLE' | 'DATAJUD_INVALID_RESPONSE' | 'DATAJUD_TIMEOUT' | 'DATAJUD_RATE_LIMITED';
export class DataJudError extends Error {
  constructor(public readonly code: DataJudErrorCode) { super(code); }
}

async function readResponse(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_RESPONSE_BYTES || !response.body) throw new DataJudError('DATAJUD_INVALID_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new DataJudError('DATAJUD_INVALID_RESPONSE');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DataJudError) throw error;
    if (error instanceof SyntaxError) throw new DataJudError('DATAJUD_INVALID_RESPONSE');
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// Consulta processual gratuita: não implementa LegalSourceProvider de jurisprudência
// e não participa do SourceRouter, do catálogo comercial ou do LedgerService.
export class DataJudTjalClient {
  constructor(private readonly options: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}

  async lookup(input: unknown, signal?: AbortSignal) {
    const { processNumber } = DataJudProcessRequestSchema.parse(input);
    const apiKey = this.options.apiKey?.trim();
    if (!apiKey) throw new DataJudError('DATAJUD_UNAVAILABLE');
    const deadline = AbortSignal.timeout(this.options.timeoutMs ?? 15000);
    const combined = signal ? AbortSignal.any([deadline, signal]) : deadline;
    try {
      const response = await (this.options.fetchImpl ?? fetch)(DATAJUD_TJAL_ENDPOINT, {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { Authorization: `APIKey ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          size: MAX_RECORDS, track_total_hits: true,
          _source: ['id', 'tribunal', 'numeroProcesso', 'nivelSigilo', 'grau', 'dataAjuizamento', 'classe', 'assuntos', 'orgaoJulgador', 'movimentos', 'dataHoraUltimaAtualizacao', '@timestamp'],
          query: { bool: { filter: [{ match: { numeroProcesso: processNumber } }, { term: { nivelSigilo: 0 } }] } },
        }),
      });
      if (response.status === 429) throw new DataJudError('DATAJUD_RATE_LIMITED');
      if (!response.ok) throw new DataJudError('DATAJUD_UNAVAILABLE');
      const parsed = responseSchema.safeParse(await readResponse(response));
      if (!parsed.success) throw new DataJudError('DATAJUD_INVALID_RESPONSE');
      const { hits } = parsed.data;
      if (hits.total.value < hits.hits.length || hits.hits.some((hit) => hit._source.numeroProcesso !== processNumber)) {
        throw new DataJudError('DATAJUD_INVALID_RESPONSE');
      }
      return {
        court: 'TJAL' as const, processNumber, billable: false as const, consultedAt: new Date().toISOString(),
        source: { name: 'CNJ / DataJud', url: 'https://www.cnj.jus.br/sistemas/datajud/api-publica/' },
        notice: DATAJUD_NOTICE,
        truncated: hits.total.relation === 'gte' || hits.total.value > hits.hits.length,
        records: hits.hits.map(({ _source: record }) => ({
          id: record.id, court: record.tribunal, processNumber: record.numeroProcesso, degree: record.grau,
          filedAt: record.dataAjuizamento, caseClass: record.classe, subjects: record.assuntos ?? [],
          judgingBody: record.orgaoJulgador, sourceUpdatedAt: record.dataHoraUltimaAtualizacao, indexedAt: record['@timestamp'],
          movements: [...(record.movimentos ?? [])].sort((a, b) => Date.parse(b.dataHora) - Date.parse(a.dataHora)).map((movement) => ({
            code: movement.codigo, name: movement.nome, occurredAt: movement.dataHora,
            complements: movement.complementosTabelados, judgingBody: movement.orgaoJulgador,
          })),
        })),
      };
    } catch (error) {
      if (combined.aborted) throw new DataJudError('DATAJUD_TIMEOUT');
      if (error instanceof DataJudError) throw error;
      throw new DataJudError('DATAJUD_UNAVAILABLE');
    }
  }
}
