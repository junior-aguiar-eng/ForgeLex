# Fase 7 — Operação comercial e PostgreSQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** operar o ForgeLex/STJ localmente sobre PostgreSQL, com concorrência segura, estado comercial persistido e frontend fiel à API.

**Architecture:** A API passa a exigir persistência explicitamente configurada fora de testes, o ledger usa reserva curta antes da operação externa e a outbox recebe claim específico por dialeto. Contratos operacionais persistidos alimentam clients tipados no frontend; as telas deixam de manter tribunais, histórico e aprovações fictícios.

**Tech Stack:** TypeScript 5.7, Node.js 22, pnpm 11.19, Fastify, React 18, Drizzle ORM, SQLite para testes/desenvolvimento explícito, PostgreSQL 16 local, Vitest 4 e Playwright/Chromium para E2E.

**Spec:** `docs/superpowers/specs/2026-09-20-fase-7-operacao-comercial-postgresql-design.md`

## Global Constraints

- STJ é o único tribunal pesquisável até a conclusão da Fase 8.
- Somente `research.search_case_law` custa R$ 0,20; verificação e workflows permanecem gratuitos.
- REST, MCP e Web consomem os mesmos serviços canônicos e preservam isolamento por tenant.
- Produção exige PostgreSQL; SQLite só pode ser escolhido explicitamente em desenvolvimento/teste.
- Nenhuma chamada HTTP ou operação jurídica longa permanece dentro de transação que bloqueia carteira ou fila.
- Não registrar secrets, bearer tokens, documentos integrais ou prompts jurídicos integrais.
- Não executar migration remota, deploy, DNS ou homologação live de pagamento.
- Cada commit abaixo é um gate separado: preparar o diff, mas só criar commit/push quando houver autorização explícita.

## Review Focus

- Processo cai depois da operação jurídica e antes da liquidação: retry deve reutilizar a reserva sem débito duplicado; coberto na Task 2.
- Duas chaves diferentes reservam simultaneamente o último saldo: apenas uma pode executar; coberto na Task 2.
- Dois workers reclamam a mesma entrega PostgreSQL: somente um recebe o registro; coberto na Task 3.
- Usuário de tenant A tenta consultar ou decidir item do tenant B: resposta vazia/404 e nenhuma mutação; coberto nas Tasks 4 e 5.
- Retry de UI após timeout reutiliza a chave da mesma intenção, mas nova pesquisa gera UUID novo; coberto nas Tasks 6 e 7.

---

### Task 1: Política explícita de banco e readiness operacional

**Files:**
- Create: `apps/api/src/config/database-policy.ts`
- Create: `apps/api/src/config/database-policy.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/auth/fastify-auth.ts`
- Modify: `apps/api/src/auth/supabase-auth.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createDatabase({ url })`, `runPersistenceMigrations(client)` e `Client.forgelexDialect`.
- Produces: `resolveDatabasePolicy(environment): DatabasePolicy` e readiness com checks `persistence`, `migrations`, `billing`, `source`, `auth`, `outbox`.

- [ ] **Step 1: Escrever testes da política fail-closed**

```ts
expect(() => resolveDatabasePolicy({ NODE_ENV: 'production' })).toThrow('DATABASE_URL_REQUIRED');
expect(() => resolveDatabasePolicy({ NODE_ENV: 'production', DATABASE_URL: 'file:forgelex.db' }))
  .toThrow('POSTGRES_REQUIRED_IN_PRODUCTION');
expect(resolveDatabasePolicy({ NODE_ENV: 'test' })).toEqual({ mode: 'injected_or_memory', url: undefined });
expect(resolveDatabasePolicy({ NODE_ENV: 'development', DATABASE_URL: 'file:dev.db' }))
  .toEqual({ mode: 'sqlite', url: 'file:dev.db' });
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `pnpm exec vitest run apps/api/src/config/database-policy.test.ts`

Expected: FAIL porque `resolveDatabasePolicy` não existe.

- [ ] **Step 3: Implementar a política e aplicá-la no bootstrap**

```ts
export type DatabasePolicy =
  | { mode: 'postgres'; url: string }
  | { mode: 'sqlite'; url: string }
  | { mode: 'injected_or_memory'; url: undefined };

export function resolveDatabasePolicy(env: NodeJS.ProcessEnv): DatabasePolicy {
  const url = env.FORGELEX_DATABASE_URL ?? env.DATABASE_URL;
  if (env.NODE_ENV === 'test' && !url) return { mode: 'injected_or_memory', url: undefined };
  if (!url) throw new Error('DATABASE_URL_REQUIRED');
  if (env.NODE_ENV === 'production' && !/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new Error('POSTGRES_REQUIRED_IN_PRODUCTION');
  }
  return /^postgres(?:ql)?:\/\//i.test(url) ? { mode: 'postgres', url } : { mode: 'sqlite', url };
}
```

Em `createApp`, usar dependências injetadas primeiro; caso contrário resolver a
política, abrir o banco e registrar o estado da migration. Remover
`file::memory:?cache=shared` como fallback normal. `readyz` deve devolver:

```ts
{ status: 'ready', checks: {
  persistence: true, migrations: true, billing: true,
  source: sourceRegistryReady, auth: authAdapterReady, outbox: outboxReady,
} }
```

- [ ] **Step 4: Fixar readiness degradado e ausência de fallback**

```ts
const response = await app.inject({ method: 'GET', url: '/readyz' });
expect(response.statusCode).toBe(503);
expect(response.json().checks).toMatchObject({ source: false });
```

Também testar que produção sem PostgreSQL rejeita o bootstrap antes de abrir
porta, que os testes com database injetado continuam válidos e que o verifier
Supabase rejeita identidade sem `email_confirmed_at`/`confirmed_at`, sem criar
profile, membership ou tenant.

- [ ] **Step 5: Validar a task**

Run: `pnpm exec vitest run apps/api/src/config/database-policy.test.ts apps/api/src/auth/supabase-auth.test.ts apps/api/src/app.test.ts`

Expected: PASS.

- [ ] **Step 6: Preparar commit atômico**

```text
feat(api): exigir PostgreSQL na operação de produção
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 2: Reserva de billing sem operação externa sob lock

**Files:**
- Modify: `packages/billing-ledger/src/schema/ledger-schema.ts`
- Modify: `packages/billing-ledger/src/migrations/ledger-migrations.ts`
- Modify: `packages/billing-ledger/src/ledger-service.ts`
- Modify: `packages/billing-ledger/src/ledger.test.ts`
- Modify: `packages/billing-ledger/src/index.ts`

**Interfaces:**
- Consumes: `executeBillableOperation<T>(params)` sem mudança no contrato público.
- Produces: tabela `billing_operations` e máquina `PENDING | COMPLETED | FAILED`, com `reserved_amount_cents`, lease e snapshot limitado.

- [ ] **Step 1: Escrever testes concorrentes e de crash/retry**

```ts
const calls: string[] = [];
const first = ledger.executeBillableOperation({ ...input, idempotencyKey: 'same', operation: async () => {
  calls.push('executed');
  return { ids: ['a'] };
}});
const second = ledger.executeBillableOperation({ ...input, idempotencyKey: 'same', operation: async () => {
  calls.push('duplicate');
  return { ids: ['b'] };
}});
const [a, b] = await Promise.all([first, second]);
expect(calls).toEqual(['executed']);
expect(a.data).toEqual(b.data);
expect([a.chargedCents, b.chargedCents].sort()).toEqual([0, 20]);
```

Adicionar dois casos: chaves diferentes disputando saldo de R$ 0,20 (uma
execução, uma rejeição antes da operação) e reserva expirada retomada após
falha simulada entre operação e conclusão, sem dois débitos.

- [ ] **Step 2: Executar e confirmar a falha do comportamento atual**

Run: `pnpm exec vitest run packages/billing-ledger/src/ledger.test.ts`

Expected: FAIL porque não existe reserva persistida e a operação ainda ocorre
dentro da transação.

- [ ] **Step 3: Criar schema e migration incremental**

```ts
export const billingOperations = sqliteTable('billing_operations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  accountId: text('account_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull(),
  reservedAmountCents: integer('reserved_amount_cents').notNull(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: text('lease_expires_at'),
  resultSnapshot: text('result_snapshot'),
  errorCode: text('error_code'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('billing_operations_tenant_key_unique').on(table.tenantId, table.idempotencyKey),
  index('billing_operations_account_status_idx').on(table.accountId, table.status),
]);
```

A migration deve criar os mesmos nomes/constraints em SQLite e PostgreSQL e
ser idempotente.

- [ ] **Step 4: Implementar reserve/complete/fail**

```ts
const reservation = await this.reserveOperation(params, costCents);
if (reservation.kind === 'replay') return reservation.result as BillableExecutionResult<T>;
let result: T;
try {
  result = await params.operation(); // fora da transação de lock
} catch (error) {
  await this.failReservation(reservation.id, error);
  throw error;
}
return this.completeReservation(reservation.id, params, result, costCents);
```

`reserveOperation` deve bloquear a conta, subtrair reservas `PENDING` não
expiradas do saldo disponível e adquirir lease por chave. `completeReservation`
deve bloquear conta e reserva, conferir ownership/status, criar `UsageEvent`,
debitar e gravar `ledgerEntry` em uma transação. `failReservation` não debita.

- [ ] **Step 5: Limitar snapshot e preservar replay**

```ts
const serialized = JSON.stringify(result);
if (Buffer.byteLength(serialized, 'utf8') > 256_000) {
  throw new DomainError('OPERATION_RESULT_TOO_LARGE', 'Resultado excede o limite de replay.');
}
```

Testar exatamente 256.000 bytes, 256.001 bytes, snapshot malformado e replay
de operação concluída após reiniciar `LedgerService`.

- [ ] **Step 6: Validar a task**

Run: `pnpm exec vitest run packages/billing-ledger/src/ledger.test.ts packages/billing-ledger/src/billing-service.test.ts`

Expected: PASS, sem chamada externa enquanto a transação está aberta.

- [ ] **Step 7: Preparar commit atômico**

```text
fix(billing): reservar débito antes da operação externa
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 3: Outbox multiworker, reembolso e webhook monotônico

**Files:**
- Modify: `packages/persistence/src/repositories/webhook-repository.ts`
- Modify: `packages/persistence/src/repositories/webhook-repository.test.ts`
- Modify: `apps/api/src/distribution/webhook-service.test.ts`
- Modify: `packages/billing-ledger/src/schema/billing-schema.ts`
- Modify: `packages/billing-ledger/src/migrations/ledger-migrations.ts`
- Modify: `apps/api/src/billing/billing-operations.ts`
- Modify: `apps/api/src/billing/billing-operations.test.ts`
- Modify: `apps/api/src/billing/billing-routes.test.ts`

**Interfaces:**
- Consumes: `Client.forgelexDialect`, `WebhookRepository.claimDueDelivery()` e `BillingOperationsService`.
- Produces: claim atômico por dialeto, uma solicitação aberta de reembolso por compra e transições monotônicas de pagamento.

- [ ] **Step 1: Escrever testes de dois workers e lease**

```ts
const [left, right] = await Promise.all([
  repoA.claimDueDelivery(now),
  repoB.claimDueDelivery(now),
]);
expect([left?.id, right?.id].filter(Boolean)).toEqual([deliveryId]);
```

Adicionar teste que reabre o banco, avança o relógio além da lease e recupera
uma entrega `DELIVERING`; uma entrega `DELIVERED` nunca é recuperada.

- [ ] **Step 2: Implementar claim PostgreSQL atômico**

```sql
WITH candidate AS (
  SELECT d.id
  FROM webhook_deliveries d
  JOIN webhook_endpoints e ON e.id = d.endpoint_id
  WHERE d.status IN ('PENDING','RETRYING','DELIVERING')
    AND d.next_attempt_at <= ? AND e.status = 'ACTIVE'
  ORDER BY d.next_attempt_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE webhook_deliveries d
SET status='DELIVERING', attempt_count=attempt_count+1,
    last_attempt_at=?, next_attempt_at=?, updated_at=?
FROM candidate
WHERE d.id=candidate.id
RETURNING d.id;
```

SQLite deve usar transação `immediate`/update condicional. A chamada HTTP do
`WebhookService` permanece depois do commit do claim.

- [ ] **Step 3: Fixar unicidade de reembolso pendente**

Adicionar `open_key` nullable: valor `purchaseId` enquanto status for
`PENDING`, `null` após decisão; índice único `(tenant_id, open_key)`. Criar a
solicitação dentro de transação e mapear colisão para
`REFUND_REQUEST_ALREADY_PENDING`.

```ts
const [a, b] = await Promise.allSettled([
  service.requestRefund(input), service.requestRefund(input),
]);
expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
```

- [ ] **Step 4: Impedir regressão de status em webhook**

```ts
const allowed: Record<string, string[]> = {
  PENDING: ['PROCESSING', 'PAID', 'FAILED'],
  PROCESSING: ['PAID', 'FAILED'],
  PAID: [],
  FAILED: [],
};
```

Testar evento repetido, `failed` depois de `paid`, assinatura inválida e duas
entregas simultâneas do mesmo `provider/id`: somente um crédito é criado.

- [ ] **Step 5: Validar a task**

Run: `pnpm exec vitest run packages/persistence/src/repositories/webhook-repository.test.ts apps/api/src/distribution/webhook-service.test.ts apps/api/src/billing/billing-operations.test.ts apps/api/src/billing/billing-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Preparar commit atômico**

```text
fix(ops): serializar outbox e reembolsos concorrentes
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 4: Histórico de pesquisa e fila persistida de revisão

**Files:**
- Modify: `packages/persistence/src/schema/schema.ts`
- Modify: `packages/persistence/src/migrations/migration-runner.ts`
- Create: `packages/persistence/src/repositories/research-history-repository.ts`
- Create: `packages/persistence/src/repositories/research-history-repository.test.ts`
- Create: `apps/api/src/review/review-queue-service.ts`
- Create: `apps/api/src/review/review-queue-service.test.ts`
- Create: `apps/api/src/operations/retention-service.ts`
- Create: `apps/api/src/operations/retention-service.test.ts`
- Modify: `packages/persistence/src/repositories/research-memo-repository.ts`
- Modify: `packages/persistence/src/repositories/draft-repository.ts`
- Modify: `packages/persistence/src/index.ts`

**Interfaces:**
- Produces: `ResearchHistoryRepository.record/list`, `ReviewQueueService.list(tenantId)`, `ReviewQueueItem` sem token e `OperationalRetentionService.purge(now)`.
- Consumes: `draftApprovalRequests`, `researchMemos` e matter/draft metadata existente.

- [ ] **Step 1: Escrever testes de histórico isolado por tenant**

```ts
await repo.record({ tenantId: 'a', userId: 'u', operationId: 'op', query: ' dano moral ', court: 'STJ', resultCount: 2, billingMode: 'METERED', chargedCents: 20 });
expect(await repo.list('a', 'u', 5)).toMatchObject([{ query: 'dano moral', court: 'STJ', resultCount: 2 }]);
expect(await repo.list('b', 'u', 5)).toEqual([]);
```

Testar replay com o mesmo `operationId` sem duplicação, query vazia rejeitada,
limit máximo 50 e resultado zero persistido.

- [ ] **Step 2: Criar migration `persistence-0022-research-history`**

```ts
export const researchSearchHistory = sqliteTable('research_search_history', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  operationId: text('operation_id').notNull(),
  query: text('query').notNull(),
  court: text('court').notNull(),
  resultCount: integer('result_count').notNull(),
  billingMode: text('billing_mode').notNull(),
  chargedCents: integer('charged_cents').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('research_history_tenant_operation_unique').on(table.tenantId, table.operationId),
  index('research_history_tenant_user_created_idx').on(table.tenantId, table.userId, table.createdAt),
]);
```

- [ ] **Step 3: Criar view model unificado de revisão**

```ts
export type ReviewQueueItem = {
  id: string;
  kind: 'DRAFT' | 'RESEARCH_MEMO';
  matterId: string;
  targetId: string;
  title: string;
  summary: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  decidedAt?: string;
};
```

Adicionar `listApprovalRequests(tenantId)` já existente ao serviço e
`ResearchMemoRepository.listPendingForTenant(tenantId)`. Não retornar token,
conteúdo integral do draft ou memo, ementa integral ou prompt.

- [ ] **Step 4: Testar fila mista e isolamento**

```ts
const queue = await service.list('tenant-a');
expect(queue.map((item) => item.kind).sort()).toEqual(['DRAFT', 'RESEARCH_MEMO']);
expect(JSON.stringify(queue)).not.toContain('token');
expect(await service.list('tenant-b')).toEqual([]);
```

- [ ] **Step 5: Implementar retenção operacional configurável**

```ts
export class OperationalRetentionService {
  public constructor(private readonly client: Client, private readonly retentionDays = 90) {}
  public async purge(now = new Date()): Promise<{ history: number; snapshots: number; webhookBodies: number }> {
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000).toISOString();
    const history = await this.client.execute({
      sql: 'DELETE FROM research_search_history WHERE created_at < ?', args: [cutoff],
    });
    const operations = await this.client.execute({
      sql: "UPDATE billing_operations SET result_snapshot = NULL WHERE status = 'COMPLETED' AND updated_at < ? AND result_snapshot IS NOT NULL",
      args: [cutoff],
    });
    const entries = await this.client.execute({
      sql: 'UPDATE ledger_entries SET operation_result_snapshot = NULL WHERE created_at < ? AND operation_result_snapshot IS NOT NULL',
      args: [cutoff],
    });
    const webhookBodies = await this.client.execute({
      sql: "UPDATE webhook_deliveries SET response_body_excerpt = NULL WHERE status IN ('DELIVERED','FAILED') AND updated_at < ? AND response_body_excerpt IS NOT NULL",
      args: [cutoff],
    });
    return { history: history.rowsAffected, snapshots: operations.rowsAffected + entries.rowsAffected, webhookBodies: webhookBodies.rowsAffected };
  }
}
```

Executar por timer somente quando `FORGELEX_RETENTION_WORKER_ENABLED=true` e
validar `FORGELEX_OPERATION_RETENTION_DAYS` como inteiro entre 1 e 3650. O
purge não remove ledger entries, usage events, valores financeiros, audit
metadata, matters, authorities ou documentos. Testar cutoff exato, dry run
inexistente (não prometer modo não implementado) e tenant/corpus preservados.
Replay cuja chave existe mas cujo snapshot expirou deve retornar
`IDEMPOTENCY_RESULT_EXPIRED`, sem reexecutar nem debitar a operação.

- [ ] **Step 6: Validar a task**

Run: `pnpm exec vitest run packages/persistence/src/repositories/research-history-repository.test.ts apps/api/src/review/review-queue-service.test.ts apps/api/src/operations/retention-service.test.ts packages/persistence/src/persistence.test.ts`

Expected: PASS e migrations idempotentes.

- [ ] **Step 7: Preparar commit atômico**

```text
feat(persistence): persistir histórico e fila de revisão
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 5: API operacional e OpenAPI

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/distribution/openapi.ts`
- Modify: `apps/api/src/account-routes.test.ts`

**Interfaces:**
- Consumes: repositories/services das Tasks 1–4.
- Produces: `GET /api/v2/research/history`, `GET /api/v2/review-queue`, decisões canônicas existentes e status operacional documentado.

- [ ] **Step 1: Escrever testes REST de contrato e tenant**

```ts
const history = await app.inject({ method: 'GET', url: '/api/v2/research/history', headers: authA });
expect(history.statusCode).toBe(200);
expect(history.json()).toEqual({ items: expect.any(Array), total: expect.any(Number) });

const queue = await app.inject({ method: 'GET', url: '/api/v2/review-queue', headers: authA });
expect(queue.json().items.every((item: object) => !('token' in item))).toBe(true);
```

Adicionar tenant B, scopes ausentes, aprovação já decidida e source
indisponível. Tenant B recebe lista própria e não consegue decidir item A.

- [ ] **Step 2: Registrar histórico somente após busca concluída**

Após `research.search_case_law` retornar, chamar:

```ts
await researchHistoryRepository.record({
  tenantId: request.principal.tenantId,
  userId: request.principal.userId,
  operationId: idempotencyKey,
  query: q,
  court: 'STJ',
  resultCount: execution.data.length,
  billingMode: execution.billingMode,
  chargedCents: execution.chargedCents,
});
```

Não registrar falha/cancelamento. Replay usa a unicidade por operação e mantém
um único item.

- [ ] **Step 3: Publicar fila e decisões sem nova regra de domínio**

`GET /api/v2/review-queue` chama `ReviewQueueService.list`. Draft continua
resolvido por `draftingService.resolveApproval`; memo continua por
`researchMemoRepository.reviewMemo`. Adicionar no item URLs de ação relativas,
sem token no payload de listagem.

- [ ] **Step 4: Atualizar OpenAPI com schemas reais**

Adicionar `ResearchHistoryResponse`, `ReviewQueueResponse`,
`OperationalStatusResponse` e referências para erros `401/403/404/409/503`.
Fixar no teste:

```ts
expect(document.paths['/api/v2/review-queue'].get.responses['200'].content['application/json'].schema.$ref)
  .toBe('#/components/schemas/ReviewQueueResponse');
```

- [ ] **Step 5: Validar a task**

Run: `pnpm exec vitest run apps/api/src/app.test.ts apps/api/src/account-routes.test.ts apps/web/src/screens/ApiDocsScreen.test.ts`

Expected: PASS.

- [ ] **Step 6: Preparar commit atômico**

```text
feat(api): expor histórico e fila operacional persistidos
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 6: Clients tipados e estado remoto do frontend

**Files:**
- Create: `apps/web/src/operations/contracts.ts`
- Create: `apps/web/src/operations/operations-client.ts`
- Create: `apps/web/src/operations/operations-client.test.ts`
- Modify: `apps/web/src/context/AppContext.tsx`
- Create: `apps/web/src/context/AppContext.test.ts`
- Modify: `apps/web/src/api-client.ts`

**Interfaces:**
- Consumes: endpoints da Task 5 e `requestApi` autenticado.
- Produces: `OperationalResource<T>`, `searchCaseLaw(intent)`, `retrySearch(intent)`, `loadTribunals/history/reviewQueue` e `resolveReview`.

- [ ] **Step 1: Definir contratos e testar mapeamento completo**

```ts
export type RemoteState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';
export type OperationalResource<T> = { state: RemoteState; data: T; error?: string };
export type SearchIntent = { idempotencyKey: string; query: string; court: 'STJ'; limit: number };
export const createSearchIntent = (query: string, court: 'STJ', limit = 20): SearchIntent => ({
  idempotencyKey: `web_search_${crypto.randomUUID()}`, query, court, limit,
});
```

Testar os cinco estados de verificação, headers de billing, resultado zero e
`SOURCE_PROVIDER_UNAVAILABLE` mapeado para `unavailable`.

- [ ] **Step 2: Fixar semântica de idempotência no client**

```ts
const intent = createSearchIntent('dano moral', 'STJ');
await client.searchCaseLaw(intent).catch(() => undefined);
await client.searchCaseLaw(intent);
expect(fetcher.mock.calls[0][1].headers['Idempotency-Key'])
  .toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
expect(createSearchIntent('dano moral', 'STJ').idempotencyKey).not.toBe(intent.idempotencyKey);
```

- [ ] **Step 3: Reduzir `AppContext` a orquestração remota**

Remover arrays locais de approvals/recentSearches e `resolveApproval` síncrono.
O provider deve expor:

```ts
tribunals: OperationalResource<TribunalCapability[]>;
recentSearches: OperationalResource<ResearchHistoryItem[]>;
reviewQueue: OperationalResource<ReviewQueueItem[]>;
refreshOperationalState(): Promise<void>;
performSearch(intent: SearchIntent): Promise<SearchExecution>;
resolveReview(item: ReviewQueueItem, decision: 'APPROVED' | 'REJECTED', reason?: string): Promise<void>;
```

Após decisão, recarregar a fila; erro mantém o item real e muda somente o
estado de erro.

- [ ] **Step 4: Validar a task**

Run: `pnpm exec vitest run apps/web/src/operations/operations-client.test.ts apps/web/src/context/AppContext.test.ts apps/web/src/api-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Preparar commit atômico**

```text
refactor(web): consumir estado operacional persistido
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 7: Research Desk, Dashboard e superfícies comerciais

**Files:**
- Modify: `apps/web/src/screens/ResearchDeskScreen.tsx`
- Create: `apps/web/src/screens/research-desk-model.ts`
- Create: `apps/web/src/screens/research-desk-model.test.ts`
- Modify: `apps/web/src/screens/DashboardScreen.tsx`
- Create: `apps/web/src/screens/review-queue-model.ts`
- Create: `apps/web/src/screens/review-queue-model.test.ts`
- Modify: `apps/web/src/screens/LandingScreen.tsx`
- Modify: `apps/web/src/screens/MatterWorkspaceScreen.tsx`
- Modify: `apps/web/src/screens/ConnectionsScreen.tsx`
- Modify: `apps/web/src/screens/ApiDocsScreen.tsx`

**Interfaces:**
- Consumes: `AppContext` da Task 6.
- Produces: UI sem listas/estados fictícios e com mensagens comerciais coerentes.

- [ ] **Step 1: Escrever testes de Research Desk**

```ts
const model = createResearchDeskModel({
  tribunals: [{ code: 'STJ', searchable: true }, { code: 'STF', searchable: false }],
  search: { state: 'ready', chargedCents: 20, resultCount: 0 },
});
expect(model.courts.map((court) => court.code)).toEqual(['STJ']);
expect(model.verificationActionLabel).toBe('Verificar gratuitamente');
expect(model.emptyMessage).toContain('operação concluída');
```

Adicionar source unavailable sem preço/débito, resultado vazio faturável,
replay com `chargedCents: 0`, cobertura/data e cada verification status.

- [ ] **Step 2: Implementar catálogo e estados reais**

Remover `<option>STJ</option>` estático. Renderizar somente
`tribunals.data.filter(t => t.searchable)`. Desabilitar formulário se não
houver tribunal pesquisável. Trocar “Verificar por R$ 0,20” por “Verificar
gratuitamente”. Mostrar cobrança apenas a partir do resultado/headers da busca.

- [ ] **Step 3: Escrever testes da fila persistida**

```ts
expect(reduceReviewQueue(state, { type: 'resolve_started', id: item.id }).items[0]?.busy)
  .toBe(true);
expect(reduceReviewQueue(state, { type: 'resolve_failed', id: item.id, error: 'CONFLICT' }).items[0])
  .toMatchObject({ status: 'PENDING', error: 'CONFLICT' });
```

Testar conflito: client rejeita com 409, item permanece e refresh é chamado.
Não renderizar token nem afirmar “efeito externo” para revisão interna.

- [ ] **Step 4: Atualizar histórico, matter e claims comerciais**

Landing usa `recentSearches.data`; Matter Workspace recarrega memo/approval;
Connections e ApiDocs declaram que o host fornece modelo/contexto e o ForgeLex
cobra apenas busca STJ. Remover claims de cartão salvo/recarga automática que o
Mercado Pago ativo não suporta.

- [ ] **Step 5: Validar a task**

Run: `pnpm exec vitest run apps/web/src/screens/research-desk-model.test.ts apps/web/src/screens/review-queue-model.test.ts apps/web/src/screens/ApiDocsScreen.test.ts`

Expected: PASS.

- [ ] **Step 6: Validar build visual/estático**

Run: `pnpm --filter @forgelex/web build`

Expected: PASS sem imports ou tipos quebrados.

- [ ] **Step 7: Preparar commit atômico**

```text
feat(web): refletir pesquisa e aprovações persistidas
```

Não executar `git commit` ou `git push` sem autorização explícita.

---

### Task 8: PostgreSQL, E2E, carga e gate documental

**Files:**
- Modify: `scripts/smoke-postgres.mjs`
- Create: `scripts/load-search.mjs`
- Create: `scripts/e2e-phase-7-server.mjs`
- Create: `playwright.config.ts`
- Create: `tests/e2e/phase-7.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `STATUS_VALIDACAO.md`
- Modify: `README.md`
- Modify: `Plano de conclusão progressiva do F.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: todos os contratos das Tasks 1–7.
- Produces: comandos `test:postgres`, `test:e2e:phase7`, `test:load:search` e evidência reproduzível da fase.

- [ ] **Step 1: Expandir smoke PostgreSQL**

O script deve validar e reportar estes checks exatos:

```js
const checks = [
  'migrations_idempotent', 'corpus_global', 'tenant_isolation',
  'billing_reservation_concurrency', 'refund_concurrency',
  'matter_workflow', 'research_history', 'review_queue',
  'outbox_two_workers', 'worker_restart', 'readiness', 'metrics',
];
assert.deepEqual(failedChecks, []);
console.log(JSON.stringify({ status: 'passed', driver: 'postgres', checks }));
```

Usar prefixo único por execução e cleanup explícito das linhas criadas. Não
apagar corpus global preexistente.

- [ ] **Step 2: Criar carga básica da busca**

```js
const concurrency = Number(process.env.FORGELEX_LOAD_CONCURRENCY ?? 5);
const requests = Number(process.env.FORGELEX_LOAD_REQUESTS ?? 25);
// cada intenção recebe UUID próprio; retries do mesmo item reutilizam a chave
```

O script autentica com fixture/API key local, mede status, erros, p50/p95,
replays e diferença de saldo. Falha se houver resposta 5xx, débito divergente
ou mais de 1% de erro; imprime métricas sem query, token ou payload jurídico.

- [ ] **Step 3: Criar E2E Chromium controlado**

Adicionar `@playwright/test` como devDependency e script:

```json
"test:e2e:phase7": "playwright test tests/e2e/phase-7.spec.ts --project=chromium"
```

Configurar dois servidores:

```ts
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node scripts/e2e-phase-7-server.mjs', url: 'http://127.0.0.1:3001/readyz', reuseExistingServer: false },
    { command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1', url: 'http://127.0.0.1:3000', reuseExistingServer: false },
  ],
});
```

`e2e-phase-7-server.mjs` deve abrir um fake Supabase local mínimo em `54321`
(`POST /auth/v1/token`, `GET /auth/v1/user`, `POST /auth/v1/logout`), iniciar a
API com `SUPABASE_URL=http://127.0.0.1:54321`, PostgreSQL local, corpus STJ
fixture e payment provider fake injetado. O usuário retornado deve conter
`email_confirmed_at`; o token não será um secret real e existirá apenas durante
o processo.

O Playwright preenche a tela real de login, aguarda `/api/v2/auth/bootstrap`,
e cobre catálogo somente STJ, busca com resultado, busca vazia, verificação
gratuita, compra pendente/confirmada simulada, fila e decisão. Não usa Mercado
Pago ou Supabase live.

- [ ] **Step 4: Atualizar CI sem APIs pagas**

Manter o job padrão (`typecheck`, `test`, `build`) e adicionar job PostgreSQL
com service `postgres:16`, migrations e smoke. E2E instala Chromium e usa
fixtures locais. Nenhuma variável secreta real entra no workflow.

- [ ] **Step 5: Executar gates focados**

Run:

```text
pnpm db:migrate
pnpm test:postgres
pnpm test:e2e:phase7
pnpm test:load:search
```

Expected: todos PASS na instância PostgreSQL local; registrar p50/p95 e número
de operações sem transformar o resultado em SLA.

- [ ] **Step 6: Executar gates completos**

Run:

```text
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
git diff --check
```

Expected: todos PASS. Se um worker Vitest cair sem teste funcional identificado,
reexecutar uma vez para determinar reprodutibilidade; não declarar verde com
erro não tratado.

- [ ] **Step 7: Atualizar documentação somente com evidência real**

Registrar em `STATUS_VALIDACAO.md`: branch/HEAD, banco local, migrations,
contagens, concorrência, outbox, E2E, carga, comandos e resultados. Manter
explícitos como não executados: migration remota, deploy, credenciais live e
homologação pública. Marcar a Fase 7 concluída no plano canônico apenas após
todos os gates desta task.

- [ ] **Step 8: Revisar diff e preparar commit final da fase**

```text
test(ops): validar operação comercial em PostgreSQL
```

Separar documentação se o diff for logicamente independente:

```text
docs(status): registrar conclusão local da Fase 7
```

Não executar `git commit` ou `git push` sem autorização explícita.
