# FORGELEX — Plataforma Agêntica Jurídica Agnóstica V2

> **A inteligência jurídica que pensa antes de peticionar.**  
> Base vendor-neutral em evolução, orientada a conformidade forense para advocacia de alta performance e departamentos jurídicos.

[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.7%20Strict-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-108%20Passing-brightgreen.svg)](https://vitest.dev/)
[![MCP](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol%20(MCP)-orange.svg)](https://modelcontextprotocol.io/)
[![Architecture](https://img.shields.io/badge/Architecture-Vendor--Neutral%20Kernel-purple.svg)](#arquitetura-do-monorepo)

---

## 🏛️ Visão Geral

O **FORGELEX V2** foi construído para superar as limitações das ferramentas jurídicas de 1ª geração (prompts estáticos, alucinações de ementas, dependência de fornecedor único e falta de governança).

### Pilares Fundamentais:
1. **Microkernel Agêntico Vendor-Neutral:** Contratos comuns para adapters Anthropic, OpenAI e modelos locais.
2. **Governança Forense Human-in-the-Loop:** Classificação estrita de impacto em 5 níveis (`L0_OBSERVATION` a `L4_EXTERNAL_EFFECT`). Mutações externas exigem token criptográfico de aprovação do advogado.
3. **Rastreabilidade e Anti-Alucinação:** Todo acórdão retornado possui ancoragem com URL oficial verificada e hash criptográfico SHA-256 imutável.
4. **Legal Data Plane com Deduplicação:** Normalização algorítmica de números CNJ, tribunais e datas através de `dedupeKey` determinística.
5. **Ledger Contábil de Dupla Carteira (Apêndice Q):** Controle de saldo pago vs promocional com prevenção a dupla cobrança por replay idempotente.
6. **Integração MCP:** Gateway JSON-RPC 2.0 autenticado, com pacote externo allowlisted e sem exposição de ferramentas internas por padrão.

### Pesquisa jurídica real

O caminho produtivo de pesquisa usa o `StjSconProvider`, que consulta o SCON
oficial do STJ, normaliza metadados, gera `contentHash`/`dedupeKey` e falha
explicitamente quando a fonte está indisponível ou bloqueia automação. O
endpoint `POST /api/v2/research/verify-authority` reaproveita o mesmo serviço,
com cobrança idempotente e evento de auditoria. O endereço-base pode ser
substituído por `FORGELEX_STJ_SCON_BASE_URL`; fixtures continuam restritas a
testes e workflows determinísticos.

### Facts & Evidence

O Matter Workspace registra fatos candidatos, itens de prova e eventos de linha
do tempo. Fatos e provas podem ser vinculados a âncoras de parágrafo e entre si;
a cobertura informa somente os vínculos explícitos registrados (`SUPPORTED`,
`PARTIAL`, `UNSUPPORTED` ou `CONFLICTING`). O sistema não confirma
automaticamente a veracidade, autenticidade ou suficiência jurídica do material.
Questões jurídicas podem ser delimitadas no próprio matter e alimentam o
research memo, que preserva as autoridades localizadas, a cobertura factual e
o estado explícito de revisão humana.

### Legal Workflows

Os fluxos `legal-research-memo`, `case-document-analysis` e `pleading-draft`
usam checkpoints versionados, retomada por execução e eventos estruturados.
Pesquisa e análise preservam a proveniência disponível; questões jurídicas são
entradas explícitas; o research memo é exposto pela API do matter com estado
`PENDING_HUMAN_REVIEW`; e a minuta permanece `DRAFT_ONLY`, sem efeito externo.
O fluxo não extrai fatos novos nem gera automaticamente uma tese jurídica final.

### Drafting & Review

O `Draft Studio` organiza rascunhos em versões imutáveis, seções e vínculos
explícitos com teses, fatos, provas e authorities. O mapa de teses é persistido
por matter, com vínculos explícitos às questões jurídicas e às fontes que o
sustentam. O `Review Center` registra achados
de citações, suporte factual e revisão adversarial; versões com apontamentos
bloqueadores não podem ser encaminhadas à aprovação. A decisão humana usa token
efêmero, persistido somente por hash, e a aprovação não equivale a protocolo ou
outro efeito externo automático.

---

## 📦 Estrutura do Monorepo

```text
├── apps/
│   ├── api/                   # Serviço Fastify (REST + MCP Gateway + contrato OpenAPI)
│   └── web/                   # Frontend React 18 + Vite + Tailwind (5 Telas Canônicas)
│
├── packages/
│   ├── domain/                # Contratos canônicos, níveis L0-L4, proveniência e DomainErrors
│   ├── agent-core/            # Microkernel agêntico, SessionStateMachine, PolicyEngine, ToolRegistry
│   ├── agent-provider-anthropic/ # Adapter Claude Agent SDK (Claude Sonnet 5)
│   ├── agent-provider-openai/    # Adapter oficial OpenAI Agents SDK (Responses API)
│   ├── persistence/           # Drizzle ORM Dual-Driver (SQLite local/testes, PostgreSQL prod)
│   ├── audit/                 # AuditRecorder com sanitização e hashing SHA-256 (OAB/LGPD)
│   ├── legal-data/            # Contratos de jurisprudência, dedupeKey e contentHash
│   ├── source-catalog/        # Catálogo nacional de tribunais (STF, STJ, TST, TJSP, etc.)
│   ├── source-providers/      # Provedores de fontes e SourceRouter com reconciliação
│   ├── legal-tools/           # Ferramentas de pesquisa, fatos e verificação de autoridades
│   ├── legal-workflows/       # Workflows versionados de pesquisa, análise e minuta
│   ├── billing-ledger/        # Dual-wallet ledger idempotente com priorização promocional
│   └── mcp-server/            # Implementação JSON-RPC 2.0 do Model Context Protocol
```

---

## 🖥️ Experiência Frontend Canônica (`apps/web`)

O frontend foi desenvolvido reproduzindo rigorosamente o design system editorial:
* **Paleta:** Marfim quente (`#FBF9F5`), conhaque imperial (`#8E5D2A`) e bordas champanhe (`rgba(180, 150, 110, 0.22)`).
* **Tipografia:** Serifada editorial clássica combinada com interface moderna sans-serif.
* **Telas Implementadas:**
  1. `Landing Page`: abertura de caso e barra de busca forense ao vivo (R$ 0,15/busca).
  2. `Painel do Advogado`: 4 cartões de métricas, gráfico de 30 dias e fila de aprovação L4.
  3. `Conexões & Provedores`: Configuração local de credenciais, sem presumir conexão verificada.
  4. `Créditos & Faturamento`: Estado explícito de conta, sem saldo ou checkout presumidos.
  5. `Research Desk`: pesquisa, proveniência e verificação de autoridade em uma vertical única.
  6. `Matter Workspace`: documentos ancorados, fatos, provas, questões jurídicas e research memo.
  7. `Draft Studio`: outline, versões, revisão e aprovação humana de rascunhos.
  8. `Documentação da API`: referência visual para o contrato público, sem executar chamadas externas por padrão.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
* Node.js >= 20.x (Recomendado Node 22+)
* pnpm >= 9.x (Recomendado pnpm 11+)

### Instalação e Execução

```bash
# 1. Instalar dependências do monorepo
pnpm install

# 2. Compilar todos os pacotes e aplicações
pnpm build

# 3. Executar suíte completa de testes automatizados
pnpm test

# 4. Iniciar a API Backend (Fastify)
pnpm --filter @forgelex/api dev

# 5. Iniciar o Frontend Web (React + Vite)
pnpm --filter @forgelex/web dev
```

O frontend estará disponível em `http://localhost:3000` e a API em `http://localhost:3001`.

### Autenticação e CORS

As rotas REST e MCP protegidas exigem `Authorization: Bearer <token>`. A identidade
de tenant e usuário é derivada da credencial; os headers `x-tenant-id` e `x-user-id`
não são fontes de identidade.

Para o modo inicial com API keys, configure `FORGELEX_API_KEYS` como um JSON de
registros contendo apenas hashes SHA-256 das chaves:

```json
[
  {
    "tokenHash": "sha256:<64 caracteres hexadecimais>",
    "subjectId": "subject_1",
    "tenantId": "tenant_1",
    "userId": "user_1",
    "roles": ["lawyer"],
    "scopes": ["mcp", "research:read", "billing:read"]
  }
]
```

Sem credenciais válidas configuradas, as rotas protegidas recusam a requisição.
Defina `FORGELEX_ALLOWED_ORIGINS` com origens separadas por vírgula; fora de
produção, sem essa variável, somente `http://localhost:3000` e
`http://localhost:3001` são permitidos.

### Distribuição pública (Marco 10)

O contrato REST gerado está disponível em `GET /openapi.json` e
`GET /api/v2/openapi.json`. A superfície canônica de pesquisa é
`POST /api/v2/research/search-case-law`; ela usa o mesmo `ResearchService`,
ledger idempotente e auditoria da capability exposta pelo MCP.

O primeiro vertical slice também permite salvar a authority retornada pela
pesquisa no matter autenticado por `POST /api/v2/matters/{matterId}/authorities`
e recuperá-la por `GET /api/v2/matters/{matterId}/authorities`. O salvamento
preserva a proveniência e é idempotente por `dedupeKey` dentro do matter.

A paridade entre os adapters Anthropic e OpenAI está documentada em
[RELATORIO_PARIDADE_PROVIDERS_FORGELEX.md](RELATORIO_PARIDADE_PROVIDERS_FORGELEX.md).
Os testes locais e a integração ForgeLex estão aprovados para ambos; chamadas
reais permanecem `BLOCKED_CREDENTIALS` quando as respectivas chaves não estão
disponíveis no ambiente.

As API keys persistidas em `api_keys` armazenam somente o hash SHA-256 e podem
ser criadas, listadas e revogadas pelas rotas `/api/v2/api-keys`. O segredo é
retornado uma única vez na criação. A fundação de webhooks está disponível em
`GET /api/v2/webhooks/events`, com contrato HMAC-SHA256 e tolerância de cinco
minutos; a entrega e a persistência de assinaturas ainda dependem da escolha
do transporte operacional.

### Segundo vertical slice

O Matter Workspace agora percorre o segundo slice no mesmo matter: registra
documentos textuais com âncoras, fatos e provas, mapeia suporte, delimita
questões jurídicas, executa pesquisa faturável, persiste o `research memo` e
registra a decisão humana como `APPROVED` ou `REJECTED`. As rotas são:

```text
GET/POST /api/v2/matters/{matterId}/issues
GET/POST /api/v2/matters/{matterId}/research-memos
POST     /api/v2/matters/{matterId}/research-memos/{memoId}/review
```

O memo é idempotente por `Idempotency-Key`, mantém a proveniência retornada
pela fonte e não confunde fixture de teste com validação externa.

### Terceiro vertical slice

O fluxo de redação parte do matter estruturado, monta o mapa de teses e registra
uma minuta com vínculos explícitos. A revisão confere as âncoras de citação, o
suporte factual e a estrutura adversarial; novas versões preservam o histórico,
e a aprovação continua condicionada à conferência humana. As rotas centrais são:

```text
GET/POST /api/v2/matters/{matterId}/theses
GET      /api/v2/matters/{matterId}/thesis-map
GET/POST /api/v2/matters/{matterId}/drafts
POST     /api/v2/matters/{matterId}/drafts/{draftId}/versions
POST     /api/v2/matters/{matterId}/drafts/{draftId}/review
POST     /api/v2/matters/{matterId}/drafts/{draftId}/approval
```

O Slice 3 foi validado localmente com persistência, isolamento por tenant,
versionamento, revisão e aprovação humana; isso não certifica uma chamada a
provider externo.

---

## 🧪 Suíte de Testes Automatizados

```bash
$ vitest run

 ✓ packages/audit/src/audit-recorder.test.ts (3 tests)
 ✓ packages/legal-tools/src/facts-evidence/facts-evidence-tools.test.ts (1 test)
 ✓ packages/legal-tools/src/drafting-review.test.ts (1 test)
 ✓ packages/persistence/src/persistence.test.ts (9 tests)
 ✓ packages/billing-ledger/src/ledger.test.ts (7 tests)
 ✓ packages/legal-workflows/src/workflow-engine.test.ts (3 tests)
 ✓ packages/mcp-server/src/mcp-server.test.ts (5 tests)
 ✓ packages/source-providers/src/stj-scon-provider.test.ts (4 tests)
 ✓ packages/legal-workflows/src/research-memo/legal-research-memo.test.ts (4 tests)
 ✓ packages/legal-tools/src/research/research-tools.test.ts (4 tests)
 ✓ apps/api/src/app.test.ts (22 tests)
 ✓ packages/agent-provider-anthropic/src/anthropic-agent-provider.test.ts (9 tests)
 ✓ apps/api/src/provider-parity.test.ts (2 tests)
 ✓ packages/domain/src/contracts/matter.test.ts (2 tests)
 ✓ packages/domain/src/contracts/facts-evidence.test.ts (3 tests)
 ✓ apps/api/src/auth/fastify-auth.test.ts (4 tests)
 ✓ packages/source-providers/src/source-router.test.ts (4 tests)
 ✓ packages/domain/src/contracts/provenance.test.ts (4 tests)
 ✓ packages/legal-data/src/legal-data.test.ts (3 tests)
 ✓ packages/source-catalog/src/court-catalog.test.ts (3 tests)
 ✓ packages/agent-provider-openai/src/openai-agent-provider.test.ts (9 tests)

 Test Files  22 passed (22)
 Tests  108 passed (108)
```

---

## ⚖️ Conformidade e Segurança

* **Código de Ética da OAB:** Proteção irrestrita ao sigilo profissional. Payloads brutos de clientes nunca são persistidos em logs de auditoria; apenas hashes SHA-256 e metadados sanitizados.
* **LGPD (Lei 13.709/2018):** Sanitização recursiva em trânsito de chaves, credenciais e dados de identificação pessoal.
* **Anti-Double Billing:** Proteção contra repetição indevida de débitos em falhas transitórias de conexão por chave de idempotência exclusiva.
* **Ledger transacional:** Carteiras começam com saldo zero por padrão; provisionamentos de saldo e migrations são explícitos, e cada operação faturável registra `UsageEvent` junto do débito e do snapshot de resultado.

---

## 📄 Licença
Propriedade de ForgeLex Tecnologia Ltda. Todos os direitos reservados.
