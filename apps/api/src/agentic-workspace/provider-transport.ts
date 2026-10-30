import { normalizeProviderUsage } from '@forgelex/agent-core';

export async function readBounded(response: Response) {
  if (!response.body) throw new Error('PILOT_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2000000) throw new Error('PILOT_RESPONSE_INVALID');
      parts.push(chunk.value);
    }
    return Buffer.concat(parts).toString('utf8');
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export function responseUsage(body: string, model = 'gpt-6.1-sol') {
  for (const frame of body.split(/\r?\n\r?\n/).reverse()) {
    const data = frame
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') continue;
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (!['response.completed', 'response.incomplete', 'response.failed'].includes(event.type)) continue;
    const r = event.response;
    if (r?.model !== model || (r.service_tier && r.service_tier !== 'default'))
      throw new Error('PILOT_RESPONSE_INVALID');
    const usage = normalizeProviderUsage('openai', r.model, r, r.id);
    if (!usage) throw new Error('PILOT_RESPONSE_INVALID');
    const cached = r.usage?.input_tokens_details?.cached_tokens ?? 0;
    if (!Number.isSafeInteger(cached) || cached < 0 || cached > usage.inputTokens)
      throw new Error('PILOT_RESPONSE_INVALID');
    return { ...usage, cachedInputTokens: cached };
  }
  throw new Error('PILOT_RESPONSE_INVALID');
}
/** agents@0.18 expects numeric token details. Financial parsing retains the original wire. */
export function sdkCompatibleSse(text: string) {
  return text
    .split('\n')
    .map((line) => {
      if (!line.startsWith('data:')) return line;
      let event: any;
      try {
        event = JSON.parse(line.slice(5));
      } catch {
        return line;
      }
      const detail = event.response?.usage?.input_tokens_details;
      if (detail?.cache_write_tokens_details && typeof detail.cache_write_tokens_details === 'object') {
        if (Object.values(detail.cache_write_tokens_details).some((v) => v !== 0))
          throw new Error('PILOT_RESPONSE_INVALID');
        delete detail.cache_write_tokens_details;
      }
      return 'data: ' + JSON.stringify(event);
    })
    .join('\n');
}
