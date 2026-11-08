import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { Client as LibsqlClient } from '@libsql/client';
import { buildApp } from './app.js';
import { AuthAdapter } from './auth/fastify-auth.js';

/**
 * Conformidade com um cliente MCP rigoroso. O cliente OFICIAL valida a lista de ferramentas inteira de uma vez com o
 * schema do protocolo: uma única ferramenta inválida faz `listTools()` falhar e o host fica com ZERO ferramentas.
 * Foi o que aconteceu em produção a partir de 18/10/2026: `analise.peca_redigir` anunciava `{ oneOf: [...] }` sem
 * `type: "object"`, o Claude (chat) passou a buscar a lista centenas de vezes sem nunca chamar uma ferramenta, e o
 * Claude Code só funcionava porque ele mesmo achata esse schema. Este teste sobe o servidor com a configuração
 * completa (análise, pesquisa salva, leitor de decisões, OAuth) e conversa com ele pelo cliente oficial.
 */
const principal: AuthenticatedPrincipal = {
  subjectId: 'subject_conformance',
  tenantId: 'tenant_conformance',
  userId: 'user_conformance',
  roles: ['lawyer'],
  scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
  authMethod: 'api_key',
};
class FixtureVerifier implements TokenVerifier {
  async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    return token === 'conformance-token' ? principal : null;
  }
}

describe('conformidade com o cliente oficial do MCP (configuração completa)', () => {
  let app: FastifyInstance;
  let database: LibsqlClient;
  let client: Client;

  beforeAll(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    database = connection.client;
    const ledger = new LedgerService(connection.db, connection.client);
    await runPersistenceMigrations(connection.client);
    await ledger.runMigrations();
    await ledger.provisionAccount('tenant_conformance', { paidBalanceCents: 6300, promotionalBalanceCents: 0 });
    app = await buildApp({
      authAdapter: new AuthAdapter(new FixtureVerifier()),
      ledgerService: ledger,
      database: connection.db,
      databaseClient: connection.client,
      environment: {
        NODE_ENV: 'test',
        FORGELEX_ANALISE_ENABLED: 'true',
        FORGELEX_SAVED_RESEARCH_ENABLED: 'true',
        FORGELEX_MCP_DECISION_UI_ENABLED: 'true',
        FORGELEX_MCP_RESOURCE_URL: 'https://nexojuris.ia.br',
        FORGELEX_MCP_OAUTH_ENABLED: 'true',
        FORGELEX_SUPABASE_URL: 'https://project.supabase.co',
        FORGELEX_SUPABASE_PUBLISHABLE_KEY: 'publishable',
        FORGELEX_SUPABASE_SECRET_KEY: 'secret-test',
        FORGELEX_MCP_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    client = new Client({ name: 'conformance-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { authorization: 'Bearer conformance-token' } },
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await client?.close();
    await app?.close();
    database?.close();
  });

  it('entrega as instruções de uso no initialize', () => {
    expect(client.getServerVersion()?.name).toBe('forgelex-mcp-server');
    expect(client.getInstructions()).toContain('research.search_case_law');
  });

  it('listTools() valida inteiro: nenhuma ferramenta pode derrubar a lista toda', async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(20);
    const names = tools.map((tool) => tool.name);
    for (const expected of [
      'research.search_case_law',
      'analise.peca_redigir',
      'case.get_context',
      'forgelex.connection_status',
    ]) {
      expect(names, expected).toContain(expected);
    }
    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      if (tool.outputSchema) expect(tool.outputSchema.type, tool.name).toBe('object');
      expect(tool.description?.toLowerCase(), tool.name).toContain('forgelex');
    }
  });

  it('a ferramenta de união (peca_redigir) é anunciada como um objeto único que descreve seus dois modos', async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === 'analise.peca_redigir')!;
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema).not.toHaveProperty('oneOf');
    expect(tool.inputSchema).not.toHaveProperty('anyOf');
    const properties = tool.inputSchema.properties as Record<string, any>;
    expect(properties.modo.enum).toEqual(['correcao_dirigida', 'redacao_integral']);
    for (const key of ['texto_original', 'apontamentos', 'instrucoes', 'texto_peca'])
      expect(properties, key).toHaveProperty(key);
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['sessao_analitica_id', 'area_direito', 'modo']));
    expect(tool.description).toContain('exatamente um destes conjuntos');
  });

  it('o resultado das chamadas também passa pela validação do cliente oficial', async () => {
    const status = await client.callTool({ name: 'forgelex.connection_status', arguments: {} });
    expect(status.isError).toBeFalsy();
    expect(status.structuredContent).toMatchObject({ authenticated: true, billable: false });
    const search = await client.callTool({
      name: 'research.search_case_law',
      arguments: { query: 'vazamento', limit: 3, idempotencyKey: 'conformance-1' },
    });
    expect(search.isError).toBeFalsy();
  });

  it('a validação real continua no servidor: argumentos inválidos de peca_redigir são recusados', async () => {
    // Sem `instrucoes` nem `texto_peca`, nenhum dos dois modos fecha: o schema Zod original recusa (-32602), mesmo
    // com o schema anunciado achatado.
    await expect(
      client.callTool({
        name: 'analise.peca_redigir',
        arguments: {
          sessao_analitica_id: 'nova',
          area_direito: 'civil',
          modo: 'redacao_integral',
          idempotencyKey: 'conformance-2',
        },
      }),
    ).rejects.toMatchObject({ code: -32602 });
  });
});
