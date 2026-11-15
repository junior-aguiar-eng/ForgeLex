import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, MatterRepository } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';

const principal = (scopes: string[]): AuthenticatedPrincipal => ({
  subjectId: 's',
  userId: 'u',
  tenantId: 'tenant',
  roles: ['owner'],
  scopes,
  authMethod: 'api_key',
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function fixture(verified: AuthenticatedPrincipal | null) {
  const connection = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(connection.client);
  const matter = await new MatterRepository(connection.db).createMatter({
    tenantId: 'tenant',
    createdBy: 'u',
    title: 'Caso',
  });
  const app = await buildApp({
    database: connection.db,
    databaseClient: connection.client,
    ledgerService: new LedgerService(connection.db, connection.client),
    authAdapter: new AuthAdapter({ verify: async () => verified }),
    environment: { NODE_ENV: 'test' },
  });
  closers.push(async () => {
    await app.close();
    connection.client.close();
  });
  const post = (payload: string, headers: Record<string, string> = { authorization: 'Bearer token' }) =>
    app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: { 'content-type': 'application/json', ...headers },
      payload,
    });
  return { post };
}

const MB = 1024 * 1024;
const malformed = (megabytes: number) => `{${'x'.repeat(megabytes * MB)}`;

describe('POST /api/v2/matters/:id/documents before the body is read', () => {
  it('answers 401 to a request without credentials without parsing its body', async () => {
    const f = await fixture(null);

    const response = await f.post(malformed(3), {});

    expect(response.statusCode).toBe(401);
  });

  it('answers 401 to an invalid credential without parsing a large body', async () => {
    const f = await fixture(null);

    const response = await f.post(malformed(3));

    expect(response.statusCode).toBe(401);
  });

  it('answers 403 to a credential without matter:write without parsing a large body', async () => {
    const f = await fixture(principal(['research:read']));

    const response = await f.post(malformed(3));

    expect(response.statusCode).toBe(403);
  });

  it('refuses a body above the envelope with 413 even for an authorized caller', async () => {
    const f = await fixture(principal(['matter:write']));

    const response = await f.post(
      JSON.stringify({ title: 't', originalFilename: 'f.txt', content: 'a'.repeat(7 * MB) }),
    );

    expect(response.statusCode).toBe(413);
  });
});

describe('POST /api/v2/matters/:id/documents metadata limits', () => {
  it.each([
    ['title', { title: 'x'.repeat(501), originalFilename: 'f.txt', content: 'Texto.' }],
    ['originalFilename', { title: 't', originalFilename: 'x'.repeat(256), content: 'Texto.' }],
    ['mimeType', { title: 't', originalFilename: 'f.txt', mimeType: 'x'.repeat(128), content: 'Texto.' }],
  ])('answers 400 DOCUMENT_FIELD_TOO_LONG for an oversized %s', async (field, body) => {
    const f = await fixture(principal(['matter:write']));

    const response = await f.post(JSON.stringify(body));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'DOCUMENT_FIELD_TOO_LONG' });
    expect(response.json().message).toContain(field);
  });

  it('ingests a normal document', async () => {
    const f = await fixture(principal(['matter:write']));

    const response = await f.post(
      JSON.stringify({ title: 'Petição', originalFilename: 'p.txt', content: 'Primeiro.\nSegundo.' }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().anchors).toHaveLength(2);
  });
});
