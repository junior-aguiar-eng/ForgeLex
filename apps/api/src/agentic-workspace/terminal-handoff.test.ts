import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { FakeAgentProvider, ToolRegistry } from '@forgelex/agent-core';
import { AgenticCaseTask } from '@forgelex/legal-workflows';
import { createCommercialOpenAIRuntime } from './commercial-provider.js';

afterEach(() => vi.unstubAllGlobals());

function response(output: unknown[], status = 'completed', outputTokens = 20) {
  const value = {
    id: 'response',
    object: 'response',
    model: 'gpt-6.1-sol',
    status,
    output,
    usage: {
      input_tokens: 100,
      output_tokens: outputTokens,
      total_tokens: 100 + outputTokens,
      input_tokens_details: { cached_tokens: 0 },
    },
    ...(status === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
  };
  const frames = [
    { type: 'response.created', response: { ...value, status: 'in_progress', output: [] } },
    ...output.flatMap((item) => [
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.output_item.done', output_index: 0, item },
    ]),
    { type: `response.${status}`, response: value },
  ];
  return new Response(
    frames
      .map((f, sequence_number) => `event: ${f.type}\ndata: ${JSON.stringify({ ...f, sequence_number })}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

function fixture({ stop = true, incomplete = false, reject = false, rejectResult = false } = {}) {
  vi.stubGlobal('fetch', () => {
    throw new Error('NETWORK_FORBIDDEN');
  });
  const owner = { tenantId: 't', userId: 'u' };
  let reserved = 0;
  const finance = {
    // Reproduce a sufficient budget for the handoff but no room for another conservative reservation.
    authorizeCall: vi.fn(async () => {
      if (++reserved > 1) throw new Error('BUDGET_EXCEEDED');
      return { shouldExecute: true };
    }),
    settleCall: vi.fn(async () => ({ status: 'SETTLED' })),
    markUncertain: vi.fn(async () => ({})),
    markNotDispatched: vi.fn(async () => ({})),
  };
  const submit = vi.fn(async () => {
    if (reject) throw new Error('SOURCE_REFERENCE_INVALID');
    return { success: !rejectResult, data: { accepted: !rejectResult } };
  });
  const transport = vi.fn(async () =>
    response(
      [
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'forgelex_task_submit',
          status: incomplete ? 'incomplete' : 'completed',
          arguments: incomplete ? '{"value":' : '{"value":"verified"}',
        },
      ],
      incomplete ? 'incomplete' : 'completed',
      incomplete ? 2048 : 20,
    ),
  );
  const runtime = createCommercialOpenAIRuntime({
    apiKey: 'synthetic-only',
    finance: finance as any,
    assertContext: async () => owner,
    transport,
  });
  const handoff = {
    name: 'task.submit',
    description: 'Validated handoff',
    impactLevel: 'L0_OBSERVATION' as const,
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ accepted: z.boolean() }),
    execute: submit,
  };
  const registry = new ToolRegistry();
  registry.register(handoff);
  const provider = runtime.createProvider({ binding: { executionId: 'e' }, selectedPacket: {}, registry } as any);
  const run = async () => {
    const events = [];
    for await (const event of provider.run({
      sessionId: 'session',
      ...owner,
      prompt: 'Synthetic handoff',
      tools: [handoff],
      ...(stop ? { finishOnTools: ['task.submit'] } : {}),
      abortSignal: new AbortController().signal,
    }))
      events.push(event);
    return events;
  };
  return { run, finance, transport, submit };
}

it('finishes after a validated handoff without reserving an unnecessary confirmation call', async () => {
  const f = fixture();
  const events = await f.run();
  expect(f.submit).toHaveBeenCalledOnce();
  expect(events.some((e) => e.type === 'lifecycle:completed')).toBe(true);
  expect(events.some((e) => e.type === 'error')).toBe(false);
  expect(f.finance.authorizeCall).toHaveBeenCalledOnce();
  expect(f.transport).toHaveBeenCalledOnce();
});

it('reproduces the legacy budget failure after an already accepted handoff', async () => {
  const f = fixture({ stop: false });
  const events = await f.run();
  expect(f.submit).toHaveBeenCalledOnce();
  expect(f.finance.authorizeCall).toHaveBeenCalledTimes(2);
  expect(f.transport).toHaveBeenCalledOnce();
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'error', details: expect.objectContaining({ failureCode: 'BUDGET_EXCEEDED' }) }),
  );
});

it('settles incomplete output but never executes partial JSON or retries it', async () => {
  const f = fixture({ incomplete: true });
  const events = await f.run();
  expect(f.submit).not.toHaveBeenCalled();
  expect(f.transport).toHaveBeenCalledOnce();
  expect(f.finance.settleCall).toHaveBeenCalledOnce();
  expect(f.finance.markUncertain).not.toHaveBeenCalled();
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'error',
      details: expect.objectContaining({ failureCode: 'COMMERCIAL_OUTPUT_LIMIT' }),
    }),
  );
});

it('does not turn a rejected handoff into completion', async () => {
  const f = fixture({ reject: true });
  const events = await f.run();
  expect(events.some((e) => e.type === 'error')).toBe(true);
  expect(events.some((e) => e.type === 'lifecycle:completed')).toBe(false);
});

it('requires tool success even when a failure result matches the output schema', async () => {
  const f = fixture({ rejectResult: true });
  const events = await f.run();
  expect(events.some((e) => e.type === 'lifecycle:completed')).toBe(false);
});

it('fits the recorded D01 verifier budget without duplicated source retrieval or relaxing the reservation', async () => {
  vi.stubGlobal('fetch', () => {
    throw new Error('NETWORK_FORBIDDEN');
  });
  const fixture = JSON.parse(
    readFileSync('packages/legal-workflows/src/agentic-case-task/fixtures/pre-bounded-v5.json', 'utf8'),
  );
  const historical = JSON.parse(
    readFileSync(
      'docs/architecture/evidence/2026-11-02-delivery-failure-fix/real/D01-analyze-candidate.checkpoint.json',
      'utf8',
    ),
  );
  async function capture(legacy: boolean) {
    let captured: any;
    const task = new AgenticCaseTask({
      tools: [],
      context: {
        load: async () => fixture.packet,
        assert: async () => {},
        save: async () => ({ id: 'unused' }),
      },
      createProvider: ({ role, registry }) => {
        if (role === 'authority-verifier')
          return {
            id: 'fake',
            cancel: async () => {},
            async *run(input) {
              captured = { ...input, tools: registry.list() };
              yield {
                type: 'error',
                sessionId: input.sessionId,
                code: 'CAPTURE_DONE',
                message: 'capture',
                timestamp: new Date().toISOString(),
              } as const;
            },
          };
        const output =
          role === 'legal-orchestrator' ? historical.plan : { ...historical.outputs[role], supportChecks: [] };
        return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input: output } }]);
      },
    });
    let state = legacy ? historical : undefined;
    for (let i = 0; i < 10 && !captured; i++) {
      try {
        state = (await task.step(fixture.binding, state, new AbortController().signal)).state;
      } catch (e) {
        if (!(e instanceof Error) || e.message !== 'CAPTURE_DONE') throw e;
      }
    }
    expect(captured).toBeDefined();
    expect(JSON.parse(captured.prompt).untrustedContext.sources).toEqual(fixture.packet.sources);
    return captured;
  }
  async function replay(input: any, cap = 250000) {
    const reservations: number[] = [];
    let spent = 85506; // Recorded D01 usage immediately before authority-verifier.
    let dispatched = 0;
    const runtime = createCommercialOpenAIRuntime({
      apiKey: 'synthetic-only',
      assertContext: async () => ({ tenantId: 't', userId: 'u' }),
      finance: {
        authorizeCall: async (_o: any, _e: any, call: any) => {
          reservations.push(call.upperBoundMicroUsd);
          if (spent + call.upperBoundMicroUsd > cap) throw new Error('BUDGET_EXCEEDED');
          return { shouldExecute: true };
        },
        settleCall: async () => {
          spent += 12908;
          return { status: 'SETTLED' };
        },
        markUncertain: async () => {
          throw new Error('UNEXPECTED_UNCERTAINTY');
        },
        markNotDispatched: async () => {},
      } as any,
      transport: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const read = dispatched++ === 0 && body.tools.some((t: any) => t.name === 'forgelex_task_get_sources');
        return response([
          {
            type: 'function_call',
            id: `f${dispatched}`,
            call_id: `c${dispatched}`,
            status: 'completed',
            name: read ? 'forgelex_task_get_sources' : 'forgelex_task_submit',
            arguments: JSON.stringify(
              read
                ? {}
                : {
                    coveredIssueIds: historical.plan.issues.map((i: any) => i.id),
                    claims: [],
                    requirements: [],
                    findings: [],
                    supportChecks: [],
                  },
            ),
          },
        ]);
      },
    });
    const registry = new ToolRegistry();
    for (const tool of input.tools) registry.register(tool);
    const provider = runtime.createProvider({
      binding: { executionId: 'e' },
      selectedPacket: fixture.packet,
      registry,
    } as any);
    const events = [];
    for await (const event of provider.run({ ...input, abortSignal: new AbortController().signal })) events.push(event);
    return { reservations, dispatched, events, initialSpentMicroUsd: 85506, capMicroUsd: cap };
  }
  // The earlier packet reserves more than the current one. With the reserve now (bytes + 8192) * 2 + 2048 * 10
  // it fits the old US$ 0,25 cap on its own, so the cap is set one micro-USD below what that packet needs.
  const probe = await replay(await capture(true), 1_000_000);
  const legacy = await replay(await capture(true), 85506 + probe.reservations[0]! - 1);
  expect(legacy.events).toContainEqual(
    expect.objectContaining({ type: 'error', details: expect.objectContaining({ failureCode: 'BUDGET_EXCEEDED' }) }),
  );
  const current = await replay(await capture(false));
  expect(current.events.some((e) => e.type === 'error')).toBe(false);
  expect(current.events.some((e) => e.type === 'lifecycle:completed')).toBe(true);
  expect(current.dispatched).toBe(1);
  expect(current.reservations).toHaveLength(1);
  expect(current.reservations[0] + 85506).toBeLessThanOrEqual(250000);
  if (process.env.FORGELEX_V7_BUDGET_REPORT)
    writeFileSync(
      process.env.FORGELEX_V7_BUDGET_REPORT,
      JSON.stringify(
        { legacy: { ...legacy, events: undefined }, current: { ...current, events: undefined }, paidModelCalls: 0 },
        null,
        2,
      ),
    );
});
