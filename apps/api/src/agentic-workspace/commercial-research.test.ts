import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, MatterRepository } from '@forgelex/persistence';
import { LedgerService, COMMERCIAL_POLICY_VERSION } from '@forgelex/billing-ledger';
import { createFixtureResearchService, NativeCaseContextService } from '@forgelex/legal-tools';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { createCommercialRuntime } from './commercial-runtime.js';
import { registerAgenticWorkspace } from './execution-routes.js';

const owner = { tenantId: 'included-research', userId: 'boni' };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

async function fixture(
  beforeTool?: (name: string, f: any) => Promise<void>,
  refine = false,
  probatory?: 'document' | 'user',
) {
  const c = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.runMigrations();
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 2000, promotionalBalanceCents: 0 });
  const researchService = createFixtureResearchService();
  const authority = (await researchService.searchCaseLaw({ query: 'vazamento', court: 'STJ', limit: 1 })).items[0]!;
  const search = vi.spyOn(researchService, 'searchCaseLaw');
  const verify = vi.spyOn(researchService, 'verifyAuthority');
  const authorizeOwner = vi.fn(async () => {});
  const packets: any[] = [];
  const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const role = JSON.parse(body.instructions.split('\n\n')[0]).profile.role;
    const inputs = body.input;
    const user = inputs.find((item: any) => item.role === 'user');
    const text =
      typeof user.content === 'string' ? user.content : user.content.find((p: any) => p.type === 'input_text').text;
    const packet = JSON.parse(text).untrustedContext;
    packets.push({ role, packet });
    const calls = inputs.filter((item: any) => item.type === 'function_call').map((item: any) => item.name);
    const researchName =
      role === 'legal-researcher'
        ? 'forgelex_research_search_case_law'
        : role === 'authority-verifier'
          ? 'forgelex_research_verify_authority'
          : undefined;
    const name =
      researchName && !calls.includes(researchName)
        ? researchName
        : role === 'legal-researcher' && !calls.includes('forgelex_research_get_authority')
          ? 'forgelex_research_get_authority'
          : 'forgelex_task_submit';
    if (beforeTool) await beforeTool(name, f);
    const result: any =
      role === 'legal-orchestrator'
        ? {
            action: probatory ? 'analyze_evidence' : refine ? 'review_text' : 'research_question',
            requiresCaseLaw: !refine && !probatory,
            requiresNorms: false,
            requiresProcedure: false,
            issues: [{ id: 'issue', statement: 'Questão sintética', sourceIds: [packet.sources[0].id] }],
            gaps: [],
          }
        : {
            coveredIssueIds: ['issue'],
            requirements: [],
            findings: [],
            ...(refine && role === 'adversarial-reviewer' && packet.routing.nodeId.endsWith(':0')
              ? {
                  capabilityRequests: [
                    {
                      capability: 'CASE_LAW_RESEARCH',
                      reason: 'MISSING_LEGAL_BASIS',
                      issueIds: ['issue'],
                      sourceIds: [packet.sources[0].id],
                    },
                  ],
                }
              : {}),
            claims:
              role === 'legal-researcher'
                ? [
                    {
                      id: 'claim',
                      classification: 'INFERENCE',
                      statement: 'Proposição sintética.',
                      sourceIds: [authority.id],
                    },
                  ]
                : [],
            supportChecks:
              role === 'authority-verifier'
                ? [
                    {
                      claimId: packet.priorResults['legal-researcher'].claims[0].id,
                      sourceId: authority.id,
                      quote: authority.syllabus.slice(0, 100),
                      assessment: 'SUPPORTED',
                    },
                  ]
                : [],
          };
    if (probatory && role === 'matter-analyst') {
      const source = packet.sources.find((s: any) => s.kind === 'DOCUMENT') ?? packet.sources[0];
      result.claims = [
        {
          id: 'claim',
          classification: 'ALLEGATION',
          statement: 'O material relata pagamento.',
          sourceIds: [source.id],
        },
      ];
      result.evidenceAnalysis = {
        rows: [
          {
            id: 'row',
            claimId: 'claim',
            issueIds: ['issue'],
            references: [{ sourceId: source.id, quote: source.text, start: 0, relation: 'SUPPORTS' }],
            gaps: [],
          },
        ],
        chronology: [],
        contradictions: [],
      };
    }
    const args = name.endsWith('search_case_law')
      ? { query: 'vazamento', court: 'STJ', limit: 1 }
      : name.endsWith('verify_authority') || name.endsWith('get_authority')
        ? { court: 'STJ', processNumber: authority.processNumber }
        : result;
    const id = randomUUID().replaceAll('-', '');
    const output = calls.includes('forgelex_task_submit')
      ? [
          {
            id: 'msg_' + id,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Concluído.', annotations: [] }],
          },
        ]
      : [
          {
            id: 'fc_' + id,
            type: 'function_call',
            status: 'completed',
            call_id: 'call_' + id,
            name,
            arguments: JSON.stringify(args),
          },
        ];
    const response = {
      id: 'resp_' + id,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model: 'gpt-6.1-sol',
      status: 'completed',
      output,
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
      parallel_tool_calls: false,
      tool_choice: 'auto',
      tools: body.tools,
    };
    const frames = [
      { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: output[0] },
      { type: 'response.output_item.done', output_index: 0, item: output[0] },
      { type: 'response.completed', response },
    ];
    return new Response(
      frames
        .map(
          (frame, sequence_number) =>
            `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
        )
        .join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const environment = {
    FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true',
    FORGELEX_COMMERCIAL_EXECUTION_ENABLED: 'true',
    FORGELEX_DATABASE_URL: 'file:synthetic.sqlite',
  };
  const commercial = await createCommercialRuntime(c.db, c.client, environment, {
    apiKey: 'synthetic',
    transport,
    authorizeOwner,
    researchService,
  });
  const auth = new AuthAdapter({
    verify: async () => ({
      ...owner,
      subjectId: 'boni',
      roles: ['lawyer'],
      scopes: ['research:read', 'matter:read'],
      authMethod: 'session',
    }),
  });
  const app = Fastify();
  const runtime = registerAgenticWorkspace(app, {
    database: c.db,
    client: c.client,
    auth,
    environment,
    researchService,
    options: { commercial, scheduler: false },
  })!;
  await app.ready();
  cleanup.push(async () => {
    await runtime.worker!.stop();
    await app.close();
    c.client.close();
  });
  let selection: { matterId?: string; documents: { documentId: string; versionId: string }[] } = { documents: [] };
  if (probatory === 'document') {
    const repo = new MatterRepository(c.db);
    const matter = await repo.createMatter({ ...owner, title: 'Prova sintética', createdBy: owner.userId });
    const doc = await repo.ingestTextDocument({
      tenantId: owner.tenantId,
      matterId: matter.id,
      title: 'Recibo',
      content: 'Pagamento relatado no recibo sintético.',
      mimeType: 'text/plain',
      originalFilename: 'recibo.txt',
      createdBy: owner.userId,
    });
    selection = { matterId: matter.id, documents: [{ documentId: doc.document.id, versionId: doc.version.id }] };
  }
  const run = await commercial.start(owner, 'research', {
    objective: 'Pesquisar questão sintética',
    actionId: probatory ? 'analyze_evidence' : refine ? 'review_text' : 'research_question',
    ...(selection.matterId ? { matterId: selection.matterId } : {}),
    confirmed: true,
    policyVersion: COMMERCIAL_POLICY_VERSION,
    context: {
      text: 'Questão sintética fornecida.',
      origin: selection.documents.length ? 'MIXED' : 'USER',
      documents: selection.documents,
    },
  });
  const f = {
    ...c,
    ledger,
    commercial,
    run,
    worker: runtime.worker!,
    transport,
    search,
    verify,
    authorizeOwner,
    packets,
    authority,
  };
  return f;
}

it.each(['document', 'user'] as const)(
  'probatory SDK flow persists matrix, charges only documentary work and never adopts facts: %s',
  async (mode) => {
    const f = await fixture(undefined, false, mode);
    await f.worker.runOnce();
    const run = await f.commercial.service.getExecution(owner, f.run.id);
    expect(run.status).toBe('COMPLETED');
    const native = new NativeCaseContextService(f.db, async () => {});
    const record = await native.getDelivery(owner, run.deliveryIds[0]);
    expect(record.delivery.evidenceMatrix?.rows[0].coverage).toBe(
      mode === 'document' ? 'DOCUMENT_LINKED' : 'CONTEXT_ONLY',
    );
    expect(record.delivery.humanReviewRequired).toBe(true);
    expect(record.delivery.legalAssessment).toBe('NOT_EVALUATED');
    expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
      chargedCents: mode === 'document' ? 50 : 0,
      releasedCents: mode === 'document' ? 1100 : 1150,
      uncertainMicroUsd: 0,
    });
    expect(f.search).not.toHaveBeenCalled();
    expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(0);
    expect((await f.client.execute('SELECT id FROM evidence_items')).rows).toHaveLength(0);
    await expect(native.getDelivery({ ...owner, userId: 'other' }, run.deliveryIds[0])).rejects.toThrow();
    const calls = f.transport.mock.calls.length;
    await f.worker.runOnce();
    expect(f.transport).toHaveBeenCalledTimes(calls);
  },
);

it('research and verification run through the commercial SDK, persist provenance and incur only one commercial charge', async () => {
  const f = await fixture();
  await f.worker.runOnce();
  const execution = await f.commercial.service.getExecution(owner, f.run.id);
  expect(execution.status).toBe('COMPLETED');
  expect(f.search).toHaveBeenCalledOnce();
  expect(f.verify).toHaveBeenCalledTimes(2);
  expect(
    f.packets.some(
      ({ role, packet }: any) =>
        role === 'authority-verifier' && packet.sources.some((s: any) => s.id === f.authority.id),
    ),
  ).toBe(true);
  expect(await f.commercial.finance.getReceipt(owner, f.run.id)).toMatchObject({
    status: 'COMPLETED',
    chargedCents: 50,
    releasedCents: 1100,
    uncertainMicroUsd: 0,
  });
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(1950);
  expect(
    (await f.client.execute("SELECT id FROM usage_events WHERE tool_name='research.search_case_law'")).rows,
  ).toHaveLength(0);
  expect(execution.deliveryIds).toHaveLength(1);
  const native = new NativeCaseContextService(f.db, async () => {});
  const delivery = await native.getCommittedExecutionDelivery(owner, f.run.id, execution.deliveryIds[0]);
  expect(delivery?.sources).toContainEqual(
    expect.objectContaining({
      id: f.authority.id,
      kind: 'AUTHORITY',
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
  expect(delivery?.supportAudit).toContainEqual(
    expect.objectContaining({ sourceId: f.authority.id, quoteStatus: 'MATCHED' }),
  );
});

it.each(['revoke', 'cancel'] as const)(
  'refuses included research when authorization changes before dispatch: %s',
  async (mode) => {
    let changed = false;
    const f = await fixture(async (name, current) => {
      if (changed || !name.endsWith('search_case_law')) return;
      changed = true;
      if (mode === 'revoke') current.authorizeOwner.mockRejectedValue(new Error('ACCESS_REVOKED'));
      else await current.commercial.service.cancelExecution(owner, current.run.id, 'cancel-research');
    });
    await f.worker.runOnce();
    expect(changed).toBe(true);
    expect(f.search).not.toHaveBeenCalled();
    expect(f.verify).not.toHaveBeenCalled();
    expect((await f.commercial.service.getExecution(owner, f.run.id)).status).not.toBe('COMPLETED');
    expect(await f.commercial.finance.getReceipt(owner, f.run.id)).toMatchObject({
      chargedCents: 0,
      releasedCents: 1150,
    });
  },
);

it('adaptive refinement preserves one reservation, terminal verification and a single committed delivery', async () => {
  const f = await fixture(undefined, true);
  await f.worker.runOnce();
  const execution = await f.commercial.service.getExecution(owner, f.run.id);
  expect(execution.status).toBe('COMPLETED');
  const internal = await f.commercial.service.store.workspace.getExecution(owner, f.run.id);
  const state = internal!.checkpoint!.caseTask as any;
  expect(state.graph.revision).toBe(1);
  expect(state.profiles.map((p: any) => p.role)).toEqual([
    'legal-orchestrator',
    'matter-analyst',
    'adversarial-reviewer',
    'legal-researcher',
    'adversarial-reviewer',
    'authority-verifier',
  ]);
  expect(state.graph.archivedOutputs['adversarial-reviewer:0']).toBeDefined();
  expect(f.search).toHaveBeenCalledOnce();
  expect(f.transport.mock.calls.length).toBeLessThanOrEqual(24);
  expect(execution.deliveryIds).toHaveLength(1);
  expect(await f.commercial.finance.getReceipt(owner, f.run.id)).toMatchObject({
    chargedCents: 50,
    releasedCents: 1100,
    status: 'COMPLETED',
    uncertainMicroUsd: 0,
  });
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(1950);
  const calls = f.transport.mock.calls.length;
  await f.worker.runOnce();
  expect(f.transport.mock.calls.length).toBe(calls);
});

it('cooperative cancellation during adaptive refinement prevents research and releases the reservation', async () => {
  let cancelled = false;
  const f = await fixture(async (name, current) => {
    if (!cancelled && name.endsWith('search_case_law')) {
      cancelled = true;
      await current.commercial.service.cancelExecution(owner, current.run.id, 'cancel-refinement');
    }
  }, true);
  await f.worker.runOnce();
  expect(cancelled).toBe(true);
  expect(f.search).not.toHaveBeenCalled();
  expect((await f.commercial.service.getExecution(owner, f.run.id)).status).toBe('CANCELLED');
  expect(await f.commercial.finance.getReceipt(owner, f.run.id)).toMatchObject({
    chargedCents: 0,
    releasedCents: 1150,
    uncertainMicroUsd: 0,
  });
});

it('rejects a changed selected snapshot before provider HTTP even with research enabled', async () => {
  const f = await fixture();
  const lease = (await f.commercial.service.claimNext('snapshot-worker'))!;
  await f.commercial.service.beginStep(lease, 'snapshot');
  const binding = {
    ...owner,
    executionId: f.run.id,
    conversationId: f.run.conversationId,
    contextRevision: f.run.contextRevision,
    objective: 'Pesquisar',
  };
  const native = new NativeCaseContextService(f.db, async () => {});
  const packet = await native.load(binding);
  packet.sources[0].text = 'Alteração não autorizada';
  await expect(
    f.commercial.providerRuntime.fetchFor(f.run.id, packet)('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, input: 'synthetic', tools: [] }),
    }),
  ).rejects.toThrow('CONTEXT_CONFLICT');
  expect(f.transport).not.toHaveBeenCalled();
  expect((await f.client.execute('SELECT id FROM commercial_calls')).rows).toHaveLength(0);
});

it('included research requires its owner and an active commercial reservation', async () => {
  const f = await fixture();
  const lease = (await f.commercial.service.claimNext('gate-worker'))!;
  await f.commercial.service.beginStep(lease, 'gate');
  const binding = {
    ...owner,
    executionId: f.run.id,
    conversationId: f.run.conversationId,
    contextRevision: f.run.contextRevision,
    objective: 'Pesquisar',
  };
  const operation = vi.fn(async () => 'indexed');
  await expect(
    f.commercial.caseTask.executeIncludedResearch({ ...binding, userId: 'other' }, operation),
  ).rejects.toThrow('ACCESS_REVOKED');
  await f.commercial.finance.finalize(owner, f.run.id, { usableDelivery: false, outcome: 'CANCELLED' });
  await expect(f.commercial.caseTask.executeIncludedResearch(binding, operation)).rejects.toThrow(
    'EXECUTION_NOT_AUTHORIZED',
  );
  expect(operation).not.toHaveBeenCalled();
});
