import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, ForgeLexDatabase } from './db.js';
import { runPersistenceMigrations } from './migrations/migration-runner.js';
import { SessionRepository } from './repositories/session-repository.js';
import { Client } from '@libsql/client';
import { MatterRepository } from './repositories/matter-repository.js';
import { FactsEvidenceRepository } from './repositories/facts-evidence-repository.js';
import { MatterAuthorityRepository } from './repositories/matter-authority-repository.js';

describe('Persistence Layer (Drizzle ORM + LibSQL / SQLite)', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: SessionRepository;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    repository = new SessionRepository(db);
  });

  afterEach(() => {
    client.close();
  });

  it('deve criar e recuperar uma sessão com metadados corretos', async () => {
    const session = await repository.createSession({
      tenantId: 'escritorio_albuquerque',
      userId: 'adv_roberto',
      matterId: 'caso_trabalhista_89',
      model: 'claude-3-5-sonnet',
    });

    expect(session.id).toBeDefined();
    expect(session.tenantId).toBe('escritorio_albuquerque');
    expect(session.status).toBe('STARTING');

    await repository.updateSessionStatus(session.id, 'RUNNING');
    const updated = await repository.getSession(session.id);
    expect(updated?.status).toBe('RUNNING');
  });

  it('deve armazenar e recuperar mensagens da sessão em ordem', async () => {
    const session = await repository.createSession({
      tenantId: 'tenant_1',
      userId: 'user_1',
      model: 'gpt-4o',
    });

    await repository.addMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Elabore a inicial',
    });

    await repository.addMessage({
      sessionId: session.id,
      role: 'assistant',
      content: 'Iniciando pesquisa probatória...',
      metadata: { step: 1 },
    });

    const messages = await repository.getMessages(session.id);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('deve gerenciar solicitações de aprovação (Human-in-the-Loop) por token criptográfico', async () => {
    const session = await repository.createSession({
      tenantId: 'tenant_1',
      userId: 'user_1',
      model: 'claude-3-5-sonnet',
    });

    const approvalToken = 'sec_token_987654321';
    await repository.createApprovalRequest({
      sessionId: session.id,
      toolName: 'drafting.save_final_draft',
      callId: 'call_123',
      approvalToken,
      proposedAction: 'Salvar peça no drive do tribunal',
      parametersSummary: '{"doc":"recurso.docx"}',
    });

    const retrieved = await repository.getApprovalByToken(approvalToken);
    expect(retrieved).toBeDefined();
    expect(retrieved?.status).toBe('PENDING');
    expect(retrieved?.proposedAction).toContain('Salvar peça');

    // Advogado aprova a ação
    await repository.resolveApproval(approvalToken, 'APPROVED', 'adv_roberto');

    const updated = await repository.getApprovalByToken(approvalToken);
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.decidedBy).toBe('adv_roberto');
  });

  it('deve persistir checkpoints de estado e recuperar a versão mais recente', async () => {
    const session = await repository.createSession({
      tenantId: 'tenant_1',
      userId: 'user_1',
      model: 'claude-3-5-sonnet',
    });

    await repository.saveCheckpoint(session.id, 1, { turn: 1, factsGathered: 2 });
    await repository.saveCheckpoint(session.id, 2, { turn: 2, factsGathered: 5, draftingStarted: true });

    const latest = await repository.getLatestCheckpoint(session.id);
    expect(latest).toBeDefined();
    expect(latest?.turnNumber).toBe(2);

    const snapshot = JSON.parse(latest!.stateSnapshot);
    expect(snapshot.draftingStarted).toBe(true);
  });

  it('deve criar matter e impedir leitura por outro tenant', async () => {
    const matterRepository = new MatterRepository(db);
    const matter = await matterRepository.createMatter({
      tenantId: 'tenant_a',
      createdBy: 'user_a',
      title: 'Ação de responsabilidade civil',
      practiceArea: 'Cível',
      jurisdiction: 'TJSP',
    });

    expect(await matterRepository.getMatter('tenant_a', matter.id)).toMatchObject({
      id: matter.id,
      tenantId: 'tenant_a',
      title: 'Ação de responsabilidade civil',
    });
    expect(await matterRepository.getMatter('tenant_b', matter.id)).toBeUndefined();
    expect(await matterRepository.listMatters('tenant_b')).toEqual([]);
  });

  it('deve ingerir documento textual em versão imutável com âncoras e hash', async () => {
    const matterRepository = new MatterRepository(db);
    const matter = await matterRepository.createMatter({
      tenantId: 'tenant_a',
      createdBy: 'user_a',
      title: 'Matter documental',
    });
    const content = 'Primeiro fato documentado.\n\nSegundo fato documentado.';

    const ingested = await matterRepository.ingestTextDocument({
      tenantId: 'tenant_a',
      matterId: matter.id,
      createdBy: 'user_a',
      title: 'Declaração inicial',
      originalFilename: 'declaracao.txt',
      mimeType: 'text/plain',
      content,
    });

    expect(ingested.document.status).toBe('INDEXED');
    expect(ingested.version.versionNumber).toBe(1);
    expect(ingested.version.contentHash).toHaveLength(64);
    expect(ingested.anchors).toHaveLength(2);
    expect(ingested.anchors[0]).toMatchObject({ anchorKey: 'p1', startOffset: 0 });
    expect(ingested.anchors[1].text).toBe('Segundo fato documentado.');

    const recovered = await matterRepository.getDocumentVersion('tenant_a', ingested.document.id);
    expect(recovered?.version.content).toBe(content);
    expect(await matterRepository.getDocumentVersion('tenant_b', ingested.document.id)).toBeUndefined();
  });

  it('deve rejeitar ingestão em matter inexistente', async () => {
    const matterRepository = new MatterRepository(db);
    await expect(
      matterRepository.ingestTextDocument({
        tenantId: 'tenant_a',
        matterId: '44444444-4444-4444-8444-444444444444',
        createdBy: 'user_a',
        title: 'Documento',
        originalFilename: 'documento.txt',
        mimeType: 'text/plain',
        content: 'Conteúdo suficiente para o documento.',
      })
    ).rejects.toThrow('MATTER_NOT_FOUND');
  });

  it('deve persistir fatos, provas, cobertura e linha do tempo com isolamento por tenant', async () => {
    const matterRepository = new MatterRepository(db);
    const factsEvidenceRepository = new FactsEvidenceRepository(db);
    const matterA = await matterRepository.createMatter({
      tenantId: 'tenant_a',
      createdBy: 'user_a',
      title: 'Matter de fatos e provas',
    });
    const documentA = await matterRepository.ingestTextDocument({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      title: 'Relato documental',
      originalFilename: 'relato.txt',
      mimeType: 'text/plain',
      content: 'A contratação ocorreu em janeiro.\n\nO pagamento foi interrompido em março.',
    });
    const matterB = await matterRepository.createMatter({
      tenantId: 'tenant_b',
      createdBy: 'user_b',
      title: 'Matter de outro tenant',
    });
    const documentB = await matterRepository.ingestTextDocument({
      tenantId: 'tenant_b',
      matterId: matterB.id,
      createdBy: 'user_b',
      title: 'Documento isolado',
      originalFilename: 'isolado.txt',
      mimeType: 'text/plain',
      content: 'Conteúdo exclusivo do tenant B.',
    });

    const supportedFact = await factsEvidenceRepository.createFact({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      statement: 'A contratação ocorreu em janeiro.',
      category: 'TEMPORAL',
    });
    await factsEvidenceRepository.linkFactToAnchor({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      factId: supportedFact.id,
      documentAnchorId: documentA.anchors[0].id,
      relation: 'SUPPORTS',
    });
    const evidence = await factsEvidenceRepository.createEvidenceItem({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      title: 'Comprovante de contratação',
      evidenceType: 'DOCUMENT',
    });
    await factsEvidenceRepository.linkEvidenceToFact({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      factId: supportedFact.id,
      evidenceItemId: evidence.id,
      relation: 'SUPPORTS',
    });
    await factsEvidenceRepository.linkEvidenceToAnchor({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      evidenceItemId: evidence.id,
      documentAnchorId: documentA.anchors[0].id,
      relation: 'PROVES',
    });

    const partialFact = await factsEvidenceRepository.createFact({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      statement: 'O pagamento foi interrompido em março.',
    });
    await factsEvidenceRepository.linkFactToAnchor({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      factId: partialFact.id,
      documentAnchorId: documentA.anchors[1].id,
      relation: 'CONTEXT',
    });

    const conflictingFact = await factsEvidenceRepository.createFact({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      statement: 'A contratação foi rescindida antes do pagamento.',
    });
    await factsEvidenceRepository.linkFactToAnchor({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      factId: conflictingFact.id,
      documentAnchorId: documentA.anchors[0].id,
      relation: 'SUPPORTS',
    });
    await factsEvidenceRepository.linkFactToAnchor({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      factId: conflictingFact.id,
      documentAnchorId: documentA.anchors[1].id,
      relation: 'CONTRADICTS',
    });

    const unsupportedFact = await factsEvidenceRepository.createFact({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      statement: 'Não há outro fato documental registrado.',
    });
    const coverage = await factsEvidenceRepository.getEvidenceCoverage('tenant_a', matterA.id);
    expect(coverage.find((item) => item.factId === supportedFact.id)).toMatchObject({
      coverage: 'SUPPORTED',
      supportingEvidenceCount: 1,
      supportingAnchorCount: 1,
    });
    expect(coverage.find((item) => item.factId === partialFact.id)?.coverage).toBe('PARTIAL');
    expect(coverage.find((item) => item.factId === conflictingFact.id)?.coverage).toBe('CONFLICTING');
    expect(coverage.find((item) => item.factId === unsupportedFact.id)?.coverage).toBe('UNSUPPORTED');

    await expect(
      factsEvidenceRepository.linkFactToAnchor({
        tenantId: 'tenant_a',
        matterId: matterA.id,
        factId: supportedFact.id,
        documentAnchorId: documentB.anchors[0].id,
        relation: 'SUPPORTS',
      }),
    ).rejects.toThrow('ANCHOR_NOT_FOUND');
    expect(await factsEvidenceRepository.listFacts('tenant_b', matterA.id)).toEqual([]);

    const event = await factsEvidenceRepository.createTimelineEvent({
      tenantId: 'tenant_a',
      matterId: matterA.id,
      createdBy: 'user_a',
      title: 'Contratação',
      eventDate: '2026-01-15',
      sourceAnchorId: documentA.anchors[0].id,
    });
    expect((await factsEvidenceRepository.listTimelineEvents('tenant_a', matterA.id))[0]).toMatchObject({
      id: event.id,
      eventDate: '2026-01-15',
      sourceAnchorId: documentA.anchors[0].id,
    });
  });

  it('deve salvar authority com proveniência no matter e tornar o salvamento idempotente', async () => {
    const matterRepository = new MatterRepository(db);
    const authorityRepository = new MatterAuthorityRepository(db);
    const matter = await matterRepository.createMatter({
      tenantId: 'tenant_a',
      createdBy: 'user_a',
      title: 'Matter de pesquisa jurídica',
    });
    const authority = {
      id: '11111111-1111-4111-8111-111111111111',
      court: 'STJ',
      processNumber: 'REsp 1.823.450/SP',
      rapporteur: 'Min. Nancy Andrighi',
      judgmentDate: '2023-04-18',
      publicationDate: '2023-04-24',
      syllabus: 'CIVIL E PROCESSUAL CIVIL. RECURSO ESPECIAL. VAZAMENTO DE DADOS PESSOAIS. LGPD.',
      dedupeKey: 'stj_resp1823450sp_20230418',
      provenance: {
        id: '22222222-2222-4222-8222-222222222222',
        source: {
          provider: 'provider_stj_scon',
          court: 'STJ',
          documentId: 'REsp 1.823.450/SP',
          dedupeKey: 'stj_resp1823450sp_20230418',
          contentHash: 'a'.repeat(64),
          capturedAt: '2026-09-16T00:00:00.000Z',
        },
        verified: true,
        verificationMethod: 'OFFICIAL_SOURCE_HASH' as const,
        verifiedAt: '2026-09-16T00:00:00.000Z',
        snippet: 'CIVIL E PROCESSUAL CIVIL. RECURSO ESPECIAL. VAZAMENTO DE DADOS PESSOAIS. LGPD.',
        confidence: 0.98,
      },
    };

    const first = await authorityRepository.saveAuthority({
      tenantId: 'tenant_a',
      matterId: matter.id,
      savedBy: 'user_a',
      authority,
    });
    const replay = await authorityRepository.saveAuthority({
      tenantId: 'tenant_a',
      matterId: matter.id,
      savedBy: 'user_a',
      authority,
    });

    expect(first.created).toBe(true);
    expect(first.record.authority.provenance.source.provider).toBe('provider_stj_scon');
    expect(replay).toMatchObject({ created: false, record: { id: first.record.id } });
    expect(await authorityRepository.listAuthorities('tenant_a', matter.id)).toHaveLength(1);
    expect(await authorityRepository.listAuthorities('tenant_b', matter.id)).toEqual([]);
    await expect(
      authorityRepository.saveAuthority({
        tenantId: 'tenant_b',
        matterId: matter.id,
        savedBy: 'user_b',
        authority,
      }),
    ).rejects.toThrow('MATTER_NOT_FOUND');
  });
});
