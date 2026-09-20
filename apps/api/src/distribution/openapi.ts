import { EXTERNAL_MCP_TOOL_NAMES } from '@forgelex/mcp-server';
import { getLegalToolContract } from '@forgelex/legal-tools';

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
  requiresIdempotencyKey?: boolean;
  responseSchema?: keyof typeof OPENAPI_SCHEMAS;
}

const OPENAPI_SCHEMAS = {
  SearchCaseLawRequest: {
    type: 'object', additionalProperties: false, required: ['query'],
    properties: { query: { type: 'string', minLength: 2 }, court: { type: 'string', enum: ['STJ'] }, limit: { type: 'integer', minimum: 1, maximum: 20 } },
  },
  AuthorityLookupRequest: {
    type: 'object', additionalProperties: false, required: ['court', 'processNumber'],
    properties: { court: { type: 'string', enum: ['STJ'] }, processNumber: { type: 'string', minLength: 1 }, judgmentDate: { type: 'string', format: 'date' } },
  },
  TribunalCapability: {
    type: 'object', additionalProperties: false, required: ['code', 'searchable', 'verifiable', 'status', 'providerId'],
    properties: { code: { type: 'string' }, searchable: { type: 'boolean' }, verifiable: { type: 'boolean' }, status: { type: 'string', enum: ['ONLINE', 'UNAVAILABLE'] }, providerId: { type: ['string', 'null'] } },
  },
  ErrorResponse: {
    type: 'object', additionalProperties: true, required: ['error', 'message'],
    properties: { error: { type: 'string' }, message: { type: 'string' }, details: { type: 'object' } },
  },
  AccountBootstrapRequest: { type: 'object', additionalProperties: false, required: ['displayName'], properties: { displayName: { type: 'string', minLength: 2, maxLength: 120 } } },
  ApiKeyRequest: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', minLength: 1 }, scopes: { type: 'array', items: { type: 'string' } } } },
  BillingCheckoutRequest: { type: 'object', additionalProperties: false, properties: { packageId: { type: 'string' }, amountCents: { type: 'integer', minimum: 2500, maximum: 50000 } } },
  PaymentMethodSetupRequest: { type: 'object', additionalProperties: false, properties: { returnUrl: { type: 'string', format: 'uri' } } },
  AutoRechargeRequest: { type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
  RefundRequest: { type: 'object', additionalProperties: false, required: ['purchaseId'], properties: { purchaseId: { type: 'string' }, reason: { type: 'string' } } },
  RefundReviewRequest: { type: 'object', additionalProperties: false, required: ['decision'], properties: { decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, reason: { type: 'string' } } },
  WebhookEndpointRequest: { type: 'object', additionalProperties: false, required: ['url', 'eventTypes'], properties: { url: { type: 'string', format: 'uri' }, eventTypes: { type: 'array', minItems: 1, items: { type: 'string' } } } },
  MatterRequest: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string', minLength: 1 }, practiceArea: { type: 'string' }, jurisdiction: { type: 'string' } } },
  MatterDocumentRequest: { type: 'object', additionalProperties: false, required: ['title', 'originalFilename', 'content'], properties: { title: { type: 'string' }, originalFilename: { type: 'string' }, mimeType: { type: 'string' }, content: { type: 'string' } } },
  AuthoritySaveRequest: { type: 'object', additionalProperties: false, required: ['authority'], properties: { authority: { type: 'object' } } },
  FactRequest: { type: 'object', additionalProperties: false, required: ['statement'], properties: { statement: { type: 'string' }, occurredAt: { type: 'string', format: 'date-time' } } },
  EvidenceRequest: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' }, description: { type: 'string' } } },
  FactSupportRequest: { type: 'object', additionalProperties: false, properties: { evidenceId: { type: 'string' }, anchorId: { type: 'string' } }, minProperties: 1 },
  TimelineEventRequest: { type: 'object', additionalProperties: false, required: ['title', 'occurredAt'], properties: { title: { type: 'string' }, occurredAt: { type: 'string', format: 'date-time' }, description: { type: 'string' } } },
  LegalIssueRequest: { type: 'object', additionalProperties: false, required: ['statement'], properties: { statement: { type: 'string' }, status: { type: 'string', enum: ['OPEN', 'ADDRESSED', 'DISMISSED'] } } },
  ThesisRequest: { type: 'object', additionalProperties: false, required: ['statement'], properties: { statement: { type: 'string' }, issueId: { type: 'string' } } },
  ResearchMemoRequest: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, query: { type: 'string' } } },
  ResearchMemoReviewRequest: { type: 'object', additionalProperties: false, required: ['decision'], properties: { decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, notes: { type: 'string' } } },
  DraftRequest: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' }, content: { type: 'string' } } },
  DraftVersionRequest: { type: 'object', additionalProperties: false, required: ['content'], properties: { content: { type: 'string' } } },
  DraftReviewRequest: { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { type: 'string' } } },
  DraftApprovalRequest: { type: 'object', additionalProperties: false, required: ['versionId'], properties: { versionId: { type: 'string' } } },
  DraftApprovalResolutionRequest: { type: 'object', additionalProperties: false, required: ['token', 'decision'], properties: { token: { type: 'string' }, decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] }, reason: { type: 'string' } } },
  ResearchHistoryResponse: {
    type: 'object', additionalProperties: false, required: ['items', 'total'],
    properties: {
      items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'operationId', 'query', 'court', 'resultCount', 'billingMode', 'chargedCents', 'createdAt'], properties: { id: { type: 'string' }, operationId: { type: 'string' }, query: { type: 'string' }, court: { type: 'string' }, resultCount: { type: 'integer' }, billingMode: { type: 'string', enum: ['FREE', 'METERED'] }, chargedCents: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' } } } },
      total: { type: 'integer', minimum: 0 },
    },
  },
  ReviewQueueResponse: {
    type: 'object', additionalProperties: false, required: ['items', 'total'],
    properties: {
      items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'kind', 'matterId', 'targetId', 'title', 'summary', 'status', 'requestedAt', 'actionUrl'], properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['DRAFT', 'RESEARCH_MEMO'] }, matterId: { type: 'string' }, targetId: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] }, requestedAt: { type: 'string', format: 'date-time' }, decidedAt: { type: 'string', format: 'date-time' }, actionUrl: { type: 'string' } } } },
      total: { type: 'integer', minimum: 0 },
    },
  },
  OperationalStatusResponse: {
    type: 'object', additionalProperties: false, required: ['status', 'service', 'checks'],
    properties: { status: { type: 'string', enum: ['ready', 'not_ready'] }, service: { type: 'string' }, checks: { type: 'object', additionalProperties: { type: 'boolean' } } },
  },
} as const;

const OBJECT_REQUEST_SCHEMA_BY_PATH: Readonly<Record<string, keyof typeof OPENAPI_SCHEMAS>> = {
  '/api/v2/billing/checkout': 'BillingCheckoutRequest', '/api/v2/billing/payment-methods/setup': 'PaymentMethodSetupRequest', '/api/v2/billing/auto-recharge': 'AutoRechargeRequest', '/api/v2/billing/refund-requests': 'RefundRequest', '/api/v2/admin/billing/refund-requests/{requestId}/review': 'RefundReviewRequest', '/api/v2/webhooks/endpoints': 'WebhookEndpointRequest', '/api/v2/matters': 'MatterRequest', '/api/v2/matters/{matterId}/documents': 'MatterDocumentRequest', '/api/v2/matters/{matterId}/authorities': 'AuthoritySaveRequest', '/api/v2/matters/{matterId}/facts': 'FactRequest', '/api/v2/matters/{matterId}/evidence': 'EvidenceRequest', '/api/v2/matters/{matterId}/facts/{factId}/support': 'FactSupportRequest', '/api/v2/matters/{matterId}/timeline': 'TimelineEventRequest', '/api/v2/matters/{matterId}/issues': 'LegalIssueRequest', '/api/v2/matters/{matterId}/theses': 'ThesisRequest', '/api/v2/matters/{matterId}/research-memos': 'ResearchMemoRequest', '/api/v2/matters/{matterId}/research-memos/{memoId}/review': 'ResearchMemoReviewRequest', '/api/v2/matters/{matterId}/drafts': 'DraftRequest', '/api/v2/matters/{matterId}/drafts/{draftId}/versions': 'DraftVersionRequest', '/api/v2/matters/{matterId}/drafts/{draftId}/review': 'DraftReviewRequest', '/api/v2/matters/{matterId}/drafts/{draftId}/approval': 'DraftApprovalRequest', '/api/v2/draft-approvals/resolve': 'DraftApprovalResolutionRequest',
};

export const PUBLIC_API_ROUTES: readonly PublicApiRouteDefinition[] = [
  { method: 'get', path: '/health', summary: 'Healthcheck', description: 'Verifica a disponibilidade do serviço.' },
  { method: 'get', path: '/healthz', summary: 'Liveness', description: 'Verifica se o processo do serviço está ativo.' },
  { method: 'get', path: '/.well-known/oauth-protected-resource', summary: 'Metadados do recurso protegido', description: 'Publica os metadados OAuth do recurso MCP.' },
  { method: 'get', path: '/openapi.json', summary: 'Especificação OpenAPI', description: 'Retorna esta especificação gerada.' },
  { method: 'get', path: '/api/v2/openapi.json', summary: 'Especificação OpenAPI v2', description: 'Retorna esta especificação gerada.' },
  { method: 'get', path: '/api/v2/webhooks/events', summary: 'Eventos de webhook', description: 'Lista os tipos de evento e o contrato de assinatura disponível.' },
  { method: 'post', path: '/api/v2/auth/bootstrap', summary: 'Preparar conta', description: 'Cria de forma idempotente o perfil e o espaço pessoal do usuário autenticado.', requiresAuthentication: true, requestBody: 'account-bootstrap' },
  { method: 'get', path: '/api/v2/auth/me', summary: 'Consultar conta', description: 'Retorna o perfil, o espaço pessoal e o vínculo do usuário autenticado.', requiresAuthentication: true },
  { method: 'get', path: '/api/v2/billing/account', summary: 'Consultar conta de billing', description: 'Retorna saldo, pacotes, custo das operações ForgeLex e recarga automática.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/billing/transactions', summary: 'Listar extrato', description: 'Lista lançamentos, compras, pagamentos e solicitações de reembolso do tenant.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/billing/invoices', summary: 'Listar faturas', description: 'Lista faturas internas e recibos do provedor de pagamento disponíveis.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/billing/checkout', summary: 'Criar Checkout de créditos', description: 'Cria uma compra avulsa pré-paga em BRL.', scopes: ['billing:write'], requestBody: 'object', requiresIdempotencyKey: true },
  { method: 'get', path: '/api/v2/billing/purchases/{purchaseId}', summary: 'Consultar compra', description: 'Consulta o estado de uma compra do tenant autenticado.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/billing/payment-methods', summary: 'Listar métodos de pagamento', description: 'Lista somente metadados públicos dos cartões salvos.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/billing/payment-methods/setup', summary: 'Preparar método de pagamento', description: 'Prepara um método de pagamento quando o provider ativo oferecer suporte.', scopes: ['billing:write'], requestBody: 'object', requiresIdempotencyKey: true },
  { method: 'put', path: '/api/v2/billing/auto-recharge', summary: 'Configurar recarga automática', description: 'Habilita ou desabilita recarga automática no limite fixo de R$ 5.', scopes: ['billing:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/billing/refund-requests', summary: 'Solicitar reembolso', description: 'Registra solicitação manual dentro do prazo de sete dias e limitada ao saldo não consumido.', scopes: ['billing:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/webhooks/mercadopago', summary: 'Receber webhook Mercado Pago', description: 'Recebe notificações do Mercado Pago e valida a assinatura HMAC do provedor.' },
  { method: 'get', path: '/api/v2/admin/billing/refund-requests', summary: 'Listar solicitações de reembolso', description: 'Consulta administrativa de solicitações de reembolso.', scopes: ['billing:admin'] },
  { method: 'post', path: '/api/v2/admin/billing/refund-requests/{requestId}/review', summary: 'Revisar solicitação de reembolso', description: 'Aprova ou rejeita manualmente uma solicitação de reembolso.', scopes: ['billing:admin'], requestBody: 'object' },
  { method: 'get', path: '/readyz', summary: 'Readiness', description: 'Verifica se as dependências locais necessárias estão disponíveis.', responseSchema: 'OperationalStatusResponse' },
  { method: 'get', path: '/metrics', summary: 'Métricas internas', description: 'Retorna contadores internos de requisições e latência.', requiresAuthentication: true },
  { method: 'get', path: '/metrics/prometheus', summary: 'Métricas Prometheus', description: 'Expõe as métricas internas em formato compatível com scrape do Prometheus.', requiresAuthentication: true },
  { method: 'get', path: '/api/v2/webhooks/endpoints', summary: 'Listar destinos de webhook', description: 'Lista destinos ativos e revogados do tenant.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/webhooks/endpoints', summary: 'Cadastrar destino de webhook', description: 'Cadastra um destino e retorna o segredo uma única vez.', scopes: ['billing:read'], requestBody: 'object' },
  { method: 'delete', path: '/api/v2/webhooks/endpoints/{endpointId}', summary: 'Revogar destino de webhook', description: 'Revoga um destino sem apagar seu histórico.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/webhooks/endpoints/{endpointId}/test', summary: 'Testar destino de webhook', description: 'Enfileira evento de teste para o destino autenticado.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/webhooks/deliveries', summary: 'Listar entregas de webhook', description: 'Lista entregas e tentativas do tenant.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/webhooks/deliveries/{deliveryId}/retry', summary: 'Reprocessar entrega de webhook', description: 'Recoloca uma entrega falha na fila.', scopes: ['billing:read'] },
  { method: 'get', path: '/api/v2/tribunals', summary: 'Listar tribunais', description: 'Retorna o catálogo com capabilities derivadas do registro de provedores. Durante a estabilização inicial, somente o STJ é pesquisável; os demais tribunais permanecem visíveis como não habilitados.', scopes: ['research:read'] },
  { method: 'get', path: '/api/v2/research/history', summary: 'Listar histórico de pesquisa', description: 'Lista pesquisas concluídas do usuário autenticado no tenant atual.', scopes: ['research:read'], responseSchema: 'ResearchHistoryResponse' },
  { method: 'get', path: '/api/v2/review-queue', summary: 'Listar fila de revisão', description: 'Lista drafts e memorandos submetidos à revisão humana sem expor tokens ou conteúdo integral.', scopes: ['matter:read'], responseSchema: 'ReviewQueueResponse' },
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
  { method: 'post', path: '/api/v2/matters/{matterId}/research-memos', summary: 'Gerar research memo', description: 'Cruza questões e contexto do matter com pesquisa jurisprudencial do ForgeLex. O memo não tem preço próprio nesta fase: a operação é gratuita, embora a chave seja obrigatória para rastreabilidade; a consulta usa somente a infraestrutura STJ habilitada nesta fase.', scopes: ['matter:write', 'research:read'], requestBody: 'object', requiresIdempotencyKey: true },
  { method: 'post', path: '/api/v2/matters/{matterId}/research-memos/{memoId}/review', summary: 'Revisar research memo', description: 'Registra a decisão humana sobre o memorando de pesquisa.', scopes: ['matter:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/drafts', summary: 'Listar rascunhos', description: 'Lista rascunhos do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts', summary: 'Criar rascunho', description: 'Cria rascunho estruturado.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/drafts/{draftId}', summary: 'Consultar rascunho', description: 'Retorna o rascunho e sua versão corrente.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts/{draftId}/versions', summary: 'Criar versão do rascunho', description: 'Cria uma versão imutável do rascunho.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts/{draftId}/review', summary: 'Revisar rascunho', description: 'Executa revisão de citações, suporte factual ou adversarial.', scopes: ['matter:read'], requestBody: 'object' },
  { method: 'post', path: '/api/v2/matters/{matterId}/drafts/{draftId}/approval', summary: 'Solicitar aprovação', description: 'Solicita aprovação humana para uma versão.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/matters/{matterId}/draft-approvals', summary: 'Listar aprovações', description: 'Lista solicitações de aprovação do caso.', scopes: ['matter:read'] },
  { method: 'post', path: '/api/v2/draft-approvals/resolve', summary: 'Resolver aprovação', description: 'Registra decisão humana usando token efêmero.', scopes: ['draft:write'], requestBody: 'object' },
  { method: 'get', path: '/api/v2/jurisprudencias', summary: 'Pesquisar jurisprudência', description: 'Alias compatível da pesquisa faturável na infraestrutura STJ por R$ 0,20 por execução válida. q e Idempotency-Key são obrigatórios; uma consulta sem resultados continua sendo uma operação válida e faturável.', scopes: ['research:read'], toolName: 'research.search_case_law', requiresIdempotencyKey: true },
  { method: 'post', path: '/api/v2/research/search-case-law', summary: 'Pesquisar jurisprudência', description: 'Executa a capability research.search_case_law na infraestrutura STJ com o mesmo serviço usado pelo MCP. A operação é faturável por R$ 0,20 por execução válida, inclusive sem resultados. Exige Idempotency-Key e rejeita tribunais não habilitados com 422.', scopes: ['research:read'], toolName: 'research.search_case_law', requestBody: 'search-case-law', requiresIdempotencyKey: true },
  { method: 'post', path: '/api/v2/research/get-authority', summary: 'Obter autoridade', description: 'Obtém uma autoridade STJ identificada e devolve o status de verificação e a proveniência. A operação é gratuita e não gera débito nesta fase; Idempotency-Key é exigida apenas para rastreabilidade.', scopes: ['research:read'], toolName: 'research.get_authority', requestBody: 'verify-authority', requiresIdempotencyKey: true },
  { method: 'post', path: '/api/v2/research/verify-authority', summary: 'Verificar autoridade', description: 'Executa a capability research.verify_authority na infraestrutura STJ com proveniência. A operação é gratuita e não gera débito nesta fase; Idempotency-Key é exigida apenas para rastreabilidade.', scopes: ['research:read'], toolName: 'research.verify_authority', requestBody: 'verify-authority', requiresIdempotencyKey: true },
  { method: 'get', path: '/api/v2/api-keys', summary: 'Listar chaves de API', description: 'Lista somente metadados das chaves do tenant.', scopes: ['billing:read'] },
  { method: 'post', path: '/api/v2/api-keys', summary: 'Criar chave de API', description: 'Cria chave e retorna o segredo uma única vez.', scopes: ['billing:read'], requestBody: 'api-key' },
  { method: 'delete', path: '/api/v2/api-keys/{keyId}', summary: 'Revogar chave de API', description: 'Revoga uma chave do tenant autenticado.', scopes: ['billing:read'] },
  { method: 'post', path: '/mcp', summary: 'Gateway MCP remoto', description: 'Aceita JSON-RPC 2.0 e expõe somente o pacote MCP externo allowlisted, compartilhando a infraestrutura jurisprudencial da API REST. tools/call exige Idempotency-Key e o MCP não acessa conversas, arquivos ou histórico do host.', scopes: ['mcp'] },
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
  if (route.responseSchema) {
    const responses = operation.responses as Record<string, Record<string, unknown>>;
    responses['200'] = {
      ...responses['200'],
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${route.responseSchema}` } } },
    };
  }
  if (route.toolName || route.path === '/api/v2/tribunals') {
    (operation.responses as Record<string, unknown>)['422'] = { description: 'Tribunal não habilitado para a capability solicitada.' };
  }
  const parameters = pathParameters(route.path);
  if (parameters.length > 0) operation.parameters = parameters;
  if (route.requiresIdempotencyKey) {
    const header = {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'Chave fornecida pelo cliente para rastreabilidade. Na busca, permite replay financeiro sem novo débito; nas operações gratuitas, não cria replay financeiro.',
      schema: { type: 'string', minLength: 1 },
    };
    operation.parameters = [...(Array.isArray(operation.parameters) ? operation.parameters : []), header];
  }
  if (route.requiresAuthentication || (route.scopes && route.scopes.length > 0)) {
    operation.security = [{ BearerAuth: [] }];
    operation['x-forgelex-required-scopes'] = route.scopes;
  }
  if (route.toolName) operation['x-forgelex-tool'] = route.toolName;
  if (route.toolName) {
    const contract = getLegalToolContract(route.toolName);
    if (contract) operation['x-forgelex-tool-contract'] = contract;
  }
  const isBillingRoute = Boolean(route.toolName) || route.path.endsWith('/research-memos');
  if (isBillingRoute) {
    const isMetered = route.toolName === 'research.search_case_law';
    const headers: Record<string, unknown> = {
      'X-ForgeLex-Billing-Mode': {
        description: `Modo de cobrança efetivo: ${isMetered ? 'METERED' : 'FREE'}.`,
        schema: { type: 'string', enum: [isMetered ? 'METERED' : 'FREE'] },
      },
      'X-Credits-Charged': {
        description: isMetered ? 'Créditos debitados pela execução.' : 'Sempre 0 nas operações gratuitas desta fase.',
        schema: { type: 'number', format: 'double' },
      },
      'X-Remaining-Balance': {
        description: 'Saldo de créditos restante após a operação.',
        schema: { type: 'number', format: 'double' },
      },
      'X-Idempotent-Replay': {
        description: isMetered ? 'Indica replay financeiro idempotente.' : 'Sempre false: operações gratuitas não têm replay financeiro.',
        schema: { type: 'string', enum: ['true', 'false'] },
      },
    };
    if (isMetered) {
      headers['X-Billable-Units'] = { description: 'Unidades faturáveis da execução.', schema: { type: 'string' } };
      headers['X-Credit-Cost-Per-Unit'] = { description: 'Custo por unidade em BRL.', schema: { type: 'string', example: '0.20' } };
    }
    (operation.responses as Record<string, unknown>)['200'] = {
      description: 'Operação concluída.',
      headers,
    };
  }
  if (route.requestBody) {
    const schema = route.requestBody === 'search-case-law'
      ? { $ref: '#/components/schemas/SearchCaseLawRequest' }
      : route.requestBody === 'verify-authority'
        ? { $ref: '#/components/schemas/AuthorityLookupRequest' }
        : route.requestBody === 'api-key'
          ? { $ref: '#/components/schemas/ApiKeyRequest' }
          : route.requestBody === 'account-bootstrap'
            ? { $ref: '#/components/schemas/AccountBootstrapRequest' }
          : { $ref: `#/components/schemas/${OBJECT_REQUEST_SCHEMA_BY_PATH[route.path]}` };
    operation.requestBody = { required: true, content: { 'application/json': { schema } } };
  }
  if (route.requiresAuthentication || (route.scopes && route.scopes.length > 0)) {
    Object.assign(operation.responses as Record<string, unknown>, {
      '402': { description: 'Saldo de créditos insuficiente para a operação faturável.' },
      '409': { description: 'Conflito de idempotência ou estado do recurso.' },
      '404': { description: 'Recurso não localizado no tenant autenticado.' },
      '503': { description: 'Infraestrutura jurisprudencial ou provider indisponível.' },
    });
  }
  for (const status of ['400', '401', '402', '403', '404', '409', '422', '503']) {
    const responses = operation.responses as Record<string, Record<string, unknown>>;
    if (responses[status]) {
      responses[status] = {
        ...responses[status],
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      };
    }
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
      description: 'Contrato gerado a partir das duas superfícies de acesso à mesma infraestrutura jurisprudencial do ForgeLex: API REST para integrações próprias e MCP para ChatGPT ou Claude. Nesta fase, somente research.search_case_law é faturável por R$ 0,20; obtenção, verificação e memo são gratuitos. O ForgeLex não fornece modelo de IA nem cobra tokens; resultados jurídicos preservam a proveniência disponível e nenhuma rota presume efeito externo.',
    },
    servers: [{ url: serverUrl.replace(/\/$/, '') }],
    tags: [{ name: 'Research' }, { name: 'Matters' }, { name: 'Drafts' }, { name: 'Distribution' }, { name: 'MCP' }],
    paths,
    components: {
      schemas: OPENAPI_SCHEMAS,
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API key or OAuth access token' },
      },
    },
    'x-forgelex-generated-from': 'apps/api/src/distribution/openapi.ts',
    'x-forgelex-external-mcp-tools': [...EXTERNAL_MCP_TOOL_NAMES],
  };
}
