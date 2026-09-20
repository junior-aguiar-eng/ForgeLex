# Fase 8 — homologação Google Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar e validar o ForgeLex em homologação isolada no Google Cloud, com corpus global do STJ, origem `hml.nexojuris.ia.br` e execução MCP encadeada por um host Codex externo.

**Architecture:** Uma única imagem imutável executará API, MCP e frontend no Cloud Run em `southamerica-east1`, conectada por socket ao Cloud SQL PostgreSQL 16 da mesma região. A implantação passa primeiro pela URL nativa `run.app`; somente depois de aprovada a camada básica, um balanceador HTTPS global, IP estático, certificado gerenciado e DNS do Registro.br publicarão a mesma revisão no domínio canônico.

**Tech Stack:** Node.js 22, TypeScript, pnpm 11.19.0, Fastify, React/Vite, PostgreSQL 16, Docker, Artifact Registry, Cloud Build, Cloud Run, Cloud SQL, Secret Manager, Google Cloud Load Balancing, Registro.br e Codex MCP HTTP remoto.

**Spec:** `docs/superpowers/specs/2026-09-20-fase-8-gate-estabilidade-gcp-design.md`

## Global Constraints

- Projeto exclusivo: `project-bbbe1209-c295-4720-867`; confirmar novamente no Edge antes da primeira mutação.
- Região de runtime, banco e imagens: `southamerica-east1`.
- Origem final: `https://hml.nexojuris.ia.br`; `nerdolajuridico.com.br` é proibido.
- Cloud Run: `forgelex-api-hml`, 1 vCPU, 1 GiB, concorrência 20, timeout 60 s, mínimo zero e máximo duas instâncias.
- Cloud SQL: PostgreSQL 16, zonal, sem HA, sem réplica, sem IP público autorizado para a aplicação, sem crescimento automático e limitado inicialmente a 1 vCPU, 3,75 GiB e até 25 GiB.
- Não criar NAT, CDN ou recursos em segunda região.
- O balanceador e o IP estático são proibidos até o gate A pela URL `run.app` ser aprovado e mensurado.
- Somente dados globais do STJ e dados sintéticos de homologação podem ser promovidos; nenhum tenant, usuário, matter, billing, compra, documento privado ou sessão local pode ser copiado.
- `research.search_case_law` custa R$ 0,20; obtenção, verificação e workflows permanecem gratuitos; replay não pode duplicar débito.
- Segredos nunca entram no Git, imagem, argumento de build, relatório ou saída de teste.
- OAuth Google permanece pendente; só entra no escopo se o Codex não conseguir operar o MCP HTTP remoto por bearer token.
- Não converter a conta Google Cloud em paga.
- Commit, push, provisionamento remoto, DNS e desmontagem são gates operacionais separados e só ocorrem com autorização explícita.

## Review Focus

- Cloud Run inicia sem `DATABASE_URL` ou com SQLite em produção: deve falhar fechado antes de aceitar tráfego; coberto na Task 1.
- Requisição direta à URL `run.app` depois do gate B: deve ser rejeitada pelo modo de ingress, enquanto o balanceador permanece funcional; coberto na Task 8.
- Promoção contém tabela tenant-scoped ou staging residual: deve abortar antes do gate final; coberto na Task 7.
- Retry MCP usa a mesma idempotency key: deve retornar replay sem novo débito; coberto nas Tasks 4 e 9.
- Logs ou relatórios contêm bearer token, chave, conversa, arquivo ou histórico: a geração deve falhar pela varredura de segredos; coberto nas Tasks 4 e 10.

---

### Task 1: Runtime de produção, saúde e exposição mínima

**Files:**
- Create: `apps/api/src/config/production-runtime.ts`
- Create: `apps/api/src/config/production-runtime.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/distribution/openapi.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `resolveProductionRuntime(environment): ProductionRuntime`, `GET /healthz`, shutdown gracioso e métricas protegidas.
- Consumes: `resolveDatabasePolicy`, `buildApp`, `FORGELEX_METRICS_TOKEN` e variáveis já documentadas.

- [ ] **Step 1: Escrever testes de configuração que falha fechada**

```ts
expect(() => resolveProductionRuntime({ NODE_ENV: 'production' }))
  .toThrow('PRODUCTION_DATABASE_URL_REQUIRED');
expect(() => resolveProductionRuntime({
  NODE_ENV: 'production',
  DATABASE_URL: 'file:forgelex.db',
})).toThrow('PRODUCTION_POSTGRES_REQUIRED');
```

Adicionar casos para `PORT` inválida, `FORGELEX_WEBHOOK_MASTER_KEY` ausente e
`FORGELEX_METRICS_TOKEN` ausente. Produção aceita apenas URL
`postgres://`/`postgresql://`; teste continua permitindo injeções locais.

- [ ] **Step 2: Implementar resolução imutável do runtime**

```ts
export interface ProductionRuntime {
  port: number;
  host: '0.0.0.0';
  databaseUrl: string;
  webhookMasterKey: string;
  metricsToken: string;
}

export function resolveProductionRuntime(environment: NodeJS.ProcessEnv): ProductionRuntime {
  if (environment.NODE_ENV !== 'production') throw new Error('PRODUCTION_ENV_REQUIRED');
  const databaseUrl = environment.DATABASE_URL ?? environment.FORGELEX_DATABASE_URL;
  if (!databaseUrl) throw new Error('PRODUCTION_DATABASE_URL_REQUIRED');
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) throw new Error('PRODUCTION_POSTGRES_REQUIRED');
  if (!environment.FORGELEX_WEBHOOK_MASTER_KEY) throw new Error('PRODUCTION_WEBHOOK_KEY_REQUIRED');
  if (!environment.FORGELEX_METRICS_TOKEN) throw new Error('PRODUCTION_METRICS_TOKEN_REQUIRED');
  const port = Number(environment.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PRODUCTION_PORT_INVALID');
  return { port, host: '0.0.0.0', databaseUrl, webhookMasterKey: environment.FORGELEX_WEBHOOK_MASTER_KEY, metricsToken: environment.FORGELEX_METRICS_TOKEN };
}
```

- [ ] **Step 3: Fixar saúde, prontidão e métricas**

Adicionar `/healthz` como rota canônica de liveness e manter `/health` apenas
como alias compatível. `/readyz` continua consultando PostgreSQL e billing.
Proteger `/metrics` e `/metrics/prometheus` com comparação constante de
`Authorization: Bearer <FORGELEX_METRICS_TOKEN>`; responder 401 sem revelar o
motivo. Atualizar OpenAPI e testar que liveness não consulta o banco, readiness
retorna 503 com banco indisponível e métricas não são públicas.

- [ ] **Step 4: Implementar encerramento gracioso**

```ts
const stop = async (signal: NodeJS.Signals) => {
  structuredLog('info', 'server.shutdown', { signal });
  await app.close();
  process.exitCode = 0;
};
process.once('SIGTERM', () => void stop('SIGTERM'));
process.once('SIGINT', () => void stop('SIGINT'));
```

O processo só registra o listener depois de `app.listen` e remove ambos após o
primeiro sinal. Testar o helper sem encerrar o processo Vitest.

- [ ] **Step 5: Validar a task**

Run:

```text
pnpm exec vitest run apps/api/src/config/production-runtime.test.ts apps/api/src/app.test.ts
pnpm --filter @forgelex/api typecheck
```

Expected: PASS; nenhuma rota de métricas responde sem token.

- [ ] **Step 6: Preparar commit atômico**

```text
feat(api): preparar runtime seguro para homologação
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 2: Frontend de mesma origem e imagem imutável

**Files:**
- Create: `apps/api/src/static-web.ts`
- Create: `apps/api/src/static-web.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/web/src/api-client.ts`
- Modify: `apps/web/src/api-client.test.ts`
- Modify: `apps/web/src/screens/ApiDocsScreen.tsx`
- Modify: `apps/web/src/screens/DraftStudioScreen.tsx`
- Modify: `apps/web/src/screens/MatterWorkspaceScreen.tsx`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `resolveApiOrigin()`, `registerStaticWeb(app, root)` e imagem OCI que inicia com `node apps/api/dist/server.js`.
- Consumes: `apps/web/dist`, todos os `dist` dos workspaces e `PORT=8080` do Cloud Run.

- [ ] **Step 1: Escrever testes da origem da API**

```ts
expect(resolveApiOrigin({ configured: 'https://api.example', browserOrigin: 'https://hml.example' }))
  .toBe('https://api.example');
expect(resolveApiOrigin({ configured: '', browserOrigin: 'https://hml.nexojuris.ia.br' }))
  .toBe('https://hml.nexojuris.ia.br');
```

Centralizar a origem hoje repetida nas telas. Em desenvolvimento sem
configuração, usar `http://localhost:3001`; em build servido por HTTPS, usar
`window.location.origin`. Nenhum token pode ser embutido no bundle.

- [ ] **Step 2: Servir o build React sem capturar rotas técnicas**

Adicionar `@fastify/static` e registrar `apps/web/dist`. O fallback de SPA só
responde a `GET` com `Accept: text/html` e nunca captura `/api`, `/mcp`,
`/.well-known`, `/healthz`, `/readyz`, `/metrics` ou `/openapi.json`.

```ts
export const RESERVED_PREFIXES = [
  '/api', '/mcp', '/.well-known', '/healthz', '/readyz', '/metrics', '/openapi.json',
] as const;
```

Testar asset existente, rota React, API inexistente com 404 JSON e tentativa de
path traversal.

- [ ] **Step 3: Criar build multi-stage e contexto mínimo**

O Dockerfile deve fixar `node:22-bookworm-slim`, ativar
`pnpm@11.19.0`, instalar com `--frozen-lockfile`, executar `pnpm build`, copiar
somente manifests, dependências de produção e artefatos `dist`, criar usuário
não-root e declarar `ENV NODE_ENV=production PORT=8080`.

```dockerfile
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @forgelex/api deploy --legacy --prod /runtime

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 FORGELEX_WEB_ROOT=/app/web
WORKDIR /app
COPY --from=build --chown=node:node /runtime ./api
COPY --from=build --chown=node:node /src/apps/web/dist ./web
USER node
EXPOSE 8080
CMD ["node", "api/dist/server.js"]
```

`.dockerignore` deve excluir pelo menos:

```text
.git
.env
.env.*
!.env.example
node_modules
**/node_modules
coverage
playwright-report
test-results
*.db
*.sqlite*
*.dump
*.sql
docs
ForgeLex_*.png
```

- [ ] **Step 4: Testar a imagem localmente**

Run:

```text
docker build --pull --tag forgelex-api:phase8-local .
docker image inspect forgelex-api:phase8-local
```

Iniciar com PostgreSQL local e secrets sintéticos; verificar `/healthz`,
`/readyz`, `/`, `/openapi.json` e `/mcp`. Inspecionar o histórico e o conteúdo
da imagem para provar ausência de `.env`, dumps e arquivos Git.

- [ ] **Step 5: Validar a task**

Run:

```text
pnpm exec vitest run apps/api/src/static-web.test.ts apps/web/src/api-client.test.ts
pnpm typecheck
pnpm --filter @forgelex/web build
```

Expected: PASS e frontend funcional em mesma origem.

- [ ] **Step 6: Preparar commit atômico**

```text
build(cloud): empacotar API e frontend em imagem imutável
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 3: Medição prévia, promoção segura e integridade do corpus

**Files:**
- Create: `scripts/phase8/measure-source.mjs`
- Create: `scripts/phase8/measure-source.test.ts`
- Create: `scripts/phase8/export-global-stj.mjs`
- Create: `scripts/phase8/export-global-stj.test.ts`
- Create: `scripts/phase8/verify-corpus.mjs`
- Create: `scripts/phase8/verify-corpus.test.ts`
- Create: `scripts/phase8/seed-gate-a.mjs`
- Create: `scripts/phase8/seed-gate-a.test.ts`
- Create: `scripts/phase8/bootstrap-synthetic-tenant.mjs`
- Create: `scripts/phase8/bootstrap-synthetic-tenant.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `phase8:measure`, `phase8:export-stj`, `phase8:verify-corpus`, `phase8:seed-gate-a`, `phase8:bootstrap-tenant` e JSON saneado de dimensionamento/integridade.
- Consumes: duas URLs PostgreSQL passadas somente por ambiente e tabelas globais de jurisprudência.

- [ ] **Step 1: Testar o inventário de tamanho e custo**

O medidor deve emitir um objeto estável:

```js
{
  databaseBytes, corpusTableBytes, corpusIndexBytes, dumpBytes,
  imageBytes, plannedRequests, plannedIngressBytes, plannedEgressBytes,
  logRetentionDays, storageHeadroomRatio, estimatedMonthlyBrl,
}
```

Testar rejeição de SQLite, números negativos, margem inferior a 25%, estimativa
maior que 25 GiB e saída que contenha usuário/senha da URL. O custo é entrada
explícita do executor a partir da calculadora/tela atual do Google Cloud; o
script não inventa preço nem consulta tabela não versionada.

- [ ] **Step 2: Implementar medição PostgreSQL reproduzível**

Consultar `pg_database_size`, `pg_total_relation_size`, `pg_indexes_size` e
contagens das tabelas globais. Receber o tamanho da imagem por
`FORGELEX_PHASE8_IMAGE_BYTES` e o custo estimado por
`FORGELEX_PHASE8_ESTIMATED_MONTHLY_BRL`. Falhar se a soma com 25% de margem não
couber no armazenamento proposto.

- [ ] **Step 3: Testar allowlist de exportação**

```js
export const GLOBAL_STJ_TABLES = [
  'jurisprudence_ingestion_runs',
  'jurisprudence_source_manifests',
  'jurisprudence_documents',
  'jurisprudence_document_versions',
  'jurisprudence_document_terms',
] as const;
```

O teste deve falhar se a lista receber `forgelex_tenants`, `api_keys`,
`ledger_accounts`, `matters`, `sessions`, `legal_documents` ou qualquer tabela
não allowlisted. Staging não é exportado.

- [ ] **Step 4: Implementar exportação e restauração verificáveis**

Gerar comandos `pg_dump --data-only --format=custom --table=<allowlist>` e
`pg_restore --single-transaction --exit-on-error`. O script imprime somente
arquivo, SHA-256, tabelas e contagens; nunca a URL. A restauração remota exige
`FORGELEX_PHASE8_ALLOW_REMOTE_RESTORE=confirmed` e banco alvo com hostname
diferente da origem.

- [ ] **Step 5: Fixar as invariantes do corpus**

`phase8:verify-corpus` deve comparar origem e alvo e falhar quando houver:

```sql
SELECT dedupe_key FROM jurisprudence_documents GROUP BY dedupe_key HAVING COUNT(*) > 1;
SELECT document_id, content_hash FROM jurisprudence_document_versions GROUP BY document_id, content_hash HAVING COUNT(*) > 1;
SELECT d.id FROM jurisprudence_documents d LEFT JOIN jurisprudence_document_versions v ON v.id = d.current_version_id WHERE v.id IS NULL;
SELECT COUNT(*) FROM jurisprudence_ingestion_staging;
```

Comparar ainda documentos, versões, manifestos, rejeitados, cobertura mínima e
máxima, hashes de manifestos e estados terminais de lacuna oficial.

- [ ] **Step 6: Criar o recorte técnico e a identidade sintética**

`seed-gate-a.mjs` deve usar `CanonicalFixtureProvider` e
`JurisprudenceIngestionService` para inserir somente fixtures STJ versionadas,
incluindo busca com resultado, busca vazia, verificação e replay. Ele exige
`FORGELEX_PHASE8_ALLOW_REMOTE_SEED=confirmed`, rejeita banco local como alvo e
é idempotente pelos hashes canônicos.

`bootstrap-synthetic-tenant.mjs` deve criar identificadores prefixados por
`phase8_hml_`, chamar `ApiKeyService.create` com scopes `mcp`, `research:read`,
`matter:read`, `matter:write` e `billing:read`, e provisionar exatamente R$ 20
de crédito promocional. A saída padrão contém apenas tenant, usuário, key ID e
prefixo; o token completo só pode ser escrito no descritor indicado por
`FORGELEX_PHASE8_TOKEN_FD`, para encaminhamento direto ao Secret Manager.
Testar que stdout/stderr nunca contêm o token.

- [ ] **Step 7: Validar a task**

Run:

```text
pnpm exec vitest run scripts/phase8/measure-source.test.ts scripts/phase8/export-global-stj.test.ts scripts/phase8/verify-corpus.test.ts scripts/phase8/seed-gate-a.test.ts scripts/phase8/bootstrap-synthetic-tenant.test.ts
pnpm phase8:measure
```

Expected: PASS; o relatório de medição não contém credenciais nem dados de tenant.

- [ ] **Step 8: Preparar commit atômico**

```text
feat(ops): medir e promover corpus STJ com allowlist
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 4: Cliente MCP remoto, Agent Core e coleta saneada

**Files:**
- Create: `scripts/phase8/remote-http.mjs`
- Create: `scripts/phase8/remote-http.test.ts`
- Create: `scripts/phase8/mcp-client.mjs`
- Create: `scripts/phase8/mcp-client.test.ts`
- Create: `scripts/phase8/agent-core-remote.mjs`
- Create: `scripts/phase8/agent-core-remote.test.ts`
- Create: `scripts/phase8/redact-evidence.mjs`
- Create: `scripts/phase8/redact-evidence.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `phase8:smoke-remote`, `phase8:mcp-remote`, `phase8:agent-core-remote` e evidências JSON saneadas.
- Consumes: `FORGELEX_PHASE8_BASE_URL`, `FORGELEX_PHASE8_API_KEY` e uma idempotency key por intenção.

- [ ] **Step 1: Escrever testes do redator de evidência**

Rejeitar, e não apenas mascarar silenciosamente, chaves que contenham
`authorization`, `cookie`, `token`, `secret`, `password`, `conversation`,
`files`, `history` ou `documentContent`. Redigir query jurídica e texto
integral; preservar timestamps, request IDs, operation IDs, hashes, códigos,
status, latência, contagens e valores de billing.

- [ ] **Step 2: Implementar smoke HTTP com teto**

Executar `/healthz`, `/readyz`, `/openapi.json`, `/api/v2/tribunals`, busca REST,
replay, tribunal não habilitado e métricas autenticadas. Cada chamada recebe
timeout de 60 s; o conjunto limita-se a 25 operações e aborta em qualquer 5xx.

```js
const baseUrl = new URL(process.env.FORGELEX_PHASE8_BASE_URL);
if (baseUrl.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
if (!process.env.FORGELEX_PHASE8_API_KEY) throw new Error('API_KEY_REQUIRED');
```

- [ ] **Step 3: Implementar cliente MCP independente**

O cliente envia `initialize`, `tools/list`, `research.search_case_law`,
`research.get_authority` e `research.verify_authority` por HTTP JSON-RPC 2.0.
Ele valida IDs, schemas, erros e proveniência; usa a mesma idempotency key apenas
no replay da busca e confirma débito total de R$ 0,20.

- [ ] **Step 4: Integrar Agent Core à superfície MCP remota**

Registrar no `ToolRegistry` três proxies HTTP com os contratos externos e usar
`AgentRuntime` com provider determinístico de teste para encadear busca,
obtenção e verificação. O teste deve provar que o resultado veio da origem
remota, que a autoridade é a mesma nas três etapas e que o Agent Core não
transportou contexto privado.

- [ ] **Step 5: Cobrir os cinco modos críticos**

Testar resposta malformada, 401, timeout/cancelamento, `UNSUPPORTED_COURT` e
replay. Em todos os casos, a evidência deve conter estado explícito e nunca
credencial. Erro, cancelamento e tribunal não habilitado não podem criar débito.

- [ ] **Step 6: Validar a task localmente contra `app.inject`/servidor efêmero**

Run:

```text
pnpm exec vitest run scripts/phase8/remote-http.test.ts scripts/phase8/mcp-client.test.ts scripts/phase8/agent-core-remote.test.ts scripts/phase8/redact-evidence.test.ts
```

Expected: PASS com um único débito de 20 centavos no fluxo e zero segredos na evidência.

- [ ] **Step 7: Preparar commit atômico**

```text
test(mcp): criar gate remoto reproduzível da fase 8
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 5: Runbook versionado de provisionamento e desmontagem

**Files:**
- Create: `ops/gcp/phase8/config.env.example`
- Create: `ops/gcp/phase8/01-preflight.sh`
- Create: `ops/gcp/phase8/02-provision-gate-a.sh`
- Create: `ops/gcp/phase8/03-publish-gate-b.sh`
- Create: `ops/gcp/phase8/04-inventory.sh`
- Create: `ops/gcp/phase8/05-teardown.sh`
- Create: `ops/gcp/phase8/README.md`
- Create: `scripts/phase8/validate-runbook.test.ts`

**Interfaces:**
- Produces: comandos idempotentes para Cloud Shell, inventário JSON e teardown controlado.
- Consumes: projeto, região, commit SHA e secrets fornecidos no ambiente do Cloud Shell.

- [ ] **Step 1: Testar constantes e proibições do runbook**

O teste deve fixar exatamente:

```text
PROJECT_ID=project-bbbe1209-c295-4720-867
REGION=southamerica-east1
SERVICE=forgelex-api-hml
SQL_INSTANCE=forgelex-hml-pg
AR_REPOSITORY=forgelex-hml
DOMAIN=hml.nexojuris.ia.br
```

Falhar se os scripts contiverem `nerdolajuridico.com.br`, `--min-instances` com
valor diferente de zero, `--max-instances` maior que dois, HA, réplica, NAT,
CDN, segunda região, `latest` ou segredo literal.

- [ ] **Step 2: Implementar preflight somente leitura**

`01-preflight.sh` deve usar `set -euo pipefail`, conferir conta/projeto ativos,
billing trial, orçamento, APIs, inventário vazio e presença do arquivo de
medição aprovado. Ele aborta se `gcloud config get-value project` divergir ou se
existir recurso homônimo não marcado como `env=homologation,phase=8`.

- [ ] **Step 3: Implementar o gate A sem infraestrutura de domínio**

`02-provision-gate-a.sh` cria Artifact Registry, service accounts mínimas,
secrets, Cloud SQL zonal dimensionado, build por SHA e Cloud Run com URL nativa.
O runtime recebe somente `roles/cloudsql.client`,
`roles/secretmanager.secretAccessor` e `roles/logging.logWriter`. A conta de
deploy recebe `roles/artifactregistry.writer`, `roles/cloudbuild.builds.editor`,
`roles/run.admin`, `roles/cloudsql.admin`, `roles/secretmanager.admin` e
`roles/iam.serviceAccountUser` apenas sobre as service accounts da fase. É
proibido conceder `roles/editor` ou gerar chave JSON de service account. A
conexão da aplicação usa
`--add-cloudsql-instances` e socket; Cloud SQL não recebe authorized network.
O script mantém a retenção de logs no mínimo configurável compatível com o
projeto e cria métricas baseadas em logs para 5xx, latência, falha de webhook e
ingestão, sem incluir payload jurídico.

- [ ] **Step 4: Implementar o gate B condicionado**

`03-publish-gate-b.sh` exige um arquivo de evidência do gate A com
`status=passed`, commit e digest iguais aos implantados. Só então reserva IP,
cria serverless NEG, backend, URL map, proxy HTTPS e certificado gerenciado. O
script imprime os registros DNS necessários, mas não altera Registro.br.

- [ ] **Step 5: Implementar inventário e teardown**

O inventário lista Cloud Run, Cloud SQL, Artifact Registry, secrets, service
accounts, IP, certificado, NEG e balanceador, com região, labels e status. O
teardown exige `FORGELEX_PHASE8_TEARDOWN=confirmed`, confere projeto e labels,
exporta evidências antes de excluir e remove dependências do frontend ao banco.
Ao final, executa novo inventário e falha se restar recurso faturável da fase.

- [ ] **Step 6: Validar scripts sem executar mutações**

Run:

```text
bash -n ops/gcp/phase8/*.sh
pnpm exec vitest run scripts/phase8/validate-runbook.test.ts
```

Expected: PASS; nenhum comando `gcloud` mutável é executado nesta validação.

- [ ] **Step 7: Preparar commit atômico**

```text
feat(ops): versionar runbook da homologação Google Cloud
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 6: Gates locais e preflight no Edge

**Files:**
- Modify: `STATUS_VALIDACAO.md`
- Create: `docs/operations/phase8/preflight.md`

**Interfaces:**
- Produces: commit candidato, digest local, medição aprovada e inventário remoto anterior à mutação.
- Consumes: Tasks 1–5 e console Google Cloud aberto no Edge.

- [ ] **Step 1: Executar gates locais completos**

Run:

```text
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
pnpm test:postgres
git diff --check
```

Expected: todos PASS. Registrar contagens reais; não copiar números de fases anteriores.

- [ ] **Step 2: Construir e testar imagem candidata por SHA**

Usar `forgelex-api:<HEAD>`; registrar digest e bytes. Executar os smokes locais
contra PostgreSQL 16. A imagem só avança se o digest testado for o mesmo que
será enviado ao Artifact Registry.

- [ ] **Step 3: Medir a origem e registrar custo estimado**

Executar `pnpm phase8:measure`, calcular storage com margem, tráfego máximo e
retenção. Transcrever a estimativa atual do Google Cloud Calculator/console sem
credenciais. Se exceder 25 GiB ou os limites da spec, parar antes da criação.

- [ ] **Step 4: Confirmar o projeto no Edge**

No seletor do Google Cloud Console, confirmar visualmente
`project-bbbe1209-c295-4720-867` e `My First Project`; confirmar orçamento,
billing trial, APIs e inventário. Executar `01-preflight.sh` no Cloud Shell do
mesmo projeto e anexar a saída saneada ao registro.

- [ ] **Step 5: Confirmar domínio sem alterar DNS**

No Registro.br pelo Edge, confirmar `nexojuris.ia.br`, DNS do Registro.br e
ausência de registro conflitante para `hml`. Não salvar alteração nesta task.

- [ ] **Step 6: Atualizar preflight com fatos observados**

Registrar data, branch, HEAD, digest, projeto, região, banco medido, estimativa,
inventário e limites. Manter explicitamente “nenhum recurso criado” até a Task
7 ser executada.

- [ ] **Step 7: Gate operacional**

Antes da Task 7, revisar diff, plano e medição. Provisionamento remoto exige
autorização explícita do usuário; commit e push também exigem autorizações
próprias.

---

### Task 7: Provisionar e aprovar o gate A pela URL nativa

**Files:**
- Create: `docs/operations/phase8/gate-a.md`
- Modify: `STATUS_VALIDACAO.md`

**Interfaces:**
- Produces: Cloud Run/Cloud SQL mínimos, URL `run.app` validada e evidência de custo observado.
- Consumes: imagem por digest, medição aprovada e `02-provision-gate-a.sh`.

- [ ] **Step 1: Executar o runbook pelo Cloud Shell no Edge**

Criar somente recursos do gate A. Capturar nomes, IDs, região, labels, classe,
storage, digest, revisão e URL nativa. Confirmar min 0, max 2 e ausência de
balanceador, IP estático, NAT, CDN, HA e réplica.

- [ ] **Step 2: Executar migrations idempotentes**

Executar `pnpm db:migrate` por job efêmero ou Cloud Run Job com a mesma imagem e
service account restrita. Executar duas vezes; a segunda não cria nem altera
migration já aplicada.

- [ ] **Step 3: Criar identidade sintética, API key revogável e créditos**

Executar `pnpm phase8:bootstrap-tenant` por job efêmero com acesso ao socket do
Cloud SQL. O script chama `ApiKeyService` e `LedgerService.provisionAccount` e
encaminha o token pelo descritor protegido ao Secret Manager. A chave só pode
existir no Secret Manager e na variável de sessão do cliente externo; o
relatório recebe apenas prefixo e ID.

- [ ] **Step 4: Carregar recorte representativo**

Executar `pnpm phase8:seed-gate-a` para promover apenas fixtures globais STJ
versionadas suficientes para exercitar busca, obtenção, verificação, lacuna,
rejeição e replay. Confirmar por consulta que nenhuma tabela tenant-scoped da
origem foi transportada.

- [ ] **Step 5: Executar smokes do gate A**

Run, com variáveis somente na sessão:

```text
pnpm phase8:smoke-remote
pnpm phase8:mcp-remote
pnpm phase8:agent-core-remote
```

Expected: saúde/prontidão verdes, REST/MCP equivalentes, Agent Core encadeado,
um débito de R$ 0,20, replay gratuito e falhas sem cobrança.

- [ ] **Step 6: Medir operação e custo**

Registrar cold start, p50/p95, erros, conexões, logs, bytes de egress, custo
observado e projeção. Executar carga limitada a 25 buscas, concorrência cinco,
sem alterar autoscaling. Gate falha em 5xx, débito divergente ou custo fora do
limite registrado.

- [ ] **Step 7: Aprovar formalmente o gate A**

`gate-a.md` deve conter `status: passed`, projeto, commit, digest, revisão,
contagens, custo e hashes das evidências. Somente esse documento permite iniciar
corpus completo e infraestrutura de domínio.

---

### Task 8: Promover corpus global e publicar o domínio canônico

**Files:**
- Create: `docs/operations/phase8/corpus.md`
- Create: `docs/operations/phase8/gate-b.md`
- Modify: `STATUS_VALIDACAO.md`

**Interfaces:**
- Produces: corpus STJ completo validado e `https://hml.nexojuris.ia.br` com TLS gerenciado.
- Consumes: gate A aprovado, dump allowlisted, `phase8:verify-corpus` e `03-publish-gate-b.sh`.

- [ ] **Step 1: Exportar e promover somente o corpus allowlisted**

Gerar dump, SHA-256 e contagens; restaurar em transação. Não transportar
staging, tenants, usuários, API keys, matters, billing, compras, sessões ou
documentos privados.

- [ ] **Step 2: Verificar integridade e incremental idempotente**

Executar `pnpm phase8:verify-corpus`. Repetir ingestão incremental: recurso
concluído é ignorado; lacuna oficial terminal permanece registrada; recurso
novo válido cria somente as versões correspondentes.

- [ ] **Step 3: Criar infraestrutura do gate B**

Executar `03-publish-gate-b.sh` pelo Cloud Shell. O backend aponta para o mesmo
digest aprovado no gate A. Não criar segunda revisão funcional nem nova região.

- [ ] **Step 4: Alterar somente o DNS de `hml.nexojuris.ia.br` no Edge**

No Registro.br, criar exclusivamente o registro A exigido pelo IP do
balanceador. Capturar antes/depois; não tocar raiz, `www` ou outro domínio.

- [ ] **Step 5: Aguardar DNS e certificado sem falsos positivos**

Validar resolução pública em resolvedores independentes, certificado com SAN
exato e cadeia válida. HTTP 200 com HTML não prova API; testar content type e
corpo de `/healthz`, `/readyz`, `/openapi.json` e `/mcp`.

- [ ] **Step 6: Restringir ingress e provar a restrição**

Depois que o domínio estiver funcional, configurar Cloud Run para aceitar
entrada externa somente por Cloud Load Balancing. Confirmar que o domínio segue
verde e que acesso direto à URL `run.app` não contorna o balanceador.

- [ ] **Step 7: Reexecutar gate funcional completo pelo domínio**

Executar smokes, MCP, Agent Core, billing/replay, frontend e carga limitada com
`FORGELEX_PHASE8_BASE_URL=https://hml.nexojuris.ia.br`. Registrar p50/p95 e custo
sem declarar SLA.

---

### Task 9: Teste de fogo com Codex como host MCP externo

**Files:**
- Create: `docs/operations/phase8/external-host.md`
- Modify: `STATUS_VALIDACAO.md`

**Interfaces:**
- Produces: evidência de um modelo externo escolhendo e encadeando as três tools MCP.
- Consumes: domínio aprovado e variável `FORGELEX_HML_API_KEY` fora do repositório.

- [ ] **Step 1: Cadastrar o MCP remoto no Codex**

```text
codex mcp add forgelex-hml --url https://hml.nexojuris.ia.br/mcp --bearer-token-env-var FORGELEX_HML_API_KEY
codex mcp get forgelex-hml
```

Definir `FORGELEX_HML_API_KEY` no ambiente da sessão/host sem imprimi-la. O
cadastro deve conter somente o nome da variável, nunca o bearer token.

- [ ] **Step 2: Verificar catálogo e schemas no host**

Confirmar que o Codex enxerga apenas `research.search_case_law`,
`research.get_authority` e `research.verify_authority`, com schemas idênticos ao
cliente independente. Tool interna ou contexto privado reprova o gate.

- [ ] **Step 3: Executar prompt de fogo**

Usar um problema jurídico sintético que exija pesquisar precedente do STJ,
obter a autoridade escolhida e verificar sua proveniência antes de responder.
O prompt não fornece o nome das tools nem a autoridade esperada; o host deve
selecionar e encadear autonomamente as três chamadas.

Executar o host em processo separado e efêmero, preservando o bearer apenas no
ambiente desse processo:

```text
codex exec --ephemeral --json --output-last-message phase8-codex-result.txt "Pesquise no STJ a questão sintética fornecida no arquivo do gate, obtenha a autoridade mais pertinente, verifique a proveniência e só então responda com os identificadores utilizados."
```

A saída JSONL é passada pelo redator da Task 4 antes de entrar no relatório.

- [ ] **Step 4: Correlacionar host, servidor e billing**

Registrar timestamps, request/trace IDs, operation IDs, tool names, autoridade,
hashes e billing. Provar que o modelo/raciocínio ocorreu no Codex, que o ForgeLex
recebeu apenas argumentos das tools, que a busca usou o índice PostgreSQL e que
somente ela debitou R$ 0,20.

- [ ] **Step 5: Repetir a busca com a mesma chave**

Confirmar replay sem novo débito; executar ainda cancelamento e tribunal não
habilitado. As três evidências devem preservar saldo e não conter token,
conversa, arquivo ou histórico.

- [ ] **Step 6: Tratar OAuth apenas se houver bloqueio real do bearer**

Se `codex mcp` concluir o fluxo, registrar OAuth Google como desnecessário e
mantê-lo intocado. Se o host rejeitar bearer por limitação comprovada, parar e
produzir diagnóstico: OAuth 2.1 com authorization code e PKCE S256 passa a ser
um novo subgate arquitetural, sem improvisar Google OAuth como servidor de
autorização MCP.

- [ ] **Step 7: Remover a configuração e revogar a chave após a captura**

```text
codex mcp remove forgelex-hml
```

Revogar a API key sintética no ForgeLex e confirmar 401 numa última tentativa.

---

### Task 10: Relatório final, conclusão e encerramento controlado

**Files:**
- Create: `docs/operations/phase8/relatorio-final.md`
- Modify: `STATUS_VALIDACAO.md`
- Modify: `Plano de conclusão progressiva do F.md`
- Modify: `README.md`

**Interfaces:**
- Produces: decisão auditável do gate, inventário final e procedimento de desmontagem.
- Consumes: evidências das Tasks 6–9 e inventário `04-inventory.sh`.

- [ ] **Step 1: Consolidar fatos sem elevar testes parciais**

Registrar data, branch, commit, digest, projeto, região, recursos, origem,
corpus, cobertura, versões, rejeitados, tempo de ingestão, p50/p95, erros,
billing, REST/MCP, PostgreSQL, frontend, observabilidade, host externo,
autenticação, custos estimado/observado e limitações. Rotular separadamente
evidência local, remota, simulada e externa.

- [ ] **Step 2: Executar varredura de segredo e consistência**

```text
rg -n "flx_live_|Bearer |password=|Authorization|conversation|files|history" docs/operations/phase8
```

Expected: nenhum segredo ou conteúdo privado; ocorrências dos nomes proibidos só
podem aparecer como afirmações de ausência, nunca como payload capturado.

- [ ] **Step 3: Reexecutar gates finais no commit/digest relatados**

Run:

```text
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
pnpm test:postgres
pnpm phase8:smoke-remote
pnpm phase8:mcp-remote
pnpm phase8:agent-core-remote
git diff --check
```

Expected: todos PASS, pelo domínio canônico quando aplicável.

- [ ] **Step 4: Marcar a Fase 8 somente se todos os gates estiverem demonstrados**

O plano canônico recebe `PASS` apenas com gate A, corpus completo, gate B, host
Codex externo, billing/replay, observabilidade e relatório aprovados. OAuth
Google pendente não bloqueia se bearer remoto tiver funcionado.

- [ ] **Step 5: Preparar commits finais sem executá-los automaticamente**

```text
feat(cloud): publicar homologação controlada da fase 8
test(mcp): validar host externo no domínio de homologação
docs(status): registrar conclusão da fase 8
```

Separar somente se o diff final confirmar três mudanças lógicas. Commit e push
continuam dependentes de autorização explícita.

- [ ] **Step 6: Aguardar aceite antes do teardown**

Manter o ambiente somente pelo período necessário à revisão. Não iniciar a
desmontagem antes do aceite do relatório.

- [ ] **Step 7: Executar encerramento autorizado e comprovar custo zero residual**

Após autorização específica, remover DNS de `hml`, frontend do balanceador,
certificado, IP, NEG, Cloud Run, Cloud SQL, imagens, secrets e service accounts
exclusivas. Executar `04-inventory.sh`, registrar exclusões e confirmar ausência
de storage, backup, IP reservado ou outro componente faturável da Fase 8.
