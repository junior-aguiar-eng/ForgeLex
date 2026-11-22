import { createHash } from 'node:crypto';
import {
  AgenticWorkspaceRepository,
  NativeEvidenceReviewRepository,
  type ForgeLexDatabase,
  type Client,
} from '@forgelex/persistence';
import { InferenceBudgetService, getForgeLexBillingPolicy } from '@forgelex/billing-ledger';
import {
  NativeCaseContextService,
  createNativeSelectedSourceTool,
  createSearchCaseLawTool,
  createGetAuthorityTool,
  createVerifyAuthorityTool,
  createGetLegislationTool,
  type AuthorizeNativeTask,
  type ResearchService,
} from '@forgelex/legal-tools';
import {
  AgenticCaseTask,
  caseTaskResearchCapabilities,
  caseTaskStepIndex,
  caseTaskPreviousDeliveryIds,
  type CaseTaskOptions,
} from '@forgelex/legal-workflows';
import {
  AgenticTaskActionSchema,
  structureItemsSource,
  type AgenticExecution,
  type AgenticOwner,
  type TaskBinding,
} from '@forgelex/domain';
import { findCurrentStructure } from './current-structure.js';
import { applyStructureAdjustment } from './apply-structure-adjustment.js';
import type { AgentTool, ToolExecutionContext } from '@forgelex/agent-core';
import type { SearchCaseLawInput } from '@forgelex/legal-tools';
import type { IndexedLegislationProvider } from '@forgelex/source-providers';
import type { ExecutionDriver } from './execution-worker.js';

export interface NativeCaseTaskOptions {
  workflowVersion?: CaseTaskOptions['workflowVersion'];
  guidedWorkflow?: boolean;
  skills?: CaseTaskOptions['skills'];
  authorizeNative: AuthorizeNativeTask;
  createProvider: CaseTaskOptions['createProvider'];
  authorizeRealProvider?: CaseTaskOptions['authorizeRealProvider'];
  researchService?: ResearchService;
  /** Trusted commercial gate: indexed research is included in its existing reservation. */
  executeIncludedResearch?: <T>(binding: TaskBinding, operation: () => Promise<T>) => Promise<T>;
  legislationProvider?: IndexedLegislationProvider;
  /** Runtime execution boundary (commercial or pilot); the current analysis is searched only among these. */
  manages?: (execution: AgenticExecution) => boolean;
}
export function createCaseTaskDriver(
  database: ForgeLexDatabase,
  client: Client,
  options: NativeCaseTaskOptions,
  researchService?: ResearchService,
) {
  const native = new NativeCaseContextService(database, options.authorizeNative),
    budget = new InferenceBudgetService(database, client);
  const research = options.researchService ?? researchService;
  const researchTools = research
    ? ([
        createSearchCaseLawTool(research),
        createGetAuthorityTool(research),
        createVerifyAuthorityTool(research),
      ] as const)
    : undefined;
  const legislation = options.legislationProvider && createGetLegislationTool(options.legislationProvider);
  const researchCapabilities = caseTaskResearchCapabilities([
    ...(researchTools ?? []),
    ...(legislation ? [legislation] : []),
  ]);
  const reviews = new NativeEvidenceReviewRepository(database, options.authorizeNative);
  const workspace = new AgenticWorkspaceRepository(database);
  // adjust_structure: the items of the case's current analysis (same criterion as the Estrutura tab), with id and text.
  const structureSource = async (owner: AgenticOwner, matterId: string | undefined) => {
    if (!matterId) throw new Error('STRUCTURE_NOT_AVAILABLE');
    const current = await findCurrentStructure(
      { store: { workspace }, native, manages: options.manages },
      owner,
      matterId,
    );
    if (!current) throw new Error('STRUCTURE_NOT_AVAILABLE');
    const review = await reviews.preview(owner, current.deliveryId);
    return structureItemsSource(current.deliveryId, review.items, new Set(Object.keys(review.decisions)));
  };
  const driver: ExecutionDriver = {
    next: ({ execution }) => ({
      callId: `case-task:${caseTaskStepIndex(execution.checkpoint?.caseTask)}:${execution.contextRevision}`,
      run: async ({ execution, job, signal }) => {
        const owner = { tenantId: execution.tenantId, userId: execution.userId };
        const binding = {
          ...owner,
          executionId: execution.id,
          conversationId: execution.conversationId,
          contextRevision: execution.contextRevision,
          objective: job.objective,
          actionId: AgenticTaskActionSchema.optional().parse(job.actionId),
          matterId: execution.matterId ?? undefined,
          previousDeliveryIds: caseTaskPreviousDeliveryIds(execution.checkpoint?.caseTask),
        };
        const tools: AgentTool<any, any>[] = [createNativeSelectedSourceTool(native, binding)];
        if (researchTools) {
          let ordinal = 0;
          const [search, getAuthority, verifyAuthority] = researchTools;
          const included = (tool: AgentTool<any, any>): AgentTool<any, any> => ({
            ...tool,
            execute: async (input, context) => {
              if (signal.aborted) throw new Error('SESSION_CANCELLED');
              return options.executeIncludedResearch!(binding, async () => {
                if (signal.aborted) throw new Error('SESSION_CANCELLED');
                return tool.execute(input, context);
              });
            },
          });
          if (options.executeIncludedResearch) {
            tools.push(...researchTools.map(included));
          } else {
            tools.push(
              {
                ...search,
                execute: async (input: SearchCaseLawInput, context: ToolExecutionContext) => {
                  const policy = getForgeLexBillingPolicy(search.name);
                  if (policy.mode !== 'METERED') throw new Error('RESEARCH_BILLING_POLICY_INVALID');
                  const index = caseTaskStepIndex(execution.checkpoint?.caseTask);
                  const callId = `stj:${index}:${++ordinal}`;
                  const billed = await budget.executeResearchCall(owner, execution.id, {
                    callId,
                    idempotencyKey: `${search.name}:${execution.id}:${callId}`,
                    costCents: policy.costCents,
                    requestFingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
                    operation: () => search.execute(input, context),
                  });
                  return billed.data;
                },
              },
              getAuthority,
              verifyAuthority,
            );
          }
        }
        if (legislation) tools.push(legislation);
        const task = new AgenticCaseTask({
          workflowVersion: options.workflowVersion ?? 10,
          guidedWorkflow: options.guidedWorkflow,
          skills: options.skills,
          context:
            binding.actionId === 'adjust_structure'
              ? native.withTrustedSources([await structureSource(owner, binding.matterId)])
              : native,
          tools,
          createProvider: options.createProvider,
          authorizeRealProvider: options.authorizeRealProvider,
        });
        const result = await task.step(binding, execution.checkpoint?.caseTask, signal);
        // adjust_structure: once its delivery is persisted, apply the commands to the current analysis. Idempotent per
        // execution; what cannot be applied safely is kept as questions with the analysis' review.
        if (binding.actionId === 'adjust_structure' && result.kind === 'completed' && result.deliveryIds?.length) {
          const id = result.deliveryIds.at(-1)!;
          const { delivery } = await native.getDelivery(owner, id);
          await applyStructureAdjustment(
            { store: { workspace }, native, reviews, manages: options.manages },
            owner,
            binding.matterId!,
            { id, delivery },
          );
        }
        if (result.kind === 'question')
          return { kind: 'question', checkpoint: { caseTask: result.state }, question: result.question! };
        return {
          kind: result.kind,
          checkpoint: { caseTask: result.state },
          ...(result.question ? { question: result.question } : {}),
          ...(result.deliveryIds ? { deliveryIds: result.deliveryIds } : {}),
        };
      },
    }),
  };
  return { native, driver, researchCapabilities };
}
