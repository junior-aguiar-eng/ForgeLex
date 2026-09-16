import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
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

export class McpHandler {
  private readonly toolRegistry: ToolRegistry;
  private readonly ledgerService: LedgerService;

  constructor(toolRegistry: ToolRegistry, ledgerService: LedgerService) {
    this.toolRegistry = toolRegistry;
    this.ledgerService = ledgerService;
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
        const tools = this.toolRegistry.list().map((tool) => {
          const rawSchema = zodToJsonSchema(tool.inputSchema, { target: 'jsonSchema7' }) as any;
          const { $schema, ...cleanSchema } = rawSchema;

          return {
            name: tool.name,
            description: tool.description,
            inputSchema: cleanSchema,
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
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ferramenta '${name}' não encontrada.` },
          };
        }

        const idempotencyKey =
          context.idempotencyKey ??
          request.params?._idempotencyKey ??
          `mcp_${name}_${JSON.stringify(toolArgs ?? {})}`;

        try {
          // Executa através do Algoritmo de Execução Faturável Idempotente (R$ 0,15 por busca)
          const execution = await this.ledgerService.executeBillableOperation({
            tenantId,
            userId,
            idempotencyKey,
            costCents: 15,
            usage: {
              capability: name,
              toolName: name,
              requestId: idempotencyKey,
            },
            operation: async () => {
              const controller = new AbortController();
              return await this.toolRegistry.executeTool(name, toolArgs ?? {}, {
                sessionId: randomUUID(),
                tenantId,
                userId,
                abortSignal: controller.signal,
              });
            },
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
                isReplay: execution.isReplay,
                chargedCents: execution.chargedCents,
                remainingBalanceCents: execution.remainingBalanceCents,
              },
            },
          };
        } catch (err: any) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32000,
              message: err.message ?? 'Falha na execução da ferramenta.',
              data: err.details,
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
}
