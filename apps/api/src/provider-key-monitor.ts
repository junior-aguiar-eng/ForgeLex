import { structuredLog } from './observability.js';

/**
 * Verificação leve da chave do provedor comercial (OpenAI), sem gastar crédito.
 *
 * Em 09/11/2026 a chave ficou inválida e ninguém soube até um cliente tentar uma peça (HTTP 401 na chamada comercial).
 * Este monitor consulta `GET /v1/models`, que não consome crédito, no máximo a cada `ttlMs`, e grava um log estruturado
 * que o alerta do Cloud Logging reconhece (`provider.key_invalid`). Ele NUNCA altera a prontidão do serviço: o site, o
 * MCP e a pesquisa funcionam sem a chave comercial, então uma chave ruim não pode tirar a API do ar.
 *
 * - Só o 401 conta como chave inválida. 403 costuma ser chave restrita sem permissão de leitura de modelos: a chave
 *   pode estar boa para `responses`, então vira `unverifiable`, sem alerta.
 * - A chave só sai do processo no cabeçalho da requisição; nunca entra em log.
 * - O destino é fixo, como no provedor comercial.
 */
export const PROVIDER_KEY_CHECK_URL = 'https://api.openai.com/v1/models?limit=1';

export type ProviderKeyStatus = 'valid' | 'invalid' | 'unverifiable' | 'unreachable' | 'unknown';

export interface ProviderKeyMonitorOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Tempo mínimo entre duas consultas. */
  ttlMs?: number;
  /** Tempo máximo de espera de cada consulta. */
  timeoutMs?: number;
}

export class ProviderKeyMonitor {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private status: ProviderKeyStatus = 'unknown';
  private checkedAt = Number.NEGATIVE_INFINITY;
  private inFlight?: Promise<ProviderKeyStatus>;

  constructor(options: ProviderKeyMonitorOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  /** Último estado conhecido, sem consultar. */
  current(): ProviderKeyStatus {
    return this.status;
  }

  /** Consulta se o cache venceu; caso contrário devolve o último estado. Nunca lança. */
  async check(): Promise<ProviderKeyStatus> {
    if (this.now() - this.checkedAt < this.ttlMs) return this.status;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /**
   * Como `check`, mas não espera mais que `ms` pela resposta: a consulta segue em segundo plano e o resultado fica no
   * cache para a próxima chamada. Usado no `/readyz`, que não pode ficar lento por causa do provedor.
   */
  async checkWithin(ms: number): Promise<ProviderKeyStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<ProviderKeyStatus>((resolve) => {
      timer = setTimeout(() => resolve(this.status), ms);
      timer.unref?.();
    });
    try {
      return await Promise.race([this.check(), limit]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async run(): Promise<ProviderKeyStatus> {
    const previous = this.status;
    let next: ProviderKeyStatus;
    let httpStatus: number | undefined;
    try {
      const response = await this.fetchImpl(PROVIDER_KEY_CHECK_URL, {
        method: 'GET',
        headers: { authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      httpStatus = response.status;
      next = response.ok
        ? 'valid'
        : response.status === 401
          ? 'invalid'
          : response.status === 403
            ? 'unverifiable'
            : 'unreachable';
      await response.body?.cancel().catch(() => undefined);
    } catch {
      next = 'unreachable';
    }
    this.checkedAt = this.now();
    this.status = next;
    this.report(previous, next, httpStatus);
    return next;
  }

  /** Falha de verdade (401) grava a cada consulta, para o alerta não depender de uma única linha; o resto, só ao mudar. */
  private report(previous: ProviderKeyStatus, next: ProviderKeyStatus, httpStatus?: number): void {
    if (next === 'invalid') {
      structuredLog('error', 'provider.key_invalid', { provider: 'openai', httpStatus });
    } else if (next !== previous) {
      if (next === 'valid' && previous === 'invalid')
        structuredLog('info', 'provider.key_recovered', { provider: 'openai' });
      else if (next === 'unverifiable')
        structuredLog('warn', 'provider.key_unverifiable', { provider: 'openai', httpStatus });
      else if (next === 'unreachable')
        structuredLog('warn', 'provider.key_check_unreachable', { provider: 'openai', httpStatus });
    }
  }
}
