# Fase 14 — evidência de cobrança controlada

Status: `READY_FOR_SINGLE_CHECKOUT`.

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
- O próximo ato mutável exige confirmação expressa imediatamente antes da
  criação de uma única ordem `credits_25` de R$ 25,00.
