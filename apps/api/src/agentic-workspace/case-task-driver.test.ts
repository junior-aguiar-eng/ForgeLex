import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  AgenticWorkspaceRepository,
} from '@forgelex/persistence';
import { InferenceBudgetService, LedgerService } from '@forgelex/billing-ledger';
import { createFixtureResearchService } from '@forgelex/legal-tools';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { registerAgenticWorkspace } from './execution-routes.js';

const owner = { tenantId: 'native-task', userId: 'author' },
  headers = { authorization: 'Bearer owner', 'idempotency-key': 'start' };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const run of cleanup.splice(0)) await run();
});
async function fixture(research = false, ask = false) {
  const c = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 100, promotionalBalanceCents: 0 });
  const auth = new AuthAdapter({
    verify: async (token) =>
      token === 'owner' || token === 'other' || token === 'research-only'
        ? {
            ...owner,
            userId: token === 'other' ? 'other' : owner.userId,
            authMethod: 'session',
            subjectId: token,
            roles: ['lawyer'],
            scopes: token === 'research-only' ? ['research:read'] : ['research:read', 'matter:read', 'matter:write'],
          }
        : null,
  });
  const roles: string[] = [],
    seenAnswers: any[] = [];
  const app = Fastify();
  const runtime = registerAgenticWorkspace(app, {
    database: c.db,
    client: c.client,
    auth,
    environment: { FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' },
    options: {
      scheduler: false,
      caseTask: {
        authorizeNative: async () => {},
        researchService: createFixtureResearchService(),
        createProvider: ({ role, registry, packet }: any) => {
          roles.push(role);
          seenAnswers.push(packet.answers);
          const sourceId = packet.sources[0]?.id;
          const plan = {
            action: research ? 'research_question' : ask ? 'create_document' : 'analyze_documents',
            requiresCaseLaw: research,
            requiresNorms: false,
            requiresProcedure: ask,
            issues: [{ id: 'goal', statement: 'Objetivo', sourceIds: sourceId ? [sourceId] : [] }],
            gaps:
              ask && !packet.answers.length
                ? [
                    {
                      key: 'purpose',
                      kind: 'MISSING',
                      material: true,
                      prompt: 'Qual finalidade você procura?',
                      reason: 'Delimitar a necessidade',
                      sourceIds: [],
                      options: [{ id: 'investigate', label: 'Investigar a medida adequada' }],
                    },
                  ]
                : [],
          };
          const result = {
            coveredIssueIds: ['goal'],
            claims: [],
            requirements: [],
            findings: [],
            supportChecks: [],
            ...(role === 'legal-drafter'
              ? {
                  document: {
                    title: 'Proposta preliminar',
                    documentType: 'Medida a investigar',
                    sections: [{ title: 'Contexto', content: 'Alegação fornecida.', sourceIds: [sourceId] }],
                  },
                }
              : {}),
          };
          return new FakeAgentProvider(registry, undefined, [
            ...(role === 'legal-researcher'
              ? [
                  {
                    thought: 'private',
                    toolCall: {
                      name: 'research.search_case_law',
                      input: { query: 'vazamento', court: 'STJ', limit: 1 },
                    },
                  },
                ]
              : []),
            {
              thought: 'private',
              toolCall: { name: 'task.submit', input: role === 'legal-orchestrator' ? plan : result },
            },
          ]);
        },
      },
    } as any,
  })!;
  await app.ready();
  cleanup.push(async () => {
    await runtime.worker?.stop();
    await app.close();
    c.client.close();
  });
  return { ...c, app, ...runtime, ledger, roles, seenAnswers };
}
describe('driver jurídico integrado ao serviço durável', () => {
  it('sem reserva não realiza pesquisa paga nem altera saldo', async () => {
    const f = await fixture(true);
    const run = (
      await f.app.inject({
        method: 'POST',
        url: '/api/agentic/executions',
        headers,
        payload: {
          objective: 'Pesquisar',
          actionId: 'research_question',
          context: { text: 'Questão', origin: 'USER', documents: [] },
        },
      })
    ).json();
    await f.worker!.runOnce();
    expect((await f.service!.getExecution(owner, run.id)).status).toBe('FAILED');
    expect((await f.service!.listClientEvents(owner, run.id, 0)).events).toContainEqual(
      expect.objectContaining({
        type: 'ERROR',
        payload: { code: 'RECONCILIATION_REQUIRED', reason: 'BUDGET_EXHAUSTED' },
      }),
    );
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(100);
    expect((await f.client.execute('SELECT id FROM billing_operations')).rows).toHaveLength(0);
  });
  it('executa especialistas, persiste entrega e retorna somente projeção pública ao proprietário', async () => {
    const f = await fixture();
    const run = (
      await f.app.inject({
        method: 'POST',
        url: '/api/agentic/executions',
        headers,
        payload: {
          objective: 'Analisar',
          actionId: 'analyze_documents',
          context: { text: 'Informação fornecida', origin: 'USER', documents: [] },
        },
      })
    ).json();
    await f.worker!.runOnce();
    const status = (await f.app.inject({ method: 'GET', url: `/api/agentic/executions/${run.id}`, headers })).json();
    expect(status.status).toBe('COMPLETED');
    expect(status.deliveryIds).toHaveLength(1);
    expect(f.roles).toEqual(['legal-orchestrator', 'matter-analyst']);
    const response = await f.app.inject({
      method: 'GET',
      url: `/api/agentic/deliveries/${encodeURIComponent(status.deliveryIds[0])}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().delivery.humanReviewRequired).toBe(true);
    expect(response.body).not.toMatch(/private|instructions|allowedTools|bindingHash|profiles/);
    expect(
      (
        await f.app.inject({
          method: 'GET',
          url: `/api/agentic/deliveries/${encodeURIComponent(status.deliveryIds[0])}`,
          headers: { authorization: 'Bearer other' },
        })
      ).statusCode,
    ).toBe(404);
  });
  it('resposta desconhecida cria sucessora e entrega limitada sem presumir cabimento', async () => {
    const f = await fixture(false, true);
    const matter = await new MatterRepository(f.db).createMatter({ ...owner, title: 'Caso', createdBy: owner.userId });
    const run = (
      await f.app.inject({
        method: 'POST',
        url: '/api/agentic/executions',
        headers,
        payload: {
          objective: 'Preciso de um texto',
          actionId: 'create_document',
          matterId: matter.id,
          context: { text: 'Contexto escrito', origin: 'USER', documents: [] },
        },
      })
    ).json();
    await f.worker!.runOnce();
    const waiting = await f.service!.getExecution(owner, run.id);
    expect(waiting.status).toBe('WAITING_USER');
    const next = (
      await f.app.inject({
        method: 'POST',
        url: `/api/agentic/executions/${run.id}/answers`,
        headers: { ...headers, 'idempotency-key': 'answer' },
        payload: {
          questionId: waiting.question!.id,
          questionVersion: 1,
          contextRevision: 1,
          selectedOptionIds: [],
          unknown: true,
        },
      })
    ).json();
    await f.worker!.runOnce();
    const done = await f.service!.getExecution(owner, next.id);
    expect(done.status).toBe('COMPLETED');
    expect(f.seenAnswers.some((a) => a[0]?.unknown)).toBe(true);
    const url = `/api/agentic/deliveries/${encodeURIComponent(done.deliveryIds[0])}`;
    const delivery = (await f.app.inject({ method: 'GET', url, headers })).json();
    expect(delivery.delivery.status).toBe('LIMITED');
    expect(delivery.draftId).toBeTruthy();
    expect(
      (await f.app.inject({ method: 'GET', url, headers: { authorization: 'Bearer research-only' } })).statusCode,
    ).toBe(403);
  });
  it('pesquisa reutiliza reserva da Tarefa2 e cobra uma vez, sem reexecutar ao reler', async () => {
    const f = await fixture(true);
    const run = (
      await f.app.inject({
        method: 'POST',
        url: '/api/agentic/executions',
        headers,
        payload: {
          objective: 'Pesquisar vazamento',
          actionId: 'research_question',
          context: { text: 'Questão sintética', origin: 'USER', documents: [] },
        },
      })
    ).json();
    const budget = new InferenceBudgetService(f.db, f.client);
    const reservation = {
      ...owner,
      executionId: run.id,
      maxCostCents: 60,
      idempotencyKey: 'synthetic-budget',
      policy: {
        id: 'fixture',
        version: '1',
        approvalReference: 'synthetic-only',
        provider: 'fake',
        model: 'fake',
        maxCalls: 10,
        maxInputTokens: 1000,
        maxOutputTokens: 1000,
        inputCentsPerMillion: 1,
        outputCentsPerMillion: 1,
      },
    };
    await expect(budget.reserveExecutionBudget(reservation)).rejects.toThrow('EXECUTION_NOT_AUTHORIZED');
    // Explicit fixture consent, never an authorization supplied by the native endpoint/model.
    const persisted = await new AgenticWorkspaceRepository(f.db).getExecution(owner, run.id);
    await f.client.execute({
      sql: 'UPDATE agentic_executions SET payload_json=? WHERE id=?',
      args: [JSON.stringify({ ...persisted, authorizationId: 'synthetic-consent' }), run.id],
    });
    await budget.reserveExecutionBudget(reservation);
    await f.worker!.runOnce();
    const done = await f.service!.getExecution(owner, run.id);
    expect(done.status).toBe('COMPLETED');
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(80);
    const record = (
      await f.app.inject({
        method: 'GET',
        url: `/api/agentic/deliveries/${encodeURIComponent(done.deliveryIds[0])}`,
        headers,
      })
    ).json();
    expect(record.delivery.sources.some((s: any) => s.kind === 'AUTHORITY')).toBe(true);
    expect(record.delivery.findings.map((f: any) => f.code)).not.toContain('SOURCE_UNAVAILABLE');
    const before = f.roles.length;
    await f.service!.listClientEvents(owner, run.id, 0);
    await f.service!.getExecution(owner, run.id);
    expect(f.roles).toHaveLength(before);
    expect((await f.client.execute("SELECT id FROM billing_operations WHERE status='COMPLETED'")).rows).toHaveLength(1);
  });
});
