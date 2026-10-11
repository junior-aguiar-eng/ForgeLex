# Publicação do site focado em MCP — 11/10/2026

Boni autorizou expressamente “commit, push e deploy” e, na confirmação do
fluxo canônico, “Autorizar PR, integração em main e deploy”. A publicação
executa o [plano aprovado](../../superpowers/plans/2026-10-11-site-mcp-scope-freeze.md).
A avaliação humana pertence exclusivamente a Boni; as verificações abaixo
são evidências técnicas, sem presumir sua homologação visual.

## Integração e artefato publicado

Commit de implementação `3f37d7759605beec91736a183b2a734ac44bbef0`, integrado pela
[PR #66](https://github.com/junior-aguiar-eng/ForgeLex/pull/66) em main
`a6672d49eb167bc0b2c43b6da728ae946feb2b03`. As CIs da PR e desse SHA em main
aprovaram os seis jobs: validate, postgres, e2e-product, e2e-public,
e2e-account-closure e security. [CI de main](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/38158062921).
Vistoria local renovada antes do commit: lint e typecheck aprovados;
821 testes aprovados e 17 skips preexistentes de PostgreSQL.

Build pelo script `ops/gcp/production/build-from-main.ps1`, em clone limpo de
main alinhado ao remoto. Cloud Build `2815de4e-5d39-4f21-b329-745d4ae068f1`:
SUCCESS, 17:04:17–17:08:06 UTC. Imagem publicada por digest:

```text
southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:5526af77173638a1dd6e259e02e11b3121837c2f8db7139be209c6e262145b5d
```

Serviço `forgelex-api-prod`, região `southamerica-east1`, projeto
`project-bbbe1209-c295-4720-867`. Revisão `forgelex-api-prod-site-a6672d49`,
100% do tráfego em [nexojuris.ia.br](https://nexojuris.ia.br/).
O SHA acima identifica o código da imagem; registros documentais posteriores
não alteram esse artefato de runtime.

## Promoção e conferência em produção

Candidate criado sem tráfego, acessado por rota temporária do balanceador:
dez caminhos conferidos com HTTP 200, readiness e oito checks verdadeiros,
HTML/bundle novos e dez requisições correlacionadas à revisão candidate.
Ingress permaneceu `internal-and-cloud-load-balancing`.

| Tráfego da nova revisão | Probes | Observação | Resultado |
| --- | --- | --- | --- |
| 5% | 160 | 144,1 s | Ambas as revisões observadas; zero erros |
| 25% | 160 | 147,4 s | Ambas as revisões observadas; zero erros |
| 100% | 150 | 140,3 s | Somente a nova revisão; zero erros |

Total: 470 probes. Readiness final saudável; consulta dos logs da nova revisão
desde 17:22 UTC sem registros de status >=500 ou severity >=ERROR até o instante
do recibo. Recursos próprios temporários removidos: rota, backend, NEG e tag
candidate. Host rules existentes preservadas; tráfego final novamente conferido.

Navegador Edge autenticado, com a interface nova efetivamente renderizada:

- Seis aliases de casos, rascunhos e revisão redirecionaram a `/app/conectar`,
  descartando query/hash sintéticos. Dez telas preservadas abriram, incluindo
  pesquisa, guia MCP, API, conta/chaves/atividade/segurança e consulta gratuita.
- Captura completa de 376 requisições, sem truncamento, sem chamadas a
  `/review-queue` ou `/matters`, sem bundles de DashboardScreen,
  MatterWorkspaceScreen ou DraftStudioScreen e sem erros de console.
- Página pública, Conectar IA e conta conferidas também em largura 390 px,
  sem overflow horizontal. Capturas desktop/mobile identificadas por hash no recibo.

Uma aba aberta antes do deploy recebeu três 404 de chunks antigos ao abrir
Conectar IA. A proteção existente exibiu “Atualizar página”; acioná-la carregou
o bundle novo e recuperou a tela. A recuperação foi manual, sem presumir reload
automático ou disponibilidade eterna dos assets antigos.

As primeiras probes candidate alcançaram a revisão antiga durante propagação
do URL map; houve também atraso de ingestão dos logs e uma expectativa textual
incorreta no harness. A promoção ocorreu somente após conferir propagação,
correlacionar todas as probes e corrigir a asserção para o título entregue.
A primeira captura de rede truncou; foi repetida por navegação, sem perda de eventos.

## Backend, banco e hosts

O diff de implementação não modifica `apps/api`, `packages` ou `scripts`.
Configuração de runtime preservada, exceto imagem e `FORGELEX_SOURCE_SHA`:
service account, ingress, recursos, billing, segredos e referências Supabase.
`FORGELEX_AUTO_MIGRATE=false`; conexão Cloud SQL continua apontando para
`forgelex-hml-pg`, o nome efetivo da instância usada pelo serviço de produção.
A [vistoria externa anterior](2026-10-11-site-mcp-external-validation.md)
comprovou PostgreSQL 16.15, 37 migrations registradas, índice válido e backups.
Nenhuma migration, restore, alteração de grants, operação financeira ou
execução de retenção foi feita nesta publicação.

Após o deploy, `forgelex.connection_status` retornou OAuth autenticado,
`billable=false`, recurso `https://nexojuris.ia.br/mcp`, às 17:30:03 UTC.
Logs correlacionados registram POSTs do Codex na nova revisão, status 200/202.
ChatGPT e Claude foram ensaiados em hosts reais antes do deploy, conforme o
registro externo; não houve nova chamada nesses dois hosts após a promoção.
Não foram realizadas pesquisa paga, consulta de CNJ real nem nova concessão OAuth.

O checkout original manteve branch/HEAD e os 47 arquivos protegidos, conferidos
novamente por SHA-256. Os patches locais anteriores não entraram na entrega.

## Reversão e limites

A revisão anterior `forgelex-api-prod-audit-5aca51e` permanece disponível.
Para rollback futuro, mediante autorização de Boni, executar:

```powershell
gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-audit-5aca51e=100 --quiet
```

O comando está documentado, não foi executado. Outra opção é reconstruir a
imagem com `VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true`, conforme a
[matriz de reversão](../../product/site-mcp-scope-freeze.md). Não exige SQL,
restauração ou mudança de permissões. O ensaio da flag habilitada foi local.
As observações curtas de rollout não demonstram confiabilidade contínua,
performance sob carga ou execução dos fluxos financeiros reais.

[Recibo estruturado sem segredos](2026-10-11-site-mcp-publication-proof.json).
