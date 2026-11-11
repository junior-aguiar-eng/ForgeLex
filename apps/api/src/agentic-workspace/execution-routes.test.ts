import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
  MatterRepository,
  agenticExecutions,
  agenticExecutionJobs,
  agenticExecutionCalls,
} from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { buildApp } from '../app.js';
import { registerAgenticWorkspace } from './execution-routes.js';
import type { ExecutionDriver } from './execution-worker.js';

const owner = { tenantId: 'routes', userId: 'author' };
const principal: AuthenticatedPrincipal = {
  ...owner,
  subjectId: 'subject',
  roles: ['lawyer'],
  scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'billing:read'],
  authMethod: 'session',
};
const headers = { authorization: 'Bearer session', 'idempotency-key': 'start' };
const input = { objective: 'Pesquisar', context: { text: 'Somente texto do usuário', origin: 'USER', documents: [] } };
const question = {
  id: 'q',
  version: 1,
  contextRevision: 1,
  prompt: 'Qual finalidade?',
  selection: 'single' as const,
  options: [{ id: 'research', label: 'Pesquisar' }],
  allowFreeText: true,
  allowUnknown: true,
  reason: 'Delimitar',
};
const cleanups: (() => Promise<unknown>)[] = [];
async function fixture(driver?: ExecutionDriver) {
  const c = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.runMigrations();
  const auth = new AuthAdapter({
    verify: async (token) =>
      token === 'session'
        ? principal
        : token === 'research-only'
          ? { ...principal, scopes: ['research:read'] }
          : token === 'other'
            ? { ...principal, userId: 'other' }
            : token === 'key'
              ? { ...principal, authMethod: 'api_key' }
              : null,
  });
  const app = Fastify();
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', 'http://127.0.0.1:3300');
  });
  const runtime = registerAgenticWorkspace(app, {
    database: c.db,
    client: c.client,
    auth,
    environment: { FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true', FORGELEX_DESK_GUIDANCE_ENABLED: 'true' },
    options: { driver, scheduler: false, pollMs: 20 },
  })!;
  await app.ready();
  cleanups.push(async () => {
    await runtime.worker?.stop();
    await app.close();
    c.client.close();
  });
  return { ...c, app, auth, ledger, ...runtime };
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('orientação antes da execução', () => {
  const url = '/api/agentic/guidance';
  const command = () => ({ ...headers, 'idempotency-key': randomUUID() });
  const pick = (question: { id: string; version: number }, contextRevision: number, value?: string) => ({
    questionId: question.id,
    questionVersion: question.version,
    contextRevision,
    selectedOptionIds: value ? [value] : [],
    ...(!value ? { unknown: true } : {}),
  });

  it('recupera a pergunta ativa e repete comandos sem executar, mesmo depois de outra resposta', async () => {
    const next = vi.fn(() => {
      throw new Error('A orientação não deve chamar o driver');
    });
    const f = await fixture({ next });
    const start = { method: 'POST' as const, url, headers: command(), payload: { objective: 'Preparar pedido' } };
    const created = await f.app.inject(start);
    expect(created.statusCode).toBe(201);
    const initial = created.json();
    const path = `${url}/${initial.conversationId}`;
    expect(initial).toMatchObject({ contextRevision: 1, question: { allowUnknown: true } });
    expect(initial).not.toHaveProperty('guidanceHash');
    expect((await f.app.inject({ method: 'GET', url: path, headers })).json()).toEqual(initial);
    const first = {
      method: 'POST' as const,
      url: `${path}/answer`,
      headers: command(),
      payload: pick(initial.question, 1),
    };
    const answered = await f.app.inject(first);
    expect(answered.statusCode).toBe(200);
    const after = answered.json();
    expect(after).toMatchObject({ contextRevision: 2, decisions: { area: { value: null, status: 'unknown' } } });
    expect(after.question.id).not.toBe(initial.question.id);
    expect((await f.app.inject({ ...first, payload: pick(initial.question, 1, 'penal') })).statusCode).toBe(409);
    expect(
      (await f.app.inject({ ...first, headers: command(), payload: pick(after.question, 2, 'review_text') }))
        .statusCode,
    ).toBe(200);
    expect((await f.app.inject(first)).json()).toEqual(after);
    expect((await f.app.inject(start)).json()).toEqual(initial);
    expect((await f.app.inject({ ...start, payload: { objective: 'Outro pedido' } })).statusCode).toBe(409);
    await f.worker?.runOnce();
    expect(next).not.toHaveBeenCalled();
    expect(await f.db.select().from(agenticExecutions)).toHaveLength(0);
    expect(await f.db.select().from(agenticExecutionJobs)).toHaveLength(0);
    expect(await f.db.select().from(agenticExecutionCalls)).toHaveLength(0);
    expect((await f.client.execute('SELECT id FROM inference_budgets')).rows).toHaveLength(0);
  });

  it('preserva histórico e invalida a peça ao corrigir a área, rejeitando a outra aba', async () => {
    const f = await fixture();
    const created = await f.app.inject({ method: 'POST', url, headers: command(), payload: {} });
    expect(created.statusCode).toBe(201);
    const initial = created.json();
    const path = `${url}/${initial.conversationId}`;
    const submit = (state: typeof initial, value: string) =>
      f.app.inject({
        method: 'POST',
        url: `${path}/answer`,
        headers: command(),
        payload: pick(state.question, state.contextRevision, value),
      });
    const tabs = await Promise.all([submit(initial, 'penal'), submit(initial, 'penal')]);
    expect(tabs.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    const area = tabs.find(({ statusCode }) => statusCode === 200)!.json();
    const task = (await submit(area, 'create_document')).json();
    const piece = (await submit(task, 'resposta-acusacao')).json();
    expect(piece).toMatchObject({
      contextRevision: 4,
      question: null,
      decisions: { documentType: { value: 'resposta-acusacao' } },
    });
    const correction = {
      method: 'POST' as const,
      url: `${path}/correct`,
      headers: command(),
      payload: pick(initial.question, 4, 'civel'),
    };
    const corrections = await Promise.all([
      f.app.inject(correction),
      f.app.inject({ ...correction, headers: command() }),
    ]);
    expect(corrections.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    const corrected = corrections.find(({ statusCode }) => statusCode === 200)!;
    expect(corrected.json()).toMatchObject({
      contextRevision: 5,
      decisions: { area: { value: 'civel' }, action: { value: 'create_document' }, documentType: { value: null } },
    });
    expect((await f.app.inject({ ...correction, headers: command() })).statusCode).toBe(409);
    expect(
      (await f.app.inject({ ...correction, headers: command(), payload: pick(task.question, 5, 'resposta-acusacao') }))
        .statusCode,
    ).toBe(409);
    const repo = new AgenticWorkspaceRepository(f.db);
    const history = await repo.getConversation(owner, initial.conversationId);
    expect(history?.contexts[3]?.guidance?.documentType.value).toBe('resposta-acusacao');
    expect(history?.contexts[4]?.guidance?.documentType.value).toBeNull();
  });

  it('valida sessão, escopos, comando UUID e as opções da pergunta', async () => {
    const f = await fixture();
    const request = { method: 'POST' as const, url, payload: {} };
    expect((await f.app.inject({ ...request, headers })).statusCode).toBe(400);
    expect(
      (await f.app.inject({ ...request, headers: { ...command(), authorization: 'Bearer key' } })).statusCode,
    ).toBe(403);
    const matter = await new MatterRepository(f.db).createMatter({
      ...owner,
      title: 'Caso privado',
      createdBy: owner.userId,
    });
    const limited = { ...command(), authorization: 'Bearer research-only' };
    expect((await f.app.inject({ ...request, headers: limited, payload: { matterId: matter.id } })).statusCode).toBe(
      403,
    );
    const initial = (await f.app.inject({ ...request, headers: command(), payload: { matterId: matter.id } })).json();
    const path = `${url}/${initial.conversationId}`;
    expect(
      (await f.app.inject({ method: 'GET', url: path, headers: { authorization: 'Bearer other' } })).statusCode,
    ).toBe(404);
    expect((await f.app.inject({ method: 'GET', url: path, headers: limited })).statusCode).toBe(403);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `${path}/answer`,
          headers: command(),
          payload: pick(initial.question, 1, 'fora-da-lista'),
        })
      ).statusCode,
    ).toBe(400);
  });

  it('inicia a execução guiada apenas na revisão persistida informada', async () => {
    const f = await fixture({ next: () => undefined });
    const initial = (await f.app.inject({ method: 'POST', url, headers: command(), payload: {} })).json();
    const path = `${url}/${initial.conversationId}`;
    const answer = await f.app.inject({
      method: 'POST',
      url: `${path}/answer`,
      headers: command(),
      payload: pick(initial.question, 1, 'penal'),
    });
    expect(answer.statusCode).toBe(200);
    const submit = (contextRevision?: number) =>
      f.app.inject({
        method: 'POST',
        url: '/api/agentic/executions',
        headers: command(),
        payload: { objective: 'Preparar peça', conversationId: initial.conversationId, contextRevision },
      });
    expect((await submit()).statusCode).toBe(409);
    expect((await submit(1)).statusCode).toBe(409);
    const started = await submit(2);
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({ conversationId: initial.conversationId, contextRevision: 2 });
    expect(started.json().context).not.toHaveProperty('guidanceReceipt');
    expect(await f.db.select().from(agenticExecutionJobs)).toHaveLength(1);
  });
});

describe('rotas e transporte do trabalho', () => {
  it('capacidade de edição acompanha draft:write, não matter:write', async () => {
    const f = await fixture({ next: () => undefined });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    const response = await f.app.inject({ method: 'GET', url: `/api/agentic/executions/${run.id}`, headers });
    expect(response.json().permissions.editDraft).toBe(false);
  });
  it('escopo de pesquisa não concede leitura de conversa vinculada a caso', async () => {
    const f = await fixture({ next: () => undefined });
    const matter = await new MatterRepository(f.db).createMatter({
      ...owner,
      title: 'Caso privado',
      createdBy: owner.userId,
    });
    const payload = { ...input, matterId: matter.id };
    const run = (await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload })).json();
    const restricted = { authorization: 'Bearer research-only', 'idempotency-key': 'restricted' };
    expect(
      (await f.app.inject({ method: 'GET', url: `/api/agentic/executions/${run.id}`, headers: restricted })).statusCode,
    ).toBe(403);
    expect(
      (await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers: restricted, payload })).statusCode,
    ).toBe(403);
  });
  it('cancelar e continuar exigem chave idempotente e preservam uma única sucessora', async () => {
    const f = await fixture({ next: () => undefined });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    const url = `/api/agentic/executions/${run.id}`;
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `${url}/cancel`,
          headers: { authorization: headers.authorization },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    const cancel = {
      method: 'POST' as const,
      url: `${url}/cancel`,
      headers: { ...headers, 'idempotency-key': 'cancel' },
      payload: {},
    };
    expect((await f.app.inject(cancel)).json().status).toBe('CANCELLED');
    expect((await f.app.inject(cancel)).json().status).toBe('CANCELLED');
    const resume = {
      method: 'POST' as const,
      url: `${url}/continue`,
      headers: { ...headers, 'idempotency-key': 'continue' },
      payload: {},
    };
    const next = await f.app.inject(resume);
    expect(next.statusCode).toBe(202);
    expect((await f.app.inject(resume)).json().id).toBe(next.json().id);
  });
  it.each([false, true])('flag desligada preserva REST/MCP (leitor=%s) e não registra rotas novas', async (reader) => {
    const f = await fixture();
    const app = await buildApp({
      database: f.db,
      databaseClient: f.client,
      ledgerService: f.ledger,
      authAdapter: f.auth,
      environment: { NODE_ENV: 'test', FORGELEX_MCP_DECISION_UI_ENABLED: reader ? 'true' : 'false' },
    });
    cleanups.push(() => app.close());
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })).statusCode,
    ).toBe(404);
    const tools = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers,
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(tools.statusCode).toBe(200);
    expect(tools.json().result.tools).toHaveLength(reader ? 10 : 9);
    expect(tools.json().result.tools.map((tool: { name: string }) => tool.name)).toContain('case.save_analysis');
  });
  it('sem executor configurado falha antes de guardar contexto ou simular trabalho', async () => {
    const f = await fixture();
    const response = await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('EXECUTOR_UNAVAILABLE');
    expect((await f.client.execute('SELECT id FROM agentic_conversations')).rows).toHaveLength(0);
  });
  it.each(['selected', 'free_text'] as const)(
    'autentica início e resposta %s idempotentes; isola outra conta',
    async (mode) => {
      const f = await fixture({
        next: () => ({
          callId: 'ask',
          run: async () => ({ kind: 'question', question, checkpoint: { awaiting: 'q' } }),
        }),
      });
      expect((await f.app.inject({ method: 'POST', url: '/api/agentic/executions', payload: input })).statusCode).toBe(
        401,
      );
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/agentic/executions',
            headers: { ...headers, authorization: 'Bearer key' },
            payload: input,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/agentic/executions',
            headers: { authorization: headers.authorization },
            payload: input,
          })
        ).statusCode,
      ).toBe(400);
      const first = await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input });
      expect(first.statusCode).toBe(202);
      const run = first.json();
      expect(
        (await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })).json().id,
      ).toBe(run.id);
      expect(
        (
          await f.app.inject({
            method: 'GET',
            url: `/api/agentic/executions/${run.id}`,
            headers: { authorization: 'Bearer other' },
          })
        ).statusCode,
      ).toBe(404);
      await f.worker!.runOnce();
      const answer = {
        questionId: 'q',
        questionVersion: 1,
        contextRevision: 1,
        selectedOptionIds: mode === 'selected' ? ['research'] : [],
        ...(mode === 'free_text' ? { freeText: 'Outro recorte' } : {}),
      };
      const request = {
        method: 'POST' as const,
        url: `/api/agentic/executions/${run.id}/answers`,
        headers: { ...headers, 'idempotency-key': 'answer' },
        payload: answer,
      };
      const next = await f.app.inject(request);
      expect(next.statusCode).toBe(202);
      expect((await f.app.inject(request)).json().id).toBe(next.json().id);
    },
  );
  it('SSE projeta allowlist e reconecta pelo cursor sem executar ferramentas novamente', async () => {
    let calls = 0;
    const f = await fixture({
      next: () => ({
        callId: 'one',
        run: async () => {
          calls++;
          return {
            kind: 'completed',
            checkpoint: { internalPrompt: 'private-checkpoint' },
            deliveryIds: ['delivery'],
            events: [
              {
                type: 'INTERNAL',
                payload: { prompt: 'private-prompt', arguments: 'private-arguments', contracts: 'private-contracts' },
              },
            ],
          };
        },
      }),
    });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    await f.worker!.runOnce();
    for (const after of [0, 1, 99]) {
      const response = await f.app.inject({
        method: 'GET',
        url: `/api/agentic/executions/${run.id}/events?after=${after}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3300');
      expect(response.body).not.toMatch(/private-prompt|private-arguments|private-contracts|private-checkpoint/);
      if (after === 99) expect(response.body).not.toContain('data:');
    }
    expect(calls).toBe(1);
    const invalid = await f.app.inject({
      method: 'GET',
      url: `/api/agentic/executions/${run.id}/events?access_token=not-allowed`,
      headers,
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).not.toContain('not-allowed');
  });
  it('SSE terminal escoa todos os lotes, inclusive entrega após mais de cem eventos internos', async () => {
    const f = await fixture({
      next: () => ({
        callId: 'many',
        run: async () => ({
          kind: 'completed',
          checkpoint: {},
          deliveryIds: ['last-delivery'],
          events: Array.from({ length: 100 }, (_, i) => ({ type: 'INTERNAL', payload: { i } })),
        }),
      }),
    });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    await f.worker!.runOnce();
    const response = await f.app.inject({
      method: 'GET',
      url: `/api/agentic/executions/${run.id}/events?after=0`,
      headers,
    });
    expect(response.body).toContain('last-delivery');
    expect(response.body).toContain('"status":"COMPLETED"');
  });
  it('desconectar o browser não cancela o worker nem apaga entrega parcial', async () => {
    let signalStarted!: () => void, unblock!: () => void;
    const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        unblock = resolve;
      });
    const f = await fixture({
      next: () => ({
        callId: 'network',
        run: async () => {
          signalStarted();
          await gate;
          return { kind: 'completed', checkpoint: { done: true }, deliveryIds: ['partial'] };
        },
      }),
    });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    const running = f.worker!.runOnce();
    await started;
    const address = await f.app.listen({ port: 0, host: '127.0.0.1' }),
      controller = new AbortController();
    const response = await fetch(`${address}/api/agentic/executions/${run.id}/events?after=0`, {
      headers: { authorization: headers.authorization },
      signal: controller.signal,
    });
    await response.body!.getReader().read();
    controller.abort();
    expect((await new AgenticWorkspaceRepository(f.db).getExecution(owner, run.id))?.status).toBe('RUNNING');
    unblock();
    await running;
    expect((await f.service!.getExecution(owner, run.id)).deliveryIds).toEqual(['partial']);
  });
});

async function streamWithVerifier(verifyStream: (call: number) => boolean) {
  const c = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(c.client);
  let calls = 0;
  const auth = new AuthAdapter({
    verify: async (token) => {
      if (token !== 'stream') return token === 'session' ? principal : null;
      return verifyStream(++calls) ? principal : null;
    },
  });
  const app = Fastify();
  registerAgenticWorkspace(app, {
    database: c.db,
    client: c.client,
    auth,
    environment: { FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' },
    options: { driver: { next: () => undefined }, scheduler: false, pollMs: 20, authRecheckMs: 0 },
  });
  await app.ready();
  cleanups.push(async () => {
    await app.close();
    c.client.close();
  });
  const run = (await app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })).json();
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, run, address, calls: () => calls };
}
describe('custo do stream de eventos', () => {
  it('um stream sem novidades não toma o snapshot pesado a cada poll e encerra ao terminar', async () => {
    const f = await fixture({ next: () => undefined });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    const heavy = vi.spyOn(f.service!, 'listClientEvents');
    const address = await f.app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(`${address}/api/agentic/executions/${run.id}/events?after=0`, {
      headers: { authorization: headers.authorization },
    });
    const reader = response.body!.getReader();
    await new Promise((resolve) => setTimeout(resolve, 400)); // ~20 polls at 20 ms
    expect(heavy).toHaveBeenCalledTimes(1);
    await f.app.inject({
      method: 'POST',
      url: `/api/agentic/executions/${run.id}/cancel`,
      headers: { ...headers, 'idempotency-key': 'cancel-quiet' },
      payload: {},
    });
    let body = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      body += new TextDecoder().decode(chunk.value);
    expect(body).toContain('CANCELLED');
    expect(heavy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
describe('autenticação durante o stream de eventos', () => {
  it('uma falha transitória de verificação não encerra o stream como acesso revogado', async () => {
    const f = await streamWithVerifier((call) => call !== 3);
    const response = await fetch(`${f.address}/api/agentic/executions/${f.run.id}/events?after=0`, {
      headers: { authorization: 'Bearer stream' },
    });
    const reader = response.body!.getReader();
    while (f.calls() < 6 && !(await reader.read()).done);
    await f.app.inject({
      method: 'POST',
      url: `/api/agentic/executions/${f.run.id}/cancel`,
      headers: { authorization: 'Bearer session', 'idempotency-key': 'cancel-transient' },
      payload: {},
    });
    let body = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      body += new TextDecoder().decode(chunk.value);
    expect(body).not.toContain('ACCESS_REVOKED');
    expect(body).toContain('CANCELLED');
  });
  it('falhas consecutivas de verificação encerram o stream como acesso revogado', async () => {
    const f = await streamWithVerifier((call) => call < 3);
    const response = await fetch(`${f.address}/api/agentic/executions/${f.run.id}/events?after=0`, {
      headers: { authorization: 'Bearer stream' },
    });
    expect(await response.text()).toContain('"code":"ACCESS_REVOKED"');
  });
});
it('requisição com sessão antiga recebe acesso revogado após expurgo sem recriar trabalho', async () => {
  const f = await fixture({ next: () => undefined });
  const { AccountClosurePurgeService } = await import('../account/account-closure-purge-service.js');
  await new AccountClosurePurgeService(f.client).purgePrivateContent({
    tenantId: owner.tenantId,
    closureId: 'closed-route',
  });
  const response = await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input });
  expect(response.statusCode).toBe(403);
  expect(response.json().error).toBe('ACCESS_REVOKED');
});

it('erro inesperado na rota é registrado com rota e código estável, sem a mensagem livre', async () => {
  const f = await fixture({ next: () => undefined });
  const run = (await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })).json();
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
  const failing = vi
    .spyOn(f.service!, 'getExecution')
    .mockRejectedValue(new Error('SELECT * FROM secret_table failed'));
  try {
    const response = await f.app.inject({ method: 'GET', url: `/api/agentic/executions/${run.id}`, headers });
    expect(response.statusCode).toBe(503);
    const logged = writes.map((line) => JSON.parse(line)).find((l) => l.message === 'agentic.request.failed');
    expect(logged).toMatchObject({
      level: 'error',
      method: 'GET',
      route: '/api/agentic/executions/:id',
      errorCode: 'UNEXPECTED_ERROR',
    });
    expect(writes.join('')).not.toContain('secret_table');
  } finally {
    failing.mockRestore();
    spy.mockRestore();
  }
});

describe('conversas recentes', () => {
  it('exclui e restaura somente o histórico do titular sem alterar execução ou mensagens', async () => {
    const f = await fixture({ next: () => undefined });
    const run = (
      await f.app.inject({ method: 'POST', url: '/api/agentic/executions', headers, payload: input })
    ).json();
    const before = await f.client.execute('SELECT payload_json FROM agentic_executions');
    const messages = await f.client.execute('SELECT payload_json FROM agentic_messages');
    const update = (hidden: boolean, authorization = 'Bearer session') =>
      f.app.inject({
        method: 'POST',
        url: `/api/agentic/executions/${run.id}/history`,
        headers: { authorization },
        payload: { hidden },
      });
    expect((await update(true, 'Bearer other')).statusCode).toBe(404);
    expect((await update(true, 'Bearer key')).statusCode).toBe(403);
    expect((await update(true)).statusCode).toBe(200);
    expect((await update(true)).statusCode).toBe(200);
    const list = async (view = '') =>
      (await f.app.inject({ method: 'GET', url: '/api/agentic/conversations' + view, headers })).json();
    expect((await list()).items).toEqual([]);
    expect((await list('?view=trash')).items.map((item: { executionId: string }) => item.executionId)).toEqual([
      run.id,
    ]);
    expect((await f.client.execute('SELECT payload_json FROM agentic_executions')).rows).toEqual(before.rows);
    expect((await f.client.execute('SELECT payload_json FROM agentic_messages')).rows).toEqual(messages.rows);
    expect((await update(false)).statusCode).toBe(200);
    expect((await list()).items).toHaveLength(1);
    expect((await list('?view=trash')).items).toEqual([]);
    const matter = await new MatterRepository(f.db).createMatter({
      ...owner,
      title: 'Caso privado',
      createdBy: owner.userId,
    });
    const caseRun = (
      await f.app.inject({
        method: 'POST',
        url: '/api/agentic/executions',
        headers: { ...headers, 'idempotency-key': 'case-history' },
        payload: { ...input, matterId: matter.id },
      })
    ).json();
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/agentic/executions/${caseRun.id}/history`,
          headers: { authorization: 'Bearer research-only' },
          payload: { hidden: true },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('lista só as conversas do próprio usuário, a mais recente primeiro, e esconde as de caso sem o escopo do caso', async () => {
    const f = await fixture({ next: () => undefined });
    const matter = await new MatterRepository(f.db).createMatter({
      ...owner,
      title: 'Caso privado',
      createdBy: owner.userId,
    });
    const start = async (key: string, payload: object, as = headers) =>
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/agentic/executions',
          headers: { ...as, 'idempotency-key': key },
          payload,
        })
      ).json();
    const first = await start('recent-1', { ...input, objective: 'Primeiro pedido' });
    const second = await start('recent-2', { ...input, objective: 'x'.repeat(200) });
    const withCase = await start('recent-3', { ...input, objective: 'Pedido do caso', matterId: matter.id });
    await start(
      'recent-other',
      { ...input, objective: 'De outra pessoa' },
      { authorization: 'Bearer other', 'idempotency-key': 'x' },
    );
    const list = async (authorization: string) =>
      (await f.app.inject({ method: 'GET', url: '/api/agentic/conversations', headers: { authorization } })).json();
    const mine = await list('Bearer session');
    expect(mine.items.map((i: { executionId: string }) => i.executionId).sort()).toEqual(
      [first.id, second.id, withCase.id].sort(),
    );
    expect(mine.items.find((i: { executionId: string }) => i.executionId === second.id).title).toHaveLength(88);
    expect(mine.items[0]).toEqual({
      executionId: expect.any(String),
      title: expect.any(String),
      status: 'QUEUED',
      updatedAt: expect.any(String),
    });
    const restricted = await list('Bearer research-only');
    expect(restricted.items.map((i: { executionId: string }) => i.executionId)).not.toContain(withCase.id);
    const others = await list('Bearer other');
    expect(others.items).toHaveLength(1);
    expect(others.items[0].title).toBe('De outra pessoa');
  });
});
