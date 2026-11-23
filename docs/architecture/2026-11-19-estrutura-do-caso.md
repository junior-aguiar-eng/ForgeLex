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

## Desenho do E3 (23/11/2026)

**Pedido do Boni.** A estrutura do caso aparece como contexto na orientação guiada e na minuta, e alimenta a redação da peça. A minuta já
deve sair contextualizada pelos documentos enviados. Itens ainda "a confirmar" (que o usuário da Mesa não conferiu) entram na redação, com
o registro de que são alegação; a revisão do usuário é necessária. A peça continua na voz da peça, não em terceira pessoa.

**Ponto de partida (verificado em `main` em 23/11/2026).** Os documentos enviados já entram no contexto de toda execução do caso
(`context.documents`). Os itens que o usuário confirmou (`approvedItems`: CASE_FACT e CASE_EVIDENCE) também entram, tratados como contexto,
não como verdade (`agentic-approved-case.ts`). Não chegam à redação: o resumo do caso (E2), os itens "a confirmar" e qualquer sinal de
quais itens sustentam a peça. A orientação guiada só pergunta área, tarefa, peça e tribunal e não mostra a estrutura.

**Decisões do Boni.** (1) Fonte montada na execução, reaproveitando o mecanismo do E2. (2) Item "a confirmar" entra na minuta, registrado como
alegação em `structureUse`, sem mudar a voz da peça. (3) A minuta exige revisão do usuário. Sem análise nem disparo automático novo: sem estrutura, a minuta sai como hoje.

**Desenho.**
1. **Ação:** só `create_document`. `review_text`, `analyze_documents`, `research_question` e `analyze_evidence` ficam como estão.
2. **Fonte da estrutura.** Ao iniciar `create_document` com caso, o `case-task-driver` lê a estrutura vigente (`findCurrentStructure`, mesmo
   critério da aba) e monta uma fonte confiável `structure-context:<deliveryId>`, no molde de `structureItemsSource`: cada item com id, label
   (F1, P1), classificação, texto e estado (`CONFIRMADO`, `A_CONFIRMAR`, `RETIRADO` fora), mais o resumo do caso. Itens retirados pelo
   usuário não entram. Sem estrutura, nenhuma fonte e nenhum erro (diferente do `adjust_structure`, que recusa).
3. **Instrução do agente (contrato novo, v14).** O texto da redação muda, então vale a regra do v13: versão nova, v1 a v13 e as
   fixtures `pre-*` congeladas. "A confirmar" quer dizer só que **o usuário da Mesa ainda não conferiu o item**; não muda a voz da peça. O
   agente redige a peça na voz e na pessoa que a peça pede (como a parte, por seu advogado), sem frases do tipo "segundo o cliente" ou
   "conforme alegado", e usa os itens `A_CONFIRMAR` no texto como usaria qualquer fato do caso. A diferença é só o registro: ele devolve em
   `structureUse` quais itens a confirmar a peça usou. Itens `CONFIRMADO` entram como hoje (contexto, não prova). Lacuna vira pergunta
   objetiva ao usuário (mecanismo de perguntas que já existe).
4. **Revisão.** A entrega devolve `structureUse`: os ids dos itens `A_CONFIRMAR` em que a peça se apoia. O servidor audita que cada id existe
   na fonte (mesma auditoria de itemId do E2, nos mesmos três pontos); id inventado derruba o trabalho. A peça mostra, nas fontes e
   conferência que já existem, o aviso "Baseada em itens ainda a confirmar: F2, P1". É aviso, não bloqueio: nada de botão nem trava de
   exportação (trava de produto); a confirmação continua pela conversa e pelo painel de conferência.
5. **Orientação guiada.** Uma linha só de leitura no resumo da orientação, com o caso escolhido: "Estrutura do caso: 5 fatos, 2 a confirmar"
   (contagem da rota `GET .../structure` que já existe). Sem estrutura, a linha não aparece. Sem botão, sem formulário.
6. **Limite de tamanho.** A fonte respeita o teto de texto por fonte: entram primeiro o resumo e os confirmados, depois os `A_CONFIRMAR`,
   até o teto; o que ficar de fora é dito na própria fonte ("N itens omitidos"). Diferente do `adjust_structure`, a redação não falha por
   estrutura grande.
7. **Privacidade.** Mesma regra da análise: só com o acesso da IA autorizado no caso.

**Metas.** Minuta que usa os documentos e a estrutura, e o usuário sabe quais itens que ele ainda não conferiu sustentam a peça, sem ter de
procurar.
**Fora de escopo.** Disparar análise ao salvar documento; reaplicar correções; PDF direto (E4); qualquer tela, aba ou rota nova.
**Anti-metas (seriam fracasso mesmo funcionando).** Item não conferido apresentado ao usuário como conferido (a revisão não pode ficar invisível); minuta que falha ou trava por falta de estrutura;
aviso de revisão que vira controle obrigatório a operar.

**Abordagens consideradas.** (A) Fonte montada na execução, a escolhida: reaproveita o E2 e não mexe no formato do contexto. (B) Colocar os
itens a confirmar em `approvedItems`: mistura "aprovado" com "não aprovado" e exige mexer no formato do contexto e na regra de revisão.
(C) Rodar a análise antes de cada redação sem estrutura: custa uma execução a mais por peça e contraria a decisão de não disparar análise
ao salvar documento.

**Chamadas minhas (marcadas para o Boni conferir).** Aviso sem bloqueio de exportação; só `create_document`; itens retirados fora da fonte;
omissão por tamanho em vez de falha; nova versão de contrato em vez de alterar o v13.

**Fica para quem constrói.** Nome e formato exatos de `structureUse` na entrega e onde a web o mostra; como a web conta fatos e itens para a
linha da orientação sem nova rota; qual o limite de caracteres de cada parte da fonte.

**Fatias sugeridas.** (1) Fonte + contrato v14 + auditoria de `structureUse`. (2) Aviso "baseada em itens a confirmar" nas fontes da peça.
(3) Linha de leitura na orientação guiada.

## Desenho do E4 (23/11/2026)

**Pedido do Boni.** O cliente envia o PDF; os agentes o dissecam (tipo da peça, partes, datas, fatos, provas) e isso vira contexto do caso. O
PDF não fica salvo, mas tudo o que saiu dele pertence ao caso e fica. Uma análise por documento, e a estrutura do caso aparece sempre
como um conjunto só, somando tudo, sem dispersão.

**Ponto de partida (verificado em `main` em 23/11/2026).**
- O PDF é lido no navegador (OCR opcional) e só o texto segue, somado ao **contexto escrito** do pedido como blocos
  `Anexo "nome" (texto extraído):` (`attachmentContext`). O arquivo não é enviado nem guardado (DEC-12).
- A regra do E1b (`routePastedAccount`) olha só o **objetivo** (600 caracteres ou mais, sem pergunta). Um PDF com pedido curto não dispara
  a análise.
- A estrutura do caso é a análise de fatos e provas mais recente (`findCurrentStructure`). Outra análise a substitui; o que persiste da
  anterior é só o que o usuário confirmou. A análise não devolve tipo da peça nem partes; datas já vêm na cronologia.
- Os ids dos itens da revisão incluem o id da entrega, então são únicos entre análises diferentes.
- Conversas escondidas do histórico ficam fora da busca da estrutura.

**Decisões do Boni.** (1) Uma análise por documento. (2) A estrutura do caso é a soma de todas as análises, mantendo sempre o contexto.
(3) Soma na leitura: cada análise mantém a sua revisão, confirmações e correções; sem tabela nova nem migração.

**Desenho.**
1. **Disparo.** Em Automático, num caso, sem conversa anterior nem peça aberta: o pedido vai para `analyze_evidence` quando tem anexo com
   texto (bloco `Anexo "…"` no contexto escrito, com 300 caracteres ou mais de texto) ou quando vale a regra de hoje. Pedido que termina em
   "?" segue livre. A unidade "documento" é o pedido com seus anexos: um envio, uma análise, cobrada como análise. A deduplicação do E1b
   passa a comparar o texto completo (objetivo e contexto), e uma nova análise do mesmo texto no caso substitui a anterior na soma.
2. **Identificação do documento (contrato v15).** A análise passa a devolver `documentProfile`: `pieceType` (rótulo curto, ex.: "Petição
   inicial"), `pieceTypeCertainty` (`IDENTIFICADA` ou `INCERTA`) e `parties` (nome e papel, até 10), cada parte com a citação literal que o
   servidor confere contra a fonte, como já faz com a matriz de provas. O campo é opcional na entrega. v1 a v14 e as fixtures `pre-*` ficam
   intactos. Sem texto de peça processual (relato, e-mail), `pieceType` pode vir vazio.
3. **Soma na leitura.** `findCaseStructure` devolve todas as análises vivas do caso (concluídas, `analyze_evidence`), da mais antiga para a
   mais nova, no máximo 20, ignorando a de mesmo texto substituída por outra mais nova. A rota `GET /api/agentic/matters/:id/structure`
   mantém `structure` (a mais recente, para quem já lê) e acrescenta `structures`, a lista ordenada. `findCurrentStructure` continua
   existindo.
4. **Aba Estrutura.** Uma só visão: as seções de sempre (Questões, Afirmações, Cronologia, Contradições…) somam os itens de todas as
   análises, numerados em sequência (F1…Fn, P1…Pn) pela ordem de chegada, cada item com uma marca discreta da origem ("Documento 2"). No
   alto, "Documentos do caso" lista cada documento com tipo da peça, partes e data da análise. Sem abas por documento. O resumo mostrado é
   o mais recente entre as análises.
5. **Ajuste pela conversa (E2) sobre a soma.** A lista que o agente recebe passa a ter os itens de todas as análises, com os mesmos rótulos
   da aba. O servidor resolve cada comando para a análise dona do item e aplica uma análise por vez, cada uma na sua transação e
   idempotente por comando; falha numa vira pergunta ao usuário, não derruba as outras. ACRESCENTAR entra na análise mais recente.
6. **Redação (E3) sobre a soma.** A fonte `structure-context` reúne os itens de todas as análises (confirmados primeiro, depois a
   confirmar), uma linha por documento com tipo da peça e partes, e o resumo mais recente; o mesmo teto de tamanho e a mesma omissão
   declarada.
7. **O que fica no caso.** O arquivo do PDF nunca é guardado; o texto extraído vive no contexto da conversa da análise, e o que o usuário
   confirma entra nos fatos e provas do caso como hoje. **Chamada minha:** a estrutura passa a contar as conversas de análise do caso
   mesmo escondidas do histórico, porque a análise é contexto do caso e não deve sumir quando o usuário limpa o histórico. O caso apagado
   leva tudo, como hoje.

**Metas.** PDF anexado vira contexto estruturado sem o usuário pedir; vários documentos somam em uma estrutura só; o usuário vê que
documentos o caso já tem; a redação e o ajuste usam o conjunto.
**Fora de escopo.** Guardar o PDF ou salvá-lo como documento do caso; ler a estrutura visual do PDF (tabelas, páginas) além do texto
extraído; OCR (U6); uma análise por anexo dentro do mesmo envio; fundir contradições entre documentos (elas aparecem, o agente não
as resolve); abas ou telas por documento.
**Anti-metas.** Estrutura que perde um documento anterior sem o usuário saber; item sem origem visível; análise duplicada do mesmo texto
somada duas vezes; qualquer botão ou controle novo.

**Abordagens consideradas.** (A) Soma na leitura, a escolhida: sem migração, cada item segue ligado ao documento, reaproveita E1 a E3.
(B) Estrutura do caso guardada à parte: leitura simples, mas persistência nova com migração e confirmações em dois lugares que podem
divergir. (C) O agente funde tudo a cada documento: esconde contradições e reescreve o que já estava confirmado.

**Chamadas minhas (para o Boni conferir).** Unidade = envio com seus anexos; limite de 300 caracteres de anexo para disparar; no máximo
20 análises na soma; resumo mais recente; ACRESCENTAR na análise mais recente; conversas escondidas contam para a estrutura; `pieceType`
livre em vez de catálogo fechado.

**Fica para quem constrói.** Como o v15 se relaciona com a versão de base da análise (v10 a v12); onde a web guarda a origem de cada item
sem nova rota; como o servidor repete o mesmo ajuste em várias análises sem duplicar o registro de comandos; formato exato do rótulo de
origem.

**Fatias sugeridas.** (1) Disparo pelo anexo e deduplicação pelo texto completo. (2) `documentProfile` no v15. (3) `findCaseStructure`, rota
e aba com a soma e "Documentos do caso". (4) Ajuste pela conversa sobre a soma. (5) Redação sobre a soma.

## Limites

Só textos sintéticos nos testes. Sem a aba, nada de dado real é estruturado. Regras de privacidade e consentimento de IA do
caso permanecem: a análise só roda com o acesso da IA autorizado.

## Estado de execução

**E1 entregue (20/11/2026):** rota `GET /api/agentic/matters/:matterId/structure` (indica a análise de fatos e provas concluída mais recente do
caso; 3 testes, com mutação) e aba **Estrutura** na peça (gelo), que mostra o resultado com classificação, fontes e pontos a conferir, sem
formulário e sem botão. Ambiente sem o fluxo de análise (rota ausente) mostra o estado vazio, não erro. **Limite:** o teste de navegador usa as
duas rotas de leitura simuladas; o encontro real rota + tela só aparece com o fluxo de análise ligado. **Falta:** disparo automático ao salvar
documento ou colar relato (E1b), decisão pela conversa (E2), estrutura na orientação guiada e na minuta (E3), PDF direto (E4).

**E2 entregue (22/11/2026, branch `claude/e2-ajustar-estrutura`):** ação `adjust_structure` no contrato v13 (v1 a v12 e as fixtures `pre-*`
intactos). Com a aba Estrutura aberta **e uma estrutura carregada**, o pedido no compositor (modo Automático) vira ajuste, numa conversa
nova; o campo diz isso em texto ("Corrija a estrutura do caso…"). Aba vazia, carregando ou com falha: o pedido segue o fluxo normal
(E1/E1b). O agente recebe os itens da análise vigente (localizada pelo caso, paginando as conversas do próprio caso) e devolve comandos
ALTERAR/REMOVER/ACRESCENTAR e um resumo; pedido que não é correção (redigir, pesquisar, reanalisar, relato novo) volta sem comandos e com
aviso para pedir fora da aba. O servidor aplica numa transação, idempotente por trabalho; ACRESCENTAR só entra no caso por ADOPT explícito.
A aba numera F/P, mostra o selo "informado por você, a confirmar", as marcas "corrigido por você e confirmado no caso" (sem as citações do
texto antigo) e "retirado por você", o resumo e as perguntas em português; recarrega quando o ajuste termina; e, quando uma análise nova
substituiu outra com correções pela conversa, avisa em "Pontos a conferir" que elas não foram reaplicadas. Ajuste sem caso é recusado
(`MATTER_REQUIRED`); análise grande demais para a lista falha com `TASK_CONTEXT_LIMIT`. A revisão guarda só os 10 registros de ajuste mais
recentes (a idempotência fica nos ids de comando, que não são podados).

**Limites e pendências do E2 (para Boni decidir):**
- **Decisão 8 em parte:** só o item acrescentado mostra a frase do usuário ("Você disse: …"); alterados e retirados mostram a marca sem a
  frase, porque a decisão não guarda o pedido.
- **Confirmar item acrescentado pela conversa não existe:** ALTERAR num item "informado por você" vira pergunta; a confirmação hoje é só
  pelo painel de conferência antigo.
- **ALTERAR = ADOPT (decisão 5):** corrigir um item o confirma no caso; a marca da aba diz isso ("corrigido por você e confirmado no caso").
- **Cobrança:** trabalho com pelo menos um comando é cobrado mesmo que todos virem perguntas; sem comando, não é cobrado.
- **Histórico:** cada correção abre uma conversa e aparece na lista de conversas recentes (adiado).
- **Busca da análise vigente:** percorre até 1000 conversas visíveis do caso; conversa escondida do histórico não conta.
- **Não verificado:** o caminho real até o modelo (pedido em linguagem natural resolvido pelo agente) não foi exercitado; os testes de
  navegador usam as rotas de leitura e do trabalho simuladas.

**E3 entregue (23/11/2026, branch `claude/e3-estrutura-na-redacao`):** o `case-task-driver` monta, para `create_document` e para o modo Automático
de um caso com análise vigente, a fonte `structure-context:<deliveryId>` (resumo do último ajuste e itens `CONFIRMADO` ou `A_CONFIRMAR`; itens
retirados ficam de fora; excedente de tamanho é cortado e declarado, nunca erro). Com a fonte e o fluxo guiado ligado, a execução roda no
contrato **v14** (comportamento do v12 mais o protocolo da estrutura; v1 a v13 e as fixtures `pre-*` intactos). O redator escreve na voz da
peça e devolve `structureUse` com os itens a confirmar em que se apoia; o servidor audita os ids (`STRUCTURE_ITEM_INVALID`) e a entrega guarda
só os `A_CONFIRMAR`. Nos pontos a conferir da minuta aparece "Baseada em itens ainda a confirmar: F2, P1."; na orientação guiada, a linha
"Estrutura do caso: N fatos, M itens a confirmar". Sem estrutura, acesso da IA ou leitura falha: a minuta sai como antes.

**Limites e pendências do E3:**
- **Não verificado com o modelo real:** o caminho até o modelo (o redator de fato escrever na voz da peça e listar `structureUse`) só foi
  exercitado com agente simulado.
- **Automático:** a versão é escolhida antes de o orquestrador decidir a ação; por isso o v14 vale para qualquer execução sem ação explícita
  de análise ou ajuste. Se o orquestrador escolher `analyze_evidence` no v14, a fonte é retirada do que o analista recebe.
- **Mudança durante a execução:** o hash da fonte entra no vínculo da execução; conferir um item enquanto a minuta roda derruba a execução
  com conflito de contexto, em vez de usar estrutura mais nova.
- **Custo de leitura:** cada redação com caso procura a análise vigente (até 1000 conversas do caso), como a aba Estrutura.
- **Edição de trecho (`review_text` e seleção na peça):** só recebe a estrutura se a execução for escolhida sem ação explícita.

