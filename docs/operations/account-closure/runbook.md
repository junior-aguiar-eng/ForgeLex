# Operação do encerramento de conta pessoal

Estado: procedimento técnico local; publicação, migration remota, deploy e habilitação exigem autorizações separadas. Política e termos são minutas sem revisão jurídica humana. Usar somente com `FORGELEX_ACCOUNT_CLOSURE_ENABLED=false` até os gates documentados em [validation.md](validation.md) estarem aprovados.

## Pré-condições e ativação

Confirmar versão do artefato, migrations, segredos de 32 bytes ou mais em secret manager, `FORGELEX_SUPABASE_SECRET_KEY` exclusivamente no servidor, responsável de plantão, alarmes e backups. Registrar aprovação individual para migration remota, deploy e mudança da flag; nenhum desses atos decorre automaticamente dos testes locais. A operação destrutiva fica desabilitada por padrão. Depois das aprovações, ativar `FORGELEX_ACCOUNT_CLOSURE_ENABLED=true` e `FORGELEX_ACCOUNT_CLOSURE_WORKER_ENABLED=true` de forma controlada. O intervalo do reconciliador vem de `FORGELEX_ACCOUNT_CLOSURE_RECONCILER_INTERVAL_MS` (padrão 60000) e o limite de tentativas de `FORGELEX_ACCOUNT_CLOSURE_MAX_ATTEMPTS` (padrão 12); valores inválidos impedem o worker de iniciar.

Rollback operacional é desligar **somente** a aceitação de novas solicitações pela feature flag, após avaliar as solicitações já aceitas. Não remover tombstones, não reativar identidades, não reverter migrations, não desabilitar a consulta por token de recibos existentes e não interromper reconciliação em andamento sem plano individual para cada `closureId`. Mudança do worker é decisão própria: desligá-lo cria backlog, não restaura acesso.

## Monitoramento e atendimento

Monitorar backlog de etapas `PENDING`/`RETRYABLE`/`LEASED`, idade da mais antiga, tentativas, latência entre `requested_at`, `identity_removed_at` e `completed_at`, falhas por código estável, `RECONCILIATION_REQUIRED`, exceções vencidas, expurgo residual e atraso dos backups. Alertar antes dos marcos de 24 horas para identidade, 7 dias para conteúdo privado e 35 dias para cópias. Não registrar token, senha, payload jurídico, e-mail nem segredo em logs. Correlacionar pelo `closureId` e código de erro; limitar o acesso aos registros.

O suporte recebe somente `closureId`. Nunca solicitar `statusToken` por e-mail, chat ou outro canal inseguro, nem reproduzir o token em tickets. Validar a identidade do solicitante pelo procedimento institucional aprovado, ainda pendente nesta fase. Não prometer conclusão nem prazo diferente da matriz jurídica em revisão; `RECONCILIATION_REQUIRED` exige operador, sem reabertura de acesso.

## Falha e reconciliação

1. Identificar a etapa exata, o código de erro, o número de tentativas, timestamps e efeito externo já observado. Não repetir uma etapa concluída nem apagar o recibo técnico.
2. Supabase: verificar no ambiente correto se o subject ainda existe. Exclusão já aplicada é idempotente; não criar novo usuário. Se a falha for de credencial ou rede, corrigir a dependência antes de retomar.
3. Banco: verificar integridade de migrations, tombstone e bloqueio, transações e réplicas; não alterar `status` diretamente para `COMPLETED` nem liberar chaves/sessões. Escalar falha de persistência antes de nova tentativa.
4. Minimização financeira: conferir que comprovantes e valores exigidos permanecem, mas campos jurídicos, URLs sensíveis, identificadores diretos dispensáveis e payloads foram redigidos. Falha na verificação residual impede conclusão.
5. Backup/restauração: restaurar isoladamente, reaplicar/validar tombstones antes de qualquer tráfego, comprovar login negado e retenções. Não restaurar o perfil ativo do titular.
6. Uma closure terminal somente pode ser retomada por operador autorizado via `AccountClosureRepository.resumeFailedStep({ closureId, now })`, após documentar causa e correção. A transição exige exatamente uma etapa `FAILED`, mantém o bloqueio e reinicia o orçamento de tentativas dessa etapa; a contagem total da closure permanece. Não há endpoint público de retomada. Registrar operador, ticket, versão, instante, etapa e resultado fora do repositório, sem segredo.

Uma retenção excepcional exige categoria específica, fundamento e referência da autoridade/caso, responsável nominal interno, início e `reviewAt` futuro, com revisão no máximo a cada 90 dias. Expiração ou revogação exige nova avaliação do expurgo. A exceção não autoriza conservar categoria diversa nem conteúdo jurídico em registros fiscais.

## Ensaios locais

`pnpm test:e2e:account-closure` usa Auth simulado e banco em memória; não acessa projeto Supabase real. `pnpm test:postgres:account-closure` e `pnpm verify:account-closure-restore` exigem `FORGELEX_ACCOUNT_CLOSURE_TEST_ADMIN_URL` apontando para PostgreSQL **local** e banco administrativo `/postgres`; cada script cria e remove somente bancos com prefixo `forgelex_closure_smoke_` ou `forgelex_closure_restore_` e UUID próprio. A restauração precisa de `pg_dump` e `pg_restore` no `PATH` ou das variáveis `FORGELEX_PG_DUMP_BIN` e `FORGELEX_PG_RESTORE_BIN`. Nunca direcionar esses comandos ao banco compartilhado, remoto ou produtivo. O teste de restauração usa dois bancos temporários e um dump temporário; falha de cleanup deve ser investigada antes de repetir.
