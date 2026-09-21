import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { AgentRuntime, FakeAgentProvider, ToolRegistry } from '../../packages/agent-core/dist/index.js';
import { SearchCaseLawInputSchema, VerifyAuthorityInputSchema } from '../../packages/legal-tools/dist/index.js';
import { createMcpClient } from './mcp-client.mjs';
import { redactEvidence } from './redact-evidence.mjs';

function registerProxy(registry, client, name, inputSchema, idempotencyKey) {
  registry.register({
    name, description: `Proxy MCP remoto ${name}`, impactLevel: 'L1_ANALYSIS', inputSchema,
    outputSchema: { safeParse: (data) => ({ success: true, data }) }, timeoutMs: 60_000,
    execute: async (input) => {
      const result = await client.callTool(name, input, `${idempotencyKey}-${name}`);
      return { success: true, data: result.data, provenance: result.data.items?.map((item) => item.provenance) ?? (result.data.authority?.provenance ? [result.data.authority.provenance] : undefined) };
    },
  });
}

export async function runRemoteAgentChain(client, idempotencyKey) {
  const registry = new ToolRegistry();
  registerProxy(registry, client, 'research.search_case_law', SearchCaseLawInputSchema, idempotencyKey);
  registerProxy(registry, client, 'research.get_authority', VerifyAuthorityInputSchema, idempotencyKey);
  registerProxy(registry, client, 'research.verify_authority', VerifyAuthorityInputSchema, idempotencyKey);
  const authorityArgs = { court: 'STJ', processNumber: '2077278', judgmentDate: '2023-10-03' };
  const provider = new FakeAgentProvider(registry, undefined, [
    { thought: 'Pesquisar autoridade remota.', toolCall: { name: 'research.search_case_law', input: { query: 'vazamento', court: 'STJ', limit: 1 } } },
    { thought: 'Obter a autoridade remota.', toolCall: { name: 'research.get_authority', input: authorityArgs } },
    { thought: 'Verificar a autoridade remota.', toolCall: { name: 'research.verify_authority', input: authorityArgs } },
  ]);
  const runtime = new AgentRuntime({ provider, toolRegistry: registry });
  const completed = [];
  for await (const event of runtime.run({ sessionId: randomUUID(), tenantId: 'phase8_hml_remote', userId: 'phase8_hml_remote', prompt: 'Verifique a autoridade indicada sem contexto privado.' })) if (event.type === 'tool:completed') completed.push(event);
  if (completed.length !== 3) throw new Error('AGENT_CORE_REMOTE_CHAIN_INCOMPLETE');
  const searchAuthority = completed[0].output.items?.[0];
  const retrieved = completed[1].output.authority;
  const verified = completed[2].output.authority;
  const identity = searchAuthority?.id ?? searchAuthority?.processNumber;
  if (!identity || [retrieved, verified].some((item) => (item?.id ?? item?.processNumber) !== identity)) throw new Error('AGENT_CORE_AUTHORITY_IDENTITY_MISMATCH');
  return redactEvidence({ status: 'passed', timestamp: new Date().toISOString(), operationId: idempotencyKey, authorityId: identity, provider: searchAuthority.provenance?.source?.provider, toolCount: completed.length });
}

async function main() {
  const client = createMcpClient({ baseUrl: process.env.FORGELEX_PHASE8_BASE_URL, apiKey: process.env.FORGELEX_PHASE8_API_KEY });
  console.log(JSON.stringify(await runRemoteAgentChain(client, process.env.FORGELEX_PHASE8_IDEMPOTENCY_KEY ?? `phase8-agent-${Date.now()}`)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
