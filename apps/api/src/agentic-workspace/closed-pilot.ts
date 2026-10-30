import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  createDatabase,
  AgenticWorkspaceRepository,
  MatterRepository,
  type ForgeLexDatabase,
  type Client,
} from '@forgelex/persistence';
import { NativeCaseContextService } from '@forgelex/legal-tools';
import type { AgenticOwner, AgenticExecution, NativeTaskPacket } from '@forgelex/domain';
import { ExecutionService } from './execution-service.js';
import { createClosedFinance } from './closed-pilot-finance.js';
import { createPilotOpenAIRuntime, PILOT_POLICY } from './real-provider.js';
import type { NativeCaseTaskOptions } from './case-task-driver.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const fixtureHash = 'f28cbc3b4b0c7b6135e36365ddb8b1a8d42419aee0076a96d70d34d64e370b5b';
interface Example {
  id: string;
  objective: string;
  selectedSources: { id: string; text: string }[];
}
const StartSchema = z.strictObject({
  caseId: z.string(),
  maxCostCents: z.number().int().min(1).max(500),
  confirmed: z.literal(true),
});
export interface ClosedPilotDependencies {
  financeDatabase?: ForgeLexDatabase;
  financeClient?: Client;
  apiKey?: string;
  transport?: typeof globalThis.fetch;
}
export type ClosedPilot = Awaited<ReturnType<typeof createClosedPilot>>;
export async function createClosedPilot(
  db: ForgeLexDatabase,
  client: Client,
  environment: Record<string, string | undefined>,
  dependencies: ClosedPilotDependencies = {},
) {
  const tenantId = environment.FORGELEX_CLOSED_PILOT_TENANT_ID?.trim();
  const userId = environment.FORGELEX_CLOSED_PILOT_USER_ID?.trim();
  if (
    !tenantId ||
    !userId ||
    tenantId.length > 200 ||
    userId.length > 200 ||
    environment.FORGELEX_AGENTIC_WORKSPACE_ENABLED !== 'true' ||
    (environment.FORGELEX_CLOSED_PILOT_MODEL && environment.FORGELEX_CLOSED_PILOT_MODEL !== PILOT_POLICY.model)
  )
    throw new Error('CLOSED_PILOT_CONFIGURATION_REQUIRED');
  const owner = { tenantId, userId };
  const bytes = await readFile(resolve(root, 'docs/architecture/fixtures/agentic-task6-synthetic-cases.json'));
  if (hash(bytes) !== fixtureHash) throw new Error('CLOSED_PILOT_FIXTURE_CHANGED');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (!manifest.syntheticOnly || manifest.status !== 'APPROVED_BY_BONI' || manifest.model !== PILOT_POLICY.model)
    throw new Error('CLOSED_PILOT_FIXTURE_CHANGED');
  const examples: Example[] = manifest.cases;
  const history = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/evidence/2026-10-27-agentic-task6-real.json'), 'utf8'),
  );
  let financialConnection: Awaited<ReturnType<typeof createDatabase>> | undefined;
  try {
    if (!dependencies.financeDatabase || !dependencies.financeClient) {
      const path = resolve(root, '.superpowers/sdd/2026-10-10-agentic-workspace-transition/task6-pilot/pilot.sqlite');
      const applicationUrl = environment.FORGELEX_DATABASE_URL ?? environment.DATABASE_URL;
      if (!applicationUrl || applicationUrl.includes(':memory:'))
        throw new Error('CLOSED_PILOT_PERSISTENT_APPLICATION_REQUIRED');
      if (applicationUrl.startsWith('file:')) {
        let applicationPath: string;
        try {
          applicationPath = fileURLToPath(applicationUrl);
        } catch {
          applicationPath = resolve(applicationUrl.slice(5).split('?')[0]);
        }
        if (applicationPath.toLowerCase() === path.toLowerCase())
          throw new Error('CLOSED_PILOT_SEPARATE_LEDGER_REQUIRED');
      }
      if (!(await stat(path).catch(() => undefined))?.isFile()) throw new Error('CLOSED_PILOT_HISTORY_REQUIRED');
      financialConnection = await createDatabase({ url: 'file:' + path.replaceAll('\\', '/') });
    }
    const financeDb = dependencies.financeDatabase ?? financialConnection!.db;
    const financeClient = dependencies.financeClient ?? financialConnection!.client;
    if (financeDb === db || financeClient === client) throw new Error('CLOSED_PILOT_SEPARATE_LEDGER_REQUIRED');
    const finance = createClosedFinance(financeDb, financeClient, db, owner, history.observations);
    await finance.snapshot(); // Fail closed on a missing history, changed funds or unrecognized currency.
    let apiKey = dependencies.apiKey ?? environment.OPENAI_API_KEY;
    if (!apiKey) {
      const local = await readFile(resolve(root, '.env.local'), 'utf8').catch(() => '');
      apiKey = /^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)["']?\s*$/m.exec(local)?.[1]?.trim();
    }
    if (!apiKey) throw new Error('CLOSED_PILOT_KEY_REQUIRED');
    const repo = new AgenticWorkspaceRepository(db);
    const ticket = (caseId: string, maximum: number) => `boni-closed-v1:${caseId}:${maximum}`;
    const decode = (execution: AgenticExecution) => {
      const match = /^boni-closed-v1:(T6-[A-Z]+):(\d+)$/.exec(execution.authorizationId ?? '');
      const example = examples.find((candidate) => candidate.id === match?.[1]);
      if (!match || !example || execution.provider !== 'openai' || execution.model !== PILOT_POLICY.model)
        throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
      const maximum = Number(match[2]);
      if (maximum < 1 || maximum > 500) throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
      return { example, maximum };
    };
    const canManage = (execution: AgenticExecution | undefined) => {
      if (!execution || execution.tenantId !== tenantId || execution.userId !== userId) return false;
      try {
        decode(execution);
        return true;
      } catch {
        return false;
      }
    };
    const native = new NativeCaseContextService(db, async (identity) => {
      finance.assertOwner(identity);
    });
    const assertContext = async (executionId: string, provided?: NativeTaskPacket) => {
      const execution = await repo.getExecution(owner, executionId);
      if (
        !execution ||
        !canManage(execution) ||
        execution.status !== 'RUNNING' ||
        execution.requiresReevaluation ||
        execution.contextRevision !== 1
      )
        throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
      const { example } = decode(execution);
      const live = await native.load({
        ...owner,
        executionId,
        conversationId: execution.conversationId,
        contextRevision: execution.contextRevision,
        matterId: execution.matterId ?? undefined,
        objective: example.objective,
      });
      if (
        live.answers.length ||
        live.sources.length !== example.selectedSources.length ||
        live.sources.some(
          (source) =>
            source.kind !== 'DOCUMENT' ||
            source.contentHash !== hash(source.text) ||
            !example.selectedSources.some((allowed) => allowed.text === source.text),
        ) ||
        new Set(live.sources.map((source) => source.contentHash)).size !== example.selectedSources.length
      )
        throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
      if (
        provided &&
        (provided.contextId !== live.contextId ||
          provided.contextRevision !== live.contextRevision ||
          JSON.stringify(provided.sources) !== JSON.stringify(live.sources) ||
          provided.answers.length)
      )
        throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
      await finance.snapshot();
    };
    const providerRuntime = createPilotOpenAIRuntime({
      owner,
      apiKey,
      budget: finance.gateway,
      approval: {
        provider: 'openai',
        model: PILOT_POLICY.model,
        ceilingCents: 500,
        reference: PILOT_POLICY.approvalReference,
      },
      assertContext,
      transport: (url, init) =>
        (dependencies.transport ?? globalThis.fetch)(url, {
          ...init,
          signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30000)]),
        }),
    });
    const service = new ExecutionService(db, client, {
      executorAvailable: true,
      requireInferenceAuthorization: true,
      budgetCleanup: finance.cleanup,
      canManageExecution: canManage,
      prepareStart: async (store, identity, input) => {
        finance.assertOwner(identity);
        const example = examples.find((candidate) => candidate.objective === input.objective)!;
        if (
          !example ||
          input.matterId ||
          input.conversationId ||
          input.context?.documents.length ||
          input.context?.text
        )
          throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
        if (!example.selectedSources.length) return input;
        const matters = new MatterRepository(store.db);
        const matter = await matters.createMatter({
          ...owner,
          createdBy: userId,
          title: 'Piloto sintético ' + example.id,
        });
        const documents = [];
        for (const source of example.selectedSources) {
          const document = await matters.ingestTextDocument({
            ...owner,
            matterId: matter.id,
            createdBy: userId,
            title: source.id,
            originalFilename: source.id + '.txt',
            mimeType: 'text/plain',
            content: source.text,
          });
          documents.push({ documentId: document.document.id, versionId: document.version.id });
        }
        return { ...input, matterId: matter.id, context: { text: '', origin: 'DOCUMENT', documents } };
      },
    });
    const caseTask: NativeCaseTaskOptions = {
      authorizeNative: async (identity) => {
        finance.assertOwner(identity);
      },
      createProvider: providerRuntime.createProvider,
      authorizeRealProvider: providerRuntime.authorizeRealProvider,
    };
    return {
      service,
      caseTask,
      providerRuntime,
      canManageExecution: canManage,
      assertOwner: finance.assertOwner,
      async summary(identity: AgenticOwner, executionId?: string) {
        finance.assertOwner(identity);
        if (executionId && !canManage((await repo.getExecution(owner, executionId))!))
          throw new Error('EXECUTION_NOT_FOUND');
        const budget = executionId ? await finance.cleanup.getExecutionBudget(owner, executionId) : undefined;
        return {
          ...(await finance.snapshot()),
          provider: 'openai',
          model: PILOT_POLICY.model,
          examples: examples.map(({ id, objective }) => ({ id, objective })),
          execution: budget
            ? {
                maximumCents: budget.maxCostCents,
                settledCents: budget.consumedCents,
                escrowCents: budget.remainingPaidCents + budget.remainingPromoCents,
                status: budget.status,
              }
            : null,
        };
      },
      async start(identity: AgenticOwner, key: string, raw: unknown) {
        finance.assertOwner(identity);
        const input = StartSchema.parse(raw);
        const example = examples.find((candidate) => candidate.id === input.caseId);
        if (!example) throw new Error('CLOSED_PILOT_SYNTHETIC_ONLY');
        const authorizationId = ticket(example.id, input.maxCostCents);
        const execution = await service.startExecution(
          owner,
          key,
          { objective: example.objective, context: { text: '', origin: 'USER', documents: [] } },
          { authorizationId, provider: 'openai', model: PILOT_POLICY.model },
        );
        if (execution.status !== 'QUEUED') return execution;
        try {
          await finance.reserve(execution.id, input.maxCostCents);
          try {
            await service.activateInference(owner, execution.id, authorizationId);
          } catch (error) {
            const current = await service.getExecution(owner, execution.id);
            if (current.status !== 'QUEUED') {
              // Cancellation can commit in the application store before the
              // separate financial reservation commits. Reconcile that race
              // after reserve returns, without releasing a running job.
              if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) {
                await service.store.atomic(owner, async (store) => {
                  const job = await store.getJob(owner, execution.id);
                  await store.saveJob({ ...job, budgetReleasePending: true, budgetReleaseNextAt: null });
                });
                // Reuse durable cleanup/retry without changing a terminal status.
                return service.cancelExecution(owner, execution.id, `closed-terminal-reservation:${execution.id}`);
              }
              return current;
            }
            throw error;
          }
          return service.getExecution(owner, execution.id);
        } catch (error) {
          await service
            .cancelExecution(owner, execution.id, 'closed-reservation-failed:' + execution.id)
            .catch(() => undefined);
          throw error;
        }
      },
      async close() {
        financialConnection?.client.close();
      },
    };
  } catch (error) {
    financialConnection?.client.close();
    throw error;
  }
}
