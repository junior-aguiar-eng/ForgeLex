import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
  MatterRepository,
  agenticExecutions,
  type ForgeLexDatabase,
} from '@forgelex/persistence';
import { and, eq } from 'drizzle-orm';
import { InferenceBudgetService, LedgerService } from '@forgelex/billing-ledger';
import { NativeCaseContextService } from '@forgelex/legal-tools';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import type { TaskBinding, AgenticOwner } from '@forgelex/domain';
import { createPilotOpenAIRuntime, PILOT_POLICY, type PilotObservation } from './real-provider.js';
import { ExecutionService } from './execution-service.js';
import { ExecutionWorker } from './execution-worker.js';
import { createCaseTaskDriver } from './case-task-driver.js';
const owner = { tenantId: 'boni-task6-synthetic-only', userId: 'boni' };
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export async function assertPilotRecoverySafe(db: ForgeLexDatabase, who: AgenticOwner) {
  const rows = await db
    .select({ payload: agenticExecutions.payloadJson })
    .from(agenticExecutions)
    .where(and(eq(agenticExecutions.tenantId, who.tenantId), eq(agenticExecutions.userId, who.userId)));
  if (rows.some((r) => ['QUEUED', 'RUNNING'].includes(JSON.parse(r.payload).status)))
    throw new Error('PILOT_PREVIOUS_EXECUTION_PENDING');
}
export function assertPilotResult(
  report: { attempts: any[]; observations: PilotObservation[] },
  stage: string,
  onlyCase?: string,
) {
  const latest = (caseId: string) => report.attempts.filter((a) => a.caseId === caseId).at(-1);
  const minimum = latest('T6-MIN');
  if (
    minimum?.status !== 'COMPLETED' ||
    !minimum.events?.some((e: any) => e.type === 'lifecycle:completed' && String(e.output).trim() === 'OK')
  )
    throw new Error('PILOT_MINIMAL_FAILED');
  if (
    report.observations.reduce((sum, o) => sum + (o.status === 'SETTLED' ? o.costCents! : o.upperBoundCents), 0) > 500
  )
    throw new Error('PILOT_CEILING_EXCEEDED');
  if (stage === 'cancel') {
    const cancel = latest('T6-CANCEL');
    if (
      cancel?.status !== 'CANCELLED' ||
      cancel.dispatched !== true ||
      !cancel.events?.some((e: any) => e.code === 'SESSION_CANCELLED')
    )
      throw new Error('PILOT_CANCELLATION_NOT_OBSERVED');
  } else if (stage !== 'minimal') {
    for (const id of ['T6-CONTEXT', 'T6-GAP', 'T6-UNTRUSTED', 'T6-SUPPORT']) {
      if (onlyCase && id !== onlyCase) continue;
      if (!['COMPLETED', 'WAITING_USER'].includes(latest(id)?.status)) throw new Error('PILOT_CASE_NOT_FINISHED');
    }
  }
}
export async function runTask6Homologation(root: string, apiKey: string, minimalOnly = false) {
  const workspace = resolve(root, '.superpowers/sdd/2026-10-10-agentic-workspace-transition/task6-pilot');
  await mkdir(workspace, { recursive: true });
  const lockPath = resolve(workspace, 'running.lock'),
    lock = await open(lockPath, 'wx');
  let connection: Awaited<ReturnType<typeof createDatabase>> | undefined;
  try {
    const source = await readFile(
      resolve(root, 'docs/architecture/fixtures/agentic-task6-synthetic-cases.json'),
      'utf8',
    );
    const fixture = JSON.parse(source),
      reportPath = resolve(workspace, 'evidence.json');
    let report: any;
    try {
      report = JSON.parse(await readFile(reportPath, 'utf8'));
    } catch {
      report = {
        version: 1,
        approval: 'boni-task6',
        baseCommit: 'ec791e5402f8e2533e74d86aa76aab9440d48e01',
        provider: 'openai',
        model: 'gpt-6.1-sol',
        currency: 'USD',
        ceilingCents: 500,
        fixtureHash: digest(source),
        attempts: [],
        observations: [],
        packetAudits: [],
        legalEvaluation: 'PENDING_BONI',
        externalResearch: false,
        fallback: false,
      };
    }
    if (report.fixtureHash !== digest(source)) throw new Error('PILOT_FIXTURE_CHANGED');
    const persist = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    connection = await createDatabase({ url: 'file:' + resolve(workspace, 'pilot.sqlite').replaceAll('\\', '/') });
    const { db, client } = connection;
    await runPersistenceMigrations(client);
    const ledger = new LedgerService(db, client),
      budget = new InferenceBudgetService(db, client),
      repo = new AgenticWorkspaceRepository(db),
      matters = new MatterRepository(db);
    await ledger.runMigrations();
    const accounts = await client.execute({
      sql: 'SELECT id FROM ledger_accounts WHERE tenant_id=?',
      args: [owner.tenantId],
    });
    if (!accounts.rows.length)
      await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 500, promotionalBalanceCents: 0 });
    const unresolved = await client.execute('SELECT payload_json FROM inference_calls');
    if (unresolved.rows.some((row) => JSON.parse(String(row.payload_json)).status === 'PROVISIONED'))
      throw new Error('PILOT_CLOSED');
    if (unresolved.rows.some((row) => JSON.parse(String(row.payload_json)).status !== 'SETTLED'))
      throw new Error('PILOT_RECONCILIATION_REQUIRED');
    const service = new ExecutionService(db, client, { executorAvailable: true });
    const abandoned = await client.execute({
      sql: 'SELECT id,payload_json FROM agentic_executions WHERE tenant_id=?',
      args: [owner.tenantId],
    });
    for (const row of abandoned.rows) {
      const e = JSON.parse(String(row.payload_json));
      if (e.status === 'QUEUED' && !e.authorizationId)
        await service.cancelExecution(owner, String(row.id), 'preflight-cleanup:' + row.id);
    }
    await assertPilotRecoverySafe(db, owner);
    const bindings = new Map<string, TaskBinding>(),
      allowed = new Map<string, Set<string>>();
    const authorizeNative = async (who: any) => {
      if (who.tenantId !== owner.tenantId || who.userId !== owner.userId) throw new Error('ACCESS_REVOKED');
    };
    const native = new NativeCaseContextService(db, authorizeNative);
    const observations: PilotObservation[] = [];
    const assertContext = async (id: string, packet?: any) => {
      const b = bindings.get(id);
      if (!b) throw new Error('PILOT_CONTEXT_UNAPPROVED');
      const current = await native.load(b);
      const hashes = allowed.get(id)!;
      if (
        current.sources.some((s) => !hashes.has(s.contentHash)) ||
        (packet && packet.sources.some((s: any) => !hashes.has(s.contentHash)))
      )
        throw new Error('PILOT_CONTEXT_UNAPPROVED');
    };
    const runtime = createPilotOpenAIRuntime({
      owner,
      apiKey,
      budget,
      approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
      assertContext,
      onProviderError: (code, message) => {
        report.runtimeErrors ??= [];
        report.runtimeErrors.push({ code, message: message.slice(0, 2000) });
      },
      onRequest: (id, body) => {
        const serialized = JSON.stringify(body);
        const excluded = fixture.cases.flatMap((c: any) => c.excludedSources).map((s: any) => s.text);
        if (excluded.some((t: string) => serialized.includes(t) || serialized.includes('CONTROLE_NAO_SELECIONADO_T6')))
          throw new Error('PILOT_CONTEXT_UNAPPROVED');
        report.packetAudits.push({
          executionId: id,
          requestHash: digest(serialized),
          excludedMarkerPresent: false,
          toolNames: ((body.tools as any[]) ?? []).map((t) => t.name),
          model: body.model,
        });
      },
    });
    const takeObservations = () => {
      observations.push(...runtime.observations.splice(0));
      report.observations.push(...observations.splice(0));
    };
    async function prepare(example: any, maximum = 50) {
      const selected: { documentId: string; versionId: string }[] = [];
      let matterId: string | undefined;
      if (example.selectedSources.length || example.excludedSources.length) {
        const matter = await matters.createMatter({ ...owner, title: 'Task6 ' + example.id, createdBy: owner.userId });
        matterId = matter.id;
        for (const s of [...example.selectedSources, ...example.excludedSources]) {
          const d = await matters.ingestTextDocument({
            ...owner,
            matterId,
            createdBy: owner.userId,
            title: s.id,
            originalFilename: s.id + '.txt',
            mimeType: 'text/plain',
            content: s.text,
          });
          if (example.selectedSources.includes(s))
            selected.push({ documentId: d.document.id, versionId: d.version.id });
        }
      }
      const run = await service.startExecution(owner, randomUUID(), {
        objective: example.objective,
        matterId,
        context: { text: '', origin: selected.length ? 'DOCUMENT' : 'USER', documents: selected },
      });
      const binding: TaskBinding = {
        ...owner,
        executionId: run.id,
        conversationId: run.conversationId,
        contextRevision: run.contextRevision,
        objective: example.objective,
        matterId,
      };
      bindings.set(run.id, binding);
      allowed.set(run.id, new Set(example.selectedSources.map((s: any) => digest(s.text))));
      await service.authorizeInference(owner, run.id, {
        authorizationId: 'boni-task6',
        provider: 'openai',
        model: 'gpt-6.1-sol',
      });
      await budget.reserveExecutionBudget({
        ...owner,
        executionId: run.id,
        maxCostCents: maximum,
        idempotencyKey: 'task6:' + run.id,
        policy: PILOT_POLICY,
      });
      return { run, binding };
    }
    if (!report.attempts.some((x: any) => x.caseId === 'T6-MIN' && x.status === 'COMPLETED')) {
      const example = fixture.cases[0],
        { run, binding } = await prepare(example, 10);
      await repo.compareAndSetStatus(owner, run.id, 'QUEUED', 'RUNNING');
      const provider = new OpenAIAgentProvider({ apiKey, model: 'gpt-6.1-sol', fetch: runtime.fetchFor(run.id) });
      const events: any[] = [];
      const started = Date.now();
      for await (const event of provider.run({
        sessionId: randomUUID(),
        ...owner,
        prompt: example.objective,
        tools: [],
        maxTurns: 1,
        abortSignal: AbortSignal.timeout(30000),
      })) {
        if (event.type === 'lifecycle:completed' || event.type === 'error') events.push(event);
      }
      takeObservations();
      const completed = events.find((e) => e.type === 'lifecycle:completed');
      const attempt = {
        caseId: example.id,
        executionId: run.id,
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        status: completed ? 'COMPLETED' : 'FAILED',
        events,
      };
      report.attempts.push(attempt);
      await repo.compareAndSetStatus(owner, run.id, 'RUNNING', completed ? 'COMPLETED' : 'FAILED');
      await budget.releaseUnusedBudget(owner, run.id);
      bindings.delete(binding.executionId);
      await persist();
      if (!completed) throw new Error('PILOT_MINIMAL_FAILED');
    }
    if (minimalOnly) {
      assertPilotResult(report, 'minimal');
      return report;
    }
    if (process.env.FORGELEX_TASK6_STAGE === 'cancel') {
      const { run } = await prepare(fixture.cases[0], 10);
      await repo.compareAndSetStatus(owner, run.id, 'QUEUED', 'RUNNING');
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let dispatched = false;
      const cancelled = createPilotOpenAIRuntime({
        owner,
        apiKey,
        budget,
        approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
        assertContext,
        transport: async (url, init) => {
          dispatched = true;
          timer = setTimeout(() => controller.abort(), 500);
          return globalThis.fetch(url, init);
        },
      });
      const provider = new OpenAIAgentProvider({ apiKey, model: 'gpt-6.1-sol', fetch: cancelled.fetchFor(run.id) });
      const events: any[] = [];
      const start = Date.now();
      try {
        for await (const event of provider.run({
          sessionId: randomUUID(),
          ...owner,
          prompt: fixture.cases[0].objective,
          tools: [],
          maxTurns: 1,
          abortSignal: controller.signal,
        })) {
          if (event.type === 'error' || event.type === 'lifecycle:completed') events.push(event);
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
      report.observations.push(...cancelled.observations);
      const actualStatus = events.some((e) => e.code === 'SESSION_CANCELLED')
        ? 'CANCELLED'
        : events.some((e) => e.type === 'lifecycle:completed')
          ? 'COMPLETED'
          : 'FAILED';
      report.attempts.push({
        caseId: 'T6-CANCEL',
        executionId: run.id,
        status: actualStatus,
        dispatched,
        durationMs: Date.now() - start,
        events,
      });
      await repo.compareAndSetStatus(owner, run.id, 'RUNNING', actualStatus);
      await budget.releaseUnusedBudget(owner, run.id);
      report.localAvailableCents = await ledger.getAvailableBalanceCents(owner.tenantId);
      await persist();
      assertPilotResult(report, 'cancel');
      return report;
    }
    for (const example of fixture.cases.slice(1)) {
      if (process.env.FORGELEX_TASK6_CASE && example.id !== process.env.FORGELEX_TASK6_CASE) continue;
      if (report.attempts.some((x: any) => x.caseId === example.id && ['COMPLETED', 'WAITING_USER'].includes(x.status)))
        continue;
      const { run, binding } = await prepare(example);
      const started = Date.now();
      const wired = createCaseTaskDriver(db, client, {
        authorizeNative,
        createProvider: runtime.createProvider,
        authorizeRealProvider: runtime.authorizeRealProvider,
      });
      let diagnostic: string | undefined;
      const traced = {
        next: (context: Parameters<typeof wired.driver.next>[0]) => {
          const step = wired.driver.next(context);
          return step
            ? {
                ...step,
                run: async (args: Parameters<typeof step.run>[0]) => {
                  try {
                    return await step.run(args);
                  } catch (error) {
                    diagnostic = error instanceof Error ? error.message.slice(0, 2000) : 'UNKNOWN';
                    throw error;
                  }
                },
              }
            : undefined;
        },
      };
      const worker = new ExecutionWorker(service, traced, { leaseMs: 120000 });
      await worker.runOnce();
      const snapshot = await service.getExecution(owner, run.id);
      takeObservations();
      const delivery = await Promise.all(snapshot.deliveryIds.map((id) => native.getDelivery(owner, id)));
      const selectedAudit = snapshot.context.documents.map((s) => ({ ...s, sourceId: s.versionId }));
      report.attempts.push({
        caseId: example.id,
        executionId: run.id,
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        status: snapshot.status,
        diagnostic,
        question: snapshot.question,
        delivery,
        selected: selectedAudit,
        approvedSourceHashes: [...allowed.get(binding.executionId)!],
        events: await service.listClientEvents(owner, run.id, 0),
      });
      await persist();
      await worker.stop();
      await budget.releaseUnusedBudget(owner, run.id);
      if (!['COMPLETED', 'WAITING_USER'].includes(snapshot.status))
        throw new Error('PILOT_CASE_NOT_FINISHED:' + example.id);
    }
    report.finishedAt = new Date().toISOString();
    report.localAvailableCents = await ledger.getAvailableBalanceCents(owner.tenantId);
    await persist();
    assertPilotResult(report, 'all', process.env.FORGELEX_TASK6_CASE);
    return report;
  } finally {
    connection?.client.close();
    await lock.close();
    await unlink(lockPath);
  }
}
