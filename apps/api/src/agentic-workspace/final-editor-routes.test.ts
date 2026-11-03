import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyReply } from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  DraftRepository,
  AgenticWorkspaceRepository,
  NativeCaseTaskRepository,
} from '@forgelex/persistence';
import type { AgenticTaskDelivery } from '@forgelex/domain';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { registerAgenticWorkspace, type AgenticWorkspaceRuntimeOptions } from './execution-routes.js';
import { ExecutionService } from './execution-service.js';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { ApprovedCaseContextRepository } from '../../../../packages/persistence/src/repositories/approved-case-context-repository.js';
import { FinalEditorService, type FinalEditorGenerationOptions } from '@forgelex/legal-workflows';
import { FakeAgentProvider } from '@forgelex/agent-core';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const cleanup: (() => Promise<void>)[] = [];

it.each(['length', 'trim'])('aplicação humana recusa resultado fora do contrato %s', async (boundary) => {
  const f = await applicationFixture(
    'ACCEPT',
    boundary === 'length' ? 'O pedido esta condicionado. 😀' + 'x'.repeat(15970) : undefined,
  );
  const proposal = {
    ...f.proposal,
    changes: [
      {
        ...f.proposal.changes[0],
        ...(boundary === 'length'
          ? { after: 'está sujeito a conferência' }
          : { start: 0, end: 1, before: 'O', after: ' O' }),
      },
    ],
  };
  const decision = await f.post('decisions', { ...f.decision, proposal, commandId: randomUUID(), expectedRevision: 1 });
  expect(decision.statusCode, decision.body).toBe(200);
  const before = await f.snapshot();
  const result = await f.post('applications', {
    ...f.command,
    proposalHash: decision.json().history.at(-1).proposalHash,
    expectedRevision: 2,
  });
  expect(result.statusCode).toBe(boundary === 'length' ? 400 : 409);
  expect(await f.snapshot()).toEqual(before);
});

it('aplicação humana conta no teto existente de cem comandos sem truncar histórico', async () => {
  const f = await applicationFixture();
  const [row] = (await f.client.execute('SELECT editorial_review_json FROM agentic_task_deliveries')).rows;
  const record = JSON.parse(String(row.editorial_review_json));
  record.history = Array.from({ length: 100 }, () => ({ ...record.history[0], commandId: randomUUID() }));
  record.revision = 100;
  await f.client.execute({
    sql: 'UPDATE agentic_task_deliveries SET editorial_review_json=? WHERE id=?',
    args: [JSON.stringify(record), f.saved.id],
  });
  const before = await f.snapshot();
  const response = await f.post('applications', { ...f.command, expectedRevision: 100 });
  expect(response.statusCode).toBe(409);
  expect(response.json().error).toBe('EDITORIAL_REVIEW_LIMIT');
  expect(await f.snapshot()).toEqual(before);
});

it('aplicação humana bloqueia contexto alterado e mantém recibo vazio', async () => {
  const f = await applicationFixture();
  await f.workspace.reviseContext(f.owner, f.conversation.id, 1, { ...f.context, text: 'Contexto humano atualizado.' });
  const before = await f.snapshot();
  expect((await f.post('applications', f.command)).statusCode).toBe(409);
  expect(await f.snapshot()).toEqual(before);
});

async function applicationFixture(action = 'ACCEPT', documentContent?: string) {
  const f = await fixture(undefined, undefined, documentContent);
  const post = (suffix: string, body: unknown, token = 'owner') =>
    f.app.inject({
      method: 'POST',
      url: `${f.path}/editorial-review/${suffix}`,
      headers: { authorization: `Bearer ${token}` },
      payload: body as any,
    });
  const preview = (await post('preview', { ...f.target, proposal: f.proposal })).json();
  const decision = {
    ...f.target,
    proposal: f.proposal,
    contextHash: preview.contextHash,
    expectedRevision: 0,
    commandId: randomUUID(),
    decision: { itemId: 'edit', action, reason: 'Trecho conferido.' },
  };
  const saved = await post('decisions', decision);
  expect(saved.statusCode).toBe(200);
  const command = {
    ...f.target,
    proposalHash: saved.json().history[0].proposalHash,
    contextHash: preview.contextHash,
    expectedRevision: 1,
    commandId: randomUUID(),
    itemIds: ['edit'],
    reason: 'Aplicar a acentuação conferida.',
    confirmed: true,
  };
  return { ...f, post, command, decision };
}

it('aplicação humana cria versão derivada sem alterar original, entrega ou decisões', async () => {
  const f = await applicationFixture();
  const repo = new DraftRepository(f.db);
  const original = await repo.getVersion(f.owner.tenantId, f.matter.id, f.target.draftId, f.target.versionId);
  const before = await f.snapshot();
  const response = await f.post('applications', f.command);
  expect(response.statusCode).toBe(200);
  const receipt = response.json().application;
  expect(receipt).toMatchObject({
    commandId: f.command.commandId,
    baseVersionId: f.target.versionId,
    itemIds: ['edit'],
    appliedBy: f.owner.userId,
    reason: f.command.reason,
    reviewRevision: 1,
  });
  const current = await repo.getCurrentVersion(f.owner.tenantId, f.matter.id, f.target.draftId);
  expect(current?.version).toMatchObject({
    id: receipt.versionId,
    versionNumber: 2,
    source: 'HUMAN',
    status: 'DRAFT',
    derivedFromVersionId: f.target.versionId,
    createdBy: f.owner.userId,
  });
  expect(current?.sections[0].content).toBe('O pedido está condicionado. 😀');
  expect(await repo.getVersion(f.owner.tenantId, f.matter.id, f.target.draftId, f.target.versionId)).toEqual(original);
  const after = await f.snapshot();
  expect(after.slice(4)).toEqual(before.slice(4));
  expect(after[3][0].payload_json).toEqual(before[3][0].payload_json);
  expect(after[3][0].content_hash).toEqual(before[3][0].content_hash);
  expect(response.json().history).toHaveLength(1);
  expect(response.json().stale).toBe(true);
  expect(f.provider).not.toHaveBeenCalled();
});

it('aplicação humana repete exatamente uma vez e reconcilia o recibo após nova versão', async () => {
  const f = await applicationFixture();
  const applied = await f.post('applications', f.command);
  expect(applied.statusCode).toBe(200);
  expect((await f.post('applications', f.command)).json()).toEqual(applied.json());
  expect((await f.post('applications', { ...f.command, reason: 'Outro motivo.' })).statusCode).toBe(409);
  expect((await f.post('applications', { ...f.command, commandId: randomUUID() })).statusCode).toBe(409);
  const history = await f.app.inject({
    method: 'GET',
    url: `${f.path}/editorial-review?${new URLSearchParams({ ...f.target, commandId: f.command.commandId })}`,
    headers: { authorization: 'Bearer owner' },
  });
  expect(history.json().reconciliation.status).toBe('RECORDED');
  expect(history.json().application).toEqual(applied.json().application);
  expect(await new DraftRepository(f.db).listVersions(f.owner.tenantId, f.matter.id, f.target.draftId)).toHaveLength(2);
  f.revoke();
  expect((await f.post('applications', f.command)).statusCode).toBe(403);
});

it.each(['REJECT', 'DEFER'])('aplicação humana recusa última decisão %s', async (action) => {
  const f = await applicationFixture(action),
    before = await f.snapshot();
  expect((await f.post('applications', f.command)).statusCode).toBe(409);
  expect(await f.snapshot()).toEqual(before);
});

it('aplicação humana exige seleção única, confirmação, revisão e proposta persistida', async () => {
  const f = await applicationFixture(),
    before = await f.snapshot();
  for (const patch of [
    { itemIds: [] },
    { itemIds: ['edit', 'edit'] },
    { confirmed: false },
    { reason: '' },
    { proposal: f.proposal },
    { after: 'texto arbitrário' },
  ])
    expect((await f.post('applications', { ...f.command, ...patch })).statusCode).toBe(400);
  for (const patch of [
    { itemIds: ['inventado'] },
    { proposalHash: 'a'.repeat(64) },
    { contextHash: 'a'.repeat(64) },
    { expectedRevision: 0 },
    { commandId: f.decision.commandId },
  ])
    expect((await f.post('applications', { ...f.command, ...patch })).statusCode).toBe(409);
  expect(await f.snapshot()).toEqual(before);
});

it('aplicação humana preserva sessão, escrita, proprietário e revogação', async () => {
  const f = await applicationFixture(),
    before = await f.snapshot();
  for (const [token, status] of [
    ['other', 404],
    ['tenant', 404],
    ['readOnly', 403],
    ['oauth', 403],
  ] as const)
    expect((await f.post('applications', f.command, token)).statusCode).toBe(status);
  f.revoke();
  expect((await f.post('applications', f.command)).statusCode).toBe(403);
  expect(await f.snapshot()).toEqual(before);
});

it('aplicação humana recusa decisão mais recente e edição manual concorrente', async () => {
  const f = await applicationFixture();
  expect(
    (
      await f.post('decisions', {
        ...f.decision,
        commandId: randomUUID(),
        expectedRevision: 1,
        decision: { ...f.decision.decision, action: 'REJECT' },
      })
    ).statusCode,
  ).toBe(200);
  const before = await f.snapshot();
  expect((await f.post('applications', { ...f.command, expectedRevision: 2 })).statusCode).toBe(409);
  expect(await f.snapshot()).toEqual(before);
  const other = await applicationFixture();
  await new DraftRepository(other.db).createVersion({
    tenantId: other.owner.tenantId,
    matterId: other.matter.id,
    draftId: other.target.draftId,
    title: 'Minuta',
    createdBy: other.owner.userId,
    source: 'HUMAN',
    contentHash: hash('Edição humana'),
    sections: [{ ordinal: 1, title: 'Pedido', content: 'Edição humana' }],
    baseVersionId: other.target.versionId,
    expectedCurrentVersionId: other.target.versionId,
  });
  const edited = await other.snapshot();
  expect((await other.post('applications', other.command)).statusCode).toBe(409);
  expect(await other.snapshot()).toEqual(edited);
});

it('aplicação humana reverte versão se falhar antes de salvar recibo', async () => {
  const f = await applicationFixture(),
    before = await f.snapshot();
  const insert = DraftRepository.prototype.insertVersionInTransaction;
  const fault = vi
    .spyOn(DraftRepository.prototype, 'insertVersionInTransaction')
    .mockImplementationOnce(async function (...args) {
      await insert.apply(this, args);
      throw new Error('SIMULATED_WRITE_FAILURE');
    });
  try {
    expect((await f.post('applications', f.command)).statusCode).toBe(503);
  } finally {
    fault.mockRestore();
  }
  expect(await f.snapshot()).toEqual(before);
});

it.each([true, false])('aplicação humana serializa concorrência com comando igual=%s', async (same) => {
  const f = await applicationFixture();
  const results = await Promise.all([
    f.post('applications', f.command),
    f.post('applications', { ...f.command, commandId: same ? f.command.commandId : randomUUID() }),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual(same ? [200, 200] : [200, 409]);
  expect(await new DraftRepository(f.db).listVersions(f.owner.tenantId, f.matter.id, f.target.draftId)).toHaveLength(2);
});

it('aplicação humana respeita subset, offsets e Unicode sem aplicar sugestão substantiva', async () => {
  const f = await applicationFixture();
  const first = f.proposal.changes[0];
  const proposal = {
    ...f.proposal,
    changes: [
      first,
      { ...first, id: 'constructor', start: 2, end: 8, before: 'pedido', after: 'requerimento' },
      { ...first, id: 'emoji', start: 28, end: 30, before: '😀', after: '🙂' },
    ],
    substantiveSuggestions: [
      {
        id: 'substantive',
        sectionIndex: 0,
        sectionHash: first.sectionHash,
        start: 9,
        end: 13,
        before: 'esta',
        reason: 'Reavaliar fundamento.',
        sourceIds: ['norm'],
      },
    ],
  };
  let revision = 1;
  let proposalHash = '';
  for (const itemId of ['edit', 'constructor', 'emoji', 'substantive']) {
    const saved = await f.post('decisions', {
      ...f.decision,
      proposal,
      expectedRevision: revision++,
      commandId: randomUUID(),
      decision: { itemId, action: 'ACCEPT', reason: 'Conferido individualmente.' },
    });
    expect(saved.statusCode).toBe(200);
    proposalHash = saved.json().history.at(-1).proposalHash;
  }
  const command = { ...f.command, proposalHash, expectedRevision: revision, itemIds: ['constructor', 'emoji'] };
  expect((await f.post('applications', { ...command, itemIds: ['substantive'] })).statusCode).toBe(409);
  expect((await f.post('applications', command)).statusCode).toBe(200);
  const current = await new DraftRepository(f.db).getCurrentVersion(f.owner.tenantId, f.matter.id, f.target.draftId);
  expect(current?.sections[0].content).toBe('O requerimento esta condicionado. 🙂');
});

it('aplicação humana preserva vínculos e citações sem copiar aprovação ou verificação', async () => {
  const f = await applicationFixture();
  const repo = new DraftRepository(f.db);
  const original = (await repo.getVersion(f.owner.tenantId, f.matter.id, f.target.draftId, f.target.versionId))!;
  const factId = randomUUID(),
    evidenceId = randomUUID(),
    authorityId = randomUUID();
  // Seed metadata on the synthetic original to exercise preservation independent of workflow defaults.
  await f.client.execute({
    sql: 'UPDATE draft_sections SET linked_fact_ids=?, linked_evidence_ids=?, linked_authority_ids=? WHERE id=?',
    args: [
      JSON.stringify([factId]),
      JSON.stringify([evidenceId]),
      JSON.stringify([authorityId]),
      original.sections[0].id,
    ],
  });
  await f.client.execute({ sql: 'UPDATE drafts SET status=? WHERE id=?', args: ['APPROVED', f.target.draftId] });
  await f.client.execute({
    sql: 'UPDATE draft_versions SET status=? WHERE id=?',
    args: ['APPROVED', f.target.versionId],
  });
  await f.client.execute({
    sql: 'INSERT INTO citation_anchors (id,tenant_id,matter_id,draft_id,draft_version_id,section_id,target_type,target_id,citation_text,verified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    args: [
      randomUUID(),
      f.owner.tenantId,
      f.matter.id,
      f.target.draftId,
      f.target.versionId,
      original.sections[0].id,
      'AUTHORITY',
      authorityId,
      'Referência sintética',
      1,
      new Date().toISOString(),
    ],
  });
  expect((await f.post('applications', f.command)).statusCode).toBe(200);
  const current = (await repo.getCurrentVersion(f.owner.tenantId, f.matter.id, f.target.draftId))!;
  expect(current.sections[0]).toMatchObject({
    linkedFactIds: [factId],
    linkedEvidenceIds: [evidenceId],
    linkedAuthorityIds: [authorityId],
  });
  expect(current.citations[0]).toMatchObject({
    targetId: authorityId,
    citationText: 'Referência sintética',
    verified: false,
    sectionId: current.sections[0].id,
  });
  expect(current.version.status).toBe('DRAFT');
  expect(
    (await repo.getVersion(f.owner.tenantId, f.matter.id, f.target.draftId, f.target.versionId))?.version.status,
  ).toBe('APPROVED');
});

it.each(['closedPilot', 'commercial'] as const)('aplicação humana preserva fronteira %s', async (boundary) => {
  const f = await fixture(boundary);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `${f.path}/editorial-review/applications`,
        headers: { authorization: 'Bearer owner' },
        payload: {},
      })
    ).statusCode,
  ).toBe(404);
});
function simulatedGeneration(afterLoad = () => {}) {
  const createProvider = vi.fn<FinalEditorGenerationOptions['createProvider']>(
    ({ registry, context, sectionAnchors }) => {
      afterLoad();
      const {
        document: _,
        sources: _s,
        claims: _c,
        requirements: _r,
        findings: _f,
        supportAudit: _a,
        ...envelope
      } = context;
      return new FakeAgentProvider(registry, undefined, [
        {
          thought: 'Simulação editorial',
          toolCall: {
            name: 'editorial.submit',
            input: {
              ...envelope,
              status: 'LIMITED',
              humanReviewRequired: true,
              legalAssessment: 'NOT_EVALUATED',
              changes: [
                {
                  id: 'edit',
                  category: 'GRAMMAR',
                  sectionIndex: 0,
                  sectionHash: sectionAnchors[0].sectionHash,
                  start: 9,
                  end: 13,
                  before: 'esta',
                  after: 'está',
                  reason: 'Acentuação.',
                  sourceIds: ['norm'],
                },
              ],
              substantiveSuggestions: [],
              limitations: ['Conferir suporte.'],
            },
          },
        },
      ]);
    },
  );
  return { createProvider };
}
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
it('geração simulada conecta minuta autorizada, sem alterações ou execução v8', async () => {
  const generation = simulatedGeneration(),
    f = await fixture(undefined, generation);
  const before = await f.snapshot();
  const response = await f.generate();
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ mode: 'SIMULATED', profileVersion: '1.0.0', proposal: f.proposal });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(generation.createProvider).toHaveBeenCalledTimes(1);
  expect(f.provider).not.toHaveBeenCalled();
  expect(await f.snapshot()).toEqual(before);
});
it('geração fica desabilitada sem factory e não aceita contexto/provider do cliente', async () => {
  const f = await fixture();
  expect((await f.generate()).json().error).toBe('EDITORIAL_GENERATION_DISABLED');
  for (const extra of [{ provider: 'openai' }, { context: f.delivery }, { proposal: f.proposal }])
    expect((await f.generate({ ...f.target, ...extra })).statusCode).toBe(400);
});
it('geração preserva sessão, proprietário, scopes e fronteiras dos runtimes', async () => {
  const generation = simulatedGeneration(),
    f = await fixture(undefined, generation);
  for (const [token, status] of [
    ['other', 404],
    ['tenant', 404],
    ['scope', 403],
    ['oauth', 403],
  ] as const)
    expect((await f.generate(undefined, token)).statusCode).toBe(status);
  for (const boundary of ['closedPilot', 'commercial'] as const) {
    const restricted = await fixture(boundary, generation);
    expect((await restricted.generate()).statusCode).toBe(404);
  }
  expect(generation.createProvider).not.toHaveBeenCalled();
});
it('geração descarta proposta se acesso for revogado durante o provider', async () => {
  let revoke = () => {};
  const generation = simulatedGeneration(() => revoke()),
    f = await fixture(undefined, generation);
  revoke = f.revoke;
  expect((await f.generate()).statusCode).toBe(403);
  expect(generation.createProvider).toHaveBeenCalledTimes(1);
});
it.each(['during-query', 'already-aborted'])('não inicia geração após desconexão %s', async (when) => {
  const generation = simulatedGeneration(),
    f = await fixture(undefined, generation);
  let response: FastifyReply;
  f.app.addHook('onRequest', async (req, reply) => {
    response = reply;
    if (when === 'already-aborted') Object.defineProperty(req.raw, 'aborted', { value: true });
  });
  const sent = new Promise<string>((resolve) => {
    f.app.addHook('onSend', async (_req, _reply, payload) => {
      resolve(payload as string);
      return payload;
    });
  });
  const original = NativeCaseTaskRepository.prototype.getDeliveryContext;
  const read = vi
    .spyOn(NativeCaseTaskRepository.prototype, 'getDeliveryContext')
    .mockImplementationOnce(async function (...args) {
      if (when === 'during-query') response.raw.emit('close');
      return original.apply(this, args);
    });
  try {
    if (when === 'during-query') await expect(f.generate()).rejects.toThrow('response destroyed before completion');
    else await f.generate();
    expect(JSON.parse(await sent).error).toBe('EDITORIAL_GENERATION_CANCELLED');
    expect(generation.createProvider).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
  }
});
async function fixture(
  boundary?: 'closedPilot' | 'commercial',
  generation?: FinalEditorGenerationOptions,
  documentContent = 'O pedido esta condicionado. 😀',
) {
  const c = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: 'editorial', userId: 'boni' };
  const matter = await new MatterRepository(c.db).createMatter({
    ...owner,
    createdBy: owner.userId,
    title: 'Caso sintético',
  });
  const workspace = new AgenticWorkspaceRepository(c.db);
  const context = { origin: 'USER' as const, text: 'Relato sintético.', documents: [] };
  const conversation = await workspace.createConversation(owner, { matterId: matter.id, objective: 'Minuta', context });
  const execution = await workspace.createExecution(owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: 'editorial',
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await workspace.compareAndSetStatus(owner, execution.id, 'QUEUED', 'RUNNING');
  let allowed = true;
  const authorize = async () => {
    if (!allowed) throw new Error('ACCESS_REVOKED');
  };
  const native = new NativeCaseTaskRepository(c.db, authorize);
  const binding = {
    ...owner,
    executionId: execution.id,
    conversationId: conversation.id,
    contextRevision: 1,
    objective: 'Minuta',
    matterId: matter.id,
  };
  const packet = await native.load(binding);
  const legal = { id: 'norm', kind: 'NORM' as const, text: 'Norma sintética.', contentHash: hash('Norma sintética.') };
  const delivery: AgenticTaskDelivery = {
    action: 'create_document',
    contextId: conversation.id,
    contextRevision: 1,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    issues: [],
    claims: [{ id: 'c', classification: 'INFERENCE', statement: 'Pedido condicionado.', sourceIds: ['norm'] }],
    requirements: [{ id: 'r', statement: 'Conferir.', verified: false, sourceIds: ['norm'] }],
    findings: [
      { id: 'f', code: 'LIMITATION', severity: 'BLOCKING', statement: 'Suporte parcial.', sourceIds: ['norm'] },
    ],
    sources: [...packet.sources, legal].map(({ text: _, ...s }) => s),
    supportAudit: [
      {
        claimId: 'c',
        sourceId: 'norm',
        sourceContentHash: legal.contentHash,
        quoteStatus: 'MATCHED',
        quote: legal.text,
        modelAssessment: 'PARTIAL',
      },
    ],
    document: {
      title: 'Minuta',
      documentType: 'Manifestação',
      sections: [{ title: 'Pedido', content: documentContent, sourceIds: ['norm'] }],
    },
  };
  const saved = await native.save(binding, delivery);
  await workspace.saveProgress(owner, execution.id, { caseTask: { version: 8, evidence: [legal] } }, [saved.id]);
  await workspace.compareAndSetStatus(owner, execution.id, 'RUNNING', 'COMPLETED');
  const provider = vi.fn(() => {
    throw new Error('PROVIDER_MUST_NOT_RUN');
  });
  const auth = new AuthAdapter({
    verify: async (token) =>
      token === 'missing'
        ? null
        : {
            ...owner,
            tenantId: token === 'tenant' ? 'other' : owner.tenantId,
            userId: token === 'other' ? 'other' : owner.userId,
            subjectId: token,
            roles: ['lawyer'],
            authMethod: token === 'oauth' ? 'oauth_access_token' : 'session',
            scopes:
              token === 'scope'
                ? ['research:read']
                : token === 'readOnly'
                  ? ['research:read', 'matter:read']
                  : ['research:read', 'matter:read', 'matter:write'],
          },
  });
  const app = Fastify();
  const caseTask = { authorizeNative: authorize, createProvider: provider };
  const canManageExecution = vi.fn(() => false);
  // Boundary fixture: real execution store, only the runtime's admission decision is controlled.
  const options = boundary
    ? ({
        scheduler: false,
        [boundary]: {
          caseTask,
          service: new ExecutionService(c.db, c.client),
          assertOwner: () => {},
          canManageExecution,
        },
      } as AgenticWorkspaceRuntimeOptions)
    : { scheduler: false, caseTask };
  registerAgenticWorkspace(app, {
    database: c.db,
    client: c.client,
    auth,
    environment: { FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' },
    options: { ...options, editorialGeneration: generation },
  });
  cleanup.push(async () => {
    await app.close();
    c.client.close();
  });
  const path = `/api/agentic/deliveries/${encodeURIComponent(saved.id)}`;
  const target = { draftId: saved.draftId!, versionId: saved.versionId! };
  const get = (token = 'owner', selected = target) =>
    app.inject({
      method: 'GET',
      url: `${path}/editorial-context?${new URLSearchParams(selected)}`,
      headers: { authorization: `Bearer ${token}` },
    });
  const proposal = {
    contractVersion: '1.0.0',
    contextId: conversation.id,
    contextRevision: 1,
    deliveryId: saved.id,
    ...target,
    documentHash: hash(JSON.stringify(delivery.document)),
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [
      {
        id: 'edit',
        category: 'GRAMMAR',
        sectionIndex: 0,
        sectionHash: hash(delivery.document!.sections[0].content),
        start: 9,
        end: 13,
        before: 'esta',
        after: 'está',
        reason: 'Acentuação.',
        sourceIds: ['norm'],
      },
    ],
    substantiveSuggestions: [],
    limitations: ['Conferir suporte.'],
  };
  const validate = (body: unknown = { ...target, proposal }, token = 'owner') =>
    app.inject({
      method: 'POST',
      url: `${path}/editorial-proposals/validate`,
      headers: { authorization: `Bearer ${token}` },
      payload: body as any,
    });
  const generate = (body: unknown = target, token = 'owner') =>
    app.inject({
      method: 'POST',
      url: `${path}/editorial-proposals/generate`,
      headers: { authorization: `Bearer ${token}` },
      payload: body as any,
    });
  const snapshot = async () =>
    Promise.all(
      [
        'drafts',
        'draft_versions',
        'draft_sections',
        'agentic_task_deliveries',
        'agentic_executions',
        'agentic_contexts',
      ].map(async (table) => (await c.client.execute(`SELECT * FROM ${table}`)).rows),
    );
  return {
    ...c,
    app,
    path,
    owner,
    matter,
    workspace,
    context,
    conversation,
    execution,
    native,
    binding,
    delivery,
    saved,
    get,
    validate,
    generate,
    target,
    proposal,
    provider,
    canManageExecution,
    snapshot,
    revoke: () => {
      allowed = false;
    },
  };
}

it('carrega somente entrega/minuta persistida e valida sem escrever nem chamar IA', async () => {
  const f = await fixture();
  const before = await f.snapshot();
  const loaded = await f.get();
  expect(loaded.statusCode).toBe(200);
  expect(loaded.headers['cache-control']).toBe('no-store');
  expect(loaded.json()).toMatchObject({
    ...f.target,
    deliveryId: f.saved.id,
    contractVersion: '1.0.0',
    document: f.delivery.document,
    claims: f.delivery.claims,
    findings: f.delivery.findings,
    supportAudit: f.delivery.supportAudit,
  });
  expect(loaded.json().sources).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'norm', text: 'Norma sintética.' })]),
  );
  const validated = await f.validate();
  expect(validated.statusCode).toBe(200);
  expect(validated.json()).toEqual(f.proposal);
  expect(await f.snapshot()).toEqual(before);
  expect(f.provider).not.toHaveBeenCalled();
});
it.each([
  ['other', 404],
  ['tenant', 404],
  ['oauth', 403],
  ['scope', 403],
  ['missing', 401],
])('isola sessão/escopo/proprietário %s', async (token, status) => {
  const f = await fixture();
  expect((await f.get(String(token))).statusCode).toBe(status);
  expect((await f.validate(undefined, String(token))).statusCode).toBe(status);
});
it('revalida autorização entre leitura e validação', async () => {
  const f = await fixture();
  expect((await f.get()).statusCode).toBe(200);
  f.revoke();
  expect((await f.validate()).statusCode).toBe(403);
  expect(f.provider).not.toHaveBeenCalled();
});
it.each(['closedPilot', 'commercial'] as const)('preserva fronteira de execução do runtime %s', async (boundary) => {
  const f = await fixture(boundary);
  expect((await f.get()).statusCode).toBe(404);
  expect((await f.validate()).statusCode).toBe(404);
  expect(f.canManageExecution).toHaveBeenCalledWith(
    expect.objectContaining({ id: f.execution.id, tenantId: f.owner.tenantId, userId: f.owner.userId }),
  );
  expect(f.provider).not.toHaveBeenCalled();
});
it('rejeita IDs divergentes e contexto/fontes fornecidos pelo cliente', async () => {
  const f = await fixture();
  expect((await f.get('owner', { ...f.target, versionId: 'outro' })).statusCode).toBe(409);
  expect((await f.validate({ ...f.target, proposal: f.proposal, context: f.delivery })).statusCode).toBe(400);
  expect((await f.validate({ ...f.target, proposal: { ...f.proposal, contextRevision: 2 } })).statusCode).toBe(400);
});
it('recusa versão corrente alterada mesmo preservando a versão entregue', async () => {
  const f = await fixture();
  await new DraftRepository(f.db).createVersion({
    ...f.owner,
    matterId: f.matter.id,
    draftId: f.target.draftId,
    createdBy: f.owner.userId,
    title: 'Nova',
    source: 'HUMAN',
    status: 'DRAFT',
    contentHash: hash('Nova'),
    expectedCurrentVersionId: f.target.versionId,
    sections: [
      {
        title: 'Nova',
        content: 'Edição humana.',
        ordinal: 1,
        linkedFactIds: [],
        linkedEvidenceIds: [],
        linkedThesisIds: [],
      },
    ],
  });
  expect((await f.get()).statusCode).toBe(409);
  expect((await f.validate()).statusCode).toBe(409);
});
it('recusa revisão de contexto posterior', async () => {
  const f = await fixture();
  await f.workspace.reviseContext(f.owner, f.conversation.id, 1, { ...f.context, text: 'Revisado.' });
  expect((await f.get()).statusCode).toBe(409);
});
it('recupera approvedItem da aprovação real e recusa alteração posterior do fato', async () => {
  const f = await createEvidenceFixture();
  cleanup.push(async () => {
    f.client.close();
  });
  const review = await f.reviews.preview(f.owner, f.saved.id);
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: [{ itemId: review.items.find((item) => item.kind === 'FACT')!.id, action: 'ADOPT' }],
  });
  const refs = await new ApprovedCaseContextRepository(f.db).capture(f.owner, f.matter.id);
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: 'Minuta',
    context: { origin: 'USER', text: '', documents: [], approvedItems: refs },
  });
  const run = await f.workspace.createExecution(f.owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: 'editorial-approved',
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await f.workspace.compareAndSetStatus(f.owner, run.id, 'QUEUED', 'RUNNING');
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  const binding = {
    ...f.owner,
    executionId: run.id,
    conversationId: conversation.id,
    contextRevision: 1,
    matterId: f.matter.id,
    objective: 'Minuta',
  };
  const packet = await native.load(binding);
  const saved = await native.save(binding, {
    ...f.delivery,
    action: 'create_document',
    contextId: conversation.id,
    evidenceMatrix: undefined,
    claims: [],
    issues: [],
    supportAudit: [],
    sources: packet.sources.map(({ text: _, ...source }) => source),
    document: {
      title: 'Minuta',
      documentType: 'Manifestação',
      sections: [
        { title: 'Fatos', content: 'Relato controvertido.', sourceIds: packet.sources.map((source) => source.id) },
      ],
    },
  });
  await f.workspace.compareAndSetStatus(f.owner, run.id, 'RUNNING', 'COMPLETED');
  const editor = new FinalEditorService(native);
  const target = { draftId: saved.draftId!, versionId: saved.versionId! };
  const context = await editor.load(f.owner, saved.id, target);
  expect(context.sources).toEqual(packet.sources);
  expect(context.sources[0].approvedItem?.status).toBe('DISPUTED');
  expect(JSON.parse(context.sources[0].text)).toEqual(context.sources[0].approvedItem);
  await f.client.execute("UPDATE facts SET statement='Alteração posterior'");
  await expect(editor.load(f.owner, saved.id, target)).rejects.toThrow('APPROVED_CONTEXT_CHANGED');
});
it('recusa entrega sem auditoria explícita e detecta hash adulterado da entrega', async () => {
  const f = await fixture();
  const payload = JSON.stringify({ ...f.delivery, supportAudit: undefined });
  await f.client.execute({
    sql: 'UPDATE agentic_task_deliveries SET payload_json=?, content_hash=? WHERE id=?',
    args: [payload, hash(payload), f.saved.id],
  });
  expect((await f.get()).json().error).toBe('EDITORIAL_AUDIT_UNAVAILABLE');
  await f.client.execute({
    sql: 'UPDATE agentic_task_deliveries SET content_hash=? WHERE id=?',
    args: [hash('alterado'), f.saved.id],
  });
  expect((await f.get()).statusCode).toBe(503);
});
it.each(['checkpoint', 'unfinished', 'draft-text', 'draft-hash', 'source-missing', 'source-text'])(
  'falha fechado para %s',
  async (mode) => {
    const f = await fixture();
    if (mode === 'checkpoint')
      await f.client.execute({ sql: 'DELETE FROM agentic_task_deliveries WHERE id=?', args: [f.saved.id] });
    else if (mode === 'draft-text')
      await f.client.execute({
        sql: 'UPDATE draft_sections SET content=? WHERE draft_version_id=?',
        args: ['Alterado.', f.target.versionId],
      });
    else if (mode === 'draft-hash')
      await f.client.execute({
        sql: 'UPDATE draft_versions SET content_hash=? WHERE id=?',
        args: [hash('divergente'), f.target.versionId],
      });
    else {
      const execution = (await f.workspace.getExecution(f.owner, f.execution.id))!;
      if (mode === 'unfinished') execution.status = 'RUNNING';
      else if (mode === 'source-missing') execution.checkpoint = { caseTask: { version: 8, evidence: [] } };
      else (execution.checkpoint!.caseTask as any).evidence[0].text = 'Texto adulterado.';
      await f.client.execute({
        sql: 'UPDATE agentic_executions SET payload_json=? WHERE id=?',
        args: [JSON.stringify(execution), execution.id],
      });
    }
    expect((await f.get()).statusCode).toBe(mode === 'checkpoint' ? 404 : 409);
    expect(f.provider).not.toHaveBeenCalled();
  },
);

it('revisão humana salva histórico sem aplicar, recarrega e mantém replay idempotente', async () => {
  const f = await fixture();
  const request = (suffix = '', body?: unknown, token = 'owner') =>
    f.app.inject({
      method: body ? 'POST' : 'GET',
      url: `${f.path}/editorial-review${suffix}${body ? '' : '?' + new URLSearchParams(f.target)}`,
      headers: { authorization: `Bearer ${token}` },
      ...(body ? { payload: body as any } : {}),
    });
  const before = await f.snapshot();
  const preview = await request('/preview', { ...f.target, proposal: f.proposal });
  expect(preview.statusCode).toBe(200);
  expect(await f.snapshot()).toEqual(before);
  const body = {
    ...f.target,
    proposal: f.proposal,
    contextHash: preview.json().contextHash,
    expectedRevision: 0,
    commandId: randomUUID(),
    decision: { itemId: 'edit', action: 'ACCEPT', reason: 'Acentuação conferida.' },
  };
  const saved = await request('/decisions', body);
  expect(saved.statusCode).toBe(200);
  expect(saved.json().revision).toBe(1);
  expect(saved.json().history[0]).toMatchObject({
    decision: body.decision,
    decidedBy: f.owner.userId,
    proposal: f.proposal,
  });
  expect((await request()).json()).toEqual(saved.json());
  expect((await request('/decisions', body)).json()).toEqual(saved.json());
  expect((await request('/decisions', { ...body, decision: { ...body.decision, action: 'REJECT' } })).statusCode).toBe(
    409,
  );
  expect((await request('/decisions', { ...body, commandId: randomUUID() })).statusCode).toBe(409);
  const updated = await request('/decisions', {
    ...body,
    commandId: randomUUID(),
    expectedRevision: 1,
    decision: { ...body.decision, action: 'DEFER' },
  });
  expect(updated.json().history).toHaveLength(2);
  const after = await f.snapshot();
  const withoutHistory = (snapshot: any[]) =>
    snapshot.map((rows: any[]) => rows.map(({ editorial_review_json: _, ...row }) => row));
  expect(withoutHistory(after)).toEqual(withoutHistory(before));
  expect(f.provider).not.toHaveBeenCalled();
});
it('revisão humana recusa adulteração, falta de escrita, sessão externa e fonte/contexto obsoleto', async () => {
  const f = await fixture();
  const post = (suffix: string, body: unknown, token = 'owner') =>
    f.app.inject({
      method: 'POST',
      url: `${f.path}/editorial-review/${suffix}`,
      headers: { authorization: `Bearer ${token}` },
      payload: body as any,
    });
  const before = await f.snapshot();
  const preview = await post('preview', { ...f.target, proposal: f.proposal });
  expect(preview.statusCode).toBe(200);
  const body = {
    ...f.target,
    proposal: f.proposal,
    contextHash: preview.json().contextHash,
    expectedRevision: 0,
    commandId: randomUUID(),
    decision: { itemId: 'edit', action: 'ACCEPT', reason: 'Conferido.' },
  };
  for (const [token, code] of [
    ['other', 404],
    ['tenant', 404],
    ['oauth', 403],
    ['readOnly', 403],
  ] as const)
    expect((await post('decisions', body, token)).statusCode).toBe(code);
  for (const patch of [{ contextHash: 'a'.repeat(64) }, { decision: { ...body.decision, itemId: 'inventado' } }])
    expect((await post('decisions', { ...body, ...patch })).statusCode).toBe(409);
  expect(
    (await post('decisions', { ...body, proposal: { ...f.proposal, humanReviewRequired: false } })).statusCode,
  ).toBe(400);
  expect((await post('decisions', { ...body, decision: { ...body.decision, reason: '' } })).statusCode).toBe(400);
  expect((await post('decisions', { ...body, apply: true })).statusCode).toBe(400);
  expect(await f.snapshot()).toEqual(before);
  f.revoke();
  expect((await post('decisions', body)).statusCode).toBe(403);
  expect(f.provider).not.toHaveBeenCalled();
});
it.each(['closedPilot', 'commercial'] as const)('revisão humana preserva fronteira %s', async (boundary) => {
  const f = await fixture(boundary);
  const response = await f.app.inject({
    method: 'GET',
    url: `${f.path}/editorial-review?${new URLSearchParams(f.target)}`,
    headers: { authorization: 'Bearer owner' },
  });
  expect(response.statusCode).toBe(404);
});
it('revisão humana invalida contexto alterado e conserva histórico anterior', async () => {
  const f = await fixture();
  const post = (suffix: string, body: unknown) =>
    f.app.inject({
      method: 'POST',
      url: `${f.path}/editorial-review/${suffix}`,
      headers: { authorization: 'Bearer owner' },
      payload: body as any,
    });
  const preview = (await post('preview', { ...f.target, proposal: f.proposal })).json();
  const body = {
    ...f.target,
    proposal: f.proposal,
    contextHash: preview.contextHash,
    expectedRevision: 0,
    commandId: randomUUID(),
    decision: { itemId: 'edit', action: 'DEFER', reason: 'Aguardar conferência.' },
  };
  expect((await post('decisions', body)).statusCode).toBe(200);
  const payload = JSON.stringify({
    ...f.delivery,
    requirements: [{ ...f.delivery.requirements[0], statement: 'Novo requisito' }],
  });
  await f.client.execute({
    sql: 'UPDATE agentic_task_deliveries SET payload_json=?,content_hash=? WHERE id=?',
    args: [payload, hash(payload), f.saved.id],
  });
  const before = await f.snapshot();
  expect((await post('decisions', { ...body, expectedRevision: 1, commandId: randomUUID() })).statusCode).toBe(409);
  expect((await post('decisions', body)).statusCode).toBe(409);
  expect(await f.snapshot()).toEqual(before);
});
it('revisão humana recusa proposta acima do teto e item sem fundamento antes de escrever', async () => {
  const f = await fixture();
  const before = await f.snapshot();
  const response = await f.app.inject({
    method: 'POST',
    url: `${f.path}/editorial-review/preview`,
    headers: { authorization: 'Bearer owner' },
    payload: { ...f.target, proposal: { ...f.proposal, limitations: ['x'.repeat(2048)] } },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json().error).toBe('EDITORIAL_REVIEW_LIMIT');
  expect(await f.snapshot()).toEqual(before);
});
it.each([10, 100])(
  'revisão humana respeita limite de %i sem truncar histórico',
  async (limit) => {
    const f = await fixture();
    const preview = (
      await f.app.inject({
        method: 'POST',
        url: `${f.path}/editorial-review/preview`,
        headers: { authorization: 'Bearer owner' },
        payload: { ...f.target, proposal: f.proposal },
      })
    ).json();
    for (let i = 0; i <= limit; i++) {
      const proposal = limit === 10 ? { ...f.proposal, limitations: [`Ressalva ${i}`] } : f.proposal;
      const response = await f.app.inject({
        method: 'POST',
        url: `${f.path}/editorial-review/decisions`,
        headers: { authorization: 'Bearer owner' },
        payload: {
          ...f.target,
          proposal,
          contextHash: preview.contextHash,
          expectedRevision: i,
          commandId: randomUUID(),
          decision: { itemId: 'edit', action: 'DEFER', reason: `Conferir novamente ${i}` },
        },
      });
      expect(response.statusCode).toBe(i === limit ? 409 : 200);
      if (i === limit) expect(response.json().error).toBe('EDITORIAL_REVIEW_LIMIT');
    }
    const saved = (
      await f.app.inject({
        method: 'GET',
        url: `${f.path}/editorial-review?${new URLSearchParams(f.target)}`,
        headers: { authorization: 'Bearer owner' },
      })
    ).json();
    expect(saved.revision).toBe(limit);
    expect(saved.history).toHaveLength(limit);
  },
  15000,
);
it('revisão humana serializa decisões concorrentes da mesma entrega', async () => {
  const f = await fixture();
  const preview = (
    await f.app.inject({
      method: 'POST',
      url: `${f.path}/editorial-review/preview`,
      headers: { authorization: 'Bearer owner' },
      payload: { ...f.target, proposal: f.proposal },
    })
  ).json();
  const responses = await Promise.all(
    ['ACCEPT', 'REJECT'].map((action) =>
      f.app.inject({
        method: 'POST',
        url: `${f.path}/editorial-review/decisions`,
        headers: { authorization: 'Bearer owner' },
        payload: {
          ...f.target,
          proposal: f.proposal,
          contextHash: preview.contextHash,
          expectedRevision: 0,
          commandId: randomUUID(),
          decision: { itemId: 'edit', action, reason: 'Conferência em abas distintas.' },
        },
      }),
    ),
  );
  expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const saved = (
    await f.app.inject({
      method: 'GET',
      url: `${f.path}/editorial-review?${new URLSearchParams(f.target)}`,
      headers: { authorization: 'Bearer owner' },
    })
  ).json();
  expect(saved.history).toHaveLength(1);
});
it('histórico editorial continua consultável após nova versão e reconcilia comando sem permitir decisão obsoleta', async () => {
  const f = await fixture();
  const headers = { authorization: 'Bearer owner' };
  const preview = (
    await f.app.inject({
      method: 'POST',
      url: `${f.path}/editorial-review/preview`,
      headers,
      payload: { ...f.target, proposal: f.proposal },
    })
  ).json();
  const body = {
    ...f.target,
    proposal: f.proposal,
    contextHash: preview.contextHash,
    expectedRevision: 0,
    commandId: randomUUID(),
    decision: { itemId: 'edit', action: 'ACCEPT', reason: 'Conferência do original.' },
  };
  expect(
    (await f.app.inject({ method: 'POST', url: `${f.path}/editorial-review/decisions`, headers, payload: body }))
      .statusCode,
  ).toBe(200);
  await new DraftRepository(f.db).createVersion({
    ...f.owner,
    matterId: f.matter.id,
    draftId: f.target.draftId,
    createdBy: f.owner.userId,
    title: 'Título novo',
    source: 'HUMAN',
    status: 'DRAFT',
    contentHash: hash('Outra versão'),
    expectedCurrentVersionId: f.target.versionId,
    sections: [
      {
        title: 'Nova',
        content: 'Outra versão',
        ordinal: 1,
        linkedFactIds: [],
        linkedEvidenceIds: [],
        linkedThesisIds: [],
        linkedAuthorityIds: [],
      },
    ],
  });
  const get = (commandId: string, token = 'owner') =>
    f.app.inject({
      method: 'GET',
      url: `${f.path}/editorial-review?${new URLSearchParams({ ...f.target, commandId })}`,
      headers: { authorization: `Bearer ${token}` },
    });
  expect(
    (await f.app.inject({ method: 'GET', url: `${f.path}/editorial-review?${new URLSearchParams(f.target)}`, headers }))
      .statusCode,
  ).toBe(200);
  const history = await get(body.commandId);
  expect(history.statusCode).toBe(200);
  expect(history.json()).toMatchObject({
    stale: true,
    context: null,
    reconciliation: { commandId: body.commandId, status: 'RECORDED' },
  });
  expect(history.json().history).toHaveLength(1);
  expect((await get(randomUUID())).json().reconciliation.status).toBe('NOT_RECORDED');
  expect((await get(body.commandId, 'other')).statusCode).toBe(404);
  expect(
    (await f.app.inject({ method: 'POST', url: `${f.path}/editorial-review/decisions`, headers, payload: body }))
      .statusCode,
  ).toBe(409);
  f.revoke();
  expect((await get(body.commandId)).statusCode).toBe(403);
});
it('histórico editorial sobrevive à revisão do contexto mantendo novas decisões bloqueadas', async () => {
  const f = await fixture();
  const headers = { authorization: 'Bearer owner' };
  const preview = (
    await f.app.inject({
      method: 'POST',
      url: `${f.path}/editorial-review/preview`,
      headers,
      payload: { ...f.target, proposal: f.proposal },
    })
  ).json();
  const body = {
    ...f.target,
    proposal: f.proposal,
    contextHash: preview.contextHash,
    expectedRevision: 0,
    commandId: randomUUID(),
    decision: { itemId: 'edit', action: 'DEFER', reason: 'Aguardar revisão.' },
  };
  expect(
    (await f.app.inject({ method: 'POST', url: `${f.path}/editorial-review/decisions`, headers, payload: body }))
      .statusCode,
  ).toBe(200);
  await f.workspace.reviseContext(f.owner, f.conversation.id, 1, {
    ...f.context,
    text: 'Contexto corrigido pelo usuário.',
  });
  const response = await f.app.inject({
    method: 'GET',
    url: `${f.path}/editorial-review?${new URLSearchParams(f.target)}`,
    headers,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ stale: true, context: null, revision: 1 });
  expect(response.json().history).toHaveLength(1);
  expect(
    (await f.app.inject({ method: 'POST', url: `${f.path}/editorial-review/decisions`, headers, payload: body }))
      .statusCode,
  ).toBe(409);
});
