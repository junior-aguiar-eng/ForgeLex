# Auditoria e status canônico do ForgeLex

Última auditoria: 2026-09-20. Branch: `main`. A implementação desta frente
permanece local e não foi commitada, publicada ou aplicada a banco remoto.

## Fase 0 — baseline exclusivo do STJ

A Fase 0 do plano progressivo foi concluída localmente e consolidada no commit
`b7f1a84`. API REST, MCP e
interface agora tratam o STJ como o único tribunal comercialmente pesquisável
nesta etapa. O catálogo permanece capaz de listar STF, TST, TJSP, TJRJ e TRF3,
mas esses registros retornam `searchable: false`, `verifiable: false` e
`status: UNAVAILABLE` até que uma fase posterior homologue seus providers.

O catálogo de capabilities é derivado do registro efetivo de providers. Busca
sem provider elegível não é tratada como consulta vazia: REST responde
`UNSUPPORTED_COURT` com HTTP 422 antes do ledger e o MCP rejeita a chamada
equivalente. `q` e `Idempotency-Key` são obrigatórios nas operações REST
faturáveis; uma busca STJ sem resultados permanece válida e é debitada uma
única unidade de R$ 0,20. O MCP exige chave explícita e não cria chave
determinística baseada nos argumentos.

Os contratos OpenAPI, snippets da documentação, `.env.example` e seletores da
interface foram alinhados ao escopo STJ. O MCP continua recebendo apenas a
chamada autenticada e os argumentos da ferramenta, sem acesso a conversas,
arquivos ou histórico do usuário. Não foram executados migration remota,
deploy ou push.

## Fase 1 — fundação persistida do data plane jurisprudencial

A fundação técnica da fase foi implementada e validada localmente para o
corpus histórico definido pelo STJ Open Data. A migration incremental
`persistence-0013-jurisprudence-data-plane` cria o corpus global do STJ sem
`tenant_id`, suas versões e execuções de ingestão. A nova
`persistence-0014-stj-source-manifest` adiciona manifestos de recurso e
staging. As migrations `persistence-0015-compact-jurisprudence-search` e
`persistence-0016-native-jurisprudence-full-text` removem a tabela relacional
de um registro por termo e implantam FTS5 ponderado no SQLite e `tsvector` com
GIN no PostgreSQL. As migrations `persistence-0017-canonical-jurisprudence-version`,
`persistence-0018-version-source-manifest-link` e
`persistence-0019-explicit-version-publication-status` normalizam a raiz do
documento, vinculam versões novas ao manifesto e distinguem explicitamente a
compatibilidade histórica da publicação nova. Nenhuma migration foi executada
remotamente.

O repositório preserva processo, classe, relator, órgão julgador, datas,
ementa, íntegra quando existente, URL individual verificável quando existente,
hash, dedupe key, proveniência, primeira e última captura e status de
verificação. O upsert é idempotente, cria versão somente quando o hash muda e
a publicação do recurso ocorre após validação integral.

O caminho comercial da API e do MCP agora pode receber um
`JurisprudenceSearchService` persistido. No runtime da API, a pesquisa lê o
repositório próprio; o provider oficial continua reservado à aquisição,
verificação e atualização. A rejeição de tribunal não habilitado continua
ocorrendo antes da consulta persistida e antes do débito.

A fonte histórica oficial e o critério de cobertura foram registrados em
`docs/jurisprudencia/stj-historical-source.md`. A descoberta local do catálogo
foi executada contra a API oficial: 10 datasets, 530 recursos enumeráveis, 10
snapshots históricos e 12 recursos não classificáveis (dicionários ou arquivos
sem data no nome), sem alerta de ausência de snapshot. O provider
`provider_stj_open_data`, o parser ZIP/JSON com `fflate`, o hash do recurso, o
manifesto, o staging e a publicação transacional foram implementados e
testados. A carga local já existente contém 874.450 documentos e 874.516
versões; após a normalização, não há ponteiro de versão atual quebrado nem hash
atual divergente. O staging lógico está zerado. A raiz do documento deixou de
duplicar ementa, metadados jurídicos e proveniência: a tabela raiz foi
compactada de 7.739 MB para 3.571 MB, e o diretório PostgreSQL local caiu de
11,9 GB para 7,8 GB após `VACUUM FULL`. A consulta persistida pelo repositório
retornou documentos `provider_stj_open_data`; o índice GIN é usado para a busca
por `responsabilidade`. As versões do corpus já carregado estão marcadas
explicitamente como `LEGACY_COMPATIBILITY`; cargas futuras usarão vínculo direto
ao manifesto e só serão visíveis quando esse manifesto estiver concluído.

O único manifesto ainda marcado como `FAILED` foi reavaliado contra a URL
oficial: `20240229.json`, incremental da Segunda Seção, manteve o SHA-256
`ea2537c36c1e11d5206f7cee7b82178fc455cb8832cd7110a1acc807b7da9b46` e é um
JSON malformado de 599 bytes, com chave de fechamento extra na linha 24,
coluna 1. Ele contém apenas o aviso oficial de ausência de lançamentos para
fevereiro de 2024; continua sem staging, documento ou versão publicada. A
lacuna foi registrada no próprio manifesto, sem alterar o parser ou corrigir o
conteúdo de origem.

O job de ingestão foi coberto por fixture local de idempotência: uma execução
com manifesto já concluído e essa lacuna terminal não criou documentos ou
versões, reportou os estados `SKIPPED_ALREADY_COMPLETED` e
`SKIPPED_TERMINAL_SOURCE_GAP` e não chamou o provider para o recurso
malformado.

A Fase 1 está concluída localmente para o corpus histórico definido pelo STJ
Open Data: a enumeração atual confirmou 10 datasets, 530 recursos
classificáveis (10 snapshots e 520 incrementais) e 12 não classificáveis. Há
10 snapshots concluídos, 519 incrementais concluídos e uma única lacuna oficial
terminal, sem registros jurídicos, formalmente documentada. A repetição foi
validada em fixture local representativa, sem download do recurso malformado e
sem novas versões. Isso não declara que o ForgeLex reproduz toda a base interna
do STJ; declara somente a cobertura do corpus oficial definido nesta fase. A
Fase 3 deixa de estar bloqueada pelo gate da Fase 1.

## Fase 2 — Legal Tool Gateway e contratos agênticos

O gateway canônico local foi adicionado em
`packages/legal-tools/src/gateway/legal-tool-gateway.ts`. As capabilities
`research.search_case_law`, `research.get_authority` e
`research.verify_authority` passaram a ter contrato `1.0.0` com descrição
semântica, scopes, schemas Zod, pré-condições, limites, cancelamento,
classificação de impacto, política de aprovação humana, erros estruturados,
billing próprio e proveniência do índice ForgeLex/STJ Open Data. Todas são
operações de observação (`L0_OBSERVATION`), sem aprovação humana; qualquer
efeito futuro deverá seguir a policy de impacto já existente.

O gateway restringe as três capabilities ao STJ antes da execução. Somente
`research.search_case_law` é `METERED`, em uma busca STJ por R$ 0,20;
obtenção e verificação permanecem `FREE`, sem `UsageEvent` ou débito. A
validação de saída passou a ser obrigatória no `ToolRegistry`.

REST e MCP projetam o mesmo contrato, respectivamente em
`x-forgelex-tool-contract` e `x-forgelex-contract`; o MCP devolve erros
estruturados com código e possibilidade de repetição. As instruções e o
workflow de pesquisa de autoridade estão versionados em
`packages/legal-workflows/src/agentic-contracts.ts`: exigem pesquisa,
obtenção e verificação sucessivas e vedam inventar autoridade. O contrato é
agnóstico de host e declara paridade para ChatGPT/OpenAI, Claude/Anthropic e
REST. O ForgeLex não recebe chaves desses providers, não hospeda modelo e não
gera cobrança por tokens.

A Fase 2 está concluída localmente. Nenhuma entrega da Fase 3 foi iniciada;
não houve migration remota, deploy, push ou commit.

## Fase 3 — API REST e MCP equivalentes

Os adapters REST e MCP continuam encaminhando as três capabilities do
`LegalToolGateway` ao mesmo `ToolRegistry`, ledger e registro de auditoria. A
API REST autentica a integração por credencial Bearer/API key; MCP resolve
tenant e identidade no servidor. Ambos exigem `Idempotency-Key` para as
operações jurídicas e só `research.search_case_law` é faturável, por R$ 0,20.
Rejeições de tribunal, capability ou entitlement ocorrem antes do ledger.

O OpenAPI passou a referenciar schemas concretos para todos os corpos de
requisição publicados, incluindo pesquisa, authority, tribunal/capability e
erro estruturado. A documentação registra idempotência, headers comerciais e
respostas 400, 401, 402, 403, 409, 422 e 503. Os metadados OAuth do recurso
protegido são derivados de `FORGELEX_MCP_RESOURCE_URL` e
`FORGELEX_OAUTH_AUTHORIZATION_SERVERS`, preservando defaults locais seguros.

O cancelamento HTTP é propagado como `AbortSignal` ao MCP e às três tools
REST; o `ToolRegistry` rejeita sinal já cancelado com `SESSION_CANCELLED` antes
da execução e sem criar uso financeiro. O MCP permanece limitado às três tools
jurisprudenciais, recebe apenas argumentos declarados e não recebe conversa,
arquivos ou histórico de ChatGPT/OpenAI, Claude/Anthropic ou outro host. Esses
hosts fornecem modelo, raciocínio e contexto; ForgeLex fornece somente tools,
dados, proveniência, autorização e billing da operação própria.

Validação local da Fase 3 no checkout `main` em `0f895dd`:

- `pnpm typecheck`: PASS, 15 projetos;
- `pnpm test`: PASS, 49 arquivos aprovados, 1 condicional ignorado, 227 testes
  aprovados e 4 condicionais ignorados;
- testes focalizados de OpenAPI, OAuth, cancelamento REST/MCP e registry: PASS,
  4 arquivos e 49 testes;
- `git diff --check`: PASS.

Não houve migration remota, deploy, push ou commit. Nenhum tribunal além do
STJ foi iniciado; não houve Agent Core como requisito comercial, provider de
modelo, chave OpenAI/Anthropic ou cobrança por token. A Fase 4 não foi
iniciada.

## Fase 4 — primeiro fluxo agêntico verificável pelo MCP

O fluxo verificável foi exercitado por host externo simulado sem modelo, runtime
de agente, chave OpenAI/Anthropic ou billing de tokens no ForgeLex:
`research.search_case_law` no STJ, seguida de `research.get_authority` e
`research.verify_authority` para a autoridade retornada. O MCP devolve somente
dados estruturados, status e proveniência; a síntese pertence ao host.

A busca concluída custa R$ 0,20; obtenção e verificação são gratuitas. Replay,
ausência de idempotência, tribunal não habilitado, provider indisponível e
cancelamento seguem os contratos do gateway sem débito indevido. REST usa o
mesmo gateway, corpus, proveniência e billing; não há implementação jurídica
exclusiva do MCP. O MCP rejeita conversa, arquivos e histórico antes de
executar ou registrar a chamada.

Os prompts e o workflow em `packages/legal-workflows/src/agentic-contracts.ts`
mantêm no host a seleção de tool, modelo, raciocínio e síntese, vedando
invenção de autoridade. As três capabilities são de observação e não exigem
aprovação humana; impacto futuro continua sujeito à política aplicável.

## Fase 5 — Agent Core opcional e paridade de providers

O `AgentRuntime` permanece vendor-neutral e agora expõe retomada somente para
providers que a suportem; provider sem continuidade falha de forma estruturada
com `SESSION_RESUME_UNSUPPORTED`. O `FakeAgentProvider` preserva uma ação L4
pendente, valida o token de aprovação na `SessionStateMachine`, executa a ação
uma única vez após a retomada e normaliza erro planejado sem expor o detalhe
sensível. Cancelamento, timeout de tool, limite de turnos, aprovação humana e
erro de provider continuam cobertos pelos contratos e streams falsos.

Os adapters opcionais OpenAI e Anthropic seguem equivalentes nos eventos
normalizados e não pertencem ao runtime comercial. A paridade integrou o mesmo
`research.search_case_law` do Legal Tool Gateway para ambos: o metadado de
uso externo é emitido em `lifecycle:completed`, mas o ledger registra somente
a operação jurídica, com `provider: forgelex_index`, uma unidade e R$ 0,20.
Não há modelo, token, provider externo, custo técnico, preço, margem ou
conversão no lançamento financeiro. As sessões SDK também não são sessões
comerciais persistidas da REST API nem conexões MCP.

Validação local da Fase 5 no checkout `main` em `be8a088`:

- `pnpm typecheck`: PASS, build e typecheck dos 15 projetos;
- `pnpm test`: PASS, 50 arquivos aprovados, 1 condicional ignorado, 233 testes
  aprovados e 4 condicionais ignorados;
- `pnpm --filter @forgelex/web build`: PASS, 1.648 módulos;
- `pnpm --filter @forgelex/api test -- provider-parity.test.ts`: PASS, 2 testes;
- `pnpm --filter @forgelex/agent-core test`: PASS, 3 arquivos e 6 testes;
- `pnpm --filter @forgelex/agent-provider-openai test` e
  `pnpm --filter @forgelex/agent-provider-anthropic test`: PASS, 9 testes em
  cada adapter;
- `git diff --check`: PASS.

Não houve credential live, migration remota, deploy, commit ou push. REST,
MCP, ingestão, busca STJ e billing jurídico continuam operacionais sem carregar
os adapters opcionais.

## Fase 6 — Workflows jurídicos e integração com matters

O `legal-research-memo` foi consolidado na capability canônica
`workflow.legal_research_memo`, versão `3.0.0`. A definição publica schemas de
entrada e saída, capabilities jurídicas permitidas, limite de resultados,
tribunal habilitado, steps ordenados e política explícita de revisão humana.
Não existe uma segunda implementação do memo na rota REST: REST, MCP e Agent
Core executam a mesma tool registrada no `ToolRegistry`.

O executor valida tenant, matter, questões jurídicas e idempotência antes da
execução. Ele compõe intake, issues, busca no índice ForgeLex, verificação,
síntese, checagem adversarial, persistência do memo e revisão humana pendente.
Falha do índice registra checkpoint de falha e não cria memo. Replay devolve o
mesmo registro; reutilização da chave com parâmetros diferentes falha com
`IDEMPOTENCY_CONFLICT`.

Checkpoints são persistidos por execução, tenant, matter, workflow/versão e
step. Authorities usadas no memo são salvas como snapshots, e cada verificação
é acrescentada ao histórico em registro próprio. Revalidação conflitante não
sobrescreve a authority histórica nem o memo já persistido. A decisão humana
continua sendo a única transição de `PENDING_HUMAN_REVIEW` para `APPROVED` ou
`REJECTED`.

Validação local da Fase 6 no checkout `main` sobre `1a6f4e1`:

- `pnpm typecheck`: PASS, build e typecheck dos 15 projetos;
- `pnpm test`: PASS, 50 arquivos aprovados, 1 condicional ignorado, 233 testes
  aprovados e 4 condicionais ignorados;
- `pnpm --filter @forgelex/web build`: PASS, 1.648 módulos;
- testes focados de persistence, legal-workflows, billing-ledger, MCP,
  Agent Core e API: PASS;
- `git diff --check`: PASS.

Não houve migration remota, deploy, commit ou push. O workflow não fornece
modelo, não cobra tokens e permanece gratuito; a política comercial da busca
jurisprudencial continua isolada em `research.search_case_law`.

## Fase 7 — Frontend, PostgreSQL e operação comercial

A Fase 7 foi concluída localmente em 2026-09-20, no branch `main`, sobre o
HEAD `a9e3b240b19ecf4870a3413fcffc352b97e46799`, com alterações ainda não
commitadas. A API recusa fallback silencioso para SQLite em produção; conta
Supabase confirmada, retenção operacional, histórico de pesquisa e fila de
revisão passaram a ter contratos persistidos. A busca da interface consome o
catálogo remoto e expõe somente tribunais pesquisáveis, distinguindo
indisponibilidade, resultado vazio, cobrança e replay.

O PostgreSQL 16 local em `127.0.0.1:55432` recebeu somente migrations locais.
`pnpm test:postgres` passou nos 12 checks previstos:
`migrations_idempotent`, `corpus_global`, `tenant_isolation`,
`billing_reservation_concurrency`, `refund_concurrency`,
`matter_workflow`, `research_history`, `review_queue`,
`outbox_two_workers`, `worker_restart`, `readiness` e `metrics`.
O teste usa prefixo único e remove somente os registros do próprio tenant,
sem apagar corpus global.

O E2E Chromium passou com Supabase e pagamento simulados localmente, sem
Mercado Pago ou Supabase live. Ele cobriu login pela tela real, bootstrap,
catálogo somente STJ, busca com resultado, busca vazia, verificação gratuita,
compra `PENDING` seguida de confirmação `PAID`, fila persistida e decisão
humana. A carga básica executou 25 intenções, concorrência 5 e 3 retries:
zero erros, zero 5xx, 3 replays, débito de 500 centavos, p50 333,34 ms e p95
567,24 ms. Essas latências descrevem apenas a execução local e não constituem
SLA.

Gates finais: `pnpm typecheck` PASS nos 15 projetos; `pnpm test` PASS com
58 arquivos e 271 testes aprovados, 1 arquivo e 4 testes condicionais
ignorados, sem queda de worker; build web PASS com 1.652 módulos; e
`git diff --check` PASS. A CI agora mantém o job padrão e inclui jobs
isolados para PostgreSQL e E2E local, sem APIs pagas ou secrets reais.

Não foram executados migration remota, deploy, credenciais live, homologação
pública, commit ou push.

## Estado implementado

- A superfície pública comercial foi removida. `/` entrega somente o painel
  consolidado de autenticação; `LandingScreen` continua sendo uma ferramenta
  interna após o login.
- Autenticação Supabase, bootstrap, sessão persistida, CORS local e tratamento
  distinto para indisponibilidade da API estão implementados.
- As ferramentas autenticadas, MCP, contratos da API e backend jurídico foram
  preservados. Os adapters opcionais de providers não fazem parte do runtime
  comercial nem do billing do ForgeLex.
- O billing pré-pago local está implementado com Mercado Pago ativo:
  pacotes de R$ 25, R$ 50 e R$ 80, valor personalizado entre R$ 25 e R$ 500,
  custo de R$ 0,20 por busca, ledger, lotes, extrato, faturas internas,
  solicitações de reembolso e idempotência.
- O retorno aprovado do Mercado Pago é interpretado pelo frontend, que
  consulta a compra até o webhook concluir o processamento; saldo só é
  apresentado como atualizado após a compra estar `PAID`.
- A tela de Conexões informa que o advogado usa o MCP dentro da própria conta
  ChatGPT/Claude e que o desenvolvedor usa a API REST no próprio software. O
  ForgeLex não fornece modelo, não recebe chaves OpenAI/Anthropic e não cobra
  tokens.
- A recarga automática permanece disponível apenas quando o provider ativo a
  suporta. Como o adapter atual do Mercado Pago não oferece cobrança
  `off_session`, a UI exibe a função como indisponível e mantém a recarga
  manual. O contrato abstrato continua coberto por testes locais.
- O Mercado Pago é o único provider de pagamento ativo. O adapter de pagamento
  anterior foi removido da aplicação, do OpenAPI e do `.env.example`.
- A política de billing é fechada por capability: somente
  `research.search_case_law` é `METERED` por R$ 0,20; obtenção, verificação e
  memo são `FREE`, sem `DEBIT`, `UsageEvent` financeiro ou webhook de billing.
  As operações gratuitas exigem chave de idempotência para rastreabilidade,
  sem replay financeiro.
- Os identificadores persistidos de cliente, checkout e pagamento foram
  renomeados para nomes neutros ao provider por migração incremental; os dados
  existentes são preservados.

## Validações locais

| Gate | Resultado | Evidência |
|---|---|---|
| Fase 2 — gateway, MCP, REST e contratos agênticos | PASS | 48 arquivos de teste aprovados, 222 testes aprovados e 4 condicionais ignorados em `pnpm test` |
| `pnpm test` | PASS | 45 arquivos aprovados; 215 testes aprovados; 1 arquivo e 4 testes condicionais ignorados |
| `pnpm typecheck` | PASS | todos os 15 projetos verificaram tipos |
| `pnpm --filter @forgelex/web build` | PASS | 1.648 módulos; bundle inicial de 408,43 kB |
| `git diff --check` | PASS | apenas avisos normais de conversão LF/CRLF |
| Migration/repositories PostgreSQL local | PASS | PostgreSQL 16 saudável; migrations até `persistence-0019-explicit-version-publication-status` aplicadas somente em `localhost:55432`; integridade de 874.450 documentos/874.516 versões comprovada |
| `GET /readyz` | PASS | HTTP 200; persistência e billing prontos |
| `GET /metrics` | PASS | HTTP 200; erros e falhas de webhook em zero |
| Teste de reembolso duplicado | PASS | segunda solicitação pendente rejeitada por compra e tenant |

## Evidência externa já obtida

Foi concluído um Checkout de teste do Mercado Pago com pagamento aprovado e
acreditado. A compra `12649c79-7fba-4616-9529-c3d59cc6e6cb` foi reconciliada
como `PAID`, creditada uma única vez no ledger e consultada novamente na API do
Mercado Pago. O replay do evento não duplicou o crédito.

O processamento local do webhook com assinatura HMAC foi validado usando o ID
real do pagamento. A entrega efetiva Mercado Pago → URL pública não foi
confirmada porque os túneis locais expiraram; portanto isso não equivale a
homologação externa do webhook.

## Correções desta auditoria

1. O callback de pagamento aprovado não era interpretado pelo frontend; agora
   ele direciona para Créditos e acompanha o estado real da compra.
2. A tela de créditos ainda mencionava o provider de pagamento anterior em um
   fluxo que usa Mercado Pago; os textos foram alinhados ao provider ativo.
3. A API declarava recarga automática sem informar sua disponibilidade real;
   agora o contrato expõe `autoRecharge.available` e a UI não oferece um
   controle que falharia no Mercado Pago.
4. O estado legado de conexões e funções de API key foi removido do contexto
   global porque não possuía consumidores.
5. Uma mesma compra podia receber solicitações de reembolso pendentes
   duplicadas; a segunda agora é rejeitada de forma idempotente por tenant e
   compra.
6. O catálogo de pricing de modelos, a cobrança por tokens, a margem sobre
   providers e a conversão USD/BRL foram removidos do billing ativo, da conta
   de billing e da configuração de exemplo.
7. API REST e MCP foram documentados como canais para a mesma infraestrutura
   jurisprudencial, sem acesso do MCP a conversas, arquivos ou histórico do
   host.

## Correlação com o plano original

Atendido localmente: autenticação, ledger e persistência de billing, Mercado
Pago como provider único, Checkout, processamento HMAC e idempotente de
webhook, conta, extrato, compra, fatura, reembolso, cobrança por operações
jurídicas próprias, canais REST/MCP sobre a mesma infraestrutura e login
público consolidado.

Parcial: data plane histórico completo do STJ, entrega externa do webhook, atualização visual do saldo após o teste
real na sessão do navegador, Pix pendente, falha de pagamento, recarga
automática real e reembolso real. Os adapters opcionais Anthropic/OpenAI não
foram executados contra APIs externas; isso não é requisito do runtime
comercial do ForgeLex.

Não existe billing de modelos no ForgeLex. A API key do desenvolvedor
autentica a integração REST; o software dele recebe os dados jurídicos e
assume qualquer modelo e billing de terceiros. No MCP usado dentro do ChatGPT
ou Claude, a assinatura do usuário paga a inferência e o ForgeLex cobra
somente as operações jurídicas executadas com os créditos pré-pagos. O MCP não
acessa conversas, arquivos ou histórico do host.

O plano de UI pública com `/para-advogados`, `/para-desenvolvedores` e
`/documentacao` foi superado pela decisão posterior de manter apenas o login
público. O arquivo `docs/superpowers/plans/2026-09-17-forgelex-ui-publica.md`
foi preservado como histórico.

## Limites operacionais

Não foi executado `pnpm db:migrate`, migration remota, deploy, push ou commit.
As migrations de data plane `0013` e `0014` foram apenas adicionadas/testadas
localmente e ainda não foram aplicadas a banco remoto. O
arquivo raiz `.env` continua ignorado pelo Git e não deve ser incluído em
commit. A configuração real de Mercado Pago depende de uma URL pública HTTPS
estável e de credenciais externas válidas. Não foram feitas chamadas reais aos
providers Anthropic/OpenAI.

## Estado do repositório

As alterações anteriores de billing estão em `50878e1`, `ba9925d` e
`6b3c8c5`. A Fase 0 não altera as ferramentas jurídicas nem executa migration
remota.
