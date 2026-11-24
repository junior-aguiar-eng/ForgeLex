import { z } from 'zod';

export const CommercialProfileSetSchema = z.enum(['a2-output-v1', 'a2-roles-v1', 'a2-escalated-v1', 'a2-verbosity-v1']);
export const CommercialInferenceRoleSchema = z.enum([
  'legal-orchestrator',
  'matter-analyst',
  'legal-researcher',
  'authority-verifier',
  'procedural-advisor',
  'legal-drafter',
  'adversarial-reviewer',
  'final-editor',
]);
export const CommercialCallProfileSchema = z.strictObject({
  set: CommercialProfileSetSchema,
  role: CommercialInferenceRoleSchema,
});
export type CommercialProfileSet = z.infer<typeof CommercialProfileSetSchema>;
export type CommercialInferenceRole = z.infer<typeof CommercialInferenceRoleSchema>;
export type CommercialCallProfile = z.infer<typeof CommercialCallProfileSchema>;

const prices = {
  'gpt-6.1-sol': {
    inputMicroUsdPerMillion: 2000000,
    outputMicroUsdPerMillion: 10000000,
    cachedInputMicroUsdPerMillion: 100000,
  },
  'gpt-6.1-terra': {
    inputMicroUsdPerMillion: 1000000,
    outputMicroUsdPerMillion: 5000000,
    cachedInputMicroUsdPerMillion: 50000,
  },
  'gpt-6-luna': {
    inputMicroUsdPerMillion: 100000,
    outputMicroUsdPerMillion: 500000,
    cachedInputMicroUsdPerMillion: 10000,
  },
} as const;

interface RoleProfile {
  model: keyof typeof prices;
  effort: 'low' | 'medium' | 'high';
  maxOutputTokens: number;
}

const roleProfiles: Record<CommercialInferenceRole, RoleProfile> = {
  'legal-orchestrator': { model: 'gpt-6.1-terra', effort: 'low', maxOutputTokens: 2048 },
  'matter-analyst': { model: 'gpt-6.1-terra', effort: 'medium', maxOutputTokens: 4096 },
  'legal-researcher': { model: 'gpt-6.1-terra', effort: 'medium', maxOutputTokens: 4096 },
  'authority-verifier': { model: 'gpt-6.1-terra', effort: 'low', maxOutputTokens: 4096 },
  'procedural-advisor': { model: 'gpt-6.1-sol', effort: 'medium', maxOutputTokens: 4096 },
  'legal-drafter': { model: 'gpt-6.1-sol', effort: 'medium', maxOutputTokens: 8192 },
  'adversarial-reviewer': { model: 'gpt-6.1-sol', effort: 'medium', maxOutputTokens: 4096 },
  'final-editor': { model: 'gpt-6-luna', effort: 'low', maxOutputTokens: 2048 },
};

const escalatedEffort: Partial<Record<CommercialInferenceRole, RoleProfile['effort']>> = {
  'legal-orchestrator': 'medium',
  'matter-analyst': 'medium',
  'legal-researcher': 'medium',
  'authority-verifier': 'medium',
  'procedural-advisor': 'high',
  'legal-drafter': 'high',
  'adversarial-reviewer': 'high',
};

/** Keep published sets stable so a reservation can be resumed with the same tariffs. */
export function commercialInferenceProfile({ set, role }: CommercialCallProfile) {
  const base = roleProfiles[role];
  const escalated = set === 'a2-escalated-v1' ? escalatedEffort[role] : undefined;
  const varyModel = set === 'a2-roles-v1' || set === 'a2-escalated-v1';
  const model = varyModel && !escalated ? base.model : 'gpt-6.1-sol';
  return {
    model,
    effort: escalated ?? (varyModel ? base.effort : 'low'),
    maxOutputTokens: set === 'a2-verbosity-v1' ? 2048 : base.maxOutputTokens,
    ...(set === 'a2-verbosity-v1' ? { verbosity: role === 'legal-drafter' ? 'medium' : 'low' } : {}),
    ...prices[model],
  };
}
