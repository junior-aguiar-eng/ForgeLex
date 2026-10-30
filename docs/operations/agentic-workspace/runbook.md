# Operação controlada do trabalho agêntico

Preparado em 28/10/2026 e atualizado em 30/10/2026 após a integração das PRs
#81, #82 e #83. Boni é o único aprovador humano. Publicação, migrations,
monitoramento e restauração realizados em 30/10 estão no
[registro operacional](2026-10-30-publication.md) e no
[recibo](2026-10-30-publication-proof.json). Não confundir código integrado,
revisão publicada e funcionalidade ativada.

## Estado e escopo

A Tarefa 6 homologou somente os exemplos sintéticos autorizados, com OpenAI
`gpt-6.1-sol` e teto agregado de US$ 5,00. O piloto está encerrado por
`PILOT_CLOSED`; não reabrir, copiar o banco para repor saldo ou remover seu
registro de consumo. Preservar o banco e as evidências locais até decisão
expressa sobre retenção.

Boni aprovou em 30/10/2026 o ensaio sintético corrigido, após replay local sem
inferência paga: [avaliação e limites](2026-10-30-pilot-evaluation.md) e
[decisão expressa](2026-10-30-boni-pilot-approval.json). Os artefatos históricos
preservam seu estado original. A aprovação não libera uso profissional, dados
de clientes, novas chamadas pagas ou ativação da interface.

A [base comercial](2026-10-30-commercial-proposal.md) foi aprovada por Boni
em 30/10, sem ativação. Ela define preço, margem simulada, limites e
cancelamentos; a cobrança comercial nativa ainda exige implementação e
validação. Não misturar o ledger sintético USD com o saldo comercial BRL.

## Execução comercial

O pedido posterior de Boni autorizou implementar, validar, integrar, publicar e ativar a oferta após os checks. A base comercial inicial é histórica; seguir o [manual comercial](commercial-execution.md) para preço, configuração, retenção, recuperação e gates de ativação. O piloto permanece fechado e não financia a oferta.

## Pré-condições para ativação

Registrar antes da mudança: commit e artefato imutável, ambiente e banco exatos,
revisão anterior, flags atuais, backup recuperável, escopo de dados, dono da
execução, provider/modelo, orçamento cumulativo e decisão de Boni.

São gates independentes: integração da branch; migration no banco identificado;
deploy; abertura de tráfego e envio real de dados. Autorizar um não executa os
demais. Não reutilizar nomes históricos de ambientes como prova de isolamento.

Condições verificadas no código antes de qualquer ativação publicada; as
exigências para dados pessoais/clientes não são gates adicionais para ensaios
locais sintéticos:

| Área            | Estado verificado                                                                                                                                 | Condição de liberação                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Executor        | `buildApp()` compõe worker/driver/SDK sob flag fechada, identidade explícita e fixture aprovada                                                   | Configurar IDs verificados e banco durável isolado; validar o artefato no ambiente escolhido antes de ativar                               |
| Consentimento   | Painel e endpoint fechado exigem exemplo fixo, limite USD, confirmação e chave de idempotência                                                    | Reserva persistente antecede ativação do job; verificar configuração real antes de habilitar                                               |
| Moeda e preço   | Billing existente é BRL; tarifa e teto do piloto são USD em conta sintética isolada                                                               | Preservar isolamento USD/BRL. Preço/margem comercial está fora do piloto fechado; política comercial própria somente antes de clientes     |
| Consumo visível | Painel projeta teto, disponível, escrow, consumo arredondado e provisão USD; endpoint inclui resumo da execução                                   | Não apresentar provisão como cobrança ou os valores como fatura; manter o teto histórico de 500 centavos                                   |
| Retenção        | Expurgo de conta/caso e minimização financeira cobrem os dados agênticos na PR #81                                                                | Preservar holds e pendências financeiras; seguir os procedimentos de restauração e a política vigente                                      |
| Operação        | Alertas de disponibilidade, 5xx e ausência de resposta do encerramento configurados; backup restaurado em instância isolada e removido após prova | Manter acompanhamento sem conteúdo jurídico nos logs; a prova de restauração não substitui reaplicar bloqueios de expurgo antes de tráfego |

## Migrations aditivas

A implementação dos itens 1 e 2 está descrita no
[procedimento fechado](closed-pilot.md), incluindo flags, IDs obrigatórios,
ledger original e retomada após falha. Essa composição ainda não foi ativada.

Inventariar `forgelex_migrations` no banco autorizado e comparar com o artefato.
O incremento usa `persistence-0031-agentic-workspace`,
`persistence-0032-agentic-execution-control`,
`persistence-0033-legislation-versions`,
`persistence-0034-agentic-task-deliveries`,
`persistence-0035-agentic-tenant-guards` e
`billing-ledger-0009-inference-budgets`.

O comando existente `pnpm db:migrate` usa `DATABASE_URL` e aplica **todas** as
migrations pendentes de persistência/ledger, além do módulo Análise quando
habilitado. Conferir o conjunto inteiro antes de autorizar; não tratá-lo como
comando limitado às seis migrations acima. O script não é um dry-run.

Manter `FORGELEX_AUTO_MIGRATE` desligado no ambiente de produção. Não iniciar a
API contra banco existente com `NODE_ENV` de desenvolvimento: `buildApp` permite
migration automática nesse modo. Ensaios locais usam somente bancos descartáveis.

Após autorização de migration: registrar IDs aplicados, versão, instante e
integridade; conferir que casos, versões e ledger anteriores continuam acessíveis.
Não executar rollback de schema por exclusão de tabelas.

Em 30/10, sete migrations aditivas foram aplicadas no banco publicado, incluindo
as seis acima e a migration de análise documental. O journal passou de 40 para
47 entradas, sem pendências naquela inspeção. Conferir novamente antes de uma
nova operação; este registro não autoriza repetir migrations ou mudar banco.

## Flags e rollout

`FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` controla registro das rotas e scheduler
da API. `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` controla navegação web e é
avaliada no build. Alterar somente ambiente de um frontend já compilado não
recompila sua flag. Ambas ficam desligadas por padrão.

Não ativar por flags sem configurar executor, fonte, orçamento e autorização no
servidor. Não usar fixtures E2E nem o runner encerrado da Tarefa 6 como factory
de produção. Não criar fallback, pesquisa paga ou novo teto implicitamente.

Depois das autorizações separadas: publicar revisão sem ampliar tráfego,
verificar readiness e configurações, conferir REST/MCP existentes e executar a
tarefa controlada expressamente aprovada. Registrar revisão efetiva, tráfego,
owner, execução, resultado, fontes versionadas e consumo. `readyz` sozinho não
comprova o percurso agêntico nem a qualidade jurídica.

Estado publicado em 30/10: fonte dc68fcb, revisões e digest no recibo de
publicação; flags agêntica, piloto e frontend desligadas. A correção editorial
da PR #83 está integrada à main d657826, mas não compõe esse artefato publicado.
A ausência de ativação preserva o escopo aprovado. A implementação real existente
continua restrita ao piloto; o produto comercial não nasce por alteração de flags.

## Observabilidade e cancelamento

Usar IDs de execução/chamada, código estável, estado e duração. Nunca registrar
chave, prompt, texto jurídico, resposta livre ou pacote bruto de contexto nos
logs operacionais. Acesso ao conteúdo histórico segue tenant/owner/permissões.

Conferir execuções `QUEUED`/`RUNNING` envelhecidas, leases vencidos,
`budget_release_pending`, `RECONCILIATION_REQUIRED`, reservas sem chamada e
entregas duplicadas. A configuração padrão é poll de 1 s e lease de 60 s;
esses valores não constituem SLA. Registrar responsáveis e limiares antes de
ativação; Boni pode executar e aprovar essa conferência.

Cancelamento após dispatch pode ter custo sem usage conhecido. Não repetir
inferência para descobrir a cobrança nem liberar reserva incerta como estorno.
`settleProviderCall` exige consumo normalizado mensurável; consumo incerto
permanece em reconciliação, sem liquidação fabricada. A provisão conservadora
`provisionCancelledProviderCall` exige aprovação vinculada e execução terminal,
usa todo o limite já reservado, não inventa usage nem débito do cliente.
`PROVISIONED` é terminal no contrato atual: não liquidar posteriormente a mesma
chamada; ajuste por fatura exige procedimento próprio, com evidência e autorização.

O script `scripts/reconcile-agentic-task6-cancel.mjs` é exclusivo do banco e da
chamada sintética da Tarefa 6. Não o apontar para contas reais ou apresentá-lo
como reconciliador comercial genérico. Recibo do piloto:
[conciliação local](../../architecture/evidence/2026-10-28-task6-cancellation-reconciliation.json).

Em 30/10, os CSV oficiais da OpenAI coincidiram com os 54 requests e tokens
conhecidos do piloto e reportaram US$ 0,00 para a mesma chave e dia. A chamada
cancelada não é discriminada: seu custo individual definitivo continua não
demonstrado. Manter a provisão histórica de US$ 0,04, sem nova liquidação.
[Conferência e hashes](2026-10-30-provider-cost-review.md). O relatório diário
não é uma fatura individual e não fundamenta preço comercial com custo zero.

## Rollback operacional

Suspender novas tarefas e envio real no ambiente autorizado; inventariar primeiro
trabalhos e chamadas em andamento. A flag da API é avaliada na inicialização:
desligá-la requer aplicar nova configuração/revisão. A parada do worker aborta
a operação ativa e registra falha, mas não garante ausência de custo remoto.
Uma requisição já enviada não desaparece com o rollback.

Preservar chamadas, reservas, contexto, entregas e edições humanas. Desligar a UI
remove a entrada Trabalho; não apaga versões já salvas no editor existente.
Revisão anterior só pode retomar tráfego após comprovar compatibilidade com o
schema aditivo e REST/MCP. Não reiniciar trabalho pago incerto automaticamente.

Desligar o scheduler também interrompe sua tentativa de liberar reservas
pendentes. Inventariar e reconciliar cada pendência por procedimento autorizado;
flag desligada não comprova saldo liquidado. Não apagar banco, ledger, eventos
ou checkpoints como estratégia de rollback.

Ensaio local reproduzível, depois de `pnpm build`:
`node scripts/smoke-agentic-rollback.mjs`. O script usa o exemplo aprovado
`T6-GAP`, SQLite em memória e fake, sem chave ou URL de banco, com egress HTTP
bloqueado. Exercita três instâncias com flag ligada/desligada/religada, preserva
18 tabelas observadas e edição salva, verifica REST/nove tools MCP, recusa outro
owner e retoma uma execução em fila uma vez. Não abre o banco do piloto pago.
Resultado e limites em
[recibo local](../../architecture/evidence/2026-10-28-task7-rollback.json).
Não comprova rollback remoto, recompilação frontend ou conciliação de chamada
real em voo; esses passos exigem seus próprios ensaios/autorização.

## Retenção e restauração

Inventário novo: `agentic_conversations`, `agentic_contexts`,
`agentic_executions`, `agentic_messages`, `agentic_events`,
`agentic_command_owners`, `agentic_commands`, `agentic_execution_jobs`,
`agentic_execution_calls`, `agentic_task_deliveries`, `inference_budgets` e
`inference_calls`. Payloads podem conter objetivo, fontes, respostas, entregas
e identificadores; tratar como conteúdo privado até classificação explícita.

A PR #81 integra exclusão agêntica ao encerramento de conta e ao expurgo de
casos/documentos. O encerramento usa guarda transacional por tenant, bloqueia
novas escritas admitidas após fechamento e verifica jobs não terminais,
reservas pendentes e estados financeiros antes de apagar conteúdo privado.
Holds continuam preservados. Contextos, mensagens, entregas e referências
atingidos pelo expurgo são tratados no escopo do alvo; não se promete apagar
provas financeiras necessárias nem dados sob retenção excepcional.

A minimização financeira exige budgets liberados e chamadas terminais
SETTLED/CANCELLED/PROVISIONED. Remove payloads dispensáveis, pseudonimiza
associações e chaves e conserva campos financeiros permitidos. Uma provisão
terminal não equivale a custo externo confirmado. OperationalRetentionService
mantém sua função de retenção operacional existente; não é um expurgador genérico
por idade de todo conteúdo agêntico. Os prazos da política vigente não foram
alterados por esta reconciliação.

A CI inclui verify-agentic-retention-postgres.mjs: concorrência de escrita e
exclusão, minimização financeira, holds, isolamento e restauração controlada.
Os seis checks da PR #83 e da main d657826 passaram; a regressão teve 1.234
testes aprovados e 17 ignorados. Isso não demonstra exclusão real sobre dados
de clientes nem autoriza sua utilização no piloto.

Restauração deve reaplicar os bloqueios e o diário externo de expurgos antes
de abrir tráfego, além de verificar resíduos. O ensaio remoto de 30/10 restaurou
o backup em instância isolada, reaplicou migrations e comparou cinco conjuntos
de registros; não executou replay integral de expurgos nessa cópia. A instância
foi removida. Não executar exclusão sobre o banco histórico do piloto; ele
continua preservado e não foi aberto ou copiado nesta conferência.

## Evidências atuais

- [Publicação, alertas e recuperação](2026-10-30-publication.md).
- [Aprovação do ensaio corrigido](2026-10-30-boni-pilot-approval.json).
- [Custos externos e limite da comprovação individual](2026-10-30-provider-cost-review.md).
- [Base comercial aprovada sem ativação](2026-10-30-commercial-proposal.md).

## Evidências históricas de preparação

Validar localmente com build pronto e executar a suíte geral separadamente dos
navegadores e de outros builds. A Tarefa 7 observou instabilidade de tempo sob
carga e também um timeout isolado na rodada serial; resultados e tentativas
ficam preservados no registro. Não aumentar timeout nem declarar estabilidade
a partir de uma única execução aprovada.

Para a suíte do site MCP quando 3001 estiver ocupada, a configuração existente
aceita portas locais próprias. Em uma sessão PowerShell dedicada ao teste:

```powershell
$env:FORGELEX_E2E_WEB_PORT = '3370'
$env:FORGELEX_E2E_WEB_ORIGIN = 'http://127.0.0.1:3370'
$env:FORGELEX_E2E_API_PORT = '3371'
$env:FORGELEX_E2E_API_URL = 'http://127.0.0.1:3371'
$env:FORGELEX_E2E_AUTH_URL = 'http://127.0.0.1:15581'
pnpm exec playwright test --config playwright.mcp-site.config.ts
```

Conferir disponibilidade dessas portas antes; não encerrar servidores alheios.
Essas variáveis são de fixtures locais e não configuram o ambiente publicado.
Manter `FORGELEX_TASK6_REAL_APPROVAL` ausente/vazio nas regressões: possuir uma
chave local não autoriza inferência e o runner pago permanece encerrado.

Comandos, resultados e pendências ficam no
[registro da Tarefa 7](../../architecture/2026-10-28-agentic-workspace-task7.md).
O registro distingue validação local, aprovação comercial, migration e publicação.
