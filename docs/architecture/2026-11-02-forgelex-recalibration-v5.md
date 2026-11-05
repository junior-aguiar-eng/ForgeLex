# Nova calibração após a correção de lacunas

Preparação autorizada por Boni em 02/11/2026, no checkout `forgelex-3-audit/SDK`,
branch `codex/forgelex-3-quality`, HEAD `025f6dd438ecfd78079b4688fd076e476da74ce9`.
**Estado atualizado: executada após autorização de Boni; campanha encerrada.**
[Resultado real](2026-11-02-forgelex-recalibration-v5-results.md): US$ 0,373532,
três perguntas na versão inicial e três falhas no candidato; nenhuma entrega.
O texto abaixo preserva o escopo e a validação da preparação. Não autoriza repetir
ou ampliar a campanha.

## Escopo para decisão

Campanha `2026-11-02-delivery-gaps-v5`: seis execuções, com os mesmos pedidos e
insumos sintéticos dos três pares anteriores:

| Cenário     | Pedido                                  | Versões                   |
| ----------- | --------------------------------------- | ------------------------- |
| D01-analyze | Analisar documentos                     | Inicial v1 e candidato v5 |
| D03-review  | Revisar rascunho defeituoso             | Inicial v1 e candidato v5 |
| D04-create  | Elaborar minuta limitada aos documentos | Inicial v1 e candidato v5 |

A versão inicial usa o commit acima, com seu próprio motor. O candidato inclui
a correção `deliveryImpact` e o estado v5. O manifesto identifica todos os bytes
avaliados, incluindo o executor. Os pedidos, documentos e recortes jurídicos
permanecem iguais aos da rodada anterior; critérios de avaliação não são enviados
ao modelo. Não há respostas automáticas a perguntas: cada execução encerra na
primeira pergunta, entrega ou interrupção.

O objetivo é observar se a IA real distingue lacunas impeditivas de ressalvas.
Em D03, conferir se consegue corrigir afirmações indevidas sem exigir prova que
não seja indispensável à revisão pedida. Uma pergunta continua correta quando
a informação for necessária ao resultado solicitado; não se exige entrega em
todos os cenários. Conferir no plano e na saída a justificativa, as fontes, a
preservação das incertezas e a ausência de fatos inventados. A classificação do
modelo não é por si só prova de pertinência jurídica; Boni avalia as saídas.

Comparar também com os artefatos preservados da rodada anterior, que registrou
seis perguntas e nenhuma entrega. A nova comparação v1/v5 abrange as diferenças
entre essas versões; não isola causalmente a correção de lacunas nem controla a
variação entre respostas do modelo.

## Orçamento proposto, ainda sem autorização

- Modelo `gpt-6.1-sol`, raciocínio `low`, serviço `default`.
- Estimativa de planejamento mantida: **US$ 0,36–1,08** para seis execuções.
- **Novo teto agregado de US$ 1,50**, com US$ 0,25 por execução, até 24 chamadas,
  2.048 tokens de saída por chamada e cinco minutos por execução.
- Reserva conservadora antes do envio; custo incerto interrompe a campanha.
  Não ampliar limites ou repetir lugares já iniciados automaticamente.

A estimativa reutiliza as hipóteses e tarifas configuradas no pacote anterior
(US$ 2/milhão de entrada e US$ 10/milhão de saída, sem assumir desconto de cache).
Não é uma nova medição nem uma consulta atual de preços: conferir a tarifa
oficial e a configuração antes do primeiro envio autorizado. Mudança incompatível
com o orçamento exige revisar a proposta antes de executar.

O gasto histórico calculado de US$ 0,135442 fica separado. Se esta nova campanha
consumir integralmente seu teto, a soma das duas será de até US$ 1,635442 nas
mesmas bases de cálculo; não há conciliação de fatura, câmbio ou impostos aqui.
O custo da rodada interrompida não foi extrapolado como custo de trabalho completo.
O teto não garante entrega. Não usar carteira de cliente ou saldo do piloto.
Sem fallback, pesquisa paga, consulta externa, juiz de IA ou os 54 lugares restantes.

## Isolamento e reprodução

`calibrate.mjs` aceita `--campaign=<id>`. Cada campanha nomeada conserva
`packet.json` e `packet.sha256`, gravados sem sobrescrita. Nova preparação com
bytes diferentes, pacote incompleto ou hash divergente falha; exige outra
identificação após revisão. O modo real exige campanha previamente preparada,
flag explícita do teto e credencial no ambiente. O identificador histórico
`real-calibration` não é reutilizável pelo CLI.

O diretório desta campanha fica em
`.superpowers/sdd/2026-11-02-forgelex-calibration-runner/campaigns/2026-11-02-delivery-gaps-v5/`.
Simulações usam subdiretórios `offline-*`; a execução posterior criou o ledger
pago em `real/`. O lock global, a reserva durável e a proibição de repetição de
lugares iniciados foram preservados. A autorização contextual e o resultado
foram registrados separadamente da preparação.

Reproduzir somente a preparação e simulação:

```powershell
node --test scripts/forgelex-final-evaluation/campaign.test.mjs scripts/forgelex-final-evaluation/budget.test.mjs scripts/forgelex-final-evaluation/prepare.test.mjs
node scripts/forgelex-final-evaluation/calibrate.mjs --campaign=2026-11-02-delivery-gaps-v5
```

O modo offline remove a chave do ambiente do processo de teste e usa transporte
sintético. A execução real, **somente depois de autorização específica de Boni**,
usaria o mesmo comando com `--real --approve-calibration-usd=1.50`, após conferir
tarifas, manifesto e ausência de custo pendente. A preparação não lê `.env`.
Mudança de código exige nova identificação e preparação; não editar o pacote
congelado para contornar a verificação.

## Verificação desta preparação

- 15 testes de argumentos, isolamento, preparação e orçamento aprovados.
- 51 testes do workflow e compatibilidade de entregas aprovados.
- 10 testes do transporte comercial aprovados.
- Seis simulações pelo SDK aprovadas: três v1 e três v5; os três candidatos
  entregaram com ressalvas sob respostas roteirizadas. Zero chamadas pagas.
- CLI real sem aprovação rejeitado antes de executar; nenhum diretório pago criado.
- Lint dos três scripts alterados, formatação e `git diff --check` aprovados.
- Hashes do pacote, snapshots e 34 arquivos da campanha histórica conferidos.

[Manifesto congelado](evidence/2026-11-02-delivery-gaps-calibration/packet.json),
[comparação simulada](evidence/2026-11-02-delivery-gaps-calibration/offline/comparison.json) e
[recibo de validação](evidence/2026-11-02-delivery-gaps-calibration/validation.json).

As simulações verificam o executor e o fluxo com classificação fixada; não medem
a classificação da IA real, qualidade jurídica, custo ou latência reais. Build
integral, E2E de navegador e PostgreSQL não foram repetidos: a alteração ficou
nos scripts de avaliação e documentação. Mesa, código de produto, schema e
dependências foram preservados. Sem commit, push, migration ou deploy.
