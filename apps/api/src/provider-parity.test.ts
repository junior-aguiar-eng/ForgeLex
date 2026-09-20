import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v3';
import {
  AgentEvent,
  AgentProvider,
  AgentRuntime,
  AgentTool,
  ToolRegistry,
} from '@forgelex/agent-core';
import {
  createFixtureResearchService,
  createSearchCaseLawTool,
  saveFinalDraftTool,
} from '@forgelex/legal-tools';
import { AnthropicAgentProvider } from '@forgelex/agent-provider-anthropic';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import {
  createDatabase,
  MatterAuthorityRepository,
  MatterRepository,
  ForgeLexDatabase,
  runPersistenceMigrations,
} from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import type { Client } from '@libsql/client';

type ProviderName = 'anthropic' | 'openai';

interface FakeStream extends AsyncIterable<unknown> {
  finalOutput?: unknown;
  interruptions?: unknown[];
  currentTurn?: number;
  usage?: unknown;
  completed: Promise<void>;
}

function assistantMessage(content: unknown[]): unknown {
  return {
    type: 'assistant',
    message: { content },
    parent_tool_use_id: null,
    uuid: 'integration-assistant-message',
    session_id: 'integration-session',
  };
}

function resultMessage(usage?: unknown): unknown {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Pesquisa concluída.',
    num_turns: 2,
    duration_ms: 10,
    errors: [],
    uuid: 'integration-result-message',
    session_id: 'integration-session',
    ...(usage === undefined ? {} : { usage }),
  };
}

function runItem(name: string, item: Record<string, unknown>): unknown {
  return { type: 'run_item_stream_event', name, item };
}

function fakeStream(
  events: unknown[],
  options: { finalOutput?: unknown; interruptions?: unknown[]; currentTurn?: number; usage?: unknown } = {},
): FakeStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    ...options,
    completed: Promise.resolve(),
  };
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function createBilledResearchTool(
  ledgerService: LedgerService,
  auditRecorder: AuditRecorder,
  provider: ProviderName,
  idempotencyKey: string,
  contexts: Array<Record<string, unknown>>,
): AgentTool {
  const sourceTool = createSearchCaseLawTool(createFixtureResearchService());
  return {
    ...sourceTool,
    execute: async (input, context) => {
      contexts.push({
        sessionId: context.sessionId,
        tenantId: context.tenantId,
        userId: context.userId,
        matterId: context.matterId,
      });
      const execution = await ledgerService.executeBillableOperation({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        idempotencyKey,
        costCents: 20,
        usage: {
          capability: sourceTool.name,
          toolName: sourceTool.name,
          provider: 'forgelex_index',
          requestId: idempotencyKey,
          sessionId: context.sessionId,
          userId: context.userId,
        },
        operation: () => sourceTool.execute(input, context),
      });

      if (!execution.isReplay) {
        await auditRecorder.recordEvent({
          sessionId: context.sessionId,
          tenantId: context.tenantId,
          userId: context.userId,
          toolName: sourceTool.name,
          durationMs: 0,
          status: 'SUCCESS',
          payload: { provider, resultCount: execution.data.data.total },
        });
      }

      return execution.data;
    },
  };
}

function createSearchProvider(
  provider: ProviderName,
  toolName: string,
  queryInput: Record<string, unknown>,
): AgentProvider {
  if (provider === 'anthropic') {
    const query = vi.fn((params: any) => {
      const registeredTool = params.options.mcpServers.forgelex.instance._registeredTools[toolName];
      const messages = (async function* () {
        await registeredTool.handler(queryInput, { toolUseId: 'integration_search_call' });
        yield assistantMessage([
          {
            type: 'tool_use',
            id: 'integration_search_call',
            name: `mcp__forgelex__${toolName}`,
            input: queryInput,
          },
        ]);
        yield assistantMessage([{ type: 'text', text: 'A authority foi encontrada.' }]);
        yield resultMessage({ input_tokens: 11, output_tokens: 7 });
      })();
      return Object.assign(messages, { close: vi.fn() });
    });
    return new AnthropicAgentProvider({ apiKey: 'test-key', query });
  }

  const run = vi.fn(async (agent: any, _prompt: string, options: any): Promise<FakeStream> => {
    const sdkTool = agent.tools[0];
    await sdkTool.invoke(
      { context: options.context },
      JSON.stringify(queryInput),
      { toolCall: { callId: 'integration_search_call' } },
    );
    return fakeStream(
      [
        runItem('tool_called', {
          type: 'tool_call_item',
          rawItem: {
            type: 'function_call',
            name: sdkTool.name,
            callId: 'integration_search_call',
            arguments: JSON.stringify(queryInput),
          },
        }),
        runItem('message_output_created', {
          type: 'message_output_item',
          content: 'A authority foi encontrada.',
        }),
      ],
      {
        finalOutput: 'A autoridade foi encontrada.',
        currentTurn: 2,
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      },
    );
  });
  return new OpenAIAgentProvider({ apiKey: 'test-key', run });
}

function createApprovalProvider(provider: ProviderName): AgentProvider {
  const input = { title: 'Peça final', content: 'Conteúdo suficiente para a peça final.' };
  if (provider === 'anthropic') {
    const query = vi.fn((params: any) => {
      const messages = (async function* () {
        const permission = await params.options.canUseTool(
          'mcp__forgelex__drafting.save_final_draft',
          input,
          {
            toolUseID: 'integration_approval_call',
            requestId: 'integration-approval-request',
            signal: new AbortController().signal,
          },
        );
        expect(permission.behavior).toBe('deny');
        yield assistantMessage([
          {
            type: 'tool_use',
            id: 'integration_approval_call',
            name: 'mcp__forgelex__drafting.save_final_draft',
            input,
          },
        ]);
        yield {
          ...resultMessage(),
          subtype: 'error_during_execution',
          is_error: true,
          errors: ['Aprovação humana necessária.'],
        };
      })();
      return Object.assign(messages, { close: vi.fn() });
    });
    return new AnthropicAgentProvider({ apiKey: 'test-key', query });
  }

  const run = vi.fn(async (agent: any, _prompt: string, options: any): Promise<FakeStream> => {
    const sdkTool = agent.tools[0];
    const approvalRequired = await sdkTool.needsApproval(
      { context: options.context },
      input,
      'integration_approval_call',
    );
    expect(approvalRequired).toBe(true);
    const approvalItem = {
      type: 'tool_approval_item',
      rawItem: {
        type: 'function_call',
        name: sdkTool.name,
        callId: 'integration_approval_call',
        arguments: JSON.stringify(input),
      },
    };
    return fakeStream([runItem('tool_approval_requested', approvalItem)], {
      interruptions: [approvalItem],
      currentTurn: 1,
    });
  });
  return new OpenAIAgentProvider({ apiKey: 'test-key', run });
}

describe('Provider parity: integração comercial ForgeLex', () => {
  let client: Client | undefined;

  afterEach(() => {
    client?.close();
    client = undefined;
  });

  it('mantém metadados de token fora do ledger quando nenhuma tool jurídica é executada', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    await runPersistenceMigrations(client);
    const ledgerService = new LedgerService(connection.db, client);
    await ledgerService.runMigrations();
    await ledgerService.provisionAccount('tenant_usage_only', {
      paidBalanceCents: 3000, promotionalBalanceCents: 0, promoExpiresAt: null,
    });
    const provider: AgentProvider = {
      id: 'fake',
      async *run(input) {
        yield { type: 'lifecycle:started', sessionId: input.sessionId, model: 'integrator-model', timestamp: new Date().toISOString() };
        yield {
          type: 'lifecycle:completed', sessionId: input.sessionId, output: 'síntese do integrador',
          totalTurns: 1, totalDurationMs: 1,
          usage: { provider: 'integrator', model: 'integrator-model', inputTokens: 11, outputTokens: 7 },
          timestamp: new Date().toISOString(),
        };
      },
      async cancel() {},
    };
    const runtime = new AgentRuntime({ provider, toolRegistry: new ToolRegistry() });
    const before = await ledgerService.getAvailableBalanceCents('tenant_usage_only');
    const events = await collectEvents(runtime.run({
      sessionId: '55555555-5555-4555-8555-555555555555', tenantId: 'tenant_usage_only',
      userId: 'user_usage_only', prompt: 'Sintetize sem tool.',
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: 'lifecycle:completed', usage: { provider: 'integrator', model: 'integrator-model', inputTokens: 11, outputTokens: 7 },
    }));
    expect(await ledgerService.getAvailableBalanceCents('tenant_usage_only')).toBe(before);
    expect(await ledgerService.getUsageEvents('tenant_usage_only')).toEqual([]);
  });

  it.each(['anthropic', 'openai'] as const)(
    '%s percorre Agent Core, pesquisa, matter, auditoria e billing sem duplicidade',
    async (providerName) => {
      const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
      client = connection.client;
      await runPersistenceMigrations(client);
      const ledgerService = new LedgerService(connection.db, client);
      await ledgerService.runMigrations();
      const tenantId = `tenant_provider_parity_${providerName}`;
      await ledgerService.provisionAccount(tenantId, {
        paidBalanceCents: 3000,
        promotionalBalanceCents: 0,
        promoExpiresAt: null,
      });
      const auditRecorder = new AuditRecorder(connection.db);
      const matterRepository = new MatterRepository(connection.db);
      const authorityRepository = new MatterAuthorityRepository(connection.db);
      const matter = await matterRepository.createMatter({
        tenantId,
        createdBy: 'user_provider_parity',
        title: `Pesquisa comercial ${providerName}`,
      });
      const contexts: Array<Record<string, unknown>> = [];
      const idempotencyKey = `provider_parity_search_${providerName}`;
      const searchTool = createBilledResearchTool(
        ledgerService,
        auditRecorder,
        providerName,
        idempotencyKey,
        contexts,
      );
      const searchRegistry = new ToolRegistry();
      searchRegistry.register(searchTool);
      const provider = createSearchProvider(providerName, searchTool.name, {
        query: 'vazamento de dados',
        court: 'STJ',
        limit: 5,
      });
      const runtime = new AgentRuntime({ provider, toolRegistry: searchRegistry });
      const firstSessionId = `11111111-1111-4111-8111-111111111111`;
      const firstEvents = await collectEvents(runtime.run({
        sessionId: firstSessionId,
        tenantId: matter.tenantId,
        userId: matter.createdBy,
        matterId: matter.id,
        prompt: 'Pesquise jurisprudência sobre vazamento de dados.',
        maxTurns: 3,
      }));
      const firstCompleted = firstEvents.find((event) => event.type === 'tool:completed');
      const providerCompleted = firstEvents.find((event) => event.type === 'lifecycle:completed');
      expect(firstCompleted?.type).toBe('tool:completed');
      expect(firstEvents.some((event) => event.type === 'lifecycle:completed')).toBe(true);
      expect(providerCompleted).toMatchObject({
        type: 'lifecycle:completed',
        usage: providerName === 'anthropic'
          ? { provider: 'anthropic', inputTokens: 11, outputTokens: 7 }
          : { provider: 'openai', inputTokens: 11, outputTokens: 7 },
      });
      expect(await ledgerService.getAvailableBalanceCents(matter.tenantId)).toBe(2980);
      const legalUsageEvents = (await ledgerService.getUsageEvents(matter.tenantId))
        .filter((event) => event.requestId === idempotencyKey);
      expect(legalUsageEvents).toHaveLength(1);
      expect(legalUsageEvents[0]).toMatchObject({
        provider: 'forgelex_index',
        model: null,
        units: 1,
        legalCredits: 1,
        monetaryCostCents: 20,
      });
      if (!firstCompleted || firstCompleted.type !== 'tool:completed') throw new Error('Tool completion ausente.');
      const searchOutput = firstCompleted.output as { items: Array<Record<string, unknown>>; total: number };
      const authority = searchOutput.items[0];
      expect(authority.provenance).toMatchObject({ verified: true });
      expect(contexts[0]).toMatchObject({
        sessionId: firstSessionId,
        tenantId: matter.tenantId,
        userId: matter.createdBy,
        matterId: matter.id,
      });

      const saved = await authorityRepository.saveAuthority({
        tenantId: matter.tenantId,
        matterId: matter.id,
        savedBy: matter.createdBy,
        authority: authority as any,
      });
      await auditRecorder.recordEvent({
        sessionId: `matter_${matter.id}`,
        tenantId: matter.tenantId,
        userId: matter.createdBy,
        toolName: 'matter.authority.saved',
        durationMs: 0,
        status: 'SUCCESS',
        payload: { authorityId: saved.record.authority.id, provider: providerName },
      });

      const replayEvents = await collectEvents(runtime.run({
        sessionId: '22222222-2222-4222-8222-222222222222',
        tenantId: matter.tenantId,
        userId: matter.createdBy,
        matterId: matter.id,
        prompt: 'Repita a pesquisa com a mesma chave.',
        maxTurns: 3,
      }));
      expect(replayEvents.some((event) => event.type === 'lifecycle:completed')).toBe(true);
      expect((await ledgerService.getUsageEvents(matter.tenantId)).filter((event) => event.requestId === idempotencyKey)).toHaveLength(1);
      expect(await authorityRepository.listAuthorities(matter.tenantId, matter.id)).toHaveLength(1);
      expect((await auditRecorder.getLogsForSession(firstSessionId)).some((log) => log.toolName === searchTool.name)).toBe(true);
      expect((await auditRecorder.getLogsForSession(`matter_${matter.id}`)).some((log) => log.toolName === 'matter.authority.saved')).toBe(true);

      const otherMatter = await matterRepository.createMatter({
        tenantId: 'tenant_other_provider_parity',
        createdBy: 'user_other_provider_parity',
        title: 'Matter isolado',
      });
      expect(await authorityRepository.listAuthorities('tenant_other_provider_parity', otherMatter.id)).toEqual([]);
      expect(await authorityRepository.listAuthorities('tenant_other_provider_parity', matter.id)).toEqual([]);

      const approvalRegistry = new ToolRegistry();
      approvalRegistry.register(saveFinalDraftTool);
      const approvalProvider = createApprovalProvider(providerName);
      const approvalRuntime = new AgentRuntime({ provider: approvalProvider, toolRegistry: approvalRegistry });
      const approvalSessionId = providerName === 'anthropic'
          ? '33333333-3333-4333-8333-333333333333'
          : '44444444-4444-4444-8444-444444444444';
      const approvalEvents = await collectEvents(approvalRuntime.run({
        sessionId: approvalSessionId,
        tenantId: matter.tenantId,
        userId: matter.createdBy,
        matterId: matter.id,
        prompt: 'Salve a peça final.',
        maxTurns: 2,
      }));
      expect(approvalEvents.some((event) => event.type === 'tool:waiting_approval')).toBe(true);
      expect(approvalProvider.getSessionState(approvalSessionId)?.getStatus()).toBe('WAITING_HUMAN_APPROVAL');
    },
  );
});
