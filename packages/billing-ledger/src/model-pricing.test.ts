import { describe, expect, it } from 'vitest';
import { ModelPricingCatalog } from './model-pricing.js';

describe('ModelPricingCatalog', () => {
  it('calcula tarifa do modelo registrado com margem e snapshot', () => {
    const catalog = new ModelPricingCatalog([{
      provider: 'openai',
      model: 'gpt-test',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 4,
      cachedInputUsdPerMillion: 0.5,
      usdToBrl: 5,
      marginBps: 3000,
      effectiveFrom: '2026-09-01T00:00:00.000Z',
    }]);

    expect(catalog.calculate({ provider: 'openai', model: 'gpt-test', inputTokens: 1000, outputTokens: 500 })).toMatchObject({
      chargeCents: 2,
      snapshot: { provider: 'openai', model: 'gpt-test', marginBps: 3000 },
    });
  });

  it('recusa modelo sem tarifa vigente', () => {
    const catalog = new ModelPricingCatalog([]);
    expect(() => catalog.calculate({ provider: 'anthropic', model: 'claude-unknown', inputTokens: 1, outputTokens: 1 })).toThrow('MODEL_RATE_NOT_FOUND');
  });
});
