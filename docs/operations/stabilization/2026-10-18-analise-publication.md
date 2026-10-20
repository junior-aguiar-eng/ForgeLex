# Publicação da camada analítica

Operações executadas em 18/10/2026, com inspeção final e limpeza retomadas em
20/10/2026. Horários deste registro em UTC. Boni autorizou expressamente
confirmar backup, aplicar migrations e publicar, exigindo validação da candidata
antes da promoção, preservação local e evidências.

## Código e build

- [PR #75](https://github.com/junior-aguiar-eng/ForgeLex/pull/75), integrada em
  `cabf504040833ffd1af3f134761b0cb9f6eb6e32`. Seis jobs aprovados na PR
  (run `39151643618`) e em main (run `39152216618`), incluindo PostgreSQL 16.
- Validação local da preparação: 923 testes aprovados, 18 ignorados; build,
  lint, tipos, dez testes PostgreSQL de cobrança/interrupção e smoke de
  migration/expurgo aprovados. Não foram repetidos durante a retomada operacional.
- Build canônico a partir de main limpo, sem incluir alterações do checkout
  original. Cloud Build `63bd9baf-2c4b-4734-81b6-e4a4f7506572`, SUCCESS,
  concluído em 18/10 às 18:20:00.947Z.
- Imagem imutável:
  `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:c9d7e344f8db9d326f4348902ce033c9f774d7c2ca58702ede36f63b6c85202c`.

## Backup e migrations

Projeto `project-bbbe1209-c295-4720-867`, região `southamerica-east1`.
O banco produtivo é `forgelex`, na instância `forgelex-hml-pg` (nome histórico),
PostgreSQL 16.15. O backup manual `1792347340554`, ON_DEMAND, terminou com
SUCCESSFUL em 18/10 às 18:17:52.327Z, antes de qualquer DDL desta entrega.
O status do backup foi confirmado; não foi realizado ensaio de restauração.

Aplicadas explicitamente `analise-0001-initial` e
`analise-0002-operation-idempotency`, entre 18:21:46.709Z e 18:21:47.922Z.
As definições canônicas exportadas pelo módulo foram executadas com journal e
transação por migration, advisory lock `731202604`, `lock_timeout=3s` e
`statement_timeout=120s`. Hash das definições:
`699f3af61ff720c46881a14070ffdc6c7126f1438ca8ab3de944191f23007dce`.

Conferência imediata: 38 → 40 migrations, nenhuma pendente, cinco tabelas
analíticas vazias. Nova inspeção somente leitura em 20/10 confirmou as 40
migrations e zero linhas nessas tabelas. A retomada não repetiu DDL ou deploy.
`FORGELEX_AUTO_MIGRATE=false` mantém o startup em modo de verificação.

## Candidata, ensaios e promoção

Revisão inicial `forgelex-api-prod-analise-cabf504-candidate`, sem tráfego
principal e com billing global desligado. A revisão comercial
`forgelex-api-prod-analise-cabf504`, com a mesma imagem e billing habilitado,
também foi validada antes de receber tráfego principal. Ambas mantiveram as
15 referências a secrets, service account, Cloud SQL e demais configurações
públicas anteriores, exceto os quatro controles previstos: análise,
auto-migrate, billing e source SHA.

O ingresso continuou `internal-and-cloud-load-balancing`. Uma rota temporária
no balanceador existente encaminhou somente o prefixo de candidata para a tag
de teste. Nenhuma abertura do ingresso público direto foi necessária.

Cada ensaio bem-sucedido passou por 13 checks HTTP/RPC autenticados:
readiness com oito verificações verdadeiras, initialize, catálogo com 20 tools
(seis analíticas públicas), status gratuito, análise avulsa, replay, negação de
acesso entre tenants, combo, replay do combo e duas chamadas cobertas.
O verificador interno não apareceu no catálogo público.

Cada tenant proprietário sintético consumiu 458 centavos promocionais
(87 avulsa + 371 combo); replays e chamadas cobertas custaram zero. O outro
tenant conservou seus 2.000 centavos promocionais e todas as operações do
ensaio terminaram em COMPLETED. Não houve dinheiro real cobrado.

As duas tentativas anteriores não foram tratadas como aprovação: a primeira
atingiu a revisão antiga durante propagação da rota; a segunda enviou argumento
inválido a `forgelex.connection_status`, que aceita `{}`. Foram corrigidos o
procedimento e a sonda, sem mudança no produto. As fixtures de todas as
tentativas passaram por expurgo de conteúdo privado, remoção de chaves e
desabilitação dos perfis/tenants; recibos financeiros sintéticos foram mantidos.

A chamada comercial de trace `c3ce843656f940a1803d961c941bd29c` foi confirmada
na revisão correta com HTTP 200 antes da promoção. A promoção para 100% ocorreu
em 18/10 às 18:45:23.867Z, após os gates. Foi direta para evitar prolongar a
convivência de catálogos MCP diferentes durante a adição de nomes de tools.

## Worker privado compatível

O worker anterior não incluía as tabelas analíticas em seu expurgo. Antes da
promoção pública, o serviço existente `forgelex-closure-hml-private` recebeu
a revisão `forgelex-closure-hml-private-analise-cabf504`, na mesma imagem.
Foi promovido em 18/10 às 18:44:06.676Z, após readiness autenticada e negação
de acesso anônimo (403).

A service account do worker mudou de `forgelex-hml-runtime` para a conta
existente `forgelex-api-prod`, que já possuía os acessos necessários. Foram
adicionadas as configurações do journal de expurgo exigidas pelo novo startup
e três referências a secrets existentes. Nenhuma política IAM foi ampliada.
Análise e billing permaneceram desligados nesse serviço privado.

Scheduler `forgelex-hml-closure-reconcile`, URI e audience foram preservados;
o worker de background continuou desligado. Não foi disparada reconciliação
manual, retenção ou exclusão de conta real. Em 20/10, três requisições da
cadência regular do Scheduler retornaram 200 na nova revisão, às 18:01, 18:02
e 18:03 UTC. A inspeção do banco encontrou apenas sete encerramentos COMPLETED.

## Conferência final e evidência

Em 20/10, a revisão pública e o worker privado continuavam com 100% do tráfego.
Configuração pública conferida sem divergências imprevistas. Seis probes públicos
passaram: readiness, HTML, JS, CSS, metadados OAuth e coleção sem autenticação
(401 esperado). Assets idênticos aos da candidata:

| Asset | Bytes | SHA-256 dos bytes |
| --- | ---: | --- |
| `index-DpAMTjUp.js` | 468263 | `41903fa7bbfc6ab63504e045de74d038ea429185fb6db392b55570a38d0d6d4c` |
| `index-BcMysa4n.css` | 41052 | `4ab3cb530fbc83f61e765579c3a99635c5d9e599b1af8b0e35fedfed2876dcc2` |

A consulta de Cloud Logging nas duas novas revisões, desde a validação comercial
até 20/10 às 18:03:56Z, não retornou eventos de severidade ERROR ou superior
(limite de retorno 20). Isso delimita a consulta e não demonstra ausência
universal de falhas ou qualidade sob carga.

A remoção dos recursos temporários, a parada do proxy local e a comparação
dos arquivos locais estão detalhadas no
[recibo estruturado](2026-10-18-analise-publication-proof.json).
Em 20/10 às 18:06:31Z, foram confirmadas a ausência da regra, do backend,
do NEG e da tag temporários, com backend padrão e tráfego produtivo preservados.
Os seis probes públicos passaram novamente após a limpeza. O listener local
do proxy também foi conferido como ausente.
O checkout original permanece na branch `codex/case-flow-simplification`,
HEAD `101ee331fc621ebf38fd536a549c38b0f9340d12`. A retomada usa uma nova
baseline de 47 arquivos, comparada antes/depois da limpeza; essa comparação
não pretende reconstruir hashes perdidos entre as sessões de 18 e 20/10.
Os registros documentais foram preparados em worktree e branch próprios.

## Limites e recuperação

Os ensaios usaram API keys e documentos fictícios. Não homologam a camada
analítica dentro dos hosts ChatGPT/Claude, autenticação OAuth desses hosts,
qualidade jurídica, escala, compras reais ou encerramento integral de conta
real. Aprovações humanas permanecem atribuídas exclusivamente a Boni.

Operações interrompidas continuam bloqueadas até decisão específica de Boni,
conforme o [runbook de reconciliação](../analise-reconciliation.md); não há
reparo automático de saldo/direitos nem retomada automática.

Em incidente, conter por controles em imagem compatível com as novas tabelas,
preservando journal e dados. Reverter para imagem anterior sem o novo expurgo
pode deixar dados analíticos fora do encerramento; não é rollback completo.
Não foram revertidas migrations, restaurados backups ou executados reparos.

## Complemento da entrega Git — 20/10/2026

Na CI inicial da PR documental, `pnpm audit --prod --audit-level moderate`
reprovou o Hono transitivo `4.13.8` por `GHSA-5r4p-p66f-jhc7` (decodificação
duplicada em `serveStatic`). Boni autorizou atualizar essa dependência na mesma
PR. O override direcionado e o lockfile passaram a resolver Hono `4.13.11`;
o audit de produção local passou sem vulnerabilidades conhecidas.
Instalação com lockfile congelado, build e suíte geral local aprovados:
923 testes passaram, 18 foram ignorados (sem novos skips); o gate de segurança
teve 30 testes aprovados. Audit completo sem alertas acionáveis novos,
conservando somente o alerta de `braces` coberto pela mitigação existente.
Esse complemento altera a resolução de dependências para builds futuros.
A imagem produtiva e o recibo operacional anterior não foram substituídos;
não houve novo deploy ou migration nesta entrega Git.
