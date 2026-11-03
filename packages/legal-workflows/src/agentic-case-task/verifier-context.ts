import type { TaskSpecialistResult } from '@forgelex/legal-agents';

export type VerifierPriorResult = Omit<TaskSpecialistResult, 'requirements' | 'findings'>;

/**
 * The terminal role checks claim/source support, not requirement approval.
 * Keep every claim and the complete draft. Prior requirements/findings remain
 * canonical in state and are merged into the delivery independently of this view.
 * Do not truncate strings, filter claims by source kind or mutate the checkpoint.
 */
export function verifierPriorResults<T extends TaskSpecialistResult>(outputs: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(outputs).map(([role, { requirements: _requirements, findings: _findings, ...result }]) => [
      role,
      result,
    ]),
  );
}
