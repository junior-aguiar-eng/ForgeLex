# Vistoria complementar: produção, PostgreSQL e hosts — 11/10/2026

Boni solicitou a extensão da vistoria antes de commit e push. Execução no
worktree `C:/Users/Boni Jr/.codex/worktrees/site-mcp-scope-freeze/SDK`, branch
`codex/site-mcp-scope-freeze`, base/HEAD `f5f9316dd0255e49029972806fb161963ab4d54a`.
O congelamento do site continua local e sem publicação. Esta vistoria verifica
o runtime já publicado e exercita o backend preservado em PostgreSQL descartável.
[Recibo com resultados, horários UTC e hashes](2026-10-11-site-mcp-external-validation-proof.json).

## Produção publicada

Cloud Run `forgelex-api-prod`, projeto `project-bbbe1209-c295-4720-867`, região
`southamerica-east1`: revisão Ready `forgelex-api-prod-audit-5aca51e`, com 100%
do tráfego. Digest confirmado:
`sha256:39cb2d3e33fbbcea238c63c3c8f9899d75b89bf38963993946b69336671e73fa`.
`/readyz` respondeu ready com os oito checks true, incluindo persistência,
migrations, autenticação e os gates de restauração.

Os 12 probes HTTPS registrados responderam 200; rotas SPA usaram
`Accept: text/html,application/json`. Na sessão real autenticada, dez telas
abriram: Visão geral, Pesquisa, guia MCP, API para desenvolvedores, conta,
chaves, atividade, segurança, consulta processual e conexão de IA. Zero erros
de console capturados. O teste gratuito de disponibilidade informou serviço
disponível e credencial pronta. Nenhuma compra, alteração de senha, geração de
chave, revogação ou consulta jurídica foi acionada.

A consulta de logs do serviço, de 15:35 UTC até 16:46:07 UTC em 11/10, não
retornou HTTP >=500 nem severity >=ERROR. Isso descreve a janela e o filtro
observados, sem certificar ausência universal de incidentes. O título e o menu
continuam correspondendo ao fluxo anteriormente publicado: o site enxuto
ainda não foi validado em produção porque não houve deploy desta branch.

## PostgreSQL real e regressão local

A revisão publicada referencia a instância `forgelex-hml-pg` (o nome contém
hml, mas é a instância efetivamente usada pelo serviço publicado), RUNNABLE,
PostgreSQL 16. A conexão direta confirmou banco `forgelex`, servidor 16.15,
37 migrations registradas e nenhuma migration conhecida pelo checkout ausente.
O índice `jurisprudence_versions_search_metadata_idx` está válido e pronto.
Toda a inspeção foi feita em transação `READ ONLY`, com timeouts de consulta e
lock; zero statements de mutação. O segredo de conexão ficou apenas em memória.
Os três backups automáticos mais recentes constam SUCCESSFUL; o último começou
em 11/10 às 04:12:47 UTC e terminou às 04:14:59 UTC. Não foi restaurado backup
de produção nem executado job de retenção, purge ou encerramento real.

Para os ensaios com escrita, foi criado exclusivamente o container
`forgelex-scope-audit-pg-20261011`, imagem `postgres:16-alpine`, porta
`127.0.0.1:55439`, sem montagem de diretório do usuário. As 37 migrations foram
aplicadas somente nele. Resultado: 39 testes de integração aprovados em quatro
arquivos, zero skips; inclui os cenários PostgreSQL anteriormente condicionais.

| Ensaio | Checks aprovados | Execução |
| --- | ---: | --- |
| Persistência, isolamento, billing, outbox, workflow e concorrência | 14 | Script oficial inalterado |
| Rascunhos por IA e permissões | 13 | Script oficial inalterado |
| Lifecycle, purge e restauração real | 8 | Assertions oficiais; transporte dos clientes adaptado |
| Pesquisa e histórico | 9 | Script oficial inalterado |
| Retenção operacional | 4 | Script oficial inalterado |
| Encerramento de conta | 7 | Script oficial inalterado |

Total: 55 checks. O lifecycle encontrou duas limitações do ambiente: ausência
inicial de `pg_dump` no PATH; depois, o `pg_restore` 18.6 do Windows emitiu
`SET transaction_timeout=0`, incompatível com o servidor 16. A execução
diagnóstica manteve os testes/assertions e usou `pg_dump`/`pg_restore` 16 do
container, com backup real e reaplicação das exclusões antes da abertura do
gate. Todos os oito checks passaram. Essa adaptação é um artefato ignorado;
nenhum script oficial ou backend foi modificado. O script original com clientes
18 do Windows não é registrado como aprovado.

## Hosts reais

Somente `forgelex.connection_status({})` foi solicitado em cada host, com as
autorizações OAuth existentes. Nenhuma permissão foi criada ou ampliada.

| Host | verifiedAt UTC | Resultado |
| --- | --- | --- |
| Connector do Codex | 16:26:44.460 | authenticated true, OAuth, billable false |
| Claude | 16:28:53.748 | authenticated true, OAuth, billable false |
| ChatGPT | 16:32:09.838 | authenticated true, OAuth, billable false |

Todos retornaram o recurso `https://nexojuris.ia.br/mcp`. No Claude, o resultado
original da ferramenta ficou expandido; no ChatGPT, o JSON foi exibido pela
resposta. Logs do Cloud Run confirmam POST `/mcp` 200 nos mesmos horários,
com `Claude-User` e `openai-mcp/1.0.0`, respectivamente; o site também mostrou
o último uso auditável de 13:32:09 no horário local. As capturas e hashes estão
registrados no recibo. Esta evidência demonstra a conexão gratuita real,
sem certificar pesquisa faturável, escrita em casos ou outros escopos OAuth.

## Encerramento e limites

O proxy temporário da inspeção e o container exclusivo de teste foram
encerrados; a prévia local em 3000/3001 foi preservada. Não houve commit, push,
deploy, migration remota ou alteração de dados de produção. O checkout original
e seus 47 arquivos protegidos continuam conferidos por hash na vistoria final.

Não foi encontrada regressão nos recortes exercitados. Esta vistoria não mede
carga, integridade integral do corpus, restauração de produção, pagamentos
reais ou troca de senha. A validação do site enxuto em produção permanece
dependente de publicação autorizada e nova conferência dessa revisão.
Logs de ensaio, diagnósticos e capturas locais:
`.superpowers/sdd/2026-10-11-external-validation/`.
