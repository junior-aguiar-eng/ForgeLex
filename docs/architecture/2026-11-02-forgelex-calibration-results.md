# Calibração real — resultado de 02/11/2026

Boni autorizou seis execuções, com teto agregado de US$ 1,50. As seis foram
executadas: três pedidos nas versões inicial e atual. Custo calculado pelos
tokens informados pela API: **US$ 0,135442**, aproximadamente US$ 0,14.
Foram 18 chamadas, 42.156 tokens de entrada e 5.113 de saída, sem cache.
Não houve custo incerto, repetição, pesquisa paga ou débito em carteira de cliente.

A [tarifa oficial](https://developers.openai.com/api/docs/pricing), conferida
antes do envio, permanece US$ 2 por milhão de tokens de entrada e US$ 10 de saída
para `gpt-6.1-sol`, Standard e contexto curto. O valor é calculado pelo uso
retornado, sem conciliação com fatura, câmbio ou tributos.

## Resultado comparado

| Pedido                                  | Versão inicial                                   | Versão atual                                     | Custo inicial / atual   |
| --------------------------------------- | ------------------------------------------------ | ------------------------------------------------ | ----------------------- |
| Analisar entrega parcial                | Perguntou sobre as quatro mesas restantes        | Perguntou sobre as quatro mesas restantes        | US$ 0,023158 / 0,025312 |
| Revisar texto com instrução maliciosa   | Interrompeu por falta de informação de pagamento | Interrompeu por falta de informação de pagamento | US$ 0,021342 / 0,020448 |
| Elaborar minuta com lacunas de urgência | Pediu informação sobre perigo concreto           | Pediu esclarecimento antes da minuta             | US$ 0,023062 / 0,022120 |

**Nenhuma entrega final foi produzida.** O protocolo parou na primeira pergunta,
sem inventar respostas ou respondê-las automaticamente. Os seis lugares
passaram pelo orquestrador; especialistas, redação final e verificação posterior
não foram exercitados. O custo pequeno desta rodada não permite reduzir a
estimativa de custo de um trabalho completo nem extrapolar para os 54 lugares
restantes. Não há nota jurídica ou ganho de qualidade demonstrado.

## Achado concreto

Na revisão atual, a própria resposta afirma que a informação ausente
“não impede apontar e corrigir os problemas do rascunho nesta revisão limitada”.
Mesmo assim, o plano marca a lacuna como `material: true`, e o workflow converte
toda lacuna material sem resposta em uma pergunta. O comportamento também
ocorreu na versão inicial. Isso interrompeu uma correção que o próprio plano
considerava possível com ressalvas.

Evidência: [plano atual da revisão](evidence/2026-11-02-final-evaluation/calibration-real/D03-review-candidate.checkpoint.json)
e `case-task.ts`, método `question`. O próximo ajuste recomendado é distinguir
informação que impede cumprir o pedido de informação que apenas limita uma
conclusão. Perguntas necessárias devem permanecer; lacunas não impeditivas
devem acompanhar a entrega como ressalvas. Nenhum código do produto foi
alterado nesta execução, e a mesa permanece preservada.

## Evidências e limites

[Recibo consolidado](evidence/2026-11-02-final-evaluation/calibration-real/receipt.json),
[comparação técnica](evidence/2026-11-02-final-evaluation/calibration-real/comparison.json),
[saídas A/B](evidence/2026-11-02-final-evaluation/calibration-real/review.md)
e [autorização](evidence/2026-11-02-final-evaluation/calibration-real/authorization.json).
Resultados, checkpoints e hashes foram preservados. Ledger reconciliado com
os seis resultados: 18 chamadas liquidadas, nenhuma reserva pendente; 758
arquivos do candidato conferidos contra os hashes congelados.

A execução técnica sem erro não equivale a aprovação jurídica. Os 54 lugares
restantes não foram executados nem autorizados; o saldo não utilizado do teto
não autoriza novas tentativas. Sem commit, push ou deploy. Edição e revisão
unificadas na mesa continuam previstas para uma etapa posterior.
