# Daybreak — checklist de deploy (16/11/2026)

Preparado a partir de `main` em `d42337d` (CI do push: sucesso). **Não executa nada e não autoriza nada por si:** a
autorização de Boni para commit, push e deploy (14/11) cobre a publicação, mas não compras ou reembolsos reais nem o
encerramento de achados no Daybreak. Boni executa, confere e aprova; cada passo registra data, evidência e decisão.
Fontes: `ops/gcp/production/README.md`, `docs/operations/draft-save-recovery.md`, `PENDENCIAS.md`, Frente S do plano.

## O que vai a produção

Código das PRs #153–#165 e #163 (memo de pesquisa por apps OAuth, só no MCP). **Três migrations aditivas**, as únicas
pendentes sobre o último registro (journal de 54 entradas, após a 0041; esperado: **57**):

| ID | Efeito | Observação |
| --- | --- | --- |
| `persistence-0042-webhook-admission` | tabela `webhook_admission`, `claim_token`, `last_error`, índice por tenant | **apaga** `webhook_deliveries.response_body_excerpt` (`UPDATE … = NULL`); não volta |
| `persistence-0043-execution-stream-leases` | tabelas de lease/admissão de SSE e três índices | só cria |
| `billing-ledger-0011-refund-recovery` | quatro colunas em `billing_refund_requests` | pedidos `PENDING` com rastro local de tentativa viram `RECONCILIATION_REQUIRED` |

`scripts/migrate-postgres.mjs` aplica **tudo o que estiver pendente** (persistência + ledger; análise só com
`FORGELEX_ANALISE_ENABLED=true`), uma transação por migration. Sem filtro. A 0041 já está aplicada e fica fora.
Nenhuma variável `FORGELEX_*` nova no serviço. Com migration pendente a API de produção **recusa subir**: migrar antes.

## 1. Pré-condições (somente leitura)

- [ ] Máquina de Boni com `gcloud` autenticado no projeto `project-bbbe1209-c295-4720-867`, `gh` autenticado e PowerShell 7.
- [ ] Checkout limpo em `main` igual a `origin/main` (SHA `d42337d…` ou posterior; o script recusa outro).
- [ ] CI do SHA a publicar verde (`d42337d`: sucesso; o script confere de novo).
- [ ] `pwsh -NoProfile -File ops/gcp/production/deploy-from-main.tests.ps1` passa.
- [ ] Inventário salvo no registro: revisões e tráfego de `forgelex-api-prod` e `forgelex-closure-hml-private`. O último
      registro diz que a API em produção é **`forgelex-api-prod-draftsave-cd94c2c`** (flag `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED=true`)
      e o encerramento, `forgelex-closure-hml-private-cd94c2c`. Confirmar; é o alvo de reversão.
- [ ] Decisão de Boni registrada: aplicar as três migrations juntas (o script não filtra) e publicar.

## 2. Pré-checagens no banco (read-only, instância `forgelex-hml-pg`, banco `forgelex`)

- [ ] `SELECT count(*) FROM forgelex_migrations;` → 54; e nenhum dos três IDs acima presente.
- [ ] `SELECT status, count(*) FROM billing_refund_requests GROUP BY 1;` → anotar os `PENDING`. A migration 0011
      move para reconciliação os que têm rastro local (`refund-ledger:<id>` ou pagamento `REFUNDED`); com zero `PENDING`, nada muda.
- [ ] `SELECT count(*) FROM webhook_deliveries WHERE response_body_excerpt IS NOT NULL;` → ciência do que será apagado.
- [ ] Contagens de referência (casos, minutas, `ledger_entries`, `agentic_execution_jobs`) para comparar depois.

## 3. Ensaio local (recomendado; qualquer máquina com PostgreSQL descartável)

- [ ] Banco com as migrations até a 0041, `pnpm build`, `DATABASE_URL=… node scripts/migrate-postgres.mjs`: aplica as três.
      Rodar de novo: nada a aplicar, sem erro.

## 4. Backup

- [ ] `gcloud sql backups create --instance=forgelex-hml-pg --project=project-bbbe1209-c295-4720-867` e conferir
      `SUCCESSFUL` (`gcloud sql backups list …`). Registrar o ID, sem credencial.

## 5. Aplicar as migrations

**Atenção:** a imagem em produção (`sha256:d22e225b…`, de `cd94c2c`) **não contém** estas três migrations. O Job precisa de uma
imagem de `d42337d`. Opção recomendada: construir só a imagem com `build-from-main.ps1` (parâmetros no README; ele
recusa branch/SHA divergente) e usar o digest do resultado do Cloud Build. Não verifiquei se `deploy-from-main.ps1 -NoTraffic`
sobe a revisão com migration pendente (a API recusa subir e a sonda `/readyz` falharia); por isso não o uso antes de migrar.

- [ ] Cloud Run Job temporário, com a imagem por digest de `d42337d`, o segredo de `DATABASE_URL` já usado pelo serviço (sem lê-lo
      nem imprimi-lo) e o Cloud SQL vinculado; comando `node scripts/migrate-postgres.mjs`, `FORGELEX_AUTO_MIGRATE` inalterado.
- [ ] Armadilhas de 14/11 (0041): rodar a partir do diretório em que o módulo `postgres` resolve; o script **não** normaliza o
      parâmetro `host` do socket do Cloud SQL como o aplicativo faz. Fazer antes uma conexão de teste read-only (`SELECT 1`) no mesmo Job.
- [ ] Saída esperada: `applied persistence-0042-webhook-admission`, `applied persistence-0043-execution-stream-leases`,
      `applied billing-ledger-0011-refund-recovery`, nesta ordem.
- [ ] Excluir o Job temporário.

## 6. Conferir as migrations

- [ ] `forgelex_migrations`: 57 entradas, os três IDs presentes, sem IDs inesperados.
- [ ] Existem `webhook_admission` (1 linha), `execution_stream_admission_lock` (1 linha), `execution_stream_leases` e as
      colunas `operation_state`, `provider_payment_id`, `provider_result`, `operation_error` em `billing_refund_requests`.
- [ ] Contagens de referência iguais às da seção 2; `billing_refund_requests` com `RECONCILIATION_REQUIRED` apenas se havia rastro local.
- [ ] `/health` e `/readyz` seguem 200 na revisão ainda em produção (schema aditivo: a imagem antiga continua funcionando).

## 7. Publicar

- [ ] `./ops/gcp/production/deploy-from-main.ps1 -DryRun` (só lê e mostra o plano). Conferir: SHA, que só imagem e
      `FORGELEX_SOURCE_SHA` mudam, e o valor efetivo das flags (a de salvamento recuperável deve continuar `true`).
- [ ] `./ops/gcp/production/deploy-from-main.ps1 -NoTraffic`, anotar o build ID; conferir a revisão nova sem tráfego.
- [ ] `./ops/gcp/production/deploy-from-main.ps1 -ReleaseBuildId '<id>'`. O script troca o tráfego (encerramento, depois API),
      verifica `/health`, `/readyz`, `/mcp` sem token (401) e 5xx nos logs, e reverte sozinho se falhar.
- [ ] Guardar a saída do script (build ID, digest, comandos de reversão).

## 8. Verificação depois da troca

Automática (script): readiness, 401 do `/mcp`, logs sem 5xx. Manual, por Boni, **sem compra nem reembolso reais**:

- [ ] Logs de 15 minutos sem 5xx nem `error` nas revisões novas.
- [ ] `forgelex.connection_status` no Claude responde autenticado; uma pesquisa de jurisprudência e a ferramenta do painel funcionam.
- [ ] Memo de pesquisa por app conectado via OAuth (#163) executa e **não** ganha acesso fora do MCP.
- [ ] Mesa: abrir uma execução com fluxo SSE (admissão persistente, limite por usuário) e salvar uma peça (recibo de salvamento ainda funciona).
- [ ] Anexo/ingestão dentro dos limites aceita; acima deles recusa antes de gravar.
- [ ] Webhooks: se existir endpoint cadastrado, conferir `last_error` e a entrega. Destino agora fixado em IP validado, sem
      redirecionamento e sem corpo remoto no histórico; endpoint que dependia de HTTP, IP privado ou redirect passará a falhar.
- [ ] Telas de chaves de API e integrações abrem; a autorização é por ferramenta.
- [ ] Pagamentos: só observar que a rota do webhook do provedor responde; não gerar compra. Recuperação de reembolso é método
      do serviço, **sem CLI ou endpoint**: um pedido em `RECONCILIATION_REQUIRED` exige intervenção manual de Boni.

## 9. Reversão

- Tráfego: `gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-draftsave-cd94c2c=100`
  e o equivalente para `forgelex-closure-hml-private` (`…-cd94c2c`). Confirmar os nomes no inventário da seção 1.
- Schema: **não reverter** (aditivo; a imagem antiga ignora as colunas e tabelas novas). Exceção a avaliar: a 0011 pode ter
  colocado pedidos em `RECONCILIATION_REQUIRED`, status que a imagem antiga não conhece; com zero `PENDING` na seção 2, não há efeito.
- O `UPDATE` da 0042 sobre `response_body_excerpt` só se desfaz restaurando o backup da seção 4; avaliar antes de qualquer restauração.

## 10. Registro (Boni)

- [ ] Novo arquivo em `docs/operations/daybreak/` com: backup, IDs das migrations e horário, build ID, digest, revisões,
      resultado das seções 6 e 8, e o que mudou para clientes. Atualizar o topo de `PENDENCIAS.md` e a seção S.4 do plano.
- [ ] Decisão de Boni sobre fechar S8 e, separadamente, sobre o encerramento dos achados no Daybreak (não implícito nesta publicação).

## Riscos residuais conhecidos (Frente S)

Filas e limites de webhook/SSE são candidatos de homologação, não capacidade medida em produção; leases usam o relógio da
API; SSE mantém até três falhas de reautenticação antes de encerrar; atestação independente da origem do build e IAM de
produção não foram verificados.
