# Fase 8 — gate A da homologação Google Cloud

Data: 2026-09-20  
Status: `passed`

## Identidade implantada

- projeto: `project-bbbe1209-c295-4720-867` (`My First Project`)
- região: `southamerica-east1`
- commit da imagem: `9e6f4ed23278820ef04e54e29b256317d09bfef3`
- digest: `sha256:e76b8e91ed4b5fa52b7514d34bfb471e705a841182661327b9929edbde88ee49`
- revisão: `forgelex-api-hml-00004-q72`
- URL nativa validada: `https://forgelex-api-hml-446928467632.southamerica-east1.run.app`
- Cloud Run: 1 CPU, 512 MiB, concorrência 20, timeout 60 s, mínimo zero e máximo dois
- Cloud SQL: PostgreSQL 16 Enterprise, `db-f1-micro`, zonal em
  `southamerica-east1-c`, SSD de 10 GiB com expansão automática

Não existem HA, réplica, NAT, CDN, segunda região ou rede autorizada no Cloud
SQL. O gate A não criou IP global, balanceador nem registro DNS.

## Banco e identidade sintética

As migrations foram executadas duas vezes pelo Cloud SQL Auth Proxy; a segunda
execução não reaplicou migrations. O seed representativo foi ingerido duas
vezes e preservou a idempotência (`resultCount=1`, `emptyCount=0`,
`verified=true`, `replayed=true`). Nenhuma tabela tenant-scoped foi exportada
da origem.

A identidade sintética vigente é o tenant
`tenant_055d9c6c58ad312c091a6f3d95d1dd9e`, usuário
`user_055d9c6c58ad312c091a6f3d95d1dd9e` e chave
`f2123761-088f-4912-95fb-67858e46cc69`, prefixo `flx_live_Fx5amKF`. O token
foi enviado diretamente pela entrada padrão ao Secret Manager e não foi
persistido no repositório nem nas evidências. A carteira sintética recebeu
R$ 20,00 promocionais com expiração explícita de sete dias.

## Gates funcionais

- smoke HTTP: PASS em saúde, prontidão, OpenAPI, tribunais, busca, replay,
  rejeição de STF e métricas autenticadas;
- busca REST: R$ 0,20 no primeiro pedido e zero no replay;
- MCP remoto independente: PASS, três tools públicas, mesma autoridade,
  proveniência verificada, débito total de R$ 0,20 e replay gratuito;
- Agent Core sobre MCP remoto: PASS, encadeando busca, obtenção e verificação;
- carga limitada: PASS em 25 buscas, concorrência cinco, sem 5xx, p50 de
  734,37 ms, p95 de 1.177,35 ms, máximo de 1.257,19 ms e débito total de
  R$ 5,00;
- frontend, `/readyz`, `/openapi.json` e métricas: PASS na mesma origem.

O Google Frontend reserva caminhos terminados em `z`; por isso a liveness
externa do Cloud Run foi validada em `/health`, enquanto `/healthz` permanece
como contrato do aplicativo fora dessa limitação da plataforma.

## Custo e segurança

A projeção oficial do gate A permaneceu em R$ 82,76/mês, dentro do orçamento
de R$ 100,00: R$ 82,68 para o Cloud SQL e R$ 0,08 para Cloud Run no perfil de
carga estimado. Não é uma promessa de custo futuro nem inclui o balanceador do
gate B.

Uma revisão inicial falhou antes de receber tráfego e registrou uma URL de
banco. A senha foi rotacionada, a versão comprometida deixou de ser válida e o
startup passou a registrar somente nome e código do erro. As versões antigas
dos secrets serão destruídas no fechamento da fase; nenhum valor secreto é
reproduzido neste relatório.

