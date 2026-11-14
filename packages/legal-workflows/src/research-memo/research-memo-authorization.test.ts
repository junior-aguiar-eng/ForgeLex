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
  return { c, issues, owner, grants, grant, registry, memos, authorities, matters, service, input, context, matter };
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

describe('authorization cost and placement', () => {
  it('does not call the token revalidation while the matter write transaction is open', async () => {
    const f = await fixture();
    try {
      let insideTransaction = false;
      const original = f.grants.withActive.bind(f.grants);
      const withActive = vi.spyOn(f.grants, 'withActive').mockImplementation((reader, matterId, operation) =>
        original(reader, matterId, async (tx) => {
          insideTransaction = true;
          try {
            return await operation(tx);
          } finally {
            insideTransaction = false;
          }
        }),
      );
      const revalidatedInside: boolean[] = [];
      const context = {
        ...f.context,
        revalidateConnection: async () => {
          revalidatedInside.push(insideTransaction);
        },
      };

      await f.service.execute(f.input, context);

      expect(withActive).toHaveBeenCalled();
      expect(revalidatedInside.length).toBeGreaterThan(0);
      expect(revalidatedInside).not.toContain(true);
    } finally {
      f.c.client.close();
    }
  });

  it('still rechecks the grant inside the transaction, so a revocation that lands between the checks blocks the write', async () => {
    const f = await fixture();
    try {
      const original = f.grants.withActive.bind(f.grants);
      vi.spyOn(f.grants, 'withActive').mockImplementation(async (reader, matterId, operation) => {
        await f.grants.revoke(f.owner, f.matter.id, f.grant.id, 1);
        return original(reader, matterId, operation);
      });

      await expect(f.service.execute(f.input, f.context)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      expect(await f.memos.listMemos(f.owner.tenantId, f.matter.id)).toHaveLength(0);
    } finally {
      f.c.client.close();
    }
  });

  it('never revalidates twice in a row without reading or writing anything in between', async () => {
    const f = await fixture();
    const restores: Array<() => void> = [];
    try {
      const events: string[] = [];
      // Prototypes, not instances: inside the OAuth transaction the service builds fresh repositories on the tx.
      const watch = (target: object, method: string, name: string) => {
        const original = (target as Record<string, (...a: unknown[]) => unknown>)[method]!;
        const spy = vi.spyOn(target as never, method as never).mockImplementation(function (
          this: unknown,
          ...args: unknown[]
        ) {
          events.push(name);
          return original.apply(this, args);
        } as never);
        restores.push(() => spy.mockRestore());
      };
      watch(Object.getPrototypeOf(f.registry), 'executeTool', 'tool');
      watch(MatterRepository.prototype, 'captureWorkRevision', 'read:revision');
      // The instance, not the prototype: assertActive reads the matter through its own repository and must not count.
      watch(f.matters, 'getMatter', 'read:matter');
      watch(LegalIssueRepository.prototype, 'listIssues', 'read:issues');
      watch(ResearchMemoRepository.prototype, 'getByIdempotencyKey', 'read:memo');
      watch(ResearchMemoRepository.prototype, 'createMemo', 'effect:memo');
      watch(MatterAuthorityRepository.prototype, 'saveAuthority', 'effect:authority');
      watch(MatterAuthorityRepository.prototype, 'recordVerification', 'effect:verification');
      watch(PersistentWorkflowCheckpointStore.prototype, 'save', 'effect:checkpoint');
      const context = {
        ...f.context,
        revalidateConnection: async () => {
          events.push('revalidate');
        },
      };

      await f.service.execute(f.input, context);

      const doubled = events.flatMap((event, index) =>
        event === 'revalidate' && events[index + 1] === 'revalidate' ? [index] : [],
      );
      expect(events.filter((event) => event.startsWith('effect:')).length).toBeGreaterThan(5);
      expect(doubled).toEqual([]);
    } finally {
      restores.forEach((restore) => restore());
      f.c.client.close();
    }
  });
});

describe('closing a failed execution', () => {
  const stubs = (overrides: Record<string, unknown> = {}) => {
    const checkpoints: string[] = [];
    const dependencies = {
      matterRepository: { captureWorkRevision: async () => 1, getMatter: async () => ({ id: 'm' }) },
      legalIssueRepository: { listIssues: async () => [] },
      researchMemoRepository: { getByIdempotencyKey: async () => undefined },
      matterAuthorityRepository: {},
      checkpointStore: {
        save: vi.fn(async (record: { status: string }) => {
          checkpoints.push(record.status);
          if (record.status === 'FAILED') throw new Error('DB_DOWN');
        }),
      },
      toolRegistry: {
        executeTool: vi.fn(async () => {
          throw new Error('SEARCH_FAILED');
        }),
      },
      onCheckpointWriteFailed: vi.fn(),
      ...overrides,
    };
    const input = {
      matterId: randomUUID(),
      query: 'vazamento de dados',
      court: 'STJ' as const,
      limit: 10,
      idempotencyKey: 'k',
    };
    return { dependencies, checkpoints, input };
  };

  it('reports a failure to write the FAILED checkpoint without hiding the original error', async () => {
    const { dependencies, input } = stubs();
    const service = new LegalResearchMemoExecutionService(dependencies as never);

    await expect(
      service.execute(input, { tenantId: 't', userId: 'u', sessionId: 'mcp_x', source: 'MCP' }),
    ).rejects.toThrow('SEARCH_FAILED');

    expect(dependencies.onCheckpointWriteFailed).toHaveBeenCalledTimes(1);
    expect(dependencies.onCheckpointWriteFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't',
        matterId: input.matterId,
        error: expect.objectContaining({ message: 'DB_DOWN' }),
      }),
    );
  });

  it('stays quiet when the FAILED checkpoint is skipped because authorization was lost', async () => {
    let revoked = false;
    const { dependencies, checkpoints, input } = stubs({
      toolRegistry: {
        executeTool: vi.fn(async () => {
          revoked = true;
          throw new Error('SEARCH_FAILED');
        }),
      },
    });
    const service = new LegalResearchMemoExecutionService(dependencies as never);
    const context = {
      tenantId: 't',
      userId: 'u',
      sessionId: 'mcp_x',
      source: 'MCP' as const,
      authMethod: 'api_key',
      get scopes() {
        return revoked ? [] : ['research:read', 'matter:write'];
      },
    };

    await expect(service.execute(input, context)).rejects.toThrow('SEARCH_FAILED');

    expect(checkpoints).not.toContain('FAILED');
    expect(dependencies.onCheckpointWriteFailed).not.toHaveBeenCalled();
  });

  it('does not let a throwing report hook replace the original error', async () => {
    const { dependencies, input } = stubs({
      onCheckpointWriteFailed: vi.fn(() => {
        throw new Error('HOOK_BROKEN');
      }),
    });
    const service = new LegalResearchMemoExecutionService(dependencies as never);

    await expect(
      service.execute(input, { tenantId: 't', userId: 'u', sessionId: 'mcp_x', source: 'MCP' }),
    ).rejects.toThrow('SEARCH_FAILED');
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
