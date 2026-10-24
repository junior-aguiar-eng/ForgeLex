# ForgeLex — plano incremental do trabalho agêntico

> **For agentic workers:** usar `superpowers:executing-plans` após autorização
> de Boni para o incremento selecionado. Implementar e verificar tarefa por
> tarefa; não impor outro aprovador humano. Este plano é uma proposta para
> discussão, não autorização de execução ou publicação.

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

## Retomada em 24/10/2026

Boni autorizou commit do plano e início do A0. O recorte inicial implementa
contratos internos de pesquisa STJ, sem habilitar execução de agentes.
Registro e pendências da Tarefa 0:
[`../../architecture/2026-10-24-agent-contracts-a0.md`](../../architecture/2026-10-24-agent-contracts-a0.md).
A Tarefa 0 completa e os incrementos B–E continuam pendentes; autorização deste
recorte não estende execução aos demais incrementos.

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

## Sequência proposta

| Incremento | Entrega verificável | Dependências |
| --- | --- | --- |
| Design, agora | V2 → componentes atuais → complementos, experiência e critérios jurídicos | Matriz de reaproveitamento |
| M — apresentação documental do MCP | Leitor de decisões, seleção por identidade, texto da fonte e fallback textual | [Plano próprio](2026-10-11-mcp-decision-presentation.md); independente do runtime agêntico |
| A — contratos da plataforma | Catálogo de agentes, workflows, contexto e entregas jurídicas | Tarefa 0 |
| B — infraestrutura e fontes | Execução durável, controle de consumo, tools e fontes normativas requeridas | Tarefas 1–3 e 4A |
| C — orquestração jurídica | Especialistas, diagnóstico/pesquisa/redação/revisão e avaliação por workflow | Tarefa 4B |
| D — experiência utilizável | Trabalho → investigação → entrega → revisão, preservando MCP | Tarefa 5 |
| E — piloto real | Provider/modelo, escopo e teto autorizados; resultado jurídico medido | Tarefas 6–7 |
| Evoluções posteriores | Mais workflows/fontes, biblioteca administrável e topologias justificadas | Especificações próprias |

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

### Tarefa 0 — contratos jurídicos e catálogo V2

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

Os seis critérios abaixo estão implementados e verificados localmente.
Tarefa 0 concluída no recorte de contratos: build, typecheck, lint e regressão integral aprovados. Tarefas 1–7 permanecem pendentes.

Implementação: branch codex/agent-contracts-a0, no worktree
C:/Users/Boni Jr/.codex/worktrees/analise-release/SDK.
O checkout original preserva as alterações locais do fluxo de casos.

Evidências por critério, estado dos papéis e limites:
[registro da Tarefa 0](../../architecture/2026-10-24-agent-contracts-task0.md).

Os checkboxes indicam conclusão dos contratos e verificações desta tarefa.
A execução jurídica por modelos, fontes normativas, conversas persistentes,
orquestração, interface e piloto pertencem às tarefas seguintes.
O primeiro recorte contratado é pesquisa/verificação STJ, conforme o A0
autorizado por Boni. Isso não autoriza o piloto pago da fase E.
### Tarefa 1 — contrato e persistência da execução

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

- [ ] Testar duas contas: tenant B não lê evento/conversa/execução de A.
- [ ] Testar sequência única e ordenada; chave idempotente repetida não cria execução.
- [ ] Testar contexto somente escrito sem anexos/caso cadastrado e manter origem;
  nenhuma tabela de documentos deve ser preenchida com anexo fictício.
- [ ] Testar perguntas/respostas persistidas, seleção única/múltipla, resposta livre,
  unknown e correção de contexto; recuperar o diálogo após reconexão.
- [ ] Rejeitar resposta a pergunta expirada ou com versão/revisão incompatível;
  preservar o histórico e reavaliar entregas dependentes de uma correção.
- [ ] Implementar tabelas aditivas e as interfaces, com snapshots de contexto versionados.
- [ ] Verificar criação/leitura depois de recriar repositório/processo em PostgreSQL.
- [ ] Executar build, testes focados de domínio/persistência e smoke PostgreSQL.

**Aceitação:** estado recuperável independente do navegador e das Maps do provider.

### Tarefa 2 — limite e contabilidade de inferência

**Arquivos propostos:** criar `packages/billing-ledger/src/inference-budget-service.ts`
e testes; adaptar schema/ledger com reserva persistida, nunca apenas mutex de processo.

**Interfaces propostas:** `reserveExecutionBudget({tenantId, executionId,
maxCostCents, idempotencyKey})`, `authorizeProviderCall({executionId, callId,
upperBoundCents})`, `settleProviderCall({executionId, callId, usage,
actualCostCents})`, `releaseUnusedBudget(executionId)`. Uso normalizado reutiliza
`NormalizedUsage`; preço/modelo vêm de configuração versionada aprovada por Boni.

- [ ] Testar reservas concorrentes: soma não ultrapassa saldo disponível.
- [ ] Testar retry do mesmo `callId`: um débito; erro/cancelamento libera só reserva não consumida.
- [ ] Testar consumo não mensurável: bloquear novas chamadas e marcar reconciliação, sem inventar custo zero.
- [ ] Implementar reserva/settlement persistidos e teto por chamada/contexto/saída.
- [ ] Incluir pesquisa STJ no orçamento da tarefa preservando sua cobrança/idempotência própria.
- [ ] Verificar teto duro com provider fake tentando exceder chamadas ou contexto.

**Aceitação:** nenhuma chamada paga inicia sem cobertura autorizada. Detalhar
política de tarifação real antes do piloto; protótipo não realiza cobrança.

### Tarefa 3 — serviço durável e transporte de eventos

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

- [ ] Testar flag desligada e regressão das rotas REST/MCP existentes.
- [ ] Testar reconexão a partir do último evento, sem executar tools novamente.
- [ ] Testar a projeção pública com eventos internos contendo prompts, argumentos
  de tools e contratos: esses dados não aparecem em respostas, streams ou erros.
- [ ] Testar resposta selecionada e livre pelo mesmo endpoint autenticado, com
  versão da pergunta/contexto e idempotência; retry não retoma duas vezes a tarefa.
- [ ] Testar lease de worker persistido: duas instâncias não executam a mesma chamada.
- [ ] Implementar worker retomável; falha do browser não cancela silenciosamente o trabalho.
- [ ] Testar cancelamento: não iniciar próxima tool; entrega parcial continua identificável.
- [ ] Testar recuperação após reinício: reconciliar chamada sem resultado confirmado,
  sem repetir automaticamente operação cobrada ou gravação incerta.

**Aceitação:** `RUNNING` não fica indefinidamente sem worker; retomada não promete
restaurar estado privado de SDK. Continuação usa nova execução sucessora quando necessário.

### Tarefa 4A — tools e fontes exigidas pelo workflow

**Arquivos:** reaproveitar `packages/legal-tools`, `packages/legal-data`,
`packages/source-catalog`, `packages/source-providers` e ingestão/persistência;
planejar módulo normativo delimitado nessas fronteiras, sem substituir o corpus STJ.

- [ ] Inventariar capabilities realmente disponíveis versus catálogo V2 e requisitos
  do workflow escolhido. Não usar conhecimento do modelo como tool de legislação.
- [ ] Para workflow que exige normas, implementar recuperação de dispositivo/versão
  e fonte oficial antes da homologação; distinguir redação atual e aplicável.
- [ ] Testar norma indisponível, versão ausente, recuperação incorreta e pedido fora
  da cobertura; resultado limitado, sem fingir pesquisa normativa concluída.
- [ ] Reutilizar pesquisa STJ e explicitar limites de tratamento posterior e suporte.
- [ ] Testar REST/MCP atuais inalterados; novas tools só são expostas quando prontas.

**Aceitação:** fontes necessárias são recuperadas por operações verificáveis;
fixtures provam integração, não atualidade jurídica nem corpus real homologado.

### Tarefa 4B — orquestrador, especialistas e ferramentas do caso

**Arquivos propostos:** criar `packages/legal-workflows/src/agentic-case-task/`
com política/definição de tarefa e testes; integrar catálogo/instruções da tarefa 0;
adaptador interno de contexto em
`packages/legal-tools/src/case-context`; integrar serviço da tarefa 3.

**Consome:** catálogo/workflow/context packets da tarefa 0, execução/controle das
tarefas 1–3 e fontes/tools da tarefa 4A.
**Produz:** diagnóstico, matriz de questões/fatos/provas/autoridades, estrutura da
peça quando cabível, findings e entrega preliminar com fontes versionadas.

- [ ] Testar seleção de tools: apenas capabilities aprovadas da tarefa, sem protocolo ou shell.
- [ ] Testar revogação/deleção entre duas leituras; validar novamente antes de gravar.
- [ ] Testar documento que instrui ignorar regras; tool proibida não executa.
- [ ] Integrar `AgentRuntime` com o Legal Orchestrator, seleção de especialistas e
  registro filtrado. O orquestrador delega investigação a papéis pertinentes e
  reconcilia resultados, em vez de fazer toda análise num prompt genérico.
- [ ] Integrar analista do caso/provas, pesquisador, verificador, especialista
  processual, redator e revisores conforme dependências do workflow; não chamar
  todos os papéis automaticamente nem duplicar tools/services.
- [ ] Testar plano de pesquisa normativa/jurisprudencial, requisitos processuais,
  questão material omitida e conclusão sem suporte; gerar findings identificáveis.
- [ ] Testar revisão adversarial substantiva separada da revisão estrutural atual.
- [ ] Testar lacuna material: `WAITING_USER` ou entrega explicitamente preliminar.
- [ ] Gerar `LegalQuestion` somente para lacuna material ou escolha necessária:
  opções adaptadas ao objetivo e contexto, sem pressupor cabimento/procedência.
- [ ] Testar pedido sem espécie de peça definida: esclarecer a necessidade ou
  investigar a medida apropriada, em vez de aplicar um template fixo.
- [ ] Testar contexto escrito e informações já presentes nos documentos/respostas:
  reaproveitar a origem sem repetir perguntas; conflito material exige esclarecimento.
- [ ] Testar resposta livre e **Ainda não sei**: mudar a investigação ou expor limite;
  não tratar desconhecimento como fato, autorização ou aprovação jurídica.
- [ ] Testar análise seguida de pedido de redação/revisão: reutilizar contexto
  autorizado, preservar entregas anteriores e selecionar só os papéis necessários.
- [ ] Testar pesquisa indisponível versus sem resultados; citação existente sem suporte.
- [ ] Testar nova versão humana durante execução: conflito, sem sobrescrita.

**Aceitação:** provider fake demonstra delegação, ferramentas e adaptação; evals
com provider real posterior demonstram competência jurídica. Texto gerado não
adota fatos, aprova versão ou fabrica jurisprudência.

### Tarefa 5 — superfície Trabalho, contexto e editor

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

- [ ] E2E: objetivo → escopo → execução → pergunta relevante → entrega → abrir fonte → editar/salvar.
- [ ] E2E: as quatro ações abrem diálogo orientado à finalidade, não disparam
  entrega pronta. Entrada livre permanece disponível e converge para o mesmo fluxo.
- [ ] E2E: pergunta de finalidade com opções, complemento livre quando necessário,
  objetivo/contexto escrito sem anexo e resposta **Ainda não sei**.
- [ ] Testar seleção única com radio e múltipla com checkbox, rótulos acessíveis,
  nenhuma resposta jurídica pré-marcada, teclado e envio explícito.
- [ ] E2E: informação já fornecida não é perguntada novamente; resposta livre fora
  das opções é preservada. Corrigir resposta reavalia o trabalho dependente.
- [ ] E2E: análise → pedido contextual de pesquisa/redação/revisão mantém o contexto
  sem copiar resultados ou cadastrar o caso de novo; leitura/escrita seguem autorizadas.
- [ ] E2E: recarregar durante execução recupera estado e eventos sem duplicação.
- [ ] E2E: revogar documento ou ficar sem orçamento expõe motivo e preserva texto.
- [ ] Implementar uma ação principal por estado e detalhes expansíveis.
- [ ] Traduzir eventos internos em status genéricos aderentes à atividade real;
  manter agentes, prompts, scripts e catálogo de tools fora da UI de trabalho.
- [ ] Em confecção de peça, apresentar a minuta redigida como entrega principal;
  pesquisa/outline não satisfazem a aceitação. Testar campos e lacunas explícitos
  e a entrega alternativa quando não houver suporte material para o pedido.
- [ ] Verificar entrada sem peça predefinida; o documento aparece somente quando
  produzido pela tarefa solicitada. Medida desconhecida não exige escolher modelo.
- [ ] Validar descoberta das capacidades e ausência de atalhos/botões duplicados
  na mesma superfície. Uma ação principal de execução, secundárias em **Mais opções**,
  fontes/contexto sob demanda e retorno que preserve tarefa/caso/versão.
- [ ] Integrar entrega ao editor existente; manter edição não salva e conflito visíveis.
- [ ] Verificar teclado, leitura de status, 320px e desktop, sem controles recortados.
- [ ] Comparar mesma tarefa com fluxo anterior: intervenções, mudanças de tela,
  tempo e fontes disponíveis; não usar só contagem de elementos HTML como prova.
- [ ] Regressão do pacote MCP externo: nove tools locais atuais, OAuth/seleção de
  caso, erros, idempotência e billing preservados. MCP não depende de modelo nativo.

**Aceitação:** Boni identifica as capacidades, abre diálogo por ação ou texto livre,
responde opções/perguntas pertinentes e conclui o percurso sem coordenar agentes,
copiar resultados ou enfrentar repetição de perguntas e funcionalidades. A peça é
uma entrega eventual, criada a partir do contexto, nunca a entrada predefinida.

### Tarefa 6 — homologação com um provider real

**Pré-condições de decisão:** Boni escolhe provider/modelo, escopo de envio e teto
financeiro. Não usar modelos padrão dos adapters como escolha comercial implícita.

**Arquivos:** adaptar configuração/factory no módulo da tarefa 3; reaproveitar
`apps/api/src/provider-real.integration.test.ts` e acrescentar casos de execução
jurídica, sem credenciais em fixtures/logs.

- [ ] Primeiro testar tarefa mínima, consumo normalizado e cancelamento com teto aprovado.
- [ ] Comparar contexto observado pelo provider com fontes expressamente selecionadas.
- [ ] Testar falha/timeout/limite, sem fallback para outro destino não autorizado.
- [ ] Medir exemplos sintéticos aprovados por Boni: pertinência, suporte às afirmações,
  omissão de fatos, intervenções, tempo e custo real, inclusive tentativas falhas.
- [ ] Registrar evidência com commit, ambiente, provider/modelo e limites de conclusão.

**Aceitação:** percurso real comprovado. Tests fake não substituem esta evidência.

### Tarefa 7 — liberação controlada e continuidade

- [ ] Concluir preços/margem, reserva, conciliação e comunicação de consumo para o escopo comercial.
- [ ] Executar regressões pertinentes: unitários, tipos, lint/build, E2E de casos,
  documentos, revisão, pesquisa, MCP e checks PostgreSQL dos schemas afetados.
- [ ] Criar runbook: migration aditiva, flag, observabilidade, rollback e retenção de sessões.
- [ ] Boni avalia evidências e autoriza separadamente integração, aplicação de migration e deploy.
- [ ] Após autorização, verificar revisão/tráfego publicado e tarefa real controlada.

**Aceitação:** experiência nova pode ser desativada sem apagar casos/entregas nem
interromper REST/MCP. Publicação não é consequência automática de testes locais.

## Evoluções com planos próprios

- **Ampliação normativa:** ampliar o conjunto inicial após os workflows validados;
  legislação requerida pelo primeiro workflow já pertence à tarefa 4A, não fica
  integralmente adiada para depois da entrega jurídica.
- **Biblioteca administrável:** modelos de tarefas versionados, favoritos e
  permissões, sem transformar o produto num catálogo obrigatório de prompts.
- **Mais agentes/fontes:** adicionar somente quando avaliações demonstrarem ganho
  sobre orquestrador com ferramentas; medir custo/latência e regressões jurídicas.

## Revisão desta proposta

Plano escrito a partir do checkout, sem executar migrations, modelos ou checks
do produto. Artefatos visuais são simulação local. Avaliar primeiro organização,
autonomia e pontos de intervenção; detalhamento de preço/modelo permanece uma
decisão explícita anterior à homologação paga, não uma escolha escondida no código.
