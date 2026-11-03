import type { CaseTaskRole } from './agentic-case-contracts.js';
import { SCOPED_DELIVERY_TASK_POLICY, scopedDeliveryTaskProfile } from './agentic-scoped-delivery.js';

export const FOCUSED_VERIFIER_TASK_POLICY = { ...SCOPED_DELIVERY_TASK_POLICY, version: '1.9.0' } as const;

/** Keep the v7 profile stable for historical checkpoints. */
export function focusedVerifierTaskProfile(role: CaseTaskRole) {
  const prior = scopedDeliveryTaskProfile(role);
  return {
    ...prior,
    version: '1.9.0',
    policyVersion: '1.9.0',
    instructions:
      prior.instructions +
      (role === 'authority-verifier'
        ? ' Neste handoff terminal, priorResults conserva todas as claims, a cobertura e a minuta integral. Os requirements e findings anteriores ficam preservados no estado e na entrega pelo servidor; sua ausência nesta projeção não significa inexistência, resolução ou aprovação. Conferir suporte de todos os pares supportTargets usando as fontes completas e o plano; registrar novas ressalvas em findings. Não reavaliar ou promover requisitos anteriores a verificados, nem aprovar a minuta.'
        : ''),
  };
}
