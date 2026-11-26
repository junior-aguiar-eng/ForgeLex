# Roteiro do ensaio em produção: Estrutura do caso com o modelo real (26/11/2026)

Pendência 16 da seção 1A do [plano unificado](../../superpowers/plans/2026-11-11-forgelex-plano-unificado.md) e caixa aberta da
seção 6B. Desenho e limites: [estrutura do caso](../../architecture/2026-11-19-estrutura-do-caso.md). Executor, conferente e
aprovador: Boni, na própria conta, em `https://nexojuris.ia.br` (`9ccb9e7`, tema clássico). **Sem deploy, flag ou migration.**

Decisão de Boni de 26/11/2026: ensaiar em produção, na conta dele, o que o tema clássico alcança, e deixar o defeito do PDF
em trechos (abaixo) para uma fatia própria.

## 1. O que a leitura do código mostrou (e que molda o ensaio)

- **O servidor escolhe o contrato, não o tema.** `packages/legal-workflows/src/agentic-case-task/case-task.ts:1490`: a análise
  de fatos e provas roda sempre no v15; a redação num caso com análise vigente roda no v14 (a Mesa guiada está ligada em
  produção, `FORGELEX_DESK_GUIDANCE_ENABLED`). O disparo automático (relato colado ou anexo com texto, em Automático, num
  caso, sem conversa anterior) também é do servidor (`apps/api/src/agentic-workspace/pasted-account.ts`).
- **O que o clássico não mostra.** A aba Estrutura e o ajuste pela conversa (E2, v13) só existem no gelo. A identificação
  da peça (`documentProfile`) e o uso da estrutura na redação (`structureUse`) aparecem nas respostas da API; o clássico
  mostra a frase "Baseada em itens ainda a confirmar: …" nos pontos a conferir da minuta
  (`apps/web/src/agentic-workspace/present-delivery.ts:128`).
- **Defeito do E4 em modo comercial (fora deste ensaio).** O navegador envia os trechos de um PDF longo um atrás do outro,
  esperando só o aceite de cada pedido (`apps/web/src/screens/AgenticWorkspaceScreen.tsx:304`). Cada pedido reserva
  R$ 11,50 ao ser aceito (`apps/api/src/agentic-workspace/commercial-runtime.ts:227`) e a política recusa uma reserva
  enquanto houver trabalho ativo (`COMMERCIAL_EXECUTION_ACTIVE`,
  `packages/billing-ledger/src/commercial-inference-service.ts:369`). Resultado: o 2º trecho é recusado na hora, e o teto
  diário de R$ 20,00 (reserva de R$ 11,50 por trabalho) comporta um ou dois trechos por dia. O teste de navegador do E4 simula
  a rota fora do modo comercial e não viu isso. Por isso este roteiro usa um PDF de um trecho só.
- **Custo.** Três trabalhos pagos (passos 2, 3 e 5); o passo 4 é recusado sem cobrança. A reserva é de R$ 11,50 por trabalho;
  o teto diário conta o custo efetivo dos trabalhos encerrados mais os R$ 11,50 do novo. Se aparecer "O limite diário de
  trabalhos foi atingido. Seu pedido foi preservado.", continuar no dia seguinte do mesmo ponto.

## 2. Material (fictício)

Pasta [`2026-11-26-estrutura-modelo-real/`](2026-11-26-estrutura-modelo-real/):

- `relato.txt`: relato de atendimento de 1.458 caracteres, sem pergunta no fim (o disparo exige 600 ou mais).
- `peticao-sintetica.pdf`: petição inicial de 3 páginas (cerca de 3.300 caracteres, um trecho só), gerada por `gerar_pdf.py`.
  Diverge do relato **de propósito** em dois pontos: o telefonema (janeiro no relato, fevereiro na petição) e o valor
  depositado (R$ 14.200,00 no relato, R$ 14.800,00 na petição).

Nomes, CPF, CNPJ, contrato, protocolo e boletim são inventados. Não usar dado real de cliente neste ensaio.

## 3. Passos

Antes de começar: abrir as ferramentas do desenvolvedor (F12) na aba **Rede**, com filtro `agentic`, para ler as respostas.

| # | Ação | O que conferir |
| --- | --- | --- |
| 1 | Na **Mesa**, **Vincular a um caso** → **Criar caso** "Ensaio Estrutura 26/11 (fictício)". Se a Mesa pedir, permitir o acesso da IA ao caso. Não usar a tela Casos (trava de produto). | O caso fica vinculado ao pedido. |
| 2 | Na **Mesa**, pedido novo: **Vincular a um caso** → o caso do passo 1; modo **Automático**; colar o conteúdo de `relato.txt` no campo; **Enviar** e confirmar o custo. | A entrega se chama "Análise de fatos e provas" (o pedido não virou minuta). Fatos e provas batem com o relato, sem fato inventado. O telefonema, a senha e o paradeiro do boletim aparecem como incertos ou a conferir, não como provados. Nenhuma lei ou jurisprudência citada como prova. Na Rede, anotar se veio `documentProfile` (num relato, o esperado é ausente ou `INCERTA`). |
| 3 | Pedido novo, mesmo caso, **Automático**; anexar `peticao-sintetica.pdf`; no campo, "Analise esta petição." (sem ponto de interrogação); **Enviar** e confirmar o custo. | O compositor **não** fala em partes (um trecho só). A entrega é "Análise de fatos e provas". Na Rede, `documentProfile` traz o tipo da peça (petição inicial), a certeza e as partes (Lúcia Fictícia Moraes como autora, Banco Exemplo S.A. como réu), cada uma com citação literal do PDF. As duas divergências com o relato aparecem nos itens (o agente não as resolve; anotar se as aponta). |
| 4 | Pedido novo, mesmo caso, **Automático**; anexar **o mesmo PDF**; o mesmo texto; **Enviar**. | Recusa com "Este texto já foi analisado neste caso. Nada foi cobrado." e saldo inalterado. |
| 5 | Pedido novo, mesmo caso, **Automático**; no campo, "Redija uma notificação extrajudicial ao Banco Exemplo pedindo a suspensão dos descontos e a cópia do contrato digital." (sem anexo); **Enviar** e confirmar o custo. | A entrega é uma minuta, na voz da peça (sem "o usuário relata" ou "segundo o relato"). Os pontos a conferir trazem "Baseada em itens ainda a confirmar: F…, P…." se a minuta se apoiou em item incerto. Na Rede, `structureUse` lista só itens `A_CONFIRMAR` que existem na estrutura. Se aparecer na orientação guiada, anotar a linha "Estrutura do caso: N fatos, M itens a confirmar". |

**Se algo falhar:** anotar o código mostrado (a Mesa traduz, por exemplo `TASK_CONTEXT_LIMIT`, `STRUCTURE_ITEM_INVALID`,
`CONTEXT_CONFLICT`) e o horário. Não repetir às cegas: a sessão investiga a causa pelo código e pelo log antes de nova
tentativa paga.

**Limpeza:** ao final, o caso pode ser excluído definitivamente pela Mesa, ou mantido para a passada da V6 (gelo), que
completa o ensaio com a aba Estrutura e o ajuste pela conversa.

## 4. Resultado (preencher)

| Passo | Data e hora | Custo cobrado | Resultado (passou / falhou / parcial) | Observação |
| --- | --- | --- | --- | --- |
| 2 | | | | |
| 3 | | | | |
| 4 | | — | | |
| 5 | | | | |

## 5. Decisões de Boni sobre os limites do desenho

Independem do ensaio; registrar a decisão e a data em cada linha.

| Origem | Limite | Opções | Decisão |
| --- | --- | --- | --- |
| E2 | Só o item acrescentado mostra a frase do usuário ("Você disse: …"); alterados e retirados mostram a marca sem a frase. | Manter; ou guardar o pedido também nos alterados e retirados. | |
| E2 | Não há como confirmar pela conversa um item "informado por você": ALTERAR nele vira pergunta. | Manter (confirma no painel); ou aceitar a confirmação pela conversa. | |
| E2 | Trabalho de ajuste com pelo menos um comando é cobrado mesmo que todos virem perguntas. | Manter; ou não cobrar quando nenhum comando for aplicado. | |
| E2 | Cada correção abre uma conversa nova, que aparece nas recentes. | Manter; ou esconder as conversas de ajuste da lista. | |
| E4 | PDF em trechos no modo comercial (seção 1): o 2º trecho é recusado e os tetos não comportam um PDF longo. | Envio em fila (cada trecho espera o anterior terminar), com o aviso de custo respeitando os tetos; e decidir se os trechos de um PDF contam como um trabalho para os tetos. | |
