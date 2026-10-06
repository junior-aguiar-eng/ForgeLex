import type { ToolRegistry, ToolExecutionContext } from '@forgelex/agent-core';
import type { AuditRecorder } from '@forgelex/audit';
import type { DraftAiReceipt } from '@forgelex/domain';
import type { JsonRpcRequest, JsonRpcResponse } from './mcp-handler.js';
import { randomUUID } from 'node:crypto';
export async function handleDraftAiCall(
  request: JsonRpcRequest,
  registry: ToolRegistry,
  context: Omit<ToolExecutionContext, 'sessionId' | 'source'>,
  audit?: AuditRecorder,
): Promise<JsonRpcResponse> {
  const execution = { ...context, sessionId: `draft_ai_${randomUUID()}`, source: 'MCP' as const };
  const args = request.params?.arguments ?? {};
  const started = Date.now();
  const fail = (code: string, message: string, retryable = false): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id: request.id,
    result: {
      content: [{ type: 'text', text: JSON.stringify({ error: { code, message, retryable } }) }],
      isError: true,
      billing: { mode: 'FREE', chargedCents: 0, isReplay: false },
    },
  });
  try {
    if (
      (typeof request.id !== 'string' && typeof request.id !== 'number') ||
      (typeof request.id === 'string' && request.id.length > 256) ||
      (typeof request.id === 'number' && !Number.isFinite(request.id))
    )
      return fail('INVALID_INPUT', 'Identificador de envio inválido.');
    if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 512 * 1024)
      return fail('DRAFT_INPUT_TOO_LARGE', 'O texto excede o limite de recebimento. Divida o texto antes de enviar.');
    if (!context.oauthConnection || !context.revalidateConnection) throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
    const tool = registry.get('draft.save_from_ai')!;
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) return fail('INVALID_INPUT', 'Confira o texto, as seções e as referências antes de enviar.');
    const result = await registry.executeTool('draft.save_from_ai', parsed.data, execution);
    if (!result.success || !result.data) throw new Error('DRAFT_RECEIVING_UNAVAILABLE');
    const receipt = result.data as DraftAiReceipt;
    await audit
      ?.recordEvent({
        sessionId: execution.sessionId,
        tenantId: context.tenantId,
        userId: context.userId,
        toolName: 'draft.save_from_ai',
        durationMs: Date.now() - started,
        status: 'SUCCESS',
        payload: {
          matterId: parsed.data.matterId,
          receiptId: receipt.id,
          versionId: receipt.versionId,
          grantRevision: parsed.data.expectedGrantRevision,
          isReplay: receipt.isReplay,
        },
      })
      .catch(() => undefined);
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(receipt) }],
        structuredContent: receipt,
        isError: false,
        billing: { mode: 'FREE', chargedCents: 0, isReplay: receipt.isReplay },
      },
    };
    if (Buffer.byteLength(JSON.stringify(response), 'utf8') > 24576) throw new Error('DRAFT_RECEIVING_UNAVAILABLE');
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : '';
    const messages: Record<string, string> = {
      CASE_CONTEXT_NOT_AUTHORIZED:
        'Este caso não está autorizado para o aplicativo. Confira as permissões no ForgeLex.',
      DRAFT_PERMISSION_STALE: 'As permissões mudaram. Consulte o caso novamente antes de enviar.',
      DRAFT_RECEIVING_NOT_AUTHORIZED: 'Habilite o envio de textos ao editor nas permissões deste caso.',
      DRAFT_REFERENCE_INVALID: 'Uma referência não está disponível na seleção autorizada. Confira as fontes do texto.',
      DRAFT_DESTINATION_INVALID: 'Escolha novamente o rascunho de destino no ForgeLex.',
      DRAFT_RECEIPT_CONFLICT:
        'Esta chave já foi usada em outro envio. Reutilize o conteúdo original ou uma nova chave para outro texto.',
    };
    const publicCode = messages[code] ? code : 'DRAFT_RECEIVING_UNAVAILABLE';
    await audit
      ?.recordEvent({
        sessionId: execution.sessionId,
        tenantId: context.tenantId,
        userId: context.userId,
        toolName: 'draft.save_from_ai',
        durationMs: Date.now() - started,
        status: 'FAILED',
        payload: { errorCode: publicCode },
      })
      .catch(() => undefined);
    return fail(
      publicCode,
      messages[code] ?? 'Não foi possível concluir o envio. Repita com a mesma chave para recuperar o recibo.',
      !messages[code],
    );
  }
}
