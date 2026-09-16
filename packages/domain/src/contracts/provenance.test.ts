import { describe, it, expect } from 'vitest';
import { validateProvenance, ProvenanceMetadata } from './provenance.js';
import { requiresHumanApproval } from './capabilities.js';
import { DomainError } from './errors.js';

describe('Domain Contracts & Invariants', () => {
  it('deve exigir aprovação humana estrita apenas para impacto L4_EXTERNAL_EFFECT', () => {
    expect(requiresHumanApproval('L0_OBSERVATION')).toBe(false);
    expect(requiresHumanApproval('L1_ANALYSIS')).toBe(false);
    expect(requiresHumanApproval('L2_DRAFT')).toBe(false);
    expect(requiresHumanApproval('L3_INTERNAL_MUTATION')).toBe(false);
    expect(requiresHumanApproval('L4_EXTERNAL_EFFECT')).toBe(true);
  });

  it('deve rejeitar proveniência sem confirmação de verificação', () => {
    const invalidProvenance: ProvenanceMetadata = {
      id: 'd9b32c02-e2c7-432a-bc91-232145325999',
      source: {
        provider: 'STJ_OFICIAL',
        court: 'STJ',
        documentId: 'RESP_1823450',
      },
      verified: false,
      verificationMethod: 'SYNTHETIC_CANONICAL',
      verifiedAt: new Date().toISOString(),
      snippet: 'Ementa do acórdão...',
      confidence: 0.9,
    };

    expect(validateProvenance(invalidProvenance)).toBe(false);
  });

  it('deve aprovar proveniência com snippet válido e verificação atestada', () => {
    const validProvenance: ProvenanceMetadata = {
      id: 'd9b32c02-e2c7-432a-bc91-232145325999',
      source: {
        provider: 'STJ_OFICIAL',
        court: 'STJ',
        documentId: 'RESP_1823450',
        contentHash: 'a7b8c9d0e1f2',
      },
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH',
      verifiedAt: new Date().toISOString(),
      snippet: 'Responsabilidade civil objetiva por dano ambiental demonstrada.',
      confidence: 0.99,
    };

    expect(validateProvenance(validProvenance)).toBe(true);
  });

  it('deve instanciar e serializar DomainError canônico corretamente', () => {
    const err = new DomainError('HUMAN_APPROVAL_REQUIRED', 'Ação L4 requer autorização explícita do advogado', {
      action: 'protocolar_peticao',
    });

    expect(err.code).toBe('HUMAN_APPROVAL_REQUIRED');
    expect(err.details).toEqual({ action: 'protocolar_peticao' });
    expect(err.toJSON().code).toBe('HUMAN_APPROVAL_REQUIRED');
  });
});
