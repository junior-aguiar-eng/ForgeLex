import {
  EvidenceCoverage,
  EvidenceCoverageSchema,
  EvidenceItem,
  EvidenceItemSchema,
  Fact,
  FactSchema,
  LegalDocument,
  TimelineEvent,
  TimelineEventSchema,
} from '@forgelex/domain';
import { FactsEvidenceService } from '@forgelex/legal-tools';
import { MatterRepository } from '@forgelex/persistence';
import { randomUUID } from 'node:crypto';
import { InMemoryWorkflowCheckpointStore, VersionedWorkflowRunner } from '../runtime/workflow-runner.js';
import { WorkflowCheckpointStore, WorkflowEvent, WorkflowStep } from '../contracts/workflow.js';
import { z } from 'zod';

const AnalyzedDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  contentHash: z.string().length(64),
  anchorCount: z.number().int().nonnegative(),
});
export type AnalyzedDocument = z.infer<typeof AnalyzedDocumentSchema>;

export const CaseDocumentAnalysisReportSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.literal('case-document-analysis'),
  workflowVersion: z.string().min(1),
  executionId: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().min(1),
  documents: z.array(AnalyzedDocumentSchema),
  timeline: z.array(TimelineEventSchema),
  facts: z.array(FactSchema),
  evidence: z.array(EvidenceItemSchema),
  coverage: z.array(EvidenceCoverageSchema),
  issues: z.array(z.string().min(3)),
  researchGaps: z.array(z.string().min(3)),
  limitations: z.array(z.string().min(3)),
  generatedAt: z.string().datetime(),
});
export type CaseDocumentAnalysisReport = z.infer<typeof CaseDocumentAnalysisReportSchema>;

export interface CaseDocumentAnalysisInput {
  tenantId: string;
  userId: string;
  matterId: string;
  knownIssues?: string[];
  executionId?: string;
  resumeExecutionId?: string;
}

export interface CaseDocumentAnalysisSnapshot {
  documents: AnalyzedDocument[];
  timeline: TimelineEvent[];
  facts: Fact[];
  evidence: EvidenceItem[];
  coverage: EvidenceCoverage[];
}

export interface CaseDocumentAnalysisSource {
  load(tenantId: string, matterId: string): Promise<CaseDocumentAnalysisSnapshot>;
}

/** Fonte produtiva sobre a persistência atual; nunca inclui o texto integral no relatório. */
export class PersistenceCaseDocumentAnalysisSource implements CaseDocumentAnalysisSource {
  public constructor(
    private readonly matterRepository: MatterRepository,
    private readonly factsEvidenceService: FactsEvidenceService,
  ) {}

  public async load(tenantId: string, matterId: string): Promise<CaseDocumentAnalysisSnapshot> {
    const matter = await this.matterRepository.getMatter(tenantId, matterId);
    if (!matter) throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');

    const documents = await this.matterRepository.listDocuments(tenantId, matterId);
    const analyzedDocuments = await Promise.all(documents.map(async (document: LegalDocument) => {
      const detail = await this.matterRepository.getDocumentVersion(tenantId, document.id);
      return AnalyzedDocumentSchema.parse({
        id: document.id,
        title: document.title,
        contentHash: document.contentHash,
        anchorCount: detail?.anchors.length ?? 0,
      });
    }));
    const context = { tenantId, userId: 'workflow-system', matterId };
    const [factsResult, evidence, timeline] = await Promise.all([
      this.factsEvidenceService.listFacts(context),
      this.factsEvidenceService.listEvidence(context),
      this.factsEvidenceService.listTimeline(context),
    ]);
    return {
      documents: analyzedDocuments,
      timeline,
      facts: factsResult.items,
      evidence,
      coverage: factsResult.coverage,
    };
  }
}

interface CaseDocumentAnalysisState {
  snapshot?: CaseDocumentAnalysisSnapshot;
  issues: string[];
  researchGaps: string[];
  report?: CaseDocumentAnalysisReport;
}

export class CaseDocumentAnalysisWorkflow {
  private readonly runner: VersionedWorkflowRunner<CaseDocumentAnalysisInput, CaseDocumentAnalysisState, CaseDocumentAnalysisReport>;

  public constructor(
    private readonly source: CaseDocumentAnalysisSource,
    checkpointStore: WorkflowCheckpointStore = new InMemoryWorkflowCheckpointStore(),
  ) {
    const steps: readonly WorkflowStep<CaseDocumentAnalysisInput, CaseDocumentAnalysisState>[] = [
      {
        id: 'ingest',
        execute: async (input, state) => ({
          state: { ...state, snapshot: await this.source.load(input.tenantId, input.matterId) },
          output: { source: 'matter-persistence' },
        }),
      },
      {
        id: 'document_structure',
        execute: async (_input, state) => ({
          state,
          output: {
            documentCount: state.snapshot?.documents.length ?? 0,
            anchorCount: state.snapshot?.documents.reduce((sum, document) => sum + document.anchorCount, 0) ?? 0,
          },
        }),
      },
      {
        id: 'timeline',
        execute: async (_input, state) => ({
          state,
          output: { eventCount: state.snapshot?.timeline.length ?? 0, source: 'explicit-events' },
        }),
      },
      {
        id: 'facts',
        execute: async (_input, state) => ({
          state,
          output: { factCount: state.snapshot?.facts.length ?? 0, source: 'registered-facts' },
        }),
      },
      {
        id: 'evidence',
        execute: async (_input, state) => ({
          state,
          output: { evidenceCount: state.snapshot?.evidence.length ?? 0, source: 'registered-evidence' },
        }),
      },
      {
        id: 'issues',
        execute: async (input, state) => ({
          state: { ...state, issues: [...(input.knownIssues ?? [])] },
          output: { issueCount: input.knownIssues?.length ?? 0, source: 'caller' },
        }),
      },
      {
        id: 'research_gaps',
        execute: async (_input, state) => {
          const gaps = (state.snapshot?.coverage ?? [])
            .filter((item) => item.coverage !== 'SUPPORTED')
            .map((item) => `Fato ${item.factId} possui cobertura ${item.coverage}.`);
          return { state: { ...state, researchGaps: gaps }, output: { gapCount: gaps.length } };
        },
      },
      {
        id: 'report',
        execute: async (input, state, context) => {
          const snapshot = state.snapshot;
          if (!snapshot) throw new Error('WORKFLOW_CONTEXT_MISSING: a fotografia do matter não foi carregada.');
          const report = CaseDocumentAnalysisReportSchema.parse({
            id: randomUUID(),
            workflowId: 'case-document-analysis',
            workflowVersion: '1.0.0',
            executionId: context.executionId,
            tenantId: context.tenantId,
            matterId: input.matterId,
            documents: snapshot.documents,
            timeline: snapshot.timeline,
            facts: snapshot.facts,
            evidence: snapshot.evidence,
            coverage: snapshot.coverage,
            issues: state.issues,
            researchGaps: state.researchGaps,
            limitations: [
              'A estruturação não extrai fatos novos automaticamente.',
              'Questões jurídicas dependem de entrada explícita neste marco.',
              'O relatório não conclui sobre autenticidade ou suficiência da prova.',
            ],
            generatedAt: new Date().toISOString(),
          });
          return { state: { ...state, report }, output: { reportId: report.id } };
        },
      },
    ];
    this.runner = new VersionedWorkflowRunner({
      id: 'case-document-analysis',
      version: '1.0.0',
      steps,
      checkpointStore,
      finalize: (state) => {
        if (!state.report) throw new Error('WORKFLOW_RESULT_MISSING: relatório não foi gerado.');
        return state.report;
      },
    });
  }

  public getCheckpointStore(): WorkflowCheckpointStore {
    return this.runner.getCheckpointStore();
  }

  public async *execute(input: CaseDocumentAnalysisInput): AsyncIterable<WorkflowEvent> {
    yield* this.runner.execute(
      input,
      {
        executionId: input.executionId,
        resumeExecutionId: input.resumeExecutionId,
        tenantId: input.tenantId,
        userId: input.userId,
        matterId: input.matterId,
      },
      { issues: [], researchGaps: [] },
    );
  }
}
