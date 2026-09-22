# Incremento 7.2–7.8 Account Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o encerramento irreversível e reconciliável de contas pessoais do ForgeLex, com bloqueio imediato, revogação de credenciais, expurgo de conteúdo jurídico, retenção mínima e publicação condicionada a revisão jurídica.

**Architecture:** O encerramento será uma saga persistida. A transação inicial bloqueia subject e tenant, revoga credenciais locais e cria etapas idempotentes; um reconciliador executa a exclusão da identidade Supabase, o expurgo, a minimização fiscal e a verificação residual. Um token opaco, armazenado somente como hash, permite consultar o andamento depois da remoção da identidade.

**Tech Stack:** TypeScript 5.7, Node.js, Fastify 5, React 18, Supabase JS 2, Drizzle ORM, libSQL/SQLite, PostgreSQL 16, Vitest 4 e Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-22-incremento-7-encerramento-retencao-design.md`

## Global Constraints

- A subfase 7.1 está concluída documentalmente pela especificação acima; este plano começa na 7.2.
- O texto de confirmação é exatamente `ENCERRAR MINHA CONTA` e a versão inicial da política é `2026-09-22.v1`.
- A reautenticação exige entrada `amr.method=password` emitida nos cinco minutos anteriores; `iat` recente produzido apenas por refresh não basta.
- O bloqueio local por subject e tenant é imediato e obrigatório porque um JWT Supabase já emitido pode permanecer válido até `exp` mesmo depois da exclusão do usuário.
- API keys persistidas são revogadas na transação inicial; chaves estáticas de ambiente são recusadas pelo bloqueio local.
- Conteúdo jurídico identificável sai do armazenamento ativo em até sete dias; identidade e sessões Supabase são removidas em até 24 horas.
- Registros de acesso que se enquadrem no art. 15 do Marco Civil ficam por seis meses; a política interna provisória para registros fiscais minimizados e recibo técnico é de cinco anos, com categoria e termo inicial sujeitos a revisão fiscal/contábil antes da publicação.
- Backups expiram em até 35 dias e uma restauração reaplica tombstones antes de receber tráfego.
- A primeira versão só encerra tenant pessoal com único membro proprietário; tenant compartilhado retorna `ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER`.
- `FORGELEX_ACCOUNT_CLOSURE_ENABLED=false` é o padrão. Testes destrutivos usam tenant descartável.
- Nenhum segredo, token, e-mail, consulta, documento, resultado jurídico ou payload de provedor entra em log, métrica ou registro de etapa.
- Os testes React continuam em `.test.ts`, pois a configuração atual do Vitest descobre `**/*.test.ts`.
- Commit, push, migration remota, deploy e habilitação são gates separados. Os passos de commit só podem ser executados quando houver autorização explícita.

## Review Focus

- Token renovado sem nova senha: deve falhar com `ACCOUNT_CLOSURE_REAUTH_REQUIRED`; Task 5 testa `amr` de refresh e senha antiga.
- JWT ainda válido após exclusão Supabase: deve continuar recebendo `401`; Task 2 testa principal de sessão e API key estática contra tombstone.
- Reuso da mesma idempotency key com corpo ou versão diferentes: deve retornar conflito sem criar segunda saga; Task 2 testa fingerprint divergente.
- Conta com outro membro ou proprietário: deve permanecer ativa e sem chave revogada; Task 2 testa rollback integral.
- Falha depois de efeito externo concluído: o retry deve observar “já ausente” e concluir sem duplicar ou reabrir a conta; Task 3 testa delete Supabase seguido de falha local.

---

### Task 1 — Subfase 7.2: inventário executável e persistência da saga

**Files:**
- Create: `docs/legal/account-closure-data-inventory.md`
- Modify: `packages/persistence/src/schema/schema.ts`
- Modify: `packages/persistence/src/migrations/migration-runner.ts`
- Modify: `packages/persistence/src/migrations/migration-idempotency.test.ts`
- Create: `packages/persistence/src/repositories/account-closure-repository.ts`
- Create: `packages/persistence/src/repositories/account-closure-repository.test.ts`
- Modify: `packages/persistence/src/index.ts`

**Interfaces:**
- Consumes: `ForgeLexDatabase`, `Client` e `runPersistenceMigrations` de `@forgelex/persistence`.
- Produces: `AccountClosureRepository`, `AccountClosureRecord`, `AccountClosureStatus`, `AccountClosureStepType`, `AccountClosureStepRecord`, `RetentionExceptionRecord` e as tabelas `account_closures`, `account_closure_steps`, `retention_exceptions`.

- [ ] **Step 1: escrever o teste de migration e idempotência**

Adicionar a `migration-idempotency.test.ts`:

```ts
it('cria uma única vez as tabelas de encerramento e seus índices', async () => {
  await runPersistenceMigrations(connection.client);
  await runPersistenceMigrations(connection.client);
  const tables = await connection.client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('account_closures','account_closure_steps','retention_exceptions') ORDER BY name",
    args: [],
  });
  expect(tables.rows.map((row) => row.name)).toEqual([
    'account_closure_steps', 'account_closures', 'retention_exceptions',
  ]);
  const migration = await connection.client.execute({
    sql: "SELECT COUNT(*) AS count FROM forgelex_migrations WHERE id = ?",
    args: ['persistence-0023-account-closure'],
  });
  expect(Number(migration.rows[0]?.count)).toBe(1);
});
```

- [ ] **Step 2: executar o teste e confirmar a falha RED**

Run: `pnpm exec vitest run packages/persistence/src/migrations/migration-idempotency.test.ts`

Expected: FAIL porque as três tabelas ainda não existem.

- [ ] **Step 3: declarar o contrato persistido no schema Drizzle**

Adicionar a `schema.ts` tipos compatíveis com estas colunas:

```ts
export const accountClosures = sqliteTable('account_closures', {
  id: text('id').primaryKey(),
  subjectId: text('subject_id'),
  userId: text('user_id'),
  tenantId: text('tenant_id'),
  subjectHash: text('subject_hash').notNull().unique(),
  userHash: text('user_hash').notNull(),
  tenantHash: text('tenant_hash').notNull(),
  statusTokenHash: text('status_token_hash').notNull().unique(),
  idempotencyKeyHash: text('idempotency_key_hash').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  policyVersion: text('policy_version').notNull(),
  status: text('status').notNull(),
  requestedAt: text('requested_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  accessBlockedAt: text('access_blocked_at'),
  identityRemovedAt: text('identity_removed_at'),
  completedAt: text('completed_at'),
  nextAttemptAt: text('next_attempt_at'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastErrorCode: text('last_error_code'),
});

export const accountClosureSteps = sqliteTable('account_closure_steps', {
  id: text('id').primaryKey(),
  closureId: text('closure_id').notNull().references(() => accountClosures.id),
  stepType: text('step_type').notNull(),
  status: text('status').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: text('lease_expires_at'),
  nextAttemptAt: text('next_attempt_at'),
  lastErrorCode: text('last_error_code'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => [
  uniqueIndex('account_closure_steps_closure_type_idx').on(table.closureId, table.stepType),
  index('account_closure_steps_due_idx').on(table.status, table.nextAttemptAt),
]);

export const retentionExceptions = sqliteTable('retention_exceptions', {
  id: text('id').primaryKey(),
  closureId: text('closure_id').notNull().references(() => accountClosures.id),
  category: text('category').notNull(),
  legalBasisReference: text('legal_basis_reference').notNull(),
  authorityReference: text('authority_reference').notNull(),
  responsible: text('responsible').notNull(),
  startsAt: text('starts_at').notNull(),
  reviewAt: text('review_at').notNull(),
  endsAt: text('ends_at'),
  status: text('status').notNull(),
});
```

- [ ] **Step 4: criar a migration `persistence-0023-account-closure`**

Adicionar as três DDLs equivalentes, mais estes índices:

```sql
CREATE UNIQUE INDEX account_closures_subject_idempotency_idx
  ON account_closures(subject_hash, idempotency_key_hash);
CREATE INDEX account_closures_status_due_idx
  ON account_closures(status, next_attempt_at);
CREATE UNIQUE INDEX account_closure_steps_closure_type_idx
  ON account_closure_steps(closure_id, step_type);
CREATE INDEX account_closure_steps_due_idx
  ON account_closure_steps(status, next_attempt_at);
CREATE INDEX retention_exceptions_closure_status_idx
  ON retention_exceptions(closure_id, status, review_at);
```

As tabelas não recebem FK para user ou tenant, pois esses registros serão eliminados ao final.

- [ ] **Step 5: executar os testes de migration**

Run: `pnpm exec vitest run packages/persistence/src/migrations/migration-idempotency.test.ts`

Expected: PASS em SQLite; o teste PostgreSQL permanece condicionado a `FORGELEX_LOCAL_POSTGRES_URL`.

- [ ] **Step 6: escrever o teste RED do repositório**

Criar `account-closure-repository.test.ts` com fixture migrada e este contrato mínimo:

```ts
it('persiste a saga e suas cinco etapas sem dados textuais do usuário', async () => {
  const created = await repository.create({
    id: 'acl_1', subjectId: 'supabase_1', userId: 'user_1', tenantId: 'tenant_1',
    subjectHash: 's'.repeat(64), userHash: 'u'.repeat(64), tenantHash: 't'.repeat(64),
    statusTokenHash: 'k'.repeat(64), idempotencyKeyHash: 'i'.repeat(64),
    requestFingerprint: 'f'.repeat(64), policyVersion: '2026-09-22.v1',
    requestedAt: '2026-09-22T12:00:00.000Z',
  });
  expect(created.status).toBe('REQUESTED');
  expect((await repository.listSteps(created.id)).map((step) => step.stepType)).toEqual([
    'DELETE_SUPABASE_IDENTITY', 'PURGE_PRIVATE_CONTENT',
    'MINIMIZE_RETAINED_RECORDS', 'REMOVE_LOCAL_IDENTITY', 'VERIFY_RESIDUALS',
  ]);
});
```

- [ ] **Step 7: executar o teste e confirmar a falha RED**

Run: `pnpm exec vitest run packages/persistence/src/repositories/account-closure-repository.test.ts`

Expected: FAIL porque o repositório ainda não existe.

- [ ] **Step 8: implementar tipos e operações básicas do repositório**

Usar exatamente estes unions:

```ts
export type AccountClosureStatus =
  | 'REQUESTED' | 'ACCESS_BLOCKED' | 'IDENTITY_REMOVED'
  | 'CREDENTIALS_REVOKED' | 'CONTENT_PURGING' | 'RETAINED_ONLY'
  | 'COMPLETED' | 'RECONCILIATION_REQUIRED';

export type AccountClosureStepType =
  | 'DELETE_SUPABASE_IDENTITY'
  | 'PURGE_PRIVATE_CONTENT'
  | 'MINIMIZE_RETAINED_RECORDS'
  | 'REMOVE_LOCAL_IDENTITY'
  | 'VERIFY_RESIDUALS';

export type AccountClosureStepStatus =
  | 'PENDING' | 'LEASED' | 'RETRYABLE' | 'COMPLETED' | 'FAILED';
```

Implementar:

```ts
create(input: CreateAccountClosureInput): Promise<AccountClosureRecord>
findBySubjectHash(subjectHash: string): Promise<AccountClosureRecord | undefined>
findById(id: string): Promise<AccountClosureRecord | undefined>
findByStatusTokenHash(id: string, tokenHash: string): Promise<AccountClosureRecord | undefined>
listSteps(closureId: string): Promise<AccountClosureStepRecord[]>
claimNextStep(input: { now: string; leaseOwner: string; leaseExpiresAt: string }): Promise<ClaimedClosureStep | undefined>
completeStep(input: { closureId: string; stepType: AccountClosureStepType; now: string; nextStatus: AccountClosureStatus }): Promise<void>
retryStep(input: { closureId: string; stepType: AccountClosureStepType; now: string; nextAttemptAt: string; errorCode: string; terminal: boolean }): Promise<void>
```

O claim PostgreSQL deve usar `FOR UPDATE SKIP LOCKED`; SQLite deve usar update condicional com lease, seguindo o padrão de `WebhookRepository`.

- [ ] **Step 9: registrar o inventário entidade por entidade**

Em `docs/legal/account-closure-data-inventory.md`, registrar quatro grupos completos:

```text
DELETE_PRIVATE: sessions, session_messages, approvals, checkpoints, matters,
legal_documents, document_versions, document_anchors, facts,
fact_source_links, evidence_items, evidence_source_links, evidence_links,
timeline_events, drafts, draft_versions, draft_sections, citation_anchors,
draft_review_findings, draft_approval_requests, draft_approval_decisions,
draft_approval_tokens, matter_authorities, matter_authority_verifications,
legal_issues, research_memos, legal_theses, workflow_checkpoints,
research_search_history, webhook_endpoints, webhook_events,
webhook_deliveries, api_keys.

MINIMIZE_FINANCIAL: ledger_accounts, usage_events, ledger_entries,
billing_accounts, billing_purchases, billing_payments,
billing_webhook_events, billing_invoices, billing_refund_requests,
billing_credit_lots, billing_operations.

DELETE_OPERATIONAL: billing_payment_methods, forgelex_tenant_memberships,
forgelex_tenants, forgelex_user_profiles.

OUT_OF_SCOPE_GLOBAL: jurisprudence_ingestion_runs, jurisprudence_documents,
jurisprudence_document_versions, jurisprudence_source_manifests,
jurisprudence_ingestion_staging, forgelex_migrations.
```

Para cada tabela, incluir chave de seleção, dependência, destino, prazo e campos que não podem sobreviver.

- [ ] **Step 10: executar os testes focados da subfase 7.2**

Run: `pnpm exec vitest run packages/persistence/src/migrations/migration-idempotency.test.ts packages/persistence/src/repositories/account-closure-repository.test.ts`

Expected: PASS.

- [ ] **Step 11: verificar build do pacote**

Run: `pnpm --filter @forgelex/persistence build`

Expected: exit 0.

- [ ] **Step 12: criar checkpoint Git somente se autorizado**

```powershell
git add docs/legal/account-closure-data-inventory.md packages/persistence/src/schema/schema.ts packages/persistence/src/migrations/migration-runner.ts packages/persistence/src/migrations/migration-idempotency.test.ts packages/persistence/src/repositories/account-closure-repository.ts packages/persistence/src/repositories/account-closure-repository.test.ts packages/persistence/src/index.ts
git diff --cached --check
git commit -m "feat(account): persistir saga de encerramento"
```

### Task 2 — Subfase 7.3: bloqueio imediato, idempotência e reautenticação verificável

**Files:**
- Create: `apps/api/src/account/account-closure-policy.ts`
- Create: `apps/api/src/account/account-closure-crypto.ts`
- Create: `apps/api/src/account/account-closure-service.ts`
- Create: `apps/api/src/account/account-closure-service.test.ts`
- Modify: `packages/persistence/src/repositories/account-closure-repository.ts`
- Modify: `packages/persistence/src/repositories/account-closure-repository.test.ts`
- Modify: `packages/persistence/src/repositories/api-key-repository.ts`
- Create: `packages/persistence/src/repositories/api-key-repository.test.ts`
- Modify: `apps/api/src/auth/fastify-auth.ts`
- Modify: `apps/api/src/auth/fastify-auth.test.ts`
- Modify: `apps/api/src/auth/supabase-auth.test.ts`

**Interfaces:**
- Consumes: `AccountClosureRepository`, `ApiKeyRepository`, `AuthenticatedPrincipal`.
- Produces: `ACCOUNT_CLOSURE_POLICY`, `digestClosureValue`, `deriveClosureStatusToken`, `readVerifiedPasswordAuthenticationAt`, `AccountClosureService.request`, `ClosureAwareTokenVerifier`.

- [ ] **Step 1: escrever os testes RED de criptografia e reautenticação**

Criar testes com JWTs sintéticos cujo payload contenha `amr`:

```ts
expect(readVerifiedPasswordAuthenticationAt(jwt({
  iat: nowSeconds,
  amr: [{ method: 'token_refresh', timestamp: nowSeconds }],
}))).toBeUndefined();

expect(readVerifiedPasswordAuthenticationAt(jwt({
  iat: nowSeconds,
  amr: [{ method: 'password', timestamp: nowSeconds - 120 }],
}))).toBe(nowSeconds - 120);

expect(deriveClosureStatusToken('secret', 'subject_1', 'idem_1'))
  .toBe(deriveClosureStatusToken('secret', 'subject_1', 'idem_1'));
```

- [ ] **Step 2: escrever os testes RED da transação inicial**

Cobrir no repositório/serviço:

```ts
it('bloqueia conta e tenant e revoga todas as chaves na mesma transação', async () => {
  const result = await service.request(validRequest);
  expect(result.closure.status).toBe('ACCESS_BLOCKED');
  expect((await accountRepository.findBySupabaseUserId('supabase_1'))?.user.status).toBe('DISABLED');
  expect(await apiKeyRepository.findActiveByTokenHash(hashApiKey('secret'))).toBeUndefined();
});

it('rejeita tenant compartilhado sem alterar conta ou credenciais', async () => {
  await addSecondMembership();
  await expect(service.request(validRequest)).rejects.toThrow('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
  expect((await accountRepository.findBySupabaseUserId('supabase_1'))?.user.status).toBe('ACTIVE');
  expect(await apiKeyRepository.findActiveByTokenHash(hashApiKey('secret'))).toBeDefined();
});

it('reproduz a mesma saga e recusa fingerprint divergente', async () => {
  const first = await service.request(validRequest);
  const replay = await service.request(validRequest);
  expect(replay.closure.id).toBe(first.closure.id);
  await expect(service.request({ ...validRequest, policyVersion: 'different' }))
    .rejects.toThrow('ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT');
});
```

- [ ] **Step 3: executar os testes e confirmar a falha RED**

Run: `pnpm exec vitest run apps/api/src/account/account-closure-service.test.ts packages/persistence/src/repositories/account-closure-repository.test.ts packages/persistence/src/repositories/api-key-repository.test.ts apps/api/src/auth/fastify-auth.test.ts apps/api/src/auth/supabase-auth.test.ts`

Expected: FAIL pelos módulos e métodos ausentes.

- [ ] **Step 4: implementar as constantes e funções criptográficas**

`account-closure-policy.ts` deve exportar:

```ts
export const ACCOUNT_CLOSURE_POLICY = Object.freeze({
  version: '2026-09-22.v1',
  confirmation: 'ENCERRAR MINHA CONTA',
  reauthenticationMaxAgeSeconds: 300,
  privateContentDeadlineDays: 7,
  supabaseIdentityDeadlineHours: 24,
  accessLogRetentionDays: 180,
  backupRetentionDays: 35,
});
```

`account-closure-crypto.ts` deve usar HMAC-SHA-256 e comparação constante:

```ts
digestClosureValue(secret: string, value: string): string
deriveClosureStatusToken(secret: string, subjectId: string, idempotencyKey: string): string
verifyClosureStatusToken(secret: string, subjectId: string, idempotencyKey: string, candidate: string): boolean
fingerprintClosureRequest(input: { confirmation: string; policyVersion: string }): string
```

O token retornado começa com `flx_close_`; somente seu SHA-256 é persistido.

- [ ] **Step 5: implementar reautenticação baseada em `amr`**

Após `SupabaseIdentityVerifier.verify(token)` confirmar o token no endpoint `/auth/v1/user`, ler o payload já verificado e extrair a entrada `amr` mais recente com `method === 'password'`. Não aceitar `iat`, `token_refresh`, `recovery`, `magiclink` ou OAuth como substituto da senha nesta versão.

```ts
export function readVerifiedPasswordAuthenticationAt(token: string): number | undefined;
export function isRecentPasswordAuthentication(
  token: string,
  now: Date,
  maxAgeSeconds = 300,
): boolean;
```

- [ ] **Step 6: implementar `revokeAllByTenant`**

Adicionar ao `ApiKeyRepository`:

```ts
public async revokeAllByTenant(tenantId: string, revokedAt = new Date().toISOString()): Promise<number>
```

O update deve atingir apenas `revoked_at IS NULL` e devolver `rowsAffected`.

- [ ] **Step 7: implementar a transação `begin` da saga**

Adicionar ao `AccountClosureRepository`:

```ts
begin(input: {
  id: string;
  subjectId: string;
  userId: string;
  tenantId: string;
  subjectHash: string;
  userHash: string;
  tenantHash: string;
  statusTokenHash: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  policyVersion: string;
  now: string;
}): Promise<{ closure: AccountClosureRecord; replay: boolean }>;
```

Na mesma transação: contar memberships ativas do tenant, exigir exatamente um `OWNER`, criar closure/steps, mudar user e tenant para `DISABLED`, membership para `REVOKED` e revogar todas as API keys. Conflito de fingerprint deve abortar sem alteração.

- [ ] **Step 8: implementar `AccountClosureService.request`**

```ts
request(input: {
  principal: AuthenticatedPrincipal;
  confirmation: string;
  policyVersion: string;
  idempotencyKey: string;
  accessToken: string;
  now?: Date;
}): Promise<{
  closure: AccountClosureRecord;
  statusToken: string;
  replay: boolean;
}>;
```

O serviço valida sessão, confirmação, versão, senha recente e configuração dos segredos antes de chamar `repository.begin`.

- [ ] **Step 9: bloquear qualquer credencial de subject ou tenant encerrado**

Criar:

```ts
export interface PrincipalBlocklist {
  isBlocked(principal: AuthenticatedPrincipal): Promise<boolean>;
}

export class ClosureAwareTokenVerifier implements TokenVerifier {
  constructor(private readonly delegate: TokenVerifier, private readonly blocklist: PrincipalBlocklist) {}
  async verify(token: string): Promise<AuthenticatedPrincipal | null>;
}
```

O wrapper consulta `AccountClosureRepository.isBlocked` depois da verificação da sessão, API key de banco ou chave estática de ambiente. Se subject ou tenant estiver bloqueado, retorna `null`.

- [ ] **Step 10: executar os testes focados da subfase 7.3**

Run: `pnpm exec vitest run apps/api/src/account/account-closure-service.test.ts packages/persistence/src/repositories/account-closure-repository.test.ts packages/persistence/src/repositories/api-key-repository.test.ts apps/api/src/auth/fastify-auth.test.ts apps/api/src/auth/supabase-auth.test.ts`

Expected: PASS, incluindo JWT renovado sem senha, tenant compartilhado, replay e chave estática bloqueada.

- [ ] **Step 11: verificar builds afetados**

Run: `pnpm --filter @forgelex/persistence build && pnpm --filter @forgelex/api build`

Expected: exit 0.

- [ ] **Step 12: criar checkpoint Git somente se autorizado**

```powershell
git add apps/api/src/account packages/persistence/src/repositories/account-closure-repository.ts packages/persistence/src/repositories/account-closure-repository.test.ts packages/persistence/src/repositories/api-key-repository.ts packages/persistence/src/repositories/api-key-repository.test.ts apps/api/src/auth/fastify-auth.ts apps/api/src/auth/fastify-auth.test.ts apps/api/src/auth/supabase-auth.test.ts
git diff --cached --check
git commit -m "feat(account): bloquear acesso no encerramento"
```

### Task 3 — Subfase 7.4: exclusão Supabase e reconciliador de efeitos externos

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/account/supabase-account-admin.ts`
- Create: `apps/api/src/account/supabase-account-admin.test.ts`
- Create: `apps/api/src/account/account-closure-reconciler.ts`
- Create: `apps/api/src/account/account-closure-reconciler.test.ts`
- Modify: `packages/persistence/src/repositories/account-closure-repository.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `AccountClosureRepository.claimNextStep`, `completeStep`, `retryStep` e `structuredLog`.
- Produces: `AccountIdentityAdmin`, `SupabaseAccountAdmin`, `AccountClosureStepHandler`, `AccountClosureReconciler.runOne`.

- [ ] **Step 1: adicionar `@supabase/supabase-js` às dependências da API**

Run: `pnpm --filter @forgelex/api add @supabase/supabase-js@^2.116.0`

Expected: `apps/api/package.json` e `pnpm-lock.yaml` atualizados sem segunda versão desnecessária.

- [ ] **Step 2: escrever o teste RED do adapter administrativo**

```ts
it('trata usuário já ausente como exclusão idempotente', async () => {
  const admin = new SupabaseAccountAdmin({ client: fakeClientReturningUserNotFound });
  await expect(admin.deleteUser('supabase_1')).resolves.toEqual({ alreadyMissing: true });
});

it('não mascara indisponibilidade do Supabase', async () => {
  const admin = new SupabaseAccountAdmin({ client: fakeClientReturning503 });
  await expect(admin.deleteUser('supabase_1')).rejects.toThrow('SUPABASE_ACCOUNT_DELETE_FAILED');
});
```

- [ ] **Step 3: escrever os testes RED de reconciliação**

```ts
it('mantém bloqueio e agenda retry quando o efeito externo falha', async () => {
  identityAdmin.deleteUser.mockRejectedValueOnce(new Error('SUPABASE_ACCOUNT_DELETE_FAILED'));
  await expect(reconciler.runOne(now)).resolves.toBe('retrying');
  expect((await repository.findById('acl_1'))?.status).toBe('ACCESS_BLOCKED');
  expect((await repository.listSteps('acl_1'))[0]).toMatchObject({ status: 'RETRYABLE', attemptCount: 1 });
});

it('conclui o retry quando a exclusão externa ocorreu antes da falha local', async () => {
  identityAdmin.deleteUser
    .mockResolvedValueOnce({ alreadyMissing: false })
    .mockResolvedValueOnce({ alreadyMissing: true });
  repository.completeStep = failOnceAfterExternalEffect(repository.completeStep);
  await expect(reconciler.runOne(now)).rejects.toThrow('LOCAL_COMMIT_FAILED');
  await expect(reconciler.runOne(later)).resolves.toBe('completed');
});
```

- [ ] **Step 4: executar os testes e confirmar a falha RED**

Run: `pnpm exec vitest run apps/api/src/account/supabase-account-admin.test.ts apps/api/src/account/account-closure-reconciler.test.ts`

Expected: FAIL porque adapters e reconciliador ainda não existem.

- [ ] **Step 5: implementar o adapter administrativo Supabase**

```ts
export interface AccountIdentityAdmin {
  deleteUser(subjectId: string): Promise<{ alreadyMissing: boolean }>;
}

export class SupabaseAccountAdmin implements AccountIdentityAdmin {
  public constructor(options: { baseUrl: string; secretKey: string; client?: SupabaseClient });
  public async deleteUser(subjectId: string): Promise<{ alreadyMissing: boolean }>;
}
```

Criar o client com `persistSession:false`, `autoRefreshToken:false` e `detectSessionInUrl:false`. Usar `auth.admin.deleteUser(subjectId, false)`. Nunca registrar `FORGELEX_SUPABASE_SECRET_KEY`.

- [ ] **Step 6: implementar lease, backoff e limite de tentativas**

O reconciliador usa lease de 60 segundos, máximo de 12 tentativas e backoff:

```ts
const retryDelayMs = Math.min(60_000 * 2 ** Math.max(0, attemptCount - 1), 21_600_000);
```

Depois da 12ª falha, marcar step `FAILED` e closure `RECONCILIATION_REQUIRED`, sem remover o bloqueio.

- [ ] **Step 7: implementar `AccountClosureReconciler`**

```ts
export interface AccountClosureStepHandler {
  execute(step: ClaimedClosureStep): Promise<void>;
}

export class AccountClosureReconciler {
  public constructor(input: {
    repository: AccountClosureRepository;
    handlers: Record<AccountClosureStepType, AccountClosureStepHandler>;
    leaseOwner: string;
  });
  public async runOne(now = new Date()): Promise<'completed' | 'retrying' | 'failed' | 'idle'>;
}
```

O handler `DELETE_SUPABASE_IDENTITY` chama o adapter, trata `alreadyMissing` como sucesso e avança a closure para `IDENTITY_REMOVED`.

- [ ] **Step 8: ligar o worker ao bootstrap da API sem habilitá-lo por padrão**

Adicionar a `BuildAppOptions` injeções opcionais para `accountClosureRepository`, `accountIdentityAdmin` e `accountClosureReconciler`. Resolver:

```text
FORGELEX_ACCOUNT_CLOSURE_ENABLED=false
FORGELEX_ACCOUNT_CLOSURE_WORKER_ENABLED=false
FORGELEX_ACCOUNT_CLOSURE_PSEUDONYM_KEY=
FORGELEX_ACCOUNT_CLOSURE_STATUS_KEY=
FORGELEX_SUPABASE_SECRET_KEY=
```

Quando o worker estiver habilitado, executar `runOne()` a cada cinco segundos e limpar o timer em `onClose`.

- [ ] **Step 9: executar os testes focados da subfase 7.4**

Run: `pnpm exec vitest run apps/api/src/account/supabase-account-admin.test.ts apps/api/src/account/account-closure-reconciler.test.ts packages/persistence/src/repositories/account-closure-repository.test.ts`

Expected: PASS.

- [ ] **Step 10: verificar build da API**

Run: `pnpm --filter @forgelex/api build`

Expected: exit 0.

- [ ] **Step 11: criar checkpoint Git somente se autorizado**

```powershell
git add apps/api/package.json pnpm-lock.yaml apps/api/src/account/supabase-account-admin.ts apps/api/src/account/supabase-account-admin.test.ts apps/api/src/account/account-closure-reconciler.ts apps/api/src/account/account-closure-reconciler.test.ts packages/persistence/src/repositories/account-closure-repository.ts apps/api/src/app.ts
git diff --cached --check
git commit -m "feat(account): reconciliar exclusao de identidade"
```

#### Registro de qualidade após a subfase 7.4

Status em 2026-09-22: configuração concluída antes do início da subfase 7.5.

- ESLint e Prettier configurados na raiz para `apps/*` e `packages/*`, com scripts `lint`, `lint:fix`, `format` e `format:check` compatíveis com pnpm.
- ESLint cobre TypeScript, React e hooks; regras estilísticas ficam exclusivamente a cargo do Prettier por meio de `eslint-config-prettier`.
- Prettier cobre TypeScript, TSX, JSON, Markdown e YAML. Os ignores abrangem dependências, builds, cobertura, artefatos gerados, resultados de testes e arquivos temporários.
- A primeira execução de `pnpm format:check` encontrou 229 arquivos legados divergentes. `pnpm-workspace.yaml` foi formatado e os outros 228 arquivos foram registrados individualmente em `.prettierignore`, sem ignorar diretórios funcionais inteiros nem promover reescrita mecânica ampla. Cada entrada deve ser removida progressivamente quando o arquivo for alterado por trabalho funcional.
- A primeira execução de `pnpm lint` encontrou 9 erros e 2 avisos preexistentes. Foram corrigidos apenas os diagnósticos reportados: preservação de causa, dependências de hooks, atribuições terminais sem leitura, variável imutável e fixture de stream vazio.

Validação executada após as correções:

- `pnpm format:check` — aprovado;
- `pnpm lint` — aprovado sem erros ou avisos;
- `pnpm typecheck` — aprovado nos 15 workspaces;
- `pnpm test` — aprovado, com 86 arquivos de teste aprovados e 1 ignorado; 415 testes aprovados e 4 ignorados.

O aviso transitivo de `node-domexception@1.0.0` permanece registrado como dívida preexistente da cadeia de `@libsql/client`; não constitui falha bloqueante deste gate.

### Task 4 — Subfase 7.5: expurgo privado, minimização fiscal e retenção excepcional

**Files:**
- Create: `apps/api/src/account/account-closure-purge-service.ts`
- Create: `apps/api/src/account/account-closure-purge-service.test.ts`
- Create: `apps/api/src/account/account-closure-billing-retention.ts`
- Create: `apps/api/src/account/account-closure-billing-retention.test.ts`
- Modify: `apps/api/src/account/account-closure-reconciler.ts`
- Modify: `apps/api/src/account/account-closure-reconciler.test.ts`
- Modify: `apps/api/src/operations/retention-service.ts`
- Modify: `apps/api/src/operations/retention-service.test.ts`
- Modify: `apps/api/src/billing/billing-operations.ts`
- Modify: `apps/api/src/billing/billing-operations.test.ts`
- Modify: `packages/billing-ledger/src/migrations/ledger-migrations.ts`
- Modify: `packages/billing-ledger/src/ledger.test.ts`

**Interfaces:**
- Consumes: `Client`, `AccountClosureRepository`, `RetentionExceptionRecord`, `AccountClosureStepHandler`.
- Produces: `AccountClosurePurgeService`, `AccountClosureBillingRetention`, `PurgeSummary`, `ResidualVerification` e migration `billing-ledger-0007-webhook-retention-owner`.

- [x] **Step 1: escrever a fixture destrutiva isolada**

Em `account-closure-purge-service.test.ts`, criar tenant descartável com uma linha em cada grupo do inventário, outro tenant-controle e corpus jurisprudencial global. A fixture deve devolver:

```ts
interface ClosurePurgeFixture {
  tenantId: string;
  userId: string;
  otherTenantId: string;
  matterId: string;
  purchaseId: string;
  jurisprudenceDocumentId: string;
}
```

- [x] **Step 2: escrever os testes RED do expurgo**

```ts
it('remove todo conteúdo privado sem tocar outro tenant ou corpus global', async () => {
  const result = await service.purgePrivateContent({ tenantId, closureId: 'acl_1' });
  expect(result.remainingPrivateRows).toBe(0);
  expect(await countRowsForTenant(otherTenantId)).toBeGreaterThan(0);
  expect(await findJurisprudence(jurisprudenceDocumentId)).toBeDefined();
});

it('preserva somente a categoria coberta por exceção vigente', async () => {
  await addRetentionException({ closureId: 'acl_1', category: 'MATTERS', reviewAt: future });
  const result = await service.purgePrivateContent({ tenantId, closureId: 'acl_1' });
  expect(result.heldCategories).toEqual(['MATTERS']);
  expect(await countMatterRows(tenantId)).toBeGreaterThan(0);
  expect(await countResearchHistoryRows(tenantId)).toBe(0);
});
```

- [x] **Step 3: escrever os testes RED da minimização financeira**

```ts
it('mantém valores e referências fiscais sem conteúdo jurídico ou identificador direto', async () => {
  await retention.minimize({ tenantId, userId, tenantPseudonym: 'tenant_closed_1', userPseudonym: 'user_closed_1' });
  expect(await readLedgerEntry()).toMatchObject({ amount_cents: -20, operation_result_snapshot: null });
  expect(await readUsageEvent()).toMatchObject({ tenant_id: 'tenant_closed_1', user_id: null, session_id: null });
  expect(await readPurchase()).toMatchObject({ tenant_id: 'tenant_closed_1', user_id: 'user_closed_1', checkout_url: null });
  expect(JSON.stringify(await readAllRetainedFinancialRows())).not.toContain('consulta sigilosa');
});
```

- [x] **Step 4: executar os testes e confirmar a falha RED**

Run: `pnpm exec vitest run apps/api/src/account/account-closure-purge-service.test.ts apps/api/src/account/account-closure-billing-retention.test.ts`

Expected: FAIL pelos módulos ausentes.

- [x] **Step 5: acrescentar ownership ao webhook financeiro**

Criar migration `billing-ledger-0007-webhook-retention-owner`:

```sql
ALTER TABLE billing_webhook_events ADD COLUMN tenant_id TEXT;
CREATE INDEX billing_webhook_events_tenant_received_idx
  ON billing_webhook_events(tenant_id, received_at);
```

Modificar `BillingOperationsService.processWebhook` para preencher `tenant_id` assim que a compra associada for resolvida. Eventos legados sem tenant continuam sujeitos à retenção operacional de payload, mas não podem ser atribuídos silenciosamente a uma conta.

- [x] **Step 6: implementar a ordem explícita de exclusão privada**

`AccountClosurePurgeService.purgePrivateContent` deve executar uma transação por tenant nesta ordem:

```ts
const deleteOrder = [
  'draft_approval_tokens', 'draft_approval_decisions', 'draft_approval_requests',
  'citation_anchors', 'draft_review_findings', 'draft_sections', 'draft_versions', 'drafts',
  'matter_authority_verifications', 'matter_authorities',
  'legal_theses', 'research_memos', 'legal_issues',
  'evidence_links', 'evidence_source_links', 'evidence_items',
  'fact_source_links', 'facts', 'timeline_events',
  'document_anchors', 'document_versions', 'legal_documents',
  'workflow_checkpoints', 'research_search_history',
  'webhook_deliveries', 'webhook_events', 'webhook_endpoints',
  'api_keys',
  'approvals', 'checkpoints', 'session_messages', 'sessions',
  'matters',
] as const;
```

Tabelas sem `tenant_id` devem ser selecionadas por FK/subquery antes da tabela pai. Cada categoria com exceção vigente é omitida e registrada em `heldCategories`; nenhuma exceção autoriza manter dados de outra categoria.

- [x] **Step 7: implementar a minimização financeira**

`AccountClosureBillingRetention.minimize` deve:

```text
DELETE billing_payment_methods.
UPDATE billing_accounts: tenant_id=pseudônimo, provider_customer_id=NULL,
  auto_recharge_enabled=0, default_payment_method_id=NULL.
UPDATE billing_purchases: tenant_id/user_id=pseudônimos, checkout_url=NULL.
UPDATE billing_payments, billing_invoices, billing_credit_lots:
  tenant_id=pseudônimo, preservando valores, moeda, status e IDs financeiros.
UPDATE billing_refund_requests: tenant_id/requested_by=pseudônimos,
  reviewed_by=NULL, reason=NULL.
UPDATE billing_operations: tenant_id=pseudônimo, result_snapshot=NULL,
  lease_owner=NULL, lease_expires_at=NULL.
UPDATE usage_events: tenant_id=pseudônimo, user_id=NULL, session_id=NULL,
  model=NULL.
UPDATE ledger_accounts: tenant_id=pseudônimo.
UPDATE ledger_entries: operation_result_snapshot=NULL.
UPDATE billing_webhook_events: payload='{}', error_message=NULL
  WHERE tenant_id=tenant original.
```

As atualizações que alteram `tenant_id` devem ocorrer em ordem compatível com os vínculos por `account_id`, sem quebrar PK/FK.

- [x] **Step 8: remover identidade local e pseudonimizar auditoria**

O handler `REMOVE_LOCAL_IDENTITY` deve, na mesma transação:

```text
UPDATE audit_logs SET tenant_id=tenantPseudonym, user_id=userPseudonym,
  session_id=closurePseudonym WHERE tenant_id=tenant original;
DELETE forgelex_tenant_memberships WHERE tenant_id=tenant original;
DELETE forgelex_tenants WHERE id=tenant original;
DELETE forgelex_user_profiles WHERE id=user original;
UPDATE account_closures SET subject_id=NULL, user_id=NULL, tenant_id=NULL.
```

- [x] **Step 9: implementar verificação residual fail-closed**

```ts
export interface ResidualVerification {
  privateRows: number;
  activeCredentials: number;
  unredactedSnapshots: number;
  retainedFinancialRows: number;
  heldCategories: string[];
}
```

`VERIFY_RESIDUALS` só conclui quando os três primeiros contadores forem zero, exceto linhas cobertas por `heldCategories`. Caso contrário, lançar `ACCOUNT_CLOSURE_RESIDUAL_DATA` e manter `RECONCILIATION_REQUIRED` após o limite de retries.

- [x] **Step 10: estender retenção operacional para seis meses e cinco anos**

`OperationalRetentionService.purge` deve receber política separada:

```ts
interface OperationalRetentionPolicy {
  operationalDays: number;      // default 90
  accessLogDays: number;        // fixed/default 180
  closureReceiptDays: number;   // default 1827
}
```

Excluir `audit_logs` mais antigos que 180 dias e closures concluídas mais antigas que 1.827 dias somente quando não houver `retention_exceptions` ativa. Não alterar o corpus global.

- [x] **Step 11: ligar os quatro handlers locais ao reconciliador**

Mapear:

```ts
PURGE_PRIVATE_CONTENT -> purgeService.purgePrivateContent
MINIMIZE_RETAINED_RECORDS -> billingRetention.minimize
REMOVE_LOCAL_IDENTITY -> purgeService.removeLocalIdentity
VERIFY_RESIDUALS -> purgeService.verifyResiduals
```

Transições esperadas: `IDENTITY_REMOVED -> CREDENTIALS_REVOKED -> CONTENT_PURGING -> RETAINED_ONLY -> COMPLETED`.

- [x] **Step 12: executar os testes focados da subfase 7.5**

Run: `pnpm exec vitest run apps/api/src/account/account-closure-purge-service.test.ts apps/api/src/account/account-closure-billing-retention.test.ts apps/api/src/account/account-closure-reconciler.test.ts apps/api/src/operations/retention-service.test.ts packages/billing-ledger/src/ledger.test.ts`

Expected: PASS.

- [x] **Step 13: verificar builds afetados**

Run: `pnpm --filter @forgelex/billing-ledger build && pnpm --filter @forgelex/api build`

Expected: exit 0.

Status em 2026-09-22: subfase 7.5 implementada e validada no checkout local,
partindo do commit publicado `4b3c9f0`. O checkpoint Git da própria subfase
acompanha este registro; nenhuma migration remota, deploy ou publicação foi
executada.

Alterações concluídas:

- expurgo transacional em ordem explícita, isolado por tenant, com preservação
  limitada à categoria coberta por `retention_exceptions` vigente;
- migration `billing-ledger-0007-webhook-retention-owner` e atribuição de
  `tenant_id` a partir da compra persistida, sem confiar no metadata do webhook;
- minimização fiscal com pseudônimos, remoção de meios de pagamento e redação
  de snapshots, URLs e textos livres dispensáveis;
- remoção idempotente de identidade local, pseudonimização de auditoria e
  retomada segura quando o efeito foi confirmado antes do checkpoint da saga;
- verificação residual fail-closed, inclusive contra identificadores diretos
  remanescentes em registros financeiros, e retenção operacional separada em
  90, 180 e 1.827 dias, respeitando exceções ativas; payloads e erros de
  webhooks financeiros, inclusive eventos legados sem `tenant_id`, são
  redigidos em até 90 dias mesmo quando a janela operacional é maior;
- ligação dos quatro handlers locais no bootstrap da API. Por coerência entre a
  migration, o schema tipado e o runtime, a implementação também alterou
  `packages/billing-ledger/src/schema/billing-schema.ts` e `apps/api/src/app.ts`,
  além da lista inicial de arquivos desta task.

Evidência executada após as correções:

```text
pnpm exec vitest run <6 arquivos focados>     PASS — 44 testes
pnpm --filter @forgelex/billing-ledger build PASS
pnpm --filter @forgelex/api build            PASS
pnpm format:check                            PASS
pnpm lint                                    PASS
pnpm typecheck                               PASS — 15 projetos do workspace
pnpm test                                    PASS — 88 arquivos aprovados,
                                                    1 ignorado; 427 testes
                                                    aprovados, 4 ignorados
```

- [x] **Step 14: criar checkpoint Git somente se autorizado**

```powershell
git add apps/api/src/account/account-closure-purge-service.ts apps/api/src/account/account-closure-purge-service.test.ts apps/api/src/account/account-closure-billing-retention.ts apps/api/src/account/account-closure-billing-retention.test.ts apps/api/src/account/account-closure-reconciler.ts apps/api/src/account/account-closure-reconciler.test.ts apps/api/src/operations/retention-service.ts apps/api/src/operations/retention-service.test.ts packages/billing-ledger/src/migrations/ledger-migrations.ts packages/billing-ledger/src/ledger.test.ts
git diff --cached --check
git commit -m "feat(account): expurgar dados e minimizar retencao"
```

### Task 5 — Subfase 7.6: contratos HTTP, OpenAPI e acompanhamento

Implementação local validada em 2026-09-22. O checkpoint Git desta subfase
foi autorizado separadamente do commit 14cf5ae, que publica a 7.5.
O repositório de encerramento também foi ajustado para impedir a exclusão de
um perfil ainda vinculado a outro workspace ativo.

**Files:**
- Create: `apps/api/src/account/account-closure-routes.ts`
- Create: `apps/api/src/account/account-closure-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/account-routes.test.ts`
- Modify: `apps/api/src/distribution/openapi.ts`
- Modify: `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `AccountClosureService`, `AccountClosureRepository`, `SupabaseIdentityVerifier`, `AuthAdapter`, `ACCOUNT_CLOSURE_POLICY`.
- Produces: `registerAccountClosureRoutes`, `AccountClosurePolicyResponse`, `AccountClosureAcceptedResponse`, `AccountClosureStatusResponse`.

- [x] **Step 1: escrever os testes RED da política e feature flag**

```ts
it('expõe a política sem executar encerramento quando a feature está desligada', async () => {
  const policy = await app.inject({ method: 'GET', url: '/api/v2/account/closure-policy', headers: sessionHeaders });
  expect(policy.json()).toMatchObject({ enabled: false, version: '2026-09-22.v1', confirmation: 'ENCERRAR MINHA CONTA' });
  const close = await app.inject({ method: 'POST', url: '/api/v2/account/closure', headers: sessionHeaders, payload: validBody });
  expect(close).toMatchObject({ statusCode: 404 });
  expect(close.json()).toMatchObject({ error: 'ACCOUNT_CLOSURE_DISABLED' });
});
```

- [x] **Step 2: escrever os testes RED de segurança e idempotência HTTP**

Cobrir:

```text
401 para sessão ausente ou inválida.
403 SESSION_REQUIRED para API key.
409 ACCOUNT_CLOSURE_REAUTH_REQUIRED para amr=password antigo ou apenas refresh.
400 ACCOUNT_CLOSURE_CONFIRMATION_INVALID para texto divergente.
409 ACCOUNT_CLOSURE_POLICY_VERSION_MISMATCH para versão divergente.
409 ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER para tenant compartilhado.
202 com closureId/statusToken na primeira requisição.
202 com o mesmo closureId/statusToken no replay idêntico.
409 ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT no replay divergente.
401 em qualquer rota jurídica com o JWT anterior após o 202.
```

- [x] **Step 3: escrever o teste RED do acompanhamento por token opaco**

```ts
const status = await app.inject({
  method: 'GET', url: `/api/v2/account/closure/${closureId}`,
  headers: { 'x-closure-token': statusToken },
});
expect(status.json()).toMatchObject({ closureId, status: 'ACCESS_BLOCKED' });
expect(status.body).not.toContain('supabase_1');
expect(status.body).not.toContain('pessoa@exemplo.com');
expect((await app.inject({ method: 'GET', url: status.url, headers: { 'x-closure-token': 'wrong' } })).statusCode).toBe(401);
```

- [x] **Step 4: executar os testes e confirmar a falha RED**

Run: `pnpm exec vitest run apps/api/src/account/account-closure-routes.test.ts apps/api/src/account-routes.test.ts apps/api/src/app.test.ts`

Expected: FAIL porque as rotas e o OpenAPI ainda não existem.

- [x] **Step 5: implementar os DTOs e o registro das rotas**

```ts
export interface AccountClosurePolicyResponse {
  enabled: boolean;
  version: '2026-09-22.v1';
  confirmation: 'ENCERRAR MINHA CONTA';
  reauthenticationMaxAgeSeconds: 300;
  deadlines: { identityHours: 24; privateContentDays: 7; backupDays: 35 };
}

export interface AccountClosureAcceptedResponse {
  closureId: string;
  statusToken: string;
  status: 'ACCESS_BLOCKED';
  requestedAt: string;
  policyVersion: '2026-09-22.v1';
}

export function registerAccountClosureRoutes(app: FastifyInstance, dependencies: {
  enabled: boolean;
  authAdapter: AuthAdapter;
  identityVerifier: SupabaseIdentityVerifier;
  service: AccountClosureService;
  repository: AccountClosureRepository;
}): void;
```

`POST /api/v2/account/closure` exige `Idempotency-Key`, session principal, identidade remota igual ao principal e `amr=password` recente. `GET .../:closureId` usa somente `X-Closure-Token` e comparação constante do hash.

- [x] **Step 6: impedir recriação pelo bootstrap**

Antes de `accountRepository.bootstrap`, calcular `subjectHash` e consultar tombstone. Se existir closure em qualquer estado, responder:

```json
{
  "error": "ACCOUNT_CLOSED",
  "message": "Esta conta foi encerrada e não pode ser reativada."
}
```

Status HTTP: `403`.

- [x] **Step 7: adicionar os contratos ao OpenAPI**

Adicionar as três rotas, schemas de request/response, header `Idempotency-Key`, header `X-Closure-Token`, resposta `202` e códigos estáveis. A descrição deve declarar que o endpoint é irreversível, limitado a tenant pessoal e desligado por padrão.

- [x] **Step 8: executar os testes focados da subfase 7.6**

Run: `pnpm exec vitest run apps/api/src/account/account-closure-routes.test.ts apps/api/src/account-routes.test.ts apps/api/src/app.test.ts`

Expected: PASS; `DELETE /api/v2/account` continua `404`.

- [x] **Step 9: verificar typecheck e build da API**

Run: `pnpm --filter @forgelex/api typecheck && pnpm --filter @forgelex/api build`

Expected: exit 0.

- [x] **Step 10: criar checkpoint Git somente se autorizado**

```powershell
git add apps/api/src/account/account-closure-routes.ts apps/api/src/account/account-closure-routes.test.ts apps/api/src/app.ts apps/api/src/account-routes.test.ts apps/api/src/distribution/openapi.ts apps/api/src/app.test.ts
git diff --cached --check
git commit -m "feat(api): publicar encerramento reconciliavel"
```

### Task 6 — Subfase 7.7: interface, reautenticação e recibo local seguro

**Files:**
- Modify: `apps/web/src/api-client.ts`
- Modify: `apps/web/src/api-client.test.ts`
- Modify: `apps/web/src/auth/AuthContext.tsx`
- Modify: `apps/web/src/auth/AuthContext.test.ts`
- Modify: `apps/web/src/screens/AccountSecurityScreen.tsx`
- Modify: `apps/web/src/screens/AccountSecurityScreen.test.ts`
- Create: `apps/web/src/account-closure-storage.ts`
- Create: `apps/web/src/account-closure-storage.test.ts`
- Create: `apps/web/src/screens/AccountClosureStatusScreen.tsx`
- Create: `apps/web/src/screens/AccountClosureStatusScreen.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/navigation/routes.ts`
- Modify: `apps/web/src/navigation/routes.test.ts`
- Modify: `tests/e2e/mcp-onboarding.spec.ts`

**Interfaces:**
- Consumes: contratos HTTP da Task 5, `AuthContext`, Supabase Auth e `sessionStorage`.
- Produces: `AccountClosurePolicy`, `AccountClosureAccepted`, `AccountClosureStatus`, `ClosureReceipt`, `AccountClosureStatusScreen` e reautenticação explícita por senha.

- [ ] **Step 1: escrever os testes RED do cliente HTTP**

Em `api-client.test.ts`, exigir os contratos:

```ts
export interface AccountClosurePolicy {
  enabled: boolean;
  version: '2026-09-22.v1';
  confirmation: 'ENCERRAR MINHA CONTA';
  reauthenticationMaxAgeSeconds: 300;
  deadlines: { identityHours: 24; privateContentDays: 7; backupDays: 35 };
}

export interface AccountClosureAccepted {
  closureId: string;
  statusToken: string;
  status: 'ACCESS_BLOCKED';
  requestedAt: string;
  policyVersion: '2026-09-22.v1';
}

export interface AccountClosureStatus {
  closureId: string;
  status: AccountClosureSagaStatus;
  requestedAt: string;
  completedAt: string | null;
  heldCategories: string[];
  policyVersion: '2026-09-22.v1';
}
```

Os testes devem provar que `requestAccountClosure` envia `Authorization`, `Idempotency-Key` e a confirmação exata, e que `getAccountClosureStatus` envia somente `X-Closure-Token`, sem bearer token.

- [ ] **Step 2: escrever os testes RED da reautenticação**

Em `AuthContext.test.ts`, cobrir:

```ts
await reauthenticateForClosure(password);
expect(signInWithPassword).toHaveBeenCalledWith({ email: account.user.email, password });
expect(result).toBe('fresh-access-token');
```

Senha incorreta, identidade divergente, sessão ausente ou token sem `amr=password` não podem chamar `requestAccountClosure`. Após resposta `202`, executar somente `supabase.auth.signOut({ scope: 'local' })`; a revogação remota já pertence à saga do servidor.

- [ ] **Step 3: escrever os testes RED do armazenamento do recibo**

Criar `account-closure-storage.test.ts` com estes invariantes:

```ts
interface ClosureReceipt {
  closureId: string;
  statusToken: string;
  requestedAt: string;
  policyVersion: '2026-09-22.v1';
}
```

- o recibo ativo usa exclusivamente `sessionStorage`;
- `statusToken` nunca aparece em `localStorage`, URL, log ou telemetria;
- ao atingir `COMPLETED`, o token é apagado e pode permanecer apenas um recibo não secreto com `closureId`, datas e versão da política;
- ao fechar a aba antes da conclusão, o usuário deve guardar o recibo exportável ou recorrer ao suporte; o cliente não inventa mecanismo de recuperação.

- [ ] **Step 4: escrever os testes RED da jornada destrutiva**

Em `AccountSecurityScreen.test.tsx`, cobrir a sequência obrigatória:

1. resumo de efeitos e prazos;
2. confirmação de que o tenant é pessoal;
3. reautenticação por senha;
4. digitação literal `ENCERRAR MINHA CONTA`;
5. botão destrutivo habilitado somente após todos os requisitos;
6. resposta `202`, recibo salvo e transição para acompanhamento.

Também provar que falha na reautenticação, política desabilitada ou divergência na frase não cria solicitação.

- [ ] **Step 5: executar os testes e confirmar a falha RED**

Run:

```powershell
pnpm exec vitest run apps/web/src/api-client.test.ts apps/web/src/auth/AuthContext.test.ts apps/web/src/account-closure-storage.test.ts apps/web/src/screens/AccountSecurityScreen.test.ts apps/web/src/screens/AccountClosureStatusScreen.test.ts
```

Expected: FAIL pelos contratos, armazenamento e tela ainda ausentes.

- [ ] **Step 6: implementar cliente HTTP e reautenticação**

Adicionar:

```ts
getAccountClosurePolicy(accessToken: string): Promise<AccountClosurePolicy>;
requestAccountClosure(input: { confirmation: string }, accessToken: string, idempotencyKey: string): Promise<AccountClosureAccepted>;
getAccountClosureStatus(closureId: string, statusToken: string): Promise<AccountClosureStatus>;
```

`AuthContext.reauthenticateForClosure(password)` deve chamar `signInWithPassword` para a identidade corrente, verificar que o usuário retornado é o mesmo e devolver o novo access token. Não aceitar apenas refresh de sessão como prova de senha recente.

- [ ] **Step 7: implementar recibo e tela de acompanhamento**

`AccountClosureStatusScreen` deve:

- carregar o recibo de `sessionStorage`;
- consultar o status sem sessão autenticada;
- traduzir estados técnicos para texto claro, sem expor erros internos;
- interromper polling em `COMPLETED` ou `RECONCILIATION_REQUIRED`;
- no estado de reconciliação, exibir `closureId` como referência de suporte, nunca o token;
- permitir baixar um recibo JSON não secreto após conclusão.

Em `App.tsx`, renderizar essa tela antes do gate de autenticação quando houver recibo ativo. Isso preserva o acompanhamento depois do logout local sem reabrir a conta.

- [ ] **Step 8: integrar a jornada à tela de segurança**

Manter o encerramento em seção visualmente separada das ações reversíveis. Após `202`, salvar recibo, limpar estado sensível do formulário, fazer logout local e navegar para a tela de acompanhamento. Não adicionar rota pública com token em query string.

- [ ] **Step 9: atualizar o E2E compartilhado não destrutivo**

No smoke existente, com `FORGELEX_ACCOUNT_CLOSURE_ENABLED=false`, comprovar que a seção informa indisponibilidade e não oferece botão executável. Esse teste não deve criar nem excluir usuários.

- [ ] **Step 10: executar testes, typecheck e build da web**

Run:

```powershell
pnpm exec vitest run apps/web/src/api-client.test.ts apps/web/src/auth/AuthContext.test.ts apps/web/src/account-closure-storage.test.ts apps/web/src/screens/AccountSecurityScreen.test.ts apps/web/src/screens/AccountClosureStatusScreen.test.ts apps/web/src/navigation/routes.test.ts
pnpm --filter @forgelex/web typecheck
pnpm --filter @forgelex/web build
```

Expected: todos passam; bundle não contém token ou fixture real.

- [ ] **Step 11: criar checkpoint Git somente se autorizado**

```powershell
git add apps/web/src/api-client.ts apps/web/src/api-client.test.ts apps/web/src/auth/AuthContext.tsx apps/web/src/auth/AuthContext.test.ts apps/web/src/screens/AccountSecurityScreen.tsx apps/web/src/screens/AccountSecurityScreen.test.ts apps/web/src/account-closure-storage.ts apps/web/src/account-closure-storage.test.ts apps/web/src/screens/AccountClosureStatusScreen.tsx apps/web/src/screens/AccountClosureStatusScreen.test.ts apps/web/src/App.tsx apps/web/src/navigation/routes.ts apps/web/src/navigation/routes.test.ts tests/e2e/mcp-onboarding.spec.ts
git diff --cached --check
git commit -m "feat(web): conduzir encerramento irreversivel"
```

### Task 7 — Subfase 7.8: verificação integral, documentos jurídicos e publicação controlada

**Files:**
- Create: `tests/e2e/account-closure.spec.ts`
- Create: `playwright.account-closure.config.ts`
- Create: `scripts/e2e-account-closure-server.mjs`
- Create: `scripts/smoke-account-closure-postgres.mjs`
- Create: `scripts/verify-account-closure-restore.mjs`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/legal/account-closure-retention-policy.md`
- Create: `docs/legal/account-closure-terms-addendum.md`
- Create: `docs/operations/account-closure/runbook.md`
- Create: `docs/operations/account-closure/validation.md`
- Modify: `STATUS_VALIDACAO.md`

**Interfaces:**
- Consumes: fluxo completo das Tasks 1–6, PostgreSQL descartável, Supabase Auth simulado e matrizes aprovadas na 7.1.
- Produces: prova E2E destrutiva isolada, prova de restauração, runbook operacional, minutas jurídicas para revisão humana e registro auditável de validação.

- [ ] **Step 1: escrever o E2E destrutivo em ambiente descartável**

O servidor de teste deve criar usuário e tenant sintéticos exclusivos, emitir sessão com:

```json
{
  "sub": "supabase_disposable_user",
  "amr": [{ "method": "password", "timestamp": 1789980000 }]
}
```

O timestamp é gerado no runtime. O mock de administração Supabase deve registrar a exclusão da identidade e rejeitar autenticação subsequente. Nenhuma fixture pode apontar para projeto Supabase, banco ou usuário real.

- [ ] **Step 2: cobrir a jornada completa no navegador**

Em `account-closure.spec.ts`:

```ts
test('encerra conta pessoal, bloqueia acesso imediato e conclui a saga', async ({ page }) => {
  // login descartável -> segurança -> reautenticação -> confirmação literal
  // POST 202 -> logout local -> acompanhamento por recibo
  // endpoint autenticado retorna ACCOUNT_CLOSED
  // nova autenticação é recusada
  // status final é COMPLETED e token sai do storage
});
```

Adicionar cenário de falha parcial do provedor: o acesso continua bloqueado, o estado chega a `RECONCILIATION_REQUIRED`, o reconciliador retoma idempotentemente e conclui sem recriar identidade.

- [ ] **Step 3: implementar smoke PostgreSQL focado**

`scripts/smoke-account-closure-postgres.mjs` deve provar, com IDs aleatórios e limpeza explícita:

- migrations executadas duas vezes sem erro;
- tenant compartilhado recusado sem mutação;
- duas solicitações concorrentes produzem uma única closure;
- replay com a mesma chave devolve o mesmo resultado; payload divergente gera conflito;
- falha intermediária é retomada sem repetir etapa concluída;
- dados privados chegam a zero, salvo exceção formal vigente;
- registros fiscais permanecem minimizados e sem conteúdo jurídico;
- tenant-controle e corpus global permanecem intactos;
- principal de sessão, API key persistida, API key estática e JWT ainda válido recebem bloqueio após a transação inicial.

- [ ] **Step 4: implementar prova de backup e restauração**

`verify-account-closure-restore.mjs` deve:

1. criar banco temporário com prefixo fixo `forgelex_closure_restore_`;
2. aplicar migrations e fixture pré-encerramento;
3. concluir a closure e gerar dump;
4. restaurar em segundo banco temporário;
5. comprovar que tombstone, estados e retenções sobrevivem à restauração e que login continua negado;
6. remover somente os dois bancos cujo nome tenha sido validado contra o prefixo exato.

O script deve abortar antes de qualquer `DROP DATABASE` se host, nome ou prefixo não forem os esperados. Não usar banco de desenvolvimento compartilhado.

- [ ] **Step 5: registrar scripts e variáveis operacionais**

Adicionar ao `package.json`:

```json
{
  "test:e2e:account-closure": "playwright test --config playwright.account-closure.config.ts",
  "test:postgres:account-closure": "node scripts/smoke-account-closure-postgres.mjs",
  "verify:account-closure-restore": "node scripts/verify-account-closure-restore.mjs"
}
```

Documentar em `.env.example`, sem valores reais:

```dotenv
FORGELEX_ACCOUNT_CLOSURE_ENABLED=false
FORGELEX_ACCOUNT_CLOSURE_STATUS_TOKEN_SECRET=
FORGELEX_ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET=
FORGELEX_ACCOUNT_CLOSURE_RECONCILER_INTERVAL_MS=60000
FORGELEX_ACCOUNT_CLOSURE_MAX_ATTEMPTS=12
```

- [ ] **Step 6: redigir as minutas jurídicas vinculadas à matriz técnica**

`account-closure-retention-policy.md` deve reproduzir, sem ampliar silenciosamente, finalidade, categoria, base jurídica a validar, prazo, evento inicial, destino, exceções e responsável de cada retenção da 7.1. `account-closure-terms-addendum.md` deve explicar irreversibilidade, perda de acesso, retenções obrigatórias, backups e canal de suporte.

Ambos devem trazer no topo: `MINUTA — REQUER REVISÃO JURÍDICA HUMANA ANTES DE PUBLICAÇÃO`. Não afirmar aprovação de DPO, advogado, contabilidade ou responsável que não esteja documentada.

- [ ] **Step 7: redigir runbook e matriz de evidências**

O runbook deve conter:

- ativação e rollback exclusivamente pela feature flag;
- monitoramento de backlog, tentativas, latência e `RECONCILIATION_REQUIRED`;
- atendimento usando `closureId`, sem solicitar `statusToken` por canal inseguro;
- procedimento para retenção excepcional com responsável e `reviewAt`;
- resposta a falha do Supabase, banco, backup e minimização financeira;
- proibição de reativar identidade encerrada;
- autorização separada para migration, deploy e habilitação.

`validation.md` deve mapear requisito -> teste/comando -> evidência -> commit -> data -> ambiente -> resultado. Campos sem evidência permanecem explicitamente `NÃO DEMONSTRADO`.

- [ ] **Step 8: executar a matriz técnica completa**

Run, nesta ordem:

```powershell
pnpm typecheck
pnpm test
pnpm --filter @forgelex/api build
pnpm --filter @forgelex/web build
pnpm exec playwright test tests/e2e/mcp-onboarding.spec.ts
pnpm test:e2e:account-closure
pnpm test:postgres
pnpm test:postgres:account-closure
pnpm verify:account-closure-restore
git diff --check
```

Expected: todos exit 0. Falha em qualquer gate impede marcar 7.8 como concluída.

- [ ] **Step 9: realizar revisão humana antes da publicação**

Registrar separadamente:

- revisão jurídica da política e dos termos;
- revisão contábil/fiscal dos campos retidos;
- revisão de segurança dos segredos, hashes, logs e recuperação;
- avaliação humana de UX destrutiva com participantes que não sejam autores do fluxo.

Resultado humano não pode ser inferido de testes automatizados. Registrar participantes por identificadores internos, versão avaliada, perguntas, aprovação/reprovação e observações, sem inserir dados pessoais desnecessários no Git.

- [ ] **Step 10: atualizar o estado canônico apenas com evidência produzida**

Em `STATUS_VALIDACAO.md`, registrar checkout, branch, commit, banco descartável, comandos, contagens e limitações. Até as revisões humanas e autorizações operacionais existirem, manter:

```text
Implementação local: VALIDADA ou NÃO DEMONSTRADA conforme os testes reais.
Revisão jurídica: PENDENTE.
Migration remota: NÃO EXECUTADA.
Deploy: NÃO EXECUTADO.
Feature flag em produção: DESABILITADA.
```

- [ ] **Step 11: criar checkpoint Git somente se autorizado**

```powershell
git add tests/e2e/account-closure.spec.ts playwright.account-closure.config.ts scripts/e2e-account-closure-server.mjs scripts/smoke-account-closure-postgres.mjs scripts/verify-account-closure-restore.mjs package.json .env.example README.md docs/legal/account-closure-retention-policy.md docs/legal/account-closure-terms-addendum.md docs/operations/account-closure/runbook.md docs/operations/account-closure/validation.md STATUS_VALIDACAO.md
git diff --cached --check
git commit -m "test(account): validar encerramento ponta a ponta"
```

## Final acceptance gates

- [ ] 7.2–7.7 implementadas por TDD e revisadas contra a especificação 7.1.
- [ ] Bloqueio de acesso ocorre na transação inicial, antes das operações assíncronas.
- [ ] Exclusão Supabase, revogação e expurgo são idempotentes e reconciliáveis.
- [ ] Nenhum conteúdo jurídico privado permanece fora de retenção excepcional documentada.
- [ ] Registros fiscais mantêm somente campos mínimos aprovados na matriz.
- [ ] Testes focados, suíte integral, builds, E2E destrutivo, PostgreSQL e restauração passam com evidência anexada.
- [ ] Revisões jurídica, contábil, segurança e UX foram registradas por responsáveis humanos.
- [ ] Migration remota, deploy e habilitação continuam gates separados e exigem autorização explícita.
- [ ] `FORGELEX_ACCOUNT_CLOSURE_ENABLED` permanece `false` até todos os gates anteriores estarem comprovados.

## Execution handoff

Executar as Tasks 1–7 em ordem. Cada task termina com testes focados e checkpoint Git apenas se houver autorização explícita. Não consolidar falhas de provedor em sucesso aparente, não usar usuário real e não habilitar a feature em ambiente remoto como consequência automática da implementação local.
