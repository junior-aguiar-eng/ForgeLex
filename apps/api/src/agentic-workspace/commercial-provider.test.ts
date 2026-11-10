import { expect, it, vi } from 'vitest';
import { createCommercialOpenAIRuntime } from './commercial-provider.js';
import { safeAgentFailure } from '@forgelex/agent-core';

const owner = { tenantId: 'commercial', userId: 'boni' };
function fixture() {
  const recordCall = vi.fn(async (_event: any) => {});
  const finance = {
    authorizeCall: vi.fn(async () => ({ shouldExecute: true })),
    settleCall: vi.fn(async () => ({ status: 'SETTLED' })),
    markUncertain: vi.fn(async () => ({})),
    markNotDispatched: vi.fn(async () => ({})),
  };
  const assertContext = vi.fn(async () => owner);
  const transport = vi.fn(
    async (_url: unknown, _init?: RequestInit) =>
      new Response(
        'event: response.completed\ndata: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'response',
              model: 'gpt-6.1-sol',
              service_tier: 'default',
              usage: {
                input_tokens: 100,
                output_tokens: 10,
                total_tokens: 110,
                input_tokens_details: { cached_tokens: 0 },
              },
            },
          }) +
          '\n\n',
      ),
  );
  const runtime = createCommercialOpenAIRuntime({
    apiKey: 'synthetic-key',
    recordCall,
    finance: finance as any,
    assertContext,
    transport,
  });
  return { finance, assertContext, transport, runtime, recordCall };
}
const body = { model: 'gpt-6.1-sol', stream: true, input: 'synthetic', tools: [] };
const request = (input: unknown = body) => ({ method: 'POST', body: JSON.stringify(input) });
it('records safe HTTP diagnostics while retaining uncertain cost and refusing implicit retries', async () => {
  const f = fixture();
  f.transport.mockResolvedValueOnce(
    new Response('private provider response', { status: 503, headers: { 'x-request-id': 'req_synthetic503' } }),
  );
  let caught: unknown;
  try {
    await f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request());
  } catch (error) {
    caught = error;
  }
  expect(safeAgentFailure(caught)).toMatchObject({
    failureClass: 'TRANSIENT_TRANSPORT',
    httpStatus: 503,
    requestId: 'req_synthetic503',
  });
  expect(f.finance.markUncertain).toHaveBeenCalledOnce();
  expect(f.finance.settleCall).not.toHaveBeenCalled();
  expect(f.transport).toHaveBeenCalledOnce();
  expect(JSON.stringify(safeAgentFailure(caught))).not.toContain('private');
});
it('revalidates context and reserves a durable call before sending; settles exact wire usage', async () => {
  const f = fixture();
  await f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request());
  expect(f.assertContext).toHaveBeenCalledTimes(2);
  expect(f.finance.authorizeCall.mock.invocationCallOrder[0]).toBeLessThan(f.transport.mock.invocationCallOrder[0]!);
  expect(f.finance.settleCall).toHaveBeenCalledWith(owner, 'execution', expect.any(String), {
    inputTokens: 100,
    outputTokens: 10,
    cachedInputTokens: 0,
  });
  const sent = JSON.parse(String(f.transport.mock.calls[0]?.[1]?.body));
  expect(sent).toMatchObject({
    store: false,
    service_tier: 'default',
    max_output_tokens: 2048,
    parallel_tool_calls: false,
  });
});
it.each([
  { ...body, tools: [{ type: 'web_search' }] },
  { ...body, tools: [{ type: 'function', name: 'forgelex_drafting_save_final_draft' }] },
  { ...body, tools: [{ type: 'function', name: 'forgelex_research_get_legislation' }] },
  { ...body, model: 'other' },
  { ...body, input: 'x'.repeat(128001) },
])('invalid transport input never reserves or sends', async (invalid) => {
  const f = fixture();
  await expect(
    f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request(invalid)),
  ).rejects.toThrow();
  expect(f.finance.authorizeCall).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
});
it('revoked context and already-authorized replay never send HTTP', async () => {
  const f = fixture();
  f.assertContext.mockRejectedValueOnce(new Error('ACCESS_REVOKED'));
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow(
    'ACCESS_REVOKED',
  );
  f.finance.authorizeCall.mockResolvedValueOnce({ shouldExecute: false });
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow(
    'CALL_ALREADY_AUTHORIZED',
  );
  expect(f.transport).not.toHaveBeenCalled();
});
it('transport failure persists uncertainty and never retries', async () => {
  const f = fixture();
  f.transport.mockRejectedValueOnce(new Error('connection lost'));
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow();
  expect(f.transport).toHaveBeenCalledOnce();
  expect(f.finance.markUncertain).toHaveBeenCalledOnce();
  expect(f.finance.settleCall).not.toHaveBeenCalled();
});
it('revocation after authorization records a proven non-dispatch without fabricated usage', async () => {
  const f = fixture();
  f.assertContext.mockResolvedValueOnce(owner).mockRejectedValueOnce(new Error('ACCESS_REVOKED'));
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow(
    'ACCESS_REVOKED',
  );
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.finance.markNotDispatched).toHaveBeenCalledOnce();
  expect(f.finance.markUncertain).not.toHaveBeenCalled();
  expect(f.finance.settleCall).not.toHaveBeenCalled();
});
it('cancellation during source revalidation prevents a new HTTP request', async () => {
  const f = fixture();
  const controller = new AbortController();
  f.assertContext.mockResolvedValueOnce(owner).mockImplementationOnce(async () => {
    controller.abort();
    return owner;
  });
  await expect(
    f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', { ...request(), signal: controller.signal }),
  ).rejects.toThrow('SESSION_CANCELLED');
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.finance.markNotDispatched).toHaveBeenCalledOnce();
});

it('correlates durable reservation, HTTP and settlement without logging prompts or credentials', async () => {
  const f = fixture();
  await f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', {
    ...request(),
    headers: { authorization: 'Bearer private-key', 'X-Client-Request-Id': 'untrusted' },
  });
  const headers = new Headers(f.transport.mock.calls[0]?.[1]?.headers);
  const callId = (f.finance.authorizeCall.mock.calls as any)[0][2].callId;
  expect(headers.get('X-Client-Request-Id')).toBe(callId);
  expect(headers.get('authorization')).toBe('Bearer private-key');
  expect(f.recordCall.mock.calls.map(([e]) => e.phase)).toEqual(['RESERVED', 'RESPONSE', 'USAGE', 'SETTLED']);
  expect(f.recordCall.mock.invocationCallOrder[0]).toBeLessThan(f.transport.mock.invocationCallOrder[0]!);
  expect(JSON.stringify(f.recordCall.mock.calls)).not.toMatch(/private-key|synthetic-key|"input"/);
});
it('preserves request ID and read stage when a successful HTTP stream breaks', async () => {
  const f = fixture();
  f.transport.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(Object.assign(new Error('private stream'), { code: 'ECONNRESET' }));
        },
      }),
      { headers: { 'x-request-id': 'req_stream' } },
    ),
  );
  let caught;
  try {
    await f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request());
  } catch (e) {
    caught = e;
  }
  expect(safeAgentFailure(caught)).toMatchObject({
    requestId: 'req_stream',
    httpStatus: 200,
    failureStage: 'READ_RESPONSE',
    failureClass: 'TRANSIENT_TRANSPORT',
  });
  expect(f.recordCall.mock.calls.at(-1)![0]).toMatchObject({ phase: 'FAILED', costState: 'UNCERTAIN' });
  expect(f.finance.markUncertain).toHaveBeenCalledOnce();
  expect(f.transport).toHaveBeenCalledOnce();
});
it('refuses dispatch when the reservation diagnostic cannot be persisted', async () => {
  const f = fixture();
  f.recordCall.mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow();
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.finance.markNotDispatched).toHaveBeenCalledOnce();
});
it('retains measured usage before a settlement failure without inventing a settled cost', async () => {
  const f = fixture();
  f.finance.settleCall.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow();
  expect(f.recordCall.mock.calls.map(([e]) => e.phase)).toEqual(['RESERVED', 'RESPONSE', 'USAGE', 'FAILED']);
  expect(f.recordCall.mock.calls[2]![0]).toMatchObject({ usage: { inputTokens: 100, outputTokens: 10 } });
  expect(f.recordCall.mock.calls.at(-1)![0]).toMatchObject({
    diagnostic: { failureStage: 'SETTLE_USAGE' },
    costState: 'UNCERTAIN',
  });
});

it('does not settle unpriced cache writes merely because token counts are present', async () => {
  const f = fixture();
  f.transport.mockResolvedValueOnce(
    new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: {
            model: 'gpt-6.1-sol',
            usage: {
              input_tokens: 100,
              output_tokens: 10,
              input_tokens_details: { cached_tokens: 0, cache_write_tokens_details: { ephemeral: 20 } },
            },
          },
        }) +
        '\n\n',
    ),
  );
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow();
  expect(f.finance.settleCall).not.toHaveBeenCalled();
  expect(f.finance.markUncertain).toHaveBeenCalledOnce();
});
it('preserves transport diagnosis even when persisting uncertainty also fails', async () => {
  const f = fixture();
  f.transport.mockRejectedValueOnce(Object.assign(new Error('private connection'), { code: 'ECONNRESET' }));
  f.finance.markUncertain.mockRejectedValueOnce(new Error('private database'));
  let caught;
  try {
    await f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request());
  } catch (e) {
    caught = e;
  }
  expect(safeAgentFailure(caught)).toMatchObject({ transportCode: 'ECONNRESET', failureStage: 'DISPATCH' });
  expect(f.recordCall.mock.calls.at(-1)![0]).toMatchObject({ accountingUpdateFailed: true, costState: 'UNCERTAIN' });
  expect(JSON.stringify(f.recordCall.mock.calls)).not.toContain('private');
});
it('does not mark already settled usage uncertain when the final trace write fails', async () => {
  const f = fixture();
  f.recordCall.mockImplementation(async (event) => {
    if (event.phase === 'SETTLED') throw new Error('disk');
  });
  await expect(f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request())).rejects.toThrow();
  expect(f.finance.settleCall).toHaveBeenCalledOnce();
  expect(f.finance.markUncertain).not.toHaveBeenCalled();
  expect(f.recordCall.mock.calls.at(-1)![0]).toMatchObject({ costState: 'SETTLED' });
});

it('retains HTTP correlation on malformed successful responses and rejects unsafe header contents', async () => {
  for (const requestId of ['req_malformed', 'Bearer private']) {
    const f = fixture();
    f.transport.mockResolvedValueOnce(
      new Response('private invalid response', { headers: { 'x-request-id': requestId } }),
    );
    let caught;
    try {
      await f.runtime.fetchFor('execution')('https://api.openai.com/v1/responses', request());
    } catch (e) {
      caught = e;
    }
    expect(safeAgentFailure(caught)).toMatchObject({
      failureStage: 'PARSE_USAGE',
      httpStatus: 200,
      failureClass: 'CONTRACT',
    });
    expect(safeAgentFailure(caught).requestId).toBe(requestId.startsWith('req_') ? requestId : undefined);
    expect(JSON.stringify(f.recordCall.mock.calls)).not.toContain('private');
    expect(f.finance.markUncertain).toHaveBeenCalledOnce();
  }
});

it('refuses a request over the ceiling with its own code, logs sizes only and sends nothing', async () => {
  const f = fixture();
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  let caught: unknown;
  try {
    await f.runtime.fetchFor('execution')(
      'https://api.openai.com/v1/responses',
      request({ ...body, input: 'segredo '.repeat(20000) }),
    );
  } catch (error) {
    caught = error;
  }
  const logged = write.mock.calls.map(([line]) => String(line)).join('');
  write.mockRestore();
  expect(caught).toMatchObject({ message: 'COMMERCIAL_REQUEST_TOO_LARGE' });
  expect(logged).toContain('commercial_request_too_large');
  expect(logged).toMatch(/"limitBytes":128000/);
  expect(logged).toMatch(/"bytes":\d+/);
  expect(logged).not.toContain('segredo');
  expect(f.finance.authorizeCall).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
});
it('admits a request of about 100 KB and reserves bytes plus the provider framing', async () => {
  const f = fixture();
  await f.runtime.fetchFor('execution')(
    'https://api.openai.com/v1/responses',
    request({ ...body, input: 'a'.repeat(100000) }),
  );
  const sent = String(f.transport.mock.calls[0]?.[1]?.body);
  const reserved = (f.finance.authorizeCall.mock.calls as any)[0][2];
  expect(Buffer.byteLength(sent)).toBeGreaterThan(100000);
  expect(reserved.inputTokens).toBe(Buffer.byteLength(sent) + 8192);
  expect(reserved.upperBoundMicroUsd).toBe(Math.ceil((reserved.inputTokens * 2000000 + 2048 * 10000000) / 1_000_000));
  expect(reserved.upperBoundMicroUsd).toBeLessThan(300000);
});
