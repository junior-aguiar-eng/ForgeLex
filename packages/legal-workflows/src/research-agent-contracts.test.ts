import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { searchCaseLawTool, getAuthorityTool, verifyAuthorityTool, CANONICAL_CASE_LAW_FIXTURES } from '@forgelex/legal-tools';
import {
  LEGAL_AGENT_CATALOG, LEGAL_ACTION_CATALOG, ResearchContextSchema,
  ResearchDeliverySchema, validateResearchHandoff, validateResearchToolBindings,
} from './research-agent-contracts.js';

const context = { contextId: 'context-1', objective: 'Pesquisar responsabilidade civil no STJ', constraints: [] };
const limited = {
  contextId: 'context-1', status: 'LIMITED', authorities: [],
  limitations: ['Nenhuma autoridade confirmada no índice.'], humanReviewRequired: true,
};

describe('A0: contratos de pesquisa STJ', () => {
  it('vincula somente ferramentas existentes e rejeita dependência ausente', () => {
    const registry = new ToolRegistry();
    registry.register(searchCaseLawTool);
    registry.register(getAuthorityTool);
    expect(() => validateResearchToolBindings(registry)).toThrow('research.verify_authority');
    registry.register(verifyAuthorityTool);
    expect(() => validateResearchToolBindings(registry)).not.toThrow();
    expect(LEGAL_AGENT_CATALOG[0].allowedTools).toEqual([
      'research.search_case_law', 'research.get_authority', 'research.verify_authority',
    ]);
  });

  it('aceita limitação explícita sem fabricar autoridade', () => {
    expect(validateResearchHandoff(context, limited).authorities).toEqual([]);
    expect(ResearchDeliverySchema.safeParse({ ...limited, limitations: [] }).success).toBe(false);
    expect(ResearchDeliverySchema.safeParse({ ...limited, status: 'READY_FOR_HUMAN_REVIEW' }).success).toBe(false);
  });

  it('preserva indisponibilidade e não a converte em resultado vazio bem-sucedido', () => {
    const unavailable = { ...limited, status: 'SOURCE_UNAVAILABLE', limitations: ['Fonte indisponível.'] };
    expect(validateResearchHandoff(context, unavailable).status).toBe('SOURCE_UNAVAILABLE');
    expect(ResearchDeliverySchema.safeParse({ ...unavailable, limitations: [] }).success).toBe(false);
  });

  it('rejeita contexto excessivo, campos estranhos e entrega de outra solicitação', () => {
    expect(ResearchContextSchema.safeParse({ ...context, objective: 'x'.repeat(4001) }).success).toBe(false);
    expect(ResearchContextSchema.safeParse({ ...context, constraints: Array(21).fill('limite') }).success).toBe(false);
    expect(ResearchContextSchema.safeParse({ ...context, confirmedFacts: ['suposição'] }).success).toBe(false);
    expect(() => validateResearchHandoff(context, { ...limited, contextId: 'other' })).toThrow();
    expect(ResearchDeliverySchema.safeParse({ ...limited, humanReviewRequired: false }).success).toBe(false);
  });

  it('rejeita autoridade sem proveniência e status incompatível', () => {
    const authority = { status: 'VERIFIED_OFFICIAL', checkedAt: '2026-10-24T12:00:00Z' };
    expect(ResearchDeliverySchema.safeParse({ ...limited, authorities: [authority] }).success).toBe(false);
    expect(ResearchDeliverySchema.safeParse({ ...limited, authorities: [{ status: 'invented' }] }).success).toBe(false);
  });

  it('aceita autoridade STJ com proveniência e preserva status sem promover avaliação jurídica', () => {
    const authority = CANONICAL_CASE_LAW_FIXTURES[0];
    const verified = { status: 'VERIFIED_OFFICIAL', checkedAt: '2026-10-24T12:00:00Z', authority };
    const delivery = { ...limited, status: 'READY_FOR_HUMAN_REVIEW', authorities: [verified], limitations: [] };
    expect(validateResearchHandoff(context, delivery).authorities[0].authority).toEqual(authority);
    expect(ResearchDeliverySchema.safeParse({ ...delivery, authorities: [{ ...verified, authority: { ...authority, court: 'STF' } }] }).success).toBe(false);
    expect(ResearchDeliverySchema.safeParse({ ...delivery, authorities: [{ ...verified, authority: { ...authority, provenance: undefined } }] }).success).toBe(false);
    for (const status of ['NOT_FOUND', 'UNVERIFIED', 'CONFLICTING_METADATA']) {
      const result = { status, checkedAt: verified.checkedAt, reason: 'Não confirmado.' };
      expect(validateResearchHandoff(context, { ...limited, authorities: [result] }).authorities[0].status).toBe(status);
      expect(ResearchDeliverySchema.safeParse({ ...delivery, authorities: [result] }).success).toBe(false);
    }
  });

  it('rejeita status verificado incompatível com a proveniência', () => {
    const authority = CANONICAL_CASE_LAW_FIXTURES[0];
    const result = {
      status: 'VERIFIED_OFFICIAL', checkedAt: '2026-10-24T12:00:00Z',
      authority: { ...authority, provenance: { ...authority.provenance, verified: false } },
    };
    expect(ResearchDeliverySchema.safeParse({ ...limited, authorities: [result] }).success).toBe(false);
  });
  it('não promove cross-check a verificação oficial', () => {
    const authority = CANONICAL_CASE_LAW_FIXTURES[0];
    const providerAuthority = { ...authority, provenance: { ...authority.provenance, verificationMethod: 'CROSS_CHECK' } };
    const result = { status: 'VERIFIED_OFFICIAL', checkedAt: '2026-10-24T12:00:00Z', authority: providerAuthority };
    expect(ResearchDeliverySchema.safeParse({ ...limited, authorities: [result] }).success).toBe(false);
    expect(ResearchDeliverySchema.safeParse({ ...limited, authorities: [{ ...result, status: 'VERIFIED_PROVIDER' }] }).success).toBe(true);
    expect(ResearchDeliverySchema.safeParse({ ...limited, authorities: [{ ...result, status: 'VERIFIED_PROVIDER', authority }] }).success).toBe(false);
  });
  it('mantém quatro ações desabilitadas e não anuncia execução habilitada', () => {
    expect(LEGAL_ACTION_CATALOG.map((action) => action.id)).toEqual([
      'analyze_documents', 'research_question', 'create_document', 'review_text',
    ]);
    expect(LEGAL_ACTION_CATALOG.every((action) => action.executionEnabled === false)).toBe(true);
    expect(LEGAL_AGENT_CATALOG[0].instructionVersion).toBe('1.0.0');
  });
});
