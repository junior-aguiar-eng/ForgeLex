import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRemoteHttpClient } from './remote-http.mjs';
import { redactEvidence } from './redact-evidence.mjs';

export function createMcpClient({ baseUrl, apiKey, fetcher = fetch, timeoutMs = 60_000 }) {
  const http = createRemoteHttpClient({ baseUrl, apiKey, fetcher, timeoutMs, maxOperations: 25 });
  let nextId = 1;
  async function call(method, params, idempotencyKey) {
    const id = nextId++;
    const result = await http.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) });
    const rpc = result.body;
    if (!rpc || rpc.jsonrpc !== '2.0' || rpc.id !== id || (!('result' in rpc) && !('error' in rpc))) throw new Error('MCP_RESPONSE_INVALID');
    if (rpc.error) throw new Error(rpc.error.data?.code ?? `MCP_ERROR:${rpc.error.code}`);
    return rpc.result;
  }
  return {
    call,
    async callTool(name, args, idempotencyKey) {
      const result = await call('tools/call', { name, arguments: args }, idempotencyKey);
      const text = result?.content?.find((item) => item.type === 'text')?.text;
      if (typeof text !== 'string') throw new Error('MCP_TOOL_CONTENT_INVALID');
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error('MCP_TOOL_CONTENT_INVALID'); }
      if (payload?.success !== true || !payload.data) throw new Error('MCP_TOOL_RESULT_INVALID');
      return { data: payload.data, billing: result.billing ?? { chargedCents: 0, isReplay: false } };
    },
  };
}

export async function runMcpGate(client, idempotencyKey) {
  const initialized = await client.call('initialize');
  if (!initialized?.protocolVersion) throw new Error('MCP_INITIALIZE_INVALID');
  const listed = await client.call('tools/list');
  const expected = ['research.search_case_law', 'research.get_authority', 'research.verify_authority'];
  for (const name of expected) {
    const tool = listed?.tools?.find((candidate) => candidate.name === name);
    if (!tool || tool.inputSchema?.type !== 'object') throw new Error(`MCP_TOOL_SCHEMA_INVALID:${name}`);
  }
  const searchArgs = { query: 'vazamento de dados', court: 'STJ', limit: 5 };
  const search = await client.callTool(expected[0], searchArgs, idempotencyKey);
  const replay = await client.callTool(expected[0], searchArgs, idempotencyKey);
  const authority = search.data.items?.[0];
  if (!authority?.id || !authority?.processNumber || !authority?.provenance?.source) throw new Error('MCP_PROVENANCE_INVALID');
  const authorityArgs = { court: 'STJ', processNumber: authority.processNumber, judgmentDate: authority.judgmentDate };
  const obtained = await client.callTool(expected[1], authorityArgs, `${idempotencyKey}-get`);
  const verified = await client.callTool(expected[2], authorityArgs, `${idempotencyKey}-verify`);
  const authorities = [authority, obtained.data.authority, verified.data.authority];
  if (authorities.some((item) => item?.id !== authority.id)) throw new Error('MCP_AUTHORITY_IDENTITY_MISMATCH');
  const chargedCents = [search, replay, obtained, verified].reduce((sum, item) => sum + Number(item.billing?.chargedCents ?? 0), 0);
  if (chargedCents !== 20 || replay.billing?.isReplay !== true) throw new Error('MCP_BILLING_MISMATCH');
  return redactEvidence({ status: 'passed', timestamp: new Date().toISOString(), operationId: idempotencyKey, authorityId: authority.id, provider: authority.provenance.source.provider, chargedCents, replay: true, toolCount: expected.length });
}

async function main() {
  const client = createMcpClient({ baseUrl: process.env.FORGELEX_PHASE8_BASE_URL, apiKey: process.env.FORGELEX_PHASE8_API_KEY });
  console.log(JSON.stringify(await runMcpGate(client, process.env.FORGELEX_PHASE8_IDEMPOTENCY_KEY ?? `phase8-${Date.now()}`)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
