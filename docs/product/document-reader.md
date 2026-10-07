# Leitura de documentos e fontes dos rascunhos

Implementação de 07/10/2026, branch `codex/document-reader`, baseada em
`a5543239b0fb26c9ce10ac0e82276a2762525fc5` de `main`. Checkout isolado:
`C:/Users/Boni Jr/.codex/worktrees/document-reader/SDK`.

Integrada pela PR #54 em `0dc9ec5` e publicada na revisão
`forgelex-api-prod-reader-0dc9ec5`, com 100% do tráfego. Evidências no
[registro operacional](../operations/stabilization/2026-10-07-document-reader-publication.md).

## Experiência

Em **Casos → Documentos**, a ação **Abrir documento** apresenta o texto integral
salvo, nome do arquivo, versão e data. O painel permite buscar ocorrências,
navegar entre elas e ir diretamente a um parágrafo. Mostra texto, inclusive o
texto extraído de PDFs na importação existente; não renderiza o PDF original.

Em **Rascunhos → Fontes do rascunho**, cada referência documental da versão
salva informa a seção correspondente e oferece **Conferir fonte**. O painel
abre a versão efetivamente citada e destaca a âncora quando existe. **Ver ponto**
na conferência de uma referência documental abre esse mesmo leitor completo.
Título, texto e citações em edição permanecem nos estados existentes do editor.
Abrir uma fonte não salva uma versão nem registra aprovação ou conferência humana.

O painel tem fechamento por botão e Escape, devolução do foco ao controle que
o abriu, contenção de foco pelo diálogo nativo e controles adaptados ao celular.
A busca é literal, ignora maiúsculas/minúsculas e informa quando exibe apenas as
primeiras 1.000 ocorrências para limitar a renderização de termos muito frequentes.

## Contratos reutilizados

Não há novos endpoints, migrations, permissões ou capacidades MCP. O componente
compartilhado `DocumentReaderDialog` usa a sessão/credencial existente:

- Documento em Casos: resolve o ID da versão atual no GET de documento e lê
  esse ID no GET de versão específica, que já retorna `version.content`.
- Fonte no rascunho: usa diretamente `reference.documentVersionId` e `anchorId`.
  Não consulta a versão atual nem a usa como substituição se a citada faltar.
- O texto é renderizado como texto React, sem interpretação de HTML. As âncoras
  posicionam parágrafos usando offsets; espaços e quebras do conteúdo salvo
  continuam preservados. Âncoras inválidas não escondem nem duplicam conteúdo.

As leituras usam `cache: no-store`. A versão específica já tem resposta
`Cache-Control: no-store` na API. O leitor mantém conteúdo apenas em seu estado
volátil. Trocar a identidade da fonte remonta o painel; fechar aborta a leitura
e respostas tardias são ignoradas. O leitor não altera estados do editor.

## Disponibilidade

O acesso do site continua condicionado às regras existentes de tenant, caso e
sessão. Documentos arquivados e na lixeira podem ser lidos pelo acesso web
retido, com seu estado indicado no cabeçalho. Isso não restaura o documento nem
autoriza seu uso pela IA. A exclusão definitiva gera indisponibilidade; o leitor
não apresenta texto de uma abertura anterior nem tenta outra versão. Falhas de
conexão têm mensagem própria e opção de tentar novamente. A falta de uma âncora
na versão carregada é indicada sem substituir o trecho por outro parágrafo.

## Validação e limites

Os testes de navegador usam API real local, autenticação sintética, SQLite
descartável e journal sintético. A referência do rascunho é recebida pelo MCP
local existente, sem chamadas a provedores externos. O teste de fixação intercepta
a leitura da versão atual para simular uma versão posterior e comprova zero
consultas a esse endpoint, além de zero escritas ao abrir e fechar fontes.

Cobertura nova: sete testes unitários de integridade do texto/busca e quatro
E2E de leitura, busca, parágrafos, Escape/foco, acessibilidade, celular,
arquivo/lixeira/exclusão, resposta tardia, repetição após falha e fonte fixada
com edição do rascunho preservada. As duas entradas de UI foram verificadas
como ausentes antes da implementação, com testes falhando nesses controles.

O registro consolidado de comandos e regressões está em `STATUS_VALIDACAO.md`.
O percurso real no Claude confirmou leitura autorizada e recebimento de texto
sintético. Na nova interface, leitura da versão citada, busca, Escape, preservação
da edição e salvamento da versão 2 com referências conservadas foram confirmados.
O DOCX real indicado pelo usuário foi inspecionado por ZIP/XML: versão 2,
edição salva, duas seções e seis referências à versão documental 1, com revisão
humana pendente. Não houve avaliação visual de paginação no Word. Após revogar
as permissões sintéticas, nova leitura pelo Claude recebeu
`CASE_CONTEXT_NOT_AUTHORIZED`. Não houve ensaio do leitor no ChatGPT nesta rodada.
