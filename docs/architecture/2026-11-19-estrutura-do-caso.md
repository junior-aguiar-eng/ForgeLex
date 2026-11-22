# Estrutura do caso (Mesa agêntica)

Sujeita à TRAVA DE PRODUTO do `AGENTS.md`: Mesa única, agentes nos bastidores, visual limpo, poucos botões.

## O que Boni pediu (19/11/2026)

Uma seção exclusiva "Estrutura do caso", dentro da Mesa. Os agentes dissecam, estruturam, revisam e entendem o caso
entregue pelo cliente, por **texto colado na janela** ou **PDF enviado**. Não é a estrutura antiga (formulários de fato,
prova, linha do tempo, questão e memorando preenchidos à mão).

## Ponto de partida real (verificado no código em 20/11/2026; corrige a primeira versão deste texto)

- A API guarda fatos, provas, cobertura, linha do tempo, questões e análises (`/api/v2/matters/:id/facts|evidence|timeline|issues|analyses`).
- **O ForgeLex não tem hoje um agente próprio que extraia a estrutura de um documento.** O `CaseDocumentAnalysisWorkflow` só reorganiza o que
  já foi cadastrado e diz, nas suas limitações, que "não extrai fatos novos automaticamente". A ferramenta `case.save_analysis` só aceita
  chamadas vindas do MCP com conexão OAuth (`source === 'MCP'`): as propostas de análise que o painel antigo mostrava vinham da IA
  **própria do cliente** (Conectar IA), não de um agente do ForgeLex.
- O painel antigo de conferência (`CaseAnalysisPanel`) só existia dentro da tela Casos. Com ela removida do gelo, o gelo não tem como ver
  nem decidir essas propostas. Isso se corrige com a aba "Estrutura".
- Já existe a ação `analyze_evidence` (papel `matter-analyst`) no fluxo agêntico da Mesa, com cobrança por trabalho em créditos. É o lugar
  natural do novo agente.

## Decisão de arquitetura (corrigida em 20/11/2026, depois de ler o fluxo agêntico)

**Não se cria um agente novo.** O fluxo agêntico da Mesa já tem a ação `analyze_evidence` ("Analisar fatos e provas", papel `matter-analyst`,
conferida por `adversarial-reviewer`), que emite: questões, afirmações classificadas (alegação, dado extraído, inferência), matriz de
prova com **trecho literal e posição UTF-16 conferidos contra a fonte** (`quoteStatus: MATCHED`), cronologia, contradições e lacunas. A Mesa
já mostra isso no resultado da conversa, e existe fluxo de aprovação (`evidence-review`, `approved-case-context`) que leva o que o usuário
confere para o contexto aprovado do caso. A trava contra invenção que eu propunha já existe ali.

O que falta, e é o que esta frente faz:
1. **Persistência na vista do caso:** hoje o resultado só aparece dentro da conversa que o gerou. A aba "Estrutura" mostra o resultado
   vigente do caso (a última análise concluída e o que já foi aprovado), sem precisar procurar a conversa.
2. **Disparo sem botão:** o usuário cola o relato ou salva o PDF no caso e a análise é proposta sozinha (hoje depende de escolher "Analisar
   fatos e provas" no seletor ou de o modo Automático acertar). Verificar o que o modo Automático faz com um relato colado.
3. **Decisão pela conversa:** aprovar, corrigir ou descartar itens no compositor ("o fato 3 foi em 2021"), usando o fluxo de aprovação existente.
4. **IA própria do cliente (MCP):** continua enviando análises ao repositório de análises; a aba as exibe junto.

## Desenho

1. **Entrada única, a de sempre.** Texto colado no compositor ou PDF anexado. Ao salvar no caso (ou ao colar um relato
   longo), o agente de análise roda sozinho. Sem botão "analisar".
2. **Aba "Estrutura" na peça** (ao lado de Texto, Fontes, Documentos, Revisão). Mostra o caso entendido, em ordem fixa e curta:
   - Resumo do caso em um parágrafo (o que o agente entendeu).
   - Partes e pedido.
   - Linha do tempo (datas, com o trecho do documento que sustenta).
   - Fatos, cada um com a fonte clicável (âncora no documento).
   - Provas e o que cada uma sustenta.
   - Questões jurídicas.
   - Lacunas: o que falta para a peça ficar firme, em perguntas objetivas.
3. **Revisão por conversa, não por formulário.** Cada item vem aceito por padrão quando tem âncora; o usuário só age no que
   diverge: diz no compositor "o fato 3 foi em 2021", "tire a prova 2", "falta o contrato". O agente aplica e mostra o que mudou.
   Itens sem âncora ficam marcados "a confirmar" e são os únicos que pedem atenção.
4. **A estrutura alimenta a peça.** A orientação guiada e a redação usam a estrutura confirmada; lacunas viram as perguntas do
   agente, não campos para preencher.
5. **Sem tela, sem lateral.** Nada de rota própria. Sem peça aberta, a estrutura aparece como cartão na conversa do caso.

## Fatias

- **E1 (corrige a regressão do gelo):** aba "Estrutura" que lê o que a API já guarda e as propostas de análise pendentes (da IA do
  cliente), com os itens que têm âncora já aceitos por padrão e o resto "a confirmar". Só leitura, mais decisão pela conversa.
- **E1b (substitui o `structure_case` proposto antes):** disparo automático da análise existente ao salvar documento no caso ou colar um relato, e
  estrutura persistente do caso a partir da análise vigente. Não cria agente novo.
- **E2:** correção por conversa (comandos sobre itens: alterar, remover, acrescentar) e resumo do caso.
- **E3:** estrutura confirmada entrando na orientação guiada e na minuta; lacunas viram perguntas.
- **E4:** PDF direto (identificar a peça e extrair partes e datas pela leitura do PDF, item U5 pendente).

## Desenho do E1b (20/11/2026)

**Achado que motiva o desenho.** No modo Automático o pedido sai sem `actionId` e o `legal-orchestrator` escolhe `plan.action` sozinho
(`case-task.ts`, nó `legal-orchestrator`). Nenhuma instrução o leva a `analyze_evidence`; a regra "não transformar todo pedido em peça
processual" o afasta de decisões fixas. Um relato colado pode virar `analyze_documents`, `research_question` ou `create_document`, e a aba
Estrutura só lê `analyze_evidence`.

**Regra proposta (servidor, sem botão novo).** Em `ExecutionService.startExecution`, o gancho `prepareStart` já recebe o pedido antes de
gravar o trabalho. Nele, o pedido ganha `actionId: 'analyze_evidence'` quando todas as condições valem:

1. não veio `actionId` (usuário deixou em Automático);
2. há caso (`matterId`), ou seja, existe onde guardar a estrutura;
3. não é continuação de conversa (`conversationId` ausente);
4. o texto parece relato: sem peça aberta (`context.draft`/`deskEdit` ausentes) e o corpo é narrativa, não instrução. Critério objetivo e
   barato: pelo menos 600 caracteres e nenhuma pergunta direta ao fim. Limiar a calibrar com textos sintéticos.

Se qualquer condição falhar, nada muda: o orquestrador decide como hoje. O usuário que escolheu uma ação nunca é sobrescrito.

**Decisão de Boni (20/11/2026): só relato colado dispara.** Salvar documento no caso não dispara análise automática; o documento espera o
pedido do usuário. Fica fora do E1b e só volta por nova decisão dele.

**Salvaguardas (não mudam).**
- Acesso da IA ao caso: `authorizeOwner` e `requireInferenceAuthorization` continuam antes de qualquer custo. Sem autorização, não roda e a
  Mesa diz isso em uma frase.
- Cobrança: o disparo automático gasta créditos como qualquer análise. A Mesa mostra o custo previsto no mesmo ponto em que hoje pede
  confirmação; não há gasto escondido.
- Antiduplicação (entregue): o mesmo texto, no mesmo caso, já com análise de fatos e provas viva (não falha nem cancelada) não é
  roteado de novo para `analyze_evidence`; o pedido segue pelo orquestrador como antes. Compara o texto exato do pedido, não um hash,
  e não impede o usuário de pedir a análise pelo seletor.
- A análise só propõe (matriz probatória, `quoteStatus`); adotar fatos continua sendo decisão do usuário pelo fluxo `evidence-review`.

**Testes.** Unidade da regra (cada condição falhando isoladamente muda o resultado); ação escolhida preservada; sem caso não dispara;
relato curto não dispara; mesmo hash não repete; sem autorização não gasta. Teste com mutação na condição 4, como no E1.

**Em aberto.** Limiar de 600 caracteres como ponto de partida, a calibrar com textos sintéticos.

## Desenho do E2 (20/11/2026): correção da estrutura pela conversa

### Intenção
O usuário corrige o que o ForgeLex entendeu falando no compositor ("o fato 3 foi em 2021", "tire a prova 2", "o cliente também pagou
o aluguel de abril em dinheiro"), sem formulário e sem botão. Hoje o mesmo efeito exige o painel de conferência (`EvidenceReviewPanel`),
que é seleção por item. A aba Estrutura, que já mostra a análise, passa a refletir o que foi corrigido, e ganha um resumo do caso.

### Metas, não metas e antimetas
- **Metas:** alterar (texto ou data do evento), remover e acrescentar itens da análise vigente do caso; resumo curto do caso na aba.
- **Não metas:** reanalisar o caso (continua sendo o E1b); aprovar item para o contexto do caso por fora do fluxo atual (`evidence-review`);
  PDF direto (E4); estrutura entrando na minuta (E3).
- **Antimeta:** o usuário acrescentar um fato e ele parecer tão firme quanto um fato com trecho de fonte. Isso falha o produto mesmo que
  tudo funcione.

### Restrições
- TRAVA DE PRODUTO: sem tela, painel ou botão novo. Escolha de ação continua automática, sem seletor novo.
- Relato do usuário não é prova documental (regra do agente de análise): fato acrescentado nunca nasce com trecho nem prova.
- Contratos versionados dos agentes não mudam; o que for novo entra numa versão nova (ver `case-task.ts`, fixtures `pre-*`).
- Acesso da IA ao caso, autorização de inferência e orçamento valem como em qualquer trabalho.

### Abordagens consideradas
- **A. Ação nova no fluxo agêntico (escolhida por Boni).** Um agente lê o pedido e a análise vigente e devolve comandos estruturados; o
  servidor valida e aplica. Interpretação livre; custo de um trabalho por correção; exige versão nova do contrato.
- B. Comandos por regra, sem agente. Barato e previsível, mas só entende frases no formato exato (formulário disfarçado) e não cobre
  "falta o contrato". Descartada.
- C. Híbrido (regra para o inequívoco, agente para o resto). Dois caminhos para manter. Fica como otimização futura se o custo pesar.

### O que foi decidido
1. **Ação nova `adjust_structure`** ("Ajustar a estrutura"), papel `matter-analyst`, conferida por `adversarial-reviewer`. Entra como
   versão nova do contrato; os contratos anteriores ficam intactos.
2. **A análise vigente se localiza pelo caso, não pela conversa.** Quem corrige está na aba Estrutura (peça aberta, `matterId`, sem
   `conversationId`); a análise alvo é a mesma que a rota `GET /api/agentic/matters/:matterId/structure` indica.
3. **O agente recebe os itens com id e texto e resolve a referência do usuário.** Não depende de número, mas a aba passa a numerar os
   fatos e as provas ("F3", "P2") para o usuário ter como se referir a eles.
4. **O agente devolve comandos, nunca texto livre aplicado direto:** `ALTERAR {itemId, texto?, dataEvento?}`, `REMOVER {itemId}`,
   `ACRESCENTAR {texto}`. O servidor rejeita `itemId` que não pertence à análise alvo e comando sem efeito.
5. **Alterar e remover usam as decisões que já existem** (`ADOPT` com texto e `eventDate` editados; `DISCARD`). Nada de novo repositório.
6. **Acrescentar cria item "informado por você, a confirmar":** classificação própria, sem trecho, sem prova, fora do contexto
   aprovado até o usuário confirmar. Vira fato do caso só por confirmação explícita pela conversa.
7. **Resumo do caso** sai do mesmo trabalho: um parágrafo curto, gerado junto com a correção, guardado com a entrega. O contrato do
   agente de análise (`analyze_evidence`) não muda.
8. **A aba mostra o que mudou:** itens alterados, removidos e acrescentados aparecem marcados, com a frase do usuário que os originou.

### O que fica para quem construir
- Como a Mesa escolhe `adjust_structure` sem seletor. Proposta: com a aba Estrutura aberta, o compositor envia a ação explicitamente
  (contexto da tela decide, sem controle novo). Confirmar no código se o compositor sabe qual aba está ativa.
- Onde guardar itens acrescentados e o resumo (nova coluna ou JSON da entrega), e a regra de expiração quando uma nova análise
  substitui a vigente (correções antigas não se reaplicam sozinhas; o usuário é avisado).
- Limiar e erros: comando ambíguo ("o fato 3" que não existe) vira pergunta ao usuário, não palpite.
- Fatias sugeridas: (1) numeração + comandos alterar/remover; (2) acrescentar com selo; (3) resumo do caso.

## Limites

Só textos sintéticos nos testes. Sem a aba, nada de dado real é estruturado. Regras de privacidade e consentimento de IA do
caso permanecem: a análise só roda com o acesso da IA autorizado.

## Estado de execução

**E1 entregue (20/11/2026):** rota `GET /api/agentic/matters/:matterId/structure` (indica a análise de fatos e provas concluída mais recente do
caso; 3 testes, com mutação) e aba **Estrutura** na peça (gelo), que mostra o resultado com classificação, fontes e pontos a conferir, sem
formulário e sem botão. Ambiente sem o fluxo de análise (rota ausente) mostra o estado vazio, não erro. **Limite:** o teste de navegador usa as
duas rotas de leitura simuladas; o encontro real rota + tela só aparece com o fluxo de análise ligado. **Falta:** disparo automático ao salvar
documento ou colar relato (E1b), decisão pela conversa (E2), estrutura na orientação guiada e na minuta (E3), PDF direto (E4).
