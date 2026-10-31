# Migration `persistence-0036` — plano de aplicação (31/10/2026)

**Estado:** ensaiada localmente; **não aplicada em produção**. Aplicar depende de
autorização e credenciais de Boni no banco produtivo (`forgelex`, instância
`forgelex-hml-pg`). Este documento não autoriza a operação.

## O que a migration faz

`persistence-0036-agentic-admission-deadline` é aditiva:

1. `ALTER TABLE agentic_execution_jobs ADD COLUMN admission_expires_at TEXT` (nula; só metadado no PostgreSQL).
2. `CREATE INDEX agentic_execution_jobs_admission_idx … WHERE admission_expires_at IS NOT NULL` (índice parcial).
3. Preenche a coluna só nas tarefas `WAITING`, a partir de `payload_json->>'admissionExpiresAt'`.

Nada é removido ou reescrito. Sem rollback de schema por exclusão; a imagem antiga
continua funcionando com a coluna criada (ignora-a).

## Ensaio (PostgreSQL 16 local, banco descartável)

Banco com as 45 migrations anteriores e 5.001 tarefas (41 `WAITING`, 1 delas sem prazo):

| Verificação                            | Resultado                                                  |
| -------------------------------------- | ---------------------------------------------------------- |
| Duração da migration                   | 10 ms                                                      |
| Tarefas `WAITING` com prazo preenchido | 40 de 40                                                   |
| `WAITING` sem prazo no payload         | permanece nula (1)                                         |
| Tarefas fora de `WAITING` com prazo    | 0                                                          |
| Índice parcial criado                  | sim                                                        |
| Reaplicar                              | recusada (coluna existe); transação desfaz, dados intactos |

## Atenção: `pnpm db:migrate` aplica tudo que estiver pendente

Em relação à publicação de 30/10 (journal com 47 entradas), a `main` tem **duas** migrations
a mais, não só a 0036:

| Migration                                     | Efeito                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `billing-ledger-0010-commercial-inference`    | tabelas da execução comercial (aditiva; ligada à ativação comercial) |
| `persistence-0036-agentic-admission-deadline` | esta                                                                 |

Conferir `forgelex_migrations` no banco antes: se a `0010` já estiver registrada, só a
0036 está pendente. Se não estiver, Boni decide se aplica as duas (o script não
filtra) ou só a 0036 por procedimento limitado.

## Sequência

1. Conferir `forgelex_migrations` (IDs aplicados × artefato da `main`).
2. Backup manual do Cloud SQL, `SUCCESSFUL`, antes do DDL.
3. Aplicar com `DATABASE_URL` do banco autorizado, transação por migration,
   `lock_timeout` 3 s e `statement_timeout` 120 s (como em 30/10). `FORGELEX_AUTO_MIGRATE` segue desligado.
4. Verificar: IDs aplicados; contagem de `agentic_execution_jobs` igual à anterior;
   `admission_expires_at` preenchida nas `WAITING`; casos, minutas e ledger acessíveis.
5. Só depois publicar a imagem que contém a `main`.
6. Registrar IDs, versão, instante e integridade em `docs/operations/agentic-workspace/`.
