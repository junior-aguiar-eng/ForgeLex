import { expect, it, vi } from 'vitest';
import { createCommercialOpenAIRuntime } from './commercial-provider.js';

const owner = { tenantId: 'commercial', userId: 'boni' };
function fixture() {
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
    finance: finance as any,
    assertContext,
    transport,
  });
  return { finance, assertContext, transport, runtime };
}
const body = { model: 'gpt-6.1-sol', stream: true, input: 'synthetic', tools: [] };
const request = (input: unknown = body) => ({ method: 'POST', body: JSON.stringify(input) });
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
  { ...body, model: 'other' },
  { ...body, input: 'x'.repeat(64001) },
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
