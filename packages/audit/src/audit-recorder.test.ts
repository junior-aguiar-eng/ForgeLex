import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, ForgeLexDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { AuditRecorder } from './audit-recorder.js';
import { Client } from '@libsql/client';

describe('AuditRecorder (Conformidade e Sigilo Jurídico)', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let recorder: AuditRecorder;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    recorder = new AuditRecorder(db);
  });

  afterEach(() => {
    client.close();
  });

  it('deve redactar recursivamente segredos e chaves de API do payload', () => {
    const rawPayload = {
      user: 'Advogado',
      apiKey: 'sk-ant-api03-123456789',
      nested: {
        authorization: 'Bearer token_secreto',
        normalData: 'Processo 1029384',
      },
    };

    const sanitized = recorder.redactSensitiveFields(rawPayload) as any;
    expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
    expect(sanitized.nested.authorization).toBe('[REDACTED_SECRET]');
    expect(sanitized.nested.normalData).toBe('Processo 1029384');
  });

  it('deve gerar hash SHA-256 determinístico para integridade de auditoria', () => {
    const payload = { document: 'Petição Inicial', court: 'STJ' };
    const hash1 = recorder.computePayloadHash(payload);
    const hash2 = recorder.computePayloadHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 em hex tem 64 caracteres
  });

  it('não persiste metadata legado de custo de modelo em operação jurídica', async () => {
    const auditId = await recorder.recordEvent({
      sessionId: 'sess_auditoria_test',
      tenantId: 'tenant_escritorio',
      userId: 'user_1',
      toolName: 'research.search_case_law',
      durationMs: 250,
      status: 'SUCCESS',
      payload: { query: 'LGPD dano moral' },
      costMetadata: {
        tokensIn: 150,
        tokensOut: 400,
        estimatedCostUsd: 0.002,
      },
    } as any);

    expect(auditId).toBeDefined();

    const logs = await recorder.getLogsForSession('sess_auditoria_test');
    expect(logs.length).toBe(1);
    expect(logs[0].toolName).toBe('research.search_case_law');
    expect(logs[0].durationMs).toBe(250);
    expect(logs[0].status).toBe('SUCCESS');
    expect(logs[0].payloadHash).toBeDefined();

    expect(logs[0].costMetadata).toBeNull();
  });

  it('não transporta conversas, arquivos ou histórico no evento MCP', async () => {
    const auditId = await recorder.recordEvent({
      sessionId: 'sess_mcp_privacy_test',
      tenantId: 'tenant_escritorio',
      userId: 'user_1',
      toolName: 'research.search_case_law',
      durationMs: 100,
      status: 'SUCCESS',
      payload: { query: 'LGPD dano moral' },
    });

    expect(auditId).toBeDefined();
    const log = (await recorder.getLogsForSession('sess_mcp_privacy_test'))[0];
    expect(JSON.stringify(log)).not.toContain('conversation');
    expect(JSON.stringify(log)).not.toContain('files');
    expect(JSON.stringify(log)).not.toContain('history');
  });
});
