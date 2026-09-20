# Fase 3 — equivalência REST/MCP do Legal Tool Gateway

## Escopo e invariantes

O ForgeLex expõe somente as três capabilities jurisprudenciais do STJ por API
REST e MCP remoto. Os dois adaptadores usam o `ToolRegistry` e os contratos
do `LegalToolGateway`; ChatGPT/OpenAI, Claude/Anthropic e outros hosts retêm
modelo, raciocínio e contexto. O ForgeLex não recebe chaves de modelo, não
acessa conversas, arquivos ou histórico e não cobra tokens. Somente
`research.search_case_law` é faturável (R$ 0,20); todas as rejeições de
capability, entitlement ou tribunal precedem o ledger.

Não haverá nova migration, tribunal, Agent Core como dependência, provider de
modelo, deploy, push ou commit nesta fase local.

## Arquivos e responsabilidades

- `apps/api/src/distribution/openapi.ts`: schemas reutilizáveis e concretos,
  respostas estruturadas, headers comerciais e contrato de capabilities.
- `apps/api/src/app.ts`: metadados OAuth derivados do ambiente e sinal de
  cancelamento HTTP encaminhado às tools REST e MCP.
- `packages/mcp-server/src/mcp-handler.ts`: contexto MCP tipado com
  `AbortSignal`, propagado ao `ToolRegistry` sem criar controlador isolado.
- `packages/agent-core/src/registry/tool-registry.ts`: cancelamento já
  ocorrido é tratado imediatamente como `SESSION_CANCELLED`.
- testes de API, MCP e registry: contrato, configuração OAuth, paridade,
  privacidade e cancelamento.

## Tarefa 1 — contratos OpenAPI concretos (TDD)

1. Em `apps/api/src/app.test.ts`, acrescente asserções que falham para:
   `components.schemas` contendo request/response da pesquisa, autoridade,
   tribunal e erro; `search-case-law` referenciando o schema de pesquisa;
   as respostas `400`, `401`, `402`, `403`, `409`, `422` e `503`; e os quatro
   headers comerciais exigidos no `200` da pesquisa.
2. Execute o teste focal e confirme a falha por schemas genéricos/ausentes.
3. Em `apps/api/src/distribution/openapi.ts`, substitua `requestBody:
   'object'` por identificadores de schemas reais de cada rota pública.
   Exponha `components.schemas` com objetos fechados o suficiente para os
   payloads documentados; defina `ErrorResponse`, `TribunalCapability`,
   `SearchCaseLawRequest`, `AuthorityLookupRequest` e respostas de pesquisa.
   Todos os request bodies devem usar `$ref`; nenhuma rota preserva
   `additionalProperties: true` como schema genérico.
4. Documente a matriz de erros nas operações autenticadas e os headers de
   billing no sucesso da tool faturável. Mantenha `x-forgelex-tool-contract`
   como fonte do contrato sem copiar a versão.
5. Reexecute o teste focal e a suíte da API.

## Tarefa 2 — metadados OAuth configuráveis (TDD)

1. Em `apps/api/src/app.test.ts`, crie um app com
   `FORGELEX_MCP_RESOURCE_URL` e `FORGELEX_OAUTH_AUTHORIZATION_SERVERS`
   configurados. A nova asserção deve esperar URLs normalizadas, sem a
   configuração padrão pública fixa.
2. Execute o teste focal e confirme a falha pelo endpoint fixo.
3. Extraia no módulo de distribuição uma função pura que leia o ambiente,
   normalize a URL do recurso e divida a lista de authorization servers por
   vírgula, rejeitando lista vazia por fallback seguro de desenvolvimento.
4. Faça `/.well-known/oauth-protected-resource` usar essa configuração.
   Mantenha scopes e `bearer_methods_supported` explícitos e compatíveis com
   a autenticação existente.
5. Reexecute o teste focal e a suíte da API.

## Tarefa 3 — cancelamento ponta a ponta (TDD)

1. Em `packages/agent-core/src/registry/tool-registry.test.ts`, adicione caso
   para um `AbortSignal` já abortado; ele deve falhar antes da implementação e
   resultar em `DomainError` com `SESSION_CANCELLED`.
2. Em `packages/mcp-server/src/mcp-server.test.ts`, adicione uma chamada
   `tools/call` com sinal já abortado; deve falhar antes da implementação e
   retornar JSON-RPC estruturado `SESSION_CANCELLED`, sem uso financeiro.
3. Atualize o registry para verificar `abortSignal.aborted` antes da corrida
   de timeout/execução e remover listeners após a resolução. Atualize o
   handler MCP para aceitar `abortSignal` no contexto e passar exatamente
   esse sinal ao registry.
4. Em `apps/api/src/app.ts`, crie o sinal de ciclo de vida a partir da
   conexão HTTP e passe-o a `executeLegalGatewayTool` e ao handler MCP.
   O sinal só cancela quando a requisição é abortada/encerrada antes da
   resposta; listeners são removidos após a resposta. Não introduza contexto
   do host além dos argumentos já declarados.
5. Acrescente teste de integração de rota para o helper de sinal, sem depender
   de uma conexão externa real, e então execute testes focalizados de API,
   MCP e registry.

## Tarefa 4 — paridade, documentação e gate local

1. Amplie os testes REST/MCP existentes para comparar payload jurídico,
   proveniência, modo de billing, replay e erro de tribunal não suportado;
   cubra explicitamente que campos `conversation`, `files` e `history` não
   chegam à execução legal.
2. Cubra saldo insuficiente e provider indisponível sem débito, além do
   isolamento de tenant e da emissão de auditoria/webhook já integrada ao
   ledger.
3. Atualize `STATUS_VALIDACAO.md` somente após as verificações, registrando
   commit de checkout, comandos, resultado e limites: sem migration remota,
   deploy, provider/modelo ou expansão de tribunal.
4. Execute `pnpm typecheck`, `pnpm test`,
   `pnpm --filter @forgelex/web build` e `git diff --check`. O gate só fecha
   se todos passarem, sem alegar homologação externa.

## Foco de revisão

- Um corpo REST fora do schema não pode voltar a ser documentado como objeto
  arbitrário.
- Requisição cancelada antes da execução não pode debitar nem criar evento de
  uso.
- OAuth configurado não pode retornar URL pública fixa ou servidor vazio.
- MCP não pode aceitar private context como argumento com efeito jurídico.
- Uma capability/court não permitida não pode alcançar o ledger, inclusive
  quando chamada pelo MCP.
