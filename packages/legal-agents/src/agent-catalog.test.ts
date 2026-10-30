import { describe, expect, it } from 'vitest';
import { LEGAL_AGENT_CATALOG, LEGAL_ACTION_CATALOG } from './agent-catalog.js';
import { LEGAL_WORKFLOW_CONTRACTS } from './legal-work-contracts.js';
import { LEGAL_EVALUATION_CASES } from './legal-evaluations.js';

describe('integridade dos contratos da Tarefa 0', () => {
  it('liga ações, diálogos e workflows aos papéis definidos sem ativação', () => {
    const ids = new Set(LEGAL_AGENT_CATALOG.map((agent) => agent.id));
    for (const action of LEGAL_ACTION_CATALOG) {
      expect(action.agentIds.every((id) => ids.has(id))).toBe(true);
      expect(action.objective.length).toBeGreaterThan(0);
      expect(action.deliveryCriteria.length).toBeGreaterThan(0);
      expect(action.workflowIds).toHaveLength(1);
      expect(action.workflowIds.every((id) => LEGAL_WORKFLOW_CONTRACTS.some((workflow) => workflow.id === id))).toBe(
        true,
      );
      expect(
        action.dialogue.every((question) => question.allowFreeText && question.options.includes('Ainda não sei')),
      ).toBe(true);
    }
    const roles = new Set(LEGAL_AGENT_CATALOG.map((agent) => agent.role));
    for (const workflow of LEGAL_WORKFLOW_CONTRACTS) {
      expect(workflow.roles.every((role) => roles.has(role))).toBe(true);
    }
    for (const agent of LEGAL_AGENT_CATALOG) {
      expect(agent.forbiddenBehaviors.length).toBeGreaterThan(0);
      expect(agent.handoff.length).toBeGreaterThan(0);
      expect(agent.executionEnabled).toBe(false);
    }
  });
  it('define casos positivos, negativos e ambíguos para cada dimensão jurídica', () => {
    expect(new Set(LEGAL_EVALUATION_CASES.map((item) => item.id)).size).toBe(LEGAL_EVALUATION_CASES.length);
    for (const dimension of ['ISSUES', 'SUPPORT', 'PROCEDURE', 'COUNTERARGUMENTS', 'REQUESTS']) {
      const cases = LEGAL_EVALUATION_CASES.filter((item) => item.dimension === dimension);
      expect(cases.map((item) => item.kind).sort()).toEqual(['AMBIGUOUS', 'NEGATIVE', 'POSITIVE']);
      expect(cases.every((item) => item.scenario && item.expectedBehavior && item.unacceptableBehavior)).toBe(true);
    }
  });
});
