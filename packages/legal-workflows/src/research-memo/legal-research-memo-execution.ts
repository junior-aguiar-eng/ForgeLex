import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentTool, ToolExecutionContext, ToolRegistry } from '@forgelex/agent-core';
import { CaseLawSchema, LegalAuthoritySchema, LegalResearchMemoSchema, ResearchMemoRecordSchema } from '@forgelex/domain';
import type { CaseLaw, LegalAuthority, LegalIssue, LegalResearchMemo, ResearchMemoRecord } from '@forgelex/domain';
import type {
  LegalIssueRepository,
  MatterAuthorityRepository,
  MatterRepository,
  PersistentWorkflowCheckpointStore,
  ResearchMemoRepository,
} from '@forgelex/persistence';
import type { SearchCaseLawOutput, VerifyAuthorityOutput } from '@forgelex/legal-tools';

export function caseLawToLegalAuthority(item: CaseLaw): LegalAuthority {
  return LegalAuthoritySchema.parse({ id: item.id, type: 'CASE_LAW', citation: `${item.court} - ${item.processNumber}`,
    title: `Acórdão relatado por ${item.rapporteur}`, summary: item.syllabus, provenance: item.provenance,
    relevanceScore: 0.5, isBinding: false });
}

export function compileLegalResearchMemo(input: { query: string; authorities: LegalAuthority[]; matterId?: string; issues?: string[] }): LegalResearchMemo {
  const citations = input.authorities.map((authority) => authority.citation).join('; ');
  return LegalResearchMemoSchema.parse({ id: randomUUID(), title: `Memorando Jurídico: ${input.query}`, query: input.query,
    clientOrMatterId: input.matterId,
    executiveSummary: input.authorities.length > 0
      ? `Foram localizadas ${input.authorities.length} autoridade(s) para o recorte informado. O material permanece sujeito à conferência humana antes de qualquer conclusão jurídica.`
      : 'Nenhuma autoridade foi localizada para o recorte informado; não há base suficiente para uma síntese jurídica conclusiva.',
    keyTheses: [`Recorte pesquisado: ${input.query}.`, ...(input.issues ?? []).map((issue) => `Questão jurídica registrada: ${issue}.`),
      citations ? `Autoridades estruturadas: ${citations}.` : 'Autoridades estruturadas: nenhuma.', 'Status da revisão humana: pendente.'],
    applicableAuthorities: input.authorities,
    riskAnalysis: input.authorities.some((authority) => !authority.provenance.verified)
      ? 'Existem resultados sem verificação positiva; qualquer uso exige conferência da fonte e dos metadados.'
      : 'A saída não substitui a conferência da fonte, do contexto do precedente e da pertinência ao caso concreto.',
    recommendedAction: 'Conferir as fontes, delimitar as questões jurídicas e revisar o memorando antes de utilizá-lo.',
    generatedAt: new Date().toISOString(), verifiedByHuman: false });
}

export const LEGAL_RESEARCH_MEMO_WORKFLOW_ID = 'legal-research-memo' as const;
export const LEGAL_RESEARCH_MEMO_WORKFLOW_VERSION = '3.0.0' as const;
const STEPS = ['intake', 'issues', 'search', 'verify', 'synthesize', 'adversarial-check', 'memo', 'human-review'] as const;

export const LegalResearchMemoExecutionInputSchema = z.object({
  matterId: z.string().uuid(), query: z.string().trim().min(3), court: z.literal('STJ').default('STJ'),
  limit: z.number().int().min(1).max(20).default(10), issueIds: z.array(z.string().uuid()).optional(),
  idempotencyKey: z.string().trim().min(1),
});
export type LegalResearchMemoExecutionInput = z.infer<typeof LegalResearchMemoExecutionInputSchema>;

export const LegalResearchMemoExecutionOutputSchema = z.object({
  workflowId: z.literal(LEGAL_RESEARCH_MEMO_WORKFLOW_ID),
  workflowVersion: z.literal(LEGAL_RESEARCH_MEMO_WORKFLOW_VERSION), executionId: z.string().uuid(),
  source: z.enum(['REST', 'MCP', 'AGENT_CORE']), idempotentReplay: z.boolean(),
  record: ResearchMemoRecordSchema, issues: z.array(z.object({ id: z.string().uuid(), statement: z.string() })),
  research: z.object({ query: z.string(), court: z.literal('STJ'), total: z.number().int().nonnegative() }),
});
export type LegalResearchMemoExecutionOutput = z.infer<typeof LegalResearchMemoExecutionOutputSchema>;

export const LEGAL_RESEARCH_MEMO_DEFINITION = {
  id: LEGAL_RESEARCH_MEMO_WORKFLOW_ID,
  version: LEGAL_RESEARCH_MEMO_WORKFLOW_VERSION,
  inputSchema: LegalResearchMemoExecutionInputSchema,
  outputSchema: LegalResearchMemoExecutionOutputSchema,
  capabilities: ['research.search_case_law', 'research.verify_authority'] as const,
  steps: STEPS,
  limits: { supportedCourts: ['STJ'] as const, maxResults: 20 },
  approvalPolicy: { resultStatus: 'PENDING_HUMAN_REVIEW' as const, explicitDecisionRequired: true },
} as const;

export function isAcceptedAuthorityVerification(status: VerifyAuthorityOutput['status'] | undefined): boolean {
  return status === 'VERIFIED_OFFICIAL' || status === 'VERIFIED_PROVIDER';
}

interface Dependencies {
  matterRepository: MatterRepository;
  legalIssueRepository: LegalIssueRepository;
  researchMemoRepository: ResearchMemoRepository;
  checkpointStore: PersistentWorkflowCheckpointStore;
  matterAuthorityRepository: MatterAuthorityRepository;
  toolRegistry: ToolRegistry;
}

interface ExecutionContext { tenantId: string; userId: string; sessionId: string; abortSignal?: AbortSignal; source?: 'REST' | 'MCP' | 'AGENT_CORE' }

export class LegalResearchMemoExecutionService {
  public constructor(private readonly dependencies: Dependencies) {}

  public async execute(rawInput: LegalResearchMemoExecutionInput, context: ExecutionContext): Promise<LegalResearchMemoExecutionOutput> {
    const input = LegalResearchMemoExecutionInputSchema.parse(rawInput);
    const source = context.source ?? this.inferSource(context.sessionId);
    const existing = await this.dependencies.researchMemoRepository.getByIdempotencyKey(context.tenantId, input.matterId, input.idempotencyKey);
    if (existing) {
      const requestedIssueIds = [...(input.issueIds ?? existing.issueIds)].sort();
      const existingIssueIds = [...existing.issueIds].sort();
      if (existing.query !== input.query || JSON.stringify(requestedIssueIds) !== JSON.stringify(existingIssueIds)) {
        throw new Error('IDEMPOTENCY_CONFLICT: a chave já foi usada com parâmetros diferentes.');
      }
      const allIssues = await this.dependencies.legalIssueRepository.listIssues(context.tenantId, input.matterId);
      return this.output(existing, allIssues.filter((issue) => existing.issueIds.includes(issue.id)), input, source, existing.id, true);
    }
    if (!(await this.dependencies.matterRepository.getMatter(context.tenantId, input.matterId))) throw new Error('MATTER_NOT_FOUND');
    const allIssues = await this.dependencies.legalIssueRepository.listIssues(context.tenantId, input.matterId);
    const selectedIssues = input.issueIds === undefined ? allIssues : allIssues.filter((issue) => input.issueIds!.includes(issue.id));
    if (input.issueIds && selectedIssues.length !== new Set(input.issueIds).size) throw new Error('LEGAL_ISSUE_NOT_FOUND');

    const executionId = randomUUID();
    const state: { issues: LegalIssue[]; authorities: CaseLaw[]; verification: VerifyAuthorityOutput[]; memoId?: string } = {
      issues: selectedIssues, authorities: [], verification: [],
    };
    const save = async (stepId: string, stepIndex: number, status: 'RUNNING' | 'COMPLETED' | 'FAILED' = 'RUNNING') =>
      this.dependencies.checkpointStore.save({ executionId, workflowId: LEGAL_RESEARCH_MEMO_WORKFLOW_ID,
        workflowVersion: LEGAL_RESEARCH_MEMO_WORKFLOW_VERSION, tenantId: context.tenantId, matterId: input.matterId,
        source, idempotencyKey: input.idempotencyKey,
        stepId, stepIndex, status, state, createdAt: new Date(Date.now() + stepIndex).toISOString() });
    let stepIndex = 0;
    try {
      await save(STEPS[stepIndex], stepIndex++);
      await save(STEPS[stepIndex], stepIndex++);
      const search = await this.dependencies.toolRegistry.executeTool('research.search_case_law', {
        query: input.query, court: input.court, limit: input.limit,
      }, this.toolContext(context, input.matterId));
      const searchData = search.data as SearchCaseLawOutput;
      if (!search.success) throw new Error(search.error ?? 'RESEARCH_SEARCH_INCOMPLETE');
      state.authorities = searchData.items.map((item) => CaseLawSchema.parse(item));
      await save(STEPS[stepIndex], stepIndex++);

      for (const authority of state.authorities) {
        const result = await this.dependencies.toolRegistry.executeTool('research.verify_authority', {
          court: authority.court, processNumber: authority.processNumber, judgmentDate: authority.judgmentDate,
        }, this.toolContext(context, input.matterId));
        state.verification.push(result.data as VerifyAuthorityOutput);
      }
      for (let index = 0; index < state.authorities.length; index++) {
        const saved = await this.dependencies.matterAuthorityRepository.saveAuthority({ tenantId: context.tenantId,
          matterId: input.matterId, savedBy: context.userId, authority: state.authorities[index] });
        await this.dependencies.matterAuthorityRepository.recordVerification({ tenantId: context.tenantId,
          matterId: input.matterId, savedAuthorityId: saved.record.id, createdBy: context.userId,
          verification: state.verification[index] });
      }
      await save(STEPS[stepIndex], stepIndex++);
      const usable = state.authorities.filter((authority, index) => {
        const status = state.verification[index]?.status;
        return authority.provenance.verified && isAcceptedAuthorityVerification(status);
      });
      const memo = compileLegalResearchMemo({ query: input.query, matterId: input.matterId,
        authorities: usable.map(caseLawToLegalAuthority), issues: selectedIssues.map((issue) => issue.statement) });
      state.memoId = memo.id;
      await save(STEPS[stepIndex], stepIndex++);
      await save(STEPS[stepIndex], stepIndex++);
      const record = await this.dependencies.researchMemoRepository.createMemo({ tenantId: context.tenantId,
        matterId: input.matterId, query: input.query, issueIds: selectedIssues.map((issue) => issue.id), memo,
        workflowVersion: LEGAL_RESEARCH_MEMO_WORKFLOW_VERSION, idempotencyKey: input.idempotencyKey, createdBy: context.userId });
      await save(STEPS[stepIndex], stepIndex++);
      await save(STEPS[stepIndex], stepIndex++);
      await save('__completed__', STEPS.length - 1, 'COMPLETED');
      return this.output(record, selectedIssues, input, source, executionId, false, searchData.total);
    } catch (error) {
      await save(STEPS[Math.min(stepIndex, STEPS.length - 1)], Math.min(stepIndex, STEPS.length - 1), 'FAILED');
      throw error;
    }
  }

  private output(record: ResearchMemoRecord, issues: LegalIssue[], input: LegalResearchMemoExecutionInput,
    source: 'REST' | 'MCP' | 'AGENT_CORE', executionId: string, idempotentReplay: boolean, total = record.memo.applicableAuthorities.length): LegalResearchMemoExecutionOutput {
    return LegalResearchMemoExecutionOutputSchema.parse({ workflowId: LEGAL_RESEARCH_MEMO_WORKFLOW_ID,
      workflowVersion: LEGAL_RESEARCH_MEMO_WORKFLOW_VERSION, executionId, source, idempotentReplay, record,
      issues: issues.map(({ id, statement }) => ({ id, statement })), research: { query: input.query, court: 'STJ', total } });
  }

  private toolContext(context: ExecutionContext, matterId: string): ToolExecutionContext {
    return { sessionId: context.sessionId, tenantId: context.tenantId, userId: context.userId, matterId,
      abortSignal: context.abortSignal ?? new AbortController().signal, source: context.source };
  }

  private inferSource(sessionId: string): 'REST' | 'MCP' | 'AGENT_CORE' {
    if (sessionId.startsWith('mcp')) return 'MCP';
    if (sessionId.startsWith('agent')) return 'AGENT_CORE';
    return 'REST';
  }
}

export function createLegalResearchMemoTool(service: LegalResearchMemoExecutionService): AgentTool<LegalResearchMemoExecutionInput, LegalResearchMemoExecutionOutput> {
  return { name: 'workflow.legal_research_memo', description: 'Executa o workflow jurídico versionado de research memo sobre um matter.',
    impactLevel: 'L1_ANALYSIS', inputSchema: LegalResearchMemoExecutionInputSchema, outputSchema: LegalResearchMemoExecutionOutputSchema,
    timeoutMs: 60_000, execute: async (input, context) => ({ success: true, data: await service.execute(input, context) }) };
}
