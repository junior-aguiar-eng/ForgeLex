import {
  EvidenceCoverage,
  EvidenceCoverageSchema,
  EvidenceItem,
  EvidenceItemSchema,
  Fact,
  FactSchema,
  LegalAuthority,
  LegalAuthoritySchema,
} from '@forgelex/domain';
import { randomUUID } from 'node:crypto';
import { InMemoryWorkflowCheckpointStore, VersionedWorkflowRunner } from '../runtime/workflow-runner.js';
import { WorkflowCheckpointStore, WorkflowEvent, WorkflowStep } from '../contracts/workflow.js';
import { z } from 'zod';

const DraftOutlineSectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3),
  linkedFactIds: z.array(z.string().uuid()),
  linkedEvidenceIds: z.array(z.string().uuid()),
  linkedAuthorityIds: z.array(z.string().uuid()),
});

export const PleadingDraftResultSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.literal('pleading-draft'),
  workflowVersion: z.string().min(1),
  executionId: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().min(1),
  title: z.string().min(3),
  outline: z.array(DraftOutlineSectionSchema),
  linkedFacts: z.array(FactSchema),
  linkedEvidence: z.array(EvidenceItemSchema),
  linkedAuthorities: z.array(LegalAuthoritySchema),
  citationFindings: z.array(z.string().min(3)),
  adversarialFindings: z.array(z.string().min(3)),
  status: z.literal('DRAFT_ONLY'),
  approvalStatus: z.literal('PENDING_HUMAN_REVIEW'),
  generatedAt: z.string().datetime(),
});
export type PleadingDraftResult = z.infer<typeof PleadingDraftResultSchema>;

export interface PleadingDraftInput {
  tenantId: string;
  userId: string;
  matterId: string;
  title: string;
  issues: string[];
  facts: Fact[];
  evidence: EvidenceItem[];
  coverage: EvidenceCoverage[];
  authorities: LegalAuthority[];
  executionId?: string;
  resumeExecutionId?: string;
}

interface PleadingDraftState {
  title: string;
  issues: string[];
  facts: Fact[];
  evidence: EvidenceItem[];
  coverage: EvidenceCoverage[];
  authorities: LegalAuthority[];
  outline: z.infer<typeof DraftOutlineSectionSchema>[];
  citationFindings: string[];
  adversarialFindings: string[];
}

export class PleadingDraftWorkflow {
  private readonly runner: VersionedWorkflowRunner<PleadingDraftInput, PleadingDraftState, PleadingDraftResult>;

  public constructor(checkpointStore: WorkflowCheckpointStore = new InMemoryWorkflowCheckpointStore()) {
    const steps: readonly WorkflowStep<PleadingDraftInput, PleadingDraftState>[] = [
      {
        id: 'matter_context',
        execute: async (input, state) => ({
          state: { ...state, title: input.title, issues: [...input.issues] },
          output: { matterId: input.matterId, issueCount: input.issues.length },
        }),
      },
      {
        id: 'facts',
        execute: async (input, state) => ({
          state: { ...state, facts: input.facts.map((fact) => FactSchema.parse(fact)) },
          output: { factCount: input.facts.length },
        }),
      },
      {
        id: 'evidence',
        execute: async (input, state) => ({
          state: { ...state, evidence: input.evidence.map((item) => EvidenceItemSchema.parse(item)), coverage: input.coverage.map((item) => EvidenceCoverageSchema.parse(item)) },
          output: { evidenceCount: input.evidence.length },
        }),
      },
      {
        id: 'issues',
        execute: async (_input, state) => ({
          state,
          output: { issues: state.issues, source: 'caller' },
        }),
      },
      {
        id: 'research',
        execute: async (input, state) => ({
          state: { ...state, authorities: input.authorities.map((authority) => LegalAuthoritySchema.parse(authority)) },
          output: { authorityCount: input.authorities.length },
        }),
      },
      {
        id: 'thesis_map',
        execute: async (_input, state) => ({
          state,
          output: { thesisMap: 'Não gerado automaticamente neste marco; questões recebidas do chamador.' },
        }),
      },
      {
        id: 'draft',
        execute: async (input, state) => {
          const factIds = state.facts.map((fact) => fact.id);
          const evidenceIds = state.evidence.map((item) => item.id);
          const authorityIds = state.authorities.map((authority) => authority.id);
          const outline = [
            { id: randomUUID(), title: 'Síntese dos fatos', linkedFactIds: factIds, linkedEvidenceIds: evidenceIds, linkedAuthorityIds: [] },
            { id: randomUUID(), title: 'Questões jurídicas', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [] },
            { id: randomUUID(), title: 'Fundamentação a revisar', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: authorityIds },
            { id: randomUUID(), title: 'Pedidos e providências', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [] },
          ].map((section) => DraftOutlineSectionSchema.parse(section));
          return { state: { ...state, outline }, output: { title: input.title, sectionCount: outline.length } };
        },
      },
      {
        id: 'citation_validation',
        execute: async (_input, state) => {
          const findings = state.authorities.flatMap((authority) =>
            authority.provenance.verified
              ? []
              : [`Autoridade ${authority.id} não possui verificação positiva.`],
          );
          return { state: { ...state, citationFindings: findings }, output: { findings } };
        },
      },
      {
        id: 'adversarial_review',
        execute: async (_input, state) => {
          const findings = [
            ...(state.facts.length === 0 ? ['A minuta não possui fatos vinculados.'] : []),
            ...(state.coverage.some((item) => item.coverage !== 'SUPPORTED') ? ['Há fatos com cobertura incompleta ou conflitante.'] : []),
            ...(state.issues.length === 0 ? ['Nenhuma questão jurídica foi fornecida.'] : []),
          ];
          return { state: { ...state, adversarialFindings: findings }, output: { findings } };
        },
      },
      {
        id: 'human_approval',
        execute: async (_input, state) => ({
          state,
          output: { status: 'PENDING_HUMAN_REVIEW', externalEffect: false },
        }),
      },
    ];
    this.runner = new VersionedWorkflowRunner({
      id: 'pleading-draft',
      version: '1.0.0',
      steps,
      checkpointStore,
      finalize: (state, context) => {
        const result = PleadingDraftResultSchema.parse({
          id: randomUUID(),
          workflowId: 'pleading-draft',
          workflowVersion: '1.0.0',
          executionId: context.executionId,
          tenantId: context.tenantId,
          matterId: context.matterId,
          title: state.title,
          outline: state.outline,
          linkedFacts: state.facts,
          linkedEvidence: state.evidence,
          linkedAuthorities: state.authorities,
          citationFindings: state.citationFindings,
          adversarialFindings: state.adversarialFindings,
          status: 'DRAFT_ONLY',
          approvalStatus: 'PENDING_HUMAN_REVIEW',
          generatedAt: new Date().toISOString(),
        });
        return result;
      },
    });
  }

  public getCheckpointStore(): WorkflowCheckpointStore {
    return this.runner.getCheckpointStore();
  }

  public async *execute(input: PleadingDraftInput): AsyncIterable<WorkflowEvent> {
    yield* this.runner.execute(
      input,
      {
        executionId: input.executionId,
        resumeExecutionId: input.resumeExecutionId,
        tenantId: input.tenantId,
        userId: input.userId,
        matterId: input.matterId,
      },
      {
        title: '',
        issues: [],
        facts: [],
        evidence: [],
        coverage: [],
        authorities: [],
        outline: [],
        citationFindings: [],
        adversarialFindings: [],
      },
    );
  }
}
