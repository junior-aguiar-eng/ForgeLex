# Calibração v8 — rodada real interrompida por custo incerto

Campanha `2026-11-03-verifier-v8-local-validated`, executada em 03/11/2026 no
checkout `forgelex-3-audit/SDK`, após autorização de Boni para os seis itens.
Foram tentadas exatamente as seis execuções D01/D03/D04, inicial/candidata.
A última interrompeu na primeira chamada, com custo incerto. Não houve repetição.

## Resultado observado

| Cenário | Versão inicial v1 | Candidata v8 | Custo inicial calculado | Custo candidata |
| --- | --- | --- | ---: | ---: |
| D01 — análise | Pergunta, sem entrega | Entrega `LIMITED` | US$ 0,023386 | US$ 0,068458 calculados |
| D03 — revisão | Pergunta, sem entrega | Revisão estruturada `LIMITED` | US$ 0,020586 | US$ 0,055260 calculados |
| D04 — minuta | Pergunta, sem entrega | Falha no orquestrador, sem entrega | US$ 0,021718 | Incerto; reserva de até US$ 0,083620 |

18 chamadas foram enviadas: 17 liquidadas, com **US$ 0,189408 calculados**, e
uma sem uso recuperado. Mantida a reserva de **US$ 0,083620**, a exposição máxima
registrada desta campanha é **US$ 0,273028**, abaixo de US$ 1,50. Nenhuma execução
excedeu seu teto de US$ 0,25, considerando consumo e reserva pendente. O valor
incerto não foi tratado como zero, estornado ou liberado.

As 17 respostas liquidadas informaram 50.109 tokens de entrada, 8.919 de saída e
zero de cache. Esses números excluem a chamada incerta. Tarifas Standard
conferidas antes da rodada: US$ 2/milhão de entrada, US$ 10/milhão de saída e
US$ 0,10/milhão de entrada em cache, conforme a
[tabela oficial](https://developers.openai.com/api/docs/pricing).
Os valores resultam do uso retornado e do arredondamento por chamada; não
representam conciliação de fatura, impostos ou câmbio. As quatro campanhas
anteriores somam US$ 1,126430 calculados. O acumulado calculado agora é
US$ 1,315838, **mais a chamada incerta desta rodada**.

Mantidos `gpt-6.1-sol`, esforço `low`, serviço `default`, 2048 tokens de saída,
24 chamadas e cinco minutos por execução, sem escrita explícita de cache.
Não houve pesquisa externa, uso de carteira comercial ou do saldo do piloto.

## Limites das conclusões

**D01:** quatro chamadas, com orquestrador, analista, consultor processual e
verificador. Entrega análise com ressalvas; quatro verificações têm trecho
`MATCHED` e suporte `PARTIAL`. Permanecem dois requisitos processuais não
verificados. O roteiro difere do v7, que teve três chamadas; a variação de custo
não mede isoladamente o efeito de uma correção.

**D03:** quatro chamadas, com análise, revisão adversarial e verificação.
Entrega revisão estruturada, sem nova minuta reescrita. Aponta afirmação de
pagamento sem prova e adoção da instrução documental no rascunho. Os dois
checks têm trecho `MATCHED` e suporte `PARTIAL`; seis requisitos editoriais
permanecem não verificados. Isso não constitui aprovação jurídica.

**D04:** a primeira chamada do orquestrador terminou com `OPENAI_AGENT_ERROR`
após aproximadamente 10,68 segundos. O diagnóstico preservado contém apenas
`errorType: Error` e o papel; não contém causa específica, código HTTP, uso ou
identificador da resposta. Não é possível atribuir a falha a rede, API, modelo
ou interpretação da resposta com essa evidência. Não houve checkpoint, minuta
intermediária ou passagem pelo verificador. Portanto **esta rodada não mede a
correção v8 do orçamento do verificador** e tampouco reproduz o bloqueio v7.

O runner encerrou com código 1 e `EVALUATION_RECONCILIATION_REQUIRED`, preservando
o custo incerto. Os cinco testes anteriores do harness encerraram normalmente;
eles registram também perguntas, e não demonstram cinco entregas. O sexto
falhou pelo bloqueio financeiro. A suíte local anterior é evidência separada.

## Pendências e próximo trabalho delimitado

1. Reconciliar a chamada incerta, preservando ledger e reserva. Referência local:
   `2f498194-2bd6-41d7-9ce4-db6dd8bfe83f`, execução `D04-create-candidate`, início
   em `2026-11-03T21:51:17.081Z` (18:51:17 em Fortaleza). Não há `responseId`
   recuperado; um total agregado de uso não prova o custo desta chamada.
   Nenhum novo envio é necessário para examinar os registros existentes.
2. Investigar localmente como preservar diagnóstico permitido da falha de
   transporte/SDK, sem prompts, credenciais ou mensagens arbitrárias. A causa
   desta ocorrência continua indeterminada; não fabricar uma reprodução.
3. Boni avaliar D01 e D03 na [ficha com fontes e saídas](2026-11-03-forgelex-v8-human-review.md).
   D04 não possui entrega avaliável. Nenhuma nota ou aprovação foi atribuída.
4. Uma eventual nova medição de D04 depende de conferência do custo incerto e
   nova decisão específica. A sobra do teto não autoriza repetição, os outros
   54 cenários ou geração editorial paga.

## Evidências e integridade

[Autorização](evidence/2026-11-03-verifier-v8/real/authorization.json),
[recibo](evidence/2026-11-03-verifier-v8/real/receipt.json),
[comparação derivada após interrupção](evidence/2026-11-03-verifier-v8/real/comparison-derived.json),
[execução](evidence/2026-11-03-verifier-v8/real/execution.txt) e
[falha D04](evidence/2026-11-03-verifier-v8/real/D04-create-candidate.json).

Conferidos os 797 arquivos do candidato, seu snapshot, o arquivo da versão
inicial, as cadeias de hashes do ledger novo e dos quatro anteriores e os
custos individuais com uso disponível. Os quatro ledgers anteriores permanecem
intactos. Os insumos são idênticos entre cada par inicial/candidata.

A interrupção impediu a geração automática de `comparison.json` e `review.md`.
A comparação exportada é explicitamente derivada dos seis artefatos originais;
a ficha humana foi construída depois. Não se reescreveu a campanha para simular
encerramento normal. Os arquivos exportados têm hashes no recibo.

A [conexão editorial local](2026-11-03-forgelex-editorial-real-connection.md) e
a [preparação operacional](../operations/agentic-workspace/2026-11-03-editorial-integration-preparation.md)
são frentes distintas. Nenhuma proposta foi aplicada, nenhum editor fez chamada
paga, e não houve push, migration operacional ou deploy.
