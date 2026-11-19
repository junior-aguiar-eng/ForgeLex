# Estrutura do caso (Mesa agêntica)

Sujeita à TRAVA DE PRODUTO do `AGENTS.md`: Mesa única, agentes nos bastidores, visual limpo, poucos botões.

## O que Boni pediu (19/11/2026)

Uma seção exclusiva "Estrutura do caso", dentro da Mesa. Os agentes dissecam, estruturam, revisam e entendem o caso
entregue pelo cliente, por **texto colado na janela** ou **PDF enviado**. Não é a estrutura antiga (formulários de fato,
prova, linha do tempo, questão e memorando preenchidos à mão).

## Ponto de partida real (verificado no código)

- A API já tem registros de fatos, provas, cobertura, linha do tempo, questões e análises (`/api/v2/matters/:id/facts|evidence|timeline|issues|analyses`).
- O fluxo de análise por IA existe (`packages/legal-workflows/src/case-document-analysis`, painel `CaseAnalysisPanel`): produz sugestões
  de FATO, PROVA, LINHA DO TEMPO, QUESTÃO e LACUNA, que o usuário aceita ou recusa.
- **Esse painel só existia dentro da tela Casos.** Com "Dados do caso" removida do gelo, hoje o gelo não tem como disparar nem
  ver a análise do caso. Esta frente corrige isso e é a prioridade.

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

- **E1 (corrige a regressão):** aba "Estrutura" lendo e exibindo o que a API já guarda e as sugestões da análise, com aceitar
  por padrão e a análise disparada ao salvar documento no caso. Reaproveita os endpoints e o `CaseAnalysisPanel` como fonte
  de lógica; a interface nova é só leitura, mais correção por conversa.
- **E2:** correção por conversa (comandos sobre itens: alterar, remover, acrescentar) e resumo do caso.
- **E3:** estrutura confirmada entrando na orientação guiada e na minuta; lacunas viram perguntas.
- **E4:** PDF direto (identificar a peça e extrair partes e datas pela leitura do PDF, item U5 pendente).

## Limites

Só textos sintéticos nos testes. Sem a aba, nada de dado real é estruturado. Regras de privacidade e consentimento de IA do
caso permanecem: a análise só roda com o acesso da IA autorizado.
