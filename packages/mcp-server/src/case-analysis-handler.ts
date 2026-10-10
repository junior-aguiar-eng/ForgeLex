import type { ToolRegistry, ToolExecutionContext } from '@forgelex/agent-core';
import type { AuditRecorder } from '@forgelex/audit';
import type { AnalysisReceipt } from '@forgelex/domain';
import type { JsonRpcRequest, JsonRpcResponse } from './mcp-handler.js';
import { randomUUID } from 'node:crypto';

export async function handleCaseAnalysisCall(
  request: JsonRpcRequest,
  registry: ToolRegistry,
  context: Omit<ToolExecutionContext, 'sessionId' | 'source'>,
  audit?: AuditRecorder,
): Promise<JsonRpcResponse> {
  const execution = { ...context, sessionId: `analysis_${randomUUID()}`, source: 'MCP' as const };
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
  const messages: Record<string, string> = {
    CASE_CONTEXT_NOT_AUTHORIZED: 'O caso não está autorizado para esta conexão.',
    ANALYSIS_PERMISSION_STALE: 'A permissão mudou. Consulte novamente o contexto do caso.',
    ANALYSIS_RECEIVING_NOT_AUTHORIZED: 'Permita receber análises nas opções do caso.',
    ANALYSIS_OBJECTIVE_STALE: 'Use o objetivo definido pelo usuário no contexto do caso.',
    ANALYSIS_REFERENCE_INVALID: 'Uma versão, âncora ou citação não pertence aos documentos selecionados.',
    ANALYSIS_RECEIPT_CONFLICT: 'A chave já foi usada com outro conteúdo. Reenvie o original ou use nova chave.',
    MATTER_NOT_ACTIVE: 'Este caso não está ativo.',
    INVALID_INPUT: 'Confira a estrutura, fontes e datas da análise.',
    ANALYSIS_INPUT_TOO_LARGE: 'Divida a análise em envios menores de até 512 KiB.',
  };
  try {
    if (
      (typeof request.id !== 'string' && typeof request.id !== 'number') ||
      (typeof request.id === 'string' && request.id.length > 256) ||
      (typeof request.id === 'number' && !Number.isFinite(request.id))
    )
      throw new Error('INVALID_INPUT');
    const args = request.params?.arguments ?? {};
    if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 524288) throw new Error('ANALYSIS_INPUT_TOO_LARGE');
    const tool = registry.get('case.save_analysis');
    const parsed = tool?.inputSchema.safeParse(args);
    if (!parsed?.success) throw new Error('INVALID_INPUT');
    const result = await registry.executeTool('case.save_analysis', parsed.data, execution);
    if (!result.success || !result.data) throw new Error('ANALYSIS_UNAVAILABLE');
    const receipt = result.data as AnalysisReceipt;
    await audit
      ?.recordEvent({
        sessionId: execution.sessionId,
        tenantId: context.tenantId,
        userId: context.userId,
        toolName: 'case.save_analysis',
        durationMs: Date.now() - started,
        status: 'SUCCESS',
        payload: {
          matterId: parsed.data.matterId,
          receiptId: receipt.id,
          grantRevision: parsed.data.expectedGrantRevision,
          isReplay: receipt.isReplay,
        },
      })
      .catch(() => undefined);
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(receipt) }],
        structuredContent: receipt,
        isError: false,
        billing: { mode: 'FREE', chargedCents: 0, isReplay: receipt.isReplay },
      },
    };
  } catch (error) {
    const candidate = error instanceof Error ? error.message.split(':')[0] : '';
    const code = messages[candidate] ? candidate : 'ANALYSIS_UNAVAILABLE';
    await audit
      ?.recordEvent({
        sessionId: execution.sessionId,
        tenantId: context.tenantId,
        userId: context.userId,
        toolName: 'case.save_analysis',
        durationMs: Date.now() - started,
        status: 'FAILED',
        payload: { errorCode: code },
      })
      .catch(() => undefined);
    return fail(
      code,
      messages[code] ?? 'Não foi possível receber a análise. Repita com a mesma chave para recuperar o recibo.',
      code === 'ANALYSIS_UNAVAILABLE',
    );
  }
}
