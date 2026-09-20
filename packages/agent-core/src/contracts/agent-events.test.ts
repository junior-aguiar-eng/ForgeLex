import { describe, expect, it } from 'vitest';
import { AgentEventSchema, normalizeProviderUsage } from './agent-events.js';

describe('uso normalizado dos providers', () => {
  it('aceita uso mensurável no encerramento da sessão', () => {
    const event = AgentEventSchema.parse({
      type: 'lifecycle:completed',
      sessionId: '00000000-0000-4000-8000-000000000001',
      output: 'ok',
      totalTurns: 1,
      totalDurationMs: 10,
      timestamp: new Date().toISOString(),
      usage: {
        provider: 'openai',
        model: 'gpt-test',
        inputTokens: 100,
        outputTokens: 20,
        cachedInputTokens: 10,
        reasoningTokens: 5,
        requestId: 'req_1',
      },
    });

    expect(event.type === 'lifecycle:completed' && event.usage?.outputTokens).toBe(20);
  });

  it('extrai somente contagens válidas e não cria cobrança sem uso mensurável', () => {
    expect(normalizeProviderUsage('anthropic', 'claude-test', {
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 50,
      },
      request_id: 'req_anthropic',
    })).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 50,
      requestId: 'req_anthropic',
    });
    expect(normalizeProviderUsage('openai', 'gpt-test', {})).toBeUndefined();
  });
});
