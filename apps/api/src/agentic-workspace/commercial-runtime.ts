import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  AccountRepository,
  AgenticWorkspaceRepository,
  agenticExecutionJobs,
  type ForgeLexDatabase,
  type Client,
} from '@forgelex/persistence';
import { CommercialInferenceService, COMMERCIAL_POLICY_VERSION } from '@forgelex/billing-ledger';
import { NativeCaseContextService, type AuthorizeNativeTask } from '@forgelex/legal-tools';
import { LegalAnswerSchema, type AgenticOwner, type AgenticExecution, type TaskBinding } from '@forgelex/domain';
import { ExecutionService, StartExecutionSchema } from './execution-service.js';
import { digest, type ExecutionJob } from './execution-store.js';
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
    finalizeExecution: async (owner, executionId) => {
      const execution = await repo.getExecution(owner, executionId);
      if (!canManageExecution(execution)) throw new Error('EXECUTION_NOT_FOUND');
      if (!['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_USER'].includes(execution!.status))
        throw new Error('EXECUTION_CONFLICT');
      const existing = await finance.getReceipt(owner, executionId);
      if (!existing) return; // No reservation was made; nothing can be charged/released.
      // Only deliveries committed into execution progress are usable. Uncommitted model output is not a delivery.
      const usableDelivery = execution!.deliveryIds.length > 0;
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
    // The persisted index is only a candidate list; expireAdmission rechecks every field atomically.
    for (const row of await db.select().from(agenticExecutionJobs).where(eq(agenticExecutionJobs.state, 'WAITING'))) {
      const job = JSON.parse(row.payloadJson) as ExecutionJob;
      if (job.admissionExpiresAt === null) continue;
      const deadline = job.admissionExpiresAt ?? new Date(Date.parse(job.createdAt) + 120000).toISOString();
      if (deadline > new Date().toISOString()) continue;
      const owner = { tenantId: row.tenantId, userId: row.userId };
      const execution = await repo.getExecution(owner, row.executionId);
      if (!canManageExecution(execution) || execution!.status !== 'QUEUED') continue;
      await service.expireAdmission(owner, row.executionId);
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
      for (const row of await db.select().from(agenticExecutionJobs)) {
        const owner = { tenantId: row.tenantId, userId: row.userId },
          execution = await repo.getExecution(owner, row.executionId);
        if (!canManageExecution(execution)) continue;
        const job = JSON.parse(row.payloadJson) as ExecutionJob;
        if (
          ['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_USER'].includes(execution!.status) &&
          !job.budgetReleasePending &&
          (await finance.getReceipt(owner, row.executionId))?.status === 'ACTIVE'
        ) {
          await service.store.atomic(owner, async (store) => {
            const current = await store.getJob(owner, row.executionId);
            const live = await store.workspace.getExecution(owner, row.executionId);
            if (
              live &&
              ['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_USER'].includes(live.status) &&
              !current.budgetReleasePending
            )
              await store.saveJob({ ...current, budgetReleasePending: true, budgetReleaseNextAt: null });
          });
        }
      }
    },
  };
}
