# Pendências atuais do ForgeLex

<a id="estado-publicado-atual"></a>

## Estado publicado atual — 25/11/2026: SHA `9ccb9e7`

**Aprovação.** Boni autorizou a publicação em 25/11/2026, depois de ler o resultado do `deploy-from-main.ps1 -DryRun`
(sem impedimentos; CI de `main` verde em `9ccb9e7`; sem migration entre `6fe4f75` e `9ccb9e7`). Publicado pelo roteiro
oficial, com fim às 23:45:41 UTC: build `91643cad-d0a3-408e-914f-cfaff315e449`, digest `sha256:25dd5c1a…`. As revisões
`forgelex-api-prod-9ccb9e7-91643cad` e `forgelex-closure-hml-private-9ccb9e7-91643cad` recebem 100% do tráfego; o script
conferiu que só a imagem e `FORGELEX_SOURCE_SHA` mudaram. Tema `classico`, demais flags iguais às do build anterior.
Recibo, revisões anteriores e comandos de reversão:
[recibo](docs/operations/deploy-receipts/2026-11-25-2345Z-9ccb9e7-publicado.md). Inclui todo o código de 17/11 a 25/11
(lista abaixo; item 18 da seção 1A do plano unificado) e a correção do conector. O journal de migrations segue em 57.

**Verificação feita.** Depois da troca: `/readyz` 200; `/mcp` sem token em 401 com `resource_metadata`; registro OAuth em
201. Boni reconectou o conector no Claude, e `forgelex.connection_status` respondeu `authenticated: true` com
`oauth_access_token` às 23:51:46 UTC. **Não verificado:** a seção 8 do checklist (uso do site autenticado por Boni) não
foi feita nesta publicação.

**Incidente do conector (25/11/2026).** O projeto Supabase de produção estava pausado (`INACTIVE`), e o registro OAuth
respondia 503. Com autorização de Boni, o projeto foi reativado. Em seguida, o Auth do Supabase passou a recusar tokens de
cliente OAuth em `GET /auth/v1/user/oauth/grants` (403), e todo `/mcp` respondia 401. Correção no #213: a API consulta a
autorização vigente pela função `forgelex_api.oauth_grant`
([`supabase-oauth-grant-lookup.sql`](ops/gcp/production/supabase-oauth-grant-lookup.sql), já aplicada), só com a chave
secreta. Boni configurou a Data API para expor **somente** o schema `forgelex_api`, sem tabelas: a chave pública recebe
401 na função e 406 em `public`. Se o projeto estiver no plano gratuito, nova pausa por inatividade derruba o login do
site e o conector.

**Publicado em `9ccb9e7`** (de 17/11 a 25/11; detalhes no [registro único de execução](docs/architecture/2026-11-10-mesa-guiada-execucao.md)):

- **Frente V (tema gelo):** V0 a V5A e a preparação da V6, atrás de `VITE_FORGELEX_PUBLIC_MODEL` e da flag do tema; produção
  continua no tema clássico. Aceite visual A19 dado por Boni em 17/11.
- **Frente U:** U1 e U3 fechadas em 19/11; U7 partes 1 a 4 (#196 e seguintes). Em 19/11, a **trava de produto** do
  `AGENTS.md` eliminou "Dados do caso" no gelo: `/app/casos` abre a Mesa e a exclusão definitiva vive dentro dela.
- **Estrutura do caso** (desenho em [docs/architecture/2026-11-19-estrutura-do-caso.md](docs/architecture/2026-11-19-estrutura-do-caso.md);
  fatias E1 a E4, que não se confundem com a Etapa E de estabilização do plano): aba Estrutura (#202), disparo automático
  pelo relato colado e antiduplicação (#203, #204), ajuste pela conversa no contrato v13 (#208), estrutura na redação e na
  orientação guiada no v14 (#209) e PDF direto com soma das análises e divisão em trechos no v15 (#210). Só exercitada
  com agente simulado.
- **Frente A:** prompts revisados e perfis por papel selecionáveis por `workflowVersion: 16` (perfil `1.17.0`, #205); o
  padrão comercial não mudou. Avaliação jurídica e execuções pagas de cache e schemas seguem com Boni.
- **Correções:** achados da revisão editorial sem repetição (#206); diagnóstico das três falhas intermitentes do
  `e2e-product` (19/11: `database is locked` corrigida, `matter-lifecycle.spec.ts:48` com teste corrigido, porta 55432
  mitigada com porta aleatória no job).
- **Documentação:** ativação editorial e execução comercial datadas (#207); roteiro do ensaio da chave inválida do provedor
  (#211, [roteiro](docs/operations/stabilization/2026-11-24-e3-ensaio-chave-provedor-roteiro.md)).
- **Conector MCP:** autorização OAuth consultada pela função `forgelex_api.oauth_grant` (#213, incidente acima).

Nenhuma flag nova foi ligada nesta publicação: gelo, Estrutura do caso com o modelo real e perfil `1.17.0` seguem como
pendências da 1A. Plano e ordem de retomada:
[seção 1A do plano unificado](docs/superpowers/plans/2026-11-11-forgelex-plano-unificado.md#1a-pendências-abertas-da-mais-antiga-para-a-mais-recente-25112026).

Seções anteriores a 16/11/2026 (publicações de 03/11 a 14/11, MCP no Claude, campanha v9, correções encerradas) estão em
[docs/historico/pendencias-ate-2026-11-16.md](docs/historico/pendencias-ate-2026-11-16.md).

## Publicação anterior — 16/11/2026: SHA `6fe4f75` (Daybreak, registro corrigido)

Boni autorizou commit, push e deploy. Os PRs #153–#158 (um por subsistema) e os de acompanhamento da revisão
(#159–#162, #164, #165) foram integrados em `main` (último: #165, SSE, em 15/11/2026 05:20 UTC; `main` em `bbda500`).
Junto entrou o #163 (`research memo` por apps conectados via OAuth, só dentro do MCP), que não é correção Daybreak. Em
16/11 entraram o #168 e o #169 (Codex, busca STJ). Checklist de deploy:
[docs/operations/daybreak/2026-11-16-deploy-checklist.md](docs/operations/daybreak/2026-11-16-deploy-checklist.md).

**O Daybreak está em produção.** Em 16/11/2026 (UTC): backup sob demanda às 13:14:40 (`1794834880818`, `SUCCESSFUL`); as
migrations `persistence-0042`, `persistence-0043` e `billing-ledger-0011-refund-recovery` aplicadas às 13:17:20–21 por um
Job temporário, que depois foi apagado (journal **54 → 57**; **nenhum dado afetado**: 0 entregas de webhook, 0 corpos de
resposta gravados, 0 pedidos de reembolso); `af13b1c` (inclui o #168) publicado das 15:11 às 15:13 e `6fe4f75` (inclui o
#169) das 18:13 às 18:15. A revisão era `forgelex-api-prod-6fe4f75-92e59198`, com 100% do tráfego e
`FORGELEX_SOURCE_SHA=6fe4f75…`. Registro completo, com horários e fontes:
[docs/operations/daybreak/2026-11-16-execucao-migrations-e-publicacao.md](docs/operations/daybreak/2026-11-16-execucao-migrations-e-publicacao.md).

**Correção deste registro.** Este bloco dizia que nada estava publicado, e isso era falso desde as 15:11 UTC. Os PRs #170 e
#171 também afirmaram que a contagem 54 → 57 do checklist estava errada; **era erro meu**, e o Job mostrou 54 → 57 (a lista
completa tem 57 IDs: persistência 43, a 0041, ledger 11 e análise 2). O checklist foi corrigido.

**Não verificado:** a verificação manual da seção 8 do checklist (feita por Boni, sem compra nem reembolso reais); quem
executou (as ações aparecem na conta do gcloud de Boni, sem distinguir humano de ferramenta); a saída do script de
publicação; o percentual de tráfego do serviço de encerramento. Compras e reembolsos reais e o encerramento dos achados no
Daybreak seguem fora da autorização.

**Busca STJ (#168 e #169, Codex), em produção desde `af13b1c` e `6fe4f75`.** Se a classificação por relevância estoura o
prazo, a busca devolve os julgamentos mais recentes com os mesmos filtros e `ordering=JUDGMENT_DATE_DESC`; termos de um
dígito deixam de ser descartados; o ranking tem 6 s quando o plano estima 10.000 candidatos ou mais; a minuta salva não pede
mais descarte de edição ao versionar. Sem migration. Conferido sobre `6fe4f75`: build, ESLint e Prettier do CI, suíte
completa (2.405 testes) e a busca em PostgreSQL 16 real (28 passaram, 1 pulado). Latência com o corpus de produção não
medida aqui. O pior caso do banco, 30 s de ranking mais 8 s da alternativa, cabe no limite de 45 s da ferramenta; se a
alternativa também estourar, a chamada falha, sem segunda alternativa.

**CI de `main` (push, conferida em 16/11/2026):** passou em `bbda500`, `d42337d`, `af13b1c`, `6fe4f75`, `17f05ac`, `5de4813`,
`4396713`, `a4cf69f`, `cc2250e` e `039f5eb`. O push do merge do #155 (`910ba13`, 15/11) falhou no `e2e-product`: o teste
`agentic-commercial-flow.spec.ts:328` recebeu `database is locked` ao escrever direto no SQLite enquanto o servidor segurava
a trava. A mesma árvore passou no CI do PR e os pushes seguintes passaram; **a causa (escrita do teste concorrendo com o
servidor) não foi corrigida**, e o sucesso posterior não a prova: a falha é intermitente.

**Segunda instabilidade (16/11/2026, #175).** No head `94b4b82` o `e2e-product` falhou em
`tests/e2e/matter-lifecycle.spec.ts:48` (campo "Texto do documento" desabilitado, `fill` estourou os 60 s); numa única nova
execução do job, sem mudança de código, passou. O diff não tocava interface e `main` estava verde. **Causa não encontrada**;
a repetição verde não a prova. Se reaparecer, investigar o `refresh` atrasado que o teste simula, sem repetir às cegas.

## Ferramentas de publicação e de migrations (16/11/2026, em `main`)

Duas ferramentas substituem trabalho que, no Daybreak, foi feito à mão. Ambas entraram em `main` pelos PRs
[#174](https://github.com/junior-aguiar-eng/ForgeLex/pull/174) (`cc2250e`) e
[#175](https://github.com/junior-aguiar-eng/ForgeLex/pull/175) (`039f5eb`), com a CI de `main` verde nos dois pushes. Uso e
armadilhas: `ops/gcp/production/README.md` (seções "Publicação em um comando" e "Migrations em produção").

- **Recibo de publicação (#174).** `deploy-from-main.ps1` grava `docs/operations/deploy-receipts/AAAA-MM-DD-HHMMZ-<sha7>-<resultado>.md`
  (SHA, build, digest, revisões antes e depois, flags lidas, motivo da falha, reversão). **Não commita**: Boni revisa e
  commita o arquivo junto com a aprovação. O recibo não prova migrations, verificação manual, autoria nem aprovação. Falhas
  antes do passo 7 não geram recibo.
- **Ferramenta de migrations (#175).** `apps/api/src/operations/migration-command.ts`, na imagem da API, com `inspect`,
  `apply --allow=<id>` e `verify`; `migrate-production.ps1` cria, executa e apaga o Job temporário. `apply` só roda com todas
  as faltantes autorizadas, sem ID desconhecido no journal, no banco e host esperados e com backup `SUCCESSFUL` de menos de
  120 min; o Job não tenta de novo sozinho. A imagem do Job vem do `build-from-main.ps1`, não de um `-NoTraffic` com migration
  pendente (a revisão nova recusa subir com `MIGRATIONS_PENDING`).

**Não verificado (vale ler antes do primeiro uso real).** Não havia `pwsh` onde foram escritos; a parte PowerShell só foi
exercitada pela CI. O `gcloud` em si **nunca foi exercitado**: criar, executar e apagar o Job, o formato real de
`sql backups list` e de `logging read`, e a gravação do primeiro recibo numa publicação de verdade. Antes de depender deles:
`deploy-from-main.ps1 -DryRun`; `migrate-production.ps1 -Mode inspect -DryRun` e depois `-Mode inspect`, lendo a saída antes
de qualquer `apply`. As ferramentas não autorizam por si publicar, aplicar migration ou ligar flag: isso continua sendo
decisão e execução de Boni.

## Pendências humanas e externas

| Pendência                                      | Dependência para encerrar                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Ensaios residuais da coleção MCP~~ | **Encerrada como desnecessária por decisão de Boni de 27/11/2026** (regra do mínimo); os testes automatizados ficam como evidência. [Recorte de 12/10](docs/operations/stabilization/2026-10-12-mcp-live-validation.md) |
| Comprovações operacionais                      | Executar, avaliar e aprovar o ensaio pelo próprio Boni; ausência de segundo revisor não constitui pendência nem bloqueio                                                                                                                                                                                                                                                                                                                                         |
| Execução fiscal, contratos e provas comerciais | Preparação FISCAL-2026-10-10.v1 aprovada por Boni em 10/10. Restam situação/classificação municipal, conciliação dos R$ 25 e contratos efetivos; prova de venda real depende de evento real, ainda inexistente segundo Boni                                                                                                                                                                                                                                      |
| ~~Braces upstream~~ | **Encerrada por decisão de Boni de 27/11/2026**: advisory retirado pelo upstream em 23/10; patch, testes e gate de audit preservados (reconferência de 27/11 abaixo). [Conferência de 24/10](docs/operations/stabilization/2026-10-24-security-dependencies.md) |
| ~~Lacuna oficial STJ~~ | **Encerrada como pendência por decisão de Boni de 27/11/2026**: depende só da fonte; a lacuna explícita e o skip continuam no código, e o recurso segue inalterado em 27/11 (abaixo) |

Braces/STJ foram [reavaliados em 10/10](docs/operations/stabilization/2026-10-10-external-pending-review.md):
51 testes dos controles existentes aprovados, audit de produção sem alertas,
audit completo então com somente braces mitigado e fonte STJ inalterada.
Em 24/10, a consulta confirmou a retirada do advisory de braces pelo upstream;
patch, testes e gate de audit permanecem preservados. A lacuna STJ conserva a
última evidência de 10/10, sem nova ingestão ou revalidação nesta entrega.

Reconferência de 27/11/2026: o registry continua em braces 3.0.3 (sem versão
nova) e o `pnpm audit` não acusa braces. O audit acusou outro alerta, baixo:
`fast-xml-parser` 5.11.1 (GHSA-474x-hrwr-fgx4, CPU quadrática), dependência do
`@google-cloud/storage` 8.2.0; o lockfile passou a resolver 5.12.1, dentro da
faixa `^5.3.4` declarada, e o audit ficou sem alertas. O recurso STJ
`20240229.json` foi baixado de novo (HTTP 200, 599 bytes) com o mesmo SHA-256
`ea2537c3…7da9b46`: a lacuna segue inalterada na fonte.

A ordem recomendada e os critérios de encerramento estão no
[roteiro de comprovações](docs/operations/stabilization/2026-10-10-human-external-pending-priority.md).
A consulta externa tem [recibo próprio](docs/operations/stabilization/2026-10-10-human-external-pending-proof.json).
Boni definiu em 10/10 que nenhuma atividade do projeto depende de avaliação
ou aprovação de outra pessoa. A exigência interna de segundo revisor foi
revogada; avaliações operacionais, jurídicas, fiscais, contratuais e de
segurança cabem exclusivamente a ele, conforme [AGENTS.md](AGENTS.md).
Evidências ainda ausentes continuam pendentes de obtenção/avaliação por Boni,
sem parecer externo obrigatório.

A análise fiscal e a proposta `FISCAL-2026-10-10.v1` estão
[aprovadas por Boni no escopo descrito](docs/operations/stabilization/2026-10-10-fiscal-decision.md).
Autoria, propriedade, exploração direta e ausência de empregados confirmadas;
sem registro empresarial/MEI declarado. Inscrição municipal de autônomo não
foi confirmada. Preparação fiscal aprovada em 10/10 não equivale a
cadastro/apuração concluídos. A cobrança controlada real de R$ 25 será
conciliada separadamente das receitas de clientes, ainda inexistentes segundo Boni.

## Manutenção contínua

Acompanhar falhas de CI, ingestão e limpeza diária, exceções, contagens e
backups. A ingestão de 09/10 concluiu sem pendentes/falhos; a cadência de
execução não comprova frescor integral. O corpus observado contém 874.450
documentos e 874.516 versões. Consultas amplas continuam custosas; revisar
latência sob uso representativo se surgir regressão ou requisito de desempenho.
No próximo deploy HTTP, incluir conferência de uma aba previamente aberta;
o ensaio real durante promoção não foi demonstrado nesta entrega de índice.

A automação diária às 15h consulta main e recibos em modo somente leitura;
avisa mudanças acionáveis, não executa jobs --apply, operações faturáveis ou
mutações. Esse acompanhamento é manutenção, não entrega de código atrasada.

Mesa do caso, novos agentes internos, OCR e novos tribunais são evolução
futura, fora das correções. A arquitetura continua MCP/IA externa, com
permissões e conferência humana.

Referências:
[encerramento técnico e recibo](docs/operations/stabilization/2026-10-09-technical-pending-closure.md),
[retenção e mitigação](docs/operations/stabilization/2026-10-09-audit-residual-closure.md),
[remediação publicada](docs/operations/stabilization/2026-10-07-audit-remediation-publication.md),
[provas humanas](docs/operations/stabilization/2026-10-07-operational-proof-checklist.md),
[dependências](docs/operations/stabilization/2026-10-07-build-dependencies.md).
