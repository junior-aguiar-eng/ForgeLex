# D04: diagnóstico e rastreabilidade financeira

Data: 04/11/2026. Alterações locais, sem chamada paga, commit, push ou publicação.

## Resultado da investigação histórica

O ledger copiado para evidências tem cadeia de hashes válida. Os seis resultados
concordam com seus estados e valores finais: US$ 0,189408 calculados, US$ 0,083620
incertos e exposição máxima de US$ 0,273028. Não foi encontrada divergência
aritmética ou alteração do ledger. Isso não equivale a confirmação da fatura.

D04 falhou na primeira chamada, do orquestrador. O resultado histórico contém
apenas `OPENAI_AGENT_ERROR`, tipo `Error`, sem uso, status HTTP ou request ID.
O stdout histórico informa `EVALUATION_RECONCILIATION_REQUIRED`: essa é a
interrupção financeira posterior, não a causa da falha do provedor.
A pasta original da execução também não contém uma trilha HTTP recuperável.
Não se pode determinar retrospectivamente se houve falha de transporte, resposta
incompatível, limite do provedor ou outra condição.

## Lacunas confirmadas e correções

- O ID local da chamada não era enviado ao provedor. Agora o transporte envia
  esse mesmo identificador em `X-Client-Request-Id`, preservando os demais headers.
- O request ID só era associado a erros HTTP. Agora ele é registrado assim que
  os headers chegam, inclusive HTTP 200, e acompanha erros de leitura/validação.
- A falha não indicava em qual etapa ocorreu. Os diagnósticos agora distinguem
  registro, revalidação, despacho, leitura, análise do uso, adaptação e liquidação.
- Uso válido podia se perder se a liquidação falhasse. A trilha registra os
  contadores antes da liquidação, sem transformar observação em custo liquidado.
- Falha ao marcar custo incerto podia ocultar a falha original. O diagnóstico
  agora mantém a causa original e sinaliza a falha adicional de contabilização.

O callback `recordCall` é aguardado. Falha ao registrar a reserva impede o
HTTP; após despacho, uso não liquidado continua incerto. O harness escreve
`call-trace.jsonl` com append e `fsync`, antes de continuar. O padrão do runtime
usa logs estruturados existentes; stdout sozinho não é garantia de persistência
em disco. Não foram alterados schemas, banco, política de retenção, preços,
limites, credenciais nem armazenamento de respostas (`store:false`).

A trilha contém ID local, data, hash da requisição, teto, etapa, status HTTP,
IDs de resposta permitidos, contadores e diagnóstico sanitizado. Não contém
chaves, headers de autorização, prompts, documentos, resposta bruta ou stack.
Uma escrita parcial/crash ainda exige inspeção; não há reenvio automático.
O runner v9 ainda depende de pacote congelado e da reconciliação histórica.
Os snapshots anteriores não foram reescritos para inserir esta instrumentação.

## Auditoria repetível e sem mutação

No checkout `forgelex-3-audit/SDK`:

```powershell
node scripts/forgelex-final-evaluation/audit-ledger.mjs docs/architecture/evidence/2026-11-03-verifier-v8/real
```

O comando verifica a cadeia e compara resultados com o ledger. Código de saída
2 indica pendência ou divergência; 0 indica apenas consistência local, nunca
confirmação de faturamento. Não consulta API, não liquida e não libera reservas.
Resultado desta execução: `evidence/2026-11-04-d04-ledger-audit.json`.

## Como tentar resolver D04 sem nova inferência

1. Procurar no projeto/conta do provedor registros do intervalo de 03/11/2026,
   21:51:17–21:51:28 UTC (18:51:17–18:51:28 Fortaleza), modelo `gpt-6.1-sol`.
   O ID `2f498194-2bd6-41d7-9ce4-db6dd8bfe83f` era somente local: não afirmar
   que foi enviado nem usá-lo como request ID do provedor.
2. Exportações de uso/custo por projeto e chave podem ajudar a delimitar a
   busca, mas totais agregados isolados não identificam inequivocamente D04.
   A API Costs documenta buckets diários e não um filtro por request ID.
3. Se necessário e autorizado por Boni, encaminhar o texto abaixo ao suporte
   do provedor. Não há garantia de recuperação sem o identificador histórico.
   Nenhuma mensagem foi enviada nesta tarefa.
4. Havendo prova individualizada, registrar fonte/hash, correspondência,
   cálculo e decisão de Boni em artefato adicional, sem editar v8. Até lá,
   manter os US$ 0,083620 incertos. Não classificar reserva como cobrança,
   não declarar custo zero e não repetir D04 para descobrir o custo anterior.

Texto preparado para eventual consulta, não enviado:

> Preciso identificar uma requisição POST /v1/responses de 03/11/2026,
> iniciada aproximadamente às 21:51:17 UTC, que falhou localmente cerca de
> 10,68 segundos depois. Modelo gpt-6.1-sol, service_tier default,
> max_output_tokens 2048, stream true e store false. O cliente não gravou
> x-request-id nem os dados de uso e não enviava X-Client-Request-Id.
> É possível localizar essa tentativa no projeto/conta e fornecer evidência
> individualizada de uso faturável ou de não cobrança? A identificação do
> projeto e da chave deve ser feita pelo canal autenticado, sem transmitir
> o segredo da chave. O teto local reservado foi US$ 0,083620; não é cobrança
> confirmada nem estimativa de consumo efetivo.

## Fontes técnicas consultadas

- [OpenAI: identificador fornecido pelo cliente](https://developers.openai.com/api/reference/overview#supplying-your-own-request-id-with-x-client-request-id).
- [OpenAI: custos por organização](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs).

A identificação pelo cliente ajuda a localizar novas tentativas nos registros
do provedor; não é chave de idempotência e não autoriza retries.

## Valida��o final

38 testes Vitest em cinco arquivos e 12 testes Node aprovados. Build do
monorepo, typecheck da API, lint dos arquivos TypeScript alterados, formata��o
dos sete arquivos de c�digo e diff-check passaram. A su�te integral n�o foi
reexecutada. Os testes de transporte usam respostas simuladas, sem infer�ncia.

Os quatro primeiros testes novos falharam antes da implementa��o e passaram
ap�s a corre��o. Um teste adicional detectou, durante o desenvolvimento,
liquida��o prematura diante de cache n�o precificado; a ordem foi corrigida
e a regress�o est� coberta na rodada final.

58 arquivos protegidos da v8 e quatro ledgers anteriores conferidos por hash,
sem altera��es. Avalia��es de Boni continuam pendentes. Recibo e hashes:
`evidence/2026-11-04-d04-diagnostics-validation.json`.
