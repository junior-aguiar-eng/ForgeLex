import { EXTERNAL_MCP_TOOL_NAMES } from '@forgelex/mcp-server';

type HttpMethod = 'get' | 'post' | 'delete';

export interface PublicApiRouteDefinition {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  scopes?: readonly string[];
  toolName?: string;
  requestBody?: 'object' | 'search-case-law' | 'verify-authority' | 'api-key';
}

const genericObjectSchema = { type: 'object', additionalProperties: true };

export const PUBLIC_API_ROUTES: readonly PublicApiRouteDefinition[] = [
  { method: 'get', path: '/health', summary: 'Healthcheck', description: 'Verifica a disponibilidade do serviço.' },
  { method: 'get', path: '/.well-known/oauth-protected-resource', summary: 'Metadados do recurso protegido', description: 'Publica os metadados OAuth do recurso MCP.' },
  { method: 'get', path: '/openapi.json', summary: 'Especificação OpenAPI', description: 'Retorna esta especificação gerada.' },
  { method: 'get', path: '/api/v2/openapi.json', summary: 'Especificação OpenAPI v2', description: 'Retorna esta especificação gerada.' },
  { method: 'get', path: '/api/v2/webhooks/events', summary: 'Eventos de webhook', description: 'Lista os tipos de evento e o contrato de assinatura disponível.' },
  { method: 'get', path: '/api/v2/tribunals', summary: 'Listar tribunais', description: 'Retorna o catálogo de tribunais habilitados.', scopes: ['research:read'] },
  { method: 'get', path: '/api/v2/matters', summary: 'Listar casos', description: 'Lista os casos do tenant autenticado.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters', summary: 'Criar caso', description: 'Cria um caso no tenant autenticado.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}', summary: 'Consultar caso', description: 'Retorna um caso e seus documentos.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/documents', summary: 'Ingerir documento', description: 'Ingere texto, versão e âncoras de um documento.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/documents/{documentId}', summary: 'Consultar documento', description: 'Retorna o documento e sua versão mais recente.', scopes: ['matter:read'] },
  { method: 'get', path: '/api/v2/matters/{matterId}/authorities', summary: 'Listar authorities salvas', description: 'Lista as autoridades judiciais salvas no caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/authorities', summary: 'Salvar authority', description: 'Salva uma autoridade judicial com sua proveniência no caso.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/facts', summary: 'Listar fatos', description: 'Lista fatos e cobertura explícita do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/facts', summary: 'Registrar fato', description: 'Registra um fato candidato no caso.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/evidence', summary: 'Listar provas', description: 'Lista itens de prova do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/evidence', summary: 'Registrar prova', description: 'Registra um item de prova no caso.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/matters/{matterId}/facts/{factId}/support', summary: 'Mapear suporte do fato', description: 'Vincula fato a âncora ou prova.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/evidence/coverage', summary: 'Consultar cobertura', description: 'Retorna a cobertura explícita dos fatos.', scopes: ['matter:read'] },
  { method: 'get', path: '/api/v2/matters/{matterId}/timeline', summary: 'Listar linha do tempo', description: 'Lista eventos cronológicos do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/timeline', summary: 'Registrar evento', description: 'Registra evento na linha do tempo.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/drafts', summary: 'Listar rascunhos', description: 'Lista rascunhos do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts', summary: 'Criar rascunho', description: 'Cria rascunho estruturado.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/drafts/{draftId}', summary: 'Consultar rascunho', description: 'Retorna o rascunho e sua versão corrente.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts/{draftId}/versions', summary: 'Criar versão do rascunho', description: 'Cria uma versão imutável do rascunho.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts/{draftId}/review', summary: 'Revisar rascunho', description: 'Executa revisão de citações, suporte factual ou adversarial.', scopes: ['matter:read'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts/{draftId}/approval', summary: 'Solicitar aprovação', description: 'Solicita aprovação humana para uma versão.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/draft-approvals', summary: 'Listar aprovações', description: 'Lista solicitações de aprovação do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/draft-approvals/resolve', summary: 'Resolver aprovação', description: 'Registra decisão humana usando token efêmero.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/jurisprudencias', summary: 'Pesquisar jurisprudência', description: 'Alias compatível da pesquisa faturável.', scopes: ['research:read'], toolName: 'research.search_case_law' },
  { method: 'post', path: '/api/v2/research/search-case-law', summary: 'Pesquisar jurisprudência', description: 'Executa a capability research.search_case_law com o mesmo serviço usado pelo MCP.', scopes: ['research:read'], toolName: 'research.search_case_law', requestBody: 'search-case-law' },
  { method: 'post', path: '/api/v2/research/get-authority', summary: 'Obter autoridade', description: 'Obtém a autoridade identificada e devolve o status de verificação e a proveniência.', scopes: ['research:read'], toolName: 'research.get_authority', requestBody: 'verify-authority' },
  { method: 'post', path: '/api/v2/research/verify-authority', summary: 'Verificar autoridade', description: 'Executa a capability research.verify_authority com proveniência.', scopes: ['research:read'], toolName: 'research.verify_authority', requestBody: 'verify-authority' },
  { method: 'get', path: '/api/v2/api-keys', summary: 'Listar chaves de API', description: 'Lista somente metadados das chaves do tenant.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/api-keys', summary: 'Criar chave de API', description: 'Cria chave e retorna o segredo uma única vez.', scopes: ['billing:read'], requestBody: 'api-key' },
  { method: 'delete', path: '/api/v2/api-keys/{keyId}', summary: 'Revogar chave de API', description: 'Revoga uma chave do tenant autenticado.', scopes: ['billing:read'] },
  { method: 'post', path: '/mcp', summary: 'Gateway MCP remoto', description: 'Aceita JSON-RPC 2.0 e expõe somente o pacote MCP externo allowlisted.', scopes: ['mcp'] },
  { method: 'get', path: '/mcp', summary: 'Método MCP não permitido', description: 'Informa que o gateway MCP requer POST.', },
];

function operationId(route: PublicApiRouteDefinition): string {
  return `${route.method}_${route.path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

function pathParameters(path: string): Array<Record<string, unknown>> {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function createOperation(route: PublicApiRouteDefinition): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: operationId(route),
    summary: route.summary,
    description: route.description,
    responses: {
      '200': { description: 'Operação concluída.' },
      '400': { description: 'Requisição inválida.' },
      '401': { description: 'Credencial ausente ou inválida.' },
      '403': { description: 'Escopo insuficiente.' },
    },
  };
  const parameters = pathParameters(route.path);
  if (parameters.length > 0) operation.parameters = parameters;
  if (route.scopes && route.scopes.length > 0) {
    operation.security = [{ BearerAuth: [] }];
    operation['x-forgelex-required-scopes'] = route.scopes;
  }
  if (route.toolName) operation['x-forgelex-tool'] = route.toolName;
  if (route.requestBody) {
    const schema = route.requestBody === 'search-case-law'
      ? { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 2 }, court: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } } }
      : route.requestBody === 'verify-authority'
        ? { type: 'object', required: ['court', 'processNumber'], properties: { court: { type: 'string' }, processNumber: { type: 'string' }, judgmentDate: { type: 'string' } } }
        : route.requestBody === 'api-key'
          ? { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, scopes: { type: 'array', items: { type: 'string' } } } }
          : genericObjectSchema;
    operation.requestBody = { required: true, content: { 'application/json': { schema } } };
  }
  return operation;
}

export function buildOpenApiDocument(serverUrl = 'http://localhost:3001'): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of PUBLIC_API_ROUTES) {
    paths[route.path] ??= {};
    paths[route.path][route.method] = createOperation(route);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'ForgeLex Public API',
      version: '2.0.0',
      description: 'Contrato gerado a partir da superfície REST/MCP exposta pelo ForgeLex. Resultados jurídicos preservam a proveniência disponível; nenhuma rota presume efeito externo.',
    },
    servers: [{ url: serverUrl.replace(/\/$/, '') }],
    tags: [{ name: 'Research' }, { name: 'Matters' }, { name: 'Drafts' }, { name: 'Distribution' }, { name: 'MCP' }],
    paths,
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API key or OAuth access token' },
      },
    },
    'x-forgelex-generated-from': 'apps/api/src/distribution/openapi.ts',
    'x-forgelex-external-mcp-tools': [...EXTERNAL_MCP_TOOL_NAMES],
  };
}
