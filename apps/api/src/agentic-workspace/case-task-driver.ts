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
  structureContextSource,
  type AgenticExecution,
  type AgenticOwner,
  type TaskBinding,
} from '@forgelex/domain';
import { findCaseStructure, structureSourceKey } from './case-structure.js';
import { caseHistorySource, type CaseHistoryEntry } from './case-history-source.js';
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
  // E3/E4: the case structure for drafting (confirmed and still unchecked items of all the analyses and a line per
  // document). Best effort: a case without structure, or one that cannot be read, drafts exactly as before.
  const contextSource = async (owner: AgenticOwner, matterId: string | undefined, actionId: string | undefined) => {
    if (!matterId || (actionId && actionId !== 'create_document')) return undefined;
    try {
      const entries = await findCaseStructure(
        { store: { workspace }, native, manages: options.manages },
        owner,
        matterId,
      );
      if (!entries.length) return undefined;
      const items: Awaited<ReturnType<typeof reviews.preview>>['items'] = [];
      const decisions = new Map<string, 'ADOPT' | 'DISCARD'>();
      const documents: { title: string; pieceType?: string; parties: string[]; parts: number }[] = [];
      const byKey = new Map<string, number>();
      for (const entry of entries) {
        const review = await reviews.preview(owner, entry.deliveryId);
        items.push(...review.items);
        for (const [id, decision] of Object.entries(review.decisions)) decisions.set(id, decision.action);
        const { delivery } = await native.getDelivery(owner, entry.deliveryId);
        const profile = delivery.documentProfile;
        const parties = (profile?.parties ?? []).map((party) => `${party.name} (${party.role})`);
        const known = entry.documentKey === undefined ? undefined : byKey.get(entry.documentKey);
        if (known !== undefined) {
          const document = documents[known]!;
          document.parts += 1;
          for (const party of parties) if (!document.parties.includes(party)) document.parties.push(party);
          if (profile?.pieceType && !document.pieceType) {
            document.pieceType = profile.pieceType;
            document.title = profile.pieceType;
          }
          continue;
        }
        documents.push({
          ...(profile?.pieceType ? { pieceType: profile.pieceType } : {}),
          title:
            profile?.pieceType ??
            (entry.attachment
              ? entry.attachment.name.replace(/\.(pdf|txt|md|docx)$/i, '')
              : `Documento ${documents.length + 1}`),
          parties,
          parts: 1,
        });
        if (entry.documentKey !== undefined) byKey.set(entry.documentKey, documents.length - 1);
      }
      const lines = documents.map(
        (document, index) =>
          `Documento ${index + 1}: ${document.title}` +
          (document.parties.length ? `; partes: ${document.parties.join(', ')}` : '') +
          (document.parts > 1 ? `; lido em ${document.parts} partes` : ''),
      );
      return structureContextSource(
        structureSourceKey(
          matterId,
          entries.map((entry) => entry.deliveryId),
        ),
        items,
        decisions,
        undefined,
        lines,
      );
    } catch {
      return undefined;
    }
  };
  // Regra do mínimo: o que as outras conversas do caso produziram acompanha a conversa, sem botão nem etapa.
  // Melhor esforço: sem caso, sem conversas anteriores ou com falha de leitura, segue sem histórico.
  const historySource = async (owner: AgenticOwner, matterId: string | undefined, conversationId: string) => {
    if (!matterId) return undefined;
    try {
      const conversations = await workspace.listMatterConversations(owner, matterId, { limit: 20 });
      const entries: CaseHistoryEntry[] = [];
      for (const conversation of conversations) {
        const execution = conversation.execution;
        if (conversation.conversationId === conversationId || conversation.matterId !== matterId) continue;
        if (execution.status !== 'COMPLETED' || (options.manages && !options.manages(execution))) continue;
        const deliveryId = execution.deliveryIds.at(-1);
        if (!deliveryId) continue;
        const { delivery } = await native.getDelivery(owner, deliveryId);
        entries.push({ conversationId: conversation.conversationId, objective: conversation.objective, delivery });
      }
      return caseHistorySource(matterId, entries);
    } catch {
      return undefined;
    }
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
          context: await (async () => {
            // Em sequência: o banco de desenvolvimento e o de teste têm conexão única (ver E4).
            const structure = await contextSource(owner, binding.matterId, binding.actionId);
            const history = await historySource(owner, binding.matterId, binding.conversationId);
            const sources = [structure, history].filter((source): source is NonNullable<typeof source> =>
              Boolean(source),
            );
            return sources.length ? native.withTrustedSources(sources) : native;
          })(),
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
