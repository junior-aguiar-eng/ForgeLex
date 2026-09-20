# Normalização do corpus jurisprudencial persistido

## Objetivo

Eliminar a duplicação do conteúdo jurídico e da proveniência entre
`jurisprudence_documents` e `jurisprudence_document_versions`, sem reduzir a
qualidade da busca, perder a versão corrente ou enfraquecer a auditabilidade.

## Estado comprovado

A primeira carga histórica integral do STJ publicou 874.450 documentos e
874.516 versões. A medição local mostrou 4,65 GB em `jurisprudence_documents`
e 3,31 GB em `jurisprudence_document_versions`. Para a grande maioria dos
documentos, a versão 1 é uma cópia do conteúdo corrente.

## Modelo alvo

`jurisprudence_document_versions` é o registro imutável canônico de cada
conteúdo recebido: campos jurídicos, URL oficial, hash, status de verificação,
proveniência e execução de ingestão.

`jurisprudence_documents` passa a conter somente identidade estável, tribunal,
número normalizado do processo, chave de deduplicação, datas de primeiro e
último avistamento, `current_version_id`, status operacional e projeções de
busca. O texto jurídico bruto e a proveniência não podem permanecer nessa
tabela.

No PostgreSQL, a busca usa uma projeção `tsvector` ponderada no documento
corrente; no SQLite, mantém a projeção FTS5. A resposta REST/MCP encontra o
documento pelo índice e monta o resultado a partir da versão apontada por
`current_version_id`.

## Migração local e recuperação de espaço

Uma migration incremental preserva as migrations já existentes e transforma o
contrato de persistência. A migração preenche as projeções de busca a partir da
versão corrente e mantém os ponteiros existentes. No banco local de validação,
uma rotina explícita reconstrói a relação compacta e seus índices para devolver
ao sistema operacional o espaço que `DROP COLUMN` não libera no PostgreSQL.

Não haverá nova aquisição, download ou parse do STJ para essa normalização: a
base carregada será a origem da migração.

## Invariantes

- todo documento possui exatamente uma versão apontada por `current_version_id`;
- a versão corrente pertence ao documento e possui o mesmo `content_hash`;
- documentos e versões históricos continuam vinculados a uma ingestão;
- busca por palavra, frase, acento, identidade, autoridade, processo e data
  preserva resultados e ranking relevantes;
- REST e MCP continuam consultando o mesmo data plane;
- versões novas só são inseridas quando o hash jurídico mudar.

## Testes e validação

Antes do código, testes devem demonstrar a montagem do resultado pelo conteúdo
da versão corrente, a criação de nova versão e a ausência de conteúdo bruto no
registro corrente. Após a migration local, verificações SQL integrais contam
documentos, versões, ponteiros, hashes e órfãos; isso não rebaixa nem baixa o
corpus novamente.

## Fora de escopo

Não altera ferramentas jurídicas, billing, API/MCP, tribunais habilitados,
conteúdo jurídico, fonte STJ, migrations remotas, deploy, commit ou push.
