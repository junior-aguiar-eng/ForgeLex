# Operação controlada do trabalho agêntico

Preparado em 28/10/2026 na branch `codex/agent-contracts-a0`, com a Tarefa 6
commitada em `43ba96d`. Este runbook é candidato local; nenhum
comando de produção foi executado. Boni é o único aprovador humano.

## Estado e escopo

A Tarefa 6 homologou somente os exemplos sintéticos autorizados, com OpenAI
`gpt-6.1-sol` e teto agregado de US$ 5,00. O piloto está encerrado por
`PILOT_CLOSED`; não reabrir, copiar o banco para repor saldo ou remover seu
registro de consumo. Preservar o banco e as evidências locais até decisão
expressa sobre retenção.

Os resultados permanecem `NOT_EVALUATED`. O encerramento técnico não aprova
uso profissional, dados de clientes, expansão de tribunal ou publicação.
Em 28/10/2026, Boni escolheu para a Tarefa 7 **piloto fechado, só para Boni e
dados sintéticos**. Preço/margem comercial e dados de clientes ficam fora do
escopo. A escolha não autoriza novo orçamento nem reabre o piloto encerrado.

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

| Área            | Estado verificado                                                                                                 | Condição de liberação                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Executor        | `server.ts` chama `buildApp()` sem `agenticWorkspace.caseTask`; a flag registra rotas, mas não cria executor real | Configurar factory e autorização internas para o escopo aprovado e validar o caminho pelo servidor publicado     |
| Consentimento   | `ExecutionService.authorizeInference` é interno; não existe rota pública de autorização financeira                | Definir o percurso de consentimento e reserva no servidor; resposta jurídica não vale consentimento de gasto     |
| Moeda e preço   | Billing existente é BRL; tarifa e teto do piloto são USD em conta sintética isolada                               | Aprovar política comercial versionada; não misturar centavos BRL/USD nem copiar a tarifa do piloto para clientes |
| Consumo visível | UI explica orçamento insuficiente; rotas agênticas não projetam extrato financeiro por execução                   | Mostrar antes do envio limite/moeda/destino; distinguir consumo conhecido, reserva, provisão e saldo liberado    |
| Retenção        | Rotinas atuais não enumeram as novas tabelas agênticas e de inferência                                            | Implementar e ensaiar encerramento/expurgo/minimização/restauração para o novo histórico antes de dados pessoais |
| Operação        | Eventos e leases persistem; o scheduler captura falha de tick sem emitir alerta específico                        | Comprovar monitoramento e recuperação sem conteúdo jurídico em logs                                              |

## Migrations aditivas

Inventariar `forgelex_migrations` no banco autorizado e comparar com o artefato.
O incremento usa `persistence-0031-agentic-workspace`,
`persistence-0032-agentic-execution-control`,
`persistence-0033-legislation-versions`,
`persistence-0034-agentic-task-deliveries` e
`billing-ledger-0009-inference-budgets`.

O comando existente `pnpm db:migrate` usa `DATABASE_URL` e aplica **todas** as
migrations pendentes de persistência/ledger, além do módulo Análise quando
habilitado. Conferir o conjunto inteiro antes de autorizar; não tratá-lo como
comando limitado às cinco migrations acima. O script não é um dry-run.

Manter `FORGELEX_AUTO_MIGRATE` desligado no ambiente de produção. Não iniciar a
API contra banco existente com `NODE_ENV` de desenvolvimento: `buildApp` permite
migration automática nesse modo. Ensaios locais usam somente bancos descartáveis.

Após autorização de migration: registrar IDs aplicados, versão, instante e
integridade; conferir que casos, versões e ledger anteriores continuam acessíveis.
Não executar rollback de schema por exclusão de tabelas.

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

## Retenção e restauração

Inventário novo: `agentic_conversations`, `agentic_contexts`,
`agentic_executions`, `agentic_messages`, `agentic_events`,
`agentic_command_owners`, `agentic_commands`, `agentic_execution_jobs`,
`agentic_execution_calls`, `agentic_task_deliveries`, `inference_budgets` e
`inference_calls`. Payloads podem conter objetivo, fontes, respostas, entregas
e identificadores; tratar como conteúdo privado até classificação explícita.

`AccountClosurePurgeService`, `MatterPurgeRepository` e
`OperationalRetentionService` não cobrem explicitamente esse inventário.
Não anunciar expurgo completo, prazo novo ou anonimização dessas tabelas.
Ensaiar isolamento de tenants, holds, chamadas pendentes e minimização financeira
com fixtures, incluindo histórico sem caso e documentos já purgados. Referências
de caso com FK podem impedir encerramento; payloads podem manter cópias de texto.

Antes de dados pessoais, Boni decide categorias/prazos e implementação compatível
com a política vigente. Restauração isolada deve reaplicar bloqueios e comprovar
resíduos antes do tráfego, preservando evidência financeira necessária sem texto
jurídico dispensável. Não executar exclusão sobre o piloto durante esta preparação.

## Evidências de preparação

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
