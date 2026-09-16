import { AgentEvent, AgentRuntime } from '@forgelex/agent-core';
import {
  LegalAuthority,
  LegalAuthoritySchema,
  LegalResearchMemo,
  LegalResearchMemoSchema,
} from '@forgelex/domain';
import { randomUUID } from 'node:crypto';
import { InMemoryWorkflowCheckpointStore, VersionedWorkflowRunner } from '../runtime/workflow-runner.js';
import {
  WorkflowCheckpointStore,
  WorkflowEvent,
  WorkflowStep,
} from '../contracts/workflow.js';

export interface RunMemoWorkflowInput {
  query: string;
  clientOrMatterId?: string;
  tenantId: string;
  userId: string;
  issues?: string[];
  executionId?: string;
  resumeExecutionId?: string;
}

interface MemoWorkflowState {
  query: string;
  matterId?: string;
  issues: string[];
  authorities: LegalAuthority[];
  verificationStatuses: string[];
  adversarialFindings: string[];
  memo?: LegalResearchMemo;
}

export class LegalResearchMemoWorkflow {
  private readonly runtime: AgentRuntime;
  private readonly runner: VersionedWorkflowRunner<RunMemoWorkflowInput, MemoWorkflowState, LegalResearchMemo>;
  private lastGatheredAuthorities: LegalAuthority[] = [];

  public constructor(runtime: AgentRuntime, checkpointStore: WorkflowCheckpointStore = new InMemoryWorkflowCheckpointStore()) {
    this.runtime = runtime;
    const steps: readonly WorkflowStep<RunMemoWorkflowInput, MemoWorkflowState>[] = [
      {
        id: 'intake',
        execute: async (input, state) => ({
          state: { ...state, query: input.query, matterId: input.clientOrMatterId },
          output: { query: input.query, matterId: input.clientOrMatterId },
        }),
      },
      {
        id: 'identify_issues',
        execute: async (input, state) => ({
          state: { ...state, issues: [...(input.issues ?? [])] },
          output: { issueCount: input.issues?.length ?? 0, source: 'caller' },
        }),
      },
      {
        id: 'search_authorities',
        execute: async (input, state) => {
          const agentEvents: AgentEvent[] = [];
          const authorities: LegalAuthority[] = [];
          for await (const event of this.runtime.run({
            sessionId: randomUUID(),
            tenantId: input.tenantId,
            userId: input.userId,
            matterId: input.clientOrMatterId,
            prompt: `Pesquisar autoridades jurídicas para o recorte informado: "${input.query}".`,
          })) {
            agentEvents.push(event);
            if (event.type !== 'tool:completed' || event.toolName !== 'research.search_case_law') continue;
            const output = event.output as { items?: unknown };
            if (!output || !Array.isArray(output.items)) continue;
            for (const item of output.items) {
              const authority = this.toLegalAuthority(item);
              if (authority) authorities.push(authority);
            }
          }
          const verificationStatuses = agentEvents
            .filter((event) => event.type === 'tool:completed' && event.toolName === 'research.verify_authority')
            .map((event) => {
              if (event.type !== 'tool:completed') return 'UNVERIFIED';
              const output = event.output as { status?: string };
              return output.status ?? 'UNVERIFIED';
            });
          this.lastGatheredAuthorities = authorities;
          return {
            state: { ...state, authorities, verificationStatuses },
            output: { authorityCount: authorities.length, verificationCount: verificationStatuses.length },
            agentEvents,
          };
        },
      },
      {
        id: 'verify_authorities',
        execute: async (_input, state) => ({
          state,
          output: {
            verificationStatuses: state.verificationStatuses,
            verifiedCount: state.verificationStatuses.filter((status) => status === 'VERIFIED_OFFICIAL' || status === 'VERIFIED_PROVIDER').length,
          },
        }),
      },
      {
        id: 'synthesize',
        execute: async (_input, state) => {
          const memo = this.compileFinalMemo(state.query, state.authorities, state.matterId);
          return { state: { ...state, memo }, output: { memoId: memo.id, authorityCount: memo.applicableAuthorities.length } };
        },
      },
      {
        id: 'adversarial_check',
        execute: async (_input, state) => {
          const findings = [
            ...(state.authorities.length === 0 ? ['Nenhuma autoridade foi localizada para o recorte.'] : []),
            ...(state.authorities.some((authority) => !authority.provenance.verified)
              ? ['Há autoridade sem verificação positiva; não tratar o resultado como confirmado.']
              : []),
            ...(state.issues.length === 0 ? ['Questões jurídicas não foram fornecidas neste fluxo.'] : []),
          ];
          return { state: { ...state, adversarialFindings: findings }, output: { findings } };
        },
      },
      {
        id: 'research_memo',
        execute: async (_input, state) => {
          if (!state.memo) throw new Error('WORKFLOW_RESULT_MISSING: memorando não foi sintetizado.');
          return {
            state,
            output: { memoId: state.memo.id, status: 'STRUCTURED_RESEARCH_MEMO' },
          };
        },
      },
      {
        id: 'human_review',
        execute: async (_input, state) => ({
          state,
          output: { status: 'PENDING_HUMAN_REVIEW', findings: state.adversarialFindings },
        }),
      },
    ];
    this.runner = new VersionedWorkflowRunner({
      id: 'legal-research-memo',
      version: '2.0.0',
      steps,
      checkpointStore,
      finalize: (state) => {
        if (!state.memo) throw new Error('WORKFLOW_RESULT_MISSING: o memorando não foi sintetizado.');
        return state.memo;
      },
    });
  }

  public getLastGatheredAuthorities(): LegalAuthority[] {
    return this.lastGatheredAuthorities;
  }

  public getCheckpointStore(): WorkflowCheckpointStore {
    return this.runner.getCheckpointStore();
  }

  public async *executeWorkflow(input: RunMemoWorkflowInput): AsyncIterable<WorkflowEvent> {
    this.lastGatheredAuthorities = [];
    yield* this.runner.execute(
      input,
      {
        executionId: input.executionId,
        resumeExecutionId: input.resumeExecutionId,
        tenantId: input.tenantId,
        userId: input.userId,
        matterId: input.clientOrMatterId,
      },
      {
        query: input.query,
        matterId: input.clientOrMatterId,
        issues: [],
        authorities: [],
        verificationStatuses: [],
        adversarialFindings: [],
      },
    );
  }

  /** Compatibilidade com o contrato anterior: expõe somente os eventos do AgentRuntime. */
  public async *execute(input: RunMemoWorkflowInput): AsyncIterable<AgentEvent> {
    for await (const event of this.executeWorkflow(input)) {
      if (event.type === 'workflow:agent_event') yield event.event;
    }
  }

  public compileFinalMemo(query: string, authorities: LegalAuthority[], matterId?: string): LegalResearchMemo {
    const citations = authorities.map((authority) => authority.citation).join('; ');
    return LegalResearchMemoSchema.parse({
      id: randomUUID(),
      title: `Memorando Jurídico: ${query}`,
      query,
      clientOrMatterId: matterId,
      executiveSummary: authorities.length > 0
        ? `Foram localizadas ${authorities.length} autoridade(s) para o recorte informado. O material permanece sujeito à conferência humana antes de qualquer conclusão jurídica.`
        : 'Nenhuma autoridade foi localizada para o recorte informado; não há base suficiente para uma síntese jurídica conclusiva.',
      keyTheses: [
        `Recorte pesquisado: ${query}.`,
        citations ? `Autoridades estruturadas: ${citations}.` : 'Autoridades estruturadas: nenhuma.',
        'Status da revisão humana: pendente.',
      ],
      applicableAuthorities: authorities,
      riskAnalysis: authorities.some((authority) => !authority.provenance.verified)
        ? 'Existem resultados sem verificação positiva; qualquer uso exige conferência da fonte e dos metadados.'
        : 'A saída não substitui a conferência da fonte, do contexto do precedente e da pertinência ao caso concreto.',
      recommendedAction: 'Conferir as fontes, delimitar as questões jurídicas e revisar o memorando antes de utilizá-lo.',
      generatedAt: new Date().toISOString(),
      verifiedByHuman: false,
    });
  }

  private toLegalAuthority(item: unknown): LegalAuthority | undefined {
    if (!item || typeof item !== 'object') return undefined;
    const candidate = item as {
      court?: string;
      processNumber?: string;
      rapporteur?: string;
      syllabus?: string;
      provenance?: unknown;
    };
    const parsed = LegalAuthoritySchema.safeParse({
      id: randomUUID(),
      type: 'CASE_LAW',
      citation: `${candidate.court ?? 'Tribunal não informado'} - ${candidate.processNumber ?? 'processo não informado'}`,
      title: candidate.rapporteur ? `Acórdão relatado por ${candidate.rapporteur}` : 'Acórdão localizado na pesquisa',
      summary: candidate.syllabus ?? 'Ementa não disponibilizada pelo provider.',
      provenance: candidate.provenance,
      relevanceScore: 0.5,
      isBinding: false,
    });
    return parsed.success ? parsed.data : undefined;
  }
}
