# Tarefa 7 — preparação da liberação controlada

Data: 28/10/2026. Estado: EM ANDAMENTO; sem liberação.

Boni pediu continuidade após o fechamento técnico da Tarefa 6. Premissa desta
etapa: preparar localmente a liberação; não inferir autorização de commit,
integração, migration em banco existente, deploy, uso comercial ou novo gasto.
Branch `codex/agent-contracts-a0`, HEAD `ec791e5`, com alterações locais da Tarefa 6.

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

Tarefa 7 não concluída; nenhuma chamada paga nova, credencial exposta,
alteração remota ou deploy. O próximo ensaio local verifica desativação e
recuperação por flag com preservação de casos/entregas e REST/MCP, usando fake.
