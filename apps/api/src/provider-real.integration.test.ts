import { describe, expect, it } from 'vitest';
import { AnthropicAgentProvider } from '@forgelex/agent-provider-anthropic';
import { OpenAIAgentProvider } from '@forgelex/agent-provider-openai';
import type { AgentEvent, AgentProvider } from '@forgelex/agent-core';

const prompt = 'Responda apenas com a palavra OK.';

async function runMinimal(provider: AgentProvider, sessionId: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of provider.run({ sessionId, tenantId: 'integration_test_tenant', userId: 'integration_test_user', prompt, tools: [], abortSignal: AbortSignal.timeout(30_000) })) events.push(event);
  return events;
}

describe('providers reais (condicional)', () => {
  it.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic completa o contrato comum sem expor credencial', async () => {
    const events = await runMinimal(new AnthropicAgentProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.FORGELEX_ANTHROPIC_MODEL }), 'real_anthropic_integration');
    expect(events.some((event) => event.type === 'lifecycle:completed')).toBe(true);
    expect(JSON.stringify(events)).not.toContain(process.env.ANTHROPIC_API_KEY);
  }, 45_000);

  it.skipIf(!process.env.OPENAI_API_KEY)('OpenAI completa o contrato comum sem expor credencial', async () => {
    const events = await runMinimal(new OpenAIAgentProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.FORGELEX_OPENAI_MODEL }), 'real_openai_integration');
    expect(events.some((event) => event.type === 'lifecycle:completed')).toBe(true);
    expect(JSON.stringify(events)).not.toContain(process.env.OPENAI_API_KEY);
  }, 45_000);
});
