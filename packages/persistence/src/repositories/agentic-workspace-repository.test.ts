import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '../index.js';
import { AgenticWorkspaceRepository } from './agentic-workspace-repository.js';
import { MatterRepository } from './matter-repository.js';
import { randomUUID } from 'node:crypto';

const owner = { tenantId: 'tenant-a', userId: 'user-a' };
const context = { text: 'Quero pesquisar uma questão.', origin: 'USER' as const, documents: [] };
const question = {
  id: 'q1',
  version: 1,
  contextRevision: 1,
  prompt: 'Qual finalidade?',
  selection: 'single' as const,
  options: [
    { id: 'research', label: 'Pesquisar' },
    { id: 'review', label: 'Revisar' },
  ],
  allowFreeText: true,
  allowUnknown: true,
  reason: 'Delimitar objetivo',
};
let connection: Awaited<ReturnType<typeof createDatabase>>;
let emptyTableCounts: Awaited<ReturnType<typeof tableCounts>>;
// Child-to-parent order keeps foreign-key enforcement enabled during cleanup.
const fixtureTables = [
  'agentic_events',
  'agentic_messages',
  'agentic_executions',
  'agentic_contexts',
  'agentic_conversations',
  'document_anchors',
  'document_versions',
  'legal_documents',
  'matters',
  'agentic_tenant_guards',
];
async function tableCounts() {
  const tables = await connection.client.execute("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name");
  return (
    await connection.client.execute(
      tables.rows
        .map(({ name }) => {
          const identifier = String(name).replaceAll('"', '""');
          const label = String(name).replaceAll("'", "''");
          return `SELECT '${label}' AS table_name, COUNT(*) AS row_count FROM "${identifier}"`;
        })
        .join(' UNION ALL '),
    )
  ).rows;
}
beforeAll(async () => {
  connection = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(connection.client);
  emptyTableCounts = await tableCounts();
});
afterAll(() => connection?.client.close());
async function fixture() {
  const repo = new AgenticWorkspaceRepository(connection.db);
  const conversation = await repo.createConversation(owner, { objective: 'Pesquisar', context });
  const input = {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: 'run-1',
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  };
  const execution = await repo.createExecution(owner, input);
  return { ...connection, repo, conversation, execution, input };
}
afterEach(async () => {
  await connection.client.batch(
    fixtureTables.map((table) => `DELETE FROM ${table}`),
    'write',
  );
  // Fail if a test starts writing another table instead of silently leaking state.
  expect(await tableCounts()).toEqual(emptyTableCounts);
});

describe('persistência do trabalho agêntico', () => {
  it('rejeita atomicamente resposta que ultrapassa o limite de contexto e mantém o diálogo legível', async () => {
    const f = await fixture();
    const answers = Array.from({ length: 1000 }, (_, i) => ({
      questionId: `old-${i}`,
      questionVersion: 1,
      contextRevision: 1,
      selectedOptionIds: [],
      unknown: true,
    }));
    await f.client.execute({
      sql: 'UPDATE agentic_contexts SET payload_json = ? WHERE conversation_id = ?',
      args: [JSON.stringify({ ...context, answers }), f.conversation.id],
    });
    await f.repo.askQuestion(owner, f.execution.id, question);
    await expect(
      f.repo.answerQuestion(owner, f.execution.id, {
        questionId: 'q1',
        questionVersion: 1,
        contextRevision: 1,
        selectedOptionIds: ['research'],
      }),
    ).rejects.toThrow();
    const recovered = await f.repo.getConversation(owner, f.conversation.id);
    expect(recovered?.contextRevision).toBe(1);
    expect(recovered?.messages).toHaveLength(1);
    expect(recovered?.contexts[0].answers).toHaveLength(1000);
  });
  it('rejeita correção de schema substituído e preserva a pergunta nova', async () => {
    const f = await fixture();
    await f.repo.askQuestion(owner, f.execution.id, question);
    const answer = { questionId: 'q1', questionVersion: 1, contextRevision: 1, selectedOptionIds: ['research'] };
    await f.repo.answerQuestion(owner, f.execution.id, answer);
    const next = await f.repo.createExecution(owner, { ...f.input, contextRevision: 2, idempotencyKey: 'next' });
    await f.repo.askQuestion(owner, next.id, {
      ...question,
      version: 2,
      contextRevision: 2,
      options: [{ id: 'new', label: 'Nova opção' }],
    });
    await expect(f.repo.correctAnswer(owner, f.conversation.id, 2, { ...answer, contextRevision: 2 })).rejects.toThrow(
      'QUESTION_EXPIRED',
    );
    expect((await f.repo.getConversation(owner, f.conversation.id))?.contextRevision).toBe(2);
    expect((await f.repo.getExecution(owner, next.id))?.pendingQuestion?.version).toBe(2);
  });
  it('recupera contexto escrito e origem sem fabricar documentos', async () => {
    const f = await fixture();
    const recovered = await new AgenticWorkspaceRepository(f.db).getConversation(owner, f.conversation.id);
    expect(recovered?.contexts).toEqual([{ ...context, revision: 1 }]);
    expect((await f.client.execute('SELECT id FROM legal_documents')).rows).toHaveLength(0);
    expect(await f.repo.getExecution(owner, f.execution.id)).toMatchObject({
      status: 'QUEUED',
      checkpoint: null,
      deliveryIds: [],
    });
  });
  it('isola conversas, execuções, eventos e escritas por tenant e usuário', async () => {
    const f = await fixture();
    await f.repo.appendEvent(owner, f.execution.id, { type: 'STATUS', payload: { status: 'QUEUED' } });
    for (const stranger of [
      { ...owner, tenantId: 'tenant-b' },
      { ...owner, userId: 'user-b' },
    ]) {
      expect(await f.repo.getConversation(stranger, f.conversation.id)).toBeUndefined();
      expect(await f.repo.getExecution(stranger, f.execution.id)).toBeUndefined();
      await expect(f.repo.listEventsAfter(stranger, f.execution.id, 0)).rejects.toThrow('NOT_FOUND');
      await expect(
        f.repo.appendMessage(stranger, f.conversation.id, { role: 'USER', text: 'intrusão' }),
      ).rejects.toThrow('NOT_FOUND');
      await expect(f.repo.appendEvent(stranger, f.execution.id, { type: 'STATUS', payload: {} })).rejects.toThrow(
        'NOT_FOUND',
      );
      await expect(f.repo.createExecution(stranger, f.input)).rejects.toThrow('NOT_FOUND');
    }
  });
  it('reutiliza execução idempotente e rejeita mudança de payload', async () => {
    const f = await fixture();
    expect((await f.repo.createExecution(owner, f.input)).id).toBe(f.execution.id);
    await expect(f.repo.createExecution(owner, { ...f.input, model: 'changed' })).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
  });
  it('persiste sequência ordenada e pagina após cursor', async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) await f.repo.appendEvent(owner, f.execution.id, { type: 'STATUS', payload: { i } });
    expect((await f.repo.listEventsAfter(owner, f.execution.id, 2)).map((e) => e.sequence)).toEqual([3, 4, 5]);
    expect(
      (await new AgenticWorkspaceRepository(f.db).listEventsAfter(owner, f.execution.id, 0)).map((e) => e.sequence),
    ).toEqual([1, 2, 3, 4, 5]);
  });
  it('compara status, preserva checkpoint/entregas e impede reabrir terminal', async () => {
    const f = await fixture();
    expect(
      await f.repo.compareAndSetStatus(owner, f.execution.id, 'QUEUED', 'RUNNING', {
        checkpoint: { step: 'research' },
        deliveryIds: ['delivery-1'],
      }),
    ).toBe(true);
    expect(await f.repo.compareAndSetStatus(owner, f.execution.id, 'QUEUED', 'RUNNING')).toBe(false);
    expect(await f.repo.compareAndSetStatus(owner, f.execution.id, 'RUNNING', 'COMPLETED')).toBe(true);
    await expect(f.repo.compareAndSetStatus(owner, f.execution.id, 'COMPLETED', 'RUNNING')).rejects.toThrow(
      'INVALID_TRANSITION',
    );
    expect(await f.repo.getExecution(owner, f.execution.id)).toMatchObject({
      checkpoint: { step: 'research' },
      deliveryIds: ['delivery-1'],
    });
  });
  it.each(['single', 'multiple', 'free_text'] as const)(
    'recupera pergunta e resposta %s após reconexão',
    async (selection) => {
      const f = await fixture();
      await f.repo.askQuestion(owner, f.execution.id, {
        ...question,
        selection,
        options: selection === 'free_text' ? [] : question.options,
      });
      const answer = {
        questionId: 'q1',
        questionVersion: 1,
        contextRevision: 1,
        selectedOptionIds:
          selection === 'free_text' ? [] : selection === 'multiple' ? ['research', 'review'] : ['research'],
        freeText: 'Complemento',
      };
      await f.repo.answerQuestion(owner, f.execution.id, answer);
      const recovered = await new AgenticWorkspaceRepository(f.db).getConversation(owner, f.conversation.id);
      expect(recovered?.messages.map((m) => m.executionId)).toEqual([f.execution.id, f.execution.id]);
      expect(recovered?.messages[1].answer).toEqual(answer);
      expect(recovered?.contexts).toHaveLength(2);
      await expect(f.repo.answerQuestion(owner, f.execution.id, answer)).rejects.toThrow('QUESTION_EXPIRED');
    },
  );
  it('preserva desconhecimento explícito sem convertê-lo em autorização', async () => {
    const f = await fixture();
    await f.repo.askQuestion(owner, f.execution.id, question);
    await f.repo.answerQuestion(owner, f.execution.id, {
      questionId: 'q1',
      questionVersion: 1,
      contextRevision: 1,
      selectedOptionIds: [],
      unknown: true,
    });
    expect(await f.repo.getExecution(owner, f.execution.id)).toMatchObject({
      authorizationId: null,
      budgetReservationId: null,
      requiresReevaluation: true,
    });
  });
  it('rejeita opções alheias, seleção dupla, pergunta/versão/revisão incorreta e unknown contraditório', async () => {
    const f = await fixture();
    await f.repo.askQuestion(owner, f.execution.id, question);
    const answer = { questionId: 'q1', questionVersion: 1, contextRevision: 1, selectedOptionIds: ['research'] };
    for (const change of [
      { selectedOptionIds: ['alien'] },
      { selectedOptionIds: ['research', 'review'] },
      { questionId: 'q2' },
      { questionVersion: 2 },
      { contextRevision: 2 },
      { unknown: true },
    ]) {
      await expect(f.repo.answerQuestion(owner, f.execution.id, { ...answer, ...change })).rejects.toThrow();
    }
    expect((await f.repo.getConversation(owner, f.conversation.id))?.messages).toHaveLength(1);
  });
  it('corrige contexto com revisão esperada, expira perguntas e sinaliza entregas sem apagá-las', async () => {
    const f = await fixture();
    await f.repo.compareAndSetStatus(owner, f.execution.id, 'QUEUED', 'RUNNING', { deliveryIds: ['partial-1'] });
    await f.repo.askQuestion(owner, f.execution.id, question);
    await f.repo.reviseContext(owner, f.conversation.id, 1, { ...context, text: 'Informação corrigida' });
    await expect(f.repo.reviseContext(owner, f.conversation.id, 1, context)).rejects.toThrow('CONTEXT_CONFLICT');
    await expect(
      f.repo.answerQuestion(owner, f.execution.id, {
        questionId: 'q1',
        questionVersion: 1,
        contextRevision: 1,
        selectedOptionIds: ['research'],
      }),
    ).rejects.toThrow('QUESTION_EXPIRED');
    const recovered = await f.repo.getConversation(owner, f.conversation.id);
    expect(recovered?.contexts.map((c) => c.text)).toEqual([context.text, 'Informação corrigida']);
    expect(recovered?.messages).toHaveLength(1);
    expect(await f.repo.getExecution(owner, f.execution.id)).toMatchObject({
      contextRevision: 1,
      deliveryIds: ['partial-1'],
      requiresReevaluation: true,
    });
  });
  it('corrige resposta preservando as duas mensagens e a origem da pergunta', async () => {
    const f = await fixture();
    await f.repo.askQuestion(owner, f.execution.id, question);
    const answer = { questionId: 'q1', questionVersion: 1, contextRevision: 1, selectedOptionIds: ['research'] };
    await f.repo.answerQuestion(owner, f.execution.id, answer);
    await f.repo.correctAnswer(owner, f.conversation.id, 2, {
      ...answer,
      contextRevision: 2,
      selectedOptionIds: ['review'],
    });
    const recovered = await f.repo.getConversation(owner, f.conversation.id);
    expect(recovered?.contexts).toHaveLength(3);
    expect(recovered?.contexts[2].answers?.[0].selectedOptionIds).toEqual(['review']);
    expect(recovered?.messages.filter((m) => m.answer).map((m) => m.answer?.selectedOptionIds)).toEqual([
      ['research'],
      ['review'],
    ]);
    await expect(f.repo.correctAnswer(owner, f.conversation.id, 2, { ...answer, contextRevision: 2 })).rejects.toThrow(
      'CONTEXT_CONFLICT',
    );
  });
  it('valida referências reais de caso/documento/versão e seu tenant', async () => {
    const f = await fixture();
    const matters = new MatterRepository(f.db);
    const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso sintético' });
    const document = await matters.ingestTextDocument({
      ...owner,
      matterId: matter.id,
      createdBy: owner.userId,
      title: 'Fonte',
      originalFilename: 'fonte.txt',
      mimeType: 'text/plain',
      content: 'Texto sintético.',
    });
    const input = {
      objective: 'Analisar',
      matterId: matter.id,
      context: {
        text: '',
        origin: 'DOCUMENT' as const,
        documents: [{ documentId: document.document.id, versionId: document.version.id }],
      },
    };
    expect((await f.repo.createConversation(owner, input)).matterId).toBe(matter.id);
    await expect(f.repo.createConversation({ ...owner, tenantId: 'tenant-b' }, input)).rejects.toThrow(
      'MATTER_NOT_FOUND',
    );
    await expect(
      f.repo.createConversation(owner, {
        ...input,
        context: { ...input.context, documents: [{ ...input.context.documents[0], versionId: randomUUID() }] },
      }),
    ).rejects.toThrow('DOCUMENT_VERSION_NOT_FOUND');
    await expect(f.repo.createConversation(owner, { objective: 'Analisar', context: input.context })).rejects.toThrow(
      'CONTEXT_MATTER_REQUIRED',
    );
  });
  it('não executa nem conclui usando snapshot superado; preserva execução anterior', async () => {
    const f = await fixture();
    await f.repo.reviseContext(owner, f.conversation.id, 1, { ...context, text: 'Revisado' });
    await expect(f.repo.compareAndSetStatus(owner, f.execution.id, 'QUEUED', 'RUNNING')).rejects.toThrow(
      'CONTEXT_CONFLICT',
    );
    const next = await f.repo.createExecution(owner, { ...f.input, contextRevision: 2, idempotencyKey: 'successor' });
    expect(next.id).not.toBe(f.execution.id);
    expect(next.requiresReevaluation).toBe(false);
    await expect(f.repo.askQuestion(owner, next.id, question)).rejects.toThrow('CONTEXT_CONFLICT');
    expect((await f.repo.createExecution(owner, f.input)).id).toBe(f.execution.id);
  });
});
