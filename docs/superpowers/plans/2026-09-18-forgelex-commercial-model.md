# Correção do modelo comercial do ForgeLex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o código, os contratos, a documentação e a interface refletirem que o ForgeLex vende operações da própria infraestrutura jurisprudencial por API REST e MCP, sem fornecer modelos de IA ou cobrar tokens.

**Architecture:** Remover o catálogo de preços de modelos do pacote de billing e da resposta da conta, mantendo o ledger como medidor e cobrador de operações jurídicas próprias. API REST e MCP continuarão compartilhando `ResearchService`, autenticação, ferramentas, saldo e débito idempotente; os adapters locais de providers permanecerão fora do runtime comercial e sem relação com billing.

**Tech Stack:** TypeScript, Fastify, Vitest, Drizzle ORM, SQLite/libSQL, React, OpenAPI gerado, pnpm.

**Spec:** Requisitos comerciais fornecidos pelo usuário nesta tarefa.

## Global Constraints

- Não fazer commit, push, deploy ou migration remota.
- Preservar as alterações locais existentes e a migration `billing-ledger-0004-provider-neutral-identifiers`.
- Não alterar as ferramentas jurídicas, autenticação, API key, MCP, ledger, créditos, compras, reembolsos ou Mercado Pago.
- O único preço explicitamente comunicado é `JURISPRUDENCE_SEARCH_COST_CENTS = 20` para a operação própria de busca jurisprudencial.
- API key/Bearer é credencial de autenticação; não é unidade de IA faturável.
- O MCP não recebe nem consulta conversas, arquivos ou histórico do usuário; recebe apenas a chamada JSON-RPC autenticada e os argumentos da ferramenta.

---

### Task 1: Retirar pricing de modelos do contrato de billing

**Files:**
- Modify: `apps/api/src/billing/billing-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `.env.example`
- Modify: `packages/billing-ledger/src/billing-rules.ts`
- Modify: `packages/billing-ledger/src/billing-rules.test.ts`
- Modify: `packages/billing-ledger/src/index.ts`
- Delete: `packages/billing-ledger/src/model-pricing.ts`
- Delete: `packages/billing-ledger/src/model-pricing.test.ts`

**Interfaces:**
- Consumes: `JURISPRUDENCE_SEARCH_COST_CENTS`, `CREDIT_PACKAGES` and the existing billing account route.
- Produces: billing account responses containing only saldo, pacotes, preço da operação própria, recarga e dados financeiros; nenhum contrato de catálogo de modelos.

- [x] **Step 1: Write the failing regression test**

  No primeiro teste da conta de billing, configurar `FORGELEX_MODEL_PRICING_JSON` com uma tarifa fictícia e afirmar que a resposta não possui `modelPricing`. O teste deve continuar afirmando BRL, pacotes e R$ 0,20 por busca.

- [x] **Step 2: Run the focused test to verify it fails**

  Run: `pnpm exec vitest run apps/api/src/billing/billing-routes.test.ts -t "não expõe catálogo de preços de modelos"`

  Expected: FAIL porque `buildApp` ainda lê `FORGELEX_MODEL_PRICING_JSON` e adiciona `modelPricing` à resposta.

- [x] **Step 3: Remove the production pricing path**

  Remover `ModelPricingCatalog` do bootstrap da API e o campo `modelPricing` da rota. Excluir os tipos, cálculo por tokens, margem, conversão USD/BRL, catálogo e testes dedicados; retirar as variáveis de pricing de modelos do `.env.example`. Preservar `monetaryCostCents`/`legalCredits` como metadados do ledger de operações próprias, sem cálculo por tokens.

- [x] **Step 4: Run the focused tests to verify the contract**

  Run: `pnpm exec vitest run apps/api/src/billing/billing-routes.test.ts packages/billing-ledger/src/billing-rules.test.ts`

  Expected: PASS; nenhuma resposta ou regra de billing deve depender de modelo, provider de IA, margem ou cotação.

### Task 2: Remover referências ativas a custo de modelo e corrigir superfícies de integração

**Files:**
- Modify: `packages/audit/src/audit-recorder.ts`
- Modify: `packages/audit/src/audit-recorder.test.ts`
- Modify: `packages/mcp-server/src/mcp-handler.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/distribution/openapi.ts`
- Modify: `apps/web/src/screens/ConnectionsScreen.tsx`
- Modify: `apps/web/src/screens/ApiDocsScreen.tsx`

**Interfaces:**
- Consumes: contrato de auditoria existente, `McpHandler`, `PUBLIC_API_ROUTES` e o mesmo `ResearchService` usado pelo REST.
- Produces: auditoria sem estimativa em USD, OpenAPI sem catálogo tarifário de modelos, interface que atribui o modelo ao ChatGPT/Claude do advogado ou à integração própria do desenvolvedor e confirmação explícita dos limites de privacidade do MCP.

- [x] **Step 1: Write the failing/contract-first tests**

  Ajustar o teste do `AuditRecorder` para registrar uma operação jurídica sem `estimatedCostUsd` e afirmar que o metadata persistido não contém essa estimativa. Ajustar o teste do MCP para afirmar que a chamada devolve apenas resultado jurídico e metadados de billing da operação, sem conversas, arquivos ou histórico.

- [x] **Step 2: Run focused tests before implementation**

  Run: `pnpm exec vitest run packages/audit/src/audit-recorder.test.ts packages/mcp-server/src/mcp-server.test.ts`

  Expected: o teste do MCP permanece verde como comportamento já existente; o ajuste do teste de auditoria registra o contrato desejado antes da remoção da propriedade ativa.

- [x] **Step 3: Implement the active-surface correction**

  Remover `estimatedCostUsd` dos eventos ativos e todos os valores `estimatedCostUsd: 0` enviados pela API/MCP, sem apagar a coluna histórica persistida. Atualizar OpenAPI para descrever somente preço e operações ForgeLex. Reescrever a tela de conexões e a documentação de API para afirmar que o ForgeLex não fornece modelo, não solicita chaves OpenAI/Anthropic, não acessa conversas/arquivos/histórico via MCP e expõe a mesma infraestrutura jurisprudencial por REST e MCP.

- [x] **Step 4: Run focused tests and frontend build**

  Run: `pnpm exec vitest run packages/audit/src/audit-recorder.test.ts packages/mcp-server/src/mcp-server.test.ts apps/web/src/screens/ApiDocsScreen.test.ts`

  Expected: PASS e compilação dos textos/contratos sem referências ativas a custo USD ou pricing de modelos.

### Task 3: Reconciliar documentação canônica e validação final

**Files:**
- Modify: `README.md`
- Modify: `STATUS_VALIDACAO.md`
- Modify: `PLANO_CONTINUIDADE_CODEX_FORGELEX.md` only where current commercial status is stated
- Modify: `RELATORIO_PARIDADE_PROVIDERS_FORGELEX.md` only to mark provider adapters as non-commercial/local and remove billing-model claims

**Interfaces:**
- Consumes: contratos finais do billing, API, MCP, autenticação e documentação de paridade local.
- Produces: documentação canônica coerente com o modelo comercial real, distinguindo histórico técnico de contrato atual.

- [x] **Step 1: Replace contradictory commercial statements**

  Documentar separadamente: advogado usa ChatGPT/Claude e paga a assinatura do host; MCP autentica e consulta a infraestrutura ForgeLex; desenvolvedor usa REST/API key e paga operações da API; eventual modelo do desenvolvedor é responsabilidade dele. Remover referências atuais a billing adicional por tokens, margem, catálogo de modelos ou provider gerenciado.

- [x] **Step 2: Audit active references**

  Run: `rg -n -i --hidden --glob '!node_modules' --glob '!.git' --glob '!pnpm-lock.yaml' "FORGELEX_MODEL_PRICING_JSON|FORGELEX_MODEL_MARGIN_BPS|FORGELEX_USD_BRL_RATE|modelPricing|estimatedCostUsd|cobrança.*token|billing.*modelo|catálogo.*modelo|margem.*provider" .`

  Expected: nenhuma referência em código/configuração/contrato/documentação canônica ativa; referências explicitamente históricas devem estar marcadas como tais ou ser corrigidas.

- [x] **Step 3: Run the required verification gates**

  Run:

  ```text
  pnpm typecheck
  pnpm test
  pnpm --filter @forgelex/web build
  git diff --check
  ```

  Expected: os quatro comandos terminam com código zero. Não executar `pnpm db:migrate`, migration remota, commit, push ou deploy.

- [x] **Step 4: Recheck repository state**

  Run: `git status --short --branch`

  Expected: somente alterações locais da correção, somadas às alterações preexistentes; branch `main`, sem operação remota e sem migration executada.
