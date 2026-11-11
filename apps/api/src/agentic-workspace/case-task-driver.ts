import { createHash } from 'node:crypto';
import type { ForgeLexDatabase, Client } from '@forgelex/persistence';
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
import { AgenticTaskActionSchema, type TaskBinding } from '@forgelex/domain';
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
          context: native,
          tools,
          createProvider: options.createProvider,
          authorizeRealProvider: options.authorizeRealProvider,
        });
        const result = await task.step(binding, execution.checkpoint?.caseTask, signal);
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
