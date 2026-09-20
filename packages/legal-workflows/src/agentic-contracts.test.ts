import { describe, expect, it } from 'vitest';
import { RESEARCH_AUTHORITY_WORKFLOW, RESEARCH_AUTHORITY_INSTRUCTIONS } from './agentic-contracts.js';

describe('contratos agênticos versionados', () => {
  it('orienta o host a pesquisar, conferir e não inventar autoridade', () => {
    expect(RESEARCH_AUTHORITY_INSTRUCTIONS.version).toBe('1.0.0');
    expect(RESEARCH_AUTHORITY_INSTRUCTIONS.negativeCase).toContain('não invente');
    expect(RESEARCH_AUTHORITY_WORKFLOW.steps.map((step) => step.toolName)).toEqual([
      'research.search_case_law',
      'research.get_authority',
      'research.verify_authority',
    ]);
  });

  it('declara que workflow é instrução do host e não executa modelo no ForgeLex', () => {
    expect(RESEARCH_AUTHORITY_WORKFLOW.hostResponsibilities).toContain('modelo');
    expect(RESEARCH_AUTHORITY_WORKFLOW.forgeLexResponsibilities).not.toContain('modelo');
    expect(RESEARCH_AUTHORITY_WORKFLOW.compatibleHosts).toContain('Claude/Anthropic');
  });
});
