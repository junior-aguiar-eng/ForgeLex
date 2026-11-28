# Roteiro curto: estrutura do caso com o modelo real, no gelo (reescrito em 28/11/2026)

Pendência 16 da seção 1A do [plano unificado](../../superpowers/plans/2026-11-11-forgelex-plano-unificado.md).
Executor, conferente e aprovador: Boni, na própria conta, em `https://nexojuris.ia.br` (tema gelo, publicado em
28/11/2026). **Sem deploy, flag ou migration.**

## O que mudou desde o roteiro de 26/11

Decisão de Boni de 27/11/2026, regra do mínimo: o ajuste da estrutura pela conversa (E2, contrato v13) e a aba
Estrutura saíram do código, e os limites de desenho que dependiam deles deixaram de existir. O roteiro de 26/11 foi
escrito para o tema clássico, com "Vincular a um caso", e não vale mais. O que resta da estrutura do caso funciona
nos bastidores, sem tela:

- Um pedido de análise de fatos e provas, numa conversa de um caso, gera a estrutura do caso (fatos, provas, lacunas
  e cronologia).
- Na redação de uma peça no mesmo caso, o servidor entrega essa estrutura ao agente, que se apoia nela. Os pontos a
  conferir da minuta dizem em quais itens ainda não conferidos a peça se apoiou.

## Material (fictício)

[`2026-11-26-estrutura-modelo-real/relato.txt`](2026-11-26-estrutura-modelo-real/relato.txt): relato de atendimento
de 1.458 caracteres. Nomes, CPF, contrato e boletim são inventados. Não use dado real de cliente neste ensaio.

## Passos (dois pedidos pagos)

Cada pedido reserva R$ 11,50 do saldo e cobra o custo efetivo ao terminar. Se aparecer "O limite diário de trabalhos
foi atingido. Seu pedido foi preservado.", continue no dia seguinte a partir do mesmo ponto.

| # | Ação | O que conferir |
| --- | --- | --- |
| 1 | Na **Pasta** (lateral), crie o caso "Ensaio estrutura (fictício)" e clique nele: o próximo pedido nasce no caso. Cole o conteúdo de `relato.txt` e escreva, abaixo do relato: "Analise os fatos e provas deste relato." Envie e confirme o custo. | A resposta é uma análise de fatos e provas, não uma minuta. Os fatos batem com o relato, sem fato inventado. O telefonema, a senha e o paradeiro do boletim aparecem como incertos ou a conferir, não como provados. Nenhuma lei ou jurisprudência é citada como prova. |
| 2 | Na mesma conversa do caso, peça: "Redija uma notificação extrajudicial ao Banco Exemplo pedindo a suspensão dos descontos e a cópia do contrato digital." Envie e confirme o custo. | A peça abre ao lado e está na voz da peça (sem "o usuário relata" ou "segundo o relato"). Os fatos da notificação são os da análise. Os pontos a conferir trazem "Baseada em itens ainda a confirmar: F…, P…." quando a peça se apoiou em item incerto. |

**Se algo falhar:** anote a mensagem mostrada e o horário. Não repita às cegas; a sessão investiga a causa pelo código
e pelo log antes de nova tentativa paga.

**Limpeza:** ao final, o caso pode ser excluído de vez pela Pasta.

## Resultado (preencher)

| Passo | Data e hora | Custo cobrado | Resultado (passou / falhou / parcial) | Observação |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
