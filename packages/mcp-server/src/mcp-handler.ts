import { ToolRegistry } from '@forgelex/agent-core';
import { getLegalToolContract, LegalToolGatewayError } from '@forgelex/legal-tools';
import { getForgeLexBillingPolicy, LedgerService } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { randomUUID } from 'node:crypto';

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
    context: { tenantId?: string; userId?: string; idempotencyKey?: string } = {}
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

        const idempotencyKey = context.idempotencyKey?.trim();
        if (!idempotencyKey) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Invalid params: a chave de idempotência é obrigatória.' },
          };
        }
        const sessionId = randomUUID();
        const startedAt = Date.now();

        try {
          await this.beforeToolCall?.(name);
          const execution = await this.ledgerService.executeOperation({
            tenantId,
            userId,
            idempotencyKey,
            billing,
            usage: {
              capability: name,
              toolName: name,
              requestId: idempotencyKey,
              sessionId,
              userId,
            },
            operation: async () => {
              const controller = new AbortController();
              return await this.toolRegistry.executeTool(name, toolArgs ?? {}, {
                sessionId,
                tenantId,
                userId,
                abortSignal: controller.signal,
              });
            },
          });

          await this.recordAudit({
            sessionId,
            tenantId,
            userId,
            toolName: name,
            durationMs: Date.now() - startedAt,
            status: 'SUCCESS',
            payload: { arguments: toolArgs, success: execution.data.success, billingMode: execution.billingMode },
          });

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(execution.data),
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
              message: err.message ?? 'Falha na execução da ferramenta.',
              data: this.toStructuredError(err),
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
    const code = typeof candidate?.code === 'string' ? candidate.code : 'TOOL_EXECUTION_FAILED';
    return {
      code,
      message: typeof candidate?.message === 'string' ? candidate.message : 'Falha na execução da ferramenta.',
      retryable: code === 'SOURCE_PROVIDER_UNAVAILABLE' || code === 'SOURCE_PROVIDER_TIMEOUT',
      ...(candidate?.details && typeof candidate.details === 'object' ? { details: candidate.details as Record<string, unknown> } : {}),
    };
  }
}
