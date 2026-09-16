import { AgentProvider, AgentRunInput } from '../contracts/agent-provider.js';
import { AgentEvent } from '../contracts/agent-events.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { PolicyEngine } from '../policy/policy-engine.js';

export interface AgentRuntimeOptions {
  provider: AgentProvider;
  toolRegistry: ToolRegistry;
  policyEngine?: PolicyEngine;
  defaultSystemPolicy?: string;
}

export class AgentRuntime {
  private readonly provider: AgentProvider;
  private readonly toolRegistry: ToolRegistry;
  private readonly policyEngine: PolicyEngine;
  private readonly defaultSystemPolicy: string;

  constructor(options: AgentRuntimeOptions) {
    this.provider = options.provider;
    this.toolRegistry = options.toolRegistry;
    this.policyEngine = options.policyEngine ?? new PolicyEngine();
    this.defaultSystemPolicy =
      options.defaultSystemPolicy ??
      'Você é um assistente agêntico jurídico do FORGELEX. Nunca invente fatos, artigos ou jurisprudência. Sempre cite proveniência verificável.';
  }

  public async *run(
    params: Omit<AgentRunInput, 'tools' | 'abortSignal'>,
    abortSignal?: AbortSignal
  ): AsyncIterable<AgentEvent> {
    const controller = new AbortController();
    const signal = abortSignal ?? controller.signal;

    const runInput: AgentRunInput = {
      ...params,
      systemPolicy: params.systemPolicy ?? this.defaultSystemPolicy,
      tools: this.toolRegistry.list(),
      abortSignal: signal,
    };

    yield* this.provider.run(runInput);
  }

  public async cancel(sessionId: string): Promise<void> {
    await this.provider.cancel(sessionId);
  }

  public getRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  public getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }
}
