# Pesquisas salvas e leitor MCP — publicação de 11/10/2026

Boni aprovou a prévia visual corrigida e autorizou expressamente a última
vistoria, commit, push, integração em main, migração de produção e deploy.
Execução entre 11/10 e 12/10 UTC, ainda 11/10 em Maceió.

## Código e verificações

PR [#68](https://github.com/junior-aguiar-eng/ForgeLex/pull/68), integrada em
`5be473d0e1566f1956971247cf26da9cd9224415`. Os seis checks obrigatórios passaram
na PR, execução `38187724133`, e no main integrado, execução `38188297871`:
validate, postgres, e2e-product, e2e-public, e2e-account-closure e security.

A vistoria local registrou 839 testes aprovados e 18 ignorados, 21 testes de
persistência/concorrência/encerramento, cinco ensaios de pesquisas salvas e MCP
Apps e 38 verificações de acessibilidade. Também passaram as regressões de
documentos, leitor, revisão, contexto de casos, lifecycle e fluxo preservado.
O runner Windows emitiu aviso ao terminar um worker de draft approval; a
reexecução isolada passou sem esse aviso. Não foi uma falha de asserção.

Dois defeitos encontrados na conferência foram corrigidos antes da integração:
data e hora da pesquisa salva agora usam o mesmo fuso local; títulos longos
aceitam quebra de palavras no celular com espaçamento de texto ampliado.
O teste legado foi alinhado ao botão real de conferência e ganhou portas
configuráveis para preservar as prévias anteriores.

## Banco e imagem publicados

Checkout operacional independente, limpo e alinhado a main. Build canônico
`d51805f1-581b-4d92-a231-8a7d7a94a269`, SUCCESS, com pesquisas salvas habilitadas
no frontend. Imagem:

`southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:61a12a3fba72bc726cb15d61455d8db45e43fa0238dafcd8052c212a2a2b13d1`

Backup manual `1791765303476`, SUCCESSFUL em `2026-10-12T00:37:35.524Z`, antes
da alteração. Banco produtivo `forgelex`, PostgreSQL 16.15, na instância
histórica `forgelex-hml-pg`; seu nome não a torna ambiente de ensaio.
A única migração pendente era `persistence-0030-saved-research`.

Migração oficial executada separadamente, com código conferido pelo commit.
Após a aplicação: 38 migrações, nenhuma pendente, tabelas `saved_research`,
`saved_research_collections` e `saved_research_permissions` presentes e zero
pesquisas salvas na inspeção imediata. Nenhuma coleção antiga foi preenchida.
Credenciais ficaram somente em memória; não foram impressas nem persistidas.

## Candidata e promoção

Candidata final de ensaio `forgelex-api-prod-saved-5be473d0-candidate-r2`, sem
tráfego do site e com cobrança desabilitada. A primeira candidata passou os
controles incorretamente por interpretação das vírgulas pelo PowerShell;
a comparação da configuração detectou o erro antes do ensaio e da promoção.
A segunda recebeu valores separados, conferidos explicitamente.

NEG, backend e caminho temporários permitiram testar pelo mesmo HTTPS sem
relaxar o ingresso. Durante a propagação do encaminhamento, os primeiros
probes ainda chegaram à revisão antiga e retornaram 404 nesse caminho.
Após a propagação, 15 probes tiveram o resultado esperado: oito checks de
readiness verdadeiros, páginas preservadas, autenticação obrigatória nas novas
rotas, metadados OAuth e arquivos do leitor idênticos ao build aprovado.

Revisão comercial `forgelex-api-prod-saved-5be473d0`, mesmo digest, conferida
antes de receber 100% do tráfego. Promoção direta após o ensaio sem tráfego,
para evitar mistura de frontend novo com API antiga sem as novas rotas.
Cobrança normal preservada. Pesquisas salvas e leitor MCP foram ativados
nesta publicação autorizada; seus padrões no código permanecem desligados.

Os 15 vínculos de segredos, conta de serviço, conexão Cloud SQL e variáveis
anteriores foram comparados e preservados. `FORGELEX_AUTO_MIGRATE=false`,
OAuth habilitado e ingresso `internal-and-cloud-load-balancing` mantidos.
Não houve concessão automática de "Gerenciar pesquisas salvas" a aplicativos.

## Evidência pública e limites

Na versão promovida, os mesmos 15 probes passaram. `/readyz` apresentou os
oito checks verdadeiros; o registro de requisição identificou a revisão nova
atendendo esse endereço. O navegador mostrou o título e o texto aprovados,
sem "índice próprio do STJ", e a página Produto renderizou corretamente.
Registros da revisão observados durante a publicação não apresentaram eventos
de gravidade ERROR ou superior. Isso não equivale a monitoramento prolongado.

O SDK MCP Apps foi ensaiado localmente. O leitor dentro do ChatGPT e Claude,
sua expansão e o salvamento/reabertura nesses aplicativos ainda precisam de
ensaio real: o conector ForgeLex disponível nesta sessão exigiu nova
autenticação. Nenhuma pesquisa paga, concessão em conta real ou compra foi
executada para provar a publicação. CRUD autenticado em produção não foi
exercitado; suas regras foram validadas nos ensaios locais e na CI.

A cobertura efetivamente habilitada continua a anterior: pesquisa STJ e
consulta processual TJAL. Não foram adicionados fornecedores, acervos, análise
jurídica própria ou telas de casos. HTTP 200 de páginas de retorno comprova
entrega da interface, não uma transação de pagamento ou troca de senha real.

Os recursos de encaminhamento temporário e a tag candidata foram removidos;
as regras originais dos endereços e os recursos históricos foram preservados.
Cloud SQL HML isolado permanece STOPPED/NEVER. Os 47 arquivos locais protegidos
foram reconferidos: nenhuma diferença. O checkout original não foi alterado.

## Reversão compatível

Desabilitar os controles de pesquisas salvas e leitor preserva as coleções.
Manter uma imagem compatível com as novas tabelas nos procedimentos de
encerramento e restauração. A volta à imagem anterior só é apropriada antes
de existirem dados novos; depois disso, ela omite essas tabelas no tratamento
de encerramento. Não remover a migração nem excluir dados para reverter a UI.
Desligar o controle de frontend requer build compatível com esse valor.

As evidências sanitizadas estão em
[2026-10-11-saved-research-publication-proof.json](2026-10-11-saved-research-publication-proof.json).
O plano e os limites de integração real continuam em
[validação da entrega](../../superpowers/plans/2026-10-11-saved-research-mcp-reader-validation.md).
