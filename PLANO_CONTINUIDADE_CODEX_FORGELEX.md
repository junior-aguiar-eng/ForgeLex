# FORGELEX — Plano de Continuidade para Codex

> **Repositório:** `junior-aguiar-eng/ForgeLex`  
> **Base auditada:** `main` — commit `8a7f1618c754e309d0aacd88b7ac46a86cb19cea`  
> **Natureza deste plano:** continuidade evolutiva. Não refundar o projeto. Aproveitar ao máximo o código existente, corrigir pontos provisórios e completar as capacidades pendentes do documento mestre V2.

---

## 1. Diretriz central

O repositório atual já possui uma fundação arquitetural válida. O Codex deve partir do princípio de que os pacotes existentes representam as fronteiras canônicas do produto:

```text
apps/api
apps/web

packages/domain
packages/agent-core
packages/agent-provider-anthropic
packages/agent-provider-openai
packages/persistence
packages/audit
packages/legal-data
packages/source-catalog
packages/source-providers
packages/legal-tools
packages/legal-workflows
packages/billing-ledger
packages/mcp-server
```

Regra operacional:

```text
componente correto -> preservar
componente incompleto -> completar
componente provisório -> substituir internamente sem quebrar contrato
capability ausente -> adicionar à camada correta
```

É proibido criar uma segunda arquitetura paralela apenas porque a implementação existente ainda é parcial.

Não criar `agent-core-v2`, `new-runtime`, `billing-next`, segundo MCP server, segundo backend, microserviço Python, LangChain, CrewAI ou AutoGen.

---

## 2. Baseline obrigatório antes de editar

Antes de qualquer alteração:

```bash
git status
git branch --show-current
git rev-parse HEAD
git log -5 --oneline

node --version
pnpm --version

pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Registrar:

```text
BASELINE
- branch:
- HEAD:
- working tree:
- node:
- pnpm:
- typecheck:
- tests:
- build:
- falhas preexistentes:
```

Não misturar correções alheias ao escopo.

---

## 3. O que deve ser preservado

### 3.1 `packages/agent-core`

Preservar como núcleo vendor-neutral.

Ativos arquiteturais que não devem ser abandonados:

```text
AgentRuntime
ToolRegistry
PolicyEngine
SessionStateMachine
AgentProvider
AgentRunInput
AgentEvent
```

Tipos de Anthropic/OpenAI não podem escapar dos adapters.

### 3.2 Providers

Preservar:

```text
packages/agent-provider-anthropic
packages/agent-provider-openai
```

A mudança necessária é na implementação interna do runtime, não na arquitetura.

### 3.3 Legal Data Plane

Preservar e expandir:

```text
packages/legal-data
packages/source-catalog
packages/source-providers
```

O `SourceRouter` e o padrão `SourceProvider` são corretos e devem ser utilizados para fontes reais.

### 3.4 Legal tools/workflows

Preservar:

```text
packages/legal-tools
packages/legal-workflows
```

As tools existentes e `research-memo` são a fundação; devem evoluir.

### 3.5 Billing

Preservar `packages/billing-ledger`.

A estrutura de carteira paga/promocional, idempotência e replay é útil. Corrigir atomicidade, provisionamento e política comercial sem reescrever o domínio do zero.

### 3.6 MCP

Preservar `packages/mcp-server`.

O servidor JSON-RPC atual deve evoluir para MCP remoto autenticado, não ser substituído.

### 3.7 Frontend

Preservar as telas atuais:

```text
LandingScreen
DashboardScreen
ConnectionsScreen
CreditsScreen
ApiDocsScreen
```

O próximo trabalho de UI é acrescentar superfícies jurídicas operacionais, não redesenhar novamente a casca comercial.

---

# 4. Sequência de continuidade

Executar nesta ordem:

```text
P0 — segurança, identidade e integridade financeira
P1 — providers agênticos oficiais
P2 — commercial control plane
P3 — legal data plane real
P4 — domínio forense + legal tools
P5 — workflows jurídicos
P6 — experiência operacional + distribuição
```

Cada etapa deve terminar verde antes da próxima.

---

# 5. P0 — identidade e segurança

## 5.1 Remover confiança em headers arbitrários

Hoje a API aceita `x-tenant-id` e `x-user-id`.

Isso deve ser eliminado do caminho de produção.

Criar contrato canônico:

```ts
export interface AuthenticatedPrincipal {
  subjectId: string;
  tenantId: string;
  userId: string;
  roles: string[];
  scopes: string[];
  authMethod: 'session' | 'api_key' | 'oauth_access_token';
}
```

Implementar:

```text
TokenVerifier/AuthAdapter
Fastify auth preHandler
request principal
tenant derivado da credencial
RBAC/scopes
```

Testes obrigatórios:

```text
token inválido
token ausente
tenant spoofing
scope insuficiente
usuário de tenant A tentando acessar tenant B
```

## 5.2 CORS

Substituir `origin: '*'` por configuração explícita:

```text
FORGELEX_ALLOWED_ORIGINS
```

Development pode permitir localhost explicitamente.

## 5.3 Secrets

Remover fallbacks como:

```text
mock-anthropic-key
mock-openai-key
```

do runtime normal.

Mocks apenas por dependency injection em testes.

Credencial ausente:

```text
PROVIDER_NOT_CONFIGURED
```

## 5.4 OAuth 2.1 / PKCE do Remote MCP

A metadata já existente deve ser aproveitada.

Completar:

```text
Bearer validation
OAuthTokenVerifier
authorization server metadata
PKCE S256
scopes
refresh/revocation conforme provider adotado
```

O MCP nunca deve confiar em tenant/user vindos de headers arbitrários.

Scopes iniciais:

```text
mcp
research:read
matter:read
draft:write
billing:read
```

---

# 6. P0 — corrigir o ledger sem refundação

## 6.1 Problema

O fluxo atual é aproximadamente:

```text
check idempotency
read balance
execute operation
update balance
insert ledger entry
```

Isso é vulnerável a concorrência e falha intermediária.

## 6.2 Objetivo

Preservar `LedgerService`, mas colocar a operação inteira dentro de uma fronteira transacional.

PostgreSQL:

```text
BEGIN
SELECT account FOR UPDATE
check idempotency
check entitlement/balance
execute/reserve operation
debit
insert immutable ledger entry
persist result
COMMIT
```

Adicionar testes concorrentes.

## 6.3 Remover saldo inicial implícito

Eliminar defaults equivalentes a:

```text
R$ 63 saldo pago
R$ 15 promocional
```

Conta deve ser provisionada por política explícita.

Criar algo como:

```text
BillingAccountProvisioningPolicy
```

## 6.4 Ledger imutável

Tipos mínimos:

```text
CREDIT_PURCHASE
CREDIT_PROMOTION
DEBIT_USAGE
REFUND
REVERSAL
ADJUSTMENT
EXPIRATION
```

Não editar histórico de lançamentos.

---

# 7. P1 — provider Anthropic

O package atual usa SDK básico e loop manual. Não remover o package.

Migrar sua implementação interna para o SDK agêntico oficial atual da Anthropic.

Antes de programar, verificar na fonte oficial vigente:

```text
package
README
public exports
Node mínimo
sessions
tools
MCP
hooks
permissions
cancellation
changelog
```

Manter contrato ForgeLex:

```text
AgentProvider -> Anthropic adapter
```

Eventos continuam no formato ForgeLex:

```text
lifecycle:started
tool:invoked
tool:waiting_approval
tool:completed
error
lifecycle:completed
```

Não habilitar:

```text
shell
filesystem arbitrário
SQL
Git
browser irrestrito
```

Somente tools do registry allowlisted.

Testes pagos continuam opt-in.

---

# 8. P1 — provider OpenAI

Preservar `packages/agent-provider-openai`.

Migrar internamente do loop manual `chat.completions` para o runtime oficial de agentes vigente da OpenAI.

Verificar documentação real antes da implementação.

Preservar:

```text
AgentProvider
AgentRunInput
AgentEvent
PolicyEngine
SessionStateMachine
ToolRegistry
```

Codex não será o runtime jurídico principal.

Codex pode existir futuramente como workspace/sandbox técnico controlado, não como dependência semântica do domínio jurídico.

---

# 9. P2 — Commercial Control Plane

Não colocar regra comercial dentro do `billing-ledger`.

Criar, se necessário:

```text
packages/commercial-control
```

Responsabilidades:

```text
plans
entitlements
quota
rate limits
pricing
metering
usage events
```

## 9.1 Tool pricing

Remover a regra global de “qualquer chamada MCP = R$ 0,15”.

Cada tool deve declarar:

```ts
billing: {
  mode: 'FREE' | 'INCLUDED' | 'METERED' | 'PASS_THROUGH';
  unit: 'CALL' | 'PAGE' | 'DOCUMENT' | 'WORKFLOW';
  priceCode?: string;
}
```

## 9.2 Fluxo comercial

```text
authenticate
-> resolve plan
-> entitlement
-> quota
-> rate limit
-> price
-> execute
-> usage event
-> ledger
-> response
```

## 9.3 UsageEvent

Criar contrato:

```ts
UsageEvent {
  id;
  tenantId;
  userId;
  capability;
  toolName;
  provider?;
  model?;
  units;
  legalCredits?;
  monetaryCost?;
  requestId;
  sessionId?;
  timestamp;
}
```

---

# 10. P3 — Legal Data Plane real

A fixture atual continua para testes.

Não removê-la.

Implementar um provider real atrás do contrato existente.

## 10.1 SourceProvider real

Adicionar pelo menos um provider real, mantendo o domínio neutro.

Exemplo conceitual:

```ts
interface AuthoritySourceProvider {
  id: string;
  searchCaseLaw(...): Promise<...>;
  getAuthority(...): Promise<...>;
  health(): Promise<ProviderHealth>;
}
```

## 10.2 Evoluir SourceRouter

Adicionar:

```text
provider selection
timeouts
fallback controlado
circuit breaker
reconciliation
deduplication
provenance normalization
```

Não permitir fallback silencioso que mude semântica.

## 10.3 Proveniência jurídica

Todo resultado real deve transportar, quando disponível:

```text
sourceProvider
officialUrl
court
caseNumber
chamber
rapporteur
judgmentDate
publicationDate
retrievedAt
firstSeenAt
lastSeenAt
rawContentHash
normalizedContentHash
parserVersion
dedupeKey
```

## 10.4 Authority verification

Adicionar:

```text
research.verify_authority
```

Estados:

```text
VERIFIED_OFFICIAL
VERIFIED_PROVIDER
UNVERIFIED
CONFLICTING_METADATA
NOT_FOUND
```

---

# 11. P4 — domínio forense

Adicionar progressivamente em `packages/domain`.

Não tentar completar tudo em um único commit.

## 11.1 Matter

```text
Matter
```

Campos mínimos:

```text
id
tenantId
clientId?
title
description?
practiceArea?
jurisdiction?
status
createdAt
updatedAt
```

## 11.2 Documentos

```text
LegalDocument
DocumentVersion
DocumentAnchor
```

Originais imutáveis.

## 11.3 Fatos e provas

```text
Fact
FactSourceLink
EvidenceItem
EvidenceLink
EvidenceCoverage
```

## 11.4 Autoridades e teses

```text
LegalAuthority
AuthorityVerification
LegalThesis
ThesisAuthorityLink
ThesisEvidenceLink
```

## 11.5 Rascunhos

```text
Draft
DraftVersion
DraftSection
CitationAnchor
```

## 11.6 Aprovações

Aproveitar `SessionStateMachine`/PolicyEngine e formalizar:

```text
ApprovalRequest
ApprovalDecision
ApprovalToken
```

---

# 12. P4 — expandir legal-tools

Preservar tools existentes.

Adicionar em ordem:

```text
matter.get_context
matter.list_documents

document.search_anchored
document.get_excerpt
document.get_metadata

facts.extract
facts.list
facts.find_support

evidence.map_support
evidence.get_coverage

research.search_case_law
research.verify_authority
research.search_legislation
research.get_authority

strategy.identify_issues
strategy.build_thesis_map

drafting.create_draft
drafting.update_draft
drafting.get_draft

review.verify_citations
review.check_fact_support
review.adversarial_review
```

Reavaliar semanticamente `drafting.save_final_draft`.

“Final” não deve significar efeito externo automático.

---

# 13. Impact Levels L0–L4

Formalizar metadata nas tools:

```text
L0_OBSERVATION
L1_ANALYSIS
L2_DRAFT_CREATION
L3_INTERNAL_MUTATION
L4_EXTERNAL_EFFECT
```

PolicyEngine considera:

```text
principal
tenant
matter
capability
tool
impact level
```

Regra inicial:

```text
L0 -> automático
L1 -> automático
L2 -> conforme entitlement
L3 -> policy + possível aprovação
L4 -> aprovação humana obrigatória
```

Nenhum provider pode contornar isso.

---

# 14. P5 — workflow engine

Não criar vários “personagens de IA” na interface.

Criar workflows versionáveis.

Contratos:

```text
WorkflowDefinition
WorkflowStep
WorkflowContext
WorkflowCheckpoint
WorkflowResult
```

## 14.1 `legal-research-memo`

Evoluir o workflow existente:

```text
intake
-> identify issues
-> search authorities
-> verify authorities
-> synthesize
-> adversarial check
-> research memo
-> human review
```

## 14.2 `case-document-analysis`

```text
ingest
-> document structure
-> timeline
-> facts
-> evidence
-> issues
-> research gaps
-> report
```

## 14.3 `pleading-draft`

Somente após Matter/Fact/Evidence/Authority estarem estáveis:

```text
matter context
-> facts
-> evidence
-> issues
-> research
-> thesis map
-> draft
-> citation validation
-> adversarial review
-> human approval
```

---

# 15. Document ingestion

Implementar pipeline incremental:

```text
upload
-> hash
-> metadata
-> extraction
-> anchors
-> chunking
-> indexing
-> provenance
```

MVP:

```text
PDF textual
DOCX
TXT/MD
```

OCR depois via adapter.

---

# 16. Persistence

Preservar Drizzle.

Separar:

```text
SQLite -> local/test
PostgreSQL -> produção
```

Não executar DDL ad hoc em runtime de produção.

Migrar para migrations formais.

Criar migrations para:

```text
auth
tenants/users
matters
documents
facts
evidence
authorities
drafts
approvals
usage
billing
```

---

# 17. Audit

Preservar `packages/audit`.

Expandir eventos:

```text
auth.token.validated
agent.session.started
agent.session.completed
agent.session.failed
tool.requested
tool.completed
tool.failed
tool.approval.requested
tool.approval.granted
tool.approval.denied
research.authority.verified
billing.usage.recorded
billing.debit.recorded
billing.replay.detected
matter.created
document.ingested
draft.created
draft.versioned
```

Não registrar por padrão:

```text
API keys
bearer tokens
passwords
documentos integrais
petições integrais
prompts jurídicos integrais
```

---

# 18. MCP External Tool Pack

Não publicar todas as tools internas.

Primeiro pacote externo:

```text
research.search_case_law
research.get_authority
research.verify_authority
research.search_legislation
```

Depois:

```text
matter.get_context
document.search_anchored
drafting.create_draft
```

Nunca expor:

```text
SQL
filesystem
shell
git
admin internals
secrets
billing mutation arbitrária
```

REST, MCP e Web devem reutilizar os mesmos application services.

---

# 19. Frontend

Não refazer as cinco telas existentes.

Adicionar:

```text
Research Desk
Matter Workspace
Documents
Draft Studio
Review Center
Approvals
```

## 19.1 Primeiro vertical UI

`Research Desk`

Deve permitir:

```text
consulta
tribunal/data
resultados
provenance
status de verificação
detalhe
salvar authority no matter
```

## 19.2 Segundo vertical UI

`Matter Workspace`

Seções:

```text
Resumo
Documentos
Fatos
Provas
Pesquisa
Teses
Rascunhos
Atividade
```

## 19.3 Draft Studio

Primeira versão:

```text
outline
sections
linked authorities
linked facts/evidence
version history
review findings
```

Não construir editor de texto completo antes disso.

---

# 20. CI e testes

Criar GitHub Actions:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

CI padrão não usa APIs pagas.

Fakes obrigatórios:

```text
FakeAgentProvider
FixtureSourceProvider
FakeOAuthVerifier
FakePaymentProvider
```

Cenários críticos:

```text
tenant isolation
MCP auth
idempotent retry
billing concorrente
provider abstraction
prompt injection documental
provenance obrigatório
approval L4
```

---

# 21. Revisão de claims

README deve refletir realidade.

Não afirmar como produção pronta:

```text
MCP público operacional
OAuth completo
fonte oficial universalmente verificada
billing production-grade
segurança certificada
```

enquanto isso não estiver demonstrado.

---

# 22. Ordem concreta de execução

## Marco 1 — Secure Foundation

Implementar:

```text
AuthenticatedPrincipal
TokenVerifier/AuthAdapter
Fastify auth preHandler
tenant derivado de principal
remoção de x-tenant-id/x-user-id confiáveis
CORS configurável
credentials fail-closed
tenant spoofing tests
GitHub Actions CI
```

## Marco 2 — Ledger Correctness

Implementar:

```text
migrations
transação
row/account locking PostgreSQL
idempotency transacional
explicit account provisioning
usage event
concurrency tests
rollback tests
```

## Marco 3 — Provider Modernization

Separadamente:

```text
Anthropic
OpenAI
```

Não migrar os dois no mesmo diff.

## Marco 4 — Commercial Plane

```text
plans
entitlements
quota
rate limit
price registry
tool-level metering
```

## Marco 5 — Real Research

```text
real SourceProvider
SourceRouter robusto
provenance
research.verify_authority
REST/MCP parity
Research Desk
```

## Marco 6 — Matter Foundation

```text
Matter
LegalDocument
ingestion
anchors
Matter Workspace
```

## Marco 7 — Facts & Evidence

```text
facts
evidence
coverage
timeline
legal tools
```

## Marco 8 — Legal Workflows

```text
legal-research-memo
case-document-analysis
pleading-draft
```

## Marco 9 — Drafting & Review

```text
Draft Studio
versions
citations
adversarial review
approvals
```

## Marco 10 — Distribution

```text
external MCP tool pack
REST public API parity
generated docs
API keys
webhook foundation
```

---

# 23. Primeiro vertical slice comercial

Antes de ampliar features, o produto deve conseguir:

```text
1. usuário autentica;
2. cria matter;
3. adiciona documento;
4. documento é ancorado;
5. executa pesquisa jurídica real;
6. recebe authority com provenance;
7. salva authority no matter;
8. uso/crédito é registrado;
9. mesma capability funciona via MCP;
10. tenant, audit e billing permanecem coerentes.
```

Esse é o primeiro slice realmente vendável.

---

# 24. Segundo vertical slice

```text
matter
-> documentos
-> fatos
-> evidências
-> questões jurídicas
-> pesquisa
-> research memo
-> revisão humana
```

---

# 25. Terceiro vertical slice

```text
matter estruturado
-> thesis map
-> draft
-> citation verification
-> adversarial review
-> versioning
-> human approval
```

---

# 26. Definition of Done

Cada marco exige:

```text
[ ] implementação concluída
[ ] typecheck verde
[ ] testes do pacote verdes
[ ] integração relevante verde
[ ] build verde
[ ] nenhuma regressão
[ ] tenant isolation verificado
[ ] secrets ausentes de logs
[ ] docs atualizadas
[ ] README sem claims exagerados
[ ] diff revisado
[ ] limitações declaradas
```

---

# 27. Política de mudança

Antes de substituir um componente, responder internamente:

```text
1. Está arquiteturalmente errado?
2. Ou somente incompleto?
3. Posso completar sem quebrar o contrato?
4. Há testes que definem o comportamento existente?
```

Se incompleto, estender.

Ativos a preservar:

```text
AgentRuntime
PolicyEngine
SessionStateMachine
ToolRegistry
SourceRouter
LedgerService
McpHandler
```

---

# 28. Formato obrigatório de cada execução do Codex

```text
BASE
- branch
- HEAD
- working tree
- baseline

SCOPE
- objetivo
- pacotes afetados
- invariantes

PLAN
- arquivos esperados
- migrations
- testes

EXECUTION
- alterações realizadas

VALIDATION
- comandos executados
- resultados reais

FINAL
- arquivos alterados
- decisões
- testes
- limitações
- próximos passos
```

Não responder apenas “feito”.

---

# 29. Commits recomendados

```text
fix(auth): derive tenant identity from authenticated principal
fix(billing): make usage debit atomic and replay-safe
feat(mcp): enforce bearer auth and capability scopes
refactor(anthropic): migrate adapter behind existing AgentProvider
refactor(openai): migrate adapter behind existing AgentProvider
feat(commercial): add entitlements and tool pricing registry
feat(research): add real authority source provider
feat(domain): add matter and legal document models
feat(tools): add anchored search and authority verification
feat(workflows): complete legal research memo
feat(web): add research desk
```

Não misturar segurança, frontend, billing e provider migration no mesmo commit.

---

# 30. Primeira tarefa que o Codex deve executar agora

## Entrega 1A — Secure Identity Foundation

Implementar apenas:

```text
AuthenticatedPrincipal
AuthAdapter/TokenVerifier
Fastify auth preHandler
tenant derivado de principal
remoção de confiança em x-tenant-id/x-user-id
CORS configurável
provider credentials fail-closed
test auth fixtures
tenant spoofing tests
CI básico
```

Não migrar providers ainda.

Depois executar:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Somente com a base verde seguir para a Entrega 1B.

---

# 31. Segunda tarefa

## Entrega 1B — Ledger Correctness

Preservar a API pública quando possível.

Implementar:

```text
formal migrations
transaction boundary
PostgreSQL locking
idempotency dentro da transação
explicit provisioning policy
zero implicit paid balance
usage event
concurrency tests
replay tests
rollback tests
```

---

# 32. Terceira tarefa

## Entrega 2 — Provider Modernization

Primeiro Anthropic.

Validar tudo.

Depois OpenAI.

Nenhuma migração simultânea dos dois adapters.

---

# 33. Quarta tarefa

## Entrega 3 — Real Research Vertical Slice

Implementar:

```text
one real SourceProvider
research.search_case_law real path
research.verify_authority
REST endpoint
MCP tool
billing metadata
audit event
Research Desk
integration tests
```

Fixture atual permanece para testes.

---

# 34. Resultado arquitetural desejado

```text
                        ForgeLex
                           │
            ┌──────────────┴──────────────┐
            │                             │
       Web Workspace                 REST / MCP
            │                             │
            └──────────────┬──────────────┘
                           │
                 Application Services
                           │
              Auth / Entitlements / Policy
                           │
                     Agent Core
                ┌──────────┴──────────┐
                │                     │
          Anthropic Adapter      OpenAI Adapter
                │                     │
                └──────────┬──────────┘
                           │
                    Legal Tool Registry
                           │
           ┌───────────────┼──────────────┐
           │               │              │
        Matter         Research       Draft/Review
           │               │              │
           └───────────────┼──────────────┘
                           │
                     Legal Services
                           │
                     Legal Data Plane
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
 official sources     paid providers      local corpus
                           │
                    persistence
                           │
            audit + usage + billing ledger
```

---

# 35. Regra final ao Codex

A fundação existente deve ser tratada como deliberada.

A pergunta padrão não é:

> “Como eu reconstruiria isso?”

A pergunta é:

> **“Como eu completo corretamente este componente existente, preservando os contratos e a arquitetura já validada?”**

O objetivo é transformar a fundação atual em produto operacional, não produzir uma nova fundação.
