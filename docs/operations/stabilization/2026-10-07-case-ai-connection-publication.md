# Conexões de IA — integração e publicação

Publicado em 07/10/2026 pela [PR #56](https://github.com/junior-aguiar-eng/ForgeLex/pull/56).
Head validado `327004645ff4e4021900dfb98933b0fd140ba259`; merge e código publicado
`a23cc0705305e327a834008473762490f982618b`.

## Entrega e validação

Nome, data e estado distinguem as conexões no caso. Detalhes técnicos ficam
recolhidos; a orientação de reconexão explica como atualizar e conferir o
material. Renovação/remoção invalida a prévia sem transferir permissões.

A pendência de limpeza do banco temporário foi concluída antes da integração:
oito E2E locais reexecutados, sem novos diretórios remanescentes. Revisão
independente anterior sem achados P0–P2. Build, lint e typecheck aprovados.
CI da PR `37662764802` e de main `37663636560`: seis jobs aprovados, 761
unitários (17 condicionais ignorados) e 127 E2E em cada execução. PostgreSQL,
concorrência e restauração foram validados pelos jobs existentes.

## Publicação e rollback

Backup Cloud SQL `1791395897025`, SUCCESSFUL, concluído às
`2026-10-07T18:00:18.705Z`. Cloud Build
`cfc31c1d-4468-4625-86d0-6e6f7a4a2bf8`, SUCCESS, a partir de clone limpo de
main alinhado a origin/main, pelo script canônico `build-from-main.ps1`.

Imagem por digest:
`southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:44e9fb77f934f350bda39df5dd1b60813c760659e42a16da6616b63aab4e7c97`.
Revisão `forgelex-api-prod-connection-a23cc07`, com 100% do tráfego.
Rollback `forgelex-api-prod-reader-0dc9ec5`. Sem migration; configuração,
ingress, variáveis, recursos e permissões do serviço preservados.

Candidata criada com 0% de tráfego e verificada por rota temporária no domínio.
As primeiras dez sondas ainda chegaram à revisão anterior; não autorizaram
promoção. Após propagação do balanceador, as dez rotas identificaram somente
a candidata nos logs. O bundle servido também continha o novo incremento.

Promoção 5/25/100 aprovada: 154, 159 e 158 sondas, respectivamente, total 471.
Na etapa final, somente a nova revisão apareceu nos logs das sondas. Cada etapa
teve janela mínima de 120 segundos; tempos efetivos constam do recibo.
Os resultados descrevem essas janelas, sem afirmar monitoramento contínuo.

## Conferência em produção e limites

A interface foi recarregada no caso existente
“Homologação leitor 07-10-2026 — caso sintético”. Nenhuma conexão estava
pré-selecionada. Os dois registros Claude foram distinguíveis pela data;
a conexão mais recente apareceu primeiro. Selecioná-la mostrou acesso revogado,
com detalhes técnicos recolhidos. A ajuda de reconexão foi aberta e a atualização
preservou seleção e estado revogado. Inspeção visual desktop concluída.

As duas permissões sintéticas anteriores permaneceram revogadas. Não houve
nova concessão de acesso, renovação OAuth, pesquisa paga, alteração documental
ou chamada nativa em ChatGPT/Claude. Renovação/remoção e impedimento de transferência
continuam demonstrados pelos testes locais/CI; a leitura da interface em
produção não equivale a novo ensaio nativo de OAuth nos hosts.

A causa da instabilidade anterior do SQLite em memória no harness permanece
indeterminada; não foi apresentada como defeito corrigido em produção. O ensaio
usa arquivo exclusivo por execução, removido ao término.

Estado final e remoção da rota, backend, NEG e tag temporários constam do
[recibo sanitizado](2026-10-07-case-ai-connection-publication.json). Tags históricas,
caso, documento, rascunho e permissões anteriores foram preservados.
