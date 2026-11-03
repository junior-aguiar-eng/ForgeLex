import Fastify from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { registerAgenticWorkspace } from './execution-routes.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
it('reaprovação por sessão preserva scopes, isolamento, decisão explícita e idempotência após edição posterior', async () => {
  const f = await createEvidenceFixture(),
    app = Fastify();
  cleanup.push(async () => {
    await app.close();
    f.client.close();
  });
  const review = await f.reviews.preview(f.owner, f.saved.id);
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    expectedRevision: review.revision,
    decisions: [{ itemId: review.items.find((i) => i.kind === 'FACT')!.id, action: 'ADOPT' }],
  });
  await f.client.execute("UPDATE facts SET statement='Relato alterado pela pessoa.'");
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
  const url = `/api/agentic/matters/${f.matter.id}/evidence-changes`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  for (const token of ['key', 'research'])
    expect((await app.inject({ url, headers: headers(token) })).statusCode).toBe(403);
  const other = await app.inject({ url, headers: headers('other') });
  expect(other.json().items).toEqual([]);
  const response = await app.inject({ url, headers: headers('read') });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const changes = response.json();
  const body = {
    approved: true,
    commandId: randomUUID(),
    reviewToken: changes.reviewToken,
    items: changes.items.map(({ deliveryId, itemId }: any) => ({ deliveryId, itemId })),
  };
  for (const token of ['key', 'read', 'research'])
    expect(
      (await app.inject({ method: 'POST', url: `${url}/decisions`, headers: headers(token), payload: body }))
        .statusCode,
    ).toBe(403);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `${url}/decisions`,
        headers: headers('owner'),
        payload: { ...body, approved: false },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await app.inject({ method: 'POST', url: `${url}/decisions`, headers: headers('other'), payload: body }))
      .statusCode,
  ).toBe(409);
  expect(
    (await app.inject({ method: 'POST', url: `${url}/decisions`, headers: headers('owner'), payload: body }))
      .statusCode,
  ).toBe(200);
  await f.client.execute("UPDATE facts SET statement='Nova alteração ainda não aprovada.'");
  expect(
    (await app.inject({ method: 'POST', url: `${url}/decisions`, headers: headers('owner'), payload: body })).json()
      .isReplay,
  ).toBe(true);
  expect((await app.inject({ url, headers: headers('owner') })).json().items).toHaveLength(1);
});
