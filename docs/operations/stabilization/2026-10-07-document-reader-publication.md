# Leitor de documentos — integração, publicação e percurso real

Registro de 07/10/2026. A implementação foi integrada pela
[PR #54](https://github.com/junior-aguiar-eng/ForgeLex/pull/54), commit
`588988e29f428ad0ef6c6841802db773e9afcf41`, merge
`0dc9ec5230099b2a28a3f1423a0bf39bf0694950`. Base anterior: `a554323`.

## Validação da implementação

Build, lint e typecheck concluídos. Vitest completo: 761 aprovados e 17
ignorados, em 147 arquivos aprovados e dois ignorados. E2E local final:
leitor 4, conferência 9, documentos 4 e case-ai 5, total 22. O painel foi
inspecionado em celular/desktop; Axe sem violações no ensaio local. Revisão
independente do diff e da correção final sem achados P0–P2.

As fontes abrem a versão fixada e preservam título, texto e citação não salva.
O teste de resposta tardia aguarda seu término antes de verificar a ausência de
conteúdo antigo. As leituras não gravam versões nem registram aprovação.

A falha de conferência foi reproduzida deterministicamente mantendo o contexto
de fatos inicial vazio e abrindo novamente um rascunho cujos fatos já existiam.
A conferência encontrava o fato, mas o painel não o mostrava. RED antes do fix,
GREEN após atualizar o contexto junto com a abertura da minuta e proteger os
callbacks por seleção. Não se reconstruíram as respostas da primeira falha
intermitente; a correção e a evidência se referem ao defeito reproduzido.

Os seis jobs passaram na CI da PR, run `37645707544`, e em main, run
`37646597388`: validate, postgres, e2e-product, e2e-public,
e2e-account-closure e security. PostgreSQL e restauração continuam cobertos
pelos jobs existentes. Não houve migration nesta entrega.

## Publicação

Backup Cloud SQL `1791387692996`, instância `forgelex-hml-pg`, SUCCESSFUL,
concluído às `2026-10-07T15:43:44.799Z`. Cloud Build
`b7ebff93-dcae-4687-93e5-b08334e9f16a`, SUCCESS, concluído às
`2026-10-07T15:50:07.616627Z`. Build executado a partir de clone limpo de main
confirmado contra origin/main, pelo script canônico `build-from-main.ps1`.

Imagem:
`southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:b035b03fcfb5572510202f8a586dcda4b71cad97b296147e7a7aead7303b548d`.
Revisão: `forgelex-api-prod-reader-0dc9ec5`. Rollback:
`forgelex-api-prod-lifecycle-ui-326a96e`.

Deploy inicialmente sem tráfego. Service account, concorrência, timeout,
recursos e variáveis existentes preservados; somente imagem e SOURCE_SHA
atualizados. Ingress `internal-and-cloud-load-balancing` preservado, assim como
os controles de journal/restauração e o projeto de autenticação.

As duas primeiras verificações após criar a rota temporária chegaram à revisão
anterior, apesar de HTTP 200; não autorizaram promoção. A rota importada, o NEG
e a tag foram conferidos. Uma sonda às `16:00:27Z` já identificou a candidata.
A repetição das dez rotas passou com identidade exclusiva da candidata nos
logs. Esse atraso de propagação não foi tratado como falha de código.

Promoção 5/25/100 concluída às `2026-10-07T16:08:56Z`, com 157, 157 e 156
sondas e janelas de 133, 132 e 132 segundos. Na etapa final, somente a revisão
nova apareceu nos logs, sem respostas diferentes de 200 nessas sondas. Entrada
JavaScript publicada acessível e HTML com `Cache-Control: no-cache`.

Regra temporária, backend, NEG e tag `reader-candidate` removidos às
`2026-10-07T16:13:44.327Z`; tags históricas preservadas. Nova confirmação às
`16:17:34Z`: revisão nova com 100%, SOURCE_SHA correto e ingress preservado.
Observação de logs às `16:05Z` não encontrou HTTP 5xx desde `15:52Z`; é uma
janela específica, não garantia de ausência de falhas posteriores.

## Percurso real com IA externa

Caso inteiramente fictício: `Homologação leitor 07-10-2026 — caso sintético`,
ID `a515ee9e-e721-4a80-87cb-8068f346317c`. Documento
`Contrato sintético — leitor 07-10`, ID `bd5c23a3-8926-401f-8a22-b004d16639c5`,
versão 1 `bab14227-6d6e-4948-b9ee-56ff75ec0ab1`, quatro parágrafos.
Nenhuma pessoa ou contrato real foi utilizado.

Na conexão existente do Claude, a credencial estava expirada. A renovação
conservou as permissões habituais do host, inclusive exigência de aprovação
para a gravação. Surgiu uma nova conexão chamada “Claude”; a seleção inicial
estava na anterior. `case.list_shared` retornou lista vazia. Revogar essa seleção
sintética e autorizar o documento na conexão nova permitiu a leitura correta.

O Claude executou `case.list_shared`, `case.get_context`, `case.read_item` e
`draft.save_from_ai`. A gravação sintética foi inspecionada e permitida uma vez
no host, sem alterar a política para “sempre permitir”. Não foram solicitadas
pesquisas de jurisprudência, web ou operações financeiras.

Recibo `e0424243-7ed2-431c-8679-3903e4842a82`, recebido às
`2026-10-07T15:46:20.649Z`. Novo rascunho
`1b86bf87-d29c-41dd-9d26-bd37dff95779`, versão 1
`80e9316d-c152-462f-9d78-087f7727043f`, duas seções e seis referências DOCUMENT
à mesma versão, com âncoras por seção. Conteúdo e revisão pendente confirmados
no site. A leitura e o recebimento usaram a revisão anterior à publicação do
leitor.

Na nova revisão, **Conferir fonte** abriu a versão documental 1, destacou e
focou o parágrafo 2. A busca “fictícia” encontrou duas ocorrências; navegar e
fechar por Escape preservou a edição da seção 2. A edição foi salva como
versão 2 com seis referências ainda fixadas à versão documental original.
**Abrir documento** em Casos também mostrou o texto integral e os quatro
parágrafos. Screenshot local do leitor foi inspecionado.

A conferência da versão 2 identificou as seis fontes documentais e sinalizou
a ausência de fatos vinculados/fontes jurídicas. Não foi encaminhada ou
concedida aprovação jurídica; o material continua sintético e pendente.

O botão **Baixar DOCX da versão salva** foi acionado. O evento de download não
foi capturado pelo controle do navegador; o usuário indicou o arquivo salvo na
área de trabalho, `Nota sintética — homologação leitor 07-10-v2.docx`.
O ZIP íntegro e o XML do conteúdo confirmam versão 2, duas seções, edição de
teste salva, seis referências à versão documental 1, cláusulas de entrega e
pagamento e aviso de revisão humana pendente. Dez verificações aprovadas,
10.666 bytes, SHA-256
`ccb0d9ee39cca36fa41f0d7321a07320476781c7e2c09b88d326732f94e28e8b`.
Não houve avaliação visual de paginação no Word. O arquivo não foi alterado.

As duas permissões sintéticas aparecem como revogadas no site. Uma nova
chamada real `case.get_context`, com o ID deste caso, recebeu
`CASE_CONTEXT_NOT_AUTHORIZED`, `retryable: false`; request e erro foram
conferidos no painel da ferramenta do Claude. A revogação impede novas
consultas; não apaga conteúdo já enviado à conversa. Caso, documento e
rascunho permanecem preservados. O percurso completo desta rodada ocorreu
no Claude; não se extrapola essa evidência para o ChatGPT.

[Recibo consolidado sem segredos](2026-10-07-document-reader-publication.json).

## Continuidade

O problema de uso observado é distinguir conexões com o mesmo nome após
reconexão. Orientar esse passo e mostrar data/estado legíveis é um próximo
incremento mais concreto que introduzir um novo motor de agentes. A mesa do
caso permanece como evolução da interface existente, a definir com base no
percurso; permissões não devem ser transferidas automaticamente.

O [resumo de continuidade](../../../CONTINUIDADE.md) registra também os três
alertas de dependências do build encontrados no GitHub. A CI de segurança verde
não significa que esses alertas foram encerrados.
