import { describe, it, expect } from 'vitest';
import * as persistence from '../index.js';
import { caseAccessFixture } from './case-ai-access-repository.test.js';
import { randomUUID } from 'node:crypto';
import { MatterLifecycleRepository } from './matter-lifecycle-repository.js';
import { MatterPurgeRepository } from './matter-purge-repository.js';

export async function analysisFixture() {
  const f = await caseAccessFixture();
  const grant = await f.repo.replace(f.owner, f.matter.id, {
    ...f.input,
    analysisPermission: { enabled: true, objective: 'Confrontar contrato' },
  });
  const source = {
    documentId: f.doc.document.id,
    versionId: f.doc.version.id,
    anchorId: f.doc.anchors[0].id,
    quote: f.doc.anchors[0].text,
    relation: 'CONTEXT' as const,
  };
  const input = {
    matterId: f.matter.id,
    expectedGrantRevision: grant.revision,
    idempotencyKey: 'analysis-test-key-001',
    objective: 'Confrontar contrato',
    items: [
      {
        id: 'f1',
        kind: 'FACT' as const,
        text: 'Parte alega falta de pagamento',
        classification: 'ALLEGATION' as const,
        sources: [source],
      },
      {
        id: 'p1',
        kind: 'EVIDENCE' as const,
        text: 'Contrato da parte',
        classification: 'EXTRACTED' as const,
        sources: [{ ...source, relation: 'SUPPORTS' as const }],
        factItemId: 'f1',
        relation: 'CONTEXT' as const,
      },
      {
        id: 'q1',
        kind: 'ISSUE' as const,
        text: 'Existe inadimplemento contratual?',
        classification: 'LEGAL_QUESTION' as const,
        sources: [source],
      },
      {
        id: 't1',
        kind: 'TIMELINE' as const,
        text: 'Data alegada da contratação',
        eventDate: '2026-01-01',
        classification: 'ALLEGATION' as const,
        sources: [source],
      },
    ],
  };
  const Repository = persistence.CaseAnalysisRepository;
  return { ...f, grant, input, source, analyses: new Repository(f.db) };
}
describe('Análise do caso: recebimento e conferência', () => {
  it('bloqueia fontes arquivadas e remove recibos ao excluir o caso', async () => {
    const f = await analysisFixture();
    try {
      const r = await f.analyses.receive(f.reader, f.input);
      const actor = {
        userId: f.owner.userId,
        authType: 'web_session' as const,
        role: 'member' as const,
        scopes: ['matter:write'],
      };
      const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
      const lifecycle = new MatterLifecycleRepository(f.db);
      await lifecycle.transition({ ...target, documentId: f.doc.document.id }, actor, 'archive', {
        expectedLifecycleRevision: 0,
      });
      await expect(
        f.analyses.decide(f.owner, f.matter.id, r.id, {
          expectedRevision: 1,
          decisions: [{ itemId: 'f1', action: 'ADOPT' }],
        }),
      ).rejects.toThrow('ANALYSIS_SOURCE_UNAVAILABLE');
      await lifecycle.transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
      await new MatterPurgeRepository(f.client).purge(
        target,
        actor,
        { expectedLifecycleRevision: 1, confirmation: f.matter.title },
        {
          operationId: 'e'.repeat(64),
          target,
          expectedLifecycleRevision: 1,
          fingerprint: 'f'.repeat(64),
          preparedAt: new Date().toISOString(),
        },
      );
      expect((await f.client.execute('SELECT id FROM case_analysis_receipts')).rows).toEqual([]);
    } finally {
      f.client.close();
    }
  });
  it('recusa recebimento desabilitado, revisão antiga e cancelamento sem persistir', async () => {
    const f = await analysisFixture();
    try {
      await expect(f.analyses.receive(f.reader, { ...f.input, expectedGrantRevision: 2 })).rejects.toThrow(
        'ANALYSIS_PERMISSION_STALE',
      );
      const signal = AbortSignal.abort();
      await expect(f.analyses.receive(f.reader, f.input, { signal })).rejects.toThrow();
      await expect(
        f.analyses.receive(f.reader, f.input, {
          revalidate: async () => {
            throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
          },
        }),
      ).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      expect(await f.analyses.list(f.owner, f.matter.id)).toEqual([]);
      await f.repo.replace(f.owner, f.matter.id, {
        oauthClientId: f.reader.oauthConnection.clientId,
        oauthGrantedAt: f.reader.oauthConnection.grantedAt,
        selection: f.selection,
        expectedRevision: 1,
        analysisPermission: { enabled: false },
      });
      await expect(f.analyses.receive(f.reader, { ...f.input, expectedGrantRevision: 2 })).rejects.toThrow(
        'ANALYSIS_RECEIVING_NOT_AUTHORIZED',
      );
    } finally {
      f.client.close();
    }
  });
  it('recebe sem criar entidades; replay não duplica e conteúdo divergente conflita', async () => {
    const f = await analysisFixture();
    try {
      const first = await f.analyses.receive(f.reader, f.input);
      expect(await new persistence.FactsEvidenceRepository(f.db).listFacts(f.owner.tenantId, f.matter.id)).toEqual([]);
      expect(await f.analyses.receive(f.reader, f.input)).toMatchObject({ id: first.id, isReplay: true });
      await expect(f.analyses.receive(f.reader, { ...f.input, objective: 'Outro objetivo' })).rejects.toThrow(
        'ANALYSIS_OBJECTIVE_STALE',
      );
      await expect(
        f.analyses.receive(f.reader, { ...f.input, items: [{ ...f.input.items[0], text: 'Outro fato' }] }),
      ).rejects.toThrow('ANALYSIS_RECEIPT_CONFLICT');
      expect(await f.analyses.list(f.owner, f.matter.id)).toHaveLength(1);
    } finally {
      f.client.close();
    }
  });
  it('recusa fonte estrangeira, versão divergente, trecho inventado e permissão revogada', async () => {
    const f = await analysisFixture();
    try {
      for (const source of [
        { ...f.source, documentId: randomUUID() },
        { ...f.source, versionId: randomUUID() },
        { ...f.source, quote: 'Não consta do original' },
      ])
        await expect(
          f.analyses.receive(f.reader, { ...f.input, items: [{ ...f.input.items[0], sources: [source] }] }),
        ).rejects.toThrow('ANALYSIS_REFERENCE_INVALID');
      await f.repo.revoke(f.owner, f.matter.id, f.grant.id, 1);
      await expect(f.analyses.receive(f.reader, f.input)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
    } finally {
      f.client.close();
    }
  });
  it('incorpora seleção editada atomicamente com vínculos e mantém decisões e origem', async () => {
    const f = await analysisFixture();
    try {
      const receipt = await f.analyses.receive(f.reader, f.input);
      const review = await f.analyses.decide(f.owner, f.matter.id, receipt.id, {
        expectedRevision: 1,
        decisions: [
          { itemId: 'p1', action: 'ADOPT' },
          { itemId: 'f1', action: 'ADOPT', text: 'Alegação conferida por Boni' },
          { itemId: 'q1', action: 'DISCARD' },
          { itemId: 't1', action: 'ADOPT' },
        ],
      });
      const repo = new persistence.FactsEvidenceRepository(f.db);
      const facts = await repo.listFacts(f.owner.tenantId, f.matter.id);
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ statement: 'Alegação conferida por Boni', status: 'ASSERTED' });
      expect((await repo.getFactSupport(f.owner.tenantId, f.matter.id, facts[0].id)).evidenceLinks).toHaveLength(1);
      expect(review.items[0].text).toBe(f.input.items[0].text);
      expect(review.decisions.f1).toMatchObject({ text: 'Alegação conferida por Boni', decidedBy: f.owner.userId });
      expect(await f.analyses.list({ ...f.owner, userId: 'other' }, f.matter.id)).toEqual([]);
      await expect(
        f.analyses.decide(f.owner, f.matter.id, receipt.id, {
          expectedRevision: 1,
          decisions: [{ itemId: 'f1', action: 'ADOPT' }],
        }),
      ).rejects.toThrow('ANALYSIS_REVIEW_CONFLICT');
      await expect(
        f.analyses.decide(f.owner, f.matter.id, receipt.id, {
          expectedRevision: 2,
          decisions: [{ itemId: 'f1', action: 'ADOPT' }],
        }),
      ).rejects.toThrow('ANALYSIS_ALREADY_DECIDED');
    } finally {
      f.client.close();
    }
  });
  it('rollback inclui itens incorporados quando uma decisão inválida interrompe o lote', async () => {
    const f = await analysisFixture();
    try {
      const r = await f.analyses.receive(f.reader, f.input);
      await expect(
        f.analyses.decide(f.owner, f.matter.id, r.id, {
          expectedRevision: 1,
          decisions: [
            { itemId: 'f1', action: 'ADOPT' },
            { itemId: 'unknown', action: 'ADOPT' },
          ],
        }),
      ).rejects.toThrow('ANALYSIS_ITEM_INVALID');
      expect(await new persistence.FactsEvidenceRepository(f.db).listFacts(f.owner.tenantId, f.matter.id)).toEqual([]);
      expect((await f.analyses.get(f.owner, f.matter.id, r.id)).revision).toBe(1);
    } finally {
      f.client.close();
    }
  });
});
