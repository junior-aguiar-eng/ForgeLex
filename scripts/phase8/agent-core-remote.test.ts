import { describe, expect, it, vi } from 'vitest';
import { runRemoteAgentChain } from './agent-core-remote.mjs';

describe('Agent Core remoto', () => {
  it('encadeia a mesma autoridade sem contexto privado', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = { callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const authority = { id: 'remote_1', court: 'STJ', processNumber: 'REsp 1', provenance: { source: { provider: 'remote' }, verified: true } };
      return name === 'research.search_case_law' ? { data: { items: [authority] }, billing: { chargedCents: 20 } } : { data: { authority, status: 'VERIFIED_OFFICIAL' }, billing: { chargedCents: 0 } };
    }) };
    const result = await runRemoteAgentChain(client, 'intent_1');
    expect(result).toMatchObject({ status: 'passed', authorityId: 'remote_1', provider: 'remote' });
    expect(calls.map((call) => call.name)).toEqual(['research.search_case_law', 'research.get_authority', 'research.verify_authority']);
    expect(calls[0]?.args).toMatchObject({ query: 'vazamento', court: 'STJ', limit: 1 });
    expect(JSON.stringify(calls)).not.toMatch(/conversation|files|history/);
  });
});
