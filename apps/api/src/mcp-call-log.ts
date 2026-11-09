import { structuredLog } from './observability.js';

const METHOD = /^[a-z][a-z/_]{0,39}$/;
const TOOL = /^[a-z][a-z0-9_.]{0,63}$/;
const VERSION = /^[0-9A-Za-z.+_-]{1,40}$/;

type Json = Record<string, unknown>;
const object = (value: unknown): Json | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;

export interface McpCallLogInput {
  body: unknown;
  response?: unknown;
  /** O cabeçalho `Idempotency-Key` chegou preenchido. */
  idempotencyHeader: boolean;
  durationMs: number;
  agent?: string;
  threw?: boolean;
}

/**
 * Metadados de uma chamada JSON-RPC em /mcp, sem conteúdo: método e ferramenta só entram se casarem com um formato
 * conhecido, a chave de idempotência vira apenas a origem (`header`, `argument` ou `none`), e nunca se registram
 * argumentos, resultados, consultas, identificadores ou o valor da chave.
 */
export function mcpCallFields(input: McpCallLogInput): Json {
  const body = object(input.body);
  const response = object(input.response);
  const params = object(body?.params);
  const method = typeof body?.method === 'string' && METHOD.test(body.method) ? body.method : 'other';
  const tool =
    method === 'tools/call' && typeof params?.name === 'string' && TOOL.test(params.name) ? params.name : undefined;
  const result = object(response?.result);
  const error = object(response?.error);
  const argumentKey = object(params?.arguments)?.idempotencyKey;
  const idempotency =
    method !== 'tools/call'
      ? undefined
      : input.idempotencyHeader
        ? 'header'
        : typeof argumentKey === 'string' && argumentKey.trim()
          ? 'argument'
          : 'none';
  const serverInfo = object(result?.serverInfo);
  return {
    method,
    ...(tool ? { tool } : {}),
    ...(idempotency ? { idempotency } : {}),
    ok: !input.threw && !error && result?.isError !== true,
    ...(typeof error?.code === 'number' ? { rpcErrorCode: error.code } : {}),
    ...(method === 'initialize' && typeof serverInfo?.version === 'string' && VERSION.test(serverInfo.version)
      ? { serverVersion: serverInfo.version }
      : {}),
    ...(method === 'tools/list' && Array.isArray(result?.tools) ? { toolCount: result.tools.length } : {}),
    durationMs: input.durationMs,
    ...(input.agent ? { agent: input.agent.slice(0, 80) } : {}),
  };
}

export function logMcpCall(input: McpCallLogInput): void {
  const fields = mcpCallFields(input);
  structuredLog(fields.ok === false ? 'warn' : 'info', 'mcp.call', fields);
}
