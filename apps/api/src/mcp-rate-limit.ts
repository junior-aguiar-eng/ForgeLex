/**
 * Limite de taxa para `tools/call` na rota /mcp, por tenant e usuário.
 *
 * Janela fixa em memória. Em Cloud Run com mais de uma instância o limite vale por instância,
 * então o teto efetivo é `limite × instâncias`. Serve como primeira barreira contra rajadas e
 * abuso das ferramentas gratuitas (leitura de caso, apresentação), que não passam pelo ledger.
 */
export const DEFAULT_MCP_RATE_LIMIT_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

export interface McpRateLimitDecision {
  allowed: boolean;
  /** Segundos até a janela reabrir; só quando `allowed` é falso. */
  retryAfterSeconds: number;
}

export interface McpRateLimiter {
  consume(tenantId: string, userId: string, now?: number): McpRateLimitDecision;
}

/** Lê o limite do ambiente. Valor ausente ou inválido usa o padrão; `0` desliga o limite. */
export function readMcpRateLimitPerMinute(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MCP_RATE_LIMIT_PER_MINUTE;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_MCP_RATE_LIMIT_PER_MINUTE;
}

export function createMcpRateLimiter(limitPerMinute: number): McpRateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(tenantId, userId, now = Date.now()) {
      if (limitPerMinute === 0) return { allowed: true, retryAfterSeconds: 0 };
      const key = `${tenantId}\u0000${userId}`;
      const current = windows.get(key);

      if (current && current.resetAt > now) {
        if (current.count >= limitPerMinute) {
          return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
        }
        current.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (!current && windows.size >= MAX_TRACKED_KEYS) {
        for (const [trackedKey, entry] of windows) if (entry.resetAt <= now) windows.delete(trackedKey);
        // Se ainda estiver cheio, descarta o mais antigo em vez de negar um usuário novo e legítimo.
        if (windows.size >= MAX_TRACKED_KEYS) windows.delete(windows.keys().next().value as string);
      }
      windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
