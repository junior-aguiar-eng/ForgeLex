import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { TaskSource } from '@forgelex/domain';
import { auditClaimSupport } from './support-audit.js';

const text = 'Texto sintético sobre uma entrega parcial.';
const source: TaskSource = {
  id: 's',
  kind: 'AUTHORITY',
  text,
  contentHash: createHash('sha256').update(text).digest('hex'),
  identityStatus: 'INDEX_CANDIDATE',
};
const claim = { id: 'c', classification: 'INFERENCE' as const, statement: 'Afirmação a avaliar.', sourceIds: ['s'] };
const check = { claimId: 'c', sourceId: 's', quote: text, assessment: 'SUPPORTED' as const };

describe('auditoria determinística de suporte', () => {
  it('conserva hash e trecho, sem transformar a avaliação do modelo em conclusão jurídica', () => {
    expect(auditClaimSupport([claim], [source], [check])).toEqual({
      invalidChecks: false,
      entries: [
        {
          claimId: 'c',
          sourceId: 's',
          sourceContentHash: source.contentHash,
          quote: text,
          quoteStatus: 'MATCHED',
          modelAssessment: 'SUPPORTED',
        },
      ],
    });
  });
  it('uma substring verdadeira não demonstra suporte semântico: o registro não diz verificado', () => {
    const unrelated = { ...claim, statement: 'Uma proposição inteiramente alheia.' };
    const result = auditClaimSupport([unrelated], [source], [{ ...check, quote: 'Texto' }]);
    expect(result.entries[0].quoteStatus).toBe('MATCHED');
    expect(result.entries[0]).not.toHaveProperty('verified');
    expect(result.entries[0]).not.toHaveProperty('legalAssessment');
  });
  it('avaliações duplicadas não dependem de ordem e não conservam a primeira como válida', () => {
    const negative = { ...check, assessment: 'NONE' as const };
    expect(auditClaimSupport([claim], [source], [check, negative])).toEqual(
      auditClaimSupport([claim], [source], [negative, check]),
    );
    expect(auditClaimSupport([claim], [source], [check, negative]).entries[0]).toMatchObject({
      quoteStatus: 'CONFLICTING',
      modelAssessment: 'NOT_ASSESSED',
    });
  });
  it('referência repetida na mesma afirmação não duplica registro de auditoria', () => {
    expect(auditClaimSupport([{ ...claim, sourceIds: ['s', 's'] }], [source], [check]).entries).toHaveLength(1);
  });
  it('origem factual não recebe verificação de autoridade por classificação do modelo', () => {
    expect(auditClaimSupport([claim], [{ ...source, kind: 'USER_TEXT' }], [check])).toEqual({
      invalidChecks: true,
      entries: [],
    });
  });
  it('outra versão com conteúdo diferente invalida correspondência literal e preserva seu hash', () => {
    const changed = {
      ...source,
      text: 'Outra versão.',
      contentHash: createHash('sha256').update('Outra versão.').digest('hex'),
    };
    expect(auditClaimSupport([claim], [changed], [check]).entries[0]).toMatchObject({
      quoteStatus: 'MISMATCH',
      sourceContentHash: changed.contentHash,
    });
  });
});
