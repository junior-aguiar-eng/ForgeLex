# Calibração v6 — resultado real

Campanha `2026-11-02-delivery-failures-v6-validated`, executada em 02/11/2026
após autorização expressa de Boni para seis execuções, teto US$ 1,50 e limites
atuais, sem os outros 54 cenários ou deploy. Escopo autorizado encerrado.

## Resultado

| Cenário | Versão inicial v1 | Candidato v6 | Custo inicial | Custo candidato |
| --- | --- | --- | ---: | ---: |
| D01 — análise | Pergunta | `BUDGET_EXCEEDED` na verificação de fontes | US$ 0,024214 | US$ 0,098414 |
| D03 — revisão | Pergunta | Entrega estruturada com ressalvas (`LIMITED`) | US$ 0,019650 | US$ 0,098402 |
| D04 — minuta | Pergunta | `CLAIM_ID_CONFLICT` após o consultor processual | US$ 0,022018 | US$ 0,078916 |

**US$ 0,341614 calculados**, 30 chamadas, 104.742 tokens de entrada e 13.213
de saída; nenhum token em cache e nenhum custo incerto. Todas as chamadas
liquidadas no ledger local; nenhuma execução ultrapassou US$ 0,25. O acumulado
das três campanhas é **US$ 0,850588 calculados**. O saldo não usado do teto
desta campanha não autoriza novas execuções.

As [tarifas oficiais](https://developers.openai.com/api/docs/pricing) foram
reconferidas antes do envio: `gpt-6.1-sol`, Standard, US$ 2/milhão de entrada,
US$ 10/milhão de saída e US$ 0,10/milhão de entrada em cache. Mantidos esforço
`low`, serviço `default`, 2048 tokens de saída, até 24 chamadas e cinco minutos
por execução, sem cache write explícito. Cálculo com uso retornado pela API e
arredondamento por chamada; não constitui conciliação de fatura, câmbio ou impostos.

## O que a rodada demonstrou

O v6 produziu uma entrega final em D03, onde o v5 havia falhado. A entrega contém
afirmações, requisitos de revisão, fontes e ressalvas; não contém uma nova minuta
reescrita. O texto aponta a afirmação de pagamento sem suporte e os comandos
indevidos do anexo. Isso descreve o resultado observado, sem atribuir nota jurídica.
Permanece avaliação por Boni, inclusive da fundamentação e da utilidade da revisão.

Os três candidatos conservaram lacunas como `LIMITATION` e avançaram aos
especialistas; as três versões iniciais pararam na primeira pergunta. D03 v6
percorreu quatro papéis com oito chamadas; não houve a chamada adicional para
confirmar cada submissão aceita. Essa amostra é compatível com o comportamento
implementado. A comparação não isola causalmente uma correção nem elimina a
variação entre respostas do modelo.

## Falhas e pendências identificadas

1. **D01: reserva financeira.** O diagnóstico identifica `BUDGET_EXCEEDED` no
   `authority-verifier`, depois das saídas de análise e orientação processual.
   O consumo realizado era US$ 0,098414; a reserva conservadora da próxima chamada
   não coube no teto de US$ 0,25 por execução. O controle considera consumo já
   realizado mais o limite superior da chamada, não só gasto liquidado. Não se
   trata de esgotamento do teto agregado. Avaliar localmente volume e repetição
   do contexto entre etapas, preservando cobertura, reserva e limites atuais.
2. **D04: identidade de afirmações.** `checkClaims` rejeitou um identificador
   repetido com conteúdo diferente ao combinar as saídas dos especialistas.
   O último checkpoint conserva somente o analista; a saída rejeitada do
   consultor processual não foi persistida. O código identifica a classe da
   falha, mas os artefatos não permitem reconstruir o par exato conflitante.
   Reproduzir e corrigir localmente o contrato de IDs entre papéis, preservando
   os vínculos e o bloqueio de conflitos reais.
3. **D03: vínculos de suporte.** A entrega inclui `SUPPORT_CHECK_INVALID`.
   As saídas contêm checks de suporte para fontes documentais, embora o auditor
   desse contrato aceite somente `NORM`/`AUTHORITY`. O verificador também usou
   `r3` e `ar-r3` como `claimId`; ambos são IDs de requisitos, não de afirmações.
   Corrigir localmente a emissão e validação dos vínculos, sem suprimir o achado
   ou converter checks inválidos em fundamentação aprovada. O aviso de pesquisa
   indisponível (`CAPABILITY_UNAVAILABLE`) permanece esperado no corpus fechado.

Não foi observado `COMMERCIAL_OUTPUT_LIMIT` nesta rodada. Isso não garante
ausência futura de truncamento. O término normal dos seis testes do harness
significa que registraram os resultados; **não significa seis trabalhos concluídos**.

## Evidências e integridade

[Autorização](evidence/2026-11-02-delivery-failure-fix/real/authorization.json),
[recibo e hashes](evidence/2026-11-02-delivery-failure-fix/real/receipt.json),
[comparação](evidence/2026-11-02-delivery-failure-fix/real/comparison.json),
[leitura A/B](evidence/2026-11-02-delivery-failure-fix/real/review.md) e
[entrega integral D03](evidence/2026-11-02-delivery-failure-fix/real/D03-review-candidate.json).

Conferidos os 770 arquivos do candidato e snapshot, o arquivo da versão inicial,
244 arquivos protegidos/históricos, os dois ledgers anteriores e a cadeia do
ledger novo. Hashes dos artefatos exportados e `git diff --check` verificados.
A preparação local mantém seu [recibo próprio](evidence/2026-11-02-delivery-failure-fix/validation.json);
testes de regressão e build não foram repetidos nesta execução do mesmo snapshot.

Nenhuma alteração de código, mesa, limites, dependências ou dados de cliente.
Sem repetição de cenários, pesquisa viva, carteira de cliente, saldo do piloto,
commit, push, migration ou deploy. Os 54 lugares restantes não foram executados.
Próximo passo: tratar as três pendências localmente antes de propor nova medição;
esta autorização não permite repetir ou ampliar a rodada encerrada.
