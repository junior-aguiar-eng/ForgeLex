import { randomUUID, createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgenticWorkspaceRepository,
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  DraftRepository,
} from '@forgelex/persistence';
import { NativeCaseContextService } from './native-case-context.js';
import { AgenticOwnerSchema, AgenticTaskDeliverySchema } from '@forgelex/domain';
const connections: any[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});
async function fixture(contextText = 'Texto fornecido.') {
  const c = await createDatabase({ url: 'file::memory:' });
  connections.push(c);
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: 'tenant', userId: 'user' },
    matter = await new MatterRepository(c.db).createMatter({
      ...owner,
      title: 'Caso',
      description: 'Sintético',
      createdBy: owner.userId,
    });
  const repo = new AgenticWorkspaceRepository(c.db);
  const conversation = await repo.createConversation(owner, {
    matterId: matter.id,
    objective: 'Analisar',
    context: { origin: 'USER', text: contextText, documents: [] },
  });
  const execution = await repo.createExecution(owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: 'run',
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await repo.compareAndSetStatus(owner, execution.id, 'QUEUED', 'RUNNING');
  let allowed = true;
  const native = new NativeCaseContextService(c.db, async () => {
    if (!allowed) throw new Error('ACCESS_REVOKED');
  });
  const binding = {
    ...owner,
    executionId: execution.id,
    conversationId: conversation.id,
    contextRevision: 1,
    objective: 'Analisar',
    actionId: 'analyze_documents' as const,
    matterId: matter.id,
  };
  const delivery = {
    action: 'analyze_documents' as const,
    contextId: conversation.id,
    contextRevision: 1,
    status: 'CANDIDATE' as const,
    humanReviewRequired: true as const,
    legalAssessment: 'NOT_EVALUATED' as const,
    issues: [],
    claims: [],
    requirements: [],
    findings: [],
    sources: [],
  };
  return {
    ...c,
    owner,
    matter,
    repo,
    native,
    binding,
    delivery,
    revoke: () => {
      allowed = false;
    },
  };
}
describe('contexto nativo sem credencial OAuth fictícia', () => {
  it('financial snapshot remains committed and owner-bound after live authorization is revoked', async () => {
    const f = await fixture();
    const saved = await f.native.save(f.binding, f.delivery);
    f.revoke();
    await expect(f.native.getDelivery(f.owner, saved.id)).rejects.toThrow('ACCESS_REVOKED');
    expect(await f.native.getCommittedExecutionDelivery(f.owner, f.binding.executionId, saved.id)).toEqual(f.delivery);
    expect(
      await f.native.getCommittedExecutionDelivery({ ...f.owner, userId: 'other' }, f.binding.executionId, saved.id),
    ).toBeUndefined();
    const next = await f.repo.createExecution(f.owner, {
      conversationId: f.binding.conversationId,
      contextRevision: 1,
      idempotencyKey: 'other',
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    await f.repo.saveProgress(f.owner, next.id, {}, [saved.id]);
    expect(await f.native.getCommittedExecutionDelivery(f.owner, next.id, saved.id)).toBeUndefined();
    await f.client.execute({
      sql: 'UPDATE agentic_task_deliveries SET content_hash=? WHERE id=?',
      args: ['0'.repeat(64), saved.id],
    });
    await expect(f.native.getCommittedExecutionDelivery(f.owner, f.binding.executionId, saved.id)).rejects.toThrow(
      'DELIVERY_INTEGRITY_FAILED',
    );
  });
  it('a leitura histórica não depende do orçamento agregado de contexto da próxima execução', async () => {
    const f = await fixture('u'.repeat(60000)),
      saved = await f.native.save(f.binding, f.delivery);
    for (let i = 0; i < 5; i++) {
      const e = await f.repo.createExecution(f.owner, {
        conversationId: f.binding.conversationId,
        contextRevision: 1,
        idempotencyKey: `history-${i}`,
        authorizationId: null,
        budgetReservationId: null,
        provider: null,
        model: null,
      });
      const payloadJson = JSON.stringify(
        AgenticTaskDeliverySchema.parse({
          ...f.delivery,
          findings: [
            {
              id: `large-${i}`,
              code: 'SYNTHETIC_HISTORY',
              severity: 'WARNING',
              statement: 'x'.repeat(16000),
              sourceIds: [],
            },
          ],
        }),
      );
      await f.client.execute({
        sql: 'INSERT INTO agentic_task_deliveries (id,execution_id,conversation_id,tenant_id,user_id,context_revision,payload_json,content_hash) VALUES (?,?,?,?,?,?,?,?)',
        args: [
          `delivery:${e.id}`,
          e.id,
          f.binding.conversationId,
          f.owner.tenantId,
          f.owner.userId,
          1,
          payloadJson,
          createHash('sha256').update(payloadJson).digest('hex'),
        ],
      });
    }
    expect((await f.native.getDelivery(f.owner, saved.id)).delivery).toEqual(f.delivery);
    await expect(f.native.load(f.binding)).rejects.toThrow('TASK_CONTEXT_LIMIT');
  });
  it('analise seguida de redação reutiliza entrega permitida sem apagar histórico', async () => {
    const f = await fixture();
    const packet = await f.native.load(f.binding);
    const saved = await f.native.save(f.binding, {
      ...f.delivery,
      sources: packet.sources.map(({ text: _text, ...s }) => s),
    });
    const next = await f.repo.createExecution(f.owner, {
      conversationId: f.binding.conversationId,
      contextRevision: 1,
      idempotencyKey: 'next',
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    await f.repo.compareAndSetStatus(f.owner, next.id, 'QUEUED', 'RUNNING');
    const reused = await f.native.load({
      ...f.binding,
      executionId: next.id,
      actionId: 'create_document',
      objective: 'Agora redigir',
    });
    expect(reused.sources.some((s) => s.id === saved.id && s.kind === 'PREVIOUS_DELIVERY')).toBe(true);
    expect((await f.repo.getExecution(f.owner, f.binding.executionId))?.deliveryIds).toContain(saved.id);
  });
  it('exclusão de documento selecionado entre leituras impede nova leitura/gravação', async () => {
    const f = await fixture();
    const d = await new MatterRepository(f.db).ingestTextDocument({
      tenantId: f.owner.tenantId,
      matterId: f.matter.id,
      title: 'Documento',
      originalFilename: 'fixture.txt',
      mimeType: 'text/plain',
      content: 'Documento sintético',
      createdBy: f.owner.userId,
    });
    await f.repo.reviseContext(f.owner, f.binding.conversationId, 1, {
      text: '',
      origin: 'DOCUMENT',
      documents: [{ documentId: d.document.id, versionId: d.version.id }],
    });
    const e = await f.repo.createExecution(f.owner, {
      conversationId: f.binding.conversationId,
      contextRevision: 2,
      idempotencyKey: 'document',
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    await f.repo.compareAndSetStatus(f.owner, e.id, 'QUEUED', 'RUNNING');
    const b = { ...f.binding, executionId: e.id, contextRevision: 2 };
    await f.native.load(b);
    await f.client.execute({
      sql: "UPDATE legal_documents SET lifecycle_state='PURGED' WHERE id=?",
      args: [d.document.id],
    });
    await expect(f.native.load(b)).rejects.toThrow();
    await expect(f.native.save(b, { ...f.delivery, contextRevision: 2 })).rejects.toThrow();
  });
  it('não entrega payload persistido cuja identidade/hash foi trocada', async () => {
    const f = await fixture(),
      saved = await f.native.save(f.binding, f.delivery);
    await f.client.execute({
      sql: 'UPDATE agentic_task_deliveries SET payload_json=? WHERE id=?',
      args: [JSON.stringify({ ...f.delivery, contextId: 'other' }), saved.id],
    });
    await expect(f.native.getDelivery(f.owner, saved.id)).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  });
  it('o callback de autorização recebe somente a identidade canônica do proprietário', async () => {
    const f = await fixture();
    await new NativeCaseContextService(f.db, async (owner) => {
      AgenticOwnerSchema.parse(owner);
    }).load(f.binding);
  });
  it('carrega só seleção/conteúdo autorizados e isola outro usuário', async () => {
    const f = await fixture();
    const packet = await f.native.load(f.binding);
    expect(packet.sources[0].text).toBe('Texto fornecido.');
    await expect(f.native.load({ ...f.binding, userId: 'other' })).rejects.toThrow();
  });
  it('revogação entre leituras e antes da gravação impede novos efeitos', async () => {
    const f = await fixture();
    await f.native.load(f.binding);
    f.revoke();
    await expect(f.native.load(f.binding)).rejects.toThrow('ACCESS_REVOKED');
    await expect(f.native.save(f.binding, f.delivery)).rejects.toThrow('ACCESS_REVOKED');
    expect((await f.client.execute('SELECT id FROM agentic_task_deliveries')).rows).toHaveLength(0);
  });
  it('persiste entrega preliminar idempotente e não adota fatos nem aprova versão', async () => {
    const f = await fixture();
    const delivery = {
      ...f.delivery,
      action: 'create_document' as const,
      document: {
        title: 'Candidato',
        documentType: 'Proposta',
        sections: [{ title: 'Contexto', content: 'Alegação preliminar.', sourceIds: [] }],
      },
    };
    const a = await f.native.save(f.binding, delivery),
      b = await f.native.save(f.binding, delivery);
    expect(b).toEqual(a);
    expect(a.draftId).toBeTruthy();
    const draft = await new DraftRepository(f.db).getDraft(f.owner.tenantId, f.matter.id, a.draftId!);
    expect(draft?.status).toBe('DRAFT');
    expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(0);
    expect((await f.client.execute('SELECT id FROM drafts')).rows).toHaveLength(1);
    expect((await f.native.getDelivery(f.owner, a.id)).delivery).toEqual(delivery);
  });
  it('entrega confirmada permanece identificável se o processo cair antes do checkpoint do worker', async () => {
    const f = await fixture();
    const saved = await f.native.save(f.binding, f.delivery);
    expect((await f.repo.getExecution(f.owner, f.binding.executionId))?.deliveryIds).toContain(saved.id);
  });
  it('nova revisão de contexto conflita e preserva a entrega anterior', async () => {
    const f = await fixture(),
      saved = await f.native.save(f.binding, f.delivery);
    await f.repo.reviseContext(f.owner, f.binding.conversationId, 1, {
      text: 'Corrigido',
      origin: 'USER',
      documents: [],
    });
    await expect(f.native.save(f.binding, f.delivery)).rejects.toThrow('CONTEXT_CONFLICT');
    expect((await f.native.getDelivery(f.owner, saved.id)).delivery).toEqual(f.delivery);
  });
  it('nova versão humana do draft selecionado produz conflito sem sobrescrever', async () => {
    const f = await fixture(),
      repo = new DraftRepository(f.db);
    const draft = await repo.createDraft({
      tenantId: f.owner.tenantId,
      matterId: f.matter.id,
      title: 'Humano',
      createdBy: f.owner.userId,
    });
    const first = await repo.createVersion({
      tenantId: f.owner.tenantId,
      matterId: f.matter.id,
      draftId: draft.id,
      title: 'Humano',
      createdBy: f.owner.userId,
      source: 'HUMAN',
      contentHash: 'a'.repeat(64),
      sections: [{ title: 'Original', content: 'Texto humano.', ordinal: 1, linkedFactIds: [], linkedThesisIds: [] }],
    });
    await f.repo.reviseContext(f.owner, f.binding.conversationId, 1, {
      text: 'Revisar',
      origin: 'USER',
      documents: [],
      draft: { draftId: draft.id, versionId: first.version.id },
    } as any);
    const execution = await f.repo.createExecution(f.owner, {
      conversationId: f.binding.conversationId,
      contextRevision: 2,
      idempotencyKey: randomUUID(),
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    await f.repo.compareAndSetStatus(f.owner, execution.id, 'QUEUED', 'RUNNING');
    const binding = { ...f.binding, executionId: execution.id, contextRevision: 2 };
    const packet = await f.native.load(binding);
    expect(packet.sources.find((s) => s.versionId === first.version.id)?.kind).toBe('DRAFT');
    await repo.createVersion({
      tenantId: f.owner.tenantId,
      matterId: f.matter.id,
      draftId: draft.id,
      title: 'Humano',
      createdBy: f.owner.userId,
      source: 'HUMAN',
      contentHash: 'b'.repeat(64),
      sections: [{ title: 'Novo', content: 'Nova edição humana.', ordinal: 1, linkedFactIds: [], linkedThesisIds: [] }],
    });
    await expect(f.native.save(binding, { ...f.delivery, contextRevision: 2 })).rejects.toThrow(
      'SOURCE_VERSION_CONFLICT',
    );
    expect((await repo.getCurrentVersion(f.owner.tenantId, f.matter.id, draft.id))?.version.contentHash).toBe(
      'b'.repeat(64),
    );
  });
});
