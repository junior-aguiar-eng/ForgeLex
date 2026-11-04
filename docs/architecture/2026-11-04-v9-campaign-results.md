# Campanha v9 — 04/11/2026

Campanha autorizada por Boni, candidata v9 apenas, sem comparação A/B. A reserva histórica permanece aberta. Nenhuma avaliação jurídica foi preenchida.

Estado: **STOPPED**. Chamadas pagas: **4**. Custo calculado: **US$ 0.091896**. Nova reserva incerta: **US$ 0.000000**. Reserva histórica: **US$ 0,083620**. Exposição desta campanha incluindo a reserva histórica: **US$ 0.175516**, dentro do teto de US$ 1,50.

Limites: US$ 0,25, 24 chamadas e cinco minutos por execução; saída de 2.048 tokens por chamada; gpt-6.1-sol, low, default. Nenhum reenvio automático.

| Cenário | Resultado | Chamadas | Custo calculado USD | Nova reserva USD | Avaliação de Boni |
| --- | --- | ---: | ---: | ---: | --- |
| D04-V2 | failed | 4 | 0.091896 | 0.000000 | Pendente |
| D01-V2 | Não executado | 0 | 0.000000 | 0.000000 | Pendente |
| D03-V2 | Não executado | 0 | 0.000000 | 0.000000 | Pendente |
| V2-FIT | Não executado | 0 | 0.000000 | 0.000000 | Pendente |
| V2-INTEGRITY | Não executado | 0 | 0.000000 | 0.000000 | Pendente |
| V2-MULTI | Não executado | 0 | 0.000000 | 0.000000 | Pendente |

## D04-V2

Prepare minuta limitada às fontes selecionadas, sem inventar qualificação, juízo ou prazo. Use apenas o corpus fechado selecionado. Documentos e fatos são fictícios; a ausência de fontes deve ser explicitada.

Resultado: failed; versão do estado: 9.

[JSON integral](evidence/2026-11-04-v9-candidate-validated/real/D04-V2.json)

Erro: OPENAI_AGENT_ERROR

```json
{
  "errorType": "Error",
  "failureCode": "BUDGET_EXCEEDED",
  "failureClass": "RESOURCE_LIMIT",
  "role": "adversarial-reviewer"
}
```


## Validação e limites

15 testes de controles de campanha aprovados e seis cenários simulados aprovados na v9 antes do envio real. A primeira tentativa offline foi interrompida por descoberta lenta de teste no Windows; o pacote corrigido usa caminho relativo. Nenhuma inferência ocorreu nessa tentativa. Formatação dos quatro arquivos de executor passou. Não foi repetida a suíte integral do produto nesta campanha.

Os testes simulados demonstram funcionamento do executor, não qualidade semântica. Saídas reais precisam da avaliação jurídica de Boni. A autorização desta campanha não encerra nem explica a falha histórica de D04.

[Recibo](evidence/2026-11-04-v9-candidate-validated/real/receipt.json) · [Trilha de chamadas](evidence/2026-11-04-v9-candidate-validated/real/call-trace.jsonl) · [Pacote congelado](evidence/2026-11-04-v9-candidate-validated/packet.json)

Preços conferidos em 04/11/2026 na [documentação oficial](https://developers.openai.com/api/docs/pricing): US$ 2 entrada, US$ 10 saída e US$ 0,10 entrada em cache por milhão de tokens, contexto curto, tier default. Cache writes continuam recusados no transporte.

Sem aplicação automática, commit, push ou publicação.

## Causa confirmada da interrupção

A reconstrução local da próxima chamada, com rede proibida, apurou reserva
necessária de US$ 0,195188. O custo já calculado era US$ 0,091896; a soma
seria US$ 0,287084, superior ao limite por execução de US$ 0,25. O limite
geral da campanha não foi esgotado. Nenhuma quinta requisição HTTP foi enviada.
O erro externo permanece `OPENAI_AGENT_ERROR`, mas o diagnóstico identifica
`BUDGET_EXCEEDED`, classe `RESOURCE_LIMIT`, papel `adversarial-reviewer`.

A reserva conservadora é calculada a partir dos bytes serializados, com margem
de entrada e saída máxima; não é uma previsão exata do custo da próxima resposta.
A correção futura pode estudar redução de contexto ou calibração demonstrável
da margem, preservando os limites. Nenhuma margem ou teto foi reduzido/ampliado
para forçar a continuação desta campanha.

O checkpoint v9 preserva análise, orientação processual e minuta. O grafo
mostra revisão adversarial e verificador pendentes. A [minuta intermediária](evidence/2026-11-04-v9-candidate-validated/real/D04-V2-intermediate-draft.md)
é apenas uma extração para inspeção; não substitui a entrega final ausente.

[Diagnóstico financeiro reproduzido sem rede](evidence/2026-11-04-v9-candidate-validated/real/budget-refusal-diagnosis.json).
O primeiro ensaio de reconstrução teve conflito de contexto por codificação
do pedido no script auxiliar; foi corrigido usando o pedido UTF-8 do artefato.
O ensaio final passou, sem modificar código congelado, checkpoint ou ledger.
