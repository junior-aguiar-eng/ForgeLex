# Calibração v5 — resultado real

Campanha `2026-11-02-delivery-gaps-v5`, executada em 02/11/2026 após Boni responder
“vamos continuar” à preparação de seis execuções e teto novo de US$ 1,50.
Escopo autorizado encerrado. **Nenhuma entrega final foi produzida.**

## Resultado

| Cenário       | Versão inicial v1 | Candidato v5                               | Custo inicial | Custo candidato |
| ------------- | ----------------- | ------------------------------------------ | ------------: | --------------: |
| D01 — análise | Pergunta          | Erro após planejamento                     |  US$ 0,024514 |    US$ 0,065702 |
| D03 — revisão | Pergunta          | Erro após análise e revisão intermediárias |  US$ 0,020598 |    US$ 0,131608 |
| D04 — minuta  | Pergunta          | Erro após análise intermediária            |  US$ 0,022126 |    US$ 0,108984 |

Foram 33 chamadas pagas, 118.136 tokens de entrada e 13.726 de saída, sem tokens
em cache. Custo calculado: **US$ 0,373532**, com todas as chamadas liquidadas no
ledger local e nenhum custo incerto. Nenhuma execução ultrapassou US$ 0,25.
Somando US$ 0,135442 da campanha anterior, o total das duas é **US$ 0,508974**.

As [tarifas oficiais](https://developers.openai.com/api/docs/pricing) foram
conferidas antes do envio: `gpt-6.1-sol`, Standard, US$ 2/milhão de entrada,
US$ 10/milhão de saída e US$ 0,10/milhão de entrada em cache. Mantidos contexto
curto, esforço `low`, `service_tier: default`, sem escrita explícita de cache.
São valores calculados com o uso retornado pela API e arredondamento por chamada;
não representam conciliação de fatura, câmbio ou impostos.

## O que foi demonstrado

Os três planos v5 classificaram as lacunas relevantes como `LIMITATION` e
avançaram para os especialistas, sem pedir esclarecimento. Em D03, o plano
registrou expressamente que a falta de prova de pagamento limita conclusões
sobre saldo e quitação, mas permite revisar o rascunho com ressalva.

A versão inicial voltou a interromper os três pedidos na primeira pergunta.
Em D03, inclusive, a própria justificativa da pergunta dizia que a conclusão
da revisão não dependia de obter outras fontes.

Isso demonstra a mudança de classificação nestas amostras reais; **não demonstra
entrega utilizável nem qualidade jurídica final**. As três execuções v5 terminaram
com `OPENAI_AGENT_ERROR`. D03 preservou saídas intermediárias de análise e revisão;
D04 preservou a análise; nenhum deles produziu o resultado final. Não houve
resposta automática a perguntas, repetição de cenário ou ampliação de orçamento.

## Diagnóstico delimitado

- **Confirmado:** a última chamada de D01 retornou exatamente 2.048 tokens de saída,
  o limite configurado. Truncamento é uma hipótese relevante, mas o evento bruto
  e seu motivo de incompletude não foram preservados; não é causa comprovada.
- **Confirmado:** D03 registrou `CAPABILITY_UNAVAILABLE` porque solicitou pesquisa
  sem ferramentas disponíveis nesta avaliação de corpus fechado. O candidato
  prosseguiu até a verificação de fontes; esse achado não prova a causa terminal.
- **Confirmado:** o provider emite código, mensagem saneada e nome do erro, mas
  `case-task.ts` relança apenas `event.code`. O executor recebe o código genérico,
  sem informação suficiente para distinguir erro de parsing, limite financeiro,
  transporte ou outra falha do SDK. Em D03 e D04, as últimas saídas foram de
  947 e 1.500 tokens, respectivamente; o teto de saída não explica sozinho os
  três resultados.

O próximo incremento deve preservar diagnóstico técnico mínimo e saneado nos
artefatos de avaliação, reproduzir localmente os caminhos de falha e verificar
o tratamento de saída incompleta, reserva conservadora e capacidade indisponível.
Só então decidir outra medição real. Não aumentar limites nem inserir detalhes
técnicos na mesa para contornar o problema. Novas chamadas pagas exigem outra
campanha e decisão; os 54 lugares restantes continuam fora do escopo autorizado.

## Evidências e limites

[Recibo e custos](evidence/2026-11-02-delivery-gaps-calibration/real/receipt.json),
[resultados por execução](evidence/2026-11-02-delivery-gaps-calibration/real/comparison.json),
[leitura A/B](evidence/2026-11-02-delivery-gaps-calibration/real/review.md) e
[autorização contextual](evidence/2026-11-02-delivery-gaps-calibration/real/authorization.json).

A cadeia do ledger, custos por execução, 764 arquivos do candidato e seu snapshot,
arquivo da versão inicial e 34 arquivos históricos foram conferidos. As seis
invocações do harness terminaram normalmente porque ele registra também falhas;
seu resultado técnico aprovado **não significa que os seis trabalhos deram certo**.
Hashes dos artefatos exportados e `git diff --check` verificados.

Nenhuma nota jurídica foi atribuída; a avaliação humana cabe a Boni. O corpus é
sintético e fechado, sem pesquisa viva. O contraste v1/v5 não isola causalmente
uma única alteração nem elimina variação do modelo. Sem alteração da mesa ou do
código do produto, uso de carteira de cliente, saldo do piloto, commit, push,
migration ou deploy. Testes e build não foram repetidos nesta etapa de execução
do candidato já congelado; a preparação local tem seu próprio recibo histórico.
