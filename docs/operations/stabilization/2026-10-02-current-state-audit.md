# Auditoria corretiva do estado atual — 02/10/2026

Base: `origin/main` em `a7bae827b665ef34e2e035f19996c9dc07a4dd34`.
Branch isolada: `codex/current-state-audit`, no worktree `document-io/SDK`.
O checkout original `codex/p2-search-chunk-recovery`, HEAD
`ace7b7a487845e2f7b3098b138037b2641a51952`, permanece preservado.
Boni autorizou a auditoria e a correção automática de bugs demonstrados.

## Falhas confirmadas e correções

- Erros de execução eram traduzidos para HTTP 402, inclusive nas ferramentas
  gratuitas de autoridade. Timeout agora retorna 504; indisponibilidade, 503;
  timeout SQL encapsulado pelo Drizzle é reconhecido na cadeia `cause`,
  e as mensagens MCP de falha técnica não devolvem SQL nem parâmetros;
  conflito de chave, 409. Apenas saldo insuficiente retorna 402 e oferece
  recarga. O retry da pesquisa conserva a chave também depois de navegar.
- A mesma chave de cobrança podia recuperar resultados de filtros diferentes,
  e o snapshot de pesquisa tinha formatos incompatíveis entre REST e MCP.
  Fingerprint vincula usuário, termo, tribunal, ano e limite; divergências
  retornam 409 antes de executar ou debitar. Ambos os canais usam o mesmo
  snapshot de dados, reconstruindo o envelope e a proveniência do MCP.
- Aprovar uma versão anterior marcava a minuta corrente como aprovada.
  Decisão e estado agora pertencem à versão solicitada; o estado da minuta
  muda somente se essa ainda for sua versão corrente. O claim da decisão é
  atômico. Exportação DOCX lê o estado atualizado da versão.
- A pesquisa PostgreSQL ordenava documentos completos antes do limite.
  A projeção compacta conserva ranking e filtros, limita os IDs/versões e
  hidrata somente os resultados finais no mesmo statement. A transação da
  pesquisa usa `statement_timeout=40000`, local à transação. Ferramenta e
  contrato anunciam 45 s; a reserva dura 60 s. SQLSTATE 57014 vira timeout
  recuperável, sem debitá-lo. Cancelamento cooperativo é propagado pelo
  registro de ferramentas; não se afirma cancelamento imediato do SQL.
- Falha de download de uma tela lazy agora mostra recuperação explícita.
  HTML exige revalidação; asset inexistente retorna 404, preservando o shell.

## Evidência do incidente e limite de desempenho

Consulta de logs e SQL somente leitura em produção, em 03/10/2026 UTC
(02/10 no fuso local): o POST do incidente durou 15,21 s e retornou 402.
A operação do intervalo tinha estado FAILED e **zero débitos** associados.
Nenhuma API faturável foi chamada nesta auditoria.

Cloud SQL: PostgreSQL 16, `db-f1-micro`, SSD de 49 GB. Não houve alteração
de infraestrutura ou custo. No mesmo acervo e filtros, a implementação
publicada levou 29,84 s; a projeção levou de 15,62 a 18,87 s. A medição
final com o limite SQL levou 18,06 s e retornou 20 itens; EXPLAIN ANALYZE
levou 15,08 s. O plano identifica a leitura dos candidatos como dominante.
O limite de 15 s era insuficiente mesmo após a projeção. Os novos prazos
comportam as medições, sem prometer que toda busca terá essa duração.
Empates no ranking/data não têm ordem estável; não se afirma identidade da
lista limitada entre execuções empatadas.

## Compatibilidade e publicação

Aplicar primeiro a migration aditiva
`billing-ledger-0008-request-fingerprint` (`request_fingerprint TEXT`
nullable), depois a aplicação. Rollback pode manter a coluna adicional.
Operação antiga COMPLETED/PENDING sem fingerprint não é vinculada por
inferência: um novo pedido com fingerprint recebe conflito, sem outro
débito. Operação antiga FAILED pode ser vinculada no primeiro retry.
Não há backfill de aprovações antigas, estorno nem novo armazenamento
permanente de resultados.

## Validação

Contas, jurisprudência, aprovações e débitos dos testes são fictícios.
Regressões locais cobrem classificação de erros, falha sem débito, retry
com a mesma chave, divergência de filtros, replay REST/MCP com proveniência,
reserva superior ao prazo da ferramenta, aprovação da versão anterior,
ranking/ano, erro Drizzle real encapsulado e restauração do prazo SQL fora da transação. PostgreSQL local
18: regressão com 33.759 documentos aprovada; smokes de pesquisa (nove
checks) e geral (12 checks) aprovados. E2E: oito de pesquisa e três de
recuperação de chunks aprovados. Build, lint e typecheck aprovados na
etapa final; 583 testes gerais aprovados e cinco ignorados, incluindo as
regressões red/green do erro encapsulado. A CI da
branch será registrada antes da publicação.
Um worker Vitest encerrou inesperadamente no Windows em execução conjunta;
os testes PostgreSQL são reexecutados isoladamente, sem aceitar aquele
processo como evidência de aprovação.

`pnpm audit --prod --audit-level moderate`: nenhuma vulnerabilidade conhecida
no conjunto de produção. O alerta Dependabot de `braces <=3.0.3` pertence
à cadeia de desenvolvimento do Tailwind, sem versão corrigida informada;
não foi feita migração disruptiva de estilos. A revisão de código não
identificou falha concreta de isolamento/autorização nas superfícies
examinadas. Esses checks não demonstram ausência de todo bug no projeto.

## Integração e implantação concluídas

PR [#34](https://github.com/junior-aguiar-eng/ForgeLex/pull/34), merge
`30c94de67dfc0a4a95420f079bdac46eaa0ee5d4`. CI da PR
`37084625417` e de main `37084906720`: seis checks aprovados em cada uma
(`validate`, `postgres`, `e2e-product`, `e2e-public`,
`e2e-account-closure`, `security`). Build de clone limpo de main,
SHA confirmado contra o remoto; upload sem arquivos privados.

Cloud Build `b51683ea-9a36-4877-a4ad-6ae2ed8955b4`: SUCCESS,
finalizado às `2026-10-03T01:12:30.451738Z`. Imagem por digest
`sha256:a504e57f7b0e783a7276cef2f168b5430b76d969c19ef4eb791b5a437201d485`.
Migration `billing-ledger-0008-request-fingerprint` aplicada às
`2026-10-03T01:13:32.245Z`, antes da candidata, com coluna `text`
nullable e contagens de histórico, operações e débitos preservadas.

Candidata `forgelex-api-prod-audit-30c94de` validada inicialmente com
zero tráfego público. Env e referências de secrets, service account,
recursos, concorrência, timeout do serviço, Cloud SQL e ingress
preservados. Logs comprovam que a rota de validação serviu essa revisão.
Oito E2E passaram no frontend remoto. Na primeira execução, um interceptador
da ponte de teste usou `route.continue`, produzindo um pedido com credencial
fictícia rejeitado por autenticação (401). A ponte foi corrigida para
`route.fallback`; os oito testes finais usaram Auth/API/SQLite/saldo locais.
Nenhuma operação paga em produção foi executada.

Um job somente leitura, com a própria imagem nova e
`default_transaction_read_only=on`, recuperou 20 julgados de 2025 em
**16.819 ms**, confirmou timeout SQL de 40 s e ferramenta de 45 s e
restauração do timeout da sessão fora da transação. Não chamou API
faturável nem gravou histórico. Sua primeira execução falhou apenas na
asserção do texto SQL por diferença de espaços; a asserção foi corrigida
e a repetição passou. O resultado de leitura não é um teste pago de conta
real nem uma garantia de duração universal.

Promoção direta a 100% evita mistura de assets entre versões. Observação
de `2026-10-03T01:23:54.076Z` a `01:25:55.535Z`: 162 respostas readyz
200 em 121,459 s, comprovadas nos logs da nova revisão; 14 rotas finais
retornaram 200. Oito E2E passaram novamente no domínio normal,
https://nexojuris.ia.br, sem seletor da candidata e com APIs locais.
Promoção concluída às `2026-10-03T01:26:06.8357068Z`.

Rollback preservado: `forgelex-api-prod-research-01fedab` a 100%, caso
necessário, mantendo a coluna aditiva. Rota, backend, NEG, tag e jobs desta
frente removidos, com recursos anteriores preservados. Inventário e logs
conferidos às `2026-10-03T01:28:55.1910661Z`: nenhum log ERROR da nova
revisão e nenhum recurso temporário desta auditoria remanescente.
O recibo [JSON](2026-10-02-current-state-audit-proof.json) registra o
inventário final, tráfego, logs, limpeza e os limites das verificações.
