# FORGELEX — Plataforma Agêntica Jurídica Agnóstica V2

> **A inteligência jurídica que pensa antes de peticionar.**  
> Base vendor-neutral em evolução, orientada a conformidade forense para advocacia de alta performance e departamentos jurídicos.

[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.7%20Strict-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tests-209%20Passing-brightgreen.svg)](https://vitest.dev/)
[![MCP](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol%20(MCP)-orange.svg)](https://modelcontextprotocol.io/)
[![Architecture](https://img.shields.io/badge/Architecture-Vendor--Neutral%20Kernel-purple.svg)](#arquitetura-do-monorepo)

---

## 🏛️ Visão Geral

O **FORGELEX V2** foi construído para superar as limitações das ferramentas jurídicas de 1ª geração (prompts estáticos, alucinações de ementas, dependência de fornecedor único e falta de governança).

### Pilares Fundamentais:
1. **Microkernel Agêntico Vendor-Neutral:** Contratos para integrações próprias de agentes, sem modelo de IA gerenciado pelo ForgeLex.
2. **Governança Forense Human-in-the-Loop:** Classificação estrita de impacto em 5 níveis (`L0_OBSERVATION` a `L4_EXTERNAL_EFFECT`). Mutações externas exigem token criptográfico de aprovação do advogado.
3. **Rastreabilidade e controle de alucinação:** Resultados com proveniência
   disponível preservam metadados, hash SHA-256 e estado de verificação para
   conferência; isso não substitui a revisão jurídica humana.
4. **Legal Data Plane com Deduplicação:** Normalização algorítmica de números CNJ, tribunais e datas através de `dedupeKey` determinística.
5. **Ledger Contábil de Dupla Carteira (Apêndice Q):** Controle de saldo pago vs promocional com prevenção a dupla cobrança por replay idempotente.
6. **Integração MCP:** Gateway JSON-RPC 2.0 autenticado, com pacote externo allowlisted e sem exposição de ferramentas internas por padrão.

### Pesquisa jurídica sobre índice próprio persistido

O Portal de Dados Abertos do STJ e o SCON são fontes oficiais de aquisição,
verificação e atualização. Depois de persistidos os documentos, versões,
hashes, proveniência e manifestos, a busca comercial REST/MCP consulta o índice
próprio do ForgeLex; não consulta o `StjSconProvider` live como caminho normal
de resposta. O SCON permanece disponível para aquisição, health check ou
verificação técnica. O endereço-base pode ser substituído por
`FORGELEX_STJ_SCON_BASE_URL`; fixtures permanecem restritas a testes e
workflows determinísticos.

A pesquisa persistida usa índice full-text nativo: FTS5 ponderado no SQLite e
`tsvector` com GIN no PostgreSQL. Identidade processual, autoridade e conteúdo
recebem pesos distintos; não existe tabela relacional com uma linha por termo.
O staging de carga concluída é descartado transacionalmente, enquanto cargas
falhas preservam staging para diagnóstico explícito.

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
│   ├── agent-provider-anthropic/ # Adapter opcional para integração/testes locais; não é runtime comercial
│   ├── agent-provider-openai/    # Adapter opcional para integração/testes locais; não é runtime comercial
│   ├── persistence/           # Drizzle ORM Dual-Driver (SQLite local/testes, PostgreSQL prod)
│   ├── audit/                 # AuditRecorder com sanitização e hashing SHA-256 (OAB/LGPD)
│   ├── legal-data/            # Contratos de jurisprudência, dedupeKey e contentHash
│   ├── source-catalog/        # Catálogo canônico e capabilities dos tribunais
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
  1. `Landing Page`: abertura de caso e barra de busca forense sobre o índice persistido (R$ 0,20/busca).
  2. `Painel do Advogado`: 4 cartões de métricas, gráfico de 30 dias e fila de aprovação L4.
  3. `Canais de acesso`: MCP no ChatGPT/Claude e API REST no software do desenvolvedor.
  4. `Créditos & Faturamento`: Estado explícito de conta, sem saldo ou checkout presumidos.
  5. `Research Desk`: pesquisa, proveniência e verificação de autoridade em uma vertical única.
  6. `Matter Workspace`: documentos ancorados, fatos, provas, questões jurídicas e research memo.
  7. `Draft Studio`: outline, versões, revisão e aprovação humana de rascunhos.
  8. `Documentação da API`: referência visual para o contrato público, sem executar chamadas externas por padrão.

---

## 🚀 Como Executar Localmente

### Limites atuais

O estado comprovado localmente inclui build, typecheck, testes automatizados,
isolamento de tenant, persistência SQLite, persistência PostgreSQL local,
contratos de auditoria, billing e paridade estrutural dos adapters. Isso não
equivale à validação de produção.

- Os adapters locais de Anthropic e OpenAI existem apenas para integração/testes
  opcionais e não são inicializados pelo runtime comercial. O ForgeLex não
  fornece modelo, não solicita essas chaves e não as inclui na configuração
  operacional de exemplo.
- `AgentRuntime` usa contrato vendor-neutral e suas sessões de SDK são
  efêmeras: não se confundem com sessões comerciais persistidas da API ou com
  conexões MCP. Aprovação, cancelamento, timeout e erro são eventos
  normalizados; a retomada só é oferecida por provider que a implemente. O uso
  de tokens permanece metadado do evento de integração e jamais alcança o
  ledger, cujo provider é sempre a infraestrutura jurídica ForgeLex.
- A API usa `DATABASE_URL` (ou `FORGELEX_DATABASE_URL`) para inicializar o
  driver PostgreSQL; sem a variável, os testes e o desenvolvimento usam
  SQLite em memória. O ambiente PostgreSQL reproduzível usa `docker compose`;
  `pnpm test:postgres` executa um smoke test idempotente contra a URL configurada
  e retorna `BLOCKED_DATABASE_URL` quando ela não estiver disponível.
- Webhooks usam outbox PostgreSQL e worker interno; a entrega efetiva exige
  `FORGELEX_WEBHOOK_MASTER_KEY`, destinos acessíveis e
  `FORGELEX_WEBHOOK_WORKER_ENABLED=true`.
- Observabilidade local fornece logs estruturados, correlação e métricas
  internas. `GET /metrics/prometheus` expõe formato compatível com scrape;
  nenhum coletor externo está configurado neste ambiente.
- Testes locais, fixtures e respostas de indisponibilidade não comprovam
  credenciais, limites, migrations ou disponibilidade do ambiente definitivo.

A pesquisa comercial desta fase está habilitada somente para o STJ. O catálogo
pode listar outros tribunais como `UNAVAILABLE`, mas API, MCP e interface não
anunciam esses tribunais como fontes pesquisáveis até que tenham provider e
capability próprios homologados.

O billing da fase é fechado por capability: `research.search_case_law` custa
R$ 0,20 por execução válida; `research.get_authority`,
`research.verify_authority` e `research.generate_memo` permanecem sem preço e
sem débito financeiro. Essas operações gratuitas exigem `Idempotency-Key` para
rastreabilidade, mas não geram replay financeiro, `DEBIT`, `UsageEvent`
financeiro ou webhook de billing.

### Pré-requisitos
* Node.js >= 20.x (Recomendado Node 22+)
* pnpm >= 9.x (Recomendado pnpm 11+)
* Docker (necessário para a validação local PostgreSQL)

### Instalação e Execução

```bash
# 1. Instalar dependências do monorepo
pnpm install

# 2. Compilar todos os pacotes e aplicações
pnpm build

# 3. Executar suíte completa de testes automatizados
pnpm test

# 4. Iniciar a API Backend (Fastify)
pnpm --filter @forgelex/api start

# 5. Iniciar o Frontend Web (React + Vite)
pnpm --filter @forgelex/web dev

# 6. Subir PostgreSQL para validação local
docker compose up -d postgres

# 7. Aplicar migrations no PostgreSQL local
$env:DATABASE_URL = "postgres://forgelex:forgelex@localhost:55432/forgelex"
pnpm db:migrate

# 8. Validar persistência, ledger e outbox no PostgreSQL local
pnpm test:postgres
```

O frontend estará disponível em `http://localhost:3000` e a API em `http://localhost:3001`.
O script de inicialização da API carrega o `.env` da raiz e o bootstrap atual
executa migrations idempotentes de persistência e ledger; não aponte esse
processo para um banco remoto sem autorização operacional explícita.

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
Se o navegador abrir o Vite por `http://127.0.0.1:3000`, essa origem também
precisa ser incluída explicitamente na variável.

### Conta e cadastro

O acesso comum ao ForgeLex usa o Supabase Auth com nome, e-mail e senha. A
confirmação do e-mail é obrigatória antes de entrar; celular e CPF não são
solicitados nesta etapa. O Supabase administra a senha, a confirmação, a
recuperação e o encerramento da sessão. O ForgeLex nunca recebe ou armazena a
senha.

No primeiro acesso confirmado, a API cria de forma idempotente o perfil do
usuário, um espaço pessoal e o vínculo de proprietário. Os identificadores do
usuário e do espaço vêm da sessão confirmada, não de campos enviados pelo
navegador. O endpoint `POST /api/v2/auth/bootstrap` prepara esse vínculo e
`GET /api/v2/auth/me` retorna somente os dados da conta autenticada.

Para habilitar o cadastro no frontend, configure apenas a chave pública do
projeto:

```text
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave-publica>
```

Para a API validar as sessões, configure as mesmas informações no ambiente do
servidor:

```text
FORGELEX_SUPABASE_URL=https://<projeto>.supabase.co
FORGELEX_SUPABASE_PUBLISHABLE_KEY=<chave-publica>
```

Não coloque `service_role`, senha do banco ou qualquer outro segredo no
frontend. No painel do Supabase, mantenha a confirmação de e-mail ativada e
configure a URL de retorno do aplicativo para que os links de confirmação e
recuperação funcionem. Sem essas variáveis, o frontend informa que o acesso
ainda não está disponível; não existe usuário ou espaço padrão.

### Billing e superfícies de integração

O Mercado Pago é o único provedor de pagamento do ForgeLex. O modelo comercial
é pré-pago, em BRL, sem mensalidade: o usuário compra créditos e o backend só
lança o saldo depois da confirmação do pagamento pelo webhook validado.

Há duas superfícies distintas de uso:

1. **API para desenvolvedores.** O software do desenvolvedor autentica com API
   key do ForgeLex, recebe jurisprudência, ementas e metadados e paga pelas
   operações da API. A API key é somente uma credencial; não é token de IA. Se
   o software usar OpenAI, Anthropic ou outro modelo, essa integração e esse
   billing pertencem ao desenvolvedor, fora do ForgeLex.
2. **MCP para advogados.** O advogado conecta o MCP ao ChatGPT ou Claude e usa
   sua própria conta e assinatura. O ForgeLex autentica o usuário e consulta
   a mesma infraestrutura jurisprudencial disponibilizada pela API REST,
   cobrando apenas as operações ForgeLex executadas, inicialmente R$ 0,20 por
   busca jurisprudencial.

Assim, a assinatura do ChatGPT ou Claude paga o modelo do host; os créditos
ForgeLex pagam dados, pesquisa e infraestrutura jurídica. O MCP recebe somente
a chamada autenticada e os argumentos da ferramenta: não acessa conversas,
arquivos ou histórico do usuário.

### Distribuição pública (Marco 10)

O contrato REST gerado está disponível em `GET /openapi.json` e
`GET /api/v2/openapi.json`. A superfície canônica de pesquisa é
`POST /api/v2/research/search-case-law`; ela usa o mesmo `ResearchService`,
índice persistido, auditoria e política de billing da capability exposta pelo
MCP. Só a busca gera débito; as operações gratuitas preservam o saldo.

Na fase inicial, `GET /api/v2/tribunals` informa a capability real de cada
fonte: somente o STJ aparece como `searchable` e `verifiable`. As operações
REST faturáveis exigem `Idempotency-Key`; a ausência de `q` ou a solicitação de
tribunal não habilitado é rejeitada antes do ledger. Uma busca STJ sem
resultados ainda é uma operação própria válida e pode ser debitada.

O primeiro vertical slice também permite salvar a authority retornada pela
pesquisa no matter autenticado por `POST /api/v2/matters/{matterId}/authorities`
e recuperá-la por `GET /api/v2/matters/{matterId}/authorities`. O salvamento
preserva a proveniência e é idempotente por `dedupeKey` dentro do matter.

A paridade técnica dos adapters opcionais Anthropic e OpenAI está documentada
em [RELATORIO_PARIDADE_PROVIDERS_FORGELEX.md](RELATORIO_PARIDADE_PROVIDERS_FORGELEX.md).
Ela não representa modelo fornecido pelo ForgeLex nem cria relação de billing
com a API ou o MCP comerciais.

As métricas podem ser coletadas por Prometheus apontando o scrape para
`/metrics/prometheus`; a integração com um coletor externo continua sendo
parâmetro operacional.

As API keys persistidas em `api_keys` armazenam somente o hash SHA-256 e podem
ser criadas, listadas e revogadas pelas rotas `/api/v2/api-keys`. O segredo é
retornado uma única vez na criação. Webhooks expõem o contrato em
`GET /api/v2/webhooks/events` e o transporte local em
`/api/v2/webhooks/endpoints` e `/api/v2/webhooks/deliveries`, com assinatura
HMAC-SHA256, tolerância de cinco minutos, retries e backoff. A operação externa
do destino ainda depende de configuração e disponibilidade do ambiente.

### Segundo vertical slice

O Matter Workspace agora percorre o segundo slice no mesmo matter: registra
documentos textuais com âncoras, fatos e provas, mapeia suporte, delimita
questões jurídicas, consulta o índice persistido sem preço próprio para o
workflow de memo, persiste o `research memo` e registra a decisão humana como
`APPROVED` ou `REJECTED`. As rotas são:

```text
GET/POST /api/v2/matters/{matterId}/issues
GET/POST /api/v2/matters/{matterId}/research-memos
POST     /api/v2/matters/{matterId}/research-memos/{memoId}/review
```

O memo exige `Idempotency-Key` para rastreabilidade, mantém a proveniência
retornada pelo índice persistido e não confunde fixture de teste com validação
externa. Nesta fase, não possui preço próprio nem gera débito de workflow.

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

```text
pnpm test

Test Files  45 passed | 1 skipped (46)
Tests       203 passed | 3 skipped (206)

O build executado pelo script também passou. O resultado inclui os testes de
billing por capability, parser/provider STJ Open Data, migration 0014,
manifesto/staging, equivalência REST/MCP e o job de ingestão.
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
