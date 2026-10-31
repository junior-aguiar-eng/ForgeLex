import { describe, expect, it } from 'vitest';
import { CASE_TASK_LIMITATION_CODES } from '@forgelex/legal-workflows';
import { presentDelivery } from '../apps/web/src/agentic-workspace/present-delivery';

// Cross-package guard: the workflow's limitation codes and the screen's wording must stay in step.
describe('limitações do fluxo apresentadas ao usuário', () => {
  it.each([...CASE_TASK_LIMITATION_CODES])('o código %s vira frase legível e nunca aparece como código', (code) => {
    const view = presentDelivery({
      action: 'create_document',
      status: 'LIMITED',
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      issues: [],
      claims: [],
      requirements: [],
      sources: [],
      findings: [{ id: `${code}:1`, code, statement: 'Detalhe da situação', severity: 'BLOCKING', sourceIds: [] }],
    });
    expect(view.pending).toHaveLength(1);
    expect(view.pending[0]).not.toContain(code);
    expect(view.pending[0]).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });
});
