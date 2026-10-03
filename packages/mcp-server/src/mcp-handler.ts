import { ToolRegistry, type ToolExecutionResult } from '@forgelex/agent-core';
import { getLegalToolContract, LegalToolGatewayError, type SearchCaseLawOutput } from '@forgelex/legal-tools';
import { getForgeLexBillingPolicy, LedgerService, searchOperationFingerprint } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { randomUUID } from 'node:crypto';
import { getErrorCode } from '@forgelex/domain';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpHandlerOptions {
  exposedToolNames?: readonly string[];
  beforeToolCall?: (toolName: string) => void | Promise<void>;
}

export class McpHandler {
  private readonly toolRegistry: ToolRegistry;
  private readonly ledgerService: LedgerService;
  private readonly auditRecorder?: AuditRecorder;
  private readonly exposedToolNames?: ReadonlySet<string>;
  private readonly beforeToolCall?: (toolName: string) => void | Promise<void>;

  constructor(
    toolRegistry: ToolRegistry,
    ledgerService: LedgerService,
    auditRecorder?: AuditRecorder,
    options: McpHandlerOptions = {},
  ) {
    this.toolRegistry = toolRegistry;
    this.ledgerService = ledgerService;
    this.auditRecorder = auditRecorder;
    this.exposedToolNames = options.exposedToolNames ? new Set(options.exposedToolNames) : undefined;
    this.beforeToolCall = options.beforeToolCall;
  }

  public async handleRequest(
    request: JsonRpcRequest,
    context: { tenantId?: string; userId?: string; idempotencyKey?: string; abortSignal?: AbortSignal } = {}
  ): Promise<JsonRpcResponse> {
    const id = request.id;
    const tenantId = context.tenantId ?? 'tenant_default_mcp';
    const userId = context.userId ?? 'user_mcp_client';

    if (request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request: jsonrpc deve ser 2.0' },
      };
    }

    switch (request.method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'forgelex-mcp-server',
              version: '2.0.0',
              description: 'FORGELEX Remote MCP Server — Infraestrutura Jurídica Verificável',
            },
          },
        };
      }

      case 'tools/list': {
        const tools = this.toolRegistry
          .list()
          .filter((tool) => this.isExposed(tool.name))
          .map((tool) => {
            const rawSchema = zodToJsonSchema(tool.inputSchema, { target: 'jsonSchema7' }) as any;
            const { $schema, ...cleanSchema } = rawSchema;
            cleanSchema.properties = {
              ...(cleanSchema.properties ?? {}),
              idempotencyKey: {
                type: 'string', minLength: 1,
                description: 'Chave de idempotência da operação. Use quando o host MCP não permitir enviar o header Idempotency-Key.',
              },
            };

            const contract = getLegalToolContract(tool.name);
            return {
              name: tool.name,
              description: tool.description,
              inputSchema: cleanSchema,
              ...(contract ? { 'x-forgelex-contract': contract } : {}),
            };
          });

        return {
          jsonrpc: '2.0',
          id,
          result: { tools },
        };
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = request.params ?? {};
        if (!name) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Invalid params: nome da ferramenta é obrigatório.' },
          };
        }

        if (toolArgs && typeof toolArgs === 'object' && ['conversation', 'files', 'history'].some((field) => field in toolArgs)) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Invalid params: contexto privado do host não é aceito pelo ForgeLex.',
              data: { code: 'PRIVATE_CONTEXT_FORBIDDEN', retryable: false },
            },
          };
        }

        const tool = this.toolRegistry.get(name);
        if (!tool || !this.isExposed(name)) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ferramenta '${name}' não está disponível no pacote externo.` },
          };
        }

        let billing;
        try {
          billing = getForgeLexBillingPolicy(name);
        } catch {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: a capability '${name}' não possui política comercial declarada.` },
          };
        }

        const hostIdempotencyKey = typeof toolArgs?.idempotencyKey === 'string' ? toolArgs.idempotencyKey.trim() : '';
        const idempotencyKey = context.idempotencyKey?.trim() || hostIdempotencyKey;
        if (!idempotencyKey) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Invalid params: a chave de idempotência é obrigatória.' },
          };
        }
        let requestFingerprint: string | undefined;
        if (name === 'research.search_case_law') {
          const parsed = tool.inputSchema.safeParse(toolArgs ?? {});
          if (!parsed.success) {
            return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: filtros de pesquisa inválidos.', data: { code: 'INVALID_INPUT', retryable: false } } };
          }
          requestFingerprint = searchOperationFingerprint({ ...parsed.data, userId });
        }
        const sessionId = `mcp_${randomUUID()}`;
        const startedAt = Date.now();

        try {
          await this.beforeToolCall?.(name);
          const execution = await this.ledgerService.executeOperation({
            tenantId,
            userId,
            idempotencyKey,
            requestFingerprint,
            billing,
            usage: {
              capability: name,
              toolName: name,
              requestId: idempotencyKey,
              sessionId,
              userId,
            },
            operation: async () => {
              const { idempotencyKey: _idempotencyKey, ...withoutIdempotencyKey } = toolArgs ?? {};
              const executionArgs = name === 'workflow.legal_research_memo' ? toolArgs ?? {} : withoutIdempotencyKey;
              const result = await this.toolRegistry.executeTool(name, executionArgs, {
                sessionId,
                tenantId,
                userId,
                abortSignal: context.abortSignal ?? new AbortController().signal,
                source: 'MCP',
              });
              return name === 'research.search_case_law' ? result.data : result;
            },
          });

          const toolResult: ToolExecutionResult = name === 'research.search_case_law'
            ? { success: true, data: execution.data, provenance: (execution.data as SearchCaseLawOutput).items.map(item => item.provenance) }
            : execution.data as ToolExecutionResult;

          await this.recordAudit({
            sessionId,
            tenantId,
            userId,
            toolName: name,
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: { arguments: toolArgs, success: toolResult.success, billingMode: execution.billingMode },
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(toolResult),
                },
              ],
              billing: {
                mode: execution.billingMode,
                isReplay: execution.isReplay,
                chargedCents: execution.chargedCents,
                remainingBalanceCents: execution.remainingBalanceCents,
              },
            },
          };
        } catch (err: any) {
          const structuredError = this.toStructuredError(err);
          await this.recordAudit({
            sessionId,
            tenantId,
            userId,
            toolName: name,
            durationMs: Date.now() - startedAt,
            status: 'FAILED',
            payload: { arguments: toolArgs, error: err?.message },
          });
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32000,
              message: structuredError.message as string,
              data: structuredError,
            },
          };
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }
  }

  private async recordAudit(event: Parameters<AuditRecorder['recordEvent']>[0]): Promise<void> {
    if (!this.auditRecorder) return;
    try {
      await this.auditRecorder.recordEvent(event);
    } catch {
      // A falha de auditoria não deve mascarar o resultado já faturado.
    }
  }

  private isExposed(toolName: string): boolean {
    return this.exposedToolNames === undefined || this.exposedToolNames.has(toolName);
  }

  private toStructuredError(error: unknown): Record<string, unknown> {
    if (error instanceof LegalToolGatewayError) return error.toJSON();
    const candidate = error as { code?: unknown; details?: unknown; message?: unknown };
    const errorCode = getErrorCode(error, 'TOOL_EXECUTION_FAILED');
    const code = errorCode === '57014' ? 'TOOL_TIMEOUT' : errorCode;
    const message = code === 'TOOL_TIMEOUT'
      ? 'A operação excedeu o tempo de resposta. Tente novamente.'
      : code === 'TOOL_EXECUTION_FAILED'
        ? 'Falha na execução da ferramenta. Tente novamente.'
        : typeof candidate?.message === 'string' ? candidate.message : 'Falha na execução da ferramenta.';
    return {
      code,
      message,
      retryable: ['SOURCE_PROVIDER_UNAVAILABLE', 'SOURCE_PROVIDER_TIMEOUT', 'TOOL_TIMEOUT', 'TOOL_EXECUTION_FAILED'].includes(code),
      ...(candidate?.details && typeof candidate.details === 'object' ? { details: candidate.details as Record<string, unknown> } : {}),
    };
  }
}
