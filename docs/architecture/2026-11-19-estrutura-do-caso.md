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

## Decisão de arquitetura (recomendação, a confirmar por Boni)

Criar a ação **`structure_case`** no fluxo agêntico da Mesa, para o ForgeLex mesmo dissecar o caso, sem exigir IA externa:
1. Entrada: texto colado ou documentos salvos no caso (cada trecho já tem âncora).
2. O agente propõe partes, pedido, fatos, linha do tempo, provas, questões e lacunas.
3. **Trava anti-invenção:** todo fato e toda data precisam citar uma âncora e um trecho que exista *literalmente* no documento; o que não
   passar nessa conferência é descartado antes de aparecer. Sem âncora, o item não entra.
4. O resultado vira proposta de análise do caso (mesmo repositório e mesma conferência já existentes), exibida na aba "Estrutura".
5. Custo e consentimento seguem o fluxo da Mesa: orçamento por trabalho e acesso da IA ao caso autorizado.
A IA própria do cliente (MCP) continua podendo enviar análises ao mesmo lugar.

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
- **E1b:** o agente `structure_case` (acima), com a conferência literal de trechos. É a fatia que cumpre o pedido de dissecar o caso.
- **E2:** correção por conversa (comandos sobre itens: alterar, remover, acrescentar) e resumo do caso.
- **E3:** estrutura confirmada entrando na orientação guiada e na minuta; lacunas viram perguntas.
- **E4:** PDF direto (identificar a peça e extrair partes e datas pela leitura do PDF, item U5 pendente).

## Limites

Só textos sintéticos nos testes. Sem a aba, nada de dado real é estruturado. Regras de privacidade e consentimento de IA do
caso permanecem: a análise só roda com o acesso da IA autorizado.
