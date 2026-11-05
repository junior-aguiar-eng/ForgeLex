# Publicação da mesa integrada — 05/11/2026

Boni autorizou commit, push e deploy da mesa integrada. Publicação concluída;
horários em UTC. O editor comercial permanece desativado.

## Fonte e validação

- [PR #105](https://github.com/junior-aguiar-eng/ForgeLex/pull/105) integrada;
  fonte `98f6c3d36e10cfed3b4482c52075d02a8f77af8b`.
- Seis jobs aprovados na [CI da PR](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/42116910117)
  e na [CI do merge](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/42118640199).
- A primeira CI identificou um teste ainda vinculado à navegação anterior.
  Sua adaptação expôs um diálogo de revisão de fatos oculto ao mudar para a
  largura móvel com a peça aberta. Os diálogos passaram a usar portal;
  o fluxo comercial sintético completo passou localmente e nas duas CIs.
- Build a partir de `git archive`, sem arquivos locais. SHA-256 do arquivo:
  `8014738442B66AC5851C2C6A78AF5EDEF4EAC40EC630A7DB3C4803B0F32F2F4D`.
- Cloud Build `509deb19-ab9d-4bbc-b92f-725e405da8de`, `SUCCESS`, concluído
  às `22:22:00.766506Z`.
- Imagem dos dois serviços:
  `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:9bad5e4e78e675ff5eb836847000cbe5dd1f32578131838c359bb9d0c69c0425`.

As flags públicas de pesquisa salva, casos e workspace agêntico permaneceram
em `true`. Não houve migration, backup novo, chamada paga ou uso de Docling.
O backup e as migrations da publicação anterior estão no
[recibo anterior](2026-11-05-publication.md); não foram repetidos nesta operação.

## Revisões e configurações

| Serviço | Revisão publicada, 100% | Promoção |
| --- | --- | --- |
| API | `forgelex-api-prod-98f6c3d` | `22:26:37Z` |
| Encerramento | `forgelex-closure-hml-private-98f6c3d-r2` | `22:26:19Z` |

As candidatas foram verificadas sem tráfego antes da promoção. A primeira
candidata de encerramento recebeu `FORGELEX_SOURCE_SHA` malformado devido à
interpretação de uma vírgula pelo PowerShell. A comparação detectou a diferença;
a revisão `98f6c3d-r2` corrigiu o valor antes de receber tráfego. A candidata
descartada não recebeu tráfego de produção.

A comparação das especificações confirmou preservação de variáveis, referências
a segredos, recursos, conta de execução e anotações de configuração, exceto
imagem e identificação da fonte. Nos dois serviços:

- `FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=false`;
- `FORGELEX_AUTO_MIGRATE=false`;
- startup probe HTTP `/readyz`, porta 8080, período 10 s, timeout 5 s,
  limiar de 24 falhas.

Tags temporárias `rel-98f6c3d` removidas após a promoção; tags preexistentes e
revisões anteriores preservadas. Não houve alteração de IAM, URL map ou Scheduler.

## Verificações em produção

- API e encerramento com `Ready=True`, `Active=True` e `ContainerHealthy=True`.
  Startup `/readyz` aprovado às `22:24:18.114694Z` e `22:25:28.443624Z`, respectivamente.
- `/readyz?release=98f6c3d`: 200, `status=ready`, todos os checks verdadeiros;
  log vinculado à revisão nova às `22:26:49.578959Z`.
- `/`: 200; GET `/mcp`: 405; POST initialize sem credencial: 401.
- Scheduler existente chamou `/api/internal/account-closure/reconcile` na nova
  revisão privada às `22:27:02.975662Z`, retornando 200. Nenhum encerramento
  artificial foi disparado; isso não prova processamento de um encerramento real.
- `/hub`: 200 e hash igual ao anterior. `/ratione`: 200, mas hash diferente da
  linha de base. O URL map encaminha esse caminho a `ratione.nexojuris.ia.br`;
  a resposta direta desse domínio tem o mesmo hash novo. Esse destino é separado
  dos serviços alterados. A causa da mudança de conteúdo não foi investigada.
- Consulta de logs das duas revisões, janela de 15 minutos e limite 30,
  sem entradas de severidade ERROR ou superior. A consulta específica de
  `MaxListenersExceededWarning`, limitada a dez entradas, encontrou dez;
  a causa dos avisos de inicialização não foi diagnosticada.
- Sessão autenticada já aberta recarregada: menu com Mesa, Casos e Pesquisa,
  sem Rascunhos ou Revisão como destinos separados. Nova peça abriu o editor
  local; recolher e reabrir preservou o texto sintético digitado. O texto foi
  removido ao terminar, sem salvar no servidor ou enviar pedido à IA.
  Menu Word/PDF conferido visualmente. Não foram gerados arquivos de exportação
  nesse smoke de produção; sua geração foi exercitada nos testes sintéticos.

## Retorno de tráfego

As revisões anteriores `forgelex-api-prod-a5d9762` e
`forgelex-closure-hml-private-a5d9762` foram preservadas. Se necessário e
autorizado, retornar o serviço privado e depois a API:

```powershell
gcloud run services update-traffic forgelex-closure-hml-private --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-closure-hml-private-a5d9762=100
gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-a5d9762=100
```

Este recibo documental é posterior ao SHA de código publicado. A publicação
não ativa o editor comercial nem substitui avaliação jurídica das entregas.
