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

A descoberta local da API foi executada e encontrou 10 datasets, 530 recursos enumeráveis, 10 snapshots históricos e 12 recursos não classificáveis, sem dataset sem snapshot. A Fase 1 somente será marcada como concluída depois da importação do snapshot histórico e dos incrementais disponíveis, reconciliação das contagens, registro das lacunas do conteúdo e verificação de repetição idempotente. Até lá, o runtime pode pesquisar o corpus próprio já ingerido, mas não deve anunciar cobertura histórica integral do STJ.
