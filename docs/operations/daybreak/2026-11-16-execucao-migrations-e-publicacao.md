# Daybreak — execução de 16/11/2026: migrations e publicação

Registro feito **depois** dos fatos. Foi reconstruído em 16/11/2026 a partir de logs do Google Cloud que Boni leu e
colou numa sessão de trabalho; nada foi reexecutado para escrevê-lo. Todos os horários estão em **UTC** (Brasília é
UTC−3). O plano que orientou a execução é o [checklist](2026-11-16-deploy-checklist.md).

## Resumo

- O backup sob demanda, as três migrations e duas publicações aconteceram em 16/11/2026, e o código do Daybreak está em
  produção. O `PENDENCIAS.md` e o checklist diziam que nada estava publicado, o que passou a ser falso às 15:11 UTC.
- As migrations `persistence-0042-webhook-admission`, `persistence-0043-execution-stream-leases` e
  `billing-ledger-0011-refund-recovery` foram aplicadas às **13:17:20–13:17:21** por um Job temporário, com backup
  concluído 2 min 40 s antes. O journal foi de **54 para 57** entradas.
- **Nenhum dado foi afetado**: 0 entregas de webhook, 0 corpos de resposta, 0 pedidos de reembolso.
- A revisão atual de produção é `forgelex-api-prod-6fe4f75-92e59198`, com 100% do tráfego.

## Quem executou

As ações aparecem no log de auditoria com a **conta do gcloud de Boni**. O log não distingue Boni de uma ferramenta que
use as credenciais dele (por exemplo, o Codex na máquina dele). **Não verificado.**

## Linha do tempo (UTC, 16/11/2026)

| Horário | O que aconteceu | Fonte |
| --- | --- | --- |
| 13:05:51 | Build `cb0477f0`, sucesso (provavelmente a imagem do Job; **não verificado**) | `gcloud builds list` |
| 13:11:00 | Job `forgelex-pr167-migrations` criado | auditoria do Cloud Run |
| 13:11:32 | Execução 1: `exit(9)`; `inspect` lido como `node inspect` | log do Job |
| 13:12:56 | Execução 2: `exit(1)`; `ERR_UNSUPPORTED_RESOLVE_REQUEST`, não tocou no banco | log do Job |
| 13:13:42 | Job atualizado (`ReplaceJob`) | auditoria do Cloud Run |
| **13:14:06** | Execução 3, modo `inspect`, `exit(0)`: lê o estado antes de migrar | log do Job |
| **13:14:40** | **Backup sob demanda** `1794834880818`, `SUCCESSFUL` | `gcloud sql backups list` |
| **13:17:20–21** | Execução 4, modo `apply`, `exit(0)`: aplica as três migrations | log do Job |
| 13:17:53 | Job e as quatro execuções apagados | auditoria do Cloud Run |
| 13:52–14:13 | Jobs `forgelex-stj-search-inspect` e `-retest` criados, rodados e apagados (provavelmente a investigação da busca STJ do #168; **não verificado**) | auditoria do Cloud Run |
| 15:03:11 | Build `65e7e42c`, sucesso | `gcloud builds list` |
| 15:11:16–15:13:05 | **Publicação de `af13b1c`** (merge do #168): serviço de encerramento e API, cada um alterado duas vezes (revisão nova, depois o tráfego) | auditoria do Cloud Run |
| 18:05:07 | Build `92e59198`, sucesso | `gcloud builds list` |
| 18:13:17–18:15:31 | **Publicação de `6fe4f75`** (merge do #169), na mesma ordem. Revisão `forgelex-api-prod-6fe4f75-92e59198` criada às 18:14:07 | auditoria e `revisions describe` |

O padrão das duas publicações (revisão primeiro, tráfego depois, encerramento antes da API) é o do `deploy-from-main.ps1`.
Não foi lida a saída do script.

## Migrations: o que o Job leu e fez

O Job rodou um script embutido com três modos (`inspect`, `apply`, `verify`). Antes de agir, ele exige que a conexão seja o
banco `forgelex` no socket do Cloud SQL `forgelex-hml-pg`, que o journal **não tenha ID desconhecido** e que só as três
migrations autorizadas estejam faltando; qualquer outra situação termina com erro. Cada migration é aplicada em separado.
No fim, confere o resultado e termina com erro se algo não bater. A lista de migrations dele é a completa: persistência
(43, sem a 0041) + 0041 + ledger (11) + análise (2) = **57**.

| | Antes (`inspect` 13:14:06 e `apply` 13:17:20) | Depois (`after` 13:17:21) |
| --- | --- | --- |
| Entradas no journal | **54** | **57** |
| Faltando | as três | nenhuma |
| IDs desconhecidos | nenhum | nenhum |
| Casos / minutas | 4 / 4 | 4 / 4 |
| Lançamentos do ledger | 159 | 159 |
| `agentic_execution_jobs` | 13 | 13 |
| Entregas de webhook | 0 | 0 |
| Entregas com corpo de resposta gravado | 0 | 0 |
| Pedidos de reembolso (por status) | nenhum | nenhum |
| `PENDING` com rastro local | 0 | 0 |

Esquema depois: `webhook_admission` com 1 linha e as colunas `claim_token` e `last_error` em `webhook_deliveries`;
`execution_stream_admission_lock` com 1 linha e `execution_stream_leases` com 0; as quatro colunas
`operation_state`, `provider_payment_id`, `provider_result` e `operation_error` em `billing_refund_requests`.

**Efeito sobre dados: nenhum.** A `0042` apaga `webhook_deliveries.response_body_excerpt`, e não havia nenhum corpo
gravado. A `0011` move reembolsos `PENDING` com rastro local para reconciliação, e não havia pedido de reembolso algum.

Aplicadas às 13:17:20.938 (`0042`), 13:17:21.040 (`0043`) e 13:17:21.086 (`0011`), segundo o `applied_at` do journal.

## Publicação: estado lido

- Tráfego de `forgelex-api-prod`: **100%** em `forgelex-api-prod-6fe4f75-92e59198`.
- Ambiente dessa revisão (só estas variáveis foram lidas): `FORGELEX_SOURCE_SHA=6fe4f75fcc…`,
  `FORGELEX_AUTO_MIGRATE=false`, `FORGELEX_COMMERCIAL_EXECUTION_ENABLED=true`,
  `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED=true`.
- Com esse ambiente a API confere, na subida, as migrations de persistência (`assertMigrationsApplied`) e as do ledger (modo
  `verify`) e recusa subir com `MIGRATIONS_PENDING`. A revisão sobe e serve, o que é coerente com o resultado do Job.
- O serviço de encerramento está em `forgelex-closure-hml-private-6fe4f75-92e59198` (visto no plano do `-DryRun`; o
  percentual de tráfego dele não foi lido).
- O `-DryRun` de `deploy-from-main.ps1` contra `4396713` (só documentação a mais que `6fe4f75`) deu "Nenhum impedimento", e
  **não foi executado de verdade**: não havia código novo a publicar.

## Reversão

As revisões anteriores de cada serviço, pela auditoria, são `forgelex-api-prod-af13b1c-65e7e42c` e
`forgelex-closure-hml-private-af13b1c-65e7e42c`. Confirmar que ainda existem (`gcloud run revisions list`) antes de usar.
O esquema é aditivo e **não se reverte**; a imagem anterior ignora as colunas e tabelas novas.

## O que não está verificado

- A **verificação manual da seção 8** do checklist (feita por Boni, sem compra nem reembolso reais): não há registro.
- Quem executou (conta de Boni; humano ou ferramenta).
- A saída dos scripts de publicação (`/health`, `/readyz`, `/mcp` sem token em 401, logs sem 5xx).
- O tráfego do serviço de encerramento.
- Se o build `cb0477f0` foi a imagem do Job.

## Correções a registros anteriores

- `PENDENCIAS.md` e o checklist diziam que nada estava publicado: falso desde 15:11 UTC de 16/11.
- Os PRs #170 e #171 afirmaram que o journal de 54 entradas antes e 57 depois do checklist estava errado ("em nenhum caso
  são 57"). **Era um erro**: a conta usou a lista padrão de `scripts/migrate-postgres.mjs`, sem a 0041 e sem a análise. O Job
  mostrou 54 → 57.
- A consulta por `textPayload` com `applied …` voltou vazia porque o Job imprime JSON, gravado em `jsonPayload`.
