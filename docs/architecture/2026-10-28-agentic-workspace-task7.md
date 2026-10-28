# Tarefa 7 — preparação da liberação controlada

Data: 28/10/2026. Estado: EM ANDAMENTO; sem liberação.

Boni pediu continuidade após o fechamento técnico da Tarefa 6. Premissa na
abertura deste registro: preparar localmente a liberação; não inferir autorização de commit,
integração, migration em banco existente, deploy, uso comercial ou novo gasto.
Base inicial: branch `codex/agent-contracts-a0`, HEAD `ec791e5`, então com
alterações locais da Tarefa 6. Autorizações e commits posteriores estão
registrados abaixo; o ensaio de rollback usa como base `ece4097` e identifica
separadamente o script por SHA256.

## Entrega

[Runbook candidato](../operations/agentic-workspace/runbook.md) com inventário
de migrations, flags de API/build web, configuração interna do executor,
observabilidade, rollback, cancelamento, retenção e restauração. As condições
ainda ausentes são explícitas; documento não é evidência de ativação.

Correção incremental em `apps/web/src/screens/DraftStudioScreen.tsx`: após um
conflito de adoção, **Salvar minha edição e usar** comparava o salvamento com a
versão antiga em edição, mesmo tendo acabado de consultar a versão atual.
O caminho explícito passa a usar a versão atual observada para a comparação;
mantém a ancestralidade original, a comparação comum de salvamento e a
recusa de qualquer alteração concorrente posterior. Não há remoção de versões
nem afrouxamento da proteção no servidor.

`tests/e2e/case-ai-access.spec.ts` reproduziu `DRAFT_VERSION_CONFLICT`/409 antes
da correção. A regressão ampliada comprova nova escrita entre a escolha e o
salvamento: 409, texto local e versão concorrente preservados; após nova
conferência/escolha explícita, salva a edição humana e adota a recebida,
preservando as seis versões. RED→GREEN confirmado; não se trocou a expectativa
de conflito por sucesso nem se removeu a verificação de concorrência.

## Preço, margem e comunicação

O billing existente usa BRL, pesquisa STJ a R$ 0,20 por chamada, pacotes de
crédito existentes e política própria. Isso não define preço de inferência
nativa. A conta sintética da Tarefa 6 contabilizou centavos de USD isoladamente;
seu saldo não é crédito comercial BRL.

Em resposta à pergunta de escopo em 28/10/2026, Boni escolheu **piloto fechado,
só para Boni e dados sintéticos**. Preço/margem comercial e dados de clientes
ficam fora desta liberação; não são bloqueios para o ensaio local fechado.
Isso não autoriza reabrir o piloto encerrado nem consumir o saldo remanescente.
Antes de uma eventual ampliação para clientes, aprovar
moeda, preço, margem, custos cambiais/tributários/operacionais pertinentes,
responsabilidade por falha/cancelamento e apresentação de reserva/consumo.
Não foi definido câmbio nem preço novo nesta etapa.

Base verificável do piloto encerrado: 55 HTTP; US$ 0,247622 de tokens conhecidos;
ledger arredondado de US$ 0,55 mais US$ 0,04 provisionados; saldo local US$ 4,41.
Provisão não equivale a custo faturado; custo/usage do cancelamento permanecem
desconhecidos. Não converter esse ensaio em estimativa de margem comercial.

As rotas agênticas não expõem extrato por execução, e a UI contém aviso de
orçamento insuficiente, sem percurso completo de consentimento comercial.
Configuração do executor real, consentimento e comunicação de consumo são
condições antes de ativar uso pago; não registrar como implementados pelo runbook.

## Retenção e operação

Leitura dos fluxos de encerramento, expurgo de caso e retenção ordinária
identificou ausência das tabelas agênticas/inferência nas listas explícitas.
O novo histórico exige política e integração testada antes de dados pessoais.
Esta etapa não altera prazos, executa expurgo ou presume cobertura dos testes
antigos para as novas tabelas.

## Validação

Comandos locais, sem habilitar a homologação paga (`FORGELEX_TASK6_REAL_APPROVAL`
vazio no Vitest). Logs na pasta ignorada
`.superpowers/sdd/2026-10-10-agentic-workspace-transition/`.

| Verificação                                               | Resultado                                                 |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm build`                                              | Aprovado em todo o monorepo antes da correção web         |
| `pnpm -r run typecheck`                                   | Aprovado antes da correção web                            |
| `pnpm lint`                                               | Aprovado antes da correção web                            |
| Build web final, incluindo TypeScript e leitor MCP        | Aprovado após a correção                                  |
| ESLint do editor alterado                                 | Aprovado após a correção                                  |
| Vitest focado, 12 arquivos                                | 142 aprovados; anterior à correção web                    |
| PostgreSQL: budget, execução, legislação, entrega do caso | Quatro smokes aprovados em containers locais descartáveis |
| E2E documentos                                            | 5 aprovados                                               |
| E2E pesquisa                                              | 10 aprovados                                              |
| E2E conexão/recebimento IA final                          | 8 aprovados, incluindo nova disputa concorrente           |
| E2E site MCP                                              | 32 aprovados em portas isoladas                           |
| E2E Trabalho final                                        | 17 aprovados após a correção                              |
| E2E editor final                                          | 9 aprovados após a correção                               |
| Vitest encerramento de conta isolado                      | 7 aprovados sem alteração de código/timeout               |
| Suíte geral final de confirmação                          | 1.145 aprovados, 17 ignorados, nenhuma falha; 591,95 s    |

Primeira tentativa de E2E de conexão: 7 aprovados/1 falha; falha real de
compatibilidade do botão com a comparação de versões, corrigida acima.
Primeira tentativa de site MCP: startup timeout de 60 s com listeners já
presentes em 3001. Nenhum processo alheio foi encerrado; nova execução nas
portas 3370/3371 e Auth 15581 passou sem aumentar timeout.

As seis suítes de navegador totalizam 81 testes aprovados (17 + 5 + 9 + 8 +
10 + 32). A primeira rodada geral foi interrompida após registrar duas falhas
de tempo em `account-closure-reconciler.test.ts`, durante build/navegadores
concorrentes. Não foi apresentada como regressão aprovada. O arquivo original
passou isoladamente: 7 testes, 9,33 s totais e 5,18 s de testes, contra 47,955 s
no arquivo sob carga concorrente. Isso sustenta investigar interferência de
carga, sem estabelecer causa interna específica. A rodada geral seguinte
ocorreu sem build, browser ou outro runner concorrente: 1.144 aprovados,
1 falha e 17 ignorados em 608,04 s. O erro foi timeout de 5.000 ms no primeiro
teste de `matter-lifecycle-routes.test.ts` (7.728 ms observados). Portanto,
concorrência não explica sozinha toda a instabilidade. O mesmo arquivo, sem
alterações, passou isoladamente em seguida: 6 testes, 12,93 s totais e 3,88 s
de testes. Nenhum timeout foi aumentado, teste ignorado ou código de
encerramento/lifecycle alterado. A rodada completa final de confirmação
terminou aprovada: 191 arquivos aprovados/3 ignorados, 1.145 testes aprovados,
17 ignorados e nenhuma falha em 591,95 s. O teste de recebimento foi repetido
após enumerar explicitamente os seis IDs de versões preservadas e passou.
Os resultados anteriores continuam preservados: a última execução verde
não demonstra eliminação da instabilidade de tempo observada.

Os 18 hashes do snapshot técnico da Tarefa 6 foram verificados e permanecem
intactos. Sua suíte geral anterior (1.141 aprovados/17 ignorados) é evidência
histórica, distinta da confirmação final da Tarefa 7.
Escopo, hashes e resultados consolidados na
[evidência estruturada](evidence/2026-10-28-agentic-task7-readiness.json).

## Critérios do plano

- Preços/margem comerciais: fora do escopo por decisão de Boni. Reserva e
  provisão do piloto já demonstradas na Tarefa 6; comunicação de consumo em
  eventual ativação paga ainda precisa do percurso operacional correspondente.
- Regressões: executadas e aprovadas na confirmação final, com instabilidade
  anterior explicitamente registrada; somente fixtures locais/sintéticas e providers fake.
- Runbook: criado, conferido contra código e links locais; critério de criação concluído.
- Avaliação de Boni e autorizações distintas: pendentes; não substituídas por testes.
- Revisão/tráfego/tarefa publicada: não executados, dependem das autorizações.

Tarefa 6 commitada como `43ba96d3d0a78147bfadf08b92627526c3d21a3c` após
nova verificação: 86 testes focados em cinco arquivos aprovados (59,24 s).
Os registros anteriores da Tarefa 6 descrevem o estado anterior ao commit;
seus hashes, chamadas, custos e avaliação jurídica não foram reescritos.

Boni autorizou os commits dos avanços e a continuidade da Tarefa 7, mantendo
piloto fechado, só para si e sintéticos, teto cumulativo US$ 5,00, sem pesquisa
paga ou fallback e sem push/deploy. Essa decisão substitui a restrição de
commit registrada na abertura desta preparação; não autoriza publicação,
integração ou migration em banco existente.

Os avanços anteriores foram commitados como
`ece4097628cf81f632c46e5166196c63b6c523f4`, após nova verificação de recebimento
no navegador (1 aprovado, 57,8 s), TypeScript web e ESLint do editor.

## Continuidade — ensaio de rollback local

`node scripts/smoke-agentic-rollback.mjs` passou com o script final formatado
em 12,65 s. Usa somente o exemplo preparado `T6-GAP`, banco SQLite em memória,
Auth local simulado e provider fake; o script não aceita chave, URL de banco
ou destino externo e bloqueia `fetch`. Nenhum processo escutou porta de rede.

- Ciclo de três instâncias da aplicação no mesmo banco: flag ligada,
  desligada e religada. Hash das 18 tabelas observadas permaneceu idêntico
  durante desligamento, sondagens e reativação anterior ao worker.
- Entrega preliminar e versão humana salva permaneceram intactas. As rotas
  novas retornaram 404 com a flag desligada; REST do caso/editor, nove tools
  MCP e leitura MCP de contexto expressamente autorizado continuaram disponíveis.
- Uma execução que estava `QUEUED` foi retomada uma vez após religar a flag;
  duas execuções produziram exatamente duas entregas. Outro owner foi recusado.
- Dez passos fake, zero tentativas HTTP externas, zero chamadas pagas,
  zero reservas novas, fatos adotados ou aprovações jurídicas. O banco do
  piloto pago não foi aberto nem copiado e o teto cumulativo não foi reposto.

[Recibo do rollback](evidence/2026-10-28-task7-rollback.json) identifica o
commit base, SHA256 do script/fixture, hash do estado observado e limites.
O JSON de readiness anterior é um snapshot da preparação anterior ao commit
`ece4097`; o recibo separado registra esta continuação, sem reescrever os
resultados históricos.

Este ensaio não representa deploy/rollback PostgreSQL remoto, troca do build
frontend, reinício do sistema operacional ou liquidação de chamada real em voo.
Não comprova qualidade jurídica. Cancelamento/consumo incertos continuam com
as regras e evidências da Tarefa 6; a instabilidade histórica de tempo da suíte
geral permanece registrada, sem alegação de correção definitiva.

O checklist local foi reconciliado com a escolha expressa de piloto fechado:
registro financeiro/escopo, regressões e runbook/rollback estão concluídos nesse
recorte. Preço/margem comercial saiu do checklist local por estar fora do escopo,
sem ser declarado implementado. Integração, migration em banco existente,
publicação e tarefa publicada continuam não executadas. A Tarefa 7 completa,
que inclui liberação externa, permanece em andamento.

## O que falta para liberar o piloto fechado

Estas pendências se referem somente a Boni e aos exemplos sintéticos, com o
teto cumulativo US$ 5,00, sem pesquisa paga ou fallback. O pedido de commit
deste ensaio não autoriza executar as etapas abaixo.

| Pendência                                                   | Evidência e condição de fechamento                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurar o executor real na entrada efetiva do servidor   | `server.ts` ainda chama `buildApp()` sem `agenticWorkspace.caseTask`. Vincular factory, identidade exclusiva de Boni e seleção sintética autorizada; a flag sozinha não cria o executor. Não usar o fake nem o runner encerrado como configuração de publicação.                                                                         |
| Ligar autorização interna, reserva e comunicação de consumo | Preparar o percurso operacional para Boni com orçamento cumulativo existente em USD, separado do billing BRL. Mostrar teto, saldo, consumo conhecido e provisão. O piloto da Tarefa 6 continua `PILOT_CLOSED`; não repor US$ 5,00 nem liberar reserva incerta como estorno.                                                              |
| Validar operação no ambiente isolado escolhido              | Identificar banco/artefato/migrations, backup/rollback e acompanhamento de falhas, leases e reservas. Registrar regressão e ensaio controlado no ambiente escolhido; o ciclo local SQLite/fake não comprova rollout remoto, frontend compilado ou custo de chamada real em voo. A instabilidade histórica de tempo permanece registrada. |
| Autorizar e executar etapas externas separadamente          | Boni avalia as evidências e autoriza integração, migration e publicação quando quiser avançar. Depois verificar revisão/tráfego e a tarefa controlada realmente publicada. Push e deploy continuam expressamente proibidos nesta execução.                                                                                               |

Preço/margem comercial e integração de retenção para dados pessoais/clientes
ficam fora desse recorte. Tornam-se trabalho próprio antes de eventual ampliação,
não condições inventadas para os ensaios sintéticos já autorizados. A avaliação
jurídica `NOT_EVALUATED` e a ausência de conciliação com fatura continuam explícitas.
