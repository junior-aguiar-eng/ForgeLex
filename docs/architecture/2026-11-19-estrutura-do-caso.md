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

## Limites

Só textos sintéticos nos testes. Sem a aba, nada de dado real é estruturado. Regras de privacidade e consentimento de IA do
caso permanecem: a análise só roda com o acesso da IA autorizado.
