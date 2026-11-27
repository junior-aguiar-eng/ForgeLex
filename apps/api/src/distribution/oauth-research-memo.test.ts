import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  CaseAiAccessRepository,
  ResearchMemoRepository,
} from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';

const stamp = '2026-10-05T10:00:00.000Z';
const oauth = (tenantId: string): AuthenticatedPrincipal => ({
  subjectId: 's',
  userId: 'u',
  tenantId,
  roles: ['owner'],
  scopes: ['mcp', 'research:read'],
  authMethod: 'oauth_access_token',
  oauthClientId: 'app',
  oauthGrantedAt: stamp,
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

/** An OAuth-connected app with the exact scopes the real verifier gives it: ['mcp', 'research:read']. */
async function fixture() {
  const tenantId = `tenant_${Math.random().toString(36).slice(2)}`;
  const connection = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(connection.client);
  const ledger = new LedgerService(connection.db, connection.client);
  await ledger.runMigrations();
  await ledger.provisionAccount(tenantId, { paidBalanceCents: 5000, promotionalBalanceCents: 0 });
  const matters = new MatterRepository(connection.db);
  const owner = { tenantId, userId: 'u' };
  const matter = await matters.createMatter({ ...owner, createdBy: 'u', title: 'Caso' });
  const other = await matters.createMatter({ ...owner, createdBy: 'u', title: 'Outro caso' });
  const document = await matters.ingestTextDocument({
    ...owner,
    matterId: matter.id,
    createdBy: 'u',
    title: 'Doc',
    originalFilename: 'doc.txt',
    mimeType: 'text/plain',
    content: 'Conteúdo autorizado.',
  });
  const grants = new CaseAiAccessRepository(connection.db);
  const grant = await grants.replace(owner, matter.id, {
    oauthClientId: 'app',
    oauthGrantedAt: stamp,
    expectedRevision: 0,
    selection: {
      documents: [{ documentId: document.document.id, versionId: document.version.id }],
      factIds: [],
      evidenceIds: [],
      thesisIds: [],
      authorityIds: [],
    },
  });
  const app = await buildApp({
    database: connection.db,
    databaseClient: connection.client,
    ledgerService: ledger,
    authAdapter: new AuthAdapter({ verify: async () => oauth(tenantId) }),
    environment: { NODE_ENV: 'test' },
  });
  closers.push(async () => {
    await app.close();
    connection.client.close();
  });
  const callMemo = (matterId: string, idempotencyKey: string) =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Bearer oauth', 'idempotency-key': idempotencyKey },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'workflow.legal_research_memo',
          arguments: { matterId, query: 'vazamento de dados', idempotencyKey },
        },
      },
    });
  return {
    app,
    connection,
    owner,
    matter,
    other,
    grant,
    grants,
    callMemo,
    memos: new ResearchMemoRepository(connection.db),
  };
}

describe('research memo through an OAuth-connected app', () => {
  it('runs for a matter the user shared with that app, and stores the memo', async () => {
    const f = await fixture();

    const response = await f.callMemo(f.matter.id, 'memo-ok');

    expect(response.json().error).toBeUndefined();
    expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(1);
  });

  // Minimum rule (26/11/2026): the approved connection reaches every active case automatically; a case out of use
  // (archived) is still refused.
  it('is refused for a case that is not active, creating nothing', async () => {
    const f = await fixture();
    await f.connection.client.execute({
      sql: "UPDATE matters SET lifecycle_state = 'ARCHIVED' WHERE id = ?",
      args: [f.other.id],
    });

    const response = await f.callMemo(f.other.id, 'memo-other');

    expect(response.json().error?.message).toBe('CASE_CONTEXT_NOT_AUTHORIZED');
    expect(await f.memos.listMemos(f.owner.tenantId, f.other.id)).toHaveLength(0);
  });

  it('is refused once the user revokes the share', async () => {
    const f = await fixture();
    await f.grants.revoke(f.owner, f.matter.id, f.grant.id, 1);

    const response = await f.callMemo(f.matter.id, 'memo-revoked');

    expect(response.json().error?.message).toBe('CASE_CONTEXT_NOT_AUTHORIZED');
    expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(0);
  });

  it('does not open the REST write routes: the extra scope exists only inside the MCP', async () => {
    const f = await fixture();
    const headers = { authorization: 'Bearer oauth' };

    const created = await f.app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers,
      payload: { title: 'Novo caso' },
    });
    const memo = await f.app.inject({
      method: 'POST',
      url: `/api/v2/matters/${f.matter.id}/research-memos`,
      headers: { ...headers, 'idempotency-key': 'rest' },
      payload: { query: 'vazamento de dados' },
    });

    expect(created.statusCode).toBe(403);
    expect(created.json()).toMatchObject({ error: 'INSUFFICIENT_SCOPE', missingScopes: ['matter:write'] });
    expect(memo.statusCode).toBe(403);
  });
});
