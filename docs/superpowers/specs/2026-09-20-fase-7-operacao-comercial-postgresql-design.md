# Fase 7 — Operação comercial e PostgreSQL

## Objetivo

Concluir o ForgeLex/STJ como aplicação operacional local sobre PostgreSQL,
fazendo frontend, API, MCP, autenticação, billing, aprovações, outbox e
observabilidade refletirem apenas dados e capabilities reais. A fase não
habilita outro tribunal, não hospeda modelo de IA e não cria cobrança por
tokens, verificação de authority ou workflow.

## Estado de partida

O backend já possui adapters SQLite/PostgreSQL, migrations incrementais,
ledger transacional, autenticação por API key e Supabase, Mercado Pago,
outbox de webhooks, readiness, métricas, matters, drafts, approvals e o
workflow `legal-research-memo`. O frontend, porém, ainda mantém estado
volátil em `AppContext`: tribunais são declarados na tela, pesquisas recentes
só existem em memória e a fila exibida pelo Dashboard não é carregada do
backend. A API também aceita banco SQLite em memória como fallback quando
nenhuma URL é informada, inclusive sem distinguir explicitamente teste,
desenvolvimento e produção.

Há duas lacunas operacionais relevantes. A operação jurídica faturável ainda
é executada dentro da transação que mantém o lock da carteira, e o claim da
outbox depende de `SELECT` seguido de `UPDATE`, sem uma estratégia PostgreSQL
específica de `FOR UPDATE SKIP LOCKED`. Essas lacunas impedem o gate de
múltiplas instâncias da Fase 7.

## Princípios e invariantes

- STJ permanece o único tribunal pesquisável até o gate integral da Fase 8.
- REST, MCP e Web reutilizam serviços canônicos; a UI não implementa regra
  jurídica, de autorização ou billing.
- Somente `research.search_case_law` custa R$ 0,20 por unidade. Obtenção,
  verificação e `workflow.legal_research_memo` permanecem gratuitas.
- Corpus jurisprudencial é global; identity, matters, histórico de uso,
  aprovações, auditoria e billing são isolados por tenant.
- Produção exige PostgreSQL e falha no bootstrap se a configuração estiver
  ausente ou apontar para SQLite. SQLite permanece disponível para testes e
  desenvolvimento explicitamente configurados.
- Chamadas externas não permanecem dentro de transações que bloqueiam carteira.
- Aprovação exibida na UI sempre corresponde a registro persistido e decisão
  aceita pelo backend; estado local não pode simular aprovação.
- Segredos, tokens, conteúdo integral de documentos e prompts jurídicos não
  entram em logs, métricas ou snapshots operacionais.
- Migrations remotas, deploy e homologação pública não fazem parte desta fase.

## Arquitetura escolhida

A execução será dividida em três incrementos dependentes. O primeiro fecha a
fundação operacional em PostgreSQL; o segundo publica contratos persistidos
para consumo do frontend; o terceiro troca o estado demonstrativo da UI por
estado carregado da API e executa o gate integrado. Cada incremento preserva
os contratos já estabilizados e acrescenta somente as migrations necessárias.

### 1. Fundação PostgreSQL e operação concorrente

O bootstrap da API receberá uma política explícita de persistência. Em
`production`, `FORGELEX_DATABASE_URL` ou `DATABASE_URL` deverá ser uma URL
PostgreSQL; ausência, URL inválida ou conexão indisponível impedirá o serviço
de ficar pronto. Em `test`, dependências injetadas e SQLite em memória
continuarão válidos. Em `development`, SQLite somente será aceito quando uma
URL SQLite tiver sido declarada, eliminando o fallback silencioso.

`db:migrate` continuará sendo o único caminho operacional de DDL PostgreSQL.
O bootstrap poderá verificar a versão aplicada e executar migrations em
ambientes locais/testes conforme a configuração existente, mas produção não
criará esquema ad hoc por conveniência. `readyz` passará a informar ao menos
persistência, migrations, billing, source/index, auth e outbox, sem expor
credenciais.

O ledger adotará reserva curta em duas etapas:

1. transação de reserva: lock da conta, validação de saldo e idempotência,
   criação de uma operação `PENDING` vinculada à chave;
2. execução jurídica fora da transação;
3. transação de conclusão: lock da reserva/conta, débito, `UsageEvent`, entrada
   imutável e snapshot limitado do resultado;
4. falha: marcação terminal sem débito, permitindo retry idempotente conforme
   o mesmo contrato.

Uma chamada concorrente com a mesma chave observa a mesma reserva e nunca
executa ou cobra em duplicidade. Chaves diferentes concorrem sob row lock da
conta no PostgreSQL. O snapshot persistido será limitado ao necessário para
replay do contrato; payloads maiores usarão referência persistida e retenção
configurável, evitando duplicar documentos ou ementas extensas no ledger.

O claim da outbox terá implementação por dialeto. PostgreSQL usará uma única
transação com `FOR UPDATE SKIP LOCKED` para selecionar e marcar a entrega;
SQLite manterá claim atômico compatível com seus testes. Lease expirada volta
à fila, tentativas usam backoff limitado, reinício do worker não perde entrega
e uma entrega concluída não é reenviada. A chamada HTTP continua fora da
transação de claim.

Reembolsos serão serializados por compra: apenas uma solicitação aberta por
compra/tenant e apenas uma decisão financeira terminal. Webhooks do Mercado
Pago continuarão exigindo assinatura válida, deduplicação pelo identificador
do provider e transição monotônica de estado.

### 2. Contratos operacionais persistidos

A API publicará modelos pequenos e explícitos para a UI:

- catálogo de tribunais e capacidades já existente, acrescido de cobertura,
  atualização e estado de indisponibilidade quando disponível;
- histórico recente de pesquisas do tenant/usuário, derivado das operações
  concluídas e sem armazenar conversa ou contexto do host;
- fila unificada de revisão com referências a draft ou research memo, estado,
  timestamps, resumo seguro e ação permitida;
- endpoints de decisão que chamam os serviços canônicos de draft/memo e
  registram auditoria e webhook;
- status operacional para fonte/index, MCP, autenticação, billing e outbox.

O histórico de pesquisas será criado a partir do resultado efetivamente
concluído. Falhas, cancelamentos, capability indisponível e tribunal não
suportado não aparecem como sucesso. O registro conterá query normalizada,
STJ, quantidade de resultados, horário, chave/referência de operação e estado
de billing; não duplicará o corpus nem o snapshot integral da resposta.

A fila de revisão não retornará tokens secretos em listagens. Se uma decisão
de draft continuar exigindo token de uso único, ele será emitido somente no
momento apropriado e consumido pelo endpoint existente; a interface nunca o
persistirá em armazenamento do navegador. Research memos usarão o endpoint de
review canônico e manterão o vínculo com workflow/versão.

OpenAPI será atualizado com schemas concretos, scopes, estados e erros. O MCP
não ganhará endpoints de UI nem acesso a dados privados adicionais; continuará
expondo apenas a tool pack autorizada.

### 3. Frontend fiel ao backend

`AppContext` deixará de ser depósito de dados demonstrativos. Ele coordenará
navegação e chamará clients tipados separados para catálogo, pesquisa,
histórico e aprovações. Estado remoto terá `loading`, `ready`, `empty`,
`unavailable` e `error`, permitindo que cada tela diferencie ausência de dados
de indisponibilidade real.

`ResearchDeskScreen` carregará tribunais da API e só oferecerá entradas com
`searchable: true`. A busca usará a rota canônica, uma chave UUID por operação
e a mesma chave em retries explícitos. A tela mostrará resultado vazio como
operação concluída e faturável, source unavailable como operação não cobrada,
headers/estado de billing, cobertura, atualização da base e URL oficial quando
existente. A ação de verificar authority será descrita como gratuita e exibirá
distintamente `VERIFIED_OFFICIAL`, `VERIFIED_PROVIDER`, `UNVERIFIED`,
`CONFLICTING_METADATA` e `NOT_FOUND`.

`DashboardScreen` carregará a fila persistida. Aprovar ou rejeitar aguardará a
resposta do backend antes de alterar a tela; erro ou conflito recarregará o
registro real. Nenhum texto afirmará efeito externo automático quando a ação
somente altera estado interno.

`LandingScreen` consumirá o histórico persistido. `MatterWorkspaceScreen`
recarregará memos, authorities e estados de revisão do matter. Landing,
Connections e ApiDocs manterão a separação comercial: o host fornece modelo e
contexto; ForgeLex fornece API/MCP, corpus, tools, autorização, proveniência e
billing de operações próprias.

## Erros e estados operacionais

- Configuração PostgreSQL ausente em produção: bootstrap falha com código
  operacional específico; não abre SQLite em memória.
- Migration pendente ou incompatível: readiness `503`, sem processar tráfego
  autenticado ou worker.
- Fonte/index indisponível: UI mostra indisponibilidade e nenhum débito.
- Busca STJ sem resultados: sucesso faturável, zero resultados e histórico.
- Saldo insuficiente: UI preserva a consulta e direciona para créditos sem
  simular execução.
- Replay: mesma resposta persistida, cobrança zero e indicação explícita.
- Aprovação já resolvida/expirada: conflito informado e fila recarregada.
- Webhook inválido ou repetido: rejeição/deduplicação sem crédito duplicado.
- Worker interrompido: lease recuperável e nova tentativa após reinício.

## Migrations e compatibilidade

As migrations serão incrementais após `persistence-0021`. O desenho admite
tabelas para operações billing pendentes, histórico recente e fila unificada
somente se os registros atuais não puderem servir como fonte. Dados de drafts,
research memos, ledger e outbox existentes serão preservados. Qualquer
alteração de unicidade será criada com migração de dados e teste de aplicação
repetida em SQLite e PostgreSQL.

Não haverá migration remota. A validação PostgreSQL usará apenas a instância
local configurada pelo projeto e dados de teste identificados para limpeza.

## Validação

Testes unitários cobrirão mapeamentos de estado, política de banco, reserva e
conclusão de billing, claim de outbox e reducers/clients do frontend. Testes de
integração cobrirão autenticação, isolamento de tenant, cobrança, replay,
aprovação persistida, webhook, retry/reinício e falhas de fonte.

O gate PostgreSQL executará migrations duas vezes, corpus/repositories,
matters, workflows, ledger concorrente, reembolso concorrente, outbox com dois
workers, readiness e métricas. O teste básico de carga medirá erros, p95 e
consistência do saldo sob pesquisas concorrentes; os limites serão registrados
como evidência local, não como SLA de produção.

O E2E de navegador cobrirá login com fixture/autenticação local controlada,
catálogo STJ, busca com e sem resultados, verificação gratuita, compra
pendente/confirmada simulada, fila de aprovação e decisão. APIs pagas e
credenciais reais não serão exigidas pela suíte padrão.

Comandos de saída:

```text
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
pnpm db:migrate
pnpm test:postgres
git diff --check
```

## Gate de conclusão

A Fase 7 termina quando a UI não contém tribunal, aprovação, histórico ou
estado comercial fictício; PostgreSQL local sustenta corpus, auth, ledger,
auditoria, matters, workflows e outbox; concorrência e replay não duplicam
débito, reembolso ou entrega; e os gates automatizados e E2E locais estão
verdes. Limitações externas — deploy, migrations remotas, credenciais live e
homologação pública — serão registradas sem serem apresentadas como concluídas.

## Fora de escopo

- STF, TST, TJSP, TJRJ, TRF3 ou busca agregada nacional;
- modelo hospedado, chaves OpenAI/Anthropic ou billing de tokens;
- editor de texto rico novo ou redesenho visual geral;
- OCR e novas fontes jurídicas;
- deploy, migration remota, alteração de DNS ou homologação live de pagamento;
- garantia de SLA ou prontidão de produção baseada somente no ambiente local.
