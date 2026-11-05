# Calibração v7 — resultado real

Campanha `2026-11-02-scoped-handoff-v7-validated`, executada em 02/11/2026 após
autorização expressa de Boni para a calibração curta, teto US$ 1,50 e limites
atuais. Foram executados somente os seis lugares previstos. Escopo encerrado.

## Resultado

| Cenário | Versão inicial v1 | Candidato v7 | Custo inicial | Custo candidato |
| --- | --- | --- | ---: | ---: |
| D01 — análise | Pergunta | Entrega com ressalvas (`LIMITED`) | US$ 0,026914 | US$ 0,042632 |
| D03 — revisão | Pergunta | Entrega estruturada com ressalvas (`LIMITED`) | US$ 0,020790 | US$ 0,062414 |
| D04 — minuta | Pergunta | `BUDGET_EXCEEDED` antes do envio ao verificador | US$ 0,022162 | US$ 0,100930 |

**US$ 0,275842 calculados**, 21 chamadas, 70.661 tokens de entrada e 13.452
de saída; nenhum token em cache e nenhum custo incerto. As 21 chamadas estão
liquidadas no ledger local, com cadeia de hashes conferida. Nenhuma execução
ultrapassou US$ 0,25. O acumulado das quatro campanhas é **US$ 1,126430**.
O valor não usado do teto não autoriza repetição ou ampliação desta campanha.

As [tarifas oficiais](https://developers.openai.com/api/docs/pricing) foram
reconferidas antes do envio: `gpt-6.1-sol`, Standard, US$ 2/milhão de entrada,
US$ 10/milhão de saída e US$ 0,10/milhão de entrada em cache. Mantidos esforço
`low`, serviço `default`, 2048 tokens de saída, até 24 chamadas e cinco minutos
por execução, sem escrita explícita de cache. Valores calculados com uso
retornado pela API e arredondamento por chamada, sem conciliação de fatura,
câmbio ou impostos.

## Observações sobre as correções

**D01:** passou a entregar nesta amostra, com três chamadas para orquestrador,
analista e verificador. Não houve releitura de fontes ou bloqueio financeiro.
O roteiro também ficou menor que no v6, que incluía consultor processual;
portanto a diferença de custo não pode ser atribuída apenas a uma correção.
A entrega conserva `CITATION_WITHOUT_SUPPORT`: o trecho é literal (`MATCHED`),
mas o verificador classificou como `PARTIAL` o suporte à proposição composta.
Isso não equivale a citação inventada nem a fundamentação integral aprovada.

**D03:** quatro papéis, quatro chamadas e entrega estruturada de revisão, sem
nova minuta reescrita. Não apareceu `SUPPORT_CHECK_INVALID`. Os dois checks
se referem a claims canônicas e à fonte normativa efetivamente citada;
ambos têm trecho `MATCHED` e avaliação `PARTIAL`. Permanecem ressalvas de
suporte, requisitos editoriais não verificados e aplicabilidade jurídica.
A saída aponta pagamento sem suporte e comandos indevidos no anexo; essa
descrição do conteúdo não substitui avaliação jurídica por Boni.

**D04:** completou análise, orientação processual, minuta e revisão adversarial,
sem `CLAIM_ID_CONFLICT`. A minuta intermediária tem quatro seções e está no
checkpoint. O verificador foi selecionado, mas sua primeira chamada foi
barrada pela reserva conservadora, após US$ 0,100930 consumidos. Portanto não
há entrega final D04, nem validação terminal da minuta. O teto agregado não
foi esgotado: o controle considera consumo realizado mais a reserva superior
da próxima chamada dentro de US$ 0,25 por execução. O valor exato da reserva
recusada não foi persistido neste ledger.

Não foram observados `CLAIM_ID_CONFLICT`, `SUPPORT_CHECK_INVALID` ou
`COMMERCIAL_OUTPUT_LIMIT` nesta rodada. A evidência é limitada a estes três
pedidos, sem garantia para outras entradas. A pesquisa indisponível continua
expressa no corpus fechado; não houve consulta externa para suprir as lacunas.

## Pendências atuais

- Reproduzir localmente a reserva recusada no verificador de D04 e investigar
  o volume do handoff terminal. Preservar cobertura, fontes, ressalvas e os
  mesmos limites; não promover a minuta intermediária a entrega concluída.
- Avaliação das duas entregas por Boni, inclusive suporte parcial e requisitos
  ainda não verificados. Nenhuma nota jurídica foi atribuída automaticamente.
- Os outros 54 lugares e integração/publicação continuam fora desta autorização.
  Nova medição paga exige outra decisão específica.

## Evidências e integridade

[Autorização](evidence/2026-11-02-scoped-handoff-v7/real/authorization.json),
[recibo e hashes](evidence/2026-11-02-scoped-handoff-v7/real/receipt.json),
[comparação](evidence/2026-11-02-scoped-handoff-v7/real/comparison.json),
[leitura A/B](evidence/2026-11-02-scoped-handoff-v7/real/review.md),
[entrega D01](evidence/2026-11-02-scoped-handoff-v7/real/D01-analyze-candidate.json),
[entrega D03](evidence/2026-11-02-scoped-handoff-v7/real/D03-review-candidate.json) e
[checkpoint intermediário D04](evidence/2026-11-02-scoped-handoff-v7/real/D04-create-candidate.checkpoint.json).

Conferidos os 773 arquivos do candidato e seu snapshot, o arquivo da versão
inicial, 283 arquivos protegidos/históricos, os três ledgers anteriores e o
ledger novo. Hashes dos artefatos exportados e `git diff --check` verificados.
Os seis testes do harness encerraram normalmente porque registram também
perguntas e falhas; isso não significa seis entregas bem-sucedidas.

Mesa, código do produto e limites intactos. Sem pesquisa viva, carteira de
cliente, saldo do piloto, repetição de cenário, commit, push, migration ou
deploy. Testes locais e build não foram repetidos nesta execução do mesmo
snapshot; a [preparação v7](2026-11-02-forgelex-v6-pending-fix.md) tem recibo próprio.
