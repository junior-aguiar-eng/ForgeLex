import { describe, expect, it } from 'vitest';
import {
  createMcpRateLimiter,
  DEFAULT_MCP_RATE_LIMIT_PER_MINUTE,
  readMcpRateLimitPerMinute,
} from './mcp-rate-limit.js';

describe('limite de taxa do MCP', () => {
  it('nega a chamada acima do limite na janela e informa quando tentar de novo', () => {
    const limiter = createMcpRateLimiter(2);
    expect(limiter.consume('t', 'u', 1_000).allowed).toBe(true);
    expect(limiter.consume('t', 'u', 2_000).allowed).toBe(true);
    const denied = limiter.consume('t', 'u', 11_000);
    expect(denied).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it('reabre a janela depois de um minuto', () => {
    const limiter = createMcpRateLimiter(1);
    expect(limiter.consume('t', 'u', 0).allowed).toBe(true);
    expect(limiter.consume('t', 'u', 59_999).allowed).toBe(false);
    expect(limiter.consume('t', 'u', 60_000).allowed).toBe(true);
  });

  it('isola tenants e usuários entre si', () => {
    const limiter = createMcpRateLimiter(1);
    expect(limiter.consume('t1', 'u', 0).allowed).toBe(true);
    expect(limiter.consume('t1', 'u', 1).allowed).toBe(false);
    expect(limiter.consume('t2', 'u', 1).allowed).toBe(true);
    expect(limiter.consume('t1', 'outro', 1).allowed).toBe(true);
  });

  it('não confunde pares cujos identificadores se concatenam igual', () => {
    const limiter = createMcpRateLimiter(1);
    expect(limiter.consume('ab', 'c', 0).allowed).toBe(true);
    expect(limiter.consume('a', 'bc', 0).allowed).toBe(true);
  });

  it('limite zero desliga o controle', () => {
    const limiter = createMcpRateLimiter(0);
    for (let index = 0; index < 1000; index += 1) expect(limiter.consume('t', 'u', 0).allowed).toBe(true);
  });

  it('lê o limite do ambiente com padrão seguro', () => {
    expect(readMcpRateLimitPerMinute(undefined)).toBe(DEFAULT_MCP_RATE_LIMIT_PER_MINUTE);
    expect(readMcpRateLimitPerMinute('')).toBe(DEFAULT_MCP_RATE_LIMIT_PER_MINUTE);
    expect(readMcpRateLimitPerMinute('abc')).toBe(DEFAULT_MCP_RATE_LIMIT_PER_MINUTE);
    expect(readMcpRateLimitPerMinute('-5')).toBe(DEFAULT_MCP_RATE_LIMIT_PER_MINUTE);
    expect(readMcpRateLimitPerMinute('1.5')).toBe(DEFAULT_MCP_RATE_LIMIT_PER_MINUTE);
    expect(readMcpRateLimitPerMinute('30')).toBe(30);
    expect(readMcpRateLimitPerMinute('0')).toBe(0);
  });
});
