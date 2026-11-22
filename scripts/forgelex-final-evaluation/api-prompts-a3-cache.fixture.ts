import { createHash } from 'node:crypto';
import { commercialInferenceProfile, commercialProviderPrice } from '@forgelex/billing-ledger';
import { responseUsage } from '../../apps/api/src/agentic-workspace/provider-transport.js';

export const cacheArms = ['current', 'implicit', 'explicit-prefix'] as const;
export const cacheRoles = ['legal-researcher', 'legal-drafter'] as const;
export type CacheArm = (typeof cacheArms)[number];
type CacheRole = (typeof cacheRoles)[number];
const ttl = '30m' as const;
const stableInstructions = [
  'Use somente o corpus sintético fornecido. Relacione cada conclusão com o identificador da fonte.',
  'Limite a resposta a 180 palavras e preserve as ressalvas.',
  // Versioned static fixture provides a prefix well above the provider's 1,024-token minimum.
  ...Array.from(
    { length: 128 },
    (_, index) =>
      `Exemplo fixo ${index + 1}: relate o registro, identifique a origem e mantenha qualquer premissa incerta explícita.`,
  ),
].join('\n');

export function cacheProbe(arm: CacheArm, role: CacheRole, campaign: string, tenant: 'A' | 'B', variant: 1 | 2) {
  const profile = commercialInferenceProfile({ set: 'a2-roles-v1', role });
  const namespace = createHash('sha256')
    .update(JSON.stringify([campaign, arm, role, tenant]))
    .digest('hex');
  const body = {
    model: profile.model,
    reasoning: { effort: profile.effort },
    max_output_tokens: profile.maxOutputTokens,
    service_tier: 'default',
    stream: true,
    store: false,
    parallel_tool_calls: false,
    prompt_cache_options:
      arm === 'current' ? { mode: 'explicit' } : { mode: arm === 'implicit' ? 'implicit' : 'explicit', ttl },
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: `Namespace sintético: ${namespace}\n${stableInstructions}`,
            ...(arm === 'explicit-prefix' ? { prompt_cache_breakpoint: { mode: 'explicit', ttl } } : {}),
          },
        ],
      },
      { role: 'user', content: `DADO_DINAMICO_${variant}: examine o registro fictício e informe as ressalvas.` },
    ],
  };
  const bytes = Buffer.byteLength(JSON.stringify(body));
  const inputBound = bytes + 8192;
  const writePrice = profile.inputMicroUsdPerMillion * 1.25;
  const reserve = commercialProviderPrice(
    { ...profile, inputMicroUsdPerMillion: arm === 'current' ? profile.inputMicroUsdPerMillion : writePrice },
    inputBound,
    profile.maxOutputTokens,
  );
  return { body, profile, bytes, inputBound, reserve };
}

export function cacheProbeCost(wire: string, probe: ReturnType<typeof cacheProbe>) {
  const usage = responseUsage(wire, probe.profile.model);
  // Experiment accepts a single terminal SSE frame. The transport for a paid run must extract the terminal frame.
  const details = JSON.parse(wire.trim().slice('data: '.length)).response.usage.input_tokens_details ?? {};
  const writes = details.cache_write_tokens ?? 0;
  const byTtl = details.cache_write_tokens_details ?? {};
  const cached = usage.cachedInputTokens;
  if (
    !Number.isSafeInteger(writes) ||
    writes < 0 ||
    (byTtl.ttl_30m_tokens ?? 0) !== writes ||
    (byTtl.ttl_12h_tokens ?? 0) !== 0 ||
    Object.keys(byTtl).some((key) => key !== 'ttl_30m_tokens' && key !== 'ttl_12h_tokens') ||
    cached + writes > usage.inputTokens ||
    (probe.body.prompt_cache_options.mode === 'explicit' &&
      !('prompt_cache_breakpoint' in probe.body.input[0].content[0]) &&
      writes !== 0) ||
    usage.inputTokens > probe.inputBound ||
    usage.outputTokens > probe.profile.maxOutputTokens
  )
    throw new Error('CACHE_USAGE_INVALID');
  // Round once across normal input, reads, writes and output.
  const profile = probe.profile;
  const value =
    BigInt(usage.inputTokens - cached - writes) * BigInt(profile.inputMicroUsdPerMillion) +
    BigInt(cached) * BigInt(profile.cachedInputMicroUsdPerMillion) +
    BigInt(writes) * BigInt(profile.inputMicroUsdPerMillion * 1.25) +
    BigInt(usage.outputTokens) * BigInt(profile.outputMicroUsdPerMillion);
  return Number((value + 999999n) / 1000000n);
}
