import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LegalResearchMemoExecutionService } from './legal-research-memo-execution.js';

describe('research memo authorization before effects', () => {
  it('denies direct MCP execution without scopes before reading a matter', async () => {
    const service = new LegalResearchMemoExecutionService({} as never);
    await expect(
      service.execute(
        {
          matterId: 'b430353f-a13c-4a5e-b60d-050f8f514304',
          query: 'consulta válida',
          court: 'STJ',
          limit: 10,
          idempotencyKey: 'test',
        },
        {
          tenantId: 't',
          userId: 'u',
          sessionId: 'mcp_test',
          authMethod: 'api_key',
          source: 'MCP',
        },
      ),
    ).rejects.toThrow('INSUFFICIENT_SCOPE');
  });
});

import { vi } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { createLegalToolGateway, createFixtureResearchService } from '@forgelex/legal-tools';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  LegalIssueRepository,
  ResearchMemoRepository,
  PersistentWorkflowCheckpointStore,
  MatterAuthorityRepository,
  CaseAiAccessRepository,
} from '@forgelex/persistence';

async function fixture() {
  const c = await createDatabase({ url: process.env.FORGELEX_AUTH_TEST_DATABASE_URL ?? 'file::memory:' });
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: `tenant_${randomUUID()}`, userId: 'user' };
  const matters = new MatterRepository(c.db);
  const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso autorizado' });
  const doc = await matters.ingestTextDocument({
    ...owner,
    matterId: matter.id,
    createdBy: owner.userId,
    title: 'Documento',
    originalFilename: 'doc.txt',
    mimeType: 'text/plain',
    content: 'Conteúdo autorizado.',
  });
  const grants = new CaseAiAccessRepository(c.db);
  const stamp = '2026-10-05T10:00:00.000Z';
  const grant = await grants.replace(owner, matter.id, {
    oauthClientId: 'app',
    oauthGrantedAt: stamp,
    expectedRevision: 0,
    selection: {
      documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
      factIds: [],
      evidenceIds: [],
      thesisIds: [],
      authorityIds: [],
    },
  });
  const registry = new ToolRegistry();
  createLegalToolGateway(createFixtureResearchService()).registerInto(registry);
  const memos = new ResearchMemoRepository(c.db);
  const authorities = new MatterAuthorityRepository(c.db);
  const issues = new LegalIssueRepository(c.db);
  const service = new LegalResearchMemoExecutionService({
    matterRepository: matters,
    legalIssueRepository: issues,
    researchMemoRepository: memos,
    checkpointStore: new PersistentWorkflowCheckpointStore(c.db),
    matterAuthorityRepository: authorities,
    caseAiAccessRepository: grants,
    toolRegistry: registry,
  });
  const input = {
    matterId: matter.id,
    query: 'vazamento de dados',
    court: 'STJ' as const,
    limit: 10,
    idempotencyKey: 'memo',
  };
  const context = {
    ...owner,
    sessionId: 'mcp_test',
    source: 'MCP' as const,
    authMethod: 'oauth_access_token',
    scopes: ['research:read', 'matter:write'],
    oauthConnection: { clientId: 'app', grantedAt: stamp },
    revalidateConnection: async () => {},
  };
  return { c, issues, owner, grants, grant, registry, memos, authorities, service, input, context, matter };
}

describe('exact OAuth matter authorization', () => {
  it.each(['tenant', 'user', 'client', 'stamp', 'matter', 'revoked'] as const)(
    'denies wrong %s without memo or authorities',
    async (kind) => {
      const f = await fixture();
      try {
        const context = { ...f.context, oauthConnection: { ...f.context.oauthConnection } };
        const input = { ...f.input };
        if (kind === 'tenant') context.tenantId = 'other';
        if (kind === 'user') context.userId = 'other';
        if (kind === 'client') context.oauthConnection.clientId = 'other';
        if (kind === 'stamp') context.oauthConnection.grantedAt = '2026-10-06T10:00:00.000Z';
        if (kind === 'matter')
          input.matterId = (
            await new MatterRepository(f.c.db).createMatter({ ...f.owner, createdBy: 'user', title: 'Outro caso' })
          ).id;
        if (kind === 'revoked') await f.grants.revoke(f.owner, f.matter.id, f.grant.id, 1);
        await expect(f.service.execute(input, context)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
        expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(0);
        expect(await f.authorities.listAuthorities(f.owner.tenantId, f.matter.id)).toHaveLength(0);
      } finally {
        f.c.client.close();
      }
    },
  );

  it('permits exact active grant and revalidates replay', async () => {
    const f = await fixture();
    try {
      const first = await f.service.execute(f.input, f.context);
      expect(first.record.status).toBe('PENDING_HUMAN_REVIEW');
      await f.grants.revoke(f.owner, f.matter.id, f.grant.id, 1);
      await expect(f.service.execute(f.input, f.context)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(1);
    } finally {
      f.c.client.close();
    }
  });

  it('revocation while search is in flight prevents later durable effects', async () => {
    const f = await fixture();
    try {
      const original = f.registry.executeTool.bind(f.registry);
      vi.spyOn(f.registry, 'executeTool').mockImplementation(async (...args) => {
        const result = await original(...args);
        await f.grants.revoke(f.owner, f.matter.id, f.grant.id, 1);
        return result;
      });
      await expect(f.service.execute(f.input, f.context)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(0);
      expect(await f.authorities.listAuthorities(f.owner.tenantId, f.matter.id)).toHaveLength(0);
    } finally {
      f.c.client.close();
    }
  });
});

describe('authorization races and authenticated direct contexts', () => {
  it.each(['REST', 'AGENT_CORE'] as const)(
    'does not trust %s when authentication metadata is present',
    async (source) => {
      const f = await fixture();
      try {
        await expect(
          f.service.execute(f.input, {
            ...f.context,
            source,
            authMethod: 'api_key',
            scopes: ['research:read'],
            oauthConnection: undefined,
          }),
        ).rejects.toThrow('INSUFFICIENT_SCOPE');
        expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(0);
      } finally {
        f.c.client.close();
      }
    },
  );

  it('revalidates a replay after its final asynchronous read', async () => {
    const f = await fixture();
    try {
      await f.service.execute(f.input, f.context);
      const issues = f.issues;
      const original = issues.listIssues.bind(issues);
      vi.spyOn(issues, 'listIssues').mockImplementation(async (...args) => {
        const rows = await original(...args);
        await f.grants.revoke(f.owner, f.matter.id, f.grant.id, 1);
        return rows;
      });
      await expect(f.service.execute(f.input, f.context)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
    } finally {
      f.c.client.close();
    }
  });
});

const pgUrl = process.env.FORGELEX_AUTH_TEST_DATABASE_URL;
it.skipIf(!pgUrl)(
  'revocation committed while checkpoint waits on matter lock prevents every checkpoint write',
  async () => {
    const f = await fixture();
    const { default: postgres } = await import('postgres');
    const holder = postgres(pgUrl!);
    let pending: Promise<unknown> | undefined;
    try {
      await holder.begin(async (tx) => {
        await tx`UPDATE matters SET updated_at = updated_at WHERE id = ${f.matter.id}`;
        pending = f.service.execute(f.input, f.context);
        // Attach rejection handling immediately, then wait for PostgreSQL to report a real lock wait.
        void pending.catch(() => {});
        let waiting = false;
        for (let attempt = 0; attempt < 1000; attempt++) {
          const rows = await f.c.client.execute({
            sql: "SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()",
            args: [],
          });
          if (rows.rows.length) {
            waiting = true;
            break;
          }
        }
        expect(waiting).toBe(true);
        await tx`UPDATE case_ai_access_grants SET status = 'REVOKED', revision = 2 WHERE id = ${f.grant.id}`;
      });
      await expect(pending).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      const result = await f.c.client.execute({
        sql: 'SELECT COUNT(*) AS total FROM workflow_checkpoints WHERE tenant_id = ?',
        args: [f.owner.tenantId],
      });
      expect(Number(result.rows[0]?.total)).toBe(0);
      expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(0);
    } finally {
      f.c.client.close();
      await holder.end();
    }
  },
);
