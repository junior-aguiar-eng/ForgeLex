import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, ForgeLexDatabase } from './db.js';
import { SessionRepository } from './repositories/session-repository.js';
import { Client } from '@libsql/client';

describe('Persistence Layer (Drizzle ORM + LibSQL / SQLite)', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: SessionRepository;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
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
});
