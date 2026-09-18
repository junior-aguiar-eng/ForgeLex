import { calculateTokenChargeCents, DEFAULT_AI_MARGIN_BPS } from './billing-rules.js';

export interface ModelRate {
  provider: string;
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
  usdToBrl: number;
  marginBps: number;
  effectiveFrom: string;
}

export interface ModelUsageInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export class ModelPricingCatalog {
  private readonly rates: readonly ModelRate[];

  public constructor(rates: readonly ModelRate[]) {
    this.rates = rates.map((rate) => ({ ...rate, marginBps: rate.marginBps ?? DEFAULT_AI_MARGIN_BPS }));
  }

  public list(): readonly ModelRate[] { return this.rates; }

  public calculate(input: ModelUsageInput): { chargeCents: number; providerCostCents: number; snapshot: ModelRate } {
    const rate = this.rates.find((item) => item.provider === input.provider && item.model === input.model);
    if (!rate) throw new Error('MODEL_RATE_NOT_FOUND');
    const chargeCents = calculateTokenChargeCents({ ...input, ...rate });
    const providerCostCents = calculateTokenChargeCents({ ...input, ...rate, marginBps: 0 });
    return { chargeCents, providerCostCents, snapshot: { ...rate } };
  }

  public static fromJson(raw: string | undefined): ModelPricingCatalog {
    if (!raw?.trim()) return new ModelPricingCatalog([]);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('MODEL_PRICING_INVALID'); }
    if (!Array.isArray(parsed)) throw new Error('MODEL_PRICING_INVALID');
    return new ModelPricingCatalog(parsed as ModelRate[]);
  }
}
