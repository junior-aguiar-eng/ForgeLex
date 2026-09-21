# Fase 14 — estabilização operacional do produto STJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validar a operação pública do produto limitado ao STJ e uma única compra real de R$ 25,00, com evidência saneada e sem nova superfície comercial ou tribunal.

**Architecture:** O plano reutiliza checkout, webhook Mercado Pago, compra e ledger publicados; não cria rota financeira paralela. Um bootstrap próprio gera identidade técnica sem permissões jurídicas e armazena sua chave exclusivamente no Secret Manager; a confirmação remota compara API ForgeLex, ordem Mercado Pago, webhook e ledger sob a mesma idempotency key.

**Tech Stack:** TypeScript, Node.js 22, pnpm 11, Vitest 4, Fastify, PostgreSQL/Cloud SQL, Cloud Run, Secret Manager, Mercado Pago Orders API e PowerShell.

**Spec:** `docs/superpowers/specs/2026-09-21-fase-14-estabilizacao-stj-design.md`

**Execution status:** `COMPLETED` em 2026-09-21. A evidência operacional
canônica está em `docs/operations/phase14/controlled-charge-evidence.md`.
O registro final preserva `docs/operations/phase8/final-validation.md` como
artefato histórico imutável: a evidência complementar desta fase foi mantida
no documento próprio da Fase 14.

## Global Constraints

- Fases 9 a 13 permanecem `FROZEN_STRATEGICALLY`; STJ é a única capability jurídica comercial.
- Não importar, deduplicar, varrer ou alterar corpus, provider, parser ou fonte jurídica.
- O teto é uma compra `credits_25` de R$ 25,00; não criar segunda ordem, recarga, consumo ou reembolso.
- Abrir checkout e confirmar pagamento exigem confirmação expressa do usuário imediatamente antes de cada ato.
- A identidade recebe exclusivamente `billing:read` e `billing:write`, sem permissões jurídicas, MCP, administrativas ou de refund.
- Credenciais, assinatura, e-mail, checkout URL e identificadores de pagamento não entram em logs, commits, chat ou documentação.
- Falha em checkout, webhook ou reconciliação encerra a execução sem crédito manual, nova compra ou compensação.

## Review Focus

- Chave exclusiva de billing recebe `403` em pesquisa STJ; Task 1 fixa esse teste.
- Mesmo `Idempotency-Key` retorna a mesma compra e uma só ordem; Tasks 2 e 4 fixam-no local e remotamente.
- Checkout sem `Idempotency-Key` permanece `400`; Task 2 preserva o contrato.
- Assinatura inválida do webhook permanece `401` antes de consultar o provider; Task 2 preserva a fronteira.
- Reentrega segura preserva uma compra `PAID` e saldo de `2500`; Task 5 reconcilia as fontes.

---

### Task 1: Criar bootstrap mínimo da identidade de cobrança

**Files:**
- Create: `scripts/phase14/bootstrap-billing-tenant.mjs`
- Create: `scripts/phase14/bootstrap-billing-tenant.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AccountRepository.bootstrap`, `LedgerService.provisionAccount`, `ApiKeyService.create`, `assertRemoteSeed` e `writeTokenToSecret`.
- Produces: `bootstrapBillingTenant(deps, identityPrefix): Promise<{ tenantId: string; userId: string; keyId: string; keyPrefix: string }>`.

- [x] **Step 1: Escrever o teste de escopo e saldo mínimos**

```ts
import { expect, it, vi } from 'vitest';
import { BILLING_SCOPES, bootstrapBillingTenant } from './bootstrap-billing-tenant.mjs';

it('cria identidade de billing sem saldo e sem scope jurídico', async () => {
  const deps = {
    bootstrapAccount: vi.fn(async () => ({ user: { id: 'user_14' }, tenant: { id: 'tenant_14' } })),
    provisionAccount: vi.fn(async () => undefined),
    createApiKey: vi.fn(async () => ({ id: 'key_14', keyPrefix: 'flx_live_prefix', token: 'flx_live_value' })),
    writeToken: vi.fn(async () => undefined),
  };
  const result = await bootstrapBillingTenant(deps, 'phase14_billing_fixed');
  expect(BILLING_SCOPES).toEqual(['billing:read', 'billing:write']);
  expect(deps.provisionAccount).toHaveBeenCalledWith('tenant_14', { paidBalanceCents: 0, promotionalBalanceCents: 0 });
  expect(JSON.stringify(result)).not.toContain('flx_live_value');
});
```

- [x] **Step 2: Executar o teste e confirmar a falha inicial**

Run: `pnpm vitest run scripts/phase14/bootstrap-billing-tenant.test.ts`

Expected: FAIL porque o módulo ainda não existe.

- [x] **Step 3: Implementar o bootstrap isolado**

```js
export const BILLING_SCOPES = Object.freeze(['billing:read', 'billing:write']);

export async function bootstrapBillingTenant(deps, identityPrefix) {
  if (!identityPrefix.startsWith('phase14_billing_')) throw new Error('PHASE14_ID_PREFIX_REQUIRED');
  const account = await deps.bootstrapAccount({
    supabaseUserId: identityPrefix,
    email: `${identityPrefix}@nexojuris.ia.br`,
    displayName: 'Validação Fase 14',
  });
  await deps.provisionAccount(account.tenant.id, { paidBalanceCents: 0, promotionalBalanceCents: 0 });
  const apiKey = await deps.createApiKey({
    tenantId: account.tenant.id, subjectId: account.user.id, userId: account.user.id,
    name: identityPrefix, roles: ['lawyer'], scopes: BILLING_SCOPES,
  });
  await deps.writeToken(apiKey.token);
  return { tenantId: account.tenant.id, userId: account.user.id, keyId: apiKey.id, keyPrefix: apiKey.keyPrefix };
}
```

O entrypoint exige `FORGELEX_PHASE14_TARGET_DATABASE_URL`, `FORGELEX_PHASE14_ALLOW_REMOTE_SEED=confirmed`, `FORGELEX_PHASE14_TARGET_KIND=cloud-sql-auth-proxy`, `FORGELEX_PHASE14_TOKEN_SECRET` e `FORGELEX_PHASE14_GCP_PROJECT`; usa o padrão de `scripts/phase8/bootstrap-synthetic-tenant.mjs`, nunca imprime o token e só o encaminha para `writeTokenToSecret`.

- [x] **Step 4: Executar testes focados e adicionar o script do pacote**

Run: `pnpm vitest run scripts/phase14/bootstrap-billing-tenant.test.ts scripts/phase8/bootstrap-synthetic-tenant.test.ts`

Expected: PASS, com escopos exclusivos de billing, saldo zero e token ausente do retorno.

```json
"phase14:bootstrap-billing": "pnpm build && node scripts/phase14/bootstrap-billing-tenant.mjs"
```

- [x] **Step 5: Commit**

```bash
git add package.json scripts/phase14/bootstrap-billing-tenant.mjs scripts/phase14/bootstrap-billing-tenant.test.ts
git commit -m "feat(phase14): isolar identidade de cobrança"
```

### Task 2: Fixar os contratos locais de checkout e webhook

**Files:**
- Modify: `apps/api/src/billing/billing-routes.test.ts:60-155`
- Modify: `apps/api/src/billing/billing-operations.test.ts:42-74`
- Modify: `apps/api/src/billing/mercado-pago-payment-provider.test.ts:107-145`

**Interfaces:**
- Consumes: `POST /api/v2/billing/checkout`, `POST /api/v2/webhooks/mercadopago`, `BillingOperationsService.createCheckout` e `processWebhook`.
- Produces: contrato de uma ordem por idempotency key, `400` sem chave, `401` para assinatura inválida e saldo único `2500` após replay.

- [x] **Step 1: Adicionar teste de bloqueio da pesquisa para chave billing-only**

```ts
const response = await app.inject({
  method: 'POST', url: '/api/v2/research/search-case-law',
  headers: { authorization: 'Bearer billing-only-token', 'idempotency-key': 'scope_14' },
  payload: { query: 'vazamento', court: 'STJ', limit: 1 },
});
expect(response.statusCode).toBe(403);
```

O `TokenVerifier` deve devolver, somente para `billing-only-token`, um principal com `scopes: ['billing:read', 'billing:write']`.

- [x] **Step 2: Executar a falha de fronteira e ajustar somente o fixture**

Run: `pnpm --filter @forgelex/api test -- billing-routes.test.ts`

Expected: após o fixture reconhecer o token, PASS com `403`; a rota produtiva não é alterada.

- [x] **Step 3: Fixar unicidade de `credits_25` no serviço**

```ts
const first = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
const replay = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
expect(replay.purchaseId).toBe(first.purchaseId);
expect(provider.checkouts).toHaveLength(1);
expect(first.amountCents).toBe(2500);
```

- [x] **Step 4: Executar a matriz de regressão de billing**

Run: `pnpm --filter @forgelex/api test -- billing-routes.test.ts billing-operations.test.ts mercado-pago-payment-provider.test.ts`

Expected: PASS, inclusive `400` sem `Idempotency-Key`, `401` para assinatura inválida e `2500` após dois processamentos do mesmo evento.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/billing/billing-routes.test.ts apps/api/src/billing/billing-operations.test.ts apps/api/src/billing/mercado-pago-payment-provider.test.ts
git commit -m "test(phase14): fixar limites do checkout"
```

### Task 3: Registrar preflight remoto somente de leitura

**Files:**
- Create: `docs/operations/phase14/controlled-charge-evidence.md`
- Modify: `docs/operations/phase8/final-validation.md:1-68`

**Interfaces:**
- Consumes: domínios raiz/HML, revisão Cloud Run, referências Secret Manager e saúde HTTP.
- Produces: evidência saneada `READY_FOR_SINGLE_CHECKOUT` ou `STOPPED_BEFORE_FINANCIAL_MUTATION`.

- [x] **Step 1: Criar o registro de evidência com os campos abaixo**

```markdown
# Fase 14 — evidência de cobrança controlada

## Preflight

- execução (UTC):
- revisão Cloud Run:
- raiz e hml (`/health`):
- `run.app/health`:
- ingress:
- certificados:
- referências de segredos Mercado Pago:
- decisão: `READY_FOR_SINGLE_CHECKOUT` ou `STOPPED_BEFORE_FINANCIAL_MUTATION`.
```

- [x] **Step 2: Consultar saúde, ingress e env refs sem mutação**

Run:

```powershell
$p='project-bbbe1209-c295-4720-867'; $r='southamerica-east1'; $s='forgelex-api-hml'
(Invoke-WebRequest https://nexojuris.ia.br/health -UseBasicParsing).StatusCode
(Invoke-WebRequest https://hml.nexojuris.ia.br/health -UseBasicParsing).StatusCode
gcloud run services describe $s --project=$p --region=$r --format='yaml(status.latestReadyRevisionName,metadata.annotations,spec.template.metadata.annotations)'
gcloud run services describe $s --project=$p --region=$r --format='value(spec.template.spec.containers[0].env)'
gcloud compute ssl-certificates describe forgelex-api-prod-cert --project=$p --global --format='value(managed.status)'
gcloud compute ssl-certificates describe forgelex-api-hml-cert --project=$p --global --format='value(managed.status)'
```

Expected: ambas as saúdes `200`, ingress `internal-and-cloud-load-balancing`, os dois certificados `ACTIVE` e referências, não valores, dos segredos Mercado Pago.

- [x] **Step 3: Confirmar bloqueio da URL nativa**

Run:

```powershell
$u=gcloud run services describe forgelex-api-hml --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --format='value(status.url)'
try { (Invoke-WebRequest "$u/health" -UseBasicParsing -ErrorAction Stop).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `404`; qualquer divergência grava `STOPPED_BEFORE_FINANCIAL_MUTATION` e encerra antes de criar a ordem.

- [x] **Step 4: Testar saneamento e commit**

Run: `pnpm vitest run scripts/phase8/redact-evidence.test.ts`

Expected: PASS; campos de segredo e token são recusados pelo sanitizador.

```bash
git add docs/operations/phase14/controlled-charge-evidence.md docs/operations/phase8/final-validation.md
git commit -m "docs(phase14): registrar preflight de cobrança"
```

### Task 4: Criar uma única ordem e pausar antes do pagamento

**Files:**
- Modify: `docs/operations/phase14/controlled-charge-evidence.md`

**Interfaces:**
- Consumes: segredo temporário `forgelex-phase14-billing-token`, checkout e consulta da compra.
- Produces: uma compra `PENDING`, uma order Mercado Pago e evidência de replay sem segunda compra.

- [x] **Step 1: Executar bootstrap com proxy Cloud SQL e Secret Manager**

Run:

```powershell
$env:FORGELEX_PHASE14_TARGET_DATABASE_URL = '<URL apenas na sessão do proxy Cloud SQL>'
$env:FORGELEX_PHASE14_ALLOW_REMOTE_SEED = 'confirmed'
$env:FORGELEX_PHASE14_TARGET_KIND = 'cloud-sql-auth-proxy'
$env:FORGELEX_PHASE14_TOKEN_SECRET = 'forgelex-phase14-billing-token'
$env:FORGELEX_PHASE14_GCP_PROJECT = 'project-bbbe1209-c295-4720-867'
pnpm run phase14:bootstrap-billing
```

Expected: somente `tenantId`, `userId`, `keyId` e `keyPrefix` são impressos.

- [x] **Step 2: Consultar a conta vazia sem imprimir a chave**

Run:

```powershell
$token=gcloud secrets versions access latest --secret=forgelex-phase14-billing-token --project=project-bbbe1209-c295-4720-867
Invoke-RestMethod https://nexojuris.ia.br/api/v2/billing/account -Headers @{ Authorization="Bearer $token" } | ConvertTo-Json -Depth 8
Remove-Variable token
```

Expected: saldo pago `0` e pacote `credits_25` com `amountCents: 2500`.

- [x] **Step 3: Obter confirmação expressa imediatamente antes de criar a ordem**

Expected: sem confirmação, não executar POST, não abrir navegador e não criar ordem.

- [x] **Step 4: Criar checkout e repetir somente a mesma idempotency key**

Run:

```powershell
$token=gcloud secrets versions access latest --secret=forgelex-phase14-billing-token --project=project-bbbe1209-c295-4720-867
$idempotency=[guid]::NewGuid().ToString()
$headers=@{ Authorization="Bearer $token"; 'Idempotency-Key'=$idempotency; 'Content-Type'='application/json' }
$first=Invoke-RestMethod https://nexojuris.ia.br/api/v2/billing/checkout -Method Post -Headers $headers -Body '{"packageId":"credits_25"}'
$replay=Invoke-RestMethod https://nexojuris.ia.br/api/v2/billing/checkout -Method Post -Headers $headers -Body '{"packageId":"credits_25"}'
Remove-Variable token
```

Expected: ambos retornam o mesmo `purchaseId`, `PENDING` e `2500`; URL de checkout fica somente na sessão e o identificador vira hash curto na evidência.

- [x] **Step 5: Obter confirmação expressa imediatamente antes de abrir e pagar**

Expected: sem confirmação, encerrar com a compra pendente, sem abrir checkout e sem cobrança.

### Task 5: Aprovar a única ordem, reconciliar e revogar a chave

**Files:**
- Modify: `docs/operations/phase14/controlled-charge-evidence.md`
- Modify: `docs/operations/phase8/final-validation.md:1-68`

**Interfaces:**
- Consumes: checkout da Task 4, webhook Mercado Pago, API de compra/conta/extrato e console Mercado Pago.
- Produces: uma ordem, uma compra `PAID`, saldo `2500`, evidência de idempotência e chave temporária inválida.

- [x] **Step 1: Abrir a única URL de checkout já criada e pagar somente após confirmação do usuário**

Expected: uma aprovação produtiva de R$ 25,00; falha de pagamento não autoriza outra compra.

- [x] **Step 2: Consultar compra, conta e extrato após webhook assinado**

Run:

```powershell
$token=gcloud secrets versions access latest --secret=forgelex-phase14-billing-token --project=project-bbbe1209-c295-4720-867
$h=@{ Authorization="Bearer $token" }
Invoke-RestMethod "https://nexojuris.ia.br/api/v2/billing/purchases/<purchaseId-da-sessao>" -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod https://nexojuris.ia.br/api/v2/billing/account -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod https://nexojuris.ia.br/api/v2/billing/transactions -Headers $h | ConvertTo-Json -Depth 8
Remove-Variable token
```

Expected: compra `PAID`, saldo exato `2500`, um crédito e nenhuma operação jurídica.

- [x] **Step 3: Reconciliar com Mercado Pago e testar reentrega segura**

Expected: painel do provider mostra aprovação/processamento de R$ 25,00 e referência externa compatível com o hash da compra. Reentregar apenas evento já entregue pelo provider; compra continua `PAID` e saldo continua `2500`. Sem opção segura de reentrega, registrar o limite e usar o teste local de replay da Task 2.

- [x] **Step 4: Revogar a chave, testar `401` e desabilitar seu segredo**

Run:

```powershell
$token=gcloud secrets versions access latest --secret=forgelex-phase14-billing-token --project=project-bbbe1209-c295-4720-867
Invoke-RestMethod "https://nexojuris.ia.br/api/v2/api-keys/<keyId-da-sessao>" -Method Delete -Headers @{ Authorization="Bearer $token" }
try { Invoke-WebRequest https://nexojuris.ia.br/api/v2/billing/account -Headers @{ Authorization="Bearer $token" } -UseBasicParsing -ErrorAction Stop } catch { $_.Exception.Response.StatusCode.value__ }
Remove-Variable token
gcloud secrets versions disable latest --secret=forgelex-phase14-billing-token --project=project-bbbe1209-c295-4720-867 --quiet
```

Expected: `401`; não apagar tenant, compra ou dados financeiros.

- [x] **Step 5: Consolidar documentação, verificar e publicar**

Run:

```powershell
pnpm vitest run scripts/phase14/bootstrap-billing-tenant.test.ts scripts/phase8/redact-evidence.test.ts
pnpm --filter @forgelex/api test -- billing-routes.test.ts billing-operations.test.ts mercado-pago-payment-provider.test.ts
git diff --check
git status --short
```

Expected: testes PASS, evidência saneada, nenhuma alteração de corpus ou tribunal.

```bash
git add docs/operations/phase14/controlled-charge-evidence.md docs/operations/phase8/final-validation.md
git commit -m "docs(phase14): registrar cobrança controlada STJ"
git push origin main
```

## Self-review

**Cobertura da especificação:** Task 1 entrega identidade isolada; Task 2 preserva contratos críticos; Task 3 verifica domínio, TLS, ingress, URL nativa e referências de segredos; Task 4 cria uma única compra e exige as duas confirmações; Task 5 reconcilia provider, webhook, compra e ledger, revoga a credencial e fecha a documentação. As restrições globais vedam expansão de tribunais, operações jurídicas, reembolso, recarga, consumo, corpus e exposição de segredos.

**Checagem de completude:** cada mutação tem condição prévia, comando concreto, resultado esperado e condição de parada; valores produzidos na sessão permanecem em memória/variável de sessão e entram na documentação apenas como hash curto.

**Consistência de interfaces:** `BILLING_SCOPES`, `bootstrapBillingTenant`, `forgelex-phase14-billing-token`, `credits_25`, `2500` e os endpoints de checkout/consulta mantêm o mesmo nome em todas as tarefas.

**Review focus:** os cinco riscos listados têm teste ou reconciliação associada nas Tasks 1, 2, 4 e 5; nenhum exige reexecução de ingestão ou pesquisa jurídica.

## Registro de encerramento

- Todas as etapas deste plano foram executadas e verificadas. A matriz focada
  de billing passou com `25/25` testes e o bootstrap/saneamento com `12/12`.
- A única ordem produtiva foi processada e reconciliada como `PAID`, com saldo
  pago de `2500` centavos. A mesma chave de idempotência não criou segunda
  ordem.
- A primeira entrega do provider falhou antes da correção da assinatura. Após
  reconciliar a assinatura efetiva na revisão ativa do Cloud Run, um replay
  autenticado do mesmo evento retornou `200`, sem crédito manual, nova compra,
  recarga, consumo ou reembolso.
- A chave de billing temporária foi revogada, sua reutilização retornou `401`
  e a versão do segredo temporário foi desabilitada. A compra e o ledger foram
  preservados para auditoria.
- A ausência de uma entrega espontânea posterior do provider não é pendência
  desta fase: o teto de uma única cobrança impede criar uma segunda ordem só
  para essa observação. O primeiro pagamento futuro pode ser monitorado como
  evidência operacional ordinária.
