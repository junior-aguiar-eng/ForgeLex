import { EXTERNAL_MCP_TOOL_NAMES } from '@forgelex/mcp-server';

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface PublicApiRouteDefinition {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  requiresAuthentication?: boolean;
  scopes?: readonly string[];
  toolName?: string;
  requestBody?: 'object' | 'search-case-law' | 'verify-authority' | 'api-key' | 'account-bootstrap';
}

const genericObjectSchema = { type: 'object', additionalProperties: true };

export const PUBLIC_API_ROUTES: readonly PublicApiRouteDefinition[] = [
  { method: 'get', path: '/health', summary: 'Healthcheck', description: 'Verifica a disponibilidade do serviço.' },
  { method: 'get', path: '/.well-known/oauth-protected-resource', summary: 'Metadados do recurso protegido', description: 'Publica os metadados OAuth do recurso MCP.' },
  { method: 'get', path: '/openapi.json', summary: 'Especificação OpenAPI', description: 'Retorna esta especificação gerada.' },
  { method: 'get', path: '/api/v2/openapi.json', summary: 'Especificação OpenAPI v2', description: 'Retorna esta especificação gerada.' },
  { method: 'get', path: '/api/v2/webhooks/events', summary: 'Eventos de webhook', description: 'Lista os tipos de evento e o contrato de assinatura disponível.' },
  { method: 'post', path: '/api/v2/auth/bootstrap', summary: 'Preparar conta', description: 'Cria de forma idempotente o perfil e o espaço pessoal do usuário autenticado.', requiresAuthentication: true, requestBody: 'account-bootstrap' },
  { method: 'get', path: '/api/v2/auth/me', summary: 'Consultar conta', description: 'Retorna o perfil, o espaço pessoal e o vínculo do usuário autenticado.', requiresAuthentication: true },
  { method: 'get', path: '/api/v2/billing/account', summary: 'Consultar conta de billing', description: 'Retorna saldo, pacotes, custo das operações ForgeLex e recarga automática.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/billing/transactions', summary: 'Listar extrato', description: 'Lista lançamentos, compras, pagamentos e solicitações de reembolso do tenant.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/billing/invoices', summary: 'Listar faturas', description: 'Lista faturas internas e recibos do provedor de pagamento disponíveis.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/billing/checkout', summary: 'Criar Checkout de créditos', description: 'Cria uma compra avulsa pré-paga em BRL.', scopes: ['billing:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/billing/purchases/{purchaseId}', summary: 'Consultar compra', description: 'Consulta o estado de uma compra do tenant autenticado.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/billing/payment-methods', summary: 'Listar métodos de pagamento', description: 'Lista somente metadados públicos dos cartões salvos.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/billing/payment-methods/setup', summary: 'Preparar método de pagamento', description: 'Prepara um método de pagamento quando o provider ativo oferecer suporte.', scopes: ['billing:write'], requestBody: 'object' },
  { method: 'put', path: '/api/v2/billing/auto-recharge', summary: 'Configurar recarga automática', description: 'Habilita ou desabilita recarga automática no limite fixo de R$ 5.', scopes: ['billing:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/billing/refund-requests', summary: 'Solicitar reembolso', description: 'Registra solicitação manual dentro do prazo de sete dias e limitada ao saldo não consumido.', scopes: ['billing:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/webhooks/mercadopago', summary: 'Receber webhook Mercado Pago', description: 'Recebe notificações do Mercado Pago e valida a assinatura HMAC do provedor.' },
  { method: 'get', path: '/api/v2/admin/billing/refund-requests', summary: 'Listar solicitações de reembolso', description: 'Consulta administrativa de solicitações de reembolso.', scopes: ['billing:admin'] },
  { method: 'post', path: '/api/v2/admin/billing/refund-requests/{requestId}/review', summary: 'Revisar solicitação de reembolso', description: 'Aprova ou rejeita manualmente uma solicitação de reembolso.', scopes: ['billing:admin'], requestBody: 'object' },
  { method: 'get', path: '/readyz', summary: 'Readiness', description: 'Verifica se as dependências locais necessárias estão disponíveis.' },
  { method: 'get', path: '/metrics', summary: 'Métricas internas', description: 'Retorna contadores internos de requisições e latência.' },
  { method: 'get', path: '/metrics/prometheus', summary: 'Métricas Prometheus', description: 'Expõe as métricas internas em formato compatível com scrape do Prometheus.' },
  { method: 'get', path: '/api/v2/webhooks/endpoints', summary: 'Listar destinos de webhook', description: 'Lista destinos ativos e revogados do tenant.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/webhooks/endpoints', summary: 'Cadastrar destino de webhook', description: 'Cadastra um destino e retorna o segredo uma única vez.', scopes: ['billing:read'], requestBody: 'object' },
  { method: 'delete', path: '/api/v2/webhooks/endpoints/{endpointId}', summary: 'Revogar destino de webhook', description: 'Revoga um destino sem apagar seu histórico.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/webhooks/endpoints/{endpointId}/test', summary: 'Testar destino de webhook', description: 'Enfileira evento de teste para o destino autenticado.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/webhooks/deliveries', summary: 'Listar entregas de webhook', description: 'Lista entregas e tentativas do tenant.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/webhooks/deliveries/{deliveryId}/retry', summary: 'Reprocessar entrega de webhook', description: 'Recoloca uma entrega falha na fila.', scopes: ['billing:read'] },
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
  { method: 'get', path: '/api/v2/matters/{matterId}/issues', summary: 'Listar questões jurídicas', description: 'Lista as questões jurídicas delimitadas para o caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/issues', summary: 'Registrar questão jurídica', description: 'Registra uma questão jurídica para orientar a pesquisa do caso.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/theses', summary: 'Listar teses jurídicas', description: 'Lista as teses jurídicas e seus vínculos explícitos no caso.', scopes: ['matter:read'] },
  { method: 'get', path: '/api/v2/matters/{matterId}/thesis-map', summary: 'Montar mapa de teses', description: 'Retorna questões e teses persistidas para orientar a redação do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/theses', summary: 'Registrar tese jurídica', description: 'Registra uma tese com vínculos a questões, fatos, provas e authorities do caso.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/research-memos', summary: 'Listar research memos', description: 'Lista os memorandos de pesquisa do caso e seu estado de revisão humana.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/research-memos', summary: 'Gerar research memo', description: 'Cruza questões e contexto do matter com pesquisa jurisprudencial faturável.', scopes: ['matter:write', 'research:read'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/matters/{matterId}/research-memos/{memoId}/review', summary: 'Revisar research memo', description: 'Registra a decisão humana sobre o memorando de pesquisa.', scopes: ['matter:write'], requestBody: 'object' },
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
  { method: 'post', path: '/mcp', summary: 'Gateway MCP remoto', description: 'Aceita JSON-RPC 2.0 e expõe somente o pacote MCP externo allowlisted, compartilhando a infraestrutura jurisprudencial da API REST.', scopes: ['mcp'] },
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
  if (route.requiresAuthentication || (route.scopes && route.scopes.length > 0)) {
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
          : route.requestBody === 'account-bootstrap'
            ? { type: 'object', required: ['displayName'], properties: { displayName: { type: 'string', minLength: 2, maxLength: 120 } } }
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
      description: 'Contrato gerado a partir das duas superfícies de acesso à mesma infraestrutura jurisprudencial do ForgeLex: API REST para integrações próprias e MCP para ChatGPT ou Claude. O ForgeLex não fornece modelo de IA nem cobra tokens; resultados jurídicos preservam a proveniência disponível e nenhuma rota presume efeito externo.',
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
