# Publicação das correções de segurança — 24/10/2026

Boni autorizou correção de dependências, migração compatível para Zod 4,
commit/push/PR e publicação após os gates. Checkout original preservado.
Horários em UTC. [Recibo estruturado](2026-10-24-security-dependencies-publication-proof.json).
[Implementação e regressões](2026-10-24-security-dependencies.md).

## Fonte e imagem

- PR #78, fonte main `6499eb002a2960adf3f807d4c00321f8ed174663`; CI da PR
  [40065084732](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/40065084732): seis jobs aprovados.
- CI pós-merge [40065568520](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/40065568520): seis jobs aprovados antes da promoção.
- Local: 948 testes aprovados, 18 ignorados, sem novos skips; build,
  tipos, lint e audits de produção/completo aprovados.
- Build canônico `07eb9987-7483-418c-b15e-21468d14b8cc`: SUCCESS, final 2026-10-24T05:23:11.339661Z.
- Digest: `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:e3c09f047239c879e8db413aac696362218193b1f0ca2f7e74e6a05f8824f95c`.
- Checagem do artefato `5f8a6d0d-57a1-4ec4-aa8c-e3ef5cb99e6f`: SUCCESS.

O inventário do runtime verificou versões de Zod, Fastify e transitivas
instaladas. A lista exata está no recibo; dependência ausente não é descrita
como atualizada no runtime. No container, a lista acima do limite produziu um
único erro, identificador GUID legado foi aceito e o handler MCP real passou
em initialize/tools-list e defaults de pesquisa. O teste de catálogo não
executou ferramenta, ledger ou conexão com banco; não homologa OAuth/hosts reais.

Fastify foi declarado como ^5.12.6 e resolvido em 5.12.7 no lockfile/imagem.
Duas tentativas da sonda falharam antes de criar candidatas: a primeira exigia
5.12.6; a segunda usava resolução CommonJS para exports exclusivos de ESM.
As expectativas e a resolução da sonda foram corrigidas conforme a fonte.
IDs, causas e resultados das tentativas estão preservados no recibo; a imagem
não mudou entre essas verificações.

## Candidata e promoção

Candidata pública `forgelex-api-prod-deps-6499eb0-candidate`, billing false,
AUTO_MIGRATE=false, 0% do tráfego: 8 probes aprovados.
Revisão comercial `forgelex-api-prod-deps-6499eb0`, mesmo digest,
billing normal e 0% antes do ensaio: 8 probes aprovados,
assets idênticos e trace na revisão correta. Worker privado validado com
readiness autenticada 200 e acesso anônimo 403, sem reconciliação manual.

Worker promovido em 2026-10-24T05:55:01.320Z; API em 2026-10-24T05:56:40.923Z.
Ambos em 100% na conferência final. Após limpeza, 8 probes públicos
passaram, com trace da raiz na revisão nova e assets iguais aos da candidata.
As respostas 401 de coleção/MCP sem credencial são resultados esperados.

O primeiro caminho de teste não atingiu a candidata: o helper histórico
presumia prod-root, mas o domínio canônico já usava nexohub-root com /hub.
O trace 404 veio da revisão antiga. A regra temporária foi movida para
pathRules do matcher ativo, sem alterar /hub ou o backend padrão. O ensaio
completo foi repetido e só aceito após trace na candidata; a limpeza final
comparou as rotas existentes com o mapa preservado. Diagnóstico e alteração
delimitada estão no recibo. A espera inicial por propagação não resolveu a causa.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `assets/index-DpAMTjUp.js` | 468263 | `41903fa7bbfc6ab63504e045de74d038ea429185fb6db392b55570a38d0d6d4c` |
| `assets/index-BcMysa4n.css` | 41052 | `4ab3cb530fbc83f61e765579c3a99635c5d9e599b1af8b0e35fedfed2876dcc2` |

## Configuração, limpeza e dados

Ambiente final, runtime, service accounts, Cloud SQL, ingress, IAM e Scheduler
preservados, exceto imagem e SOURCE_SHA. Billing ficou temporariamente
desligado apenas na candidata pública. Regra, backend, NEG e tags de teste
foram removidos, mantendo o backend padrão. Não foi criado serviço paralelo
ou Scheduler adicional, concedida permissão ou acionado reconcile manual.

Nenhuma migration remota foi executada ou reaplicada. AUTO_MIGRATE=false
em todas as revisões; readiness confirmou migrations compatíveis. Não foi
aberto proxy SQL ou conexão direta do operador com o banco. Não houve chamada
faturável, nova conta ou escrita de negócio pelos probes desta publicação.

A consulta de logs às novas revisões, desde a candidata, retornou
0 eventos ERROR ou superiores, limite 20,
conferida em 2026-10-24T06:05:12.343Z. Há 3 requisições
da cadência normal do Scheduler registradas no recibo. Esses resultados
delimitam a observação, sem garantir ausência universal de defeitos.

Os 47 arquivos locais do checkout original, sua branch e seu HEAD
continuam intactos pelos hashes anteriores à operação. Recibo e documentação
foram preparados em branch/worktree próprios. Revisões anteriores mantidas
para retorno de tráfego: `forgelex-api-prod-hono-e93a508` e
`forgelex-closure-hml-private-hono-e93a508`; nenhum rollback ou reversão de schema executado.
