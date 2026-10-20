# Publicação da correção de dependência Hono — 20/10/2026

Boni autorizou deploy, validação da candidata antes da promoção, preservação
das alterações locais e registro de evidências. Proibiu reaplicar migrations.
Horários em UTC. [Recibo estruturado](2026-10-20-hono-publication-proof.json).

## Código, CI e imagem

- [PR #76](https://github.com/junior-aguiar-eng/ForgeLex/pull/76), main
  `e93a5085b244f80feba5e87a6f78a72297ff690b`. [CI pós-merge](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/39475248557): seis jobs aprovados.
- Instalação com lockfile congelado, build e suíte local da correção aprovados:
  923 testes passaram, 18 ignorados, sem novos skips. Gate de segurança: 30
  testes aprovados; audit de produção sem alertas conhecidos. Audit completo
  conserva apenas o alerta de braces coberto pela mitigação local existente.
- Build canônico a partir de main limpo, sem conteúdo do checkout original:
  `1565888e-a88b-43ff-ac50-4124d734dac2`, SUCCESS, concluído em 2026-10-20T20:54:12.327414Z.
- Imagem imutável: `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:a5235667db65050349d7c89db422771386a5824d3aee5a98c2a10fd4151d6a97`.

O override e o lockfile corrigem Hono 4.13.8 → 4.13.11 para
`GHSA-5r4p-p66f-jhc7`. A checagem do artefato
`b078ee51-8771-4e8b-9954-c4effe4d9322` terminou SUCCESS:
inventariou 183 manifests de pacotes no runtime,
seguindo symlinks com deduplicação, e encontrou **Hono ausente**.
O Hono chega por dependências de frontend/desenvolvimento; o Dockerfile usa
`pnpm --filter @forgelex/api deploy --prod`. Portanto, não se afirma que um
servidor Hono instalado foi substituído no runtime. A imagem foi reconstruída
com o lockfile corrigido e publicada após os gates abaixo.

A primeira sonda de versão falhou por presumir um pacote Hono instalado;
não foi considerada aprovação. A inspeção completa corrigiu essa premissa,
sem modificar a imagem ou incluir uma dependência desnecessária no runtime.

## Validação antes da promoção

1. Candidata pública `forgelex-api-prod-hono-e93a508-candidate`, billing desligado,
   auto-migrate desligado e 0% do tráfego principal.
2. Rota temporária pelo balanceador existente, sem abrir o ingress direto.
   8 probes aprovados, com trace confirmado na revisão correta.
3. Candidata do worker `forgelex-closure-hml-private-hono-e93a508`, 0% do tráfego:
   readiness autenticada 200, oito checks verdadeiros e acesso anônimo 403.
   Nenhuma reconciliação foi disparada manualmente.
4. Revisão comercial `forgelex-api-prod-hono-e93a508`, no mesmo digest,
   billing normal restaurado e 0% do tráfego até o segundo ensaio.
   8 probes aprovados, assets idênticos e trace confirmado nessa revisão.

Probes públicos: readiness com oito checks verdadeiros; HTML e assets;
metadados OAuth com resource canônico; coleção e MCP sem autenticação (401
esperado); OpenAPI. Não houve conta sintética nova, concessão de acesso,
compra, chamada faturável ou ensaio com dados jurídicos reais.
Esses probes não substituem uma nova homologação autenticada dentro de
ChatGPT/Claude nem avaliação da qualidade jurídica por Boni.

Durante a propagação inicial do balanceador, o prefixo temporário retornou
404 na revisão anterior, confirmado pelo trace
`f1e19a4b964c415e929e22a2d58231d9`. Essa tentativa não aprovou o gate.
A aprovação só ocorreu após convergência da rota, readiness estável e
confirmação de trace na candidata correta, sem alteração no produto.

## Promoção e conferência final

- Worker: 100% em 2026-10-20T21:11:40.946Z.
- API pública: 100% em 2026-10-20T21:12:15.729Z.
- Conferência final: 2026-10-20T21:14:31.302Z; as duas revisões atendendo 100%.
- 8 probes públicos aprovados após a limpeza; assets idênticos à candidata.
- Regra, backend, NEG e tags temporários removidos; backend padrão preservado.
- Ambiente final, runtime, service accounts, Cloud SQL e ingress preservados,
  exceto imagem e SOURCE_SHA. Referências a secrets: API 15, worker 12.
  Políticas IAM e Scheduler preservados, sem ampliar permissões.
- Requisições regulares do Scheduler observadas na nova revisão privada:
  3; statuses registrados no recibo.
- Cloud Logging: 0 eventos ERROR ou superiores retornados na consulta
  às duas revisões desde a criação da candidata, limite 20,
  conferida em 2026-10-20T21:16:09.854Z. Trata-se de janela e filtro
  delimitados, sem garantia universal de ausência de falhas ou desempenho.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/index-DpAMTjUp.js` | 468263 | `41903fa7bbfc6ab63504e045de74d038ea429185fb6db392b55570a38d0d6d4c` |
| `assets/index-BcMysa4n.css` | 41052 | `4ab3cb530fbc83f61e765579c3a99635c5d9e599b1af8b0e35fedfed2876dcc2` |

## Migrations, preservação e recuperação

**Nenhuma migration foi executada ou reaplicada pelo operador.** Não foi aberto
proxy SQL nem conexão direta com o banco. AUTO_MIGRATE permaneceu false em
todas as revisões; os checks de migrations da inicialização passaram.
Não foram alterados journal, schema, saldo, direitos ou rotinas de retenção
por comandos desta operação; não houve reconciliação manual.

Os 47 arquivos modificados/não rastreados do checkout original
mantêm os hashes da baseline anterior ao deploy. Branch
`codex/case-flow-simplification`, HEAD `101ee331fc621ebf38fd536a549c38b0f9340d12`,
preservados. Os recibos foram preparados em worktree separado, em branch própria.

As revisões anteriores continuam disponíveis para retorno de tráfego:
API `forgelex-api-prod-analise-cabf504` e worker `forgelex-closure-hml-private-analise-cabf504`.
Nenhum rollback foi executado. Uma eventual volta de tráfego não deve reverter
schema; a imagem anterior conserva a compatibilidade analítica já validada.
O runbook de [reconciliação analítica](../analise-reconciliation.md) permanece
vigente, sem retomada ou reparo automático de operações interrompidas.

## Complemento da entrega Git — 20/10/2026

A CI inicial da PR #77 reprovou o audit de dependências por novos alertas
`GHSA-22jm-h49p-29qw` e `GHSA-6prh-2h8m-c8cw` nos SDKs MCP. Boni autorizou
corrigir as dependências e revalidar na mesma PR, sem novo deploy.
O SDK passou de 1.31.0 para 1.32.0 e o client de 2.2.0 para 2.3.0,
com seu core transitivo correspondente. O audit completo também identificou
`GHSA-698v-4r3x-3vcv` no Vite: frontend 6.4.3 → 6.4.4 e testes
7.3.6 → 7.3.7, preservando as versões principais e as demais resoluções.

Instalação com lockfile congelado aprovada. Audit de produção sem alertas
conhecidos; audit completo sem alertas acionáveis, mantendo a exceção de braces
e sua mitigação local. Não foram afrouxados os gates ou descartados advisories.
Build local e 65 testes dos adapters Anthropic/OpenAI, MCP e gate de segurança
aprovados em sete arquivos. A suíte completa e os E2E são gates da CI da PR.
Essas atualizações destinam-se aos próximos builds. A imagem publicada e o
recibo operacional acima permanecem os mesmos; nenhum deploy ou migration
foi executado nesta entrega Git.
