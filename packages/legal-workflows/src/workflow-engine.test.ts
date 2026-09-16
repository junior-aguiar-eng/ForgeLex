import { describe, expect, it } from 'vitest';
import { createDatabase, FactsEvidenceRepository, MatterRepository, runPersistenceMigrations } from '@forgelex/persistence';
import { FactsEvidenceService } from '@forgelex/legal-tools';
import type { Client } from '@libsql/client';
import { InMemoryWorkflowCheckpointStore } from './runtime/workflow-runner.js';
import {
  CaseDocumentAnalysisInput,
  CaseDocumentAnalysisReport,
  CaseDocumentAnalysisSnapshot,
  CaseDocumentAnalysisSource,
  PersistenceCaseDocumentAnalysisSource,
  CaseDocumentAnalysisWorkflow,
} from './case-document-analysis/case-document-analysis-workflow.js';
import { PleadingDraftResult, PleadingDraftWorkflow } from './pleading-draft/pleading-draft-workflow.js';

const factId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';

const snapshot: CaseDocumentAnalysisSnapshot = {
  documents: [{
    id: '44444444-4444-4444-8444-444444444444',
    title: 'Contrato',
    contentHash: 'a'.repeat(64),
    anchorCount: 2,
  }],
  timeline: [],
  facts: [{
    id: factId,
    tenantId: 'tenant_workflow',
    matterId,
    statement: 'O contrato foi assinado em janeiro de 2026.',
    category: 'TEMPORAL',
    status: 'ASSERTED',
    createdBy: 'user_workflow',
    createdAt: '2026-09-16T12:00:00.000Z',
    updatedAt: '2026-09-16T12:00:00.000Z',
  }],
  evidence: [{
    id: evidenceId,
    tenantId: 'tenant_workflow',
    matterId,
    title: 'Contrato assinado',
    evidenceType: 'DOCUMENT',
    status: 'AVAILABLE',
    createdBy: 'user_workflow',
    createdAt: '2026-09-16T12:00:00.000Z',
    updatedAt: '2026-09-16T12:00:00.000Z',
  }],
  coverage: [{
    id: '55555555-5555-4555-8555-555555555555',
    tenantId: 'tenant_workflow',
    matterId,
    factId,
    supportingEvidenceCount: 1,
    contradictingEvidenceCount: 0,
    contextualEvidenceCount: 0,
    supportingAnchorCount: 1,
    contradictingAnchorCount: 0,
    coverage: 'SUPPORTED',
    calculatedAt: '2026-09-16T12:00:00.000Z',
  }],
};

class FailingOnceSource implements CaseDocumentAnalysisSource {
  private failed = false;

  public async load(): Promise<CaseDocumentAnalysisSnapshot> {
    if (!this.failed) {
      this.failed = true;
      throw new Error('SOURCE_TEMPORARILY_UNAVAILABLE');
    }
    return snapshot;
  }
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe('workflow engine versionado', () => {
  it('salva checkpoint de falha, retoma o mesmo passo e isola checkpoints por tenant', async () => {
    const store = new InMemoryWorkflowCheckpointStore();
    const workflow = new CaseDocumentAnalysisWorkflow(new FailingOnceSource(), store);
    const executionId = '66666666-6666-4666-8666-666666666666';
    const input: CaseDocumentAnalysisInput = {
      executionId,
      tenantId: 'tenant_workflow',
      userId: 'user_workflow',
      matterId,
      knownIssues: ['validade do contrato'],
    };

    const failed = await collect(workflow.execute(input));
    expect(failed.some((event) => event.type === 'workflow:failed' && event.stepId === 'ingest')).toBe(true);
    expect(await store.getLatest(executionId, 'tenant_outro')).toBeUndefined();

    const resumed = await collect(workflow.execute({ ...input, resumeExecutionId: executionId }));
    const completed = resumed.find((event) => event.type === 'workflow:completed');
    expect(completed?.type).toBe('workflow:completed');
    if (completed?.type === 'workflow:completed') {
      const result = completed.result as CaseDocumentAnalysisReport;
      expect(result.researchGaps).toEqual([]);
      expect(result.documents[0].anchorCount).toBe(2);
    }
    expect(store.list(executionId).map((checkpoint) => checkpoint.status)).toContain('FAILED');
    expect(store.list(executionId).map((checkpoint) => checkpoint.status)).toContain('COMPLETED');
  });

  it('executa o pleading-draft como minuta interna e mantém aprovação humana pendente', async () => {
    const workflow = new PleadingDraftWorkflow();
    const events = await collect(workflow.execute({
      tenantId: 'tenant_workflow',
      userId: 'user_workflow',
      matterId,
      title: 'Minuta de responsabilidade contratual',
      issues: ['validade do contrato'],
      facts: snapshot.facts,
      evidence: snapshot.evidence,
      coverage: snapshot.coverage,
      authorities: [{
        id: '77777777-7777-4777-8777-777777777777',
        type: 'CASE_LAW',
        citation: 'STJ - REsp 1.000.000/DF',
        title: 'Acórdão de referência',
        summary: 'Síntese documental para conferência humana.',
        provenance: {
          id: '88888888-8888-4888-8888-888888888888',
          source: {
            provider: 'provider_test',
            documentId: 'doc_test',
            sourceUrl: 'https://example.com/doc_test',
          },
          verified: true,
          verificationMethod: 'MANUAL_VALIDATION',
          verifiedAt: '2026-09-16T12:00:00.000Z',
          snippet: 'Trecho mantido para conferência.',
          confidence: 1,
        },
        relevanceScore: 0.5,
        isBinding: false,
      }],
    }));
    const completed = events.find((event) => event.type === 'workflow:completed');
    expect(completed?.type).toBe('workflow:completed');
    if (completed?.type === 'workflow:completed') {
      const result = completed.result as PleadingDraftResult;
      expect(result.status).toBe('DRAFT_ONLY');
      expect(result.approvalStatus).toBe('PENDING_HUMAN_REVIEW');
      expect(result.title).toBe('Minuta de responsabilidade contratual');
      expect(result.outline).toHaveLength(4);
    }
    expect(events.filter((event) => event.type === 'workflow:checkpointed')).toHaveLength(10);
  });

  it('analisa a persistência real sem transportar texto integral para o relatório', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    const client: Client = connection.client;
    try {
      await runPersistenceMigrations(client);
      const matterRepository = new MatterRepository(connection.db);
      const matter = await matterRepository.createMatter({
        tenantId: 'tenant_persistence_workflow',
        createdBy: 'user_workflow',
        title: 'Matter de análise documental',
      });
      const document = await matterRepository.ingestTextDocument({
        tenantId: 'tenant_persistence_workflow',
        matterId: matter.id,
        createdBy: 'user_workflow',
        title: 'Relato',
        originalFilename: 'relato.txt',
        mimeType: 'text/plain',
        content: 'Texto sensível que não deve ser copiado para o relatório.',
      });
      await new FactsEvidenceService(new FactsEvidenceRepository(connection.db)).createFact(
        { tenantId: 'tenant_persistence_workflow', userId: 'user_workflow', matterId: matter.id },
        { statement: 'O relato foi recebido pelo escritório.' },
      );
      const workflow = new CaseDocumentAnalysisWorkflow(
        new PersistenceCaseDocumentAnalysisSource(
          matterRepository,
          new FactsEvidenceService(new FactsEvidenceRepository(connection.db)),
        ),
      );
      const events = await collect(workflow.execute({
        tenantId: 'tenant_persistence_workflow',
        userId: 'user_workflow',
        matterId: matter.id,
        knownIssues: ['recebimento do relato'],
      }));
      const completed = events.find((event) => event.type === 'workflow:completed');
      expect(completed?.type).toBe('workflow:completed');
      if (completed?.type === 'workflow:completed') {
        const result = completed.result as CaseDocumentAnalysisReport;
        expect(result.documents[0]).toMatchObject({ id: document.document.id, anchorCount: 1 });
        expect(JSON.stringify(result)).not.toContain('Texto sensível');
        expect(result.researchGaps).toHaveLength(1);
      }
    } finally {
      client.close();
    }
  });
});
