import { describe, expect, it, vi } from 'vitest';
import { DraftingService } from '../drafting/draft-service.js';
import {
  createDatabase,
  DraftRepository,
  DraftAiReceiptRepository,
  CaseAiAccessRepository,
  DraftReviewRunRepository,
  FactsEvidenceRepository,
  MatterRepository,
  MatterAuthorityRepository,
  runPersistenceMigrations,
} from '@forgelex/persistence';
import { createFixtureResearchService } from '../research/research-service.js';
import { FactsEvidenceService } from '../facts-evidence/facts-evidence-service.js';
import { DraftReviewService } from './review-service.js';

async function fixture(manual = false) {
  const connection = await createDatabase();
  await runPersistenceMigrations(connection.client);
  const matters = new MatterRepository(connection.db);
  const matter = await matters.createMatter({
    tenantId: 'review-service',
    createdBy: 'author',
    title: 'Caso de teste',
  });
  const context = { tenantId: 'review-service', userId: 'author', matterId: matter.id };
  const drafts = new DraftRepository(connection.db),
    authorities = new MatterAuthorityRepository(connection.db);
  const research = createFixtureResearchService();
  const authority = (await research.searchCaseLaw({ query: 'vazamento', court: 'STJ', limit: 1 })).items[0];
  const saved = (await authorities.saveAuthority({ ...context, savedBy: 'author', authority })).record;
  const evidence = new FactsEvidenceRepository(connection.db),
    facts = new FactsEvidenceService(evidence);
  const fact = await facts.createFact(context, { statement: 'Fato de teste' });
  const draft = await drafts.createDraft({ ...context, createdBy: 'author', title: 'Minuta de teste' });
  const input = {
    ...context,
    draftId: draft.id,
    title: draft.title,
    createdBy: 'author',
    source: 'HUMAN' as const,
    contentHash: 'a'.repeat(64),
    sections: [
      {
        ordinal: 0,
        title: 'Fatos',
        content: 'Fato de teste',
        linkedFactIds: [fact.id],
        linkedAuthorityIds: [saved.id],
      },
      { ordinal: 1, title: 'Pedidos', content: 'Texto' },
    ],
    citations: [
      {
        sectionOrdinal: 0,
        targetType: 'AUTHORITY' as const,
        targetId: saved.id,
        citationText: 'Referência cadastrada',
        verified: manual,
      },
    ],
  };
  const bundle = await drafts.createVersion(input);
  const runs = new DraftReviewRunRepository(connection.db);
  const deps = { drafts, runs, facts, authorities, research, evidence, matters, sourceMethod: 'PROVIDER' as const };
  const service = new DraftReviewService(deps);
  return { ...connection, context, service, research, bundle, drafts, saved, input, evidence, fact, deps };
}

describe('Conferência explicável', () => {
  it('confere documento fixado sem alegar confirmação jurídica e bloqueia fonte ausente', async () => {
    const f = await fixture();
    try {
      const doc = await f.deps.matters.ingestTextDocument({ ...f.context, createdBy: f.context.userId, title:'Documento selecionado',originalFilename:'d.txt',mimeType:'text/plain',content:'Versão original' });
      const connection={clientId:'app',grantedAt:'2026-10-06T10:00:00.000Z'};
      await new CaseAiAccessRepository(f.db).replace(f.context,f.context.matterId,{oauthClientId:connection.clientId,oauthGrantedAt:connection.grantedAt,expectedRevision:0,selection:{documents:[{documentId:doc.document.id,versionId:doc.version.id}],factIds:[],evidenceIds:[],thesisIds:[],authorityIds:[]},receivePermission:{enabled:true,destination:{mode:'NEW'}}});
      const receipt=await new DraftAiReceiptRepository(f.db).receive({...f.context,oauthConnection:connection},{matterId:f.context.matterId,expectedGrantRevision:1,idempotencyKey:'documento-fixado-01',title:'Texto recebido',sections:[{ordinal:0,title:'Fatos',content:'Texto com fonte'}],references:[{sectionOrdinal:0,kind:'DOCUMENT',itemId:doc.document.id,documentVersionId:doc.version.id}]});
      const first=await f.service.runAll(f.context,receipt.draftId);
      expect(first.run.checks.find(c=>c.targetType==='DOCUMENT')).toMatchObject({state:'CONFIRMED',humanConfirmed:false,source:{method:'CASE_DOCUMENT',documentVersionId:doc.version.id}});
      await f.client.execute({sql:'DELETE FROM document_anchors WHERE document_version_id = ?',args:[doc.version.id]});
      await f.client.execute({sql:'DELETE FROM document_versions WHERE id = ?',args:[doc.version.id]});
      const missing=await f.service.runAll(f.context,receipt.draftId);
      expect(missing.blockingCount).toBeGreaterThan(0);
      expect(missing.run.checks.some(c=>c.code==='DOCUMENT_REFERENCE_NOT_FOUND')).toBe(true);
    } finally { f.client.close(); }
  });
  it('vínculo alterado exige nova conferência inclusive para decisão de aprovação pendente', async () => {
    const f = await fixture();
    try {
      const proof = await f.evidence.createEvidenceItem({ ...f.context, createdBy: 'author', title: 'Prova' });
      await f.evidence.linkEvidenceToFact({
        ...f.context,
        factId: f.fact.id,
        evidenceItemId: proof.id,
        relation: 'SUPPORTS',
      });
      await f.service.runAll(f.context, f.bundle.version.draftId);
      const drafting = new DraftingService(f.drafts, f.deps.runs);
      const approval = await drafting.requestApproval(f.context, f.bundle.version.draftId);
      await f.evidence.linkEvidenceToFact({
        ...f.context,
        factId: f.fact.id,
        evidenceItemId: proof.id,
        relation: 'CONTEXT',
      });
      expect((await drafting.getDraft(f.context, f.bundle.version.draftId)).reviewContextChanged).toBe(true);
      await expect(drafting.resolveApproval(f.context, approval.token, 'APPROVED')).rejects.toThrow(
        'DRAFT_REVIEW_STALE',
      );
      await f.service.runAll(f.context, f.bundle.version.draftId);
      expect((await drafting.resolveApproval(f.context, approval.token, 'APPROVED')).request.status).toBe('APPROVED');
    } finally {
      f.client.close();
    }
  });
  it('tentativa incompleta recente impede herdar resultado completo anterior', async () => {
    const f = await fixture();
    try {
      const proof = await f.evidence.createEvidenceItem({ ...f.context, createdBy: 'author', title: 'Prova' });
      await f.evidence.linkEvidenceToFact({
        ...f.context,
        factId: f.fact.id,
        evidenceItemId: proof.id,
        relation: 'SUPPORTS',
      });
      const first = await f.service.runAll(f.context, f.bundle.version.draftId);
      f.research.verifyAuthority = async () => {
        throw new Error('SOURCE_UNAVAILABLE');
      };
      await f.service.runAll(f.context, f.bundle.version.draftId);
      const drafting = new DraftingService(f.drafts, f.deps.runs);
      const details = await drafting.getDraft(f.context, f.bundle.version.draftId);
      expect(details.currentReviewRun?.id).toBe(first.run.id);
      expect(details.latestReviewRun?.state).toBe('INCOMPLETE');
      await expect(drafting.requestApproval(f.context, f.bundle.version.draftId)).rejects.toThrow(
        'DRAFT_REVIEW_REQUIRED',
      );
    } finally {
      f.client.close();
    }
  });
  it('mudança de suporte durante consulta torna a execução incompleta', async () => {
    const f = await fixture();
    try {
      const original = f.research.verifyAuthority.bind(f.research);
      f.research.verifyAuthority = async (input) => {
        const proof = await f.evidence.createEvidenceItem({ ...f.context, createdBy: 'author', title: 'Prova' });
        await f.evidence.linkEvidenceToFact({
          ...f.context,
          factId: f.fact.id,
          evidenceItemId: proof.id,
          relation: 'SUPPORTS',
        });
        return original(input);
      };
      const result = await f.service.runAll(f.context, f.bundle.version.draftId);
      expect(result.status).toBe('INCOMPLETE');
      expect(result.run.checks.some((c) => c.code === 'CASE_CONTEXT_CHANGED')).toBe(true);
    } finally {
      f.client.close();
    }
  });
  it('consulta que excede quinze segundos mantém indisponibilidade distinta de ausência', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    try {
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      f.research.verifyAuthority = async () => {
        started();
        return new Promise(() => undefined);
      };
      const pending = f.service.runAll(f.context, f.bundle.version.draftId);
      await ready;
      await vi.advanceTimersByTimeAsync(15_001);
      const result = await pending;
      expect(result.status).toBe('INCOMPLETE');
      expect(result.run.checks.find((c) => c.targetType === 'AUTHORITY')?.code).toBe('SOURCE_UNAVAILABLE');
    } finally {
      vi.useRealTimers();
      f.client.close();
    }
  });
  it('confirma a localização sem modificar a conferência humana', async () => {
    const f = await fixture();
    try {
      const result = await f.service.runAll(f.context, f.bundle.version.draftId);
      expect(result.run.checks.find((c) => c.targetType === 'AUTHORITY')).toMatchObject({
        state: 'CONFIRMED',
        humanConfirmed: false,
      });
      expect(
        (await f.drafts.getCurrentVersion(f.context.tenantId, f.context.matterId, f.bundle.version.draftId))
          ?.citations[0].verified,
      ).toBe(false);
    } finally {
      f.client.close();
    }
  });
  it('marca humana não transforma ausência na fonte em confirmação', async () => {
    const f = await fixture(true);
    try {
      f.research.verifyAuthority = async () => ({ status: 'NOT_FOUND', checkedAt: new Date().toISOString() });
      const result = await f.service.runAll(f.context, f.bundle.version.draftId);
      expect(result.run.checks.find((c) => c.targetType === 'AUTHORITY')).toMatchObject({
        state: 'ATTENTION',
        humanConfirmed: true,
        code: 'AUTHORITY_NOT_FOUND',
      });
    } finally {
      f.client.close();
    }
  });
  it('indisponibilidade gera execução incompleta e preserva a versão capturada', async () => {
    const f = await fixture();
    try {
      f.research.verifyAuthority = async () => {
        await f.drafts.createVersion({ ...f.input, contentHash: 'b'.repeat(64) });
        throw new Error('JURISPRUDENCE_DATA_PLANE_UNAVAILABLE');
      };
      const result = await f.service.runAll(f.context, f.bundle.version.draftId);
      expect(result).toMatchObject({ status: 'INCOMPLETE', draftVersionId: f.bundle.version.id });
      expect(result.run.checks.some((c) => c.state === 'UNAVAILABLE')).toBe(true);
    } finally {
      f.client.close();
    }
  });
  it('IDs de outro caso são bloqueados sem consultar a referência externa', async () => {
    const f = await fixture();
    try {
      const foreignId = '22222222-2222-4222-8222-222222222222';
      const bundle = await f.drafts.createVersion({
        ...f.input,
        contentHash: 'c'.repeat(64),
        sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto', linkedAuthorityIds: [foreignId] }],
        citations: [{ ...f.input.citations[0], targetId: foreignId }],
      });
      f.research.verifyAuthority = async () => {
        throw new Error('Não deve consultar');
      };
      const result = await f.service.runAll(f.context, bundle.version.draftId);
      expect(result.status).toBe('BLOCKED');
      expect(result.findings.some((c) => c.code === 'AUTHORITY_NOT_IN_MATTER')).toBe(true);
    } finally {
      f.client.close();
    }
  });
  it('alterar suporte invalida o contexto, sem depender de horários calculados', async () => {
    const f = await fixture();
    try {
      const first = await f.service.runAll(f.context, f.bundle.version.draftId);
      const again = await f.service.runAll(f.context, f.bundle.version.draftId);
      expect(again.run.contextHash).toBe(first.run.contextHash);
      const proof = await f.evidence.createEvidenceItem({ ...f.context, createdBy: 'author', title: 'Contrato' });
      await f.evidence.linkEvidenceToFact({
        ...f.context,
        factId: f.fact.id,
        evidenceItemId: proof.id,
        relation: 'SUPPORTS',
      });
      const changed = await f.service.runAll(f.context, f.bundle.version.draftId);
      expect(changed.run.contextHash).not.toBe(first.run.contextHash);
      expect(changed.findings.some((c) => c.code === 'FACT_SUPPORT_INSUFFICIENT')).toBe(false);
    } finally {
      f.client.close();
    }
  });
});
