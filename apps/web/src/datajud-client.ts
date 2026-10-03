import { ApiRequestError, resolveApiOrigin } from './api-client';
import { DATAJUD_COURTS, type DataJudCourtCode, type DataJudCourtId } from './datajud-courts';

export interface DataJudRecord {
  id: string; court: DataJudCourtCode; processNumber: string; degree?: string; filedAt?: string;
  caseClass?: { codigo: number; nome: string };
  subjects: Array<{ codigo: number; nome: string }>;
  judgingBody?: { codigo: number; nome: string; codigoMunicipioIBGE?: number };
  sourceUpdatedAt?: string; indexedAt?: string;
  movements: Array<{ code?: number; name: string; occurredAt: string }>;
}
export interface DataJudResult {
  court: DataJudCourtCode; processNumber: string; billable: false; consultedAt: string;
  source: { name: string; url: string }; notice: string; truncated: boolean; records: DataJudRecord[];
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const namedCode = (value: unknown) => record(value) && typeof value.codigo === 'number' && typeof value.nome === 'string';
function validResult(value: unknown, expectedCourt: DataJudCourtCode): value is DataJudResult {
  if (!record(value) || value.court !== expectedCourt || value.billable !== false || typeof value.processNumber !== 'string'
    || !/^\d{20}$/.test(value.processNumber) || typeof value.consultedAt !== 'string' || !Number.isFinite(Date.parse(value.consultedAt))
    || !record(value.source) || typeof value.source.name !== 'string' || typeof value.source.url !== 'string'
    || typeof value.notice !== 'string' || typeof value.truncated !== 'boolean' || !Array.isArray(value.records) || value.records.length > 20) return false;
  return value.records.every((item: unknown) => record(item) && typeof item.id === 'string' && item.court === expectedCourt
    && item.processNumber === value.processNumber && optionalString(item.degree) && optionalString(item.filedAt)
    && optionalString(item.sourceUpdatedAt) && optionalString(item.indexedAt)
    && (item.caseClass === undefined || namedCode(item.caseClass)) && (item.judgingBody === undefined || namedCode(item.judgingBody))
    && Array.isArray(item.subjects) && item.subjects.every(namedCode)
    && Array.isArray(item.movements) && item.movements.every((movement: unknown) => record(movement)
      && (movement.code === undefined || typeof movement.code === 'number') && typeof movement.name === 'string' && typeof movement.occurredAt === 'string'
      && Number.isFinite(Date.parse(movement.occurredAt))));
}

export async function lookupDataJudProcess(courtId: DataJudCourtId, processNumber: string, signal?: AbortSignal): Promise<DataJudResult> {
  const court = DATAJUD_COURTS.find((entry) => entry.id === courtId);
  if (!court) throw new ApiRequestError('Este tribunal ainda não está disponível para consulta.', 'DATAJUD_UNSUPPORTED_COURT', 400);
  let response: Response;
  try {
    response = await fetch(`${resolveApiOrigin()}${court.endpoint}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ processNumber: processNumber.trim() }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiRequestError(`Não foi possível conectar à consulta do ${court.code}. Tente novamente mais tarde; o serviço é gratuito.`, 'DATAJUD_UNAVAILABLE', 503);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(record(body) && typeof body.message === 'string' ? body.message : 'O DataJud está indisponível. Tente novamente mais tarde.',
      record(body) && typeof body.error === 'string' ? body.error : 'DATAJUD_UNAVAILABLE', response.status);
  }
  if (!validResult(body, court.code)) throw new ApiRequestError('O DataJud não retornou dados válidos para exibição. Tente novamente mais tarde.', 'DATAJUD_INVALID_RESPONSE', 502);
  return body;
}

export function lookupTjalProcess(processNumber: string, signal?: AbortSignal): Promise<DataJudResult> {
  return lookupDataJudProcess('tjal', processNumber, signal);
}

export function formatCnjNumber(value: string): string {
  return /^\d{20}$/.test(value) ? `${value.slice(0, 7)}-${value.slice(7, 9)}.${value.slice(9, 13)}.${value[13]}.${value.slice(14, 16)}.${value.slice(16)}` : value;
}
export function formatDataJudDate(value?: string): string {
  if (!value) return 'Não informado';
  if (/^\d{14}$/.test(value)) return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Maceio' }).format(timestamp) : 'Não informado';
}
