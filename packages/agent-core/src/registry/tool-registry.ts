import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '../contracts/agent-tools.js';
import { DomainError } from '@forgelex/domain';

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool<any, any>>();

  public register(tool: AgentTool<any, any>): void {
    if (this.tools.has(tool.name)) {
      throw new DomainError('INVALID_CANONICAL_STATE', `Ferramenta '${tool.name}' já está registrada no ToolRegistry.`);
    }
    this.tools.set(tool.name, tool);
  }

  public get(name: string): AgentTool<any, any> | undefined {
    return this.tools.get(name);
  }

  public list(): AgentTool<any, any>[] {
    return Array.from(this.tools.values());
  }

  public async executeTool(
    name: string,
    rawInput: unknown,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new DomainError('UNAUTHORIZED_CAPABILITY', `Ferramenta '${name}' não existe ou não está autorizada.`);
    }

    // 1. Validação estrita do schema Zod de entrada
    const parseResult = tool.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new DomainError('INVALID_CANONICAL_STATE', `Falha de validação nos parâmetros da ferramenta '${name}'`, {
        issues: parseResult.error.issues,
      });
    }

    if (context.abortSignal.aborted) {
      throw new DomainError('SESSION_CANCELLED', `Operação cancelada pelo usuário antes de '${name}'.`);
    }

    // 2. Execução com timeout e suporte a cancelamento
    const timeoutMs = tool.timeoutMs ?? 30000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new DomainError('TOOL_EXECUTION_FAILED', `Timeout excedido (${timeoutMs}ms) na ferramenta '${name}'.`));
      }, timeoutMs);

      onAbort = () => {
        if (timer) clearTimeout(timer);
        reject(new DomainError('SESSION_CANCELLED', `Operação cancelada pelo usuário durante '${name}'.`));
      };
      context.abortSignal.addEventListener('abort', onAbort, { once: true });
    });

    let result: ToolExecutionResult;
    try {
      result = await Promise.race([tool.execute(parseResult.data, context), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) context.abortSignal.removeEventListener('abort', onAbort);
    }
    const outputResult = tool.outputSchema.safeParse(result.data);
    if (!outputResult.success) {
      throw new DomainError('INVALID_CANONICAL_STATE', `Falha de validação na saída da ferramenta '${name}'`, {
        issues: outputResult.error.issues,
      });
    }
    return { ...result, data: outputResult.data };
  }
}
