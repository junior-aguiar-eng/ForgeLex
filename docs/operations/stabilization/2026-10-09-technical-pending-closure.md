# Encerramento técnico — 09/10/2026

> Governança vigente desde 10/10/2026: Boni é o único avaliador e aprovador humano.
> Exigências anteriores de segundo revisor, revisão independente obrigatória ou
> parecer externo são históricas e foram revogadas por sua decisão expressa.
> Registros de avaliações já realizadas permanecem evidências do seu período.
> Ver [AGENTS.md](../../../AGENTS.md).

Pedido: resolver as correções necessárias que possam ser executadas sem nova
atuação de Boni. Base de revisão `c10016c`, branch
`codex/technical-pending-closure`. Este registro distingue diagnóstico,
implementação e aplicação no ambiente publicado.

## Estado revalidado

Main `c10016c` possui os seis checks aprovados na execução `37993435693`.
Runtime `forgelex-api-prod-audit-5aca51e`, código `5aca51e`, continua com 100%
do tráfego. Não houve erro HTTP >= 500 nem log severity ERROR no recorte de
um dia consultado; isso não demonstra ausência universal de incidentes.
Retenção diária autorizada está ativa; as duas execuções registradas aplicaram
zero remoções. Ingestão STJ de 09/10 terminou com sucesso. Os 12 backups
listados estão concluídos; o backup automatizado mais recente terminou às
04:31:55 UTC de 09/10.

Corpus às 22:39:27 UTC: 874.450 documentos, 874.516 versões e 544 manifests.
Nenhum manifest pendente, falho ou pendente antigo; uma lacuna terminal
registrada por JSON oficial malformado. A última execução bem-sucedida foi às
12:03:31 UTC de 09/10. Essa cadência não comprova atualização integral da fonte:
o último manifest bem-sucedido é de 20/09. Não há promessa de cobertura universal.

## Defeito demonstrado e correção

A consulta ampla `juros OR capitalizados`, STJ, limite 3, retornou em
17.519,98 ms numa amostra e ultrapassou o limite de diagnóstico de 40 s em
outra. O EXPLAIN ANALYZE com TIMING OFF terminou em 16.932,532 ms.
Foram classificados 33.759 candidatos. A ordenação já usa projeção compacta
(largura 100, memória de sort 25 kB), mas a seleção de metadados efetuou
33.759 acessos pela chave primária de versões, com 46.438 blocos lidos.

O experimento somente dentro da transação com work_mem de 16 MB terminou em
19.011,043 ms: removeu escrita temporária, mas não demonstrou ganho de latência.
Não se alterou memória global nem capacidade/custo da instância.

A migration PostgreSQL `persistence-0029-jurisprudence-search-metadata-index`
adiciona `jurisprudence_versions_search_metadata_idx`, chave `id`, incluindo
`judgment_date`, `publication_status` e `source_manifest_id`. Não inclui texto
integral/proveniência nem altera consulta, ranking, filtros, API ou cobrança.
O índice permite obter metadados sem consultar o heap quando as páginas estão
marcadas como visíveis para todas as transações. Esse benefício depende do
plano efetivo e deve ser medido no ambiente publicado.
[Fundamento técnico PostgreSQL](https://www.postgresql.org/docs/16/indexes-index-only-scans.html).

## Validação e aplicação

O teste de integração falhou antes da migration: esperado Index Only Scan,
obtido Index Scan. Depois, os 25 testes específicos passaram, incluindo
ranking, termos/frases, filtros e exclusão de versão STAGED. O teste comprova
Index Only Scan com zero Heap Fetches na consulta isolada dos metadados em
PostgreSQL descartável; não exige esse plano para toda busca. O VACUUM
usado para esse teste nunca foi executado no banco publicado.

Validação local completa: build e 794 unitários aprovados, 17 condicionais
ignorados. Ensaio PostgreSQL ampliado para 33.759 candidatos: 25 testes
aprovados, sem alteração das regras de pesquisa. Lint e typecheck aprovados.
Revisão independente sem Critical/Important. Observação menor: a assertion
nova cobre os metadados isolados, enquanto a busca completa tem regressões
de semântica/ordenação e exige confirmação de plano na aplicação produtiva.

A aplicação produtiva está condicionada à revisão independente e aos seis
checks da PR, seguidos de integração. Antes da DDL: confirmar backup concluído,
ausência de ingestão ativa e que apenas a migration 0029 falta entre as
migrations registradas. Usar transação com lock_timeout de 3 s, statement_timeout
de 120 s e registro da migration atômico. CREATE INDEX comum bloqueia escritas
na tabela durante sua construção; leituras continuam disponíveis. Não executar
o migrador geral caso apareça outra migration pendente. Depois: verificar
definição/validade do índice e repetir a consulta/EXPLAIN com os mesmos parâmetros.
Não é necessário novo deploy HTTP para o PostgreSQL aproveitar esse índice.

A transação de aplicação deve adquirir o mesmo advisory lock `731202604`
usado pela ingestão STJ em modo single-flight. Se a ingestão estiver ativa,
a operação aborta; enquanto a DDL estiver ativa, outra ingestão não inicia.

## Resultado publicado

PR [#61](https://github.com/junior-aguiar-eng/ForgeLex/pull/61), código
`720e23c`, integrada em `86156a0` às 23:08:24 UTC. Os seis checks da CI
`38002383045` passaram: 794 unitários, 17 condicionais ignorados, 130 E2E e
25 testes específicos de pesquisa PostgreSQL. Revisão independente sem
Critical/Important; a observação menor sobre cobertura do teste foi explicitada.

Migration aplicada de 23:08:49 a 23:09:04 UTC, mantendo o bloqueio exclusivo
da ingestão. DDL e journal concluídos na mesma transação. Índice válido e
pronto, 91.529.216 bytes; inspeção posterior sem migrations pendentes.
PostgreSQL 16.15, work_mem 4 MB. Não houve VACUUM produtivo, alteração de
capacidade, memória global ou deploy HTTP.

Comparação da mesma instrução e parâmetros no corpus real:

| Medida | Antes | Depois |
| --- | --- | --- |
| Amostra SQL de referência | 20.268,05 ms | 16.521,16 / 13.281,82 / 13.820,25 ms |
| EXPLAIN ANALYZE, TIMING OFF | 16.932,532 ms | 13.422,751 ms |
| Blocos lidos no plano completo | 103.446 | 68.470 |
| Seleção de metadados de versões | 33.759 Index Scans pela PK | Index Only Scan paralelo pelo índice novo |
| Acessos ao heap nesse Index Only Scan | Não se aplica ao caminho anterior | 0 |

O hash do conteúdo e da ordem dos três resultados foi idêntico nas quatro
amostras SQL. A seleção de metadados agora varre o índice em paralelo para
o hash join; não se afirma que lê somente as 33.759 versões candidatas.
A hidratação final continua acessando os três documentos/versões completos.
Consultas pelo repositório após aplicação: termos com AND implícito em
1.715,99 ms e frase exata em 480,42 ms, três resultados em cada uma.

São fotografias limitadas, sem controle comparativo de cache frio. A consulta
ampla continua levando segundos; a evidência encerra a correção desse acesso
ao heap e a medição pendente, sem garantir p95 ou estabilidade sob carga.
Readiness e shell HTML de `/app/casos` retornaram 200 após aplicação.
Runtime e tráfego permanecem `forgelex-api-prod-audit-5aca51e`, 100%.
O checkout canônico de main foi atualizado após integração.

A lacuna da fonte foi reconferida às 23:04:35 UTC: resposta HTTP 206 com
prefixo de 599 bytes; fechamento não pareado na posição 592, linha 24, do
recurso oficial `20240229.json`. Não foi modificado o corpus nem incorporado
conteúdo parcial. A correção desse arquivo depende da fonte externa.

[Recibo agregado, sem dados de conta ou segredos](2026-10-09-technical-pending-closure-proof.json).

## Limites que permanecem

Braces 3.0.3 continua sem versão upstream corrigida; a mitigação local e o
audit completo já estão entregues, com revisão da exceção antes de 08/11/2026
UTC. O alerta não foi descartado. Comprovações fiscais, contratos/transferências,
ensaios humanos e provas comerciais continuam dependentes do responsável.
Ações que exigem segundo revisor continuam bloqueadas enquanto Boni opera
sozinho. Monitoramento ordinário é manutenção, não implementação atrasada.
Mesa, novos agentes, OCR e novos tribunais permanecem evolução futura.

As medidas do banco são amostras sequenciais limitadas: não representam
latência HTTP/MCP, p95 global, cache frio ou carga concorrente. Nenhum dado de
conta, saldo, débito ou permissão foi alterado pelo diagnóstico.
