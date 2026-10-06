import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ToolRegistry } from '@forgelex/agent-core';
import { DraftSaveFromAiInputSchema } from '@forgelex/domain';
import type { AuditRecorder } from '@forgelex/audit';
import { handleDraftAiCall } from './draft-ai-handler.js';

const input = {
  matterId: randomUUID(),
  expectedGrantRevision: 1,
  idempotencyKey: randomUUID(),
  title: 'Texto privado',
  sections: [{ ordinal: 0, title: 'Fatos', content: 'Conteúdo privado de teste' }],
  references: [],
};
const context = {
  tenantId: 'tenant',
  userId: 'user',
  oauthConnection: { clientId: 'client', grantedAt: '2026-10-06T10:00:00.000Z' },
  revalidateConnection: async () => {},
};
function fixture() {
  const saved = {
    id: randomUUID(),
    draftId: randomUUID(),
    versionId: randomUUID(),
    versionNumber: 1,
    receivedAt: new Date().toISOString(),
    reviewPending: true as const,
    isReplay: false,
    openPath: '/app/rascunhos',
    application: { clientId: 'client' },
  };
  let inserted = false;
  const executeTool = vi.fn(async () => {
    const isReplay = inserted;
    inserted = true;
    return { success: true, data: { ...saved, isReplay } };
  });
  const registry = { get: () => ({ inputSchema: DraftSaveFromAiInputSchema }), executeTool } as unknown as ToolRegistry;
  return { saved, executeTool, registry };
}
const request = (arguments_: unknown = input) => ({
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'tools/call',
  params: { name: 'draft.save_from_ai', arguments: arguments_ },
});
it('falha de auditoria e resposta perdida permitem recuperar o mesmo recibo sem texto na auditoria', async () => {
  const f = fixture();
  const recordEvent = vi.fn().mockRejectedValue(new Error('audit unavailable'));
  const audit = { recordEvent } as unknown as AuditRecorder;
  const lost = await handleDraftAiCall(request(), f.registry, context, audit);
  expect(lost.result.isError).toBe(false);
  const retry = await handleDraftAiCall(request(), f.registry, context, audit);
  expect(retry.result.structuredContent.id).toBe(lost.result.structuredContent.id);
  expect(retry.result.billing).toEqual({ mode: 'FREE', chargedCents: 0, isReplay: true });
  expect(JSON.stringify(recordEvent.mock.calls)).not.toContain(input.sections[0].content);
  expect(JSON.stringify(recordEvent.mock.calls)).not.toContain(input.idempotencyKey);
  expect(Buffer.byteLength(JSON.stringify(retry))).toBeLessThanOrEqual(24576);
});
it('recusa tamanho UTF-8 excessivo e campo estranho antes de executar', async () => {
  const f = fixture();
  const tooLarge = await handleDraftAiCall(
    request({ ...input, sections: [{ ordinal: 0, title: 'Fatos', content: 'á'.repeat(270000) }] }),
    f.registry,
    context,
  );
  expect(tooLarge.result.isError).toBe(true);
  expect(tooLarge.result.content[0].text).toContain('DRAFT_INPUT_TOO_LARGE');
  const invalid = await handleDraftAiCall(request({ ...input, unexpected: 'privado' }), f.registry, context);
  expect(invalid.result.isError).toBe(true);
  expect(f.executeTool).not.toHaveBeenCalled();
});
