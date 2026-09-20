import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, runPersistenceMigrations, matters, drafts, draftVersions, draftApprovalRequests, researchMemos } from '@forgelex/persistence';
import { ReviewQueueService } from './review-queue-service.js';

describe('ReviewQueueService', () => {
  it('combina drafts e memorandos sem expor token, prompt ou conteúdo integral', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const now = new Date().toISOString();
    const matterId = randomUUID();
    const draftId = randomUUID();
    const versionId = randomUUID();
    const requestId = randomUUID();
    const memoId = randomUUID();
    await connection.db.insert(matters).values({ id: matterId, tenantId: 'tenant-a', clientId: null, title: 'Caso A', description: null, practiceArea: null, jurisdiction: null, status: 'ACTIVE', createdBy: 'u', createdAt: now, updatedAt: now });
    await connection.db.insert(drafts).values({ id: draftId, tenantId: 'tenant-a', matterId, title: 'Contestação', status: 'APPROVAL_PENDING', currentVersionId: versionId, createdBy: 'u', createdAt: now, updatedAt: now });
    await connection.db.insert(draftVersions).values({ id: versionId, tenantId: 'tenant-a', matterId, draftId, versionNumber: 1, source: 'HUMAN', contentHash: 'a'.repeat(64), status: 'APPROVAL_PENDING', createdBy: 'u', notes: 'conteúdo sigiloso', createdAt: now });
    await connection.db.insert(draftApprovalRequests).values({ id: requestId, tenantId: 'tenant-a', matterId, draftId, draftVersionId: versionId, requestedBy: 'u', proposedAction: 'Aprovar envio', status: 'PENDING', requestedAt: now, decidedAt: null, decidedBy: null, decisionReason: null });
    await connection.db.insert(researchMemos).values({
      id: memoId, tenantId: 'tenant-a', matterId, query: 'prescrição', issueIds: '[]', workflowId: 'legal-research-memo', workflowVersion: '1',
      memoJson: JSON.stringify({ id: memoId, title: 'Memo prescricional', query: 'prescrição', executiveSummary: 'Resumo executivo suficientemente longo para validação.', keyTheses: [], applicableAuthorities: [], riskAnalysis: 'risco', recommendedAction: 'revisar', generatedAt: now, verifiedByHuman: false }),
      status: 'PENDING_HUMAN_REVIEW', idempotencyKey: 'memo-key', createdBy: 'u', createdAt: now, updatedAt: now, reviewedBy: null, reviewedAt: null, reviewReason: null,
    });

    const service = new ReviewQueueService(connection.db);
    const queue = await service.list('tenant-a');

    expect(queue.map((item) => item.kind).sort()).toEqual(['DRAFT', 'RESEARCH_MEMO']);
    expect(JSON.stringify(queue)).not.toContain('token');
    expect(JSON.stringify(queue)).not.toContain('conteúdo sigiloso');
    expect(await service.list('tenant-b')).toEqual([]);
    connection.client.close();
  });
});
