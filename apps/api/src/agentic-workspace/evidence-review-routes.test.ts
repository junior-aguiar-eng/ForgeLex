import Fastify from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { registerAgenticWorkspace } from './execution-routes.js';
import { ExecutionService } from './execution-service.js';
import type { ClosedPilot } from './closed-pilot.js';
import type { CommercialRuntime } from './commercial-runtime.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
it('limita revisão à sessão, scopes e dono; exige aprovação explícita e repete sem duplicar', async () => {
  const f = await createEvidenceFixture(),
    app = Fastify();
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
      scopes: [
        'research:read',
        ...(token === 'research' ? [] : ['matter:read']),
        ...(token === 'read' ? [] : ['matter:write']),
      ],
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
  const url = `/api/agentic/deliveries/${encodeURIComponent(f.saved.id)}/evidence-review`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  for (const [token, status] of [
    ['key', 403],
    ['research', 403],
    ['other', 404],
  ] as const)
    expect((await app.inject({ url, headers: headers(token) })).statusCode).toBe(status);
  const preview = await app.inject({ url, headers: headers('read') });
  expect(preview.statusCode).toBe(200);
  expect(preview.headers['cache-control']).toBe('no-store');
  const review = preview.json();
  const input = {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: [{ itemId: review.items[0].id, action: 'ADOPT', text: 'Texto aprovado na sessão.' }],
  };
  for (const token of ['key', 'research', 'read'])
    expect(
      (await app.inject({ method: 'POST', url: `${url}/decisions`, headers: headers(token), payload: input }))
        .statusCode,
    ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${url}/decisions`,
        headers: headers('owner'),
        payload: { ...input, approved: false },
      })
    ).statusCode,
  ).toBe(400);
  expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(0);
  const result = await app.inject({
    method: 'POST',
    url: `${url}/decisions`,
    headers: headers('owner'),
    payload: input,
  });
  expect(result.statusCode, result.body).toBe(200);
  expect(
    (await app.inject({ method: 'POST', url: `${url}/decisions`, headers: headers('owner'), payload: input })).json()
      .isReplay,
  ).toBe(true);
  expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(1);
});

it.each(['pilot', 'commercial'])('preserva isolamento do runtime %s também em revisão humana', async (kind) => {
  const f = await createEvidenceFixture(),
    app = Fastify();
  cleanup.push(async () => {
    await app.close();
    f.client.close();
  });
  const auth = new AuthAdapter({
    verify: async () => ({
      ...f.owner,
      authMethod: 'session',
      subjectId: 'owner',
      roles: ['lawyer'],
      scopes: ['research:read', 'matter:read', 'matter:write'],
    }),
  });
  const runtime = {
    service: new ExecutionService(f.db, f.client),
    assertOwner: () => {},
    canManageExecution: () => false,
    caseTask: {
      authorizeNative: async () => {},
      createProvider: ({ registry }: any) => new FakeAgentProvider(registry),
    },
  };
  registerAgenticWorkspace(app, {
    database: f.db,
    client: f.client,
    auth,
    environment: { FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' },
    options: {
      scheduler: false,
      ...(kind === 'pilot'
        ? { closedPilot: runtime as unknown as ClosedPilot }
        : { commercial: runtime as unknown as CommercialRuntime }),
    },
  });
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const url = `/api/agentic/deliveries/${encodeURIComponent(f.saved.id)}/evidence-review`;
  const headers = { authorization: 'Bearer owner' };
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    expectedRevision: review.revision,
    decisions: [{ itemId: review.items.find((i) => i.kind === 'FACT')!.id, action: 'ADOPT' }],
  });
  await f.client.execute("UPDATE facts SET statement='Alteração para conferir.'");
  const changesUrl = `/api/agentic/matters/${f.matter.id}/evidence-changes`;
  expect((await app.inject({ url: changesUrl, headers })).statusCode).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${changesUrl}/decisions`,
        headers,
        payload: {
          approved: true,
          commandId: randomUUID(),
          reviewToken: 'a'.repeat(64),
          items: [{ deliveryId: f.saved.id, itemId: review.items[0].id }],
        },
      })
    ).statusCode,
  ).toBe(404);
  expect((await app.inject({ url, headers })).statusCode).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${url}/decisions`,
        headers,
        payload: {
          approved: true,
          commandId: randomUUID(),
          expectedRevision: review.revision,
          reviewToken: review.reviewToken,
          decisions: [{ itemId: review.items[0].id, action: 'ADOPT' }],
        },
      })
    ).statusCode,
  ).toBe(404);
  expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(1);
});
