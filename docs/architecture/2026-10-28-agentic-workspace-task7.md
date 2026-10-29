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

Na preparação inicial, as rotas agênticas não expunham extrato por execução, e a UI continha aviso de
orçamento insuficiente, sem percurso completo de consentimento comercial.
Essas lacunas foram implementadas na continuação dos itens 1 e 2 registrada
abaixo, com procedimento próprio. Sua configuração/ativação no ambiente real
continua pendente; o runbook isoladamente não é prova de implementação.

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
| Configurar o executor real na entrada efetiva do servidor   | Implementação local realizada na continuação abaixo. Antes de ativar, configurar os IDs verificados de Boni e o banco durável isolado. `buildApp()` compõe o worker/driver/SDK quando as flags e pré-condições são satisfeitas; flags continuam desligadas. |
| Ligar autorização interna, reserva e comunicação de consumo | Implementação local realizada na continuação abaixo: consentimento, limite por execução e resumo USD cumulativo separado de BRL. Preservados os 55 centavos consumidos e 4 provisionados; nenhum novo orçamento ou envio real nesta implementação. |
| Validar operação no ambiente isolado escolhido              | Identificar banco/artefato/migrations, backup/rollback e acompanhamento de falhas, leases e reservas. Registrar regressão e ensaio controlado no ambiente escolhido; o ciclo local SQLite/fake não comprova rollout remoto, frontend compilado ou custo de chamada real em voo. A instabilidade histórica de tempo permanece registrada. |
| Autorizar e executar etapas externas separadamente          | Boni avalia as evidências e autoriza integração, migration e publicação quando quiser avançar. Depois verificar revisão/tráfego e a tarefa controlada realmente publicada. Push e deploy continuam expressamente proibidos nesta execução.                                                                                               |

Preço/margem comercial e integração de retenção para dados pessoais/clientes
ficam fora desse recorte. Tornam-se trabalho próprio antes de eventual ampliação,
não condições inventadas para os ensaios sintéticos já autorizados. A avaliação
jurídica `NOT_EVALUATED` e a ausência de conciliação com fatura continuam explícitas.

## Continuidade — executor real e controles dos itens 1 e 2

Boni autorizou a implementação dos dois primeiros itens, mantendo exclusividade,
dados sintéticos, `gpt-6.1-sol` e teto cumulativo US$ 5,00. O pedido não inclui
ativar flags, identificar por suposição sua conta, push ou deploy.

- [x] Composição do executor na entrada normal `buildApp()`, com identidade
  obrigatória de Boni, fixture aprovada fixada por hash e o transporte limitado
  já homologado. Não habilita pesquisa paga, fallback ou comandos livres.
- [x] Autorização explícita no painel, reserva durável antes de claim do job,
  idempotência/reconstrução, cancelamento e consumo USD visível. Usa somente
  o saldo residual do ledger original e recusa história ausente/reposição.
- [ ] Configuração/ativação no ambiente isolado identificado e avaliação de Boni.

Os detalhes de configuração, endpoints, limites e tratamento de falhas estão no
[procedimento do executor fechado](../operations/agentic-workspace/closed-pilot.md).
Os snapshots e custos anteriores da Tarefa 6 não foram reescritos.

### Verificação dos itens 1 e 2

Suíte geral final, sem outro runner/build concorrente:
`pnpm exec vitest run --maxWorkers=1` — **1.160 aprovados, 17 ignorados,
192 arquivos aprovados/3 ignorados, nenhuma falha em 819,38 s**. Inclui os
11 testes do executor fechado, com worker/driver/SDK reais e SSE sintético,
reserva antes do HTTP, retomada, cancelamento e rejeição de consumo incerto.
Não houve inferência real adicional nem novo financiamento do piloto.

A revisão encontrou dois defeitos reproduzidos antes da correção: chamada
`AUTHORIZED` abandonada após queda não suspendia novos envios; 50 jobs antigos
não geridos impediam alcançar o job fechado. Ambos passaram de RED para GREEN.
Uma terceira regressão cobriu cancelamento no banco da aplicação antes do
commit financeiro: o caminho de ativação agora agenda/libera a reserva pelo
cleanup durável existente, sem liberar fundos de execução em andamento.

Build do monorepo, builds finais de API/web (incluindo leitor MCP) e checagem recursiva de tipos passaram.
TypeScript web final passou. Lint geral terminou sem erros, com dois avisos de
`react-hooks/exhaustive-deps` sobre o contador de geração do painel. Eles ficam
registrados; não significam falha de compilação ou aprovação do navegador.

Navegador: o teste novo do piloto passou (35,6 s), incluindo consentimento
desmarcado/resetado, corpo estrito, retry com a mesma chave, orçamento USD e
largura de 320 px. A rodada completa teve **17 aprovados/1 falha** (4,2 min):
o teste existente de preservação de edição retornou texto vazio após navegação.
O mesmo teste passou isoladamente, sem mudanças de código/expectativa/timeout
(18,6 s de teste; 51,0 s totais). Não se declara eliminada essa instabilidade,
nem se apresenta a rodada completa como integralmente aprovada.

Rollback repetido com o código compilado: 18 tabelas e nove tools MCP
preservadas, zero egress/chamadas pagas e ledger original não aberto.
Somente SQLite descartável, Auth simulado e provider fake nesse ensaio;
isso não demonstra rollout PostgreSQL remoto ou liquidação real em voo.

Fontes, hashes, limites e resultados estão na
[evidência desta continuação](evidence/2026-10-28-closed-pilot-executor.json).
A Tarefa 7 continua em andamento; configuração/ativação no destino isolado,
avaliação de Boni e operações externas permanecem etapas próprias.

## Continuidade — estabilidade do editor e identidade da conta

Boni pediu continuidade e confirmou acesso à sua conta existente. A sessão
publicada foi localizada e a resposta autenticada de `/api/v2/auth/me`
confirmou usuário/workspace/vínculo ativos e papel `OWNER`, consistente com
a conta exibida na interface. Isso verifica a identidade técnica da sessão;
não constitui avaliação jurídica ou ativação do executor.

- [x] Preparar os IDs verificados em `.env.closed-pilot.local`, ignorado pelo
  Git, com as duas flags desligadas. Nenhuma chave duplicada, token copiado,
  configuração remota alterada ou novo orçamento concedido.
- [x] Reproduzir e corrigir a perda de edição por resposta antiga da lista
  de casos e por digitação durante a carga da versão. A lista respeita a
  geração da seleção e a localização própria do editor; os campos aguardam
  somente a carga de caso/versão. Digitar durante conferência continua permitido.
- [x] Remover os dois avisos de lint do painel usando invalidação estável do
  contador de geração, preservando a rejeição de respostas obsoletas.
- [x] Concluir regressões de navegador: Trabalho 18/18 (1,5 min) e editor 9/9
  (48,9 s), com o bloqueio restrito à seleção/carga de versão.
- [x] Concluir build web final (TypeScript, aplicação e leitor MCP) e lint geral:
  aprovados, sem erros ou avisos de lint.
- [ ] Preparar e validar aplicação/banco duráveis e autenticação do ambiente
  local isolado antes de habilitar o piloto; sem push/deploy.

O teste do editor controla a primeira resposta de lista de casos e a devolve
quando outra área está ativa. Reproduziu o texto apagado antes da correção.
A primeira proteção ampla com `busy` impedia digitar durante conferência e
falhou na regressão existente (8/9); foi refinada para `loadingSelection`.
A suíte do editor passou então com 9/9, em 48,9 s, incluindo digitação durante
conferência demorada. Nenhum timeout, expectativa de preservação ou validação
de concorrência foi reduzido. Os registros anteriores permanecem históricos.

A regressão final do Trabalho passou com 18/18 em 1,5 min; a do editor com
9/9 em 48,9 s. A suíte geral anterior de 1.160 aprovados não foi repetida nesta
continuidade de frontend; seu snapshot e limitações anteriores permanecem
preservados. A correção cobre a corrida reproduzida, sem prometer eliminação
universal de falhas de tempo. Fonte, hashes, resultados e limites estão na
[nova evidência](evidence/2026-10-28-task7-ui-stability.json), sem IDs pessoais
ou credenciais. O perfil de identidade local não foi carregado e o executor
continua desligado, sem chamada paga, pesquisa paga, fallback, push ou deploy.
