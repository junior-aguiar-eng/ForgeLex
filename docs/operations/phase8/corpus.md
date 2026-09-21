# Fase 8 — promoção do corpus STJ

Data: 2026-09-20/21  
Status: `passed`

## Escopo promovido

O corpus global do STJ foi exportado do PostgreSQL local por uma transação
somente das tabelas jurisprudenciais autorizadas e importado nativamente no
Cloud SQL `forgelex-hml-pg`. Nenhuma tabela vinculada a tenant, usuário,
matter, billing, credencial ou sessão integrou o artefato.

O dump custom original tinha 1.632.868.220 bytes e SHA-256
`4f16ab2a925d6e19649fb02a6d712af0d9273ba6518f317b9ec1a28106aec112`.
O SQL transacional compactado enviado ao bucket temporário tinha
1.727.583.754 bytes e SHA-256
`3a334f4d46e580b2facbcacb8d9262ec542aba81152bd22b7492f07ae42a47d8`.

## Importação

A primeira operação nativa foi cancelada durante a execução no perfil
`db-f1-micro`; a transação foi revertida integralmente e as contagens
permaneceram zeradas. Para concluir a operação, a instância foi elevada
temporariamente para `db-custom-1-3840`. A importação definitiva
`fa192f75-714a-4da0-b7a0-ca5400000030` ocorreu de
2026-09-21T00:29:55.116Z a 2026-09-21T00:55:48.416Z, aproximadamente 25
minutos e 53 segundos. Após a validação, a instância foi devolvida ao perfil
planejado `db-f1-micro`.

## Integridade comparativa

O verificador comparou origem e destino e aprovou todas as contagens,
cobertura, hashes de manifestos e invariantes:

- 874.450 documentos e 874.516 versões;
- 544 manifestos e 546 registros rejeitados pelos manifestos;
- cobertura de 1989-02-19 a 2026-08-26;
- estados terminais `COMPLETED` e `FAILED` preservados;
- zero `dedupe_key` duplicada, versão duplicada, ponteiro atual ausente ou
  linha de staging;
- conjunto de manifestos com SHA-256
  `edfae4718855488d48b31ac7e6cee21607083a29980cb9ef93202408f95e586f`.

A lacuna oficial terminal já documentada permanece como `FAILED`; a promoção
não corrigiu nem normalizou silenciosamente o conteúdo malformado da fonte.
