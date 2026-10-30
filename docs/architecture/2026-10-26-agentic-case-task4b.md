# Tarefa 4B — orquestrador, especialistas e contexto nativo

Base `1712853` (commit autorizado da 4A), branch `codex/agent-contracts-a0`.
Implementação local, sem commit deste incremento, integração, deploy ou uso
de provider real. Boni é o único avaliador humano.

## Coordenação e contratos

`packages/legal-workflows/src/agentic-case-task/case-task.ts` coordena uma
etapa por passo do worker durável da Tarefa 3. `AgentRuntime` recebe uma nova
sessão por papel, registro filtrado, instruções versionadas e packet mínimo.
O modelo fake entrega `TaskPlan` ou `TaskSpecialistResult` por `task.submit`.
Não há restauração de estado privado de SDK nem persistência de thought deltas.
O checkpoint vincula fingerprint da política/instruções e seus metadados;
versões divergentes são rejeitadas. As entregas anteriores entram em snapshot
fechado, sem incorporar silenciosamente entregas concorrentes nas etapas seguintes.

O orquestrador delimita objetivo, questões e fontes; o host seleciona os papéis
necessários, valida os handoffs e reconcilia cobertura de questões, referências,
requisitos e findings. A matriz reúne questões, alegações/inferências/conflitos,
fontes e requisitos. Ausência de suporte ou cobertura torna a entrega limitada.
O ID de cada afirmação vincula conteúdo, classificação e fontes imutáveis em
todos os handoffs. Outro texto sob o mesmo ID é conflito; uma verificação anterior
não é reaplicada por colisão de identificadores.

Os perfis em `packages/legal-agents/src/agentic-case-contracts.ts` reutilizam
identidades/instruções da Tarefa 0 para analista, pesquisador, verificador,
redator e revisor. A política interna versionada adiciona orquestrador,
especialista processual e permissões normativas delimitadas da 4A; os contratos
legados e seus `executionEnabled: false` permanecem preservados. Essa extensão
é registrada por etapa, em vez de habilitar silenciosamente o catálogo anterior.

Papéis selecionados: análise documental usa analista; pesquisa usa pesquisador
e verificador quando recupera autoridades/normas; criação acrescenta especialista
processual, redator e revisor adversarial; revisão usa analista e revisor.
Pesquisa adicional depende do plano. Nenhum papel é chamado só por existir.
O revisor adversarial usa `AgentRuntime` e handoff próprio; a revisão estrutural
legada não é apresentada como revisão jurídica substantiva realizada.

Limites: 6 turnos por papel, 12 tools por etapa, 48 tools no total; snapshots
nativos até 128 KB serializados e contexto operacional por etapa até 192 KB.
Não há shell, protocolo, aprovação, adoção de fatos ou escrita livre no registro.
Somente o host grava o artefato preliminar após as validações.

## Contexto e gravação

O adaptador `legal-tools/src/case-context/native-case-context.ts` usa
`NativeCaseTaskRepository` no pacote de persistência. A seleção documental
reutiliza `CaseAiAccessRepository.loadSelection` com identidade nativa e callback
obrigatório de autorização; não fabrica conexão/grant OAuth. As validações MCP
externas continuam intactas.

Antes/depois de leituras e antes da gravação, são conferidos proprietário,
execução, conversa, revisão, ciclo de vida e versões selecionadas. Locks seguem
conversa → caso → documentos/draft. Uma referência opcional `context.draft`
identifica versão selecionada; nova versão humana causa conflito. Respostas
livres/selecionadas/desconhecidas ficam no snapshot e não viram fatos confirmados.

Entregas anteriores só entram no novo packet se suas fontes privadas continuam
selecionadas com os mesmos hashes. São dados derivados, identificados como
`PREVIOUS_DELIVERY`, sem apagar o histórico nem refazer pesquisas ao reabrir.

A migration aditiva `persistence-0034-agentic-task-deliveries` armazena artefatos
imutáveis por execução. Candidato, referência da entrega e evento são confirmados
na mesma transação; uma queda antes do checkpoint do worker não perde a referência
da entrega parcial. O término normal do passo não duplica esse evento.
A leitura histórica revalida autorização/fontes sem montar o packet agregado
de inferência e sem aplicar a esse histórico o teto de contexto da próxima tarefa.
Quando há caso e documento solicitado, o host reutiliza `DraftRepository` com
fonte `WORKFLOW` e estado `DRAFT`, criando novo rascunho. Não sobrescreve o draft
selecionado e não cria fatos ou aprovações. Sem caso, a entrega textual permanece
artefato da execução, sem inventar um caso para permitir gravação no editor.

## Fontes, diálogo e limites jurídicos

Fontes vêm de tools e seleção reais; referências ausentes são rejeitadas.
Pesquisa vazia e fonte indisponível geram findings distintos. STJ usa o serviço
existente e `InferenceBudgetService.executeResearchCall`: sem autorização e
reserva existentes, não inicia a operação paga. A API nativa não fabrica
autorização financeira. O envelope de billing é retirado antes de devolver o
resultado jurídico da tool ao runtime.

Identidade da autoridade, trecho recuperado e suporte à proposição são controles
distintos. A política valida proveniência conforme contratos da Tarefa 0;
ementa/trecho e correspondência literal não provam inteiro teor, entailment
jurídico ou tratamento posterior. Verificação substantiva do fake demonstra
o fluxo; competência de um modelo real continua dependente da Tarefa 6.

Normas usam a factory da 4A e seleção explícita de versão. Snapshots não passam
a constituir vigência/aplicabilidade avaliadas. Toda entrega tem
`legalAssessment: NOT_EVALUATED`, `humanReviewRequired: true` e status candidato
ou limitado; nunca aprovação, fato adotado ou risco jurídico implicitamente baixo.

Perguntas decorrem de lacuna material. Podem ter opções sem seleção padrão,
texto livre e desconhecimento; não impõem uma peça fixa ou procedência.
Resposta já fornecida impede repetição; conflito ainda não resolvido vira
limitação. Falta de fontes/requisitos ou questão material omitida produz finding
identificável e entrega preliminar, sem preencher a lacuna com conhecimento do modelo.

## Montagem e transporte

`apps/api/src/agentic-workspace/case-task-driver.ts` conecta a coordenação ao
worker e serviço existentes. A opção interna `caseTask` exige factory de provider
e autorização nativa explícitas. O driver aceita somente `fake` nesta etapa;
nenhum provider/modelo real ou preço de inferência é escolhido.

A flag geral continua desligada por padrão. Sem configuração interna, não há
driver jurídico ativo. A rota autenticada de leitura
`GET /api/agentic/deliveries/:id` só é montada com essa configuração; valida
proprietário, sessão e `matter:read` para entrega vinculada a caso. Retorna
somente o artefato público e referências de draft/versão, não prompts, perfis,
contratos, argumentos de tools ou checkpoints. REST/MCP existentes não recebem
novas tools. Exposição no frontend/editor pertence à Tarefa 5.

## Verificação

Testes de execução fake, contexto e HTTP foram construídos com RED→GREEN.
Incluem saída/metadata corretas após billing, identidade e hash da entrega,
publicação atômica, nova versão humana, exclusão/revogação, respostas livres ou
desconhecidas, questão omitida, requisitos não examinados, quote sem suporte e
fontes normativa/jurisprudencial. Os resultados de build, tipos, lint,
PostgreSQL, revisão final e regressão geral são registrados abaixo.

Revisão final: três achados importantes foram reproduzidos e corrigidos em uma
única rodada: lock do caso antes dos locks de documentos/draft (PostgreSQL
reproduziu deadlock `40P01` antes da correção), colisão de identidade de afirmação
e leitura histórica indevidamente limitada pelo packet agregado. Também foram
reproduzidos drift de metadados de instrução e entrada concorrente de entregas
derivadas; fingerprint e seleção fixada corrigem esses casos. Nenhum ponto menor
ficou adiado. Após a rodada, 68 testes focados em 6 arquivos passaram.

Verificações confirmadas:

- Build completo e typecheck de todos os pacotes aprovados; após a correção,
  domínio, persistência, workflows e API reconstruídos e tipos revalidados.
- ESLint dos arquivos alterados, Prettier dos módulos novos e `git diff --check`
  aprovados.
- `node scripts/smoke-agentic-case-task-postgres.mjs`: aprovado. Inclui retomada
  de especialistas em outro processo sem repetir o planejador, um único evento
  de entrega, publicação idempotente por duas conexões e isolamento por usuário.
- Concorrência real entre edição humana e publicação: antes, `40P01`; depois,
  edição humana confirmada e publicação recusada por `SOURCE_VERSION_CONFLICT`,
  preservando a nova versão e sem deadlock. Container temporário removido.
- `pnpm exec vitest run --maxWorkers=1`: 187 arquivos aprovados e 3 ignorados;
  1.110 testes aprovados, 18 ignorados e nenhuma falha (417,54 segundos).

| Critério do plano                        | Evidência executável                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tools somente aprovadas                  | `case-task.test.ts`: shell/protocolo não entram no registro nem executam.                                 |
| Revogação/deleção e revalidação          | `native-case-context.test.ts`: proprietário, revogação, documento excluído e transação de gravação.       |
| Instruções maliciosas no documento       | `case-task.test.ts`: conteúdo que exige shell não concede capability.                                     |
| AgentRuntime e delegação                 | Testes de ordem de papéis e handoffs; `case-task-driver.test.ts` usa o worker real.                       |
| Especialistas conforme dependências      | Testes de análise, pesquisa, criação e revisão com papéis distintos.                                      |
| Pesquisa/requisitos/omissão/suporte      | Negativos normativos e jurisprudenciais, requisito não verificado, questão omitida e afirmação sem fonte. |
| Revisão adversarial separada             | Handoff do revisor contém objeção substantiva; revisão estrutural não substitui esse papel.               |
| Lacuna material                          | `WAITING_USER` ou artefato `LIMITED`, sem aprovação automática.                                           |
| Perguntas adaptativas                    | Opções neutras nas fixtures, texto livre e desconhecimento; sem defaults.                                 |
| Peça não definida                        | Pergunta de finalidade/investigação ou estrutura explicitamente preliminar.                               |
| Contexto e respostas reaproveitados      | Packet preserva fontes e respostas; nova seleção controla reuso.                                          |
| Texto livre/desconhecimento              | Testes de resposta fora das opções e conflito que não repete pergunta indefinidamente.                    |
| Análise → redação/revisão                | Entrega anterior entra como fonte derivada autorizada; histórico preservado.                              |
| Indisponível/vazio e citação sem suporte | Findings separados e conferência de identidade versus suporte.                                            |
| Versão humana concorrente                | Conflito no draft selecionado sem sobrescrita da nova versão.                                             |

Pré-condições de ativação permanecem: implementação/autorização nativa real,
retenção/purge do novo histórico, consentimento e orçamento de uso real, corpus
curado/homologado e avaliação por Boni. As fixtures não comprovam qualidade
jurídica, funcionamento do provider real nem operação publicada.
