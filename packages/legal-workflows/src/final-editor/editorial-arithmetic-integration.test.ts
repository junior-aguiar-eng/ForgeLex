import { expect, it, vi } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import type { NativeCaseTaskRepository } from '@forgelex/persistence';
import { FinalEditorService, editorialContextFromSnapshot } from './final-editor-service.js';
import { FinalEditorGenerator } from './final-editor-generator.js';
import { EditorialReviewService } from './editorial-review-service.js';

function snapshot(): Awaited<ReturnType<NativeCaseTaskRepository['loadEditorialSnapshot']>> {
  return {
    id: 'desk:case',
    origin: 'DESK_VERSION',
    draftId: 'draft',
    versionId: 'version',
    sources: [],
    delivery: {
      contextId: 'desk-version:version',
      contextRevision: 2,
      document: {
        title: 'Peça sintética',
        documentType: 'Manifestação',
        sections: [
          {
            title: 'Fatos',
            content:
              'A Cliente Modelo solicitou a conferência de três parcelas de R$ 100,00 cada. O total indicado no relato é R$ 200,00.',
            sourceIds: [],
          },
        ],
      },
      claims: [],
      requirements: [],
      supportAudit: [],
      findings: [
        {
          id: 'original',
          code: 'LEGAL_SUPPORT_NOT_EVALUATED',
          severity: 'WARNING',
          statement: 'Fatos e fontes não auditados.',
          sourceIds: [],
        },
      ],
    },
  };
}
it('mostra a divergência na revisão mesmo quando o provedor simulado a omite, sem gravar ou aplicar', async () => {
  const saved = snapshot(),
    before = structuredClone(saved),
    owner = { tenantId: 't', userId: 'u' },
    target = { draftId: saved.draftId, versionId: saved.versionId };
  const load = vi.fn(async () => saved),
    service = new FinalEditorService({ loadEditorialSnapshot: load });
  const factory = vi.fn(
    ({
      registry,
      context,
    }: Parameters<NonNullable<ConstructorParameters<typeof FinalEditorGenerator>[1]>['createProvider']>[0]) =>
      new FakeAgentProvider(registry, undefined, [
        {
          toolCall: {
            name: 'editorial.submit',
            input: {
              contractVersion: context.contractVersion,
              contextId: context.contextId,
              contextRevision: context.contextRevision,
              deliveryId: context.deliveryId,
              draftId: context.draftId,
              versionId: context.versionId,
              documentHash: context.documentHash,
              status: 'LIMITED',
              humanReviewRequired: true,
              legalAssessment: 'NOT_EVALUATED',
              changes: [],
              substantiveSuggestions: [],
              limitations: ['Valores preservados sem validação.'],
            },
          },
        },
      ]),
  );
  const result = await new FinalEditorGenerator(service, { createProvider: factory }).generate(owner, saved.id, target);
  expect(result.mode).toBe('SIMULATED');
  expect(factory).toHaveBeenCalledTimes(1);
  expect(result.proposal.changes).toEqual([]);
  expect(result.proposal.substantiveSuggestions).toEqual([]);
  let writes = 0;
  const review = new EditorialReviewService({
    readEditorialHistory: async () => null,
    editorialReview: async (_owner, _id, _target, action) => {
      const out = action(saved, null);
      if (out.record !== undefined) writes++;
      return out.result;
    },
  });
  const preview = await review.review(owner, saved.id, { ...target, proposal: result.proposal }, 'preview');
  expect(preview.context.findings[0]).toEqual(saved.delivery.findings[0]);
  expect(preview.context.findings[1].statement).toContain('3 × R$ 100,00 = R$ 300,00');
  expect(preview.context.findings[1].statement).toContain('R$ 200,00');
  expect(writes).toBe(0);
  expect(saved).toEqual(before);
});
it('recalcula o alerta para a versão alterada e preserva os hashes do documento', () => {
  const saved = snapshot(),
    first = editorialContextFromSnapshot(saved);
  saved.versionId = 'v3';
  saved.delivery.contextRevision = 3;
  saved.delivery.document!.sections[0].content = saved.delivery.document!.sections[0].content.replace(
    'R$ 200,00',
    'R$ 300,00',
  );
  const next = editorialContextFromSnapshot(saved);
  expect(next.findings).toEqual(saved.delivery.findings);
  expect(next.documentHash).not.toBe(first.documentHash);
  expect(next.versionId).toBe('v3');
});
it('não reconstrói auditorias ausentes nem modifica o contexto de entregas históricas', () => {
  const saved = snapshot();
  delete saved.origin;
  expect(editorialContextFromSnapshot(saved).findings).toEqual(saved.delivery.findings);
  saved.origin = 'DESK_VERSION';
  delete saved.delivery.supportAudit;
  expect(() => editorialContextFromSnapshot(saved)).toThrow('EDITORIAL_AUDIT_UNAVAILABLE');
});
