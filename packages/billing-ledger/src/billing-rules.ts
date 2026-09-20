export const CREDIT_PACKAGES = [
  { id: 'credits_25', amountCents: 2_500 },
  { id: 'credits_50', amountCents: 5_000 },
  { id: 'credits_80', amountCents: 8_000 },
] as const;

export const BILLING_CURRENCY = 'brl' as const;
export const JURISPRUDENCE_SEARCH_COST_CENTS = 20;
export const CUSTOM_AMOUNT_MIN_CENTS = 2_500;
export const CUSTOM_AMOUNT_MAX_CENTS = 50_000;
export const AUTO_RECHARGE_THRESHOLD_CENTS = 500;

export type ForgeLexBillingPolicy =
  | { mode: 'METERED'; costCents: typeof JURISPRUDENCE_SEARCH_COST_CENTS }
  | { mode: 'FREE' };

const FORGELEX_BILLING_POLICIES: Readonly<Record<string, ForgeLexBillingPolicy>> = {
  'research.search_case_law': { mode: 'METERED', costCents: JURISPRUDENCE_SEARCH_COST_CENTS },
  'research.get_authority': { mode: 'FREE' },
  'research.verify_authority': { mode: 'FREE' },
  'workflow.legal_research_memo': { mode: 'FREE' },
};

export function getForgeLexBillingPolicy(capability: string): ForgeLexBillingPolicy {
  const policy = FORGELEX_BILLING_POLICIES[capability];
  if (!policy) throw new Error('BILLING_POLICY_UNDECLARED');
  return policy;
}

export interface CreditPurchaseInput {
  packageId?: string;
  amountCents?: number;
}

export interface ValidatedCreditPurchase {
  amountCents: number;
  packageId: string;
}

export function validateCreditPurchase(input: CreditPurchaseInput): ValidatedCreditPurchase {
  if (input.packageId !== undefined) {
    const selected = CREDIT_PACKAGES.find((item) => item.id === input.packageId);
    if (!selected) throw new Error('BILLING_PACKAGE_INVALID');
    if (input.amountCents !== undefined && input.amountCents !== selected.amountCents) {
      throw new Error('BILLING_AMOUNT_INVALID');
    }
    return { amountCents: selected.amountCents, packageId: selected.id };
  }

  if (
    input.amountCents === undefined ||
    !Number.isInteger(input.amountCents) ||
    input.amountCents < CUSTOM_AMOUNT_MIN_CENTS ||
    input.amountCents > CUSTOM_AMOUNT_MAX_CENTS
  ) {
    throw new Error('BILLING_AMOUNT_INVALID');
  }

  return { amountCents: input.amountCents, packageId: 'custom' };
}

export function calculateRefundableCents(input: {
  purchaseAmountCents: number;
  remainingCreditCents: number;
}): number {
  if (
    !Number.isInteger(input.purchaseAmountCents) ||
    !Number.isInteger(input.remainingCreditCents) ||
    input.purchaseAmountCents < 0 ||
    input.remainingCreditCents < 0
  ) {
    throw new Error('BILLING_REFUND_AMOUNT_INVALID');
  }

  return Math.min(input.purchaseAmountCents, input.remainingCreditCents);
}
