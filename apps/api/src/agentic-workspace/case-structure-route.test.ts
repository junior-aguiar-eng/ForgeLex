import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { registerAgenticWorkspace } from './execution-routes.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

/**
 * A "Estrutura do caso" mostra a análise de fatos e provas mais recente do caso, sem o cliente ter de achar a conversa
 * que a gerou. A rota só indica qual é; o conteúdo continua vindo da rota de entregas, com as mesmas permissões.
 */
async function setup() {
  const f = await createEvidenceFixture();
  const app = Fastify();
  cleanup.push(async () => {
    await app.close();
    f.client.close();
  });
  const auth = new AuthAdapter({
    verify: async (token) => ({
      ...f.owner,
      userId: token === 'other' ? 'other' : f.owner.userId,
      authMethod: token === 'key' ? ('api_key' as const) : ('session' as const),
      subjectId: token,
      roles: ['lawyer'],
      scopes: ['research:read', ...(token === 'research' ? [] : ['matter:read'])],
    }),
  });
  registerAgenticWorkspace(app, {
    database: f.db,
    client: f.client,
    auth,
    environment: { FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' },
    options: {
      scheduler: false,
      caseTask: { authorizeNative: async () => {}, createProvider: ({ registry }) => new FakeAgentProvider(registry) },
    },
  });
  const get = (matterId: string, token: string) =>
    app.inject({
      url: `/api/agentic/matters/${matterId}/structure`,
      headers: { authorization: `Bearer ${token}` },
    });
  return { f, get };
}

it('indica a análise de fatos e provas concluída mais recente do caso, e só ela', async () => {
  const { f, get } = await setup();
  const response = await get(f.matter.id, 'owner');
  expect(response.statusCode, response.body).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toMatchObject({
    structure: { executionId: f.execution.id, deliveryId: f.saved.id },
  });
});

it('caso sem análise concluída devolve vazio, não erro', async () => {
  const { get } = await setup();
  const response = await get(randomUUID(), 'owner');
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ structure: null });
});

it('exige sessão e permissão de leitura do caso, e não mostra o trabalho de outra pessoa', async () => {
  const { f, get } = await setup();
  expect((await get(f.matter.id, 'key')).statusCode).toBe(403);
  expect((await get(f.matter.id, 'research')).statusCode).toBe(403);
  const other = await get(f.matter.id, 'other');
  expect(other.statusCode).toBe(200);
  expect(other.json()).toEqual({ structure: null });
});
