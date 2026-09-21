# Fase 14 — evidência de cobrança controlada

Status: `COMPLETED`.

Veja também o [estado canônico](../../../STATUS_VALIDACAO.md), o
[plano mestre](../../../Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md) e a
[decisão de escopo](strategic-freeze.md). Este documento preserva somente
evidências saneadas; não é inventário de segredos ou dados financeiros.

## Preflight

Executado em 2026-09-21 (UTC) antes de qualquer mutação financeira.

- serviço e revisão Cloud Run: `forgelex-api-hml` /
  `forgelex-api-hml-00011-q2f`, com 100% do tráfego;
- domínio público `https://nexojuris.ia.br/health`: `200`;
- homologação `https://hml.nexojuris.ia.br/health`: `200`;
- URL nativa do serviço Cloud Run em `/health`: `404`;
- ingress: `internal-and-cloud-load-balancing`;
- certificados gerenciados `forgelex-api-prod-cert` e
  `forgelex-api-hml-cert`: `ACTIVE`;
- banco: instância Cloud SQL continua referenciada na revisão;
- billing: `FORGELEX_BILLING_ENABLED=true`;
- Mercado Pago: URL de notificação pública e referências Secret Manager para
  o access token e a assinatura do webhook presentes na revisão, sem leitura
  de valores.

## Decisão de gate

`READY_FOR_SINGLE_CHECKOUT`: os controles de exposição pública, saúde, TLS,
ingress e referências de configuração necessários antes da única compra foram
observados. Ainda não há tenant de validação, chave de billing, checkout,
ordem, pagamento, crédito ou operação jurídica criada nesta fase.

## Restrições vigentes

- STJ continua como a única capability jurídica comercial; Fases 9 a 13
  seguem `FROZEN_STRATEGICALLY`.
- Nenhum corpus, fonte, provider, parser, importação, deduplicação ou
  varredura foi acionado.
- A criação da ordem e a abertura do checkout exigiram confirmação expressa
  imediatamente antes de cada ato.

## Cobrança produtiva controlada

- Foi criada uma única compra do pacote `credits_25`, no valor de R$ 25,00,
  com repetição da mesma chave de idempotência retornando a mesma compra e
  sem segunda ordem. A referência registrada nesta evidência é o hash curto
  `eae67ec39457`.
- O Mercado Pago confirmou a ordem como processada, com um pagamento. O
  comprovante fornecido pelo pagador foi tratado somente como evidência visual
  complementar; identificadores e dados pessoais não foram registrados aqui.
- As entregas originais chegaram ao endpoint canônico e receberam `401`.
  A investigação mostrou que a primeira tentativa de reconciliação havia
  armazenado a máscara visual do campo de assinatura, e não o valor revelado
  da assinatura produtiva. Não houve crédito manual, nova compra, recarga,
  consumo nem reembolso durante a investigação.
- A assinatura produtiva efetiva foi armazenada como nova versão do segredo e
  a revisão `forgelex-api-hml-00013-5g6` passou a receber 100% do tráfego.
  Um único replay autenticado do evento já recebido retornou `200`; o handler
  consultou a ordem no provider e concluiu a compra existente.
- Reconciliação final da conta de validação: compra `PAID`, saldo pago `2500`
  centavos, saldo promocional `0` e nenhuma operação jurídica executada.

## Encerramento e revogação

- A chave de API temporária, limitada a `billing:read` e `billing:write`, foi
  revogada após a reconciliação. Nova chamada à conta de billing com a mesma
  credencial retornou `401`.
- A única versão do segredo temporário de billing foi desabilitada. Tenant,
  compra, ordem e registros financeiros foram preservados para auditoria.
- As versões anteriores e incorretas da assinatura de webhook não estão
  referenciadas pela revisão ativa; nenhum valor de segredo é reproduzido
  nesta evidência.

## Limites preservados

- STJ permanece a única capability jurídica comercial e as Fases 9 a 13
  seguem `FROZEN_STRATEGICALLY`.
- Não houve importação, deduplicação, varredura, alteração de corpus, fonte,
  parser ou provider jurídico.
