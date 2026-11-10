import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_KEY_CHECK_URL, ProviderKeyMonitor } from './provider-key-monitor.js';

const SECRET = 'sk-proj-segredo-que-nunca-pode-aparecer';
let raw = '';
const lines = () =>
  raw
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });

beforeEach(() => {
  raw = '';
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    raw += String(chunk);
    return true;
  }) as typeof process.stdout.write);
});
afterEach(() => vi.restoreAllMocks());

function build(respond: () => Response | Promise<Response>, clock = { t: 0 }) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
    return respond();
  }) as unknown as typeof fetch;
  return {
    monitor: new ProviderKeyMonitor({ apiKey: SECRET, fetchImpl, now: () => clock.t, ttlMs: 600_000 }),
    calls,
    clock,
  };
}

describe('ProviderKeyMonitor', () => {
  it('chave boa: valid, sem log, consulta só o destino fixo e usa a chave apenas no cabeçalho', async () => {
    const { monitor, calls } = build(() => new Response('{}', { status: 200 }));
    expect(await monitor.check()).toBe('valid');
    expect(calls).toEqual([{ url: PROVIDER_KEY_CHECK_URL, auth: `Bearer ${SECRET}` }]);
    expect(lines()).toEqual([]);
  });

  it('401 grava provider.key_invalid a cada consulta, sem a chave, e a recuperação grava provider.key_recovered', async () => {
    let status = 401;
    const { monitor, clock } = build(
      () => new Response('{"error":{"message":"Incorrect API key provided: sk-proj-segredo"}}', { status }),
    );
    expect(await monitor.check()).toBe('invalid');
    clock.t += 600_001;
    expect(await monitor.check()).toBe('invalid');
    status = 200;
    clock.t += 600_001;
    expect(await monitor.check()).toBe('valid');
    expect(lines().map((line) => [line.level, line.message])).toEqual([
      ['error', 'provider.key_invalid'],
      ['error', 'provider.key_invalid'],
      ['info', 'provider.key_recovered'],
    ]);
    expect(lines()[0]).toMatchObject({ provider: 'openai', httpStatus: 401 });
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('Incorrect API key');
  });

  it('403 (chave restrita) vira unverifiable, avisa uma vez e não dispara o alerta de chave inválida', async () => {
    const { monitor, clock } = build(() => new Response('{}', { status: 403 }));
    expect(await monitor.check()).toBe('unverifiable');
    clock.t += 600_001;
    expect(await monitor.check()).toBe('unverifiable');
    expect(lines().map((line) => line.message)).toEqual(['provider.key_unverifiable']);
  });

  it('falha de rede e 5xx viram unreachable, avisam uma vez e nunca lançam', async () => {
    let mode: 'throw' | '503' = 'throw';
    const { monitor, clock } = build(() => {
      if (mode === 'throw') throw new Error('ECONNRESET api.openai.com');
      return new Response('x', { status: 503 });
    });
    expect(await monitor.check()).toBe('unreachable');
    mode = '503';
    clock.t += 600_001;
    expect(await monitor.check()).toBe('unreachable');
    expect(lines().map((line) => line.message)).toEqual(['provider.key_check_unreachable']);
    expect(raw).not.toContain('ECONNRESET');
  });

  it('respeita o cache: não consulta de novo antes de vencer e junta consultas simultâneas', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { monitor, calls, clock } = build(async () => {
      await gate;
      return new Response('{}', { status: 200 });
    });
    const first = monitor.check();
    const second = monitor.check();
    release();
    expect(await Promise.all([first, second])).toEqual(['valid', 'valid']);
    expect(calls).toHaveLength(1);
    clock.t += 1000;
    await monitor.check();
    expect(calls).toHaveLength(1);
    clock.t += 600_000;
    await monitor.check();
    expect(calls).toHaveLength(2);
  });

  it('checkWithin devolve o último estado sem esperar uma consulta lenta, e ela termina em segundo plano', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { monitor } = build(async () => {
      await gate;
      return new Response('{}', { status: 401 });
    });
    expect(await monitor.checkWithin(10)).toBe('unknown');
    release();
    await vi.waitFor(() => expect(monitor.current()).toBe('invalid'));
  });
});
