# ForgeLex — plano incremental do trabalho agêntico

> **For agentic workers:** usar `superpowers:executing-plans` após autorização
> de Boni para o incremento selecionado. Implementar e verificar tarefa por
> tarefa; não impor outro aprovador humano. Este plano está em execução
> incremental: autorizações e conclusões constam do estado abaixo. Não autoriza
> por si só executar tarefas seguintes ou publicar o produto.

**Goal:** evoluir a plataforma agêntica jurídica prevista no V2, completando
orquestração e especialistas sobre serviços existentes e preservando o MCP.

**Architecture:** Legal Orchestrator seleciona workflows e especialistas
versionados, que consomem contexto mínimo, tools e fontes verificáveis usando
`AgentRuntime` e adapters existentes. A nova experiência acompanha esse trabalho;
REST/MCP, repositórios, serviços e editor permanecem compartilhados/preservados.

**Tech Stack:** TypeScript, React/Vite, Fastify, Zod, persistência Drizzle do
monorepo, Vitest e Playwright; adapters de modelos existentes.

**Spec:** `docs/superpowers/specs/2026-10-10-agentic-workspace-design.md`.

**Fonte e matriz:** `PROJETO_FORGELEX_PLATAFORMA_AGENTICA_JURIDICA_AGNOSTICA_V2_COMPLETO.md`
e `docs/architecture/2026-10-10-v2-agentic-platform-reuse.md`.

**Premissas consolidadas:** ações jurídicas descobríveis abrem diálogos guiados
por opções; contexto escrito/anexado ou de caso existente orienta a execução.
Agentes, prompts e orquestração permanecem internos. A peça é produzida quando
solicitada; não é a entrada da experiência. Aplicar a pesquisa comparativa de
`docs/architecture/2026-10-10-agentic-platform-reference-research.md` como referência,
sem adotar automaticamente framework, código externo ou conteúdo jurídico estrangeiro.

## Estado de execução — 28/10/2026

O estado abaixo se refere à implementação na branch `codex/agent-contracts-a0`,
no worktree `C:/Users/Boni Jr/.codex/worktrees/analise-release/SDK`.
Conclusão local, commit, integração, migration em banco existente e deploy são
estados distintos. As tarefas concluídas abaixo não significam liberação em produção.

- [x] **Tarefa 0 — concluída no recorte de contratos.** Commit `a7d8832`;
      build, typecheck, lint e regressão registrados.
- [x] **Tarefa 1 — concluída e commitada.** Commit `568a66f`;
      20 testes focados, smoke PostgreSQL e regressão de 1006 testes aprovados.
- [x] **Tarefa 2 — concluída e commitada (`ae3e16c`).**
      36 testes focados, smoke PostgreSQL e regressão de 1022 testes aprovados.
- [x] **Tarefa 3 — concluída e commitada (`f3ead80`).** 8/8 critérios;
      28 testes focados, smoke PostgreSQL e regressão de 1051 testes aprovados (18 ignorados).
- [x] **Tarefa 4A — concluída e commitada (`1712853`, 5/5).** Inventário e
      recuperação normativa interna; 48 testes focados, smoke PostgreSQL e
      regressão de 1070 testes aprovados (18 ignorados).
- [x] **Tarefa 4B — concluída e commitada (`a31ce6a`, 15/15).** Orquestração
      com provider fake; 68 testes focados, PostgreSQL e regressão de 1110
      testes aprovados (18 ignorados). Competência jurídica real não homologada.
- [x] **Tarefa 5 — concluída e commitada (`ec791e5`, 17/17).** Trabalho,
      diálogo, fontes e editor existentes integrados; 17 E2E novos e 9 do editor
      anterior aprovados. Regressão: 1126 testes aprovados, 18 ignorados.
- [x] **Tarefa 6 — concluída e commitada (`43ba96d`, 5/5).**
      OpenAI `gpt-6.1-sol`, somente exemplos sintéticos, teto US$ 5,00;
  tokens conhecidos US$ 0,247622 e US$ 0,04 provisionados conservadoramente;
      suíte geral: 1.141 aprovados, 17 ignorados, sem timeout após corrigir a fixture.
- [ ] **Tarefa 7 — em andamento.** Preparação local da liberação; runbook criado,
      regressões e rollback locais validados; preparação anterior commitada em `ece4097`.
      Recorte local fechado para Boni/sintéticos concluído; publicação não executada.
      Instabilidade anterior de tempo registrada.

Evidências por critério: [Tarefa 0](../../architecture/2026-10-24-agent-contracts-task0.md),
[Tarefa 1](../../architecture/2026-10-24-agentic-workspace-task1.md) e
[Tarefa 2](../../architecture/2026-10-25-inference-budget-task2.md).

Registro adicional: [Tarefa 3](../../architecture/2026-10-25-agentic-execution-task3.md).

## Retomada em 24/10/2026

Boni autorizou commit do plano e início do A0. O recorte inicial implementa
contratos internos de pesquisa STJ, sem habilitar execução de agentes.
Registro histórico do recorte inicial da Tarefa 0:
[`../../architecture/2026-10-24-agent-contracts-a0.md`](../../architecture/2026-10-24-agent-contracts-a0.md).
A Tarefa 0 foi concluída no commit `a7d8832`. Em 24/10/2026, Boni autorizou
a próxima etapa: somente a Tarefa 1. As tarefas seguintes continuam pendentes;
essa autorização não inclui inferência paga, publicação ou migrations externas.
Em 25/10/2026, Boni autorizou o commit da Tarefa 1 (`568a66f`) e a execução
da Tarefa 2. Posteriormente, autorizou seu commit (`ae3e16c`) e a execução
da Tarefa 3. A Tarefa 4A foi concluída localmente; Tarefa 4B concluída localmente; Tarefa 5 concluída localmente; Tarefa 6 concluída tecnicamente após piloto sintético pago autorizado; Tarefa 7 pendente, sem deploy.

## Restrições globais

- Preservar as alterações locais de `codex/case-flow-simplification`; não incorporar
  trabalho anterior inadvertidamente num commit deste desenho.
- Boni é o único avaliador/aprovador humano do projeto.
- Não escolher provider/modelo, preço ou teto de piloto por conta própria.
- Feature flag `FORGELEX_AGENTIC_WORKSPACE_ENABLED` desligada por padrão.
- Não substituir REST/MCP, pesquisa STJ, revisão, ledger ou editor por duplicatas.
- Sem alteração destrutiva de schema, adoção automática de fatos ou efeitos externos.
- Autorização, orçamento e acesso são impostos no servidor, inclusive entre tools.
- Separar evidência local, chamada real, migração aplicada e publicação.
- Mostrar **Analisar documentos**, **Pesquisar uma questão**, **Criar uma peça**
  e **Revisar um texto** como entradas compreensíveis, junto à solicitação livre.
- Cada ação abre diálogo contextual especializado; reaproveitar o contexto e
  evitar perguntas repetidas, questionários extensos e escolha manual de agentes.
- Priorizar perguntas com opções neutras, seleção única/múltipla conforme o caso,
  texto livre e **Ainda não sei** quando pertinentes, sem respostas pré-marcadas.
- Uma ação principal de execução por estado; ações contextuais sem duplicação,
  detalhes sob demanda, continuidade na mesma área de trabalho e **Mais opções**.
- Status públicos aderentes à atividade real; prompts, contratos e catálogo interno
  não são enviados ao frontend. Fontes, lacunas e capacidades jurídicas são acessíveis.
- Não apresentar peça pronta na entrada nem converter toda análise em redação.

## Foco de verificação

1. Revogação de acesso durante execução: impedir nova leitura e nova escrita.
2. Retry/reconexão: não repetir cobrança nem criar versão duplicada.
3. Reinício do servidor: recuperar estado persistido sem depender de Maps do SDK.
4. Edição humana concorrente: preservar versão e retornar conflito explícito.
5. Falha de fonte/modelo: expor falha, conservar entrega parcial e não inventar suporte.

Verificações adicionais destas premissas: contexto somente escrito; desconhecimento
da medida adequada; resposta livre fora das opções; opção **Ainda não sei** para
informação indispensável; correção de resposta após entrega. Os testes pertencem
às tarefas 1, 3, 4B e 5 abaixo. Nenhum desses casos autoriza inventar contexto.

## Sequência e estado dos incrementos

| Incremento                         | Entrega verificável                                                           | Dependências                                                                               | Estado                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Design, agora                      | V2 → componentes atuais → complementos, experiência e critérios jurídicos     | Matriz de reaproveitamento                                                                 | Proposta documentada                                                     |
| M — apresentação documental do MCP | Leitor de decisões, seleção por identidade, texto da fonte e fallback textual | [Plano próprio](2026-10-11-mcp-decision-presentation.md); independente do runtime agêntico | Acompanhamento no plano próprio                                          |
| A — contratos da plataforma        | Catálogo de agentes, workflows, contexto e entregas jurídicas                 | Tarefa 0                                                                                   | Concluído: Tarefa 0                                                      |
| B — infraestrutura e fontes        | Execução durável, controle de consumo, tools e fontes normativas requeridas   | Tarefas 1–3 e 4A                                                                           | Concluído localmente: Tarefas 1–3 e 4A; corpus real ainda não homologado |
| C — orquestração jurídica          | Especialistas, diagnóstico/pesquisa/redação/revisão e avaliação por workflow  | Tarefa 4B                                                                                  | Concluído localmente com fake; sem homologação jurídica real             |
| D — experiência utilizável         | Trabalho → investigação → entrega → revisão, preservando MCP                  | Tarefa 5                                                                                   | Concluído localmente com fake; 17/17 critérios técnicos                  |
| E — piloto real                    | Provider/modelo, escopo e teto autorizados; resultado jurídico medido         | Tarefas 6–7                                                                                | Tarefa 6 concluída tecnicamente; Tarefa 7 em preparação local            |
| Evoluções posteriores              | Mais workflows/fontes, biblioteca administrável e topologias justificadas     | Especificações próprias                                                                    | Fora deste ciclo                                                         |

As tarefas abaixo delimitam interfaces propostas; antes de programar cada
incremento, conferir assinaturas e migrations do checkout escolhido. Não executar
todas as evoluções posteriores como consequência da aprovação da primeira.

### Incremento M — camada visual do MCP, incluído em 11/10/2026

Pedido de Boni: incluir no plano e visualizar antes de implementar. Desenho em
[`../specs/2026-10-11-mcp-decision-presentation-design.md`](../specs/2026-10-11-mcp-decision-presentation-design.md).
A análise no ChatGPT/Claude pertence ao modelo do host; o ForgeLex fornece
fontes, contratos e leitor. O componente não prova raciocínio jurídico próprio,
orquestração, competência de agentes ou recuperação do inteiro teor.

Reaproveitar `CaseLaw`, pesquisa/persistência/proveniência, identidade visual,
leitor documental e ações de citação/fonte. Separar a apresentação passiva dos
adapters de autenticação do site/host. Não embutir o aplicativo web completo nem
duplicar pesquisa, corpus, ledger ou OAuth. O lookup visual deve fixar a decisão
e sua versão; processo isolado não identifica qual decisão deve ser exibida.

M pode preceder A–E e não depende de escolher provider/modelo nativo. Seu primeiro
incremento é de leitura: ementa disponível, metadados, proveniência e link oficial
quando existente; sem promessa de relatório/votos/inteiro teor recuperado. Ações
de salvar no caso continuam no site e com suas permissões; não expor escrita nova
no widget apenas para reproduzir botões existentes. Manter fallback para hosts
sem UI e nove tools atuais quando a flag da apresentação estiver desligada.

Prévia separada: `forgelex-mcp-decisions-preview.html`, no diretório desta conversa.
São alternativas de apresentação, não implementação ou conexão MCP homologada.
O painel lateral depende da capacidade e decisão do host; leitura embutida é a
alternativa demonstrada. O texto da fonte não é reescrito pelo modelo.

### Tarefa 0 — contratos jurídicos e catálogo V2 — CONCLUÍDA

**Arquivos propostos:** criar `packages/legal-agents/src/{agent-definition,
agent-catalog,context-packet}.ts`, instruções versionadas por papel e testes;
estender contratos de `packages/legal-workflows/src/contracts` e exports.
Reaproveitar domínio atual antes de criar tipos equivalentes. Não criar novo runtime.

**Interfaces propostas:** `LegalAgentDefinition` com id/version/role/objective,
scope/allowedTools/outputSchema/escalation/handoff/qualityChecks;
`LegalContextPacket` com objective, referências de fatos/questões/fontes/seções
e constraints; `LegalWorkflowDefinition` com input/output contracts, papéis,
dependências, fontes obrigatórias e critérios de conclusão.
`LegalActionId = 'analyze_documents' | 'research_question' | 'create_document' | 'review_text'`;
`LegalActionDefinition` relaciona id/label/objective, requisitos de contexto,
playbook versionado, workflows elegíveis e critérios de entrega. O catálogo público
expõe somente id/label/descrição da capacidade; não as instruções internas.

- [x] Mapear os papéis da seção 22 do V2 e seus serviços atuais, mantendo distinto
      o papel especializado de uma simples função de persistência.
- [x] Definir contratos dos workflows de pesquisa, análise de autos, confecção
      de peça e revisão de texto; escolher explicitamente o primeiro recorte de
      homologação com Boni.
- [x] Separar system policy, instruções do agente, playbook de tarefa, template
      documental e scripts determinísticos. Registrar versões consumidas no run.
- [x] Mapear as quatro ações visíveis a diálogos, playbooks e competências do V2.
      Ação é objetivo inicial, não peça fixa nem especialista exclusivo; texto livre
      permite ao orquestrador delimitar a capacidade apropriada.
- [x] Testar handoff com fonte ausente, contexto excessivo e output incompatível:
      rejeitar integração inválida; não completar autoridade/fato ausente.
- [x] Definir evals jurídicos com casos positivos/negativos/ambíguos para questões,
      suporte, requisitos processuais, argumentos contrários e pedidos.

**Aceitação:** existe projeto executável da competência jurídica e da coordenação,
além da UI/infraestrutura. Não multiplicar processos/modelos por espécie de peça.

### Acompanhamento da Tarefa 0 — 24/10/2026

Os seis critérios acima estão implementados e verificados localmente.
Tarefa 0 concluída no recorte de contratos: build, typecheck, lint e regressão integral aprovados.
As implementações posteriores das Tarefas 1–3 estão registradas abaixo; A Tarefa 4A foi concluída localmente; Tarefa 4B concluída localmente; Tarefa 5 concluída localmente; Tarefa 6 concluída tecnicamente após piloto real; Tarefa 7 pendente.

Implementação: branch codex/agent-contracts-a0, no worktree
C:/Users/Boni Jr/.codex/worktrees/analise-release/SDK.
O checkout original preserva as alterações locais do fluxo de casos.

Evidências por critério, estado dos papéis e limites:
[registro da Tarefa 0](../../architecture/2026-10-24-agent-contracts-task0.md).

Os checkboxes desta tarefa indicam conclusão dos contratos e suas verificações.
O estado da persistência, orçamento, execução jurídica por modelos, fontes,
orquestração, interface e piloto está discriminado nas tarefas correspondentes.
O primeiro recorte contratado é pesquisa/verificação STJ, conforme o A0
autorizado por Boni. Isso não autoriza o piloto pago da fase E.

### Tarefa 1 — contrato e persistência da execução — CONCLUÍDA

**Arquivos propostos:** criar `packages/domain/src/contracts/agentic-workspace.ts`,
`packages/persistence/src/repositories/agentic-workspace-repository.ts` e seus
testes; estender exports e schema de persistência. Numerar migration pelo estado
da branch de implementação, sem reservar agora um número sujeito a conflito.

**Interfaces propostas:**

- `AgenticExecutionStatus = 'QUEUED' | 'RUNNING' | 'WAITING_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'`.
- `AgenticExecution`: IDs de tenant, usuário, conversa e caso opcional; revisão do
  contexto, autorização, orçamento, status, provider/modelo, checkpoint e IDs de entregas.
- `ExecutionEvent`: `executionId`, `sequence`, `type`, `payload`, `createdAt`.
- Repositório: `createConversation`, `appendMessage`, `createExecution`,
  `appendEvent`, `listEventsAfter`, `compareAndSetStatus`, `getExecution`.
  Todos recebem `tenantId` e validam vínculo do usuário autenticado.
- `LegalQuestion`: id, version, contextRevision, prompt, selection
  (`'single' | 'multiple' | 'free_text'`), options (`id`, `label`), allowFreeText,
  allowUnknown e reason. Perguntas e respostas pertencem à conversa/execução.
- `LegalAnswer`: questionId, questionVersion, contextRevision, selectedOptionIds,
  freeText opcional e unknown opcional. Desconhecimento é resposta explícita;
  seleção única aceita no máximo uma opção. Nunca aceitar opção de outra pergunta.
- Contexto registra texto do cliente e referências de documentos/versões ou caso
  opcional, com origem das informações e revisão. Objetivo ainda sem contexto
  suficiente pode iniciar o diálogo, mas não a inferência jurídica sobre fatos ausentes.

- [x] Testar duas contas: tenant B não lê evento/conversa/execução de A.
- [x] Testar sequência única e ordenada; chave idempotente repetida não cria execução.
- [x] Testar contexto somente escrito sem anexos/caso cadastrado e manter origem;
      nenhuma tabela de documentos deve ser preenchida com anexo fictício.
- [x] Testar perguntas/respostas persistidas, seleção única/múltipla, resposta livre,
      unknown e correção de contexto; recuperar o diálogo após reconexão.
- [x] Rejeitar resposta a pergunta expirada ou com versão/revisão incompatível;
      preservar o histórico e reavaliar entregas dependentes de uma correção.
- [x] Implementar tabelas aditivas e as interfaces, com snapshots de contexto versionados.
- [x] Verificar criação/leitura depois de recriar repositório/processo em PostgreSQL.
- [x] Executar build, testes focados de domínio/persistência e smoke PostgreSQL.

**Aceitação:** estado recuperável independente do navegador e das Maps do provider.

### Acompanhamento da Tarefa 1 — 24/10/2026

Implementação local nos caminhos propostos, com migration aditiva
`persistence-0031-agentic-workspace`. Evidências por critério e limites:
[registro da Tarefa 1](../../architecture/2026-10-24-agentic-workspace-task1.md).
As tabelas foram migradas somente nos bancos sintéticos de teste; não houve
aplicação em banco existente ou remoto, push, inferência ou deploy.
O commit posterior da Tarefa 1 foi autorizado e realizado como `568a66f`.
As Tarefas 2 e 3 têm acompanhamento abaixo; A Tarefa 4A foi concluída localmente; Tarefa 4B concluída localmente; Tarefa 5 concluída localmente; Tarefa 6 concluída tecnicamente após piloto real; Tarefa 7 pendente.

### Tarefa 2 — limite e contabilidade de inferência — CONCLUÍDA

**Arquivos propostos:** criar `packages/billing-ledger/src/inference-budget-service.ts`
e testes; adaptar schema/ledger com reserva persistida, nunca apenas mutex de processo.

**Interfaces propostas:** `reserveExecutionBudget({tenantId, executionId,
maxCostCents, idempotencyKey})`, `authorizeProviderCall({executionId, callId,
upperBoundCents})`, `settleProviderCall({executionId, callId, usage,
actualCostCents})`, `releaseUnusedBudget(executionId)`. Uso normalizado reutiliza
`NormalizedUsage`; preço/modelo vêm de configuração versionada aprovada por Boni.

- [x] Testar reservas concorrentes: soma não ultrapassa saldo disponível.
- [x] Testar retry do mesmo `callId`: um débito; erro/cancelamento libera só reserva não consumida.
- [x] Testar consumo não mensurável: bloquear novas chamadas e marcar reconciliação, sem inventar custo zero.
- [x] Implementar reserva/settlement persistidos e teto por chamada/contexto/saída.
- [x] Incluir pesquisa STJ no orçamento da tarefa preservando sua cobrança/idempotência própria.
- [x] Verificar teto duro com provider fake tentando exceder chamadas ou contexto.

**Aceitação:** nenhuma chamada paga inicia sem cobertura autorizada. Detalhar
política de tarifação real antes do piloto; protótipo não realiza cobrança.

### Acompanhamento da Tarefa 2 — 25/10/2026

Implementação local dos seis critérios, no serviço proposto, reutilizando a
liquidação do ledger. Migration aditiva `billing-ledger-0009-inference-budgets`.
Evidências, decisões de reserva e limites:
[registro da Tarefa 2](../../architecture/2026-10-25-inference-budget-task2.md).
Os testes usam somente bancos e políticas sintéticos; não há provider/modelo,
tarifa comercial ou piloto real selecionado. A integração às rotas/worker e a
conciliação operacional de consumo incerto continuam nas etapas seguintes.

### Tarefa 3 — serviço durável e transporte de eventos — CONCLUÍDA E COMMITADA (8/8)

**Arquivos propostos:** criar `apps/api/src/agentic-workspace/{execution-service,
execution-worker,execution-routes,event-stream}.ts` e testes; modificar montagem
em `apps/api/src/app.ts` apenas para registrar módulo sob flag.

**Interfaces propostas:** `startExecution`, `answerExecution`, `cancelExecution`,
`continueFromCheckpoint`; `GET /api/agentic/executions/:id/events?after=sequence`.
POST de início/resposta/cancelamento exige identidade e idempotência. Stream usa
cliente autenticado compatível com cabeçalhos, sem credenciais na URL.
`startExecution` recebe actionId opcional, objective e referências/texto de contexto;
`answerExecution` recebe `LegalAnswer` e valida a pergunta vigente da execução.
`projectClientExecutionEvent(event, authorizedContext): ClientExecutionEvent | null`
produz somente eventos públicos de status, pergunta, entrega, fonte e erro saneado.
Contratos públicos reutilizam `LegalQuestion` sem dados internos de ferramentas.

- [x] Testar flag desligada e regressão das rotas REST/MCP existentes.
- [x] Testar reconexão a partir do último evento, sem executar tools novamente.
- [x] Testar a projeção pública com eventos internos contendo prompts, argumentos
      de tools e contratos: esses dados não aparecem em respostas, streams ou erros.
- [x] Testar resposta selecionada e livre pelo mesmo endpoint autenticado, com
      versão da pergunta/contexto e idempotência; retry não retoma duas vezes a tarefa.
- [x] Testar lease de worker persistido: duas instâncias não executam a mesma chamada.
- [x] Implementar worker retomável; falha do browser não cancela silenciosamente o trabalho.
- [x] Testar cancelamento: não iniciar próxima tool; entrega parcial continua identificável.
- [x] Testar recuperação após reinício: reconciliar chamada sem resultado confirmado,
      sem repetir automaticamente operação cobrada ou gravação incerta.

**Aceitação:** `RUNNING` não fica indefinidamente sem worker; retomada não promete
restaurar estado privado de SDK. Continuação usa nova execução sucessora quando necessário.

### Acompanhamento da Tarefa 3 — 25/10/2026

Os oito critérios acima foram implementados e verificados no worktree de
implementação. Serviço, worker e SSE nos arquivos propostos; migration
aditiva `persistence-0032-agentic-execution-control`. A flag permanece
desligada por padrão e não há driver jurídico real configurado.
Evidências por critério e limites: [registro da Tarefa 3](../../architecture/2026-10-25-agentic-execution-task3.md).
A Tarefa 2 foi commitada como `ae3e16c`; a Tarefa 3 foi commitada como `f3ead80`
em 26/10/2026, por autorização expressa de Boni.
Nenhum push, deploy, inferência paga ou migration em banco existente.

Em 26/10/2026, Boni autorizou o commit da Tarefa 3 (`f3ead80`) e o início
da Tarefa 4A. Tarefa 4B concluída localmente; Tarefa 5 concluída localmente; Tarefa 6 concluída tecnicamente após piloto real; Tarefa 7 pendente.

### Tarefa 4A — tools e fontes exigidas pelo workflow — CONCLUÍDA LOCALMENTE (5/5)

**Arquivos:** reaproveitar `packages/legal-tools`, `packages/legal-data`,
`packages/source-catalog`, `packages/source-providers` e ingestão/persistência;
planejar módulo normativo delimitado nessas fronteiras, sem substituir o corpus STJ.

- [x] Inventariar capabilities realmente disponíveis versus catálogo V2 e requisitos
      do workflow escolhido. Não usar conhecimento do modelo como tool de legislação.
- [x] Para workflow que exige normas, implementar recuperação de dispositivo/versão
      e fonte oficial antes da homologação; distinguir redação atual e aplicável.
- [x] Testar norma indisponível, versão ausente, recuperação incorreta e pedido fora
      da cobertura; resultado limitado, sem fingir pesquisa normativa concluída.
- [x] Reutilizar pesquisa STJ e explicitar limites de tratamento posterior e suporte.
- [x] Testar REST/MCP atuais inalterados; novas tools só são expostas quando prontas.

**Aceitação:** fontes necessárias são recuperadas por operações verificáveis;
fixtures provam integração, não atualidade jurídica nem corpus real homologado.

### Acompanhamento da Tarefa 4A — 26/10/2026

Os cinco critérios foram verificados no recorte técnico documentado:
inventário V2/capabilities reais, recuperação por norma/dispositivo/versão,
negativos de fonte/identidade/versão/cobertura e regressões STJ/REST/MCP.
Catálogo normativo vazio por padrão; snapshots sintéticos não homologam
corpus, vigência ou aplicabilidade jurídica. Não há busca normativa geral
nem tool nova exposta em REST/MCP. Migration aditiva 0033 validada somente
em bancos temporários. A Tarefa 4A foi commitada como `1712853`, por autorização de Boni.
Evidências e limites: [registro da Tarefa 4A](../../architecture/2026-10-26-agentic-sources-task4a.md).

### Tarefa 4B — orquestrador, especialistas e ferramentas do caso — CONCLUÍDA (15/15)

**Arquivos propostos:** criar `packages/legal-workflows/src/agentic-case-task/`
com política/definição de tarefa e testes; integrar catálogo/instruções da tarefa 0;
adaptador interno de contexto em
`packages/legal-tools/src/case-context`; integrar serviço da tarefa 3.

**Consome:** catálogo/workflow/context packets da tarefa 0, execução/controle das
tarefas 1–3 e fontes/tools da tarefa 4A.
**Produz:** diagnóstico, matriz de questões/fatos/provas/autoridades, estrutura da
peça quando cabível, findings e entrega preliminar com fontes versionadas.

- [x] Testar seleção de tools: apenas capabilities aprovadas da tarefa, sem protocolo ou shell.
- [x] Testar revogação/deleção entre duas leituras; validar novamente antes de gravar.
- [x] Testar documento que instrui ignorar regras; tool proibida não executa.
- [x] Integrar `AgentRuntime` com o Legal Orchestrator, seleção de especialistas e
      registro filtrado. O orquestrador delega investigação a papéis pertinentes e
      reconcilia resultados, em vez de fazer toda análise num prompt genérico.
- [x] Integrar analista do caso/provas, pesquisador, verificador, especialista
      processual, redator e revisores conforme dependências do workflow; não chamar
      todos os papéis automaticamente nem duplicar tools/services.
- [x] Testar plano de pesquisa normativa/jurisprudencial, requisitos processuais,
      questão material omitida e conclusão sem suporte; gerar findings identificáveis.
- [x] Testar revisão adversarial substantiva separada da revisão estrutural atual.
- [x] Testar lacuna material: `WAITING_USER` ou entrega explicitamente preliminar.
- [x] Gerar `LegalQuestion` somente para lacuna material ou escolha necessária:
      opções adaptadas ao objetivo e contexto, sem pressupor cabimento/procedência.
- [x] Testar pedido sem espécie de peça definida: esclarecer a necessidade ou
      investigar a medida apropriada, em vez de aplicar um template fixo.
- [x] Testar contexto escrito e informações já presentes nos documentos/respostas:
      reaproveitar a origem sem repetir perguntas; conflito material exige esclarecimento.
- [x] Testar resposta livre e **Ainda não sei**: mudar a investigação ou expor limite;
      não tratar desconhecimento como fato, autorização ou aprovação jurídica.
- [x] Testar análise seguida de pedido de redação/revisão: reutilizar contexto
      autorizado, preservar entregas anteriores e selecionar só os papéis necessários.
- [x] Testar pesquisa indisponível versus sem resultados; citação existente sem suporte.
- [x] Testar nova versão humana durante execução: conflito, sem sobrescrita.

**Aceitação:** provider fake demonstra delegação, ferramentas e adaptação; evals
com provider real posterior demonstram competência jurídica. Texto gerado não
adota fatos, aprova versão ou fabrica jurisprudência.

### Acompanhamento da Tarefa 4B — 26/10/2026

Os quinze critérios foram implementados e testados no recorte técnico com
provider fake: AgentRuntime por papel, registro filtrado, contexto nativo
autorizado, handoffs e fontes, diálogo material e entrega preliminar.
Integração com serviço/worker da Tarefa 3 e reserva STJ da Tarefa 2; migration
aditiva `persistence-0034-agentic-task-deliveries` somente em bancos temporários.
Revisão corrigida em uma rodada com RED→GREEN, incluindo deadlock PostgreSQL
`40P01`, identidade das afirmações, leitura histórica e pinagem dos contratos.
Flag desligada por padrão; não há provider real configurado, fato adotado,
minuta aprovada, push ou deploy. A Tarefa 4B foi commitada como `a31ce6a`, por autorização de Boni.
Evidências por critério, decisões e limites: [registro da Tarefa 4B](../../architecture/2026-10-26-agentic-case-task4b.md).

### Tarefa 5 — superfície Trabalho, contexto e editor — CONCLUÍDA E COMMITADA (17/17)

**Arquivos propostos:** criar `apps/web/src/screens/AgenticWorkspaceScreen.tsx`,
`apps/web/src/agentic-workspace/{client,use-execution-events,execution-model}.ts`
e componentes locais `ActionEntry.tsx`, `GuidedDialogue.tsx`, `QuestionOptions.tsx`,
`ContextSummary.tsx` e `DeliveryActions.tsx`; adaptar `navigation/routes.ts`, `App.tsx` e `Sidebar.tsx`
sem remover rotas atuais. Reutilizar leitor/editor e resolver links por caso/versão.

**Interfaces propostas:** `ActionEntry` recebe catálogo público e emite actionId
ou solicitação livre. `GuidedDialogue` apresenta `LegalQuestion` vigente e histórico;
`QuestionOptions` emite `LegalAnswer` apenas após envio explícito. `ContextSummary`
mostra referências autorizadas; `DeliveryActions` usa tipo/estado/permissões da
entrega para disponibilizar ações pertinentes, sem duplicar serviços do editor.

- [x] E2E: objetivo → escopo → execução → pergunta relevante → entrega → abrir fonte → editar/salvar.
- [x] E2E: as quatro ações abrem diálogo orientado à finalidade, não disparam
      entrega pronta. Entrada livre permanece disponível e converge para o mesmo fluxo.
- [x] E2E: pergunta de finalidade com opções, complemento livre quando necessário,
      objetivo/contexto escrito sem anexo e resposta **Ainda não sei**.
- [x] Testar seleção única com radio e múltipla com checkbox, rótulos acessíveis,
      nenhuma resposta jurídica pré-marcada, teclado e envio explícito.
- [x] E2E: informação já fornecida não é perguntada novamente; resposta livre fora
      das opções é preservada. Corrigir resposta reavalia o trabalho dependente.
- [x] E2E: análise → pedido contextual de pesquisa/redação/revisão mantém o contexto
      sem copiar resultados ou cadastrar o caso de novo; leitura/escrita seguem autorizadas.
- [x] E2E: recarregar durante execução recupera estado e eventos sem duplicação.
- [x] E2E: revogar documento ou ficar sem orçamento expõe motivo e preserva texto.
- [x] Implementar uma ação principal por estado e detalhes expansíveis.
- [x] Traduzir eventos internos em status genéricos aderentes à atividade real;
      manter agentes, prompts, scripts e catálogo de tools fora da UI de trabalho.
- [x] Em confecção de peça, apresentar a minuta redigida como entrega principal;
      pesquisa/outline não satisfazem a aceitação. Testar campos e lacunas explícitos
      e a entrega alternativa quando não houver suporte material para o pedido.
- [x] Verificar entrada sem peça predefinida; o documento aparece somente quando
      produzido pela tarefa solicitada. Medida desconhecida não exige escolher modelo.
- [x] Validar descoberta das capacidades e ausência de atalhos/botões duplicados
      na mesma superfície. Uma ação principal de execução, secundárias em **Mais opções**,
      fontes/contexto sob demanda e retorno que preserve tarefa/caso/versão.
- [x] Integrar entrega ao editor existente; manter edição não salva e conflito visíveis.
- [x] Verificar teclado, leitura de status, 320px e desktop, sem controles recortados.
- [x] Comparar mesma tarefa com fluxo anterior: intervenções, mudanças de tela,
      tempo e fontes disponíveis; não usar só contagem de elementos HTML como prova.
- [x] Regressão do pacote MCP externo: nove tools locais atuais, OAuth/seleção de
      caso, erros, idempotência e billing preservados. MCP não depende de modelo nativo.

**Aceitação:** Boni identifica as capacidades, abre diálogo por ação ou texto livre,
responde opções/perguntas pertinentes e conclui o percurso sem coordenar agentes,
copiar resultados ou enfrentar repetição de perguntas e funcionalidades. A peça é
uma entrega eventual, criada a partir do contexto, nunca a entrada predefinida.

### Acompanhamento da Tarefa 5 — 26/10/2026

Os dezessete critérios foram verificados no recorte técnico local, com API
autenticada, banco temporário e provider fake. A superfície Trabalho preserva
as rotas, leitor/editor e serviços; não expõe mecanismos internos. Perguntas
e escopo exigem envio explícito; fontes por item, contexto, respostas e entregas
históricas mantêm identificação/versionamento. Salvamento web usa revisão
esperada opcional sob locks e retorna conflito sem apagar edição humana;
`baseVersionId` e schemas MCP preservados. A única revisão final identificou
sete problemas importantes, todos tratados com RED→GREEN em uma rodada,
sem nova revisão ou achados menores adiados. Flags desligadas por padrão.
Comparação limitada ao subpercurso documental automatizado; não homologa
qualidade jurídica, tempo humano ou provider real. Sem uso pago, migration
em banco existente, push ou deploy. Boni autorizou o commit da Tarefa 5 (`ec791e5`) e o início da Tarefa 6 em 27/10/2026.
A homologação paga exige as decisões expressas descritas na Tarefa 6;
a Tarefa 7 permanece pendente de autorização própria.
Evidências por critério, decisões e limites: [registro da Tarefa 5](../../architecture/2026-10-26-agentic-workspace-task5.md).

### Tarefa 6 — homologação com um provider real — CONCLUÍDA TECNICAMENTE (5/5)

**Pré-condições de decisão:** Boni escolhe provider/modelo, escopo de envio e teto
financeiro. Não usar modelos padrão dos adapters como escolha comercial implícita.

**Arquivos:** adaptar configuração/factory no módulo da tarefa 3; reaproveitar
`apps/api/src/provider-real.integration.test.ts` e acrescentar casos de execução
jurídica, sem credenciais em fixtures/logs.

- [x] Primeiro testar tarefa mínima, consumo normalizado e cancelamento com teto aprovado.
- [x] Comparar contexto observado pelo provider com fontes expressamente selecionadas.
- [x] Testar falha/timeout/limite, sem fallback para outro destino não autorizado.
- [x] Medir exemplos sintéticos aprovados por Boni: pertinência, suporte às afirmações,
      omissão de fatos, intervenções, tempo e custo real, inclusive tentativas falhas.
- [x] Registrar evidência com commit, ambiente, provider/modelo e limites de conclusão.

**Aceitação:** percurso real comprovado. Tests fake não substituem esta evidência.

### Acompanhamento da Tarefa 6 — 27/10/2026

Boni aprovou OpenAI `gpt-6.1-sol`, teto agregado US$ 5,00 e somente os cinco
exemplos sintéticos preparados, sem pesquisa externa paga nem fallback. Chave
exclusiva criada pelo fluxo seguro no destino local expressamente autorizado;
nenhuma credencial em fixture, plano, log ou commit. Rodada real: 55 HTTP, dos
quais 54 com usage normalizado (92.441 input/6.274 output). Tokens conhecidos
calculados em US$ 0,247622; cancelamento real após dispatch observado como
`SESSION_CANCELLED`, com até US$ 0,04 retidos em conciliação. Ledger local
arredondado: US$ 0,55 liquidados + US$ 0,04 de reserva, sem repor o teto em retries.

Quatro exemplos concluídos; insuficiência de suporte em `WAITING_USER`, sem
resposta humana inventada. Entregas permanecem `NOT_EVALUATED`; minuta factual
`LIMITED`. Falha/timeout/limite foram testados por injeção local/recusa antes da
rede; não se provocou quota ou falha remota artificialmente. A evidência registra
base `ec791e5`, hashes do código sem commit, ambiente, modelo e limites.

Fechamento em 28/10/2026: os cinco critérios técnicos foram executados e medidos.
O cancelamento foi provisionado no teto autorizado de US$ 0,04, mantendo custo
efetivo/usage nulos, sem débito ao cliente ou nova inferência. Budget `RELEASED`,
escrow zero, saldo local US$ 4,41; runner encerrado por `PILOT_CLOSED`.
Não se declara conciliação com fatura nem aprovação jurídica de Boni.

A fixture de persistência deixou de refazer 34 migrations por teste, preservando
os 16 corpos/assertions e isolamento conferido contra todas as 69 tabelas.
Suíte geral após correção: 1.141 aprovados, 17 ignorados, nenhuma falha/timeout.
Os quatro novos casos de provisão passaram adicionalmente no recorte final de
49 testes; tipos/lint, idempotência do CLI e bloqueio de reabertura confirmados.
Os timeouts anteriores, a avaliação textual e os limites foram preservados em
`docs/architecture/2026-10-27-agentic-workspace-task6.md`,
`docs/architecture/2026-10-27-task6-resultados-para-boni.md` e
`docs/architecture/evidence/2026-10-28-task6-cancellation-reconciliation.json`
no worktree de implementação. As entregas seguem `NOT_EVALUATED`; a pergunta
de insuficiência de suporte permanece aberta sem resposta humana inventada.
Tarefa 6 commitada como `43ba96d` em 28/10/2026 por autorização de Boni.
Tarefa 7 iniciada em 28/10/2026 após pedido de continuidade,
somente na preparação local descrita abaixo. Sem push, banco existente ou deploy.

### Tarefa 7 — liberação controlada e continuidade — EM ANDAMENTO

**Checklist local do piloto fechado autorizado:**

- [x] Registrar escopo, teto cumulativo US$ 5,00, custo conhecido/provisão e
      limites de consumo do piloto exclusivo de Boni, com dados sintéticos,
      sem pesquisa paga nem fallback. Evidências da Tarefa 6 preservadas;
      não repor saldo nem reabrir o runner encerrado nesta preparação.
- [x] Executar regressões pertinentes: unitários, tipos, lint/build, E2E de casos,
      documentos, revisão, pesquisa, MCP e checks PostgreSQL dos schemas afetados.
- [x] Criar runbook: migration aditiva, flag, observabilidade, rollback e retenção
      de sessões; ensaiar desligamento/reativação local sem apagar casos/entregas
      ou interromper REST/MCP.

O critério comercial original de preços/margem fica fora do checklist local
por decisão expressa de Boni em 28/10/2026; não foi declarado implementado.
O recorte local está concluído (3/3). A Tarefa 7 completa continua aberta.

**Etapas externas não autorizadas nesta continuidade:**

- [ ] Boni avalia evidências e autoriza separadamente integração, aplicação de migration e deploy.
- [ ] Após autorização, verificar revisão/tráfego publicado e tarefa real controlada.

**Aceitação:** experiência nova pode ser desativada sem apagar casos/entregas nem
interromper REST/MCP. Publicação não é consequência automática de testes locais.

### Acompanhamento da Tarefa 7 — 28/10/2026

Pedido inicial de continuidade interpretado como preparação local da próxima etapa;
não autoriza commit, integração, migration em banco existente, deploy ou novo
gasto. [Runbook candidato](../../operations/agentic-workspace/runbook.md) criado
e conferido contra as migrations, flags, factory, worker e rotinas de retenção.
O critério de criação do runbook está concluído; suas condições de ativação
continuam explícitas e não foram confundidas com funcionalidades implementadas.

Em resposta à pergunta de escopo, Boni escolheu piloto fechado somente para si,
com dados sintéticos. Preço/margem comercial e dados de clientes ficam fora desta
etapa; não constituem bloqueios para os ensaios locais autorizados.
A factory real ainda depende de configuração interna e autorização financeira;
o servidor padrão não a configura apenas pela flag. Preço/moeda/margem e
comunicação de consumo nativo não estão definidos para clientes. As novas tabelas
não integram explicitamente os fluxos atuais de encerramento/expurgo/retenção;
política e implementação verificadas são necessárias antes de dados pessoais.
O piloto sintético permanece encerrado, sem novas chamadas ou reposição do teto.
Correção incremental do editor: a escolha explícita de salvar a edição e usar
texto recebido passa a comparar com a versão atual observada após conflito,
preservando ancestralidade e recusa de nova edição concorrente (RED→GREEN).
Regressões: 1.145 aprovados/17 ignorados na confirmação final, 81 E2E e quatro
smokes PostgreSQL aprovados, build/tipos/lint conferidos. Duas falhas sob carga
concorrente e um timeout na primeira rodada serial foram preservados no histórico;
uma confirmação verde não demonstra estabilidade de tempo definitiva.
Resultados, limites e evidência estruturada no
[registro da Tarefa 7](../../architecture/2026-10-28-agentic-workspace-task7.md).
Tarefa 7 não concluída e sem liberação.

Em 28/10/2026, Boni autorizou expressamente os commits da Tarefa 6 e dos
avanços da Tarefa 7 e a continuidade local desta última: piloto fechado,
somente para Boni e dados sintéticos, teto cumulativo US$ 5,00, sem pesquisa
paga nem fallback. A autorização exclui push e deploy. A restrição de commit
do registro histórico anterior fica substituída por essa decisão específica;
não se presume integração nem migration em banco existente.

Avanços anteriores commitados em `ece4097`. Continuidade posterior: ensaio
`scripts/smoke-agentic-rollback.mjs` aprovado em 12,65 s, com `T6-GAP`, banco
descartável em memória, Auth simulado e fake. Três instâncias com flag ligada,
desligada e religada preservaram hash de 18 tabelas, entrega/edição salva e
REST/nove tools MCP; tarefa em fila retomada uma vez, outro owner recusado.
Zero egress HTTP, uso pago, orçamento novo ou toque no banco do piloto real.
Não substitui rollback PostgreSQL remoto, troca de build frontend ou fechamento
de chamada real em voo. [Recibo](../../architecture/evidence/2026-10-28-task7-rollback.json).
O checklist foi reconciliado explicitamente com o escopo fechado autorizado;
preços/margem comercial não são gate desse recorte nem entrega implementada.
Em seguida, Boni autorizou expressamente o commit deste ensaio e dos registros
da Tarefa 7, mantendo o piloto fechado e o teto cumulativo, sem pesquisa paga,
fallback, push ou deploy. A preparação local concluída não equivale à liberação.
As pendências de executor real, autorização/reserva/consumo, operação no ambiente
isolado e autorizações externas estão discriminadas no
[registro da Tarefa 7](../../architecture/2026-10-28-agentic-workspace-task7.md#o-que-falta-para-liberar-o-piloto-fechado).

## Evoluções com planos próprios

- **Ampliação normativa:** ampliar o conjunto inicial após os workflows validados;
  legislação requerida pelo primeiro workflow já pertence à tarefa 4A, não fica
  integralmente adiada para depois da entrega jurídica.
- **Biblioteca administrável:** modelos de tarefas versionados, favoritos e
  permissões, sem transformar o produto num catálogo obrigatório de prompts.
- **Mais agentes/fontes:** adicionar somente quando avaliações demonstrarem ganho
  sobre orquestrador com ferramentas; medir custo/latência e regressões jurídicas.

## Registro histórico da proposta

O texto abaixo descreve a elaboração inicial em 10/10/2026. O estado atual e
as verificações posteriores constam do resumo de execução e das tarefas acima.

Plano escrito a partir do checkout, sem executar migrations, modelos ou checks
do produto. Artefatos visuais são simulação local. Avaliar primeiro organização,
autonomia e pontos de intervenção; detalhamento de preço/modelo permanece uma
decisão explícita anterior à homologação paga, não uma escolha escondida no código.
