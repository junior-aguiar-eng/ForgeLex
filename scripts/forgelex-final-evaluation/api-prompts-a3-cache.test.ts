import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { EvaluationBudget } from './budget.mjs';
import { cacheArms, cacheProbe, cacheProbeCost, cacheRoles } from './api-prompts-a3-cache.fixture.js';
import { commercialProviderPrice } from '@forgelex/billing-ledger';

function terminal(model: string, cached = 0, written = 0) {
  return (
    'data: ' +
    JSON.stringify({
      type: 'response.completed',
      response: {
        model,
        service_tier: 'default',
        usage: {
          input_tokens: 4000,
          output_tokens: 256,
          input_tokens_details: {
            cached_tokens: cached,
            cache_write_tokens: written,
            cache_write_tokens_details: { ttl_30m_tokens: written, ttl_12h_tokens: 0 },
          },
        },
      },
    }) +
    '\n\n'
  );
}

it('simulates cold, cross-tenant, warm and changed-context calls in each cache mode', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forgelex-cache-offline-'));
  const runIds = cacheRoles.flatMap((role) => cacheArms.map((arm) => role + '/' + arm));
  const budget = new EvaluationBudget({
    directory,
    fingerprint: 'cache-a3-offline-v1',
    runIds,
    cap: 2250000,
    runCap: 600000,
  });
  const rows = [];
  try {
    const tenants = ['A', 'B', 'A', 'A'] as const;
    const variants = [1, 1, 1, 2] as const;
    for (const role of cacheRoles) {
      for (const arm of cacheArms) {
        const id = role + '/' + arm;
        budget.begin(id);
        const prefixes = new Set<string>();
        const probes = tenants.map((tenant, index) =>
          cacheProbe(arm, role, 'synthetic-campaign', tenant, variants[index]),
        );
        const reads: number[] = [];
        let estimateLow = 0;
        let estimateHigh = 0;
        for (const [index, probe] of probes.entries()) {
          const [staticMessage, dynamicMessage] = probe.body.input;
          const [stable] = staticMessage.content as { text: string; prompt_cache_breakpoint?: unknown }[];
          expect(stable.text).not.toContain('DADO_DINAMICO_');
          expect(dynamicMessage.role).toBe('user');
          expect(dynamicMessage).not.toHaveProperty('prompt_cache_breakpoint');
          expect(Boolean(stable.prompt_cache_breakpoint)).toBe(arm === 'explicit-prefix');
          expect(probe.body.store).toBe(false);
          expect(probe.body.parallel_tool_calls).toBe(false);
          const prefix = arm === 'implicit' ? JSON.stringify(probe.body.input) : stable.text;
          const eligible = arm !== 'current';
          const hit = eligible && prefixes.has(prefix);
          const write = eligible && !hit;
          if (eligible) prefixes.add(prefix);
          const count = arm === 'implicit' ? 3968 : 3584;
          reads.push(hit ? count : 0);
          const call = String(index + 1);
          expect(budget.reserve(id, call, probe.reserve)).toBe(true);
          const actual = cacheProbeCost(terminal(probe.profile.model, hit ? count : 0, write ? count : 0), probe);
          const rate = probe.profile.inputMicroUsdPerMillion / 1e6;
          const output = probe.profile.outputMicroUsdPerMillion / 1e6;
          expect(actual).toBe(
            Math.ceil(
              rate * (4000 - (hit || write ? count : 0)) +
                (hit ? rate * 0.05 * count : 0) +
                (write ? rate * 1.25 * count : 0) +
                256 * output,
            ),
          );
          budget.settle(id, call, actual, {});
          // Forecast assumes no discounts and prices every input token as a write in eligible modes.
          estimateLow += commercialProviderPrice(probe.profile, Math.ceil(probe.bytes / 4), 256);
          estimateHigh += commercialProviderPrice(
            {
              ...probe.profile,
              inputMicroUsdPerMillion: probe.profile.inputMicroUsdPerMillion * (eligible ? 1.25 : 1),
            },
            Math.ceil(probe.bytes / 2),
            probe.profile.maxOutputTokens,
          );
        }
        expect(reads).toEqual(
          arm === 'current' ? [0, 0, 0, 0] : arm === 'implicit' ? [0, 0, 3968, 0] : [0, 0, 3584, 3584],
        );
        budget.finish(id, 'completed');
        rows.push({ id, estimateLow, estimateHigh, reserve: probes.reduce((sum, probe) => sum + probe.reserve, 0) });
      }
    }
    expect(budget.summary()).toMatchObject({ calls: 24, unresolved: 0 });
    if (process.env.FORGELEX_A3_EXPERIMENT_BUDGET === '1') console.log(JSON.stringify({ cache: rows }));
  } finally {
    budget.close();
    // mkdtempSync created this directory exclusively for this test; remove only its two ledger files.
    rmSync(join(directory, 'budget.jsonl'), { force: true });
    rmdirSync(directory);
  }
});

it('refuses unpriced or inconsistent usage and keeps uncertain cost reserved', () => {
  const current = cacheProbe('current', 'legal-drafter', 'synthetic-campaign', 'A', 1);
  const explicit = cacheProbe('explicit-prefix', 'legal-drafter', 'synthetic-campaign', 'A', 1);
  expect(() => cacheProbeCost(terminal(current.profile.model, 0, 1), current)).toThrow('CACHE_USAGE_INVALID');
  expect(() => cacheProbeCost(terminal(explicit.profile.model, 3900, 300), explicit)).toThrow('CACHE_USAGE_INVALID');
  expect(() =>
    cacheProbeCost(
      terminal(explicit.profile.model, 0, 100).replace('"ttl_12h_tokens":0', '"ttl_12h_tokens":1'),
      explicit,
    ),
  ).toThrow('CACHE_USAGE_INVALID');
  const directory = mkdtempSync(join(tmpdir(), 'forgelex-cache-budget-'));
  const budget = new EvaluationBudget({
    directory,
    fingerprint: 'cache-uncertain-test',
    runIds: ['first', 'second'],
    cap: explicit.reserve,
  });
  try {
    budget.begin('first');
    expect(budget.reserve('first', 'request', explicit.reserve)).toBe(true);
    budget.uncertain('first', 'request');
    budget.finish('first', 'failed');
    expect(budget.summary()).toMatchObject({ exposure: explicit.reserve, unresolved: 1 });
    expect(() => budget.begin('second')).toThrow('UNCERTAIN_COST');
  } finally {
    budget.close();
    rmSync(join(directory, 'budget.jsonl'), { force: true });
    rmdirSync(directory);
  }
});
