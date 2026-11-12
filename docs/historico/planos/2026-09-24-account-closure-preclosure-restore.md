# Pre-closure Backup Restore Protection Implementation Plan

Estado em 24/09/2026: executado no escopo local descartável. O ensaio de dump **anterior** ao encerramento e replay passou; veja [matriz de validação](../../operations/account-closure/validation.md). O checklist abaixo é o roteiro original de implementação, não uma nova solicitação de aprovação. O E2E Playwright não foi repetido porque a prévia local ocupava as portas 3000/3001; os demais gates executados estão registrados na matriz. Nada foi migrado, implantado ou ativado remotamente.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que a restauração de um backup anterior a um encerramento aceito reabra acesso ou recupere conteúdo privado, com prova em bancos e contas sintéticos locais.

**Architecture:** Um diário append-only independente do PostgreSQL registra `PREPARED` antes da transação de encerramento e `ACCEPTED` ou `ABORTED` depois. Um replay isolado recria tombstones e a saga, enquanto uma barreira de prontidão impede tráfego até resolver eventos ambíguos e verificar o estado restaurado.

**Tech Stack:** TypeScript 5.7, Node.js 22, Fastify 5, PostgreSQL local, Vitest 4, pnpm 11, `@google-cloud/storage` 8.2.0, AES-256-GCM e HMAC-SHA-256.

**Spec:** `docs/superpowers/specs/2026-09-24-account-closure-preclosure-backup-restore-design.md`

## Global Constraints

- Somente identidades `@example.invalid`, bancos PostgreSQL locais com nomes `forgelex_closure_restore_<UUID>` e diretórios temporários validados; nunca usar a `DATABASE_URL` do `.env` para os testes.
- Não executar migration, deploy, ativação, criação/configuração de bucket, teste com conta real, commit ou push sem autorização específica. Uma instrução para executar este plano autoriza somente código e testes locais.
- O bucket futuro deve reter eventos por 42 dias; snapshots restauráveis por mais de 35 dias impedem a expiração correspondente. A aplicação de Bucket Lock é gate remoto separado.
- Não armazenar e-mail, senha, token em claro, conteúdo jurídico ou payload de provedor no diário ou logs. IDs necessários ao replay são cifrados com AES-256-GCM sob segredo próprio, versionado.
- `PREPARED` deve estar durável antes de `AccountClosureRepository.begin`; se falhar, não começar a transação. Uma intenção sem terminal mantém o restore fechado.
- `ACCEPTED` ausente após commit não desfaz o bloqueio: preservar recibo e alertar. `ABORTED` só pode ser escrito após confirmar ausência de closure aceita.
- O replay não pode marcar `COMPLETED` por SQL direto; reutiliza as etapas idempotentes do reconciliador e só abre prontidão depois da verificação residual.
- A função de solicitação pode ser desativada sem remover a obrigação de conferir o diário e de acompanhar closures já aceitas.

## Review Focus

- Duas requisições concorrentes para o mesmo subject com chaves diferentes: somente uma closure aceita; a outra fica explicitamente abortada ou pendente, nunca é tratada como aceita automaticamente (Task 2).
- Mesmo nome de objeto já existente com fingerprint diferente: retornar conflito; nunca aceitar silenciosamente o conteúdo de outro pedido (Task 1).
- Evento com ciphertext adulterado ou versão de chave desconhecida: leitura falha fechada e a prontidão permanece indisponível (Tasks 1 e 4).
- Commit local concluído e escrita `ACCEPTED` falhando: manter a conta bloqueada e o recibo válido, alertar e impedir restore até reconciliação (Tasks 2 e 4).
- Backup anterior até à criação do perfil: reconstituir o tombstone por hash e tentar a exclusão externa simulada sem recriar perfil (Tasks 3 e 5).

---

### Task 1 — Contrato, cifra e adaptadores do diário

**Files:**

- Create: `apps/api/src/account/account-closure-journal.ts`
- Create: `apps/api/src/account/account-closure-journal-gcs.ts`
- Test: `apps/api/src/account/account-closure-journal.test.ts`
- Modify: `apps/api/package.json`, `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `digestClosureValue` e `fingerprintClosureRequest` de `account-closure-crypto.ts`.
- Produces: `AccountClosureJournal`, `JournalEvent`, `journalKey`, `sealJournalIds`, `openJournalIds`, `prepareJournalClosure`, `appendAccepted`, `appendAborted` e `GcsAccountClosureJournal`.

- [ ] **Step 1: escrever testes que falham** para round-trip cifrado, adulteração de tag, versão de chave desconhecida, criação condicional repetida com nonce cifrado diferente mas mesmos dados lógicos e conflito de fingerprint. Usar armazenamento falso em memória; nenhum teste acessa GCS.

```ts
const key = Buffer.alloc(32, 7);
const sealed = sealJournalIds('v1', key, 'closure_1', {
  subjectId: 'synthetic',
  userId: 'user_1',
  tenantId: 'tenant_1',
});
expect(openJournalIds({ v1: key }, 'closure_1', sealed)).toEqual({
  subjectId: 'synthetic',
  userId: 'user_1',
  tenantId: 'tenant_1',
});
expect(() => openJournalIds({ v1: key }, 'closure_1', { ...sealed, tag: 'AAAAAAAAAAAAAAAAAAAAAA==' })).toThrow(
  'ACCOUNT_CLOSURE_JOURNAL_INTEGRITY',
);
```

- [ ] **Step 2: confirmar RED** com `pnpm exec vitest run apps/api/src/account/account-closure-journal.test.ts`; a falta das exportações deve ser a causa, não rede ou fixture.
- [ ] **Step 3: implementar o contrato e o codec**. O caminho do evento é `closures/<HMAC(subjectId, idempotencyKey)>/<KIND>.json`; derivar o HMAC com segredo exclusivo e separador de domínio. O corpo tem `schemaVersion: 1`, `kind`, `closureId`, `subjectHash`, `userHash`, `tenantHash`, `statusTokenHash`, `idempotencyKeyHash`, `requestFingerprint`, `policyVersion`, `requestedAt` e `sealedIds`. `sealJournalIds` usa nonce aleatório de 12 bytes, AES-256-GCM e AAD com `closureId`/versão. Cada objeto é serializado como `{ payload: JournalEvent, mac: string }`, com HMAC sobre JSON canônico, e a leitura valida o MAC antes do parse de domínio. Recusar chave diferente de 32 bytes.

```ts
export type JournalKind = 'PREPARED' | 'ACCEPTED' | 'ABORTED';
export interface SealedJournalIds {
  keyVersion: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}
export interface PreparedJournalInput {
  key: string;
  closureId: string;
  requestFingerprint: string;
  sealedIds: SealedJournalIds;
  subjectHash: string;
  userHash: string;
  tenantHash: string;
  statusTokenHash: string;
  idempotencyKeyHash: string;
  policyVersion: string;
  requestedAt: string;
}
export interface PreparedJournalEvent extends PreparedJournalInput {
  schemaVersion: 1;
  kind: 'PREPARED';
}
export type JournalEvent =
  | PreparedJournalEvent
  | {
      schemaVersion: 1;
      key: string;
      closureId: string;
      kind: 'ACCEPTED' | 'ABORTED';
      recordedAt: string;
    };
export interface AccountClosureJournal {
  append(event: JournalEvent): Promise<'created' | 'exists'>;
  read(key: string, kind: JournalKind): Promise<JournalEvent | undefined>;
  list(): Promise<JournalEvent[]>;
}
export function prepareJournalClosure(
  journal: AccountClosureJournal,
  input: PreparedJournalInput,
): Promise<PreparedJournalEvent>;
export function appendAccepted(journal: AccountClosureJournal, prepared: PreparedJournalEvent): Promise<void>;
export function appendAborted(journal: AccountClosureJournal, prepared: PreparedJournalEvent): Promise<void>;
```

- [ ] **Step 4: implementar `GcsAccountClosureJournal`** com `Storage.bucket(bucketName).file(path).save(payload, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } })`. Em 412, devolver `exists`; `prepareJournalClosure` lê o objeto, valida MAC/AES e compara campos lógicos e IDs antes de reutilizar o `closureId`. Não comparar bytes cifrados, pois um retry usa nonce diferente. Qualquer outro erro propaga código estável, sem payload. `getFiles({ prefix: 'closures/' })` deve consumir toda a paginação e ordenar nomes; a leitura valida cada envelope. Injetar cliente falso nos testes para provar `ifGenerationMatch: 0` e erro parcial de listagem.
- [ ] **Step 5: fixar `@google-cloud/storage@8.2.0`** em `apps/api/package.json` via pnpm, atualizar lockfile e executar o teste focal até GREEN, `pnpm --filter @forgelex/api typecheck` e `pnpm exec prettier --check` dos arquivos tocados.

### Task 2 — Gravação anterior ao bloqueio e falhas de dupla escrita

**Files:**

- Modify: `apps/api/src/account/account-closure-service.ts`
- Modify: `apps/api/src/account/account-closure-routes.ts`
- Test: `apps/api/src/account/account-closure-service.test.ts`
- Test: `apps/api/src/account/account-closure-routes.test.ts`

**Interfaces:**

- Consumes: `AccountClosureJournal` e `JournalEvent` da Task 1.
- Produces: `AccountClosureServiceOptions.journal`, `journalKeySecret`, `journalEncryptionKeys`, e erro público `ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE` (503).

- [ ] **Step 1: adicionar testes RED**: `PREPARED` falha sem chamar `repository.begin`; `begin` falha e `findBySubjectHash` confirma ausência antes de `ABORTED`; commit aceito com falha de `ACCEPTED` devolve o mesmo recibo e deixa intenção; retry escreve `ACCEPTED` sem nova closure; fingerprint divergente e concorrência não reutilizam intenção errada.
- [ ] **Step 2: executar** `pnpm exec vitest run apps/api/src/account/account-closure-service.test.ts apps/api/src/account/account-closure-routes.test.ts` e registrar o erro esperado.
- [ ] **Step 3: inserir o diário no fluxo** após as validações existentes e antes de `begin`. O `closureId` vem do `PREPARED` previamente lido ou recém-criado, não de um novo UUID no replay. Ao falhar `ACCEPTED` depois do commit, emitir apenas `closureId` e código estável no log; devolver o recibo derivado pela chave original.

```ts
const prepared = await prepareJournalClosure(journal, {
  key,
  closureId: randomUUID(),
  requestFingerprint,
  sealedIds,
  subjectHash,
  userHash,
  tenantHash,
  statusTokenHash,
  idempotencyKeyHash,
  policyVersion: input.policyVersion,
  requestedAt: now.toISOString(),
});
let result;
try {
  result = await repository.begin({ ...beginInput, id: prepared.closureId });
} catch (error) {
  try {
    const committed = await repository.findBySubjectHash(beginInput.subjectHash);
    if (!committed) await appendAborted(journal, prepared);
  } catch {
    structuredLog('error', 'account_closure.journal.unresolved', { closureId: prepared.closureId });
  }
  throw error;
}
await appendAccepted(journal, prepared).catch(() =>
  structuredLog('error', 'account_closure.journal.pending', { closureId: result.closure.id }),
);
return { ...result, statusToken };
```

- [ ] **Step 4: ajustar o mapeamento HTTP** para erro de diário antes do commit retornar 503 sem iniciar fechamento; manter a resposta 202 depois de commit comprovado, mesmo se o evento terminal estiver pendente. Reexecutar testes focais até GREEN, `pnpm lint` e `pnpm typecheck`.

### Task 3 — Reaplicação transacional no banco restaurado

**Files:**

- Modify: `packages/persistence/src/repositories/account-closure-repository.ts`
- Test: `packages/persistence/src/repositories/account-closure-repository.test.ts`
- Modify: `apps/api/src/account/account-closure-reconciler.ts` somente para permitir execução dirigida por `closureId`.

**Interfaces:**

- Consumes: dados verificados de um `ACCEPTED` e IDs abertos pelo codec da Task 1.
- Produces: `AccountClosureRepository.restoreAccepted(input: CreateAccountClosureInput): Promise<AccountClosureRecord>` e `AccountClosureReconciler.runOneForClosure(closureId, now?)`.

- [ ] **Step 1: escrever testes RED**: restore ausente insere `account_closures` em `ACCESS_BLOCKED`, cinco etapas pendentes, desabilita perfil/tenant, revoga membership/API keys numa transação; se o perfil não existe, mantém hashes e IDs cifrados abertos para a etapa Supabase; segunda chamada não duplica nada; `closureId` divergente para o mesmo `subjectHash` falha fechada.
- [ ] **Step 2: executar** `pnpm exec vitest run packages/persistence/src/repositories/account-closure-repository.test.ts` e confirmar RED.
- [ ] **Step 3: implementar `restoreAccepted`** sobre a tabela `account_closures` existente, sem nova migration. Reusar a ordem de `orderedStepTypes`; verificar conflito antes de inserir; `UPDATE` condicional de usuário/tenant/membership e revogação de chaves no mesmo transaction. Não exigir perfil pré-existente: os três IDs podem constar da closure mesmo se não há linhas correspondentes. O `access_blocked_at` vem do aceite registrado, não do instante do replay.

```ts
const tx = await this.client.transaction();
try {
  const found = await tx.execute({
    sql: 'SELECT id, status_token_hash FROM account_closures WHERE subject_hash = ?',
    args: [input.subjectHash],
  });
  const row = found.rows[0];
  if (row && (row.id !== input.id || row.status_token_hash !== input.statusTokenHash))
    throw new Error('ACCOUNT_CLOSURE_RESTORE_CONFLICT');
  if (!row) {
    await tx.execute({
      sql: `INSERT INTO account_closures
        (id, subject_id, user_id, tenant_id, subject_hash, user_hash, tenant_hash,
         status_token_hash, idempotency_key_hash, request_fingerprint, policy_version,
         status, requested_at, updated_at, access_blocked_at, next_attempt_at, attempt_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCESS_BLOCKED', ?, ?, ?, ?, 0)`,
      args: [
        input.id,
        input.subjectId,
        input.userId,
        input.tenantId,
        input.subjectHash,
        input.userHash,
        input.tenantHash,
        input.statusTokenHash,
        input.idempotencyKeyHash,
        input.requestFingerprint,
        input.policyVersion,
        input.requestedAt,
        input.requestedAt,
        input.requestedAt,
        input.requestedAt,
      ],
    });
    for (const stepType of orderedStepTypes) {
      await tx.execute({
        sql: `INSERT INTO account_closure_steps
        (id, closure_id, step_type, status, attempt_count, next_attempt_at, created_at, updated_at)
        VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
        args: [randomUUID(), input.id, stepType, input.requestedAt, input.requestedAt, input.requestedAt],
      });
    }
    await tx.execute({
      sql: "UPDATE forgelex_user_profiles SET status = 'DISABLED', updated_at = ?, deactivated_at = ? WHERE id = ?",
      args: [input.requestedAt, input.requestedAt, input.userId],
    });
    await tx.execute({
      sql: "UPDATE forgelex_tenants SET status = 'DISABLED', updated_at = ?, deactivated_at = ? WHERE id = ?",
      args: [input.requestedAt, input.requestedAt, input.tenantId],
    });
    await tx.execute({
      sql: "UPDATE forgelex_tenant_memberships SET status = 'REVOKED', updated_at = ?, revoked_at = ? WHERE tenant_id = ?",
      args: [input.requestedAt, input.requestedAt, input.tenantId],
    });
    await tx.execute({
      sql: 'UPDATE api_keys SET revoked_at = ? WHERE tenant_id = ? AND revoked_at IS NULL',
      args: [input.requestedAt, input.tenantId],
    });
  }
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
return (await this.findById(input.id))!;
```

- [ ] **Step 4: estender a reclamação de etapa** com filtro parametrizado por `closureId`, sem mudar o comportamento do worker normal; teste que uma closure sintética vizinha não é executada pela reconciliação dirigida. Reexecutar testes até GREEN, `pnpm --filter @forgelex/persistence typecheck` e `pnpm --filter @forgelex/api typecheck`.

### Task 4 — Coordenador de replay e barreira de prontidão

**Files:**

- Create: `apps/api/src/account/account-closure-restore.ts`
- Test: `apps/api/src/account/account-closure-restore.test.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/app.test.ts`
- Modify: `.env.example`

**Interfaces:**

- Consumes: diário da Task 1, `restoreAccepted`/`runOneForClosure` da Task 3.
- Produces: `AccountClosureRestoreGate.check(): Promise<boolean>`, `AccountClosureRestoreGate.replay(): Promise<RestoreSummary>` com `RestoreSummary = { reapplied: number; completed: number }`, e `BuildAppOptions.accountClosureJournal` para testes.

- [ ] **Step 1: testes RED** para listagem incompleta, evento corrompido, `PREPARED` sem terminal, `ACCEPTED` sem closure local, falha de banco e falha de rede na conferência inicial: `/readyz` e rota protegida retornam 503; após replay completo e nova conferência retornam estado normal. Uma conexão perdida invalida a conferência anterior. Depois de uma conferência válida e com o banco contínuo, falha de escrita do diário em nova solicitação deve produzir 503 somente nessa solicitação, enquanto `GET /api/v2/account/closure/:closureId` e o worker continuam disponíveis. `ABORTED` com closure existente é conflito, não autorização de tráfego.
- [ ] **Step 2: executar** `pnpm exec vitest run apps/api/src/account/account-closure-restore.test.ts apps/api/src/app.test.ts` e confirmar RED.
- [ ] **Step 3: implementar o coordenador**: listar e validar todos os eventos; para cada `ACCEPTED`, chamar `restoreAccepted`, executar apenas suas etapas pendentes e verificar residuais; intenções sem terminal param o processo com código estável. `check` não altera o banco. A conferência só abre a barreira após lista íntegra e correspondência de todos os eventos aplicáveis.

```ts
const events = await journal.list();
const grouped = new Map<string, { prepared?: PreparedJournalEvent; accepted?: JournalEvent; aborted?: JournalEvent }>();
for (const event of events) {
  const group = grouped.get(event.key) ?? {};
  if (event.kind === 'PREPARED') group.prepared = event;
  if (event.kind === 'ACCEPTED') group.accepted = event;
  if (event.kind === 'ABORTED') group.aborted = event;
  grouped.set(event.key, group);
}
for (const intent of grouped.values()) {
  if (!intent.prepared || (!intent.accepted && !intent.aborted)) return false;
  if (intent.accepted && intent.aborted) return false;
  const local = await repository.findBySubjectHash(intent.prepared.subjectHash);
  if (intent.accepted && (!local || local.id !== intent.prepared.closureId || !local.accessBlockedAt)) return false;
  if (intent.aborted && local?.id === intent.prepared.closureId) return false;
}
return true;
```

- [ ] **Step 4: integrar ao Fastify**: `FORGELEX_ACCOUNT_CLOSURE_JOURNAL_REQUIRED=true` exige bucket e segredos válidos mesmo que a flag de novas solicitações esteja `false`; quando exigido, conferir antes de abrir prontidão e usar hook que retorna 503 às rotas de negócio enquanto a barreira está fechada. `/health` pode informar processo vivo, mas `/readyz` deve incluir `accountClosureRestore: false`; não confiar apenas em `/readyz` para bloquear tráfego. Erro/reconexão de persistência fecha a barreira. Documentar no `.env.example` os nomes das variáveis, sem valores reais.
- [ ] **Step 5: reexecutar testes focais até GREEN**, `pnpm lint`, `pnpm typecheck` e `pnpm test`; preservar todos os testes anteriores do fluxo de encerramento.

### Task 5 — Ensaio de backup anterior ao encerramento, somente local

**Files:**

- Create: `scripts/verify-account-closure-preclosure-restore.mjs`
- Create: `scripts/account-closure-journal-file.mjs`
- Modify: `package.json`
- Modify: `docs/operations/account-closure/runbook.md`
- Modify: `docs/operations/account-closure/validation.md` após executar os gates, com resultados observados.

**Interfaces:**

- Consumes: `AccountClosureService`, `AccountClosureRestoreGate`, reconciliador e utilitários de banco descartável existentes.
- Produces: `pnpm verify:account-closure-preclosure-restore` e relatório JSON sem PII nem segredos.

- [ ] **Step 1: escrever o ensaio com asserções antes do replay**. Usar `adminConnectionUrl()` de `scripts/account-closure-test-db.mjs`; ele só aceita `localhost`/`127.0.0.1`/`::1` e banco `/postgres`. Criar dois bancos com prefixo `forgelex_closure_restore_` e UUIDs, diretório do dump e diretório do diário temporários distintos; validar nomes/caminhos antes do cleanup.
- [ ] **Step 2: migrar somente o banco local descartável**, criar usuário `@example.invalid`, tenant pessoal, chave API, matter e compra fictícia; fazer `pg_dump --format=custom` **antes** de solicitar o encerramento. No banco de origem, solicitar closure com Auth falso e executar cinco etapas com `AccountIdentityAdmin` falso; nunca chamar Supabase.
- [ ] **Step 3: restaurar no segundo banco descartável** e demonstrar que o dump antigo ainda contém matter/chave ativa e não contém tombstone; com diário externo presente, `gate.check()` deve ser `false` e o app deve negar tráfego. Depois `gate.replay()`, confirmar closure bloqueada, chave/JWT negados, matter removida, compra minimizada, status consultável pelo recibo sintético e segunda execução idempotente.

```js
assert.equal(
  Number((await target.execute({ sql: 'SELECT COUNT(*) AS n FROM account_closures', args: [] })).rows[0].n),
  0,
);
assert.equal(await gate.check(), false);
await gate.replay();
assert.equal(await gate.check(), true);
assert.equal((await gate.replay()).reapplied, 0);
```

- [ ] **Step 4: injetar falhas** em gravação `PREPARED`, gravação `ACCEPTED`, ciphertext, leitura de listagem e replay interrompido. Cada falha deve manter a barreira fechada ou o banco original bloqueado conforme o caso; executar novamente após correção da fixture.
- [ ] **Step 5: executar o gate focal completo** com `FORGELEX_ACCOUNT_CLOSURE_TEST_ADMIN_URL` apontando exclusivamente para uma instância PostgreSQL local descartável. Se Docker estiver indisponível, iniciar um cluster PostgreSQL temporário separado pelo `initdb`/`pg_ctl` local com porta livre; nunca usar `.env` ou pooler remoto. Registrar nomes dos bancos, comandos, contagens, cleanup e saída, sem token.
- [ ] **Step 6: executar** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e:account-closure`, `pnpm test:postgres:account-closure`, `pnpm verify:account-closure-restore` e o novo gate; atualizar runbook/matriz somente com o que efetivamente passou, e `git diff --check`. Não afirmar que IAM, bucket remoto, migration ou produção foram validados.

## Handoff

A execução foi nativa no checkout atual, com revisão paralela somente de leitura e sem mutação remota. A prova local e seus limites estão na matriz de validação e na especificação; os checkboxes acima preservam o roteiro original, não representam pendências de aprovação do usuário. Commit e push continuam gates separados e só ocorrem com autorização explícita.
