# D04-v8 — conciliação agregada adicional de 04/11/2026

**Estado: agregado compatível; reconciliação individual pendente.**
A reserva histórica permanece em **US$ 0,083620**, sem liberação, baixa,
liquidação ou alteração dos ledgers. A tentativa D04-create-candidate mantém
o status original `UNCERTAIN`. O registro foi autorizado por Boni somente
como evidência adicional, sem chamadas pagas, commit, push ou publicação.

## Fontes e método

Foram lidos os arquivos fornecidos por Boni:

- `cost_2026-11-03_2026-11-03.csv`: cinco linhas de custo.
- `completions_usage_2026-11-03_2026-11-03.csv`: duas linhas de uso por tier.

Ambos abrangem 03/11/2026, de 00:00 UTC até 04/11 às 00:00 UTC (fim exclusivo).
Os originais permanecem no Desktop, intactos. Seus caminhos e hashes SHA-256
estão no [registro estruturado](evidence/2026-11-04-d04-aggregate-reconciliation/reconciliation.json).
Não foram copiados e-mails nem identificadores de conta/chave para a evidência
derivada. O CSV de uso identifica um projeto; o de custos não preenche projeto
ou chave. Não houve recuperação independente na conta do provedor.

Comparados apenas os ledgers `real` de v6, v7 e v8, cujas execuções começaram
nesse intervalo UTC. Os nomes de algumas pastas indicam 02/11, mas as datas
UTC do ledger estão no dia exportado. Excluídas as simulações `offline` e
deduplicados os IDs das chamadas. Somente as 68 chamadas com uso registrado
foram somadas; a tentativa incerta continua separada. Cadeias de hashes e
resultados de cada cenário foram conferidos pelo auditor existente, em modo
somente leitura.

| Origem | Chamadas conhecidas | Entrada | Saída |
| --- | ---: | ---: | ---: |
| v6 | 30 | 104.742 | 13.213 |
| v7 | 21 | 70.661 | 13.452 |
| v8 | 17 | 50.109 | 8.919 |
| Total local | 68 | 225.512 | 35.584 |
| Exportação de uso | 68 | 225.512 | 35.584 |
| Diferença | 0 | 0 | 0 |

## Custo e tiers

O uso exportado separa quatro requisições `default` (10.483 tokens de entrada,
1.423 de saída) e 64 `incentivized-tier` (215.029 de entrada, 34.161 de saída).
Os totais de tokens também coincidem com as quantidades no CSV de custos.

Aplicando às quatro requisições `default` as tarifas usadas no cálculo local
histórico, US$ 2/milhão de entrada e US$ 10/milhão de saída:

- Entrada: US$ 0,020966, igual à linha de custo exportada.
- Saída: US$ 0,014230, igual à linha de custo exportada.
- Total: **US$ 0,035196**, igual ao total do CSV; cache com quantidade e custo zero.

Os tokens dessas quatro requisições coincidem com a última chamada conhecida
de D03-review-candidate e as três de D04-create-baseline. Essa correspondência
aritmética não é confirmação individual de tier pelo provedor; os IDs locais
estão registrados para rastreabilidade. Não se confundem essas chamadas com a
tentativa incerta D04-create-candidate.

O CSV não mostra valor adicional aparente para o restante do uso. Isso não
comprova uma regra geral de gratuidade, desconto ou direito a crédito. Os
valores calculados nos ledgers históricos continuam intactos e não foram
substituídos pelo custo agregado exportado.

## Conclusão e limites

Todo o uso apresentado pode ser explicado pelas 68 chamadas reais conhecidas.
Não aparece requisição ou consumo adicional necessário para explicar os totais
dessa exportação. É evidência agregada favorável à ausência de consumo adicional
visível da tentativa incerta, **não prova individual de não cobrança**.

Os arquivos não contêm request ID nem detalhamento por chamada e não garantem,
por si, completude final de faturamento além do recorte fornecido. A causa da
falha histórica permanece indeterminada. Ainda falta confirmação individualizada
do provedor para encerrar essa pendência; a reserva permanece integral.

O custo calculado da campanha v9 continua US$ 0,572246 e a exposição com a
reserva continua US$ 0,655866, sob o teto de US$ 1,50. Nenhum saldo foi liberado.

[Auditorias dos ledgers](evidence/2026-11-04-d04-aggregate-reconciliation/ledger-audits.json)
· [Verificação de preservação](evidence/2026-11-04-d04-aggregate-reconciliation/validation.json)
