# Publicação da correção de pesquisa — 02/10/2026

Publicação autorizada por Boni após a entrega local. A
[PR #32](https://github.com/junior-aguiar-eng/ForgeLex/pull/32) foi integrada
em `01fedabe1daf366ffb7a2508df73876e731dc8a7`. Os seis checks da PR
([37075830747](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37075830747))
e de main
([37076269177](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37076269177))
passaram: validate, postgres, e2e-product, e2e-public, e2e-account-closure
e security. O checkout P2 original não participou da imagem.

## Versão e migration

Cloud Build `6d4cbc00-c018-4e4c-bd7e-979bbc97ab11`: SUCCESS, encerrado
em `2026-10-02T23:15:41.765614Z`. Build por clone limpo de main, com
424 arquivos no inventário de upload, sem credenciais, dumps ou artefatos
locais; apenas templates de configuração versionados.

Imagem:
`southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:9bbaaf29abe153e8381162a6d4d10ad1b9eb28e2662a2222e5101cfe19ea129e`.
Revisão: `forgelex-api-prod-research-01fedab`.
Rollback preservado: `forgelex-api-prod-documents-fbe32b2`.

Antes do deploy, o job temporário
`forgelex-research-migration-01fedab-plpqq` aplicou somente
`persistence-0024-research-judgment-year`, às `2026-10-02T23:16:34.892Z`.
O preflight rejeitaria outras migrations pendentes. A verificação confirmou
coluna INTEGER nullable, registro no ledger de migrations e preservação das
contagens de histórico e débitos. Nenhum valor de ano foi inferido para
consultas antigas. O rollback da aplicação pode conservar essa coluna.

## Verificação da imagem e do domínio

Env/secrets, service account, conexão Cloud SQL, concorrência, timeout,
recursos e ingresso foram comparados ao inventário anterior e preservados.
Somente imagem e `FORGELEX_SOURCE_SHA` foram alterados. O Dockerfile validou
a configuração pública Supabase e o bundle, sem expor segredos no cliente.

A candidata foi criada sem tráfego normal. Uma rota temporária do
balanceador, restrita a cabeçalho de ensaio, permitiu testar a imagem pelo
domínio. O OpenAPI retornou judgmentYear 1989–2026, ano nullable no histórico
e repeatCount; os logs confirmaram requisição na revisão candidata.

Sete testes Chromium passaram na candidata (28,8 s). O frontend foi servido
pela imagem remota; Auth, API compilada, SQLite, saldo e jurisprudência foram
locais e descartáveis. Foram verificados histórico/exemplos sem cobrança,
cliques rápidos, Enter repetido, agrupamento de consultas intencionais,
ano nas duas telas, detalhes/cópia gratuitos, falha do clipboard,
navegação durante perda da resposta, replay e limpeza ao sair da sessão.

No ensaio inicial, imports de JavaScript chegaram à revisão antiga apesar
do seletor de candidata. A ponte de teste passou a fixar explicitamente o
cabeçalho e a buscar os assets da candidata sem cache. Também foram adaptados
o endpoint local de conferência de saldo e o encerramento das rotas de teste.
Nenhuma alteração de aplicação foi necessária. Para evitar a mistura de
assets durante um canário com duas revisões, a promoção foi direta para
100% após validar a candidata, com rollback automático se os probes falhassem.

Depois da troca, dois fluxos foram repetidos no domínio normal (13,4 s),
sem cabeçalho de candidata, com os mesmos serviços e dados locais. Histórico,
exemplos, cópia, duas operações intencionais e repetição após perda da
resposta passaram. Nenhuma pesquisa paga foi executada em conta produtiva.

A observação a 100% terminou em `2026-10-02T23:42:33.536Z`: 162 respostas
readyz 200 em 121,6 segundos, todas confirmadas nos logs da nova revisão.
As 14 rotas finais retornaram 200, com `Accept: text/html` nas rotas SPA.
O resultado da observação e das rotas está no recibo JSON associado.

A rota temporária do balanceador, backend, NEG, tag de candidata e job de
migration foram removidos. O URL map foi comparado ao original e restaurado;
inventário final às `2026-10-02T23:48:30Z` confirmou a nova revisão a 100%.
A consulta de logs ERROR da nova revisão desde `23:16Z` não retornou entradas
nessa verificação. Recursos e tags de outras entregas foram preservados.

## Limites

Os ensaios de navegador não comprovam escrita E2E em um tenant produtivo.
A API publicada foi verificada por readiness, contrato OpenAPI e identidade
de revisão; seu comportamento faturável foi testado com dados fictícios no
CI e em SQLite/PostgreSQL locais. Não se afirma acompanhamento temporal
contínuo além da observação registrada. Não há novo armazenamento permanente
de resultados ou estorno automático. A frente P2 permanece separada.

Recibo saneado:
[2026-10-02-research-publication-proof.json](2026-10-02-research-publication-proof.json).
