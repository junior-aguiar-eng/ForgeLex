import { z } from 'zod';
import { and, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { AgenticExecutionSchema, type AgenticOwner, type AgenticExecution } from '@forgelex/domain';
import {
  AgenticWorkspaceRepository,
  agenticExecutionJobs,
  agenticExecutions,
  type ForgeLexDatabase,
  type Client,
} from '@forgelex/persistence';
import { CommercialInferenceService, COMMERCIAL_POLICY, COMMERCIAL_POLICY_VERSION } from '@forgelex/billing-ledger';
import { FinalEditorGenerator, type FinalEditorService } from '@forgelex/legal-workflows';
import { FinalEditorialProposalSchema } from '@forgelex/legal-workflows';
import { ExecutionService } from './execution-service.js';
import { ExecutionWorker, type ExecutionDriver } from './execution-worker.js';
import { digest } from './execution-store.js';
import { createFinalEditorOpenAIRuntime } from './final-editor-provider.js';

const identifier = z.string().trim().min(1).max(200);
export const EditorialCommercialTarget = z.strictObject({
  deliveryId: identifier,
  draftId: identifier,
  versionId: identifier,
});
export const EditorialCommercialCommand = EditorialCommercialTarget.extend({
  confirmed: z.literal(true),
  policyVersion: z.literal(COMMERCIAL_POLICY_VERSION),
});
const bindingSchema = EditorialCommercialTarget.extend({ contextHash: z.string().regex(/^[a-f0-9]{64}$/) });
const resultSchema = z.object({
  mode: z.literal('REAL'),
  profileVersion: z.string(),
  proposal: FinalEditorialProposalSchema,
});
const authorizationId = `editorial:${COMMERCIAL_POLICY_VERSION}`;
const approval = { authorizationId, provider: COMMERCIAL_POLICY.provider, model: COMMERCIAL_POLICY.model };
const accepts = (e?: AgenticExecution) =>
  Boolean(e && e.authorizationId === authorizationId && e.provider === approval.provider && e.model === approval.model);

/** Opt-in host composition. Reuses durable worker fences and wallet limits; never the source delivery's reservation. */
export async function createEditorialCommercialRuntime(
  db: ForgeLexDatabase,
  client: Client,
  options: {
    apiKey: string;
    editor: Pick<FinalEditorService, 'load'>;
    authorizeOwner: (owner: AgenticOwner) => Promise<void>;
    resolveMatter: (owner: AgenticOwner, deliveryId: string) => Promise<string | null>;
    authorizeHistory: (owner: AgenticOwner, target: z.infer<typeof EditorialCommercialTarget>) => Promise<void>;
    transport?: typeof globalThis.fetch;
  },
) {
  if (!options.apiKey.trim()) throw new Error('COMMERCIAL_KEY_REQUIRED');
  const finance = new CommercialInferenceService(db, client);
  await finance.verifyReady();
  const repo = new AgenticWorkspaceRepository(db);
  const service = new ExecutionService(db, client, {
    executorAvailable: true,
    requireInferenceAuthorization: true,
    admissionTimeoutMs: 120000,
    inferenceApproval: approval,
    canManageExecution: accepts,
    cooperativeCancel: true,
    async finalizeExecution(owner, id) {
      const execution = await repo.getExecution(owner, id);
      if (!accepts(execution)) throw new Error('EXECUTION_NOT_FOUND');
      if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution!.status)) throw new Error('EXECUTION_CONFLICT');
      if (!(await finance.getReceipt(owner, id))) return;
      // Boni's 05/11 decision: a completed validated review is usable even with no patches.
      const usableDelivery =
        execution!.status === 'COMPLETED' && resultSchema.safeParse(execution!.checkpoint?.editorialResult).success;
      await finance.finalize(owner, id, {
        usableDelivery,
        outcome: execution!.status as 'COMPLETED' | 'FAILED' | 'CANCELLED',
      });
    },
  });
  const driver: ExecutionDriver = {
    next({ execution }) {
      const binding = bindingSchema.parse(execution.checkpoint?.editorial);
      return {
        callId: `editorial:${execution.id}`,
        async run({ execution: current, signal }) {
          const owner = { tenantId: current.tenantId, userId: current.userId };
          const editor = {
            load: async (
              received: AgenticOwner,
              deliveryId: string,
              target: { draftId: string; versionId: string },
            ) => {
              if (received.tenantId !== owner.tenantId || received.userId !== owner.userId)
                throw new Error('ACCESS_REVOKED');
              await options.authorizeOwner(owner);
              const live = await repo.getExecution(owner, current.id);
              const job = await service.store.getJob(owner, current.id);
              if (!accepts(live) || live!.status !== 'RUNNING' || live!.requiresReevaluation || job.cancelRequestedAt)
                throw new Error('ACCESS_REVOKED');
              const context = await options.editor.load(owner, deliveryId, target);
              if (digest(context) !== binding.contextHash) throw new Error('EDITORIAL_CONTEXT_CHANGED');
              return context;
            },
          };
          const context = await editor.load(owner, binding.deliveryId, binding);
          const generation = createFinalEditorOpenAIRuntime({
            apiKey: options.apiKey,
            executionId: current.id,
            owner,
            context,
            editor,
            finance,
            transport: options.transport,
          });
          const result = await new FinalEditorGenerator(editor, generation).generate(
            owner,
            binding.deliveryId,
            binding,
            signal,
          );
          return { kind: 'completed', checkpoint: { editorial: binding, editorialResult: resultSchema.parse(result) } };
        },
      };
    },
  };
  const worker = new ExecutionWorker(service, driver, { maxSteps: 1, maxDurationMs: COMMERCIAL_POLICY.maxDurationMs });
  const read = async (owner: AgenticOwner, id: string, raw: unknown) => {
    const target = EditorialCommercialTarget.parse(raw);
    await options.authorizeOwner(owner);
    const execution = await repo.getExecution(owner, id);
    if (!accepts(execution)) throw new Error('EXECUTION_NOT_FOUND');
    const binding = bindingSchema.parse(execution!.checkpoint?.editorial);
    if (
      target.deliveryId !== binding.deliveryId ||
      target.draftId !== binding.draftId ||
      target.versionId !== binding.versionId
    )
      throw new Error('EXECUTION_NOT_FOUND');
    await options.authorizeHistory(owner, target);
    const result = resultSchema.safeParse(execution!.checkpoint?.editorialResult);
    return {
      commandId: id,
      status: execution!.status,
      receipt: await finance.getReceipt(owner, id),
      ...(execution!.status === 'COMPLETED' && result.success ? { result: result.data } : {}),
    };
  };
  return {
    service,
    worker,
    finance,
    read,
    async latest(owner: AgenticOwner, raw: unknown) {
      const target = EditorialCommercialTarget.parse(raw);
      await options.authorizeOwner(owner);
      await options.authorizeHistory(owner, target);
      // Use existing owner-scoped jobs, newest first; do not depend on browser storage.
      for (let offset = 0; ; offset += 100) {
        const rows = await db
          .select({ payload: agenticExecutions.payloadJson })
          .from(agenticExecutionJobs)
          .innerJoin(
            agenticExecutions,
            and(
              eq(agenticExecutions.id, agenticExecutionJobs.executionId),
              eq(agenticExecutions.tenantId, agenticExecutionJobs.tenantId),
              eq(agenticExecutions.userId, agenticExecutionJobs.userId),
            ),
          )
          .where(and(eq(agenticExecutionJobs.tenantId, owner.tenantId), eq(agenticExecutionJobs.userId, owner.userId)))
          .orderBy(desc(agenticExecutionJobs.createdAt), desc(agenticExecutionJobs.executionId))
          .limit(100)
          .offset(offset);
        for (const row of rows) {
          const e = AgenticExecutionSchema.parse(JSON.parse(row.payload));
          const binding = bindingSchema.safeParse(e.checkpoint?.editorial);
          if (
            accepts(e) &&
            binding.success &&
            binding.data.deliveryId === target.deliveryId &&
            binding.data.draftId === target.draftId &&
            binding.data.versionId === target.versionId
          )
            return read(owner, e.id, target);
        }
        if (rows.length < 100) return null;
      }
    },
    async recover(owner: AgenticOwner, requestId: string, raw: unknown) {
      const target = EditorialCommercialTarget.parse(raw);
      await options.authorizeOwner(owner);
      await options.authorizeHistory(owner, target);
      const command = await service.store.command(owner, `editorial:${digest(identifier.parse(requestId))}`);
      return command ? read(owner, command.executionId, target) : null;
    },
    async quote(owner: AgenticOwner, raw: unknown) {
      const target = EditorialCommercialTarget.parse(raw);
      await options.authorizeOwner(owner);
      await options.authorizeHistory(owner, target);
      let enabled = true;
      try {
        await options.editor.load(owner, target.deliveryId, target);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'EDITORIAL_VERSION_CONFLICT') throw error;
        enabled = false;
      }
      return { enabled, mode: 'COMMERCIAL' as const, ...(await finance.quote(owner)) };
    },
    async start(owner: AgenticOwner, key: string, raw: unknown) {
      const input = EditorialCommercialCommand.parse(raw);
      identifier.parse(key);
      await options.authorizeOwner(owner);
      const target = EditorialCommercialTarget.parse({
        deliveryId: input.deliveryId,
        draftId: input.draftId,
        versionId: input.versionId,
      });
      const context = await options.editor.load(owner, target.deliveryId, target);
      const checkpoint = { editorial: { ...target, contextHash: digest(context) } };
      const commandKey = `editorial:${digest(key)}`;
      const matterId = await options.resolveMatter(owner, target.deliveryId);
      const execution = await service.startExecution(
        owner,
        commandKey,
        { objective: 'Revisar redação da minuta', ...(matterId ? { matterId } : {}) },
        approval,
        checkpoint,
      );
      if (execution.status === 'QUEUED') {
        await finance.reserve(owner, {
          executionId: execution.id,
          idempotencyKey: commandKey,
          requestFingerprint: digest(checkpoint),
          policyVersion: COMMERCIAL_POLICY_VERSION,
        });
        await service.activateInference(owner, execution.id, authorizationId);
      }
      return read(owner, execution.id, target);
    },
    async cancel(owner: AgenticOwner, id: string, raw: unknown, key: string) {
      await read(owner, id, raw);
      await service.cancelExecution(owner, id, `editorial-cancel:${digest(identifier.parse(key))}`);
      return read(owner, id, raw);
    },
    async sweepAdmissions() {
      const rows = await db
        .select()
        .from(agenticExecutionJobs)
        .where(
          and(
            eq(agenticExecutionJobs.state, 'WAITING'),
            isNotNull(agenticExecutionJobs.admissionExpiresAt),
            lte(agenticExecutionJobs.admissionExpiresAt, new Date().toISOString()),
          ),
        )
        .limit(100);
      for (const row of rows) {
        const owner = { tenantId: row.tenantId, userId: row.userId };
        if (accepts(await repo.getExecution(owner, row.executionId)))
          await service.expireAdmission(owner, row.executionId);
      }
    },
  };
}
