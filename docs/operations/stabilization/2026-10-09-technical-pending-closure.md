# Encerramento técnico — 09/10/2026

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

Este registro ainda não declara ganho produtivo ou aplicação concluída.
Os resultados finais serão acrescentados após a execução dos gates.

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
