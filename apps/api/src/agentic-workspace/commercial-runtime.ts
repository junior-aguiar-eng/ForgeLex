import { z } from 'zod';
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import {
  AccountRepository,
  AgenticWorkspaceRepository,
  agenticExecutionJobs,
  type ForgeLexDatabase,
  type Client,
} from '@forgelex/persistence';
import { CommercialInferenceService, COMMERCIAL_POLICY_VERSION } from '@forgelex/billing-ledger';
import { NativeCaseContextService, type AuthorizeNativeTask } from '@forgelex/legal-tools';
import { CASE_TASK_LIMITATION_CODES } from '@forgelex/legal-workflows';
import {
  LegalAnswerSchema,
  type AgenticOwner,
  type AgenticExecution,
  type TaskBinding,
  type AgenticTaskDelivery,
} from '@forgelex/domain';
import { ExecutionService, StartExecutionSchema } from './execution-service.js';
import { digest } from './execution-store.js';
import { createCommercialOpenAIRuntime, COMMERCIAL_MODEL } from './commercial-provider.js';
import type { NativeCaseTaskOptions } from './case-task-driver.js';

export const CommercialConfirmationSchema = z.object({
  confirmed: z.literal(true),
  policyVersion: z.literal(COMMERCIAL_POLICY_VERSION),
});
export function commercialConfirmedInput(raw: unknown) {
  const { confirmed, policyVersion, ...input } = z
    .object({ confirmed: z.literal(true), policyVersion: z.literal(COMMERCIAL_POLICY_VERSION) })
    .passthrough()
    .parse(raw);
  return { confirmed, policyVersion, input };
}
export interface CommercialRuntimeDependencies {
  apiKey?: string;
  transport?: typeof globalThis.fetch;
  /** Trusted test/host authorization boundary; production checks the live account below. */
  authorizeOwner?: AuthorizeNativeTask;
}
export type CommercialRuntime = Awaited<ReturnType<typeof createCommercialRuntime>>;

// Workflow findings state a limitation, not a completed analysis or review finding.
const limitationCodes = new Set<string>(CASE_TASK_LIMITATION_CODES);
export function hasUsableResult(delivery: AgenticTaskDelivery, actionId?: string) {
  if (actionId && delivery.action !== actionId) return false;
  if (delivery.action === 'create_document') return Boolean(delivery.document?.sections.length);
  const grounded = (item: { sourceIds: string[] }) =>
    item.sourceIds.length > 0 && item.sourceIds.every((id) => delivery.sources.some((source) => source.id === id));
  // Issues are the plan's questions, not proof that the requested examination occurred.
  // Structural deliverability never changes NOT_EVALUATED or humanReviewRequired.
  return (
    delivery.claims.some(grounded) ||
    delivery.findings.some(
      (finding) =>
        !limitationCodes.has(finding.code) &&
        !/(?:^|_)(?:REFUSED|REFUSAL|IMPOSSIBLE|INSUFFICIENT|MISSING|UNAVAILABLE|UNSUPPORTED|GAP)(?:_|$)/.test(
          finding.code,
        ) &&
        grounded(finding),
    )
  );
}

const finished = ['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_USER'];
export async function createCommercialRuntime(
  db: ForgeLexDatabase,
  client: Client,
  environment: Record<string, string | undefined>,
  dependencies: CommercialRuntimeDependencies = {},
) {
  const databaseUrl = environment.FORGELEX_DATABASE_URL ?? environment.DATABASE_URL;
  if (
    environment.FORGELEX_AGENTIC_WORKSPACE_ENABLED !== 'true' ||
    environment.FORGELEX_COMMERCIAL_EXECUTION_ENABLED !== 'true' ||
    environment.FORGELEX_CLOSED_PILOT_ENABLED === 'true' ||
    !databaseUrl ||
    databaseUrl.includes(':memory:')
  )
    throw new Error('COMMERCIAL_CONFIGURATION_REQUIRED');
  const apiKey = dependencies.apiKey ?? environment.OPENAI_API_KEY;
  if (!apiKey?.trim()) throw new Error('COMMERCIAL_KEY_REQUIRED');
  const finance = new CommercialInferenceService(db, client);
  await finance.verifyReady(); // Startup never implicitly migrates a commercial ledger.
  const repo = new AgenticWorkspaceRepository(db);
  const authorizationId = `commercial:${COMMERCIAL_POLICY_VERSION}`;
  const approval = { authorizationId, provider: 'openai', model: COMMERCIAL_MODEL };
  const canManageExecution = (execution: AgenticExecution | undefined) =>
    Boolean(
      execution &&
      execution.authorizationId === authorizationId &&
      execution.provider === 'openai' &&
      execution.model === COMMERCIAL_MODEL,
    );
  const authorizeOwner: AuthorizeNativeTask =
    dependencies.authorizeOwner ??
    (async (owner, _matterId, database) => {
      const account = await new AccountRepository(database).findByUserAndTenant(owner.userId, owner.tenantId);
      if (
        !account ||
        account.user.status !== 'ACTIVE' ||
        account.tenant.status !== 'ACTIVE' ||
        account.membership.status !== 'ACTIVE'
      )
        throw new Error('ACCESS_REVOKED');
    });
  const native = new NativeCaseContextService(db, authorizeOwner);
  const service = new ExecutionService(db, client, {
    executorAvailable: true,
    requireInferenceAuthorization: true,
    admissionTimeoutMs: 120000,
    inferenceApproval: approval,
    canManageExecution,
    cooperativeCancel: true,
    finalizeExecution: async (owner, executionId) => {
      const execution = await repo.getExecution(owner, executionId);
      if (!canManageExecution(execution)) throw new Error('EXECUTION_NOT_FOUND');
      if (!['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_USER'].includes(execution!.status))
        throw new Error('EXECUTION_CONFLICT');
      const existing = await finance.getReceipt(owner, executionId);
      if (!existing) return; // No reservation was made; nothing can be charged/released.
      const job = await service.store.getJob(owner, executionId);
      let usableDelivery = false;
      for (const id of execution!.deliveryIds) {
        const delivery = await native.getCommittedExecutionDelivery(owner, executionId, id);
        if (delivery && hasUsableResult(delivery, job.actionId)) usableDelivery = true;
      }
      await finance.finalize(owner, executionId, {
        usableDelivery,
        outcome:
          execution!.status === 'WAITING_USER'
            ? 'CANCELLED'
            : (execution!.status as 'COMPLETED' | 'FAILED' | 'CANCELLED'),
      });
    },
  });
  const providerRuntime = createCommercialOpenAIRuntime({
    apiKey,
    finance,
    transport: dependencies.transport,
    assertContext: async (executionId, packet) => {
      // Owner is recovered from the server's job, never from model/client fields.
      const [row] = await db
        .select()
        .from(agenticExecutionJobs)
        .where(eq(agenticExecutionJobs.executionId, executionId));
      if (!row) throw new Error('EXECUTION_NOT_FOUND');
      const owner = { tenantId: row.tenantId, userId: row.userId };
      const execution = await repo.getExecution(owner, executionId);
      if (!canManageExecution(execution) || execution!.status !== 'RUNNING' || execution!.requiresReevaluation)
        throw new Error('ACCESS_REVOKED');
      const receipt = await finance.getReceipt(owner, executionId);
      if (!receipt || receipt.status !== 'ACTIVE' || receipt.policyVersion !== COMMERCIAL_POLICY_VERSION)
        throw new Error('EXECUTION_NOT_AUTHORIZED');
      const job = await service.store.getJob(owner, executionId);
      // Cooperative cancel: refuse before dispatch, so the call is voided (never uncertain) and nothing new is billed.
      if (job.cancelRequestedAt) throw new Error('EXECUTION_CANCEL_REQUESTED');
      const binding: TaskBinding = {
        ...owner,
        executionId,
        conversationId: execution!.conversationId,
        contextRevision: execution!.contextRevision,
        matterId: execution!.matterId ?? undefined,
        objective: job.objective,
        previousDeliveryIds: packet?.sources.filter((s) => s.kind === 'PREVIOUS_DELIVERY').map((s) => s.id),
      };
      const live = await native.load(binding);
      if (
        packet &&
        (live.contextId !== packet.contextId ||
          live.contextRevision !== packet.contextRevision ||
          JSON.stringify(live.sources) !== JSON.stringify(packet.sources) ||
          JSON.stringify(live.answers) !== JSON.stringify(packet.answers))
      )
        throw new Error('CONTEXT_CONFLICT');
      return owner;
    },
  });
  const caseTask: NativeCaseTaskOptions = {
    authorizeNative: authorizeOwner,
    createProvider: providerRuntime.createProvider,
    authorizeRealProvider: providerRuntime.authorizeRealProvider,
  };
  const activate = async (
    owner: AgenticOwner,
    key: string,
    canonicalInput: unknown,
    execution: Awaited<ReturnType<ExecutionService['getExecution']>>,
  ) => {
    if (execution.status !== 'QUEUED') return execution;
    try {
      await finance.reserve(owner, {
        executionId: execution.id,
        idempotencyKey: key,
        requestFingerprint: digest(canonicalInput),
        policyVersion: COMMERCIAL_POLICY_VERSION,
      });
      await service.activateInference(owner, execution.id, authorizationId);
      return await service.getExecution(owner, execution.id);
    } catch (error) {
      // Shared-key retries do not own an admission lease independently. A failed retry
      // must not cancel a parallel successful retry; only atomic lease expiry may clean up.
      await service.expireAdmission(owner, execution.id).catch(() => undefined);
      const current = await repo.getExecution(owner, execution.id);
      if (
        current &&
        current.status !== 'QUEUED' &&
        !(error instanceof Error && error.message === 'IDEMPOTENCY_CONFLICT')
      )
        return service.getExecution(owner, execution.id);
      throw error;
    }
  };
  const sweepAdmissions = async () => {
    // Only jobs whose admission deadline has passed are fetched: the column is null once admitted and for jobs
    // waiting on a person. expireAdmission rechecks every field atomically before cancelling anything.
    for (let page = 0; page < 20; page++) {
      const due = await db
        .select()
        .from(agenticExecutionJobs)
        .where(
          and(
            eq(agenticExecutionJobs.state, 'WAITING'),
            isNotNull(agenticExecutionJobs.admissionExpiresAt),
            lte(agenticExecutionJobs.admissionExpiresAt, new Date().toISOString()),
          ),
        )
        .orderBy(asc(agenticExecutionJobs.admissionExpiresAt))
        .limit(100)
        .offset(page * 100);
      for (const row of due) {
        const owner = { tenantId: row.tenantId, userId: row.userId };
        const execution = await repo.getExecution(owner, row.executionId);
        if (!canManageExecution(execution) || execution!.status !== 'QUEUED') continue;
        await service.expireAdmission(owner, row.executionId);
      }
      if (due.length < 100) return;
    }
  };
  return {
    service,
    finance,
    caseTask,
    providerRuntime,
    canManageExecution,
    sweepAdmissions,
    async start(owner: AgenticOwner, key: string, raw: unknown) {
      const { input } = commercialConfirmedInput(raw);
      await authorizeOwner(owner, typeof input.matterId === 'string' ? input.matterId : undefined, db);
      const parsed = StartExecutionSchema.parse(input);
      return activate(
        owner,
        key,
        { kind: 'start', input: parsed, policyVersion: COMMERCIAL_POLICY_VERSION },
        await service.startExecution(owner, key, parsed, approval),
      );
    },
    async successor(
      owner: AgenticOwner,
      id: string,
      key: string,
      kind: 'answer' | 'correct' | 'continue',
      raw: unknown,
    ) {
      const { input } = commercialConfirmedInput(raw);
      const execution = await repo.getExecution(owner, id);
      if (!canManageExecution(execution)) throw new Error('EXECUTION_NOT_FOUND');
      await authorizeOwner(owner, execution!.matterId ?? undefined, db);
      // Answering cancels the waiting execution and consumes its question. Refuse up front what the
      // reservation would refuse afterwards (balance, limits, reconciliation) so the question survives.
      if (kind === 'answer') await finance.assertCanAdmit(owner, id);
      let next;
      let parsed: unknown;
      if (kind === 'continue') {
        parsed = z.strictObject({}).parse(input);
        next = await service.continueFromCheckpoint(owner, id, key);
      } else {
        const answer = LegalAnswerSchema.parse(input);
        parsed = answer;
        next =
          kind === 'answer'
            ? await service.answerExecution(owner, id, key, answer)
            : await service.correctAnswer(owner, id, key, answer);
      }
      return activate(owner, key, { kind, input: parsed, policyVersion: COMMERCIAL_POLICY_VERSION }, next);
    },
    /** Startup recovery respects healthy admission leases; recurring sweeps handle later crashes. */
    async recover() {
      await sweepAdmissions();
      // Only a still-open reservation can need a release, so recovery starts from those, not from every job.
      for (const receipt of await finance.listAllActive()) {
        const owner = { tenantId: receipt.tenantId, userId: receipt.userId },
          execution = await repo.getExecution(owner, receipt.executionId);
        if (!canManageExecution(execution) || !finished.includes(execution!.status)) continue;
        await service.store.atomic(owner, async (store) => {
          const current = await store.getJob(owner, receipt.executionId);
          const live = await store.workspace.getExecution(owner, receipt.executionId);
          if (live && finished.includes(live.status) && !current.budgetReleasePending)
            await store.saveJob({ ...current, budgetReleasePending: true, budgetReleaseNextAt: null });
        });
      }
    },
  };
}
