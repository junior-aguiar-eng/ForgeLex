import { randomUUID } from 'node:crypto';
import { createDatabase, type DatabaseConfig } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { MatterRepository } from '../repositories/matter-repository.js';
import { AgenticWorkspaceRepository } from '../repositories/agentic-workspace-repository.js';
import { NativeCaseTaskRepository } from '../repositories/native-case-task-repository.js';
import { NativeEvidenceReviewRepository } from '../repositories/native-evidence-review-repository.js';
import type { AgenticTaskDelivery } from '@forgelex/domain';

export async function createEvidenceFixture(config: DatabaseConfig = {}) {
  const c = await createDatabase({ url: 'file::memory:', ...config });
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: `evidence-${randomUUID()}`, userId: 'reviewer' };
  const matters = new MatterRepository(c.db);
  const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso sintético' });
  const doc = await matters.ingestTextDocument({
    ...owner,
    createdBy: owner.userId,
    matterId: matter.id,
    title: 'Relato',
    originalFilename: 'relato.txt',
    mimeType: 'text/plain',
    content: 'Pagamento alegado em 2026-01-01.\n\nRecebimento contestado.',
  });
  const workspace = new AgenticWorkspaceRepository(c.db);
  const conversation = await workspace.createConversation(owner, {
    matterId: matter.id,
    objective: 'Analisar provas',
    context: {
      origin: 'MIXED',
      text: 'Relato da parte.',
      documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
    },
  });
  const execution = await workspace.createExecution(owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: randomUUID(),
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await workspace.compareAndSetStatus(owner, execution.id, 'QUEUED', 'RUNNING');
  let allowed = true;
  const authorize = async () => {
    if (!allowed) throw new Error('ACCESS_REVOKED');
  };
  const native = new NativeCaseTaskRepository(c.db, authorize);
  const binding = {
    ...owner,
    conversationId: conversation.id,
    executionId: execution.id,
    contextRevision: 1,
    matterId: matter.id,
    objective: 'Analisar provas',
    actionId: 'analyze_evidence' as const,
  };
  const packet = await native.load(binding);
  const source = packet.sources.find((s) => s.kind === 'DOCUMENT')!;
  const ref = {
    sourceId: source.id,
    sourceContentHash: source.contentHash,
    quote: source.text,
    start: 0,
    quoteStatus: 'MATCHED' as const,
    relation: 'CONTRADICTS' as const,
  };
  const delivery: AgenticTaskDelivery = {
    action: 'analyze_evidence',
    contextId: conversation.id,
    contextRevision: 1,
    status: 'CANDIDATE',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    sources: packet.sources.map(({ text: _, ...s }) => s),
    requirements: [],
    findings: [],
    claims: [
      { id: 'claim', statement: 'A parte alega pagamento.', classification: 'CONFLICT', sourceIds: [source.id] },
    ],
    issues: [{ id: 'issue', statement: 'O pagamento ocorreu?', sourceIds: [source.id] }],
    evidenceMatrix: {
      assessment: 'MODEL_PROPOSAL_NOT_FACT_CONFIRMATION',
      rows: [
        {
          id: 'row',
          claimId: 'claim',
          issueIds: ['issue'],
          references: [ref],
          gaps: ['Falta recibo.'],
          coverage: 'CONFLICTING',
        },
      ],
      chronology: [
        {
          id: 'event',
          claimIds: ['claim'],
          description: 'Pagamento alegado',
          dateText: '2026-01-01',
          sortDate: '2026-01-01',
          dateStatus: 'LITERAL_ISO',
          reference: ref,
        },
      ],
      contradictions: [],
    },
  };
  const saved = await native.save(binding, delivery);
  await workspace.compareAndSetStatus(owner, execution.id, 'RUNNING', 'COMPLETED');
  const reviews = new NativeEvidenceReviewRepository(c.db, authorize);
  return {
    ...c,
    owner,
    matter,
    doc,
    workspace,
    conversation,
    execution,
    delivery,
    saved,
    reviews,
    revoke: () => {
      allowed = false;
    },
  };
}
