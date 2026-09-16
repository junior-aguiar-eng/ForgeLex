import { z } from 'zod';

export const ImpactLevelSchema = z.enum([
  'L0_OBSERVATION',
  'L1_ANALYSIS',
  'L2_DRAFT',
  'L3_INTERNAL_MUTATION',
  'L4_EXTERNAL_EFFECT',
]);

export type ImpactLevel = z.infer<typeof ImpactLevelSchema>;

/**
 * Determina se a execução de uma operação com este nível de impacto
 * requer aprovação humana mandatória antes de produzir efeitos.
 * Conforme o princípio de governança do FORGELEX, L4 sempre exige aprovação.
 */
export function requiresHumanApproval(level: ImpactLevel): boolean {
  return level === 'L4_EXTERNAL_EFFECT';
}
