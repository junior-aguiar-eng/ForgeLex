# Fonte histórica oficial do STJ

## Fonte escolhida

O corpus inicial do ForgeLex será definido como os “Espelhos de acórdãos” publicados pelo Portal de Dados Abertos do STJ. A fonte é oficial, enumerável e organizada em dez conjuntos: Corte Especial, Primeira, Segunda e Terceira Seções, e Primeira a Sexta Turmas.

Cada conjunto informa que o arquivo mais antigo contém o histórico acumulado até a data de extração e que os arquivos posteriores contêm as atualizações posteriores ao arquivo anterior. O próprio STJ alerta que um mesmo acórdão pode aparecer em mais de um arquivo e que o identificador do acórdão deve ser usado para deduplicação.

O catálogo é acessado pela API CKAN oficial:

`https://dadosabertos.web.stj.jus.br/api/3/action/package_show?id=<dataset>`

O conjunto de “Íntegras de Decisões Terminativas e Acórdãos do Diário da Justiça” também é oficial e enumerável, mas possui escopo próprio: contém apenas decisões terminativas indicadas pelos gabinetes e determinados acórdãos. Ele não será tratado como se fosse todo o corpus jurisprudencial do STJ.

## Critério de cobertura do ForgeLex

“Cobertura histórica do STJ” nesta fase significa cobertura do corpus definido acima, não uma afirmação de que o ForgeLex já reproduz toda a base interna do STJ.

Uma carga só pode ser promovida quando o manifesto persistido registrar, para cada um dos dez datasets:

- dataset, recurso, URL oficial, data de extração, papel do recurso (`HISTORICAL_SNAPSHOT` ou `INCREMENTAL`), hash do arquivo e quantidade de registros;
- o intervalo temporal coberto e a sequência de recursos esperada;
- lacunas de extração, recursos sem URL, recursos duplicados e registros sem identificador oficial;
- quantidade bruta, quantidade deduplicada por identificador oficial e quantidade efetivamente publicada no ForgeLex;
- repetição da mesma carga sem novas versões e alteração de versão quando o conteúdo ou metadado oficial mudar.

O primeiro recurso histórico de cada dataset deve ser importado antes dos incrementais. A ordem não pode ser inferida apenas pelo nome do arquivo: deve ser registrada no manifesto e validada contra a metadata da API CKAN. Registros repetidos entre snapshot e incrementais são esperados e não podem gerar documentos ou versões duplicados.

## Estado desta fase

A enumeração atual da API oficial confirmou 10 datasets, 530 recursos
classificáveis — 10 snapshots históricos e 520 incrementais — e 12 recursos
não classificáveis, sem dataset sem snapshot. A Fase 1 foi concluída localmente
para esse corpus oficial definido; isso não afirma que o ForgeLex reproduz a
base interna integral do STJ.

O provider `provider_stj_open_data`, o parser cross-platform com `fflate`, o
manifesto e o staging foram implementados localmente. A migration incremental
`persistence-0014-stj-source-manifest` cria os manifestos e o staging sem
alterar migrations anteriores. As migrations incrementais 0015 e 0016
substituem a antiga tabela relacional de termos por FTS5 no SQLite e
`tsvector`/GIN no PostgreSQL, com pesos distintos para identidade processual,
autoridade e conteúdo. O staging é removido após conclusão transacional e
preservado quando a carga falha. Nenhuma migration remota foi executada.

A reconciliação local registra dez snapshots concluídos, 519 incrementais
concluídos e uma única lacuna oficial terminal. O corpus tem 874.450 documentos
e 874.516 versões, sem documentos duplicados por `dedupe_key`, versões repetidas
por hash ou ponteiros de versão atual quebrados. A repetição idempotente foi
validada em fixture local com manifesto concluído, recurso não classificável e
lacuna terminal, sem novo download do recurso malformado ou criação de novas
versões.

### Lacuna oficial registrada

O incremental `20240229.json` da Segunda Seção foi novamente obtido da URL
oficial em 2026-09-20. O SHA-256 permaneceu
`ea2537c36c1e11d5206f7cee7b82178fc455cb8832cd7110a1acc807b7da9b46` e os
599 bytes recebidos terminam com uma chave de fechamento adicional na linha 24,
coluna 1. O arquivo anuncia “Sem lançamentos para o mês de fevereiro/2024”,
mas não é JSON válido. O manifesto `dddb5398-79d4-45bc-9f08-662d6d98a4ef`
permanece `FAILED`, com zero registros publicados e a evidência de origem
registrada. O ForgeLex não corrige nem publica silenciosamente esse conteúdo.
O job reconhece essa lacuna terminal pelo `resource_id` e pelo manifesto com
hash documentado antes de chamar o provider; uma repetição não baixa novamente
esse recurso enquanto a exceção permanecer registrada.
