# Pendências atuais do ForgeLex

## Conector MCP no Claude: causa raiz e correção (08/11/2026)

**Sintoma:** no chat do Claude, `@forgelex` não achava ferramenta nenhuma ("nenhuma ferramenta correspondente
encontrada"), embora o servidor respondesse 200 a todo o handshake e à lista de ferramentas.

**Causa raiz (provada):** o cliente OFICIAL do MCP (`@modelcontextprotocol/sdk` 1.32) rejeitava a lista de
ferramentas inteira (`listTools()` falhava com `inputSchema.type: expected "object"`). Uma única ferramenta,
`analise.peca_redigir`, anunciava `{ "oneOf": [...] }` sem `type: "object"` (união de dois modos, `z.discriminatedUnion`).
Um cliente rigoroso valida a lista de uma vez e, se uma ferramenta falha, descarta todas: o host fica com zero
ferramentas. O Claude Code "funcionava" porque ele mesmo achata esse schema (foi o texto "Input constraint: Provide
parameters for exactly one of…" que apareceu na descrição); o chat não.

**Linha do tempo nos logs de produção (30 dias):**

- Até 17/10/2026 03:30 UTC: o `Claude-User` fazia chamadas reais (respostas de 10 KB a 490 KB).
- 18/10/2026 18:32 UTC: revisão `analise-cabf504` publica o módulo de análise (a lista passa de 19 KB para 52 KB,
  com `peca_redigir` inválida). Dali em diante o Claude buscava a lista centenas de vezes por dia e não fazia
  nenhuma chamada de ferramenta com resultado próprio, até 07/11.
- As mudanças desta semana (#112 a #125) NÃO causaram isso: o formato do handshake em 02/11 (antes de todas elas)
  era idêntico ao de hoje. A percepção de que "quebrou depois das alterações" coincidiu com uma segunda falha, de
  autenticação, abaixo.

**Segunda falha, independente, de autenticação:** o Claude deixou de renovar o token em 03/11 02:00 UTC e recebeu 401
em `/mcp` de 03/11 12:38 a 07/11 15:37 UTC; só voltou quando Boni reautenticou em 07/11 17:14 (registro,
consentimento, callback, token). Às 12:38 de 03/11 o cliente do Claude chamou `POST /token` (raiz do domínio) e
recebeu 404; o ForgeLex só serve `/oauth/token`. Houve falhas parecidas de renovação (400 em `/oauth/token`) em 11/10
e 18/10. A causa disso NÃO foi provada (ver pendências abaixo). O ChatGPT renovou o token sem falha de 02/11 a 07/11.

**Correção (este bloco):** `toolJsonSchema` (agent-core) passa a achatar união de objetos em um objeto só
(`type: "object"`, propriedades unidas, `required` pela interseção, discriminador `const` vira `enum`); o texto da
ferramenta ganha "Informe os parâmetros de exatamente um destes conjuntos: …"; a validação real da chamada continua
sendo a do schema Zod original. O handler omite e registra (`mcp.tool_schema_invalid`) qualquer ferramenta cujo schema
ainda assim não seja objeto, em vez de derrubar a lista. Trava na CI: `apps/api/src/mcp-client-conformance.test.ts`
sobe o servidor com a configuração completa e conversa com o cliente oficial do MCP (lista, instruções, chamadas).
Com o achatamento desligado, o teste falha; com ele, `listTools()` devolve as 21 ferramentas.

**Versão do servidor identifica o build:** `serverInfo.version` era `2.0.0` fixo, sem relação com as publicações, e
`FORGELEX_SOURCE_SHA` (gravada em cada revisão do Cloud Run) não era lida por nenhum código. Agora o `app.ts` passa a
variável ao handler e o `initialize` anuncia `2.0.0+<sha7>` (só hexadecimal de 7 a 40 caracteres é aceito). De dentro do
host passa a dar para saber qual revisão atende, em vez de deduzir pelo tamanho das respostas nos logs. A versão do
protocolo já estava atual (`2025-11-25`) e não mudou.

**Pendências abertas deste tema:**

- ~~Confirmar no chat do Claude que `@forgelex` passa a achar e chamar as ferramentas.~~ Confirmado por Boni em
  08/11/2026 (captura do painel `research.present_decisions`; ver a publicação do `e7cf3b7`, abaixo).
- Investigar por que a renovação do token do Claude falhou em 11/10, 18/10 e 03/11 (400 em `/oauth/token` e 404 em
  `/token`). Hipóteses não testadas: cliente em modo de endpoints padrão (aliases na raiz `/token`, `/authorize`,
  `/register` seriam o remédio previsto na especificação), rotação de refresh token do Supabase. Ligar o log do
  balanceador foi ligado em `forgelex-api-prod-backend` em 09/11/2026 (decisão de Boni).
  **Log do motivo publicado no `e799141` (09/11/2026):** cada recusa de `POST /oauth/token`
  grava `oauth.token_rejected` com `reason` estável (`RESOURCE_MISMATCH`, `RESOURCE_REQUIRED`,
  `GRANT_TYPE_UNSUPPORTED`, `BODY_MISSING`, `CLIENT_ENVELOPE_INVALID`, `REFRESH_ENVELOPE_INVALID`,
  `REFRESH_CLIENT_MISMATCH`, `CODE_ENVELOPE_INVALID`, `PKCE_MISMATCH`, `REDIRECT_URI_MISMATCH`, `UPSTREAM_REJECTED`
  com `upstreamStatus` e `upstreamError`, `UPSTREAM_UNREACHABLE` e outros), mais `grant`, `clientId` nativo, `status`
  e `agent` (User-Agent cortado em 80 caracteres). Cada emissão grava `oauth.token_issued`. Nada de tokens, código,
  verificador, corpo, texto livre do Supabase nem o recurso enviado. No Cloud Logging:
  `jsonPayload.message="oauth.token_rejected"`. Não cobre 4xx gerados antes do handler (JSON sem corpo ou tipo de
  conteúdo não aceito, respondidos pelo Fastify) nem o 404 de `/token` na raiz. Depois de publicado, o próximo 400
  de renovação diz qual das causas foi; só então decidir sobre aliases na raiz.
  **Evidência de 09/11/2026 (UTC, Cloud Run):** o login do Claude caiu duas vezes com 401 em `/mcp`. Às 02:16 o
  cliente do Claude (`python-httpx`) fez `POST /token` na raiz e levou 404 (o anunciado é `/oauth/token`); às 05:08
  não tentou renovar e se re-registrou (3 chamadas a `/oauth/register`), voltando só com nova autorização. Nenhuma
  recusa de `/oauth/token` foi registrada; as renovações que chegaram lá deram 200 (inclusive a do Claude às 10:34).
  Hipótese: sem os metadados em memória, o cliente renova no `/token` padrão. **Alias `POST /token` na raiz
  implementado** (mesmo handler; o log passa a trazer `path`); `/authorize` e `/register` seguem sem evidência e fora.
  Depois de publicado, confirmar: renovação do Claude em `path="/token"` com `oauth.token_issued`, e ausência de
  novos 404 em `/token`.
- **Log `mcp.call` (09/11/2026, publicado no `a44035e`):** cada chamada JSON-RPC em `/mcp` grava
  `method`, `tool` (só em `tools/call`), `idempotency` (`header`, `argument` ou `none`, nunca o valor), `ok`,
  `rpcErrorCode`, `serverVersion` (no `initialize`), `toolCount` (no `tools/list`), `durationMs` e `agent`. Nada de
  argumentos, resultados, consultas ou identificadores. Serve para fechar as duas verificações abertas (versão
  `2.0.0+<sha7>` e envio do `idempotencyKey`). No Cloud Logging: `jsonPayload.message="mcp.call"`. Não cobre o 202 de
  notificações nem a ferramenta `forgelex.connection_status` (respondida antes do handler) nem o 429 do limitador.
- **Achado de 09/11/2026 pelo `mcp.call` (publicado no `a44035e`):** o `initialize` devolve `2.0.0+a44035e` e o
  `tools/list` traz 21 ferramentas. A primeira `research.search_case_law` do Claude veio sem chave de idempotência
  (`idempotency=none`, `ok=false`); a segunda, 20 s depois, com a chave como argumento, funcionou. O painel
  (`research.present_decisions`) só abriu depois, e nada orienta o modelo a abri-lo após a pesquisa. **Correção em
  código (publicada no `b8c44ee`):** o `tools/list` e o `initialize` passam a dizer que a chave é obrigatória (um
  identificador novo e único por operação) e que, concluída a pesquisa, o modelo chama o painel com o `operationId`
  devolvido. O texto é único para Claude, ChatGPT e qualquer cliente (o `tools/list` não depende de quem pergunta; um
  teste trava isso). Só descrições: nenhuma regra de cobrança, autorização ou schema muda. Alternativa mais forte,
  não adotada por risco de quebrar clientes que mandam o header: declarar `idempotencyKey` em `required`. Depois de
  publicado, conferir no `mcp.call` se a primeira chamada de pesquisa já vem com `idempotency=argument` e se o
  painel passa a abrir sem pedido. O ChatGPT ainda não foi observado neste ponto.
- **Painel automático na pesquisa (09/11/2026, publicado no `5757733`, confirmado por Boni):** com as descrições do `b8c44ee`, o
  Claude ainda respondeu em texto, parafraseando a ementa, e só abriu o painel depois do pedido (relato de Boni). A
  decisão de chamar o painel é do modelo, então deixou de depender dele: `research.search_case_law` agora carrega a
  interface do painel (`_meta.ui.resourceUri` para o Claude e `openai/outputTemplate` para o ChatGPT, só quando o
  painel e a interface existem) e devolve no `structuredContent` os dados do painel (`forgelex.decisions.v1`, com o
  botão de salvar quando autorizado; sem repetir `items`). O texto do resultado traz um `aviso`: a ementa integral já
  está no painel, não reproduzir nem parafrasear, comentar em complemento. Se a ferramenta do painel falhar, o painel
  sai montado do próprio resultado, sem salvar. `research.present_decisions` segue para reabrir ou escolher decisões.
  Sem painel ou sem interface, nada muda. **Confirmado em 09/11/2026 (Boni, capturas):** no Claude e no ChatGPT o
  painel abriu sem pedido. O `mcp.call` mostra que, nos dois, o modelo também chamou `research.present_decisions`
  depois da pesquisa (28 s e 17 s); não dá para saber pelo log se o painel automático da pesquisa renderizou sozinho,
  mas o resultado para o usuário é o esperado.
- **Chave de idempotência (`mcp.call`, 09/11/2026):** após o `b8c44ee`, o Claude passou a enviar `idempotencyKey` na
  primeira pesquisa (antes errava e repetia); o ChatGPT ainda errou duas vezes (20:38) antes de acertar. Nenhuma das 12
  chamadas registradas usou o cabeçalho `Idempotency-Key`. **Integrado no PR #132 e presente no SHA em produção `8fcd1d0` (conferência no `mcp.call` não registrada):** `idempotencyKey` passa a
  constar em `required` no schema de toda ferramenta que a exige (pesquisa, verificação, workflows e análise), para o
  host enviá-la na primeira tentativa. Risco conhecido: um cliente que mande só o cabeçalho e valide os argumentos
  contra o schema seria recusado; não há sinal desse cliente nos logs. Sem a chave, a chamada segue falhando com
  `-32602`. Conferir no `mcp.call` do ChatGPT depois do deploy.
- **Decisões por chamada (Boni, 09/11/2026):** a cobrança é por chamada (R$ 0,20), não por decisão, então devolver 1
  decisão no ChatGPT entrega menos pelo mesmo preço. O Claude devolve 5 a 10; o ChatGPT devolvia 1, provavelmente
  porque o modelo enviava `limit` baixo ao ler "uma jurisprudência". **Integrado no PR #132 e presente no SHA em produção `8fcd1d0` (conferência no ChatGPT não registrada):** o `limit` ganha
  descrição ("a cobrança é por chamada; peça 10, o padrão, mesmo que o usuário diga uma jurisprudência") e, no MCP, o
  servidor eleva qualquer `limit` abaixo de 5 para 5 (`MIN_SEARCH_RESULTS`); o padrão continua 10 e o máximo 20. O piso
  vale só no MCP: os fluxos internos (workflows agênticos, API de pesquisa) mantêm o `limit` que pedirem. Piso e padrão
  são ajustáveis. Conferir no ChatGPT depois do deploy se passam a vir de 5 a 10 decisões.
- **M2 resolvido em código (09/11/2026, PR #133, presente no SHA em produção `8fcd1d0`):** `getExecution` lia até 1000 execuções da conversa e as
  filtrava e ordenava em memória. Agora o banco devolve a execução vigente entre as outras (uma linha) e só as
  anteriores que entregaram algo (três campos), em duas consultas novas do `ExecutionStore`
  (`newestCurrentExecution`, `priorDeliveries`). **Sem migration:** o filtro lê os campos do `payload_json`
  (`json_extract` no SQLite, `::json->>` no PostgreSQL). Engano meu registrado antes: eu havia dito que exigiria colunas
  indexadas e migration; não exige. Efeito colateral corrigido: o `ExecutionStore` criado dentro de uma transação não
  conhecia o dialeto (`$forgelexDialect` só existe no banco raiz) e gerou SQL de SQLite no PostgreSQL; o dialeto agora
  é repassado às lojas de `atomic` e `snapshot`. Verificado: teste que compara o resultado com o algoritmo antigo em 80
  execuções de estados variados, teste com 1100 execuções na conversa, e o smoke `test:postgres:agentic-runtime`
  (PostgreSQL 16 em Docker) com a checagem nova `current_execution_and_history_in_database`. O histórico agora sai
  ordenado por `createdAt` (antes, sem ordem definida). Fica de fora, por não haver necessidade medida: índice sobre
  expressão do JSON; só vale se a consulta aparecer lenta com conversas muito longas.

## Estado publicado atual — 12/11/2026: SHA `b4c76e0`

O Cloud Run aponta `FORGELEX_SOURCE_SHA=b4c76e0ee593588365992b66597701f161001502` nas revisões `forgelex-api-prod-b4c76e0` e `forgelex-closure-hml-private-b4c76e0`, ambas com 100% do tráfego. O build `edfc13e1-be29-484a-9824-fac46addbaf1` corresponde à imagem ativa, de digest `sha256:819c990ca60b50f3b5d9f22e409153d6dca28c0bd2616d6b0bdd4f8e72a841e3`. Produção respondeu HTTP 200 em `/healthz` e `/readyz`.

- **PRs #135–141 publicados.** A revisão inclui o teto de entrada de 100.000 caracteres, a política comercial v2, a Mesa guiada, a estabilização, a Mesa única e as flags do build. O #141 corrigiu o Dockerfile do #140.
- **Web.** `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED`, `VITE_FORGELEX_DESK_SHELL`, `VITE_FORGELEX_ATTACHMENTS_ENABLED` e `VITE_FORGELEX_MATTER_CHIPS_ENABLED` estão `true` no build publicado.
- **API.** `FORGELEX_DESK_GUIDANCE_ENABLED` e `FORGELEX_DESK_GUIDANCE_V3_ENABLED` estão `true` em produção, e `FORGELEX_SKILL_CATALOG_DIR` está configurada. As duas flags de orientação e a configuração do catálogo estão ausentes no serviço de encerramento.
- **Salvamento recuperável e banco.** `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED` está ausente e `FORGELEX_AUTO_MIGRATE=false` nas duas revisões. Produção, `forgelex-api-hml` e `forgelex-closure-hml-private` continuam com a mesma referência de `DATABASE_URL`. A aplicação documentada da `0041` é no banco HML isolado. O registro de migrações do banco compartilhado não foi consultado. O host `hml.nexojuris.ia.br` deu timeout em `/` e `/healthz` na conferência.
- **Política comercial.** `commercial-brl-2026-11-10-v2`, com reserva de R$ 11,50 por trabalho, mínimo de R$ 0,50, teto diário de R$ 20,00 e mensal de R$ 100,00. No teste local, após contabilizar R$ 8,50 no dia, outra reserva foi aceita. Após R$ 8,51, foi recusada com `COMMERCIAL_DAILY_LIMIT`. A DEC-5 mantém a reserva de R$ 11,50.
- **Verificações abertas.** M2 (A18) segue parcial. Faltam a jornada autenticada no ambiente isolado, a conferência da mensagem de saldo insuficiente na jornada e as verificações de MCP com cliente autenticado (lista nominal, idempotência, piso de cinco decisões e renovação pelo alias `/token`). O inventário de 11/11 registra o host de produção como destino de notificação de pagamento em HML. Essa configuração externa não foi revalidada em 12/11.

[Evidência da reconciliação e teste local](docs/architecture/2026-11-10-mesa-guiada-execucao.md#reconciliação-pós-deploy--12-de-novembro-de-2026).

## Inventário histórico de 11/11/2026 — SHA `8fcd1d0`

Esta seção registra o estado anterior à publicação de 12/11.

Leitura somente leitura do Cloud Run em 11/11/2026 (projeto `project-bbbe1209-c295-4720-867`, região
`southamerica-east1`), registrada na etapa E1 do plano unificado. Os dois serviços declaram
`FORGELEX_SOURCE_SHA=8fcd1d0ea920898983b96db153848205a37b0a5b` (`main`, PR #134: alerta da chave do provedor), com a
imagem `forgelex-api@sha256:18d643917434ca29392f5250624f9c007e13b29d2996081faa41659c62214e4a`.

- `forgelex-api-prod` recebe 100% em `forgelex-api-prod-secretlatest-202611092347` (criada em 10/11/2026 02:47 UTC
  a partir da `-8fcd1d0`, de 02:09 UTC, por `set-provider-secret-latest.ps1`). Revisão anterior com o mesmo código:
  `forgelex-api-prod-8fcd1d0` (`--to-revisions=forgelex-api-prod-8fcd1d0=100`).
- `forgelex-closure-hml-private` recebe 100% em `forgelex-closure-hml-private-8fcd1d0`.
- **Integrados em `main` e não publicados:** PR #135 (entrada maior, teto de 100 kB e reserva por trabalho
  comercial), PR #136 (Mesa guiada) e PR #137 (base da Mesa guiada). Os PRs #132 a #134 estão publicados.
- **Flags efetivas da API em produção** (ambiente do serviço; ausente vale como desligada):
  `AGENTIC_WORKSPACE`, `ANALISE`, `BILLING`, `COMMERCIAL_EXECUTION`, `EDITORIAL_COMMERCIAL`, `MCP_DECISION_UI`,
  `MCP_OAUTH`, `SAVED_RESEARCH` e `ACCOUNT_CLOSURE` ligadas; `CLOSED_PILOT`, `ACCOUNT_CLOSURE_SCHEDULER` e
  `ACCOUNT_CLOSURE_WORKER` desligadas; `AUTO_MIGRATE=false`. `FORGELEX_DESK_GUIDANCE_ENABLED` e
  `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED` não existem no serviço, logo estão desligadas. Os padrões `false` do
  `cloudbuild.yaml` valem para as flags de interface do build, não para estas.
- **Flags no serviço de encerramento:** `ACCOUNT_CLOSURE_SCHEDULER` ligada; `ACCOUNT_CLOSURE`, `AGENTIC_WORKSPACE`,
  `ANALISE`, `BILLING` e `COMMERCIAL_EXECUTION` desligadas; `EDITORIAL_COMMERCIAL` ligada.
- Os dois serviços só têm `startupProbe` em `/readyz`; não há sonda de vida. A checagem periódica de `/readyz` vem do
  Uptime Check do Cloud Monitoring (ver `ops/gcp/production/README.md`).
- **Não observado:** a revisão do SHA `8fcd1d0` não foi exercitada nesta leitura além do que os serviços declaram;
  o estado do banco e a migração `0041` não foram consultados.

**Complemento da E1 (11/11/2026, somente leitura; insumo de U0, U1, V5A, D0 e M1):**

- **Web em produção:** `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true`, `VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true` e
  `VITE_FORGELEX_SAVED_RESEARCH_ENABLED=true` (build `2e3691f7`, imagem em uso `sha256:18d64391…`; os 23 builds desde
  30/10 têm as duas primeiras ligadas). Em `App.tsx` do `8fcd1d0`, `integrated` = as duas ligadas, logo está no ar a
  **Mesa integrada** (`WritingDeskScreen` envolvendo `AgenticWorkspaceScreen`, `DraftStudioScreen` e `DashboardScreen`).
  O build web de homologação não foi lido (a imagem do `forgelex-api-hml` é a tag `closure-release-f10e13f`, fora do
  histórico recente do Cloud Build).
- **Piloto fechado:** `FORGELEX_CLOSED_PILOT_ENABLED=false` em produção e no encerramento; ausente (desligado) em
  `forgelex-api-hml` e `forgelex-api-hml-isolated`. `_MODEL`, `_TENANT_ID` e `_USER_ID` não existem em nenhum serviço.
- **Flags de servidor** (ausente = desligada):

| Flag | `forgelex-api-prod` | `forgelex-closure-hml-private` | `forgelex-api-hml` | `forgelex-api-hml-isolated` |
| --- | --- | --- | --- | --- |
| `DESK_GUIDANCE_ENABLED` | ausente | ausente | ausente | ausente |
| `DRAFT_SAVE_COMMANDS_ENABLED` | ausente | ausente | ausente | ausente |
| `AGENTIC_WORKSPACE_ENABLED` | true | false | ausente | ausente |
| `COMMERCIAL_EXECUTION_ENABLED` | true | false | ausente | ausente |
| `EDITORIAL_COMMERCIAL_ENABLED` | true | true | ausente | ausente |
| `ANALISE_ENABLED` | true | false | ausente | ausente |

- **Banco compartilhado (achado):** `forgelex-api-prod`, `forgelex-api-hml` e `forgelex-closure-hml-private` usam o
  mesmo segredo `forgelex-hml-database-url` e a mesma instância Cloud SQL `forgelex-hml-pg` (PostgreSQL 16, sempre
  ligada). Só `forgelex-api-hml-isolated` tem banco próprio (`forgelex-hml-isolated-pg`, **parada**). Portanto
  “homologação” na `forgelex-api-hml` **não é um banco separado da produção**: aplicar a migração `0041` ou ligar
  flags ali afeta o mesmo banco.
- **Migração `0041` no banco HML isolado (11/11/2026, M2 parcial):** aplicada só em `forgelex-hml-isolated-pg`, por Cloud
  Run Job, com backup `1794441092040`; instância parada de novo. Esse banco estava na `persistence-0023`; as 18 migrações
  pendentes `0024` a `0040` foram aplicadas depois (backup `1794442309699`), sem pendência de persistência. Produção e o banco compartilhado `forgelex-hml-pg` não foram tocados. Detalhes no registro
  de execução, seção “M2 (parcial)”.
- **Migração `0041`:** o código publicado (`8fcd1d0`) não contém `persistence-0041`; ela só existe em `main`. Com
  `FORGELEX_AUTO_MIGRATE=false` em todos os serviços, não foi aplicada pelo deploy. Não li o registro de migrações do
  banco (a credencial é um segredo e não a li), então não há prova direta; o `/readyz` de produção responde 200 com
  `migrations: true`, o que só diz que as migrações conhecidas pela revisão estão aplicadas.
- **MCP em produção:** `tools/list` sem token dá 401, então não li a lista nominal. O log `mcp.call` registra
  `toolCount=21` em todos os dias (09, 10 e 11/11), com `serverVersion` `2.0.0+8fcd1d0` desde a publicação. O código
  do `8fcd1d0` define `research.*` (busca, verificação, obtenção, pesquisas salvas, painel de decisões), `case.*`
  (`get_context`, `list_shared`, `read_item`, `save_analysis`), `draft.save_from_ai`, `workflow.legal_research_memo`,
  `forgelex.connection_status` e os sete `analise.*` (`ANALISE_ENABLED=true`); isso soma 22 nomes contra 21 observados,
  então a lista exata em produção fica por confirmar com um cliente autenticado.
- **Preços em produção em 11/11** (código do `8fcd1d0`, política `commercial-brl-2026-10-30-v1`): pesquisa
  `research.search_case_law` R$ 0,20 por execução válida (única ferramenta MCP faturável; obtenção, verificação e memo
  gratuitos); trabalho comercial com **reserva de R$ 5,00**, mínimo de R$ 0,50, limite diário de R$ 20,00 e mensal de
  R$ 100,00; pacotes de R$ 25, 50 e 80, valor livre de R$ 25 a R$ 500 e recarga automática com limiar de R$ 5,00. A
  **reserva de R$ 11,50** estava apenas em `main` (PR #135) naquela data. A reconciliação de 12/11 registra a publicação e o teste do limite diário.
- **Clientes MCP** (`mcp.call` de 09/11 16:20 a 11/11 22:55 UTC; o log só existe desde 09/11; 128 linhas): Claude
  (`Claude-User`) 108, das quais 11 `tools/call`; ChatGPT (`openai-mcp/1.0.0`) 12, das quais 5 `tools/call`; Codex da
  OpenAI (`openai-mcp/1.0.0 (Codex)`) 8, sem nenhum `tools/call` (`initialize`, `server/discover`, `tools/list` e uma `resources/read`); **Gemini: nenhuma**. Os
  16 `tools/call` foram 12 `research.search_case_law` (8 Claude, 4 ChatGPT) e 4 `research.present_decisions`. Sem
  chave de idempotência (`idempotency=none`): 5 do Claude e 3 do ChatGPT.
- **Domínio:** canônico `nexojuris.ia.br` (`FORGELEX_PUBLIC_URL`, `FORGELEX_WEB_URL`, `FORGELEX_MCP_RESOURCE_URL` e
  `FORGELEX_OAUTH_AUTHORIZATION_SERVERS`). Registro.br (RDAP): ativo, registrado em 17/09/2026, expira em 17/09/2027,
  DNS do próprio Registro.br (`e.sec.dns.br`, `f.sec.dns.br`); o titular não é exposto no RDAP. `nexojuris.ia.br` e
  `hml.nexojuris.ia.br` resolvem para `34.160.73.22` (balanceador global); certificados gerenciados do Google
  (`forgelex-api-prod-cert` só com `nexojuris.ia.br`, válido até 20/12/2026; `forgelex-api-hml-cert` com
  `hml.nexojuris.ia.br`, até 19/12/2026). **URL de notificação do Mercado Pago** declarada:
  `https://nexojuris.ia.br/api/v2/webhooks/mercadopago`, tanto em `forgelex-api-prod` quanto em `forgelex-api-hml`
  (a homologação notifica o host de produção). `ratione.nexojuris.ia.br` **responde 200** (aplicação Next.js em outro
  balanceador, `34.120.34.54`, certificado próprio até 08/01/2027). `https://hml.nexojuris.ia.br/readyz` **não
  respondeu** em duas tentativas de 30 s e `/` devolveu 500.
- **Não consegui ler:** o registro de migrações do Cloud SQL (credencial); Site URL e Redirect URLs do Supabase Auth
  (as ferramentas disponíveis não expõem a configuração de Auth); a configuração no painel do Mercado Pago (só a URL
  declarada no serviço); registros CAA e a zona DNS (a API do Cloud DNS está desativada no projeto e o DNS é do
  Registro.br); as regras de host do balanceador; o build web de homologação.

## Publicação anterior — 09/11/2026 (UTC): SHA `5757733`

`5757733a54869f1d7d2e06e7b38ab7b99d4aeeb0` (`main`, PR #131: painel na própria pesquisa; CI verde). Imagem
`forgelex-api@sha256:58cd1f6f64b41de7cf2149ec7051b626372b92d1967018723ae9a566a68fc935`. Revisões
`forgelex-api-prod-5757733` e `forgelex-closure-hml-private-5757733` a 100%, criadas sem tráfego, conferidas contra as
`-b8c44ee` e trocadas por `deploy-from-main.ps1`, sem reversão e sem migration. Verificado: metadados OAuth respondem 200
e Boni confirmou o painel sem pedido no Claude e no ChatGPT. Reversão: `--to-revisions=...-b8c44ee=100` nos dois serviços.

Publicações do mesmo dia, em ordem, todas por `deploy-from-main.ps1` e sem migration: `9e2a30f` (PR #128, alias
`POST /token`), `a44035e` (PR #129, log `mcp.call` e registro das decisões, digest
`sha256:120ac9071d1b920e424b2fa50fada25dcae822fc9d6d80c5dbf8498b4c94ff38`) e `b8c44ee` (PR #130, descrições da chave e do
painel, digest `sha256:7b26faabc0a0efc238dbfbf6216a2a6e6a491509468aee88ea4790e03a9bfb3e`).

## Publicação anterior — 09/11/2026 (UTC): SHA `9e2a30f`

`9e2a30f84413a6f2ef9830bb35a85b9ead9f0cf3` (`main`, PR #128: alias `POST /token` na raiz; CI verde). Imagem
`forgelex-api@sha256:ab151b746c8ed989010b3a1e99469f1b5ca98096e832180a9f17707d160ae3a1`. Revisões
`forgelex-api-prod-9e2a30f` e `forgelex-closure-hml-private-9e2a30f` a 100%, conferidas contra as `-e799141` e
trocadas por `deploy-from-main.ps1`, sem reversão e sem migration. Verificado: `POST /token` com corpo de teste
responde 400 `invalid_target` (antes, 404) e os metadados OAuth respondem 200. **Não observado ainda:** a renovação
real do Claude pelo alias (procurar `oauth.token_issued` com `path="/token"` e ausência de novos 404). Reversão:
`--to-revisions=...-e799141=100` nos dois serviços.

**Decisões de Boni, 09/11/2026:**

- **M5 (limites contam consumo ainda não faturado):** mantido. O limite é conservador e impede estourar o teto, ao
  custo de poder bloquear o cliente por valores que depois não viram cobrança.
- **A1 (cancelar durante a chamada mantém o tenant bloqueado até a reconciliação):** mantido, para evitar cobrança
  dupla ou sem controle.
- **Log do balanceador:** autorizado e **ligado em `forgelex-api-prod-backend`** (taxa de amostragem 1,0) em
  09/11/2026. Os backends de homologação (`forgelex-api-hml-backend`, `forgelex-api-hml-isolated-backend`) e
  `nexohub-hub-backend` continuam desligados. Cuidado com o custo de ingestão do Cloud Logging.
- **Painel do conector:** o teste de chamada do ForgeLex no Claude deu certo (painel `research.present_decisions`
  exibido); o painel precisa ser pedido expressamente ("abra o painel").

## Publicação anterior — 09/11/2026 (UTC): SHA `e799141`

`e799141f1ed598ec70e4eeffa8434db5f6b6ce0a` (`main`, PR #127: log do motivo de `/oauth/token`; CI verde).
Cloud Build `e94e996a-437a-4a20-917c-400b9852a5bd` (SUCCESS, 01:22 UTC, 4m47s), imagem
`forgelex-api@sha256:3c181937fb1e8a585ea7e96f07fde79f137661a9014ea9d936bd04c55a54dc42`. Revisões
`forgelex-api-prod-e799141` e `forgelex-closure-hml-private-e799141` a 100%, criadas sem tráfego, conferidas contra as
`-e7cf3b7` (só imagem e `FORGELEX_SOURCE_SHA` mudaram) e trocadas por `deploy-from-main.ps1`, que terminou sem
reverter. Sem migration. Verificado: metadados OAuth públicos respondem 200 e o log novo já grava `oauth.token_issued`.
Reversão: `--to-revisions=...-e7cf3b7=100` nos dois serviços.

## Publicação anterior — 08/11/2026 (UTC): SHA `e7cf3b7`

Registro feito depois da publicação, a partir do que se lê hoje em produção (somente leitura). Código
`e7cf3b7e6f3dc31e2380b91bf5bed1e630763597` (`main`, PR #126; CI verde para este SHA). Imagem
`forgelex-api@sha256:efdc5ad5e2d149932b1312c2b32116896458eceed491a4eaaf0bc9989441b23d`, gerada pelo
Cloud Build `384c726b-68c8-4b01-865f-ec63aafacb03` (SUCCESS, 05:57:48 a 06:02:24 UTC, 4m36s). Revisões criadas às
06:02:46 UTC (encerramento) e 06:03:19 UTC (API). Quem executou a publicação e o horário da troca de tráfego não
constam nos dados lidos; o que se afirma abaixo é o estado, não o procedimento.

- **O que mudou em produção:** a correção da conexão MCP no Claude (#126): `toolJsonSchema` achata união de objetos
  em `type: "object"`, o handler omite e registra `mcp.tool_schema_invalid` qualquer ferramenta cujo schema ainda
  não seja objeto, e `serverInfo.version` passa a ser `2.0.0+<sha7>`. Causa raiz e testes na seção
  "Conector MCP no Claude", acima.
- **Estado conferido em 08/11/2026:** `forgelex-api-prod` e `forgelex-closure-hml-private` com 100% do tráfego em
  `-e7cf3b7`, a mesma imagem (digest acima) nos dois, `FORGELEX_SOURCE_SHA` igual ao SHA. `FORGELEX_AUTO_MIGRATE=false`
  nos dois. Flags: API com execução agêntica, execução comercial e editor comercial `true`; encerramento com
  agêntica e comercial `false` e editor comercial `true`, como antes.
- **Sondas públicas** (`https://nexojuris.ia.br`, por esta conferência): `/health` 200, `/readyz` 200 e `POST /mcp`
  sem token 401.
- **Sem migration e sem backup novo** neste SHA: não há migration entre `68810ae` e `e7cf3b7` neste registro
  (conferido pelas PRs #124 a #126, só código do MCP e documentação).
- **Reversão, se precisar:** `gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-68810ae=100`
  e o mesmo para `forgelex-closure-hml-private-68810ae`.
- **Confirmado por Boni em 08/11/2026, no chat do Claude:** numa conversa sobre jurisprudência de Maria da Penha, o
  ForgeLex foi achado e chamado, e `research.present_decisions` abriu o painel "Decisões selecionadas" (1 de 5; STJ
  2015598, Terceira Seção, Tema Repetitivo 1186). A evidência é uma captura de tela enviada por Boni; os logs
  desse horário não foram conferidos. Isso comprova o efeito da correção do #126 no chat; a lista antes
  descartada por inteiro agora chega ao modelo.
- **Ainda não verificado:** `initialize` autenticado devolvendo a versão com o SHA, o tamanho do `tools/list` nos
  logs e se a pesquisa cobrada enviou `idempotencyKey` (a captura mostra o painel, não a chamada). A renovação do
  token do Claude (400/404 em 11/10, 18/10 e 03/11) segue sem causa provada.

## Publicação anterior — 08/11/2026 (UTC): SHA `68810ae`

Publicado em 08/11/2026, entre 01:53 e cerca de 02:00 UTC (07/11, à noite, em Brasília), a pedido de Boni,
com `deploy-from-main.ps1`. Código `68810ae4955c6dbb95ca9b3b185aeba28270db05` (`main`, CI verde). Imagem
`forgelex-api@sha256:3b22d5267da290b75aded92b6593e49c641b5b366bc8e13361c8d23127eb6da0`,
gerada pelo Cloud Build `1684e28a-74e7-4dcd-a1b9-f8b941ce69c3` (4m34s).

- **O que mudou em produção:** o `tools/list` do MCP prefixa a descrição de cada ferramenta (#124,
  `packages/mcp-server/src/tool-discovery.ts`). As de pesquisa (`research.*`, `workflow.legal_research_memo`)
  dizem "ForgeLex: buscar e pesquisar jurisprudência (jurisprudencia)…", com e sem acento; as demais ganham só
  "ForgeLex:". Nenhum nome mudou. Motivo, medido na busca de ferramentas do Claude: não diferencia maiúscula
  de minúscula, mas diferencia acento, e só olha nome e descrição. "buscar jurisprudencia furto" achava só o
  `enam-estudo` (`buscar_jurisprudencia`); os nomes do ForgeLex são em inglês. Maiúscula, minúscula e acento
  não afetam a conexão, só a descoberta.
- **Revisões:** `forgelex-api-prod-68810ae` e `forgelex-closure-hml-private-68810ae`, comparadas com as
  `-731b326` pelo script (só imagem e `FORGELEX_SOURCE_SHA` mudaram) e depois com 100% do tráfego.
- **Sem migration e sem backup novo.**
- **Verificação:** feita pelo script e conferida à mão: `/health` e `/readyz` 200, `/mcp` sem token 401,
  `forgelex_connection_status` autenticado.
- **Reversão acidental e correção:** depois da publicação, o `forgelex-closure-hml-private` foi devolvido por
  engano para `-731b326`, enquanto a API ficou em `-68810ae`. O encerramento foi reposto em `-68810ae`
  (`update-traffic ... --to-revisions=forgelex-closure-hml-private-68810ae=100`) e os dois serviços foram
  conferidos a 100% em `-68810ae`, com as sondas públicas iguais. Os serviços diferem só em código e não
  há migration neste SHA, então não houve efeito em dados.
- **Reversão, se precisar:** `gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-731b326=100`
  e o mesmo para `forgelex-closure-hml-private-731b326`.
- **Não verificado:** que as descrições novas cheguem ao Claude e ao ChatGPT e que "buscar jurisprudencia
  furto" já traga a ferramenta do ForgeLex. A lista só é lida de novo numa conversa nova: abrir uma, pedir uma
  busca com `@forgelex` e conferir nos logs o tamanho do `tools/list` (era 61 KB) e as ferramentas chamadas.
  Se continuar atrás do `enam-estudo`, o passo seguinte é o campo `title` das ferramentas.
- **Log do balanceador continua desligado** nos backends (ver a publicação anterior); ligar exige decisão de
  Boni.

## Publicação anterior — 08/11/2026 (UTC): SHA `731b326`

Publicado em 08/11/2026, entre 00:29 e 00:36 UTC (07/11, à noite, em Brasília), a pedido de Boni, com
`deploy-from-main.ps1`. Código `731b326c542dfbb713d41fea67f17e5c5cc19d5f` (`main`, CI verde). Imagem
`forgelex-api@sha256:6ed7728fe63b1f0e8c6a333b1427b3c778e0aaa6b0d6ffbddde423beb5547fda`,
gerada pelo Cloud Build `89edc938-877d-41bb-8358-a9c5b28969fb` (5m06s).

- **O que mudou em produção:** o `initialize` do MCP passa a devolver `instructions` (#122,
  `MCP_SERVER_INSTRUCTIONS`): pesquisa de jurisprudência no índice persistido do STJ, ordem
  `search_case_law` → `get_authority` → `verify_authority`, citar só o que veio verificado. Motivo: às 20:03
  (BRT) de 07/11 o Claude fez a pesquisa pelo `enam-estudo` e ignorou o conector; o servidor respondeu 200 a
  todo o handshake e não houve 5xx em 6 horas, e o `enam-estudo` entrega instruções ao modelo e o ForgeLex não.
- **Revisões:** `forgelex-api-prod-731b326` e `forgelex-closure-hml-private-731b326`, comparadas com as
  `-430229b` pelo script (só imagem e `FORGELEX_SOURCE_SHA` mudaram) e depois com 100% do tráfego.
- **Sem migration e sem backup novo.**
- **Verificação:** feita pelo script e conferida à mão: tráfego 100% nas revisões novas, `/health` e `/readyz`
  200, `/mcp` sem token 401, `forgelex_connection_status` autenticado.
- **Reversão:** `gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-430229b=100`
  e o mesmo para `forgelex-closure-hml-private-430229b`.
- **Verificado depois:** às 00:57:01 UTC o `initialize` do `Claude-User` respondeu com 1635 bytes (antes, 657),
  então as instruções são entregues. Os logs não mostraram 5xx depois da publicação.
- **Continuou sem efeito:** o Claude seguiu tratando o ForgeLex como indisponível, porque a busca de
  ferramentas dele não achava as do ForgeLex (nomes em inglês, acento diferenciado). Resolvido na publicação
  seguinte (`68810ae`), ainda não confirmada no Claude.
- **Log do balanceador desligado** nos backends (`forgelex-api-prod-backend` e demais): um 502 gerado no
  balanceador, ou antes dele, não deixa rastro. Ligar exige decisão de Boni.

## Publicação anterior — 07/11/2026: SHA `430229b`

Publicado em 07/11/2026, entre 21:09 e 21:17 UTC, a pedido de Boni, pela primeira vez com
`ops/gcp/production/deploy-from-main.ps1`. Código `430229b632067a18469128d67d6712090e0b1a0e`
(`main`, CI verde). Imagem
`forgelex-api@sha256:66956dd004ff77d81341c98d6a443810a04d391c52f250ffe5aebe68f24beedf`,
gerada pelo Cloud Build `1d2d276c-23ac-45ed-95d2-38f3267a9de5` (5m01s).

- **O que mudou em produção:** nada de runtime. Do `173f4c3` ao `430229b` entraram só a documentação (#118)
  e os scripts de deploy (#119 e #120). O objetivo foi exercitar o script de ponta a ponta.
- **Revisões:** `forgelex-api-prod-430229b` e `forgelex-closure-hml-private-430229b`, criadas sem tráfego;
  o script comparou cada uma com a anterior e só a imagem e `FORGELEX_SOURCE_SHA` mudaram. Depois receberam
  100% (encerramento primeiro, API depois). Substituições de build reaproveitadas do build `22cd01ef`, com as
  flags de interface `AGENTIC_WORKSPACE`, `CASE_WORKSPACE` e `SAVED_RESEARCH` em `true`.
- **Sem migration e sem backup novo:** o script não aplica migrations e este SHA não altera o schema.
- **Verificação:** feita pelo script (`/health` e `/readyz` 200, `/mcp` sem token 401, sem 5xx nos logs) e
  conferida depois à mão: tráfego 100% nas revisões novas e as três sondas públicas com o mesmo resultado.
- **Reversão:** `gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-173f4c3=100`
  e o mesmo para `forgelex-closure-hml-private-173f4c3`.
- **Como se publica:** `./ops/gcp/production/deploy-from-main.ps1` (`-DryRun` antes). Detalhes no
  [README de produção](ops/gcp/production/README.md).
- **Primeira tentativa (SHA `782a275`) parou sem efeito:** a comparação de revisões tinha um bug
  (`Compare-RevisionConfig` devolvia array embrulhado e recusava qualquer deploy), corrigido no #120.
  Produção não foi alterada; sobrou a revisão `forgelex-closure-hml-private-782a275`, sem tráfego, e a imagem
  `:782a275`, que podem ser apagadas.

## Publicação anterior — 07/11/2026: SHA `173f4c3`

Publicado em 07/11/2026, entre 17:35 e 17:43 UTC, a pedido de Boni. Código
`173f4c3e87e3fb51015bb4832f79a1a2846e7126` (`main`, CI verde). Imagem
`forgelex-api@sha256:d083524659b829e363ac2fb6672519e189b8afed5c5489001d3719056897360f`,
gerada pelo Cloud Build `6004a5cc-758d-427f-9d4e-a79313a9a054` (4m35s).

- **Revisões:** `forgelex-api-prod-173f4c3` e `forgelex-closure-hml-private-173f4c3`, criadas sem tráfego
  e comparadas com as anteriores: só mudaram a imagem e `FORGELEX_SOURCE_SHA` (47 e 34 variáveis
  idênticas; mesmos recursos, conta de serviço, escala e timeout). Depois receberam 100% do tráfego.
  Flags preservadas: `FORGELEX_AUTO_MIGRATE=false` e `FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=true`.
- **Sem migration e sem backup novo:** nenhum dos PRs #112 a #117 altera o schema.
- **Verificação:** `/health` e `/readyz` 200 e `/mcp` sem token 401, em 6 tentativas seguidas;
  `forgelex_connection_status` autenticado; nenhum 5xx nem erro de aplicação nos logs da revisão nova
  (os 6 avisos vistos eram as sondagens `/mcp` sem token, com 401 esperado).
- **Reversão:** `gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-d2a329d=100`
  e o mesmo para `forgelex-closure-hml-private-d2a329d`.
- **Como se publicou (manual, antes do script):** o repositório não tem deploy automático (o `ci.yml` só valida e não há gatilho de
  Cloud Build). O `build-from-main.ps1` **não passa** `_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED` nem
  `_VITE_FORGELEX_CASE_WORKSPACE_ENABLED`, e o `cloudbuild.yaml` assume `false`. O build de 07/11 reaproveitou
  as substituições do build anterior (`gcloud builds describe`), trocando só `_SOURCE_SHA`; repetir esse
  caminho evita publicar o front sem a mesa agêntica. Depois: `gcloud run deploy ... --no-traffic
--revision-suffix=<sha7> --update-env-vars=FORGELEX_SOURCE_SHA=<sha>` nos dois serviços e
  `update-traffic --to-revisions=<revisão>=100`.

## Melhorias de código após 06/11/2026 (em `main` e publicadas em 07/11)

Cinco PRs de revisão técnica, todos mergeados em 07/11/2026, sem migration:

| PR   | Mudança                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #112 | MCP falha fechado sem tenant/usuário autenticado (`MCP_IDENTITY_REQUIRED`); limite de 120 `tools/call` por minuto por tenant e usuário em `/mcp` (`FORGELEX_MCP_RATE_LIMIT_PER_MINUTE`, `0` desliga, vale por instância); remoção de `PolicyEngine.sanitizeDocumentContent`, sem uso |
| #113 | MCP responde `ping`; negociação de `protocolVersion` dentro do handler, sem mudar o resultado                                                                                                                                                                                        |
| #114 | `getExecution` e `listClientEvents` leem em snapshot somente leitura (sem lock de tenant, sem bump de versão, sem `UPDATE`)                                                                                                                                                          |
| #115 | Apontamento (`finding`) nunca torna a entrega cobrável sozinho; só afirmação fundamentada, minuta ou matriz probatória verificada. Uma revisão cujo único resultado seja um apontamento deixa de ser cobrada                                                                         |
| #116 | `tools/call` do handler MCP dividido por família de ferramenta; modelo do piloto unificado em `PILOT_POLICY.model`                                                                                                                                                                   |

Os checks da CI de cada PR passaram antes do merge. Antes de 07/11 às 17:35 UTC nenhum deles estava em
produção (a revisão em uso era `forgelex-api-prod-d2a329d`, do PR #111); a publicação acima os levou
juntos, com o #117 (somente documentação). Pendências abertas desta frente:

- Conferir recibos de execuções pagas reais depois da publicação (a regra de cobrança do #115 mudou e
  ainda não houve execução paga registrada com ela).
- Ensaio comercial completo pago em produção (decisão e execução de Boni).
- Fallback de versão do MCP: hoje 2024-11-05 para versões desconhecidas; a especificação sugere a mais
  recente. Só trocar depois de testar em host MCP real.
- `getExecution` ainda lê até 1000 execuções da conversa e faz o parse de cada uma (custo de CPU).
- Os `playwright.*.config.ts` seguem na raiz (usados por nome no `package.json` e na CI).

## Estado publicado anterior (06/11/2026) — mesa corrigida e editor comercial ativo

As correções da PR #107 estão publicadas no código
`ef818d6079999cf1cccc116afda6048aaaf4c7e2`: conversa única, seletor opcional
em Automático, histórico lateral e exclusão recuperável. Salvamento automático
mantido. Backup concluído e migration 0039 aplicada; journal com 52 entradas,
sem pendências na conferência posterior.

Em 06/11/2026, Boni autorizou ativar o editor comercial. API e encerramento
recebem 100% do tráfego nas revisões `forgelex-api-prod-ef818d6-ed1` e
`forgelex-closure-hml-private-ef818d6-ed1`, com a mesma imagem validada.
`FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=true` nos dois serviços;
`FORGELEX_AUTO_MIGRATE=false` preservado. A confirmação de cobrança por trabalho
continua obrigatória, inclusive para revisão concluída sem sugestões.

Conferência visual autenticada realizada em desktop e celular, sem chamada paga
ou gravação de documento. O ensaio comercial completo em produção e a avaliação
jurídica de novas entregas não são resultados desta conferência.

[Recibo das correções, backup e migration](docs/operations/agentic-workspace/2026-11-05-conversation-publication.md).
[Ativação editorial, conferência visual e limites](docs/operations/agentic-workspace/2026-11-06-editorial-activation.md).
Os estados abaixo são históricos e não substituem esta configuração atual.

## Publicação anterior — mesa de edição integrada

Elaboração e revisão reunidas na mesa, com conversa ao lado da peça, edição
básica no navegador e exportação Word/PDF. PR #105 integrada e fonte
`98f6c3d36e10cfed3b4482c52075d02a8f77af8b` publicada após os seis checks
da PR e do merge. API e encerramento recebem 100% do tráfego nas revisões
`forgelex-api-prod-98f6c3d` e `forgelex-closure-hml-private-98f6c3d-r2`.
Navegação e recolhimento da peça conferidos em sessão autenticada publicada.
O editor comercial continua desativado; não houve migration, chamada paga
ou uso de Docling na nuvem. Avaliação visual de Boni permanece distinta dos
testes automatizados e do smoke técnico.
[Recibo desta publicação](docs/operations/agentic-workspace/2026-11-05-mesa-publication.md).
[Escopo e limites](docs/architecture/2026-11-05-mesa-editor-integrado.md).

## Publicação anterior — 05/11/2026, editor e política comercial

PR #103 integrada e SHA `a5d97628f0a63e26f3c6eb72ba5cd4444a332ee9` publicado
após os seis checks da CI. Naquela publicação, API e encerramento receberam 100% do tráfego
nas revisões `forgelex-api-prod-a5d9762` e
`forgelex-closure-hml-private-a5d9762`, com o mesmo digest.
Backup manual `1793909132283` concluído; migrations 0037 e 0038 aplicadas;
journal remoto conferido com 51 entradas, sem pendências ou IDs inesperados.

**Editor comercial desativado nos dois serviços**, conforme decisão de Boni:
`FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=false`. Auto-migration permanece
`false`. As flags comerciais preexistentes foram preservadas.
Readiness e rotina de encerramento responderam 200 nas novas revisões.
[Recibo, digest, verificações e limites](docs/operations/agentic-workspace/2026-11-05-publication.md).

A ativação editorial, novos ensaios pagos e a avaliação de patches não vazios
continuam separados. Não houve teste autenticado completo da interface nem de
aba previamente aberta neste deploy. Avisos de listeners na inicialização
estão registrados no recibo, sem diagnóstico de vazamento de memória.
Os estados locais e sem publicação abaixo são históricos das respectivas etapas.

## Incremento local de 05/11/2026 — editor e política comercial

Boni decidiu cobrar a revisão concluída mesmo sem sugestões de alteração.
A integração local reutiliza a política comercial e o executor durável:
reserva BRL, teto USD, comando independente, recuperação de proposta/recibo,
confirmação no painel e cancelamento. O histórico financeiro continua
consultável após nova versão da minuta e sem depender dos dados da aba.

Validação local: 1.780 testes aprovados e 17 condicionais ignorados;
66 testes PostgreSQL e 15 E2E aprovados. Build, tipos, lint e formatação
aprovados no escopo registrado.

A composição permanece opt-in, desativada por padrão. Nenhuma chamada paga,
commit, push, migration operacional ou publicação ocorreu nesta etapa.
D04-v8 permanece residual não bloqueante, com US$ 0,083620 reservados.
[Implementação, validação e limites](docs/architecture/2026-11-05-editorial-commercial-integration.md).

## Estado vigente — campanha v9 e consolidação local de 04/11/2026

Esta seção prevalece sobre os estados históricos abaixo. A campanha v9 foi
autorizada e concluída: D04-V2, D01-V2, D03-V2, V2-FIT, V2-INTEGRITY e V2-MULTI
produziram entregas originais `LIMITED`, preservadas como evidência histórica.
Boni aprovou as seis versões derivadas: V2-MULTI, D04-V2, D01-V2, D03-V2,
V2-FIT e V2-INTEGRITY, no escopo dos excertos e ressalvas nelas registrados.
A avaliação final dessas versões está concluída; as saídas originais e seus
alertas não foram reclassificados. Foram 28 chamadas e US$ 0,572246 calculados
pelo uso retornado. A reserva histórica
**US$ 0,083620 permanece integralmente retida**; exposição acumulada
US$ 0,655866, abaixo do teto autorizado de US$ 1,50. Não há nova incerteza de
custo nesta campanha. O saldo de US$ 0,844134 não autoriza outra campanha.
[Resultados e recibos](docs/architecture/2026-11-04-v9-final-results.md).

O bloqueio `INTERNAL_IDENTIFIER_IN_OUTPUT` foi corrigido e V2-FIT retomou
somente o verificador pendente. A repetição residual de V2-MULTI recebeu
[consolidação local derivada e rastreável](docs/architecture/2026-11-04-v9-multi-consolidation.md),
sem reescrever a entrega, o checkpoint ou o ledger originais. Diferenças de
escopo, fontes, condições e ressalvas permanecem separadas; essa correção não
comprova que futuras gerações sempre declararão equivalências corretamente.

[Validação final](docs/architecture/2026-11-04-suite-timeouts.md): build e suíte
completa aprovados, **1.772 testes aprovados, 17 ignorados, zero falhas**.
Os dois arquivos de integração usam limite de 15 segundos por teste; o limite
geral, os deadlines do produto e a concorrência permanecem iguais, sem retries.
Lint focado e formatação aprovados. Na consolidação, a checagem adicional dos
scripts identificou mistura de logs no JSON do CLI editorial; a trilha passou
a arquivo próprio, preservando a saída JSON. Essa correção posterior foi
validada por build da API e testes focados, sem repetir a suíte integral.
Os ensaios de navegador e PostgreSQL
registrados em etapas anteriores mantêm seu escopo histórico; não foram
reexecutados integralmente nesta última correção.

As alterações foram consolidadas em commits locais, por autorização de Boni
em 04/11; ver [recibo da consolidação](docs/architecture/2026-11-04-local-consolidation.md).
Esta consolidação não autoriza chamadas pagas adicionais, push, integração remota,
ativação automática, migrations operacionais ou publicação. O padrão permanece
v8; v9 e geração editorial real continuam opt-in.

### Pendências efetivas, em ordem recomendada

1. **Avaliação de Boni — concluída para as seis versões derivadas:**
   V2-MULTI, D04-V2 e D01-V2 tiveram suas versões consolidadas aprovadas;
   D03-V2, V2-FIT e V2-INTEGRITY tiveram suas versões ajustadas aprovadas.
   Decisões vinculadas ao hash de cada texto:
   [V2-MULTI](docs/architecture/evidence/2026-11-04-boni-v9-assessment/V2-MULTI-13-final-assessment.json),
   [D04-V2](docs/architecture/evidence/2026-11-04-boni-v9-assessment/D04-V2-07-final-assessment.json),
   [D01-V2](docs/architecture/evidence/2026-11-04-boni-v9-assessment/D01-V2-06-final-assessment.json),
   [D03-V2](docs/architecture/evidence/2026-11-04-boni-v9-assessment/D03-V2-adjusted-final-assessment.json),
   [V2-FIT](docs/architecture/evidence/2026-11-04-boni-v9-assessment/V2-FIT-adjusted-final-assessment.json) e
   [V2-INTEGRITY](docs/architecture/evidence/2026-11-04-boni-v9-assessment/V2-INTEGRITY-adjusted-final-assessment.json).
   O [caderno ajustado](docs/architecture/evidence/2026-11-04-boni-v9-assessment/remaining-phases-adjusted-review.md)
   contém as três últimas versões. Não há nova rodada de aprovação por trecho
   pendente para esses textos. As limitações do corpus, divergências documentais,
   lacunas factuais e ressalvas de integridade permanecem; em D04-V2, a aptidão
   para protocolo não foi demonstrada. A aprovação não altera alertas, statuses,
   checkpoints ou ledgers originais e não comprova qualidade geral das gerações
   futuras. Não equivale a aplicação no ForgeLex ou publicação. As fichas
   históricas v8 continuam pendentes e não recebem resultados v9.
   Os registros de revisão e conciliação agregada permanecem locais, ainda sem
   commit nesta etapa; commit, push e publicação dependem de autorização própria.
2. **Reconciliação histórica de D04-v8 — pendência residual não bloqueante:**
   os CSVs fornecidos por Boni para 03/11/2026 UTC coincidem exatamente com
   68 chamadas reais conhecidas das campanhas v6/v7/v8: 225.512 tokens de
   entrada e 35.584 de saída. O custo exportado de US$ 0,035196 coincide
   aritmeticamente com os tokens das quatro requisições `default`; as outras
   64 aparecem como `incentivized-tier`, sem valor adicional aparente nesse
   CSV. Não é necessário consumo extra para explicar os totais exportados.
   Ver [conciliação agregada e limites](docs/architecture/2026-11-04-d04-aggregate-reconciliation.md).
   Isso não identifica individualmente a tentativa incerta nem confirma sua
   não cobrança. **Manter US$ 0,083620 reservados e o status original UNCERTAIN.**
   Por decisão expressa de Boni, a identificação individual e a causa histórica
   permanecem residuais, sem bloquear o trabalho e sem liberar a reserva.
   A conferência adicional do uso de 04/11 coincidiu com as 28 chamadas da v9
   (140.938 tokens de entrada e 29.037 de saída), sem diferença; ver
   [registro e autorização de prosseguimento](docs/architecture/evidence/2026-11-04-editorial-release-preflight/nov04-usage-and-proceed-decision.json). Nenhum ledger, custo histórico ou limite foi reescrito; não
   inferir gratuidade geral do tier ou liberar a reserva a partir do agregado.
3. **Ampliação da avaliação:** selecionar a próxima amostra a partir da revisão
   de Boni. Os outros 54 lugares do plano original não foram executados;
   corpus, prioridades, critérios e orçamento exigem decisão específica antes
   de novas chamadas. Não repetir automaticamente cenários já concluídos.
4. **Editor final real — primeiro ensaio concluído:** uma chamada, custo
   calculado de US$ 0,011562, sem custo novo incerto e sem aplicação à minuta.
   [Resultado e limites](docs/architecture/2026-11-04-editorial-real-pilot.md).
   A proposta não contém alterações; ainda não mede a qualidade de patches
   não vazios nem homologa a apresentação comercial das limitações retornadas.
   A autorização de uma execução foi consumida; não repetir automaticamente.
5. **Integração/publicação — concluída em 05/11:** PR #103 integrada,
   CI do merge aprovada, backup e migrations aplicados e os dois serviços
   publicados. Ver o [recibo](docs/operations/agentic-workspace/2026-11-05-publication.md).
   Teste autenticado completo da interface e de aba previamente aberta não
   foram realizados nesta publicação; não inferir essa homologação do readiness.
6. **Ativação comercial editorial — desativada por decisão de Boni:**
   a admissão por comando e a cobrança da revisão concluída mesmo sem sugestões
   estão implementadas e publicadas. A flag permanece `false` nos dois serviços.
   Ativação e novo ensaio pago exigem autorização própria; a publicação não
   abre essa oferta. O ensaio anterior vazio não valida patches não vazios.
7. **Backlog humano/operacional histórico:** atualizar a situação das
   homologações residuais nos hosts ChatGPT/Claude, comprovações fiscais,
   contratos efetivos e conciliação dos R$ 25. Os registros de outubro abaixo
   não foram revalidados em produção nesta etapa; não são fatos atuais
   confirmados. Boni permanece o único avaliador e aprovador humano.

## Histórico: correções locais da avaliação v8 — 03/11/2026

O [relatório por achado](docs/architecture/2026-11-03-forgelex-v9-review-remediation.md)
registra as correções opt-in v9: diagnóstico e checkpoint antes do despacho,
consolidação com proveniência, registro documental literal, aptidão documental,
alertas de integridade e separação das seções na mesa. O padrão continua v8.
A ficha humana, o corpus e os registros v8 permanecem intactos. A análise de
Claude é apoio técnico; não preenche a avaliação jurídica pendente de Boni.

Permanecem: causa histórica indeterminada de D04, reconciliação dos US$ 0,083620
reservados com evidência independente do provedor, avaliação humana, medição
semântica real da v9 e consolidação em commit quando autorizada. Foi preparada
proposta de seis execuções com teto US$ 1,50, sem autorização ou execução paga.
Não houve aplicação automática, push ou deploy nesta correção. O recibo
vinculado ao relatório registra os testes locais desta etapa; números abaixo
continuam sendo evidência histórica das etapas anteriores.

## Continuação editorial e calibração v8 — 03/11/2026

Este registro histórico prevalecia sobre as etapas anteriores; o estado vigente
de 04/11/2026 acima o atualiza para esta frente.
A aplicação humana foi consolidada em `adc823b`; concorrência e PostgreSQL
foram validados; a [conexão editorial local](docs/architecture/2026-11-03-forgelex-editorial-real-connection.md)
tem comando executável, ledger próprio e importação na mesa. API/interface são
opt-in, sem ativação automática no bootstrap. Nenhuma geração editorial paga.

Build e suíte geral: 1.737 aprovados, 17 ignorados, zero falhas. PostgreSQL:
58 aprovados; navegador: 11 editoriais e três da mesa; Node: 22. Tipos, lint e
formatação passaram. O [recibo local](docs/architecture/evidence/2026-11-03-editorial-continuation/validation.json)
registra os ensaios e o timeout anterior, resolvido sem ampliar o limite.

[Calibração real v8](docs/architecture/2026-11-03-forgelex-recalibration-v8-results.md):
seis execuções tentadas, 18 chamadas enviadas, 17 liquidadas e US$ 0,189408
calculados. D01/D03 entregaram com ressalvas. D04 falhou na primeira chamada do
orquestrador; custo incerto reservado de até US$ 0,083620. Exposição máxima da
campanha: US$ 0,273028. Sem entrega D04 nem medição do verificador nesta rodada.

Pendências atuais: reconciliar o custo incerto e investigar o diagnóstico
localmente; avaliação de D01/D03 por Boni na [ficha preparada](docs/architecture/2026-11-03-forgelex-v8-human-review.md);
consolidar as mudanças posteriores ao primeiro commit quando autorizado.
A [integração/publicação está preparada](docs/operations/agentic-workspace/2026-11-03-editorial-integration-preparation.md),
com compatibilidade e migrations identificadas, mas não executada.
Uma nova medição paga exige decisão própria após conferência financeira.
Os outros 54 cenários, ativação comercial multiusuário, push e deploy não foram
executados. Nenhuma alteração de minuta foi aplicada automaticamente.

## Aplicação humana versionada — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-application.md):
trabalho editorial anterior consolidado no commit `cb5c16a`. Nova etapa local
permite selecionar ajustes aceitos, fundamentar e confirmar a criação de versão
HUMAN/DRAFT derivada, com recibo atômico no histórico. Original e entrega intactos;
sem aprovação jurídica implícita ou aplicação ao clicar em Concordar.
135 testes focados, 12 de navegador (nove editoriais e três da mesa), build e
suíte geral aprovados: 1.729 testes, 17 ignorados, zero falhas. Revisão sem achados
críticos ou importantes. Mesa, v8 e limites preservados;
sem chamadas pagas, push ou deploy. Geração real e publicação permanecem posteriores.

## Revisão humana editorial na mesa — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-human-review.md):
diálogo na entrega compara trechos e ressalvas, valida proposta importada e salva
Concordar/Rejeitar/Adiar com fundamento, autor e data no histórico do caso.
Nenhuma decisão aplica texto ou aprova conteúdo jurídico. Histórico permanece
consultável após nova versão/contexto, com novas decisões bloqueadas se obsoleto.
Replay idempotente e reconciliação por comando cobrem resposta perdida/conflito.
117 testes focados e 10 Playwright aprovados; três achados de revisão corrigidos.
Build completo aprovado; suíte geral: 1.711 aprovados, 17 ignorados, zero falhas.
Migração 0038 e reconciliação testadas só em bancos descartáveis.
Mesa, v8 e limites preservados; sem IA paga, commit, push ou deploy. Geração real
e aplicação humana versionada continuam como etapas posteriores.

## Geração simulada do editor final — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-generation.md):
gerador separado do v8 recebe minuta autorizada e versionada, aceita uma única
proposta estruturada e revalida acesso/contexto antes da resposta. API local
opt-in; factory ausente no bootstrap, somente provedor simulado nesta etapa.
105 testes focados aprovados. Revisão independente encontrou duas bordas de
submissão/desconexão, reproduzidas e corrigidas. Build completo e suíte geral:
1.699 aprovados, zero falhas e 17 condicionais ignorados.
Nenhuma proposta é aplicada ou persistida. Mesa, v8 e limites preservados; sem
chamadas pagas, commit novo, push ou deploy. Geração real, interface de revisão
e aplicação humana versionada continuam como etapas posteriores.

## Editor final ligado à minuta autorizada — 03/11/2026

[Implementação e validação](docs/architecture/2026-11-03-forgelex-editorial-binding.md):
API local prepara contexto editorial da entrega persistida e valida propostas
recarregando autorização, versão, texto e fontes. Exige sessão, escopos e dono;
recusa versão/contexto obsoleto, fonte incompleta e fato aprovado alterado.
Validação: 20 testes editoriais, 78 focados, build completo e 1.672 testes gerais
aprovados; zero falhas e 17 condicionais ignorados. Lint, tipos e formatação passam.
Nenhuma proposta é gerada por modelo, aplicada ou persistida nesta etapa.
Mesa, v8 e limites preservados; sem chamadas pagas, commit novo, push ou deploy.
Próximas etapas separadas: geração de propostas e aplicação humana versionada.

## Contrato do editor final implementado localmente — 02/11/2026

[Implementação e evidências](docs/architecture/2026-11-02-forgelex-final-editor-contract.md):
schemas, validador puro e fixtures em `legal-agents`. Propostas vinculadas a
versão/hash, trechos UTF-16 exatos, fontes existentes e revisão humana; nenhum
patch é aplicado. 31 testes próprios e 228 focados aprovados; lint e tipos
aprovados. Build completo e suíte geral: 1.652 aprovados, zero falhas e 17
condicionais ignorados. Unicode malformado e auditoria duplicada rejeitados.
O papel ainda não foi ativado: integração com minuta persistida/autorizada,
runtime e aplicação das propostas permanecem futuras. V8, mesa e limites
preservados; sem chamadas pagas, commit novo, push ou deploy.

## Consolidação local validada — 02/11/2026

[Registro e evidências](docs/architecture/2026-11-02-forgelex-local-consolidation.md):
trabalho organizado em commits locais; teste residual do piloto corrigido.
Build completo e suíte geral aprovados: 1.621 testes, zero falhas, 17 condicionais
ignorados; 15 testes do executor, tipos da API e lint também aprovados.
V8 permanece validado apenas localmente. Sem chamadas pagas, push, migration
remota ou deploy. A falha antiga do piloto nos recibos anteriores é histórica.

## D04 corrigido localmente; medição real e avaliação pendentes — 02/11/2026

[Rodada real v7](docs/architecture/2026-11-02-forgelex-recalibration-v7-results.md):
seis execuções, 21 chamadas, US$ 0,275842 calculados, nenhum custo incerto.
D01 e D03 entregaram com ressalvas; D04 ficou sem entrega final por
`BUDGET_EXCEEDED` antes do envio ao verificador, após minuta e revisão intermediárias.
Não ocorreram conflito de IDs ou checks inválidos nesta amostra.

[Correção local v8](docs/architecture/2026-11-02-forgelex-d04-verifier-budget-fix.md)
validada por replay: reserva US$ 0,137688, soma com consumo anterior US$ 0,238618
sob o mesmo teto de US$ 0,25. Claims/fontes/minuta completas no verificador;
requisitos/ressalvas anteriores conservados integralmente no estado e na entrega.
Pendente: medir comportamento/qualidade do modelo real com essa projeção, somente
após nova decisão de Boni. O replay sintético não conclui a entrega D04 histórica.
A expectativa antiga de duas chamadas no teste do piloto foi corrigida na
consolidação; suíte geral agora sem falhas. Recibos anteriores não foram reescritos.
Pendente humano: avaliação das duas entregas por Boni, incluindo suporte parcial
e requisitos não verificados. Os outros 54 cenários não foram executados.
Autorização da rodada encerrada; sem repetição paga, integração ou deploy.

## Histórico da correção local v7 — 02/11/2026

[Três pendências v6 tratadas localmente](docs/architecture/2026-11-02-forgelex-v6-pending-fix.md):
leitura redundante, identidade entre especialistas e vínculos de suporte.
313 cenários de regressão, 15 testes do executor e seis simulações validados;
reprodução SDK de D01 dentro da mesma reserva. Build, tipos e lint aprovados.
Mesa, limites e campanhas anteriores intactos; zero chamadas pagas novas.
A medição real subsequente está no registro acima; avaliação dos resultados por
Boni permanece pendente. Os 54 cenários restantes e publicação não foram
autorizados por esta correção. A aprovação jurídica não decorre dos testes.

## Pendências observadas na calibração v6 — histórico de 02/11/2026

[Medição real v6](docs/architecture/2026-11-02-forgelex-recalibration-v6-results.md)
executada: seis cenários, 30 chamadas, US$ 0,341614 calculados e zero custo
incerto. D03 entregou revisão com ressalvas; D01 e D04 falharam. As pendências
abaixo originaram a correção local v7 registrada acima:

- Contexto/reserva por etapa: D01 encontrou `BUDGET_EXCEEDED` no verificador;
  avaliar redução de redundância sem ampliar teto ou afrouxar a reserva.
- Identidade das afirmações: reproduzir e corrigir `CLAIM_ID_CONFLICT` entre
  especialistas em D04, preservando vínculos e detecção de conflitos reais.
- Checks de suporte: corrigir emissão de checks para fontes fora do contrato
  e referências a requisitos em lugar de afirmações, observadas em D03.

A entrega de D03 ainda depende de avaliação jurídica por Boni. Os 54 cenários
restantes não foram executados. Autorização desta rodada encerrada; novas
chamadas exigem outra decisão. Mesa e limites preservados, sem deploy.

## Histórico da correção local v6 — 02/11/2026

[Preparação isolada](docs/architecture/2026-11-02-forgelex-recalibration-v5.md)
concluída: 76 testes e seis simulações SDK aprovados, sem chamadas pagas.
A execução real foi autorizada e encerrada: US$ 0,373532, 33 chamadas, três
perguntas na versão inicial e três falhas no candidato, nenhuma entrega final.
O v5 avançou com ressalvas, mas o erro genérico não revela a causa terminal.
[Resultados e evidências](docs/architecture/2026-11-02-forgelex-recalibration-v5-results.md).
[Correção local concluída](docs/architecture/2026-11-02-forgelex-delivery-failure-fix.md):
encerramento após entrega aceita, tratamento de saída incompleta, diagnóstico
saneado e matriz probatória restrita ao pedido pertinente. 300 testes, 15 testes
do executor e seis simulações SDK aprovados; build, tipos e lint aprovados.
Mesa, limites e campanhas anteriores preservados; nenhuma nova chamada paga.
Medição do candidato v6 executada no registro acima; avaliação jurídica por Boni
permanece pendente. Causas exatas dos três erros v5 não são recuperáveis
dos metadados disponíveis. Não ampliar limites ou escopo automaticamente.

## Avaliação final do conjunto — 02/11/2026

Preparação offline concluída no [plano e corpus](docs/architecture/2026-11-02-forgelex-3-final-evaluation.md).
Calibração real autorizada e executada: seis lugares, 18 chamadas, custo calculado
US$ 0,135442 dentro do teto US$ 1,50; todos pararam na primeira pergunta e não
produziram entrega. [Resultado](docs/architecture/2026-11-02-forgelex-calibration-results.md).
[Correção local das lacunas](docs/architecture/2026-11-02-forgelex-delivery-gaps.md)
implementada e validada; a classificação foi medida na rodada v5 acima, com
avanço para especialistas e falhas posteriores sem entrega. Não sobrescrever
a campanha anterior. Faltam
executor dos demais lugares e avaliação jurídica por Boni. Estimativa original
do conjunto completo: US$ 3,60–10,80, teto proposto US$ 15; não recalibrar para
baixo a partir de execuções interrompidas no orquestrador. Os 54 lugares restantes
não foram autorizados. Integração/publicação continuam separadas. Não adicionar
etapas ou metadados técnicos à mesa.

## Direção vigente da mesa — 01/11/2026

Cliente escolhe opções objetivas; agentes e engenharia permanecem nos bastidores.
Preservar a mesa ajustada pelo Claude Code. A proposta de selecionar fatos e provas
novamente a cada pedido foi retirada. A reutilização automática dos itens já
aprovados na elaboração/revisão foi implementada localmente em 02/11/2026.
Validação real e publicação não foram realizadas; itens alterados fora da
aprovação não são revalidados automaticamente.
O incremento 6 acrescenta revisão e nova aprovação humana por **Revisar alterações**,
com histórico preservado e sem cobrança pela decisão. Ver
[escopo e validação local](docs/architecture/2026-11-02-forgelex-3-evidence-reapproval.md).
[Design corrigido](docs/superpowers/specs/2026-11-01-forgelex-3-approved-case-context-design.md).

## Evolução ForgeLex 3 — diagnóstico local de 01/11/2026

O [primeiro incremento de qualidade](docs/architecture/2026-11-01-forgelex-3-audit.md)
está em worktree isolado, sem integração/publicação. O complemento local
integra as ferramentas STJ ao runtime comercial, separa a seleção autorizada das
fontes recuperadas e inclui a pesquisa no teto do trabalho, sem débito separado,
conforme decisão de Boni nesta conversa. A fixture SQLite da migration 0036 foi
isolada em memória privada, preservando as asserções. Ver
[validação das pendências locais](docs/architecture/2026-11-01-forgelex-3-pending-local.md).
Disponibilidade publicada depende de integração e publicação autorizadas.
O benchmark determinístico não comprova qualidade semântica de modelo.
O [incremento 2](docs/architecture/2026-11-01-forgelex-3-adaptive-graph.md)
implementa localmente o grafo de capacidades com um refinamento limitado e
retomada do contrato v1 do incremento anterior. O
[incremento 3](docs/architecture/2026-11-01-forgelex-3-evidence.md) implementa
a ação probatória local, com matriz, cronologia e contradições. O
[incremento 4](docs/architecture/2026-11-01-forgelex-3-evidence-adoption.md)
implementa a incorporação ao caso mediante seleção, edição e aprovação humana,
com migration 0037 aditiva. Avaliação semântica jurídica por Boni e publicação
seguem pendentes; a permissão para implementar não aprova itens reais.
Checkpoints anteriores requerem tratamento
por versão antes de uma futura publicação; ver compatibilidade no relatório.

Atualizado em 03/11/2026 (publicação do `025f6dd` registrada; a seção agêntica
abaixo foi reconciliada com a produção. As demais seções mantêm a data de seus
registros: ensaios do leitor e da coleção de 12/10, priorização
humana/fiscal/contratual e consulta externa de 10/10, dependências de
segurança de 24/10). Backlog vigente; checkboxes de planos antigos
registram aquela entrega e não devem ser importados como tarefas novas.
[Produto e publicações](CONTINUIDADE.md) · [Evidências](STATUS_VALIDACAO.md).

O recorte de correções revalidado em 09–10/10 foi encerrado. A preparação
analítica posterior está discriminada abaixo. A PR #61 foi integrada, e a
migration de pesquisa foi aplicada
ao banco publicado. Isso não declara ausência universal de defeitos, cobertura
integral da fonte, certificação jurídica/fiscal ou desempenho sob qualquer carga.

README, índice e referências de continuidade foram reconciliados em 10/10.
A revisão documental foi integrada em main pela PR #63, no commit
`105cf77a3962a1ff09dfdcfa4528eb235f52bbe6`. A limpeza local e a
preservação das branches históricas estão
no [registro de manutenção](docs/operations/stabilization/2026-10-10-documentation-repository-hygiene.md).

## Plataforma agêntica — pendências (03/11/2026)

**Publicada em 01–02/11/2026:** a imagem da `main` (`025f6dd`, PR #101) está a
100% nos dois serviços (`forgelex-api-prod-025f6dd-r2` e
`forgelex-closure-hml-private-025f6dd-r2`), sem migration nova; a `persistence-0036`
foi aplicada em 31/10 ([registro](docs/operations/agentic-workspace/2026-10-31-migration-0036-aplicada.md)).
[Recibo da publicação](docs/operations/agentic-workspace/2026-11-02-publication.md),
com build, digest, verificações, a promoção, o rollback feito por Boni por
engano e a repromoção. A imagem anterior (`commercial-7abf606`) segue
disponível para retorno de tráfego.

| Pendência                                             | Dependência para encerrar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recibo da publicação e ativação da execução comercial | Boni autorizou publicar e ativar ([commercial-execution.md](docs/operations/agentic-workspace/commercial-execution.md)), e em 01/11 a API de produção estava assim: `FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` e `FORGELEX_COMMERCIAL_EXECUTION_ENABLED=true`, interface agêntica no build, mínimo de uma instância, CPU sempre alocada e `OPENAI_API_KEY` no Secret Manager. Essa configuração vem da revisão `commercial-7abf606` (30/10), que não tem recibo no repositório; o registro de 30/10 descreve a `dc68fcb` com as flags desligadas. Falta registrar o recibo exigido (backup, flags, segredo, instância e ensaio sintético com teto comercial). A migration `billing-ledger-0010-commercial-inference` consta no journal desde 30/10 |
| Cancelamento cooperativo em produção                  | Política de 01/11 implementada e presente na imagem publicada em 02/11; não houve cancelamento real em produção para comprovar. Timeout ou queda de rede ainda deixam a chamada incerta (saída: conciliação manual por `scripts/reconcile-commercial-call.mjs`, com evidência do provedor)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Limites diário e mensal contam consumo sem cobrança   | Confirmar a regra com Boni; é visível ao cliente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Chave do DataJud como variável simples                | `FORGELEX_DATAJUD_API_KEY` está como variável de ambiente, não como segredo. Em 02/11 Boni decidiu não alterá-la; fica registrado como decisão, não como defeito. Pelo que se sabe é a chave pública do CNJ (confirmar na documentação oficial)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Configurações do Playwright na raiz                   | Os 17 `playwright.*.config.ts` seguem na raiz: o `package.json` e a CI os chamam por nome. Prompts, adendos e relatórios históricos foram para `docs/historico/` e as imagens `ForgeLex_0*.png` para `docs/product/referencias-visuais/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Dependências de segurança — publicadas em 24/10/2026

PR #78 integrada em main `6499eb0`; seis checks aprovados na PR e
pós-merge. Zod 4.6.7 com conversão nativa e regressões dos contratos, SDKs MCP
e dependências corrigidas. 948 testes aprovados, 18 ignorados, sem novos skips;
audits de produção e completo sem alertas conhecidos na consulta desta entrega.

API `forgelex-api-prod-deps-6499eb0` e worker
`forgelex-closure-hml-private-deps-6499eb0` em 100%, após inventário/testes
no container, candidata e revisão comercial sem tráfego. Oito probes públicos
aprovados após a limpeza; IAM, configuração e Scheduler preservados.
Nenhuma migration reaplicada, AUTO_MIGRATE=false e 47 arquivos locais intactos.
O advisory de braces foi retirado pelo upstream em 23/10; a mitigação permanece.
[Recibo, provas e limites](docs/operations/stabilization/2026-10-24-security-dependencies-publication.md). Homologação nos hosts reais e avaliação
jurídica continuam com seus limites anteriores.

## Camada analítica — publicação técnica concluída

A PR #74 está integrada em main `3657a63`. Em 18/10, foi preparada em worktree
isolado a correção do controle de migrations, a regressão PostgreSQL na CI e o
[roteiro de reconciliação](docs/operations/analise-reconciliation.md).
O [registro local](docs/operations/stabilization/2026-10-18-analise-publication-readiness.md)
separa implementação e validações de publicação.

Commit, push, PR e integração condicionada aos checks foram autorizados por Boni
em 18/10. Implementação `dd87fc3`, enviada na
[PR #75](https://github.com/junior-aguiar-eng/ForgeLex/pull/75); a própria PR
registra os checks e o estado de integração.
Após autorização expressa de Boni, backup, migrations produtivas, deploy e
validação da candidata antes da promoção foram executados em 18/10.
A publicação de segurança de 24/10 atende 100% do tráfego na revisão
`forgelex-api-prod-deps-6499eb0`, após validação da candidata;
[evidências da publicação atual](docs/operations/stabilization/2026-10-24-security-dependencies-publication.md).
Permanece a homologação da camada analítica nos hosts reais ChatGPT/Claude
e a avaliação jurídica por Boni, fora do alcance dos ensaios sintéticos.
Operações interrompidas permanecem bloqueadas até a decisão
de reconciliação; não foi adicionada recuperação automática de saldo ou direitos.

## Correção de dependência Hono — publicada

PR #76 integrada e publicada em 20/10, com candidatas validadas e sem reaplicar
migrations. Lockfile corrigido para Hono 4.13.11; pacote ausente no runtime.
[Recibo da publicação](docs/operations/stabilization/2026-10-20-hono-publication.md). As limitações de homologação dos hosts
mantêm seus escopos anteriores. O advisory de braces foi retirado pelo upstream
em 23/10; mitigação local e gate de audit permanecem.

## Correções encerradas

| Frente                                      | Resultado e evidência                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI do lifecycle                             | Correção de sincronização e diagnósticos entregue; cinco E2E e seis checks aprovados novamente na PR #61. A causa exata da ocorrência Linux original não foi demonstrada                                                                                                                                      |
| Dependências de build                       | source-map-js e postcss-selector-parser corrigidos; braces tem mitigação local de profundidade, regressão e audit completo obrigatório. O advisory upstream continua aberto                                                                                                                                   |
| Pesquisa → Caso                             | PR #58 publicada: salvar/deduplicar julgado, conferir fonte e reutilizar nos rascunhos. Pesquisa com dez E2E aprovados; vínculo não decide pertinência jurídica                                                                                                                                               |
| Retenção ordinária                          | Ativação autorizada em 09/10; job diário às 8h, OAuth, --apply; execuções manual e Scheduler concluídas, zero removidos. Worker HTTP desabilitado; não constitui qualificação fiscal                                                                                                                          |
| Reserva histórica                           | Classificada: uma PENDING de 20 centavos, lease vencido, sem fingerprint e sem débito correspondente. Não bloqueia saldo pela regra atual; nenhum estorno/backfill executado                                                                                                                                  |
| Busca ampla STJ / P2                        | Código anterior já publicado; corpus real medido. PR #61/migration 0029 aplicada: índice de metadados usado, zero Heap Fetches nessa etapa. Mesma amostra ampla: 20,3 s antes, 13,3–16,5 s depois, resultados idênticos. Não é p95 nem garantia sob carga                                                     |
| Referências históricas                      | Registros P2/acessibilidade de 02/10 receberam adendos para separar entrega já publicada e limites dos ensaios antigos                                                                                                                                                                                        |
| Leitor MCP e reabertura nos aplicativos web | ChatGPT: leitor, expansão, salvar a mesma operação sem duplicar e reabrir confirmados. Claude Web: leitor, expansão, listagem e reabertura confirmados. Boni comprovou leitor Desktop e aprovou apresentação ChatGPT. [Evidências e limites](docs/operations/stabilization/2026-10-12-mcp-live-validation.md) |

## Pendências humanas e externas

| Pendência                                      | Dependência para encerrar                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ensaios residuais da coleção MCP               | Falta testar salvamento pelo Claude e coleção no Claude Desktop. Exclusão confirmada, seis vagas/sétima bloqueada, revogação e expiração do histórico não foram reproduzidas na conta real; testes automatizados permanecem evidência separada. ChatGPT teve cópia manual funcional após falha automática; painel aberto antes da permissão conserva aviso até reabertura. [Recorte confirmado](docs/operations/stabilization/2026-10-12-mcp-live-validation.md) |
| Comprovações operacionais                      | Executar, avaliar e aprovar o ensaio pelo próprio Boni; ausência de segundo revisor não constitui pendência nem bloqueio                                                                                                                                                                                                                                                                                                                                         |
| Execução fiscal, contratos e provas comerciais | Preparação FISCAL-2026-10-10.v1 aprovada por Boni em 10/10. Restam situação/classificação municipal, conciliação dos R$ 25 e contratos efetivos; prova de venda real depende de evento real, ainda inexistente segundo Boni                                                                                                                                                                                                                                      |
| Braces upstream                                | Advisory retirado pelo upstream em 23/10, sem nova versão corrigida (registry 3.0.3). Patch, testes e gate de audit preservados; exceção anterior não foi ampliada. [Conferência de 24/10](docs/operations/stabilization/2026-10-24-security-dependencies.md)                                                                                                                                                                                                    |
| Lacuna oficial STJ                             | Recurso 20240229.json mantém os mesmos 599 bytes e hash da falha na linha 24, reconferido em 10/10. Depende de correção na fonte e posterior reavaliação da lacuna; conteúdo parcial não foi incorporado                                                                                                                                                                                                                                                         |

Braces/STJ foram [reavaliados em 10/10](docs/operations/stabilization/2026-10-10-external-pending-review.md):
51 testes dos controles existentes aprovados, audit de produção sem alertas,
audit completo então com somente braces mitigado e fonte STJ inalterada.
Em 24/10, a consulta confirmou a retirada do advisory de braces pelo upstream;
patch, testes e gate de audit permanecem preservados. A lacuna STJ conserva a
última evidência de 10/10, sem nova ingestão ou revalidação nesta entrega.

A ordem recomendada e os critérios de encerramento estão no
[roteiro de comprovações](docs/operations/stabilization/2026-10-10-human-external-pending-priority.md).
A consulta externa tem [recibo próprio](docs/operations/stabilization/2026-10-10-human-external-pending-proof.json).
Boni definiu em 10/10 que nenhuma atividade do projeto depende de avaliação
ou aprovação de outra pessoa. A exigência interna de segundo revisor foi
revogada; avaliações operacionais, jurídicas, fiscais, contratuais e de
segurança cabem exclusivamente a ele, conforme [AGENTS.md](AGENTS.md).
Evidências ainda ausentes continuam pendentes de obtenção/avaliação por Boni,
sem parecer externo obrigatório.

A análise fiscal e a proposta `FISCAL-2026-10-10.v1` estão
[aprovadas por Boni no escopo descrito](docs/operations/stabilization/2026-10-10-fiscal-decision.md).
Autoria, propriedade, exploração direta e ausência de empregados confirmadas;
sem registro empresarial/MEI declarado. Inscrição municipal de autônomo não
foi confirmada. Preparação fiscal aprovada em 10/10 não equivale a
cadastro/apuração concluídos. A cobrança controlada real de R$ 25 será
conciliada separadamente das receitas de clientes, ainda inexistentes segundo Boni.

## Manutenção contínua

Acompanhar falhas de CI, ingestão e limpeza diária, exceções, contagens e
backups. A ingestão de 09/10 concluiu sem pendentes/falhos; a cadência de
execução não comprova frescor integral. O corpus observado contém 874.450
documentos e 874.516 versões. Consultas amplas continuam custosas; revisar
latência sob uso representativo se surgir regressão ou requisito de desempenho.
No próximo deploy HTTP, incluir conferência de uma aba previamente aberta;
o ensaio real durante promoção não foi demonstrado nesta entrega de índice.

A automação diária às 15h consulta main e recibos em modo somente leitura;
avisa mudanças acionáveis, não executa jobs --apply, operações faturáveis ou
mutações. Esse acompanhamento é manutenção, não entrega de código atrasada.

Mesa do caso, novos agentes internos, OCR e novos tribunais são evolução
futura, fora das correções. A arquitetura continua MCP/IA externa, com
permissões e conferência humana.

Referências:
[encerramento técnico e recibo](docs/operations/stabilization/2026-10-09-technical-pending-closure.md),
[retenção e mitigação](docs/operations/stabilization/2026-10-09-audit-residual-closure.md),
[remediação publicada](docs/operations/stabilization/2026-10-07-audit-remediation-publication.md),
[provas humanas](docs/operations/stabilization/2026-10-07-operational-proof-checklist.md),
[dependências](docs/operations/stabilization/2026-10-07-build-dependencies.md).
