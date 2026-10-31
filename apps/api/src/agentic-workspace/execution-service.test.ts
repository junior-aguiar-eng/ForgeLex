import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { agenticExecutions, agenticExecutionJobs } from '@forgelex/persistence';
import { InferenceBudgetService as BudgetService } from '@forgelex/billing-ledger';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
  MatterRepository,
} from '@forgelex/persistence';
import { LedgerService, type InferenceBudgetService } from '@forgelex/billing-ledger';
import { ExecutionService } from './execution-service.js';
import { ExecutionWorker } from './execution-worker.js';

const owner = { tenantId: 'durable', userId: 'author' };
const input = {
  objective: 'Pesquisar questão sintética',
  context: { text: 'Contexto informado', origin: 'USER' as const, documents: [] },
};
const question = {
  id: 'purpose',
  version: 1,
  contextRevision: 1,
  prompt: 'Qual finalidade?',
  selection: 'single' as const,
  options: [{ id: 'research', label: 'Pesquisar' }],
  allowFreeText: true,
  allowUnknown: true,
  reason: 'Delimitar objetivo',
};
const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
async function fixture() {
  const c = await createDatabase({ url: 'file::memory:' });
  connections.push(c);
  await runPersistenceMigrations(c.client);
  await new LedgerService(c.db, c.client).runMigrations();
  let time = 100000;
  const options = { now: () => time, executorAvailable: true };
  const service = new ExecutionService(c.db, c.client, options);
  return {
    ...c,
    options,
    service,
    advance: (n: number) => {
      time += n;
    },
    repo: new AgenticWorkspaceRepository(c.db),
  };
}
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});

it('alcança job gerido após cinquenta legados sem alterar jobs não geridos', async () => {
  const f = await fixture();
  const legacy = [];
  for (let i = 0; i < 50; i++) legacy.push(await f.service.startExecution(owner, `legacy-${i}`, input));
  f.advance(1000);
  const service = new ExecutionService(f.db, f.client, {
    ...f.options,
    canManageExecution: (execution) => execution.authorizationId === 'closed-only',
  });
  const target = await service.startExecution(owner, 'closed-target', input, {
    authorizationId: 'closed-only',
    provider: 'openai',
    model: 'gpt-6.1-sol',
  });
  expect((await service.claimNext('closed-worker'))?.executionId).toBe(target.id);
  for (const old of legacy) expect((await f.service.getExecution(owner, old.id)).status).toBe('QUEUED');
});

it('mantém job fechado fora do worker até ativação financeira explícita', async () => {
  const f = await fixture();
  let preparations = 0;
  const service = new ExecutionService(f.db, f.client, {
    ...f.options,
    requireInferenceAuthorization: true,
    prepareStart: async (_store, _owner, requested) => {
      preparations++;
      return requested;
    },
  });
  const approval = { authorizationId: 'closed:T6-MIN:50', provider: 'openai', model: 'gpt-6.1-sol' };
  const run = await service.startExecution(owner, 'closed-gate', input, approval);
  expect(await service.claimNext('too-early')).toBeUndefined();
  expect((await service.startExecution(owner, 'closed-gate', input, approval)).id).toBe(run.id);
  expect(preparations).toBe(1);
  await expect(service.activateInference(owner, run.id, 'wrong')).rejects.toThrow('EXECUTION_CONFLICT');
  await service.activateInference(owner, run.id, approval.authorizationId);
  expect(await service.claimNext('funded')).toMatchObject({ executionId: run.id });
});

it('expõe contexto e histórico públicos para recuperar o trabalho sem checkpoint privado', async () => {
  const f = await fixture();
  const run = await f.service.startExecution(owner, 'public-recovery', input);
  const view = await f.service.getExecution(owner, run.id);
  expect(view).toMatchObject({ context: input.context, messages: [{ role: 'USER', text: input.objective }] });
  expect(view).not.toHaveProperty('checkpoint');
  expect(view).not.toHaveProperty('provider');
});
it('preserva acesso às entregas anteriores do mesmo diálogo', async () => {
  const f = await fixture();
  const first = await f.service.startExecution(owner, 'history-first', input);
  const lease = await f.service.claimNext('history-worker');
  await f.service.finishStep(lease!, null, { kind: 'completed', checkpoint: {}, deliveryIds: ['first-delivery'] });
  const next = await f.service.startExecution(owner, 'history-next', {
    objective: 'Redigir a partir da análise',
    conversationId: first.conversationId,
  });
  expect(next.history).toContainEqual(
    expect.objectContaining({ executionId: first.id, deliveryIds: ['first-delivery'] }),
  );
});

it('corrigir resposta preserva histórico e cria sucessora sem herdar orçamento', async () => {
  const f = await fixture();
  const run = await f.service.startExecution(owner, 'correction-start', input);
  const lease = await f.service.claimNext('question-worker');
  await f.service.finishStep(lease!, null, { kind: 'question', checkpoint: {}, question });
  const next = await f.service.answerExecution(owner, run.id, 'first-answer', {
    questionId: 'purpose',
    questionVersion: 1,
    contextRevision: 1,
    selectedOptionIds: ['research'],
  });
  const lease2 = await f.service.claimNext('completion-worker');
  await f.service.finishStep(lease2!, null, { kind: 'completed', checkpoint: {} });
  const corrected = await f.service.correctAnswer(owner, next.id, 'correction', {
    questionId: 'purpose',
    questionVersion: 1,
    contextRevision: next.contextRevision,
    selectedOptionIds: [],
    freeText: 'Preciso revisar o texto',
  });
  expect(corrected.id).not.toBe(next.id);
  expect(corrected.contextRevision).toBeGreaterThan(next.contextRevision);
  expect((await f.repo.getExecution(owner, corrected.id))?.authorizationId).toBeNull();
  expect((await f.repo.getConversation(owner, run.conversationId))?.messages.filter((m) => m.answer)).toHaveLength(2);
});

async function withDocument() {
  const f = await fixture(),
    matters = new MatterRepository(f.db);
  const matter = await matters.createMatter({ ...owner, title: 'Caso sintético', createdBy: owner.userId });
  const source = await matters.ingestTextDocument({
    ...owner,
    matterId: matter.id,
    createdBy: owner.userId,
    title: 'Fonte',
    originalFilename: 'source.txt',
    mimeType: 'text/plain',
    content: 'Texto sintético',
  });
  const run = await f.service.startExecution(owner, 'document-run', {
    objective: 'Analisar',
    matterId: matter.id,
    context: {
      text: '',
      origin: 'DOCUMENT',
      documents: [{ documentId: source.document.id, versionId: source.version.id }],
    },
  });
  return { ...f, matter, source, run };
}
describe('comandos e worker duráveis', () => {
  it('revalida lifecycle entre planejamento e dispatch', async () => {
    const f = await withDocument(),
      lease = (await f.service.claimNext('worker'))!;
    await f.service.driverContext(lease);
    await f.client.execute({ sql: "UPDATE matters SET lifecycle_state='ARCHIVED' WHERE id=?", args: [f.matter.id] });
    await expect(f.service.beginStep(lease, 'after-revocation')).rejects.toThrow('ACCESS_REVOKED');
    expect(
      (await f.client.execute({ sql: 'SELECT id FROM agentic_execution_calls WHERE execution_id=?', args: [f.run.id] }))
        .rows,
    ).toHaveLength(0);
  });
  it('snapshot não revela pergunta após revogação do documento', async () => {
    const f = await withDocument();
    await new ExecutionWorker(f.service, {
      next: () => ({ callId: 'ask', run: async () => ({ kind: 'question', question, checkpoint: {} }) }),
    }).runOnce();
    await f.client.execute({
      sql: "UPDATE legal_documents SET lifecycle_state='ARCHIVED' WHERE id=?",
      args: [f.source.document.id],
    });
    await expect(f.service.getExecution(owner, f.run.id)).rejects.toThrow('ACCESS_REVOKED');
  });
  it('revalida documentos antes de gravar resultado recebido durante revogação', async () => {
    const f = await withDocument(),
      lease = (await f.service.claimNext('worker'))!;
    await f.service.beginStep(lease, 'in-flight');
    await f.client.execute({
      sql: "UPDATE legal_documents SET lifecycle_state='ARCHIVED' WHERE id=?",
      args: [f.source.document.id],
    });
    await expect(
      f.service.finishStep(lease, 'in-flight', {
        kind: 'completed',
        checkpoint: {},
        deliveryIds: ['forbidden-delivery'],
      }),
    ).rejects.toThrow('ACCESS_REVOKED');
    expect((await f.repo.getExecution(owner, f.run.id))?.deliveryIds).toEqual([]);
  });
  it('limpeza persiste até devolver a sobra de chamada liquidada depois do cancelamento', async () => {
    const f = await fixture();
    await new LedgerService(f.db, f.client).provisionAccount(owner.tenantId, {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });
    const run = await f.service.startExecution(owner, 'start', input),
      raw = (await f.repo.getExecution(owner, run.id))!;
    await f.client.execute({
      sql: 'UPDATE agentic_executions SET payload_json=? WHERE id=?',
      args: [JSON.stringify({ ...raw, authorizationId: 'synthetic-consent' }), run.id],
    });
    const budget = new BudgetService(f.db, f.client);
    await budget.reserveExecutionBudget({
      ...owner,
      executionId: run.id,
      maxCostCents: 60,
      idempotencyKey: 'budget',
      policy: {
        id: 'synthetic',
        version: '1',
        approvalReference: 'fixture-only',
        provider: 'fake',
        model: 'fake',
        maxCalls: 2,
        maxInputTokens: 1000,
        maxOutputTokens: 1000,
        inputCentsPerMillion: 10000,
        outputCentsPerMillion: 10000,
      },
    });
    const lease = (await f.service.claimNext('worker'))!;
    await f.service.beginStep(lease, 'provider');
    await budget.authorizeProviderCall(owner, run.id, {
      callId: 'provider',
      upperBoundCents: 20,
      inputTokens: 1000,
      maxOutputTokens: 1000,
    });
    await f.service.cancelExecution(owner, run.id, 'cancel');
    await budget.settleProviderCall(owner, run.id, {
      callId: 'provider',
      usage: { provider: 'fake', model: 'fake', inputTokens: 500, outputTokens: 500 },
      actualCostCents: 10,
    });
    f.advance(30001);
    await new ExecutionWorker(new ExecutionService(f.db, f.client, f.options)).runOnce();
    expect(await new LedgerService(f.db, f.client).getAvailableBalanceCents(owner.tenantId)).toBe(90);
    expect((await f.service.store.getJob(owner, run.id)).budgetReleasePending).toBe(false);
  });
  it('pendências de liberação com falha não monopolizam o lote de cinquenta', async () => {
    const f = await fixture(),
      base = await f.service.startExecution(owner, 'base', input);
    await f.service.cancelExecution(owner, base.id, 'cancel-base');
    const raw = (await f.repo.getExecution(owner, base.id))!,
      ids = Array.from({ length: 51 }, () => randomUUID());
    await f.db.insert(agenticExecutions).values(
      ids.map((id, i) => ({
        id,
        ...owner,
        conversationId: base.conversationId,
        idempotencyKey: `fixture-${i}`,
        inputHash: 'fixture',
        eventSequence: 0,
        payloadJson: JSON.stringify({ ...raw, id, status: 'FAILED', idempotencyKey: `fixture-${i}` }),
      })),
    );
    await f.db.insert(agenticExecutionJobs).values(
      ids.map((id) => ({
        executionId: id,
        ...owner,
        state: 'FAILED',
        leaseExpiresAt: null,
        budgetReleasePending: 1,
        createdAt: new Date(100000).toISOString(),
        payloadJson: JSON.stringify({
          ...owner,
          executionId: id,
          objective: 'synthetic',
          state: 'FAILED',
          leaseToken: null,
          leaseExpiresAt: null,
          workerId: null,
          pendingCallId: null,
          budgetReleasePending: true,
          createdAt: new Date(100000).toISOString(),
        }),
      })),
    );
    const seen: string[] = [];
    vi.spyOn(
      (f.service as unknown as { budget: InferenceBudgetService }).budget,
      'releaseUnusedBudget',
    ).mockImplementation(async (_owner, id) => {
      seen.push(id);
      if (id !== ids[50]) throw new Error('temporary');
      return { status: 'RELEASED' } as never;
    });
    await f.service.claimNext('retry-one');
    await f.service.claimNext('retry-two');
    expect(seen).toContain(ids[50]);
  });
  it('continuação explícita cria uma sucessora a partir do checkpoint confirmado, sem repetir o passo anterior', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    const lease = (await f.service.claimNext('first-worker'))!;
    await f.service.beginStep(lease, 'first');
    await f.service.finishStep(lease, 'first', {
      kind: 'checkpoint',
      checkpoint: { step: 1 },
      deliveryIds: ['previous-partial'],
    });
    await f.service.cancelExecution(owner, run.id, 'cancel');
    const next = await f.service.continueFromCheckpoint(owner, run.id, 'continue');
    expect((await f.service.continueFromCheckpoint(owner, run.id, 'continue')).id).toBe(next.id);
    let calls = 0;
    await new ExecutionWorker(f.service, {
      next: ({ execution }) => {
        expect(execution.checkpoint).toEqual({ step: 1 });
        return {
          callId: 'next',
          run: async () => {
            calls++;
            return { kind: 'completed', checkpoint: { step: 2 } };
          },
        };
      },
    }).runOnce();
    expect(calls).toBe(1);
    expect((await f.service.getExecution(owner, next.id)).status).toBe('COMPLETED');
    expect((await f.repo.getExecution(owner, run.id))?.deliveryIds).toEqual(['previous-partial']);
    expect((await f.repo.getExecution(owner, next.id))?.authorizationId).toBeNull();
  });
  it('tenta novamente liberação de saldo que falhou, mesmo após recriar serviço/worker', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    const budget = (f.service as unknown as { budget: InferenceBudgetService }).budget;
    vi.spyOn(budget, 'releaseUnusedBudget').mockRejectedValueOnce(new Error('temporary-storage-failure'));
    await new ExecutionWorker(f.service, {
      next: () => ({ callId: 'done', run: async () => ({ kind: 'completed' as const, checkpoint: {} }) }),
    }).runOnce();
    const recovered = new ExecutionService(f.db, f.client, f.options);
    const release = vi
      .spyOn((recovered as unknown as { budget: InferenceBudgetService }).budget, 'releaseUnusedBudget')
      .mockResolvedValueOnce({ status: 'RELEASED' } as never);
    f.advance(30001);
    await new ExecutionWorker(recovered).runOnce();
    expect(release).toHaveBeenCalledTimes(1);
    expect((await recovered.getExecution(owner, run.id)).status).toBe('COMPLETED');
  });
  it('encerra trabalho cujo caso foi arquivado e não executa nem expõe contexto revogado', async () => {
    const f = await fixture();
    const matter = await new MatterRepository(f.db).createMatter({
      ...owner,
      title: 'Caso sintético',
      createdBy: owner.userId,
    });
    const run = await f.service.startExecution(owner, 'start-case', { ...input, matterId: matter.id });
    await f.client.execute({ sql: "UPDATE matters SET lifecycle_state='ARCHIVED' WHERE id=?", args: [matter.id] });
    let calls = 0;
    await new ExecutionWorker(f.service, {
      next: () => ({
        callId: 'forbidden',
        run: async () => {
          calls++;
          return { kind: 'completed' as const, checkpoint: {} };
        },
      }),
    }).runOnce();
    expect(calls).toBe(0);
    expect((await f.repo.getExecution(owner, run.id))?.status).toBe('FAILED');
    await expect(f.service.listClientEvents(owner, run.id, 0)).rejects.toThrow('ACCESS_REVOKED');
  });
  it('driver não pode falsificar status público usando eventos internos', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    await new ExecutionWorker(f.service, {
      next: () => ({
        callId: 'bad-status',
        run: async () => ({
          kind: 'checkpoint' as const,
          checkpoint: {},
          events: [{ type: 'STATUS', payload: { status: 'COMPLETED' } }],
        }),
      }),
    }).runOnce();
    expect((await f.repo.listEventsAfter(owner, run.id, 0)).some((e) => e.payload.status === 'COMPLETED')).toBe(false);
  });
  it('início idempotente não duplica conversa e rejeita payload divergente', async () => {
    const f = await fixture();
    const a = await f.service.startExecution(owner, 'start', input);
    const b = await new ExecutionService(f.db, f.client, f.options).startExecution(owner, 'start', input);
    expect(b.id).toBe(a.id);
    expect((await f.client.execute('SELECT id FROM agentic_conversations')).rows).toHaveLength(1);
    await expect(f.service.startExecution(owner, 'start', { ...input, objective: 'Outro' })).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
  });
  it('checkpoint e eventos persistem; duas instâncias não executam o mesmo passo', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    let calls = 0;
    const driver = {
      next: () => ({
        callId: 'one',
        run: async () => {
          calls++;
          return { kind: 'completed' as const, checkpoint: { step: 1 }, deliveryIds: ['partial'] };
        },
      }),
    };
    const a = new ExecutionWorker(f.service, driver),
      b = new ExecutionWorker(new ExecutionService(f.db, f.client, f.options), driver);
    await a.runOnce();
    await b.runOnce();
    expect(calls).toBe(1);
    expect(await f.service.getExecution(owner, run.id)).toMatchObject({
      status: 'COMPLETED',
      deliveryIds: ['partial'],
    });
    expect((await f.repo.getExecution(owner, run.id))?.checkpoint).toEqual({ step: 1 });
    const count = (await f.repo.listEventsAfter(owner, run.id, 0)).length;
    await f.service.listClientEvents(owner, run.id, 0);
    await f.service.listClientEvents(owner, run.id, 1);
    expect(calls).toBe(1);
    expect(await f.repo.listEventsAfter(owner, run.id, 0)).toHaveLength(count);
  });
  it('resposta selecionada/livre cria sucessora uma vez e preserva histórico', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    await new ExecutionWorker(f.service, {
      next: () => ({
        callId: 'ask',
        run: async () => ({ kind: 'question' as const, question, checkpoint: { awaiting: 'purpose' } }),
      }),
    }).runOnce();
    const answer = {
      questionId: question.id,
      questionVersion: 1,
      contextRevision: 1,
      selectedOptionIds: ['research'],
      freeText: 'Complemento',
    };
    const next = await f.service.answerExecution(owner, run.id, 'answer', answer);
    expect((await f.service.answerExecution(owner, run.id, 'answer', answer)).id).toBe(next.id);
    expect(next.id).not.toBe(run.id);
    expect(next.contextRevision).toBe(2);
    expect((await f.repo.getExecution(owner, next.id))?.checkpoint).toBeNull();
    expect((await f.repo.getConversation(owner, run.conversationId))?.messages.filter((m) => m.answer)).toHaveLength(1);
    await expect(f.service.answerExecution(owner, run.id, 'different-key', answer)).rejects.toThrow('QUESTION_EXPIRED');
  });
  it('cancelamento preserva entrega parcial e não inicia o próximo passo', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    let calls = 0,
      signalStarted!: () => void,
      unblock!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const worker = new ExecutionWorker(f.service, {
      next: ({ execution }) =>
        !execution.checkpoint
          ? {
              callId: 'first',
              run: async () => ({ kind: 'checkpoint' as const, checkpoint: { step: 1 }, deliveryIds: ['partial'] }),
            }
          : {
              callId: 'second',
              run: async () => {
                calls++;
                signalStarted();
                await gate;
                return { kind: 'checkpoint' as const, checkpoint: { step: 2 } };
              },
            },
    });
    const running = worker.runOnce();
    await started;
    await f.service.cancelExecution(owner, run.id, 'cancel');
    await f.service.cancelExecution(owner, run.id, 'cancel');
    unblock();
    await running;
    expect(calls).toBe(1);
    expect(await f.service.getExecution(owner, run.id)).toMatchObject({
      status: 'CANCELLED',
      deliveryIds: ['partial'],
    });
  });
  it('recuperação de lease sem chamada em trânsito retoma checkpoint seguro', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    await f.service.claimNext('lost-worker', 100);
    f.advance(101);
    let calls = 0;
    const nextService = new ExecutionService(f.db, f.client, f.options);
    await new ExecutionWorker(nextService, {
      next: () => ({
        callId: 'safe',
        run: async () => {
          calls++;
          return { kind: 'completed' as const, checkpoint: { done: true } };
        },
      }),
    }).runOnce();
    expect(calls).toBe(1);
    expect((await nextService.getExecution(owner, run.id)).status).toBe('COMPLETED');
  });
  it('reconcilia dispatch incerto após reinício, sem repetir callback nem continuar cegamente', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    const lease = (await f.service.claimNext('lost', 100))!;
    await f.service.beginStep(lease, 'uncertain');
    f.advance(101);
    let calls = 0;
    const recovered = new ExecutionService(f.db, f.client, f.options);
    await new ExecutionWorker(recovered, {
      next: () => ({
        callId: 'uncertain',
        run: async () => {
          calls++;
          return { kind: 'completed' as const, checkpoint: {} };
        },
      }),
    }).runOnce();
    expect(calls).toBe(0);
    expect((await recovered.getExecution(owner, run.id)).status).toBe('FAILED');
    await expect(recovered.continueFromCheckpoint(owner, run.id, 'continue')).rejects.toThrow(
      'RECONCILIATION_REQUIRED',
    );
  });
  it('isola tenant/usuário e não entrega checkpoint ou dados internos no snapshot público', async () => {
    const f = await fixture();
    const run = await f.service.startExecution(owner, 'start', input);
    for (const stranger of [
      { ...owner, userId: 'other' },
      { ...owner, tenantId: 'other' },
    ]) {
      await expect(f.service.getExecution(stranger, run.id)).rejects.toThrow('NOT_FOUND');
      await expect(f.service.cancelExecution(stranger, run.id, 'cancel')).rejects.toThrow('NOT_FOUND');
    }
    expect(JSON.stringify(run)).not.toMatch(/authorizationId|checkpoint|provider|policy|allowedTools/);
  });
});

it('vincula autorização interna ao contexto vigente sem expor consentimento na API pública', async () => {
  const f = await fixture();
  const run = await f.service.startExecution(owner, 'internal-approval', input);
  await f.service.authorizeInference(owner, run.id, {
    authorizationId: 'boni-task6',
    provider: 'openai',
    model: 'gpt-6.1-sol',
  });
  expect(await f.repo.getExecution(owner, run.id)).toMatchObject({
    authorizationId: 'boni-task6',
    provider: 'openai',
    model: 'gpt-6.1-sol',
  });
  expect(await f.service.getExecution(owner, run.id)).not.toHaveProperty('authorizationId');
  await expect(
    f.service.authorizeInference(owner, run.id, { authorizationId: 'other', provider: 'openai', model: 'other' }),
  ).rejects.toThrow('EXECUTION_CONFLICT');
});

it('falha de liquidação do orçamento é registrada sem dados livres e a limpeza permanece pendente', async () => {
  const f = await fixture();
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
  try {
    const service = new ExecutionService(f.db, f.client, {
      ...f.options,
      finalizeExecution: async () => {
        throw new Error('connection refused to ledger.internal:5432');
      },
    });
    const run = await service.startExecution(owner, 'finalize-fails', input);
    await service.cancelExecution(owner, run.id, 'finalize-fails-cancel');
    const job = await service.store.getJob(owner, run.id);
    expect(job.budgetReleasePending).toBe(true);
    expect(job.budgetReleaseNextAt).toBeTruthy();
    const logged = writes.map((line) => JSON.parse(line)).find((l) => l.message === 'agentic.budget_release.failed');
    expect(logged).toMatchObject({
      level: 'error',
      executionId: run.id,
      tenantId: owner.tenantId,
      errorCode: 'UNEXPECTED_ERROR',
    });
    expect(writes.join('')).not.toContain('ledger.internal');
  } finally {
    spy.mockRestore();
  }
});
