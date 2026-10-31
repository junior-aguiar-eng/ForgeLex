# Migration `persistence-0036` aplicada — 31/10/2026

Operação autorizada por Boni e executada em sessão no computador dele (proxy do
Cloud SQL local, credencial `forgelex_app`). Relato transcrito do operador; as
verificações descritas como feitas foram feitas pela sessão executora.
Plano e ensaio: [2026-10-31-migration-0036-plano.md](2026-10-31-migration-0036-plano.md).

## Resultado

| Item               | Valor                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Banco              | `forgelex`, instância `forgelex-hml-pg` (nome histórico), PostgreSQL 16                               |
| Migration aplicada | `persistence-0036-agentic-admission-deadline`, 698 ms, `2026-10-31T18:19:19.786Z`                     |
| Backup pré-DDL     | `1793470643209`, `ON_DEMAND`, `SUCCESSFUL` (18:17:23Z a 18:18:54Z)                                    |
| Execução           | uma transação, `lock_timeout` 3 s, `statement_timeout` 120 s, advisory lock; auto-migration desligada |
| Comando            | script limitado à 0036, DDL reaproveitado do `dist`; `pnpm db:migrate` não foi usado                  |
| Journal            | 48 entradas antes, 49 depois                                                                          |

## Correção ao plano

O plano de 31/10 previa duas migrations pendentes. Na inspeção, a
`billing-ledger-0010-commercial-inference` já estava registrada desde
`2026-10-30T20:49:44.661Z`. Só a 0036 estava pendente.

## Contagens (iguais antes e depois)

`matters` 3 · `drafts` 2 · `draft_versions` 6 · `ledger_accounts` 23 ·
`ledger_entries` 113 · `billing_accounts` 8 · `agentic_execution_jobs` 1 (`COMPLETED`).
A publicação de 30/10 registrava 110 lançamentos; a diferença é movimento entre os
dois dias, não efeito desta operação.

## O que não ficou demonstrado

- **Backfill:** não havia tarefa `WAITING`; a única está `COMPLETED` e ficou sem prazo, como esperado.
  O preenchimento só foi provado no ensaio local.
- **Índice parcial:** não foi consultado separadamente; a criação estava na transação confirmada.

## Encerramento

Segredo usado só em memória, sem impressão, arquivo ou linha de comando. Proxy encerrado e
porta liberada. Nenhuma imagem publicada; flags, serviços e outros bancos intactos.

## Pendente

Publicar a imagem da `main` (item 5 do plano), por autorização própria de Boni.
