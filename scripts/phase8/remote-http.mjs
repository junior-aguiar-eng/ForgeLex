import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { redactEvidence } from './redact-evidence.mjs';

export function validateRemoteEnvironment({ baseUrl, apiKey }) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
  if (!apiKey) throw new Error('API_KEY_REQUIRED');
  return url;
}

export function createRemoteHttpClient({ baseUrl, apiKey, fetcher = fetch, timeoutMs = 60_000, maxOperations = 25 }) {
  const origin = validateRemoteEnvironment({ baseUrl, apiKey });
  let operations = 0;
  return {
    get operations() { return operations; },
    async request(path, options = {}) {
      operations += 1;
      if (operations > maxOperations) throw new Error('REMOTE_OPERATION_LIMIT');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now();
      try {
        const headers = { authorization: `Bearer ${apiKey}`, accept: 'application/json', ...(options.headers ?? {}) };
        const response = await fetcher(new URL(path, origin), { ...options, headers, signal: controller.signal });
        const bodyText = await response.text();
        let body;
        try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
        if (response.status >= 500) throw new Error(`REMOTE_HTTP_5XX:${response.status}`);
        if (response.status === 401) throw new Error('REMOTE_HTTP_401');
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
      } catch (error) {
        if (controller.signal.aborted) throw new Error('REMOTE_HTTP_TIMEOUT');
        throw error;
      } finally { clearTimeout(timer); }
    },
  };
}

export async function runRemoteSmoke(client, metricsToken, idempotencyKey = randomUUID(), healthPath = process.env.FORGELEX_PHASE8_HEALTH_PATH ?? '/health') {
  const results = [];
  results.push(await client.request(healthPath));
  results.push(await client.request('/readyz'));
  results.push(await client.request('/openapi.json'));
  results.push(await client.request('/api/v2/tribunals'));
  const search = { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ query: 'vazamento', court: 'STJ', limit: 1 }) };
  results.push(await client.request('/api/v2/research/search-case-law', search));
  results.push(await client.request('/api/v2/research/search-case-law', search));
  results.push(await client.request('/api/v2/research/search-case-law', { ...search, headers: { ...search.headers, 'idempotency-key': `${idempotencyKey}-unsupported` }, body: JSON.stringify({ query: 'vazamento', court: 'STF', limit: 5 }) }));
  results.push(await client.request('/metrics', { headers: { authorization: `Bearer ${metricsToken}` } }));
  const statuses = results.map((result) => result.status);
  if (statuses.slice(0, 6).some((status) => status < 200 || status >= 300) || statuses[6] !== 422 || statuses[7] !== 200) throw new Error(`REMOTE_SMOKE_FAILED:${statuses.join(',')}`);
  return redactEvidence({ status: 'passed', timestamp: new Date().toISOString(), operationId: idempotencyKey, count: results.length, calls: results.map(({ status, latencyMs, headers }) => ({ status, latencyMs, requestId: headers['x-request-id'], chargedCents: Number(headers['x-credits-charged'] ?? 0) * 100, replay: headers['x-idempotent-replay'] === 'true' })) });
}

export async function runLimitedRemoteLoad(client, idempotencyKey, { requests = 25, concurrency = 5 } = {}) {
  if (!Number.isInteger(requests) || requests < 1 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > requests) throw new Error('REMOTE_LOAD_CONFIGURATION_INVALID');
  const results = [];
  let next = 0;
  async function worker() {
    while (next < requests) {
      const index = next++;
      results[index] = await client.request('/api/v2/research/search-case-law', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': `${idempotencyKey}-${index + 1}` },
        body: JSON.stringify({ query: 'vazamento', court: 'STJ', limit: 1 }),
      });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (results.some((result) => result.status !== 200)) throw new Error('REMOTE_LOAD_FAILED');
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1)];
  return redactEvidence({ status: 'passed', timestamp: new Date().toISOString(), operationId: idempotencyKey, requests, concurrency, chargedCents: Math.round(results.reduce((sum, result) => sum + Number(result.headers['x-credits-charged'] ?? 0) * 100, 0)), p50Ms: percentile(0.5), p95Ms: percentile(0.95) });
}

async function main() {
  const client = createRemoteHttpClient({ baseUrl: process.env.FORGELEX_PHASE8_BASE_URL, apiKey: process.env.FORGELEX_PHASE8_API_KEY });
  const evidence = await runRemoteSmoke(client, process.env.FORGELEX_METRICS_TOKEN);
  console.log(JSON.stringify(evidence));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
