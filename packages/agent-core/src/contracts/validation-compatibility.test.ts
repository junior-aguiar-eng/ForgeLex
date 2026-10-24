import { describe, expect, it } from 'vitest';
import { CaseAiGrantSchema, CaseAiSelectionSchema } from '@forgelex/domain';
import { AgentEventSchema } from './agent-events.js';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-24T12:00:00.000Z';
const selection = (factIds: string[]) => ({
  documents: [],
  factIds,
  evidenceIds: [],
  thesisIds: [],
  authorityIds: [],
});

describe('compatibilidade dos contratos de validação existentes', () => {
  it.each([
    firstId,
    'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF',
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
  ])('preserva o UUID aceito pelo contrato de seleção: %s', (id) => {
    expect(CaseAiSelectionSchema.parse(selection([id])).factIds).toEqual([id]);
  });

  it.each([
    '11111111111141118111111111111111',
    '11111111-1111-4111-8111-11111111111',
    'g1111111-1111-4111-8111-111111111111',
    ` ${firstId}`,
    `${firstId}\n`,
  ])('rejeita UUID malformado no contrato de seleção: %s', (id) => {
    expect(CaseAiSelectionSchema.safeParse(selection([id])).success).toBe(false);
  });

  it('preserva valores heterogêneos nos argumentos e detalhes dos eventos', () => {
    const values = {
      text: 'exemplo', number: 42, boolean: false, nil: null,
      nested: { items: ['a', 1, null] }, missing: undefined,
    };
    const invoked = {
      type: 'tool:invoked', sessionId: firstId, toolName: 'synthetic',
      callId: 'call-1', input: values, timestamp,
    };
    expect(AgentEventSchema.parse(invoked)).toEqual(invoked);
    const error = {
      type: 'error', sessionId: firstId, code: 'SYNTHETIC',
      message: 'exemplo', details: values, timestamp,
    };
    expect(AgentEventSchema.parse(error)).toEqual(error);
  });

  it.each([
    { type: 'tool:completed', toolName: 'synthetic', callId: 'call-1', durationMs: 0 },
    { type: 'lifecycle:completed', totalTurns: 1, totalDurationMs: 0 },
  ])('aceita output omitido em $type', (fields) => {
    const event = { ...fields, sessionId: firstId, timestamp };
    expect(AgentEventSchema.parse(event)).toEqual(event);
  });

  it('deduplica e ordena a seleção sem alterar as versões dos documentos', () => {
    const input = {
      ...selection([secondId, firstId, secondId]),
      documents: [
        { documentId: secondId, versionId: firstId },
        { documentId: firstId, versionId: secondId },
        { documentId: secondId, versionId: firstId },
      ],
    };
    expect(CaseAiSelectionSchema.parse(input)).toEqual({
      ...selection([firstId, secondId]),
      documents: [
        { documentId: firstId, versionId: secondId },
        { documentId: secondId, versionId: firstId },
      ],
    });
    expect(CaseAiSelectionSchema.safeParse({
      ...input,
      documents: [...input.documents, { documentId: firstId, versionId: firstId }],
    }).success).toBe(false);
  });

  it('mantém o recebimento desabilitado quando a permissão é omitida', () => {
    const grant = CaseAiGrantSchema.parse({
      id: firstId, tenantId: 'tenant-synthetic', userId: 'user-synthetic',
      oauthClientId: 'client-synthetic', oauthGrantedAt: timestamp,
      matterId: secondId, revision: 1, status: 'ACTIVE',
      selection: selection([firstId]), createdAt: timestamp, updatedAt: timestamp,
    });
    expect(grant.receivePermission).toEqual({ enabled: false });
  });
});
