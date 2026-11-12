# Agent Core Fase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tornar o Agent Core e os adapters OpenAI/Anthropic opcionais, verificáveis e incapazes de gerar débito comercial por modelo ou tokens.

**Architecture:** `AgentRuntime` continuará somente como fachada vendor-neutral sobre `AgentProvider` e o registry de tools. Os adapters consumirão exclusivamente tools registradas e emitirão eventos normalizados; uso de provider permanecerá metadado no evento final, sem acesso ao ledger. REST e MCP permanecerão consumidores diretos do Legal Tool Gateway.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspaces, OpenAI Agents SDK e Claude Agent SDK em streams falsos.

**Spec:** `Plano de conclusão progressiva do F.md` — Fase 5.

## Global Constraints

- STJ continua o único tribunal comercial habilitado.
- Credenciais, modelo e faturamento OpenAI/Anthropic pertencem ao integrador e nunca são persistidos ou expostos pelo ForgeLex.
- Token, provider, modelo e custo técnico não podem formar preço, unidade, margem, conversão ou lançamento no ledger comercial.
- As mesmas tools, schemas, capabilities, políticas, erros e proveniência do Legal Tool Gateway devem ser usadas pelo runtime opcional.
- REST e MCP devem funcionar sem carregar `AgentRuntime` nem qualquer adapter de modelo; o `ToolRegistry` compartilhado permanece parte da infraestrutura jurídica.
- Não executar migration remota, deploy, commit ou push sem autorização específica.

## Review Focus

- Sinal de aborto já disparado deve produzir `SESSION_CANCELLED` sem executar tool ou provider.
- Uma tool de alto impacto deve permanecer em `WAITING_HUMAN_APPROVAL` sem efeito colateral antes de retomada autenticada.
- Timeout de tool deve produzir erro normalizado e liberar listeners/timers.
- Exceção contendo chave do provider não pode aparecer em evento, erro ou output.
- Eventos `usage` devem ser normalizados apenas como metadados e não causar qualquer alteração de ledger.

---

### Task 1: Contrato de sessão resumível e lifecycle vendor-neutral

**Files:**
- Modify: `packages/agent-core/src/contracts/agent-provider.ts`
- Modify: `packages/agent-core/src/runtime/agent-runtime.ts`
- Modify: `packages/agent-core/src/runtime/session-state-machine.ts`
- Create: `packages/agent-core/src/runtime/agent-runtime.test.ts`

**Interfaces:**
- Consumes: `AgentProvider.run(input)` e `AgentProvider.cancel(sessionId)`.
- Produces: `AgentRuntime.resume(sessionId, approvalToken)` e transições de estado explícitas para providers capazes de retomar.

- [ ] **Step 1: Write the failing tests**

```ts
expect(await runtime.resume(sessionId, approvalToken)).toEqual({ resumed: true });
expect(runtime.getSessionState(sessionId)?.getStatus()).toBe('RUNNING');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @forgelex/agent-core test -- agent-runtime.test.ts`

- [ ] **Step 3: Add the minimal vendor-neutral resume contract**

```ts
export interface AgentProvider {
  resume?(sessionId: string, approvalToken: string): Promise<boolean>;
}
```

`AgentRuntime.resume` must reject providers that do not support continuation with the structured `SESSION_RESUME_UNSUPPORTED` domain error.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm --filter @forgelex/agent-core test -- agent-runtime.test.ts`

### Task 2: Deterministic provider lifecycle coverage

**Files:**
- Modify: `packages/agent-core/src/providers/fake-agent-provider.ts`
- Modify: `packages/agent-core/src/runtime/agent-runtime.test.ts`

**Interfaces:**
- Consumes: registered `AgentTool`, `PolicyEngine`, `SessionStateMachine` and `AbortSignal`.
- Produces: deterministic events for completion, tool approval, timeout, cancellation, provider error and resume.

- [ ] **Step 1: Write the failing tests**

```ts
expect(events.map((event) => event.type)).toContain('tool:waiting_approval');
expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'SESSION_CANCELLED' }));
expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'PROVIDER_ERROR' }));
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @forgelex/agent-core test -- agent-runtime.test.ts`

- [ ] **Step 3: Implement only the planned deterministic controls**

The fake provider must persist suspended work by session id, validate the approval token through `SessionStateMachine`, and resume exactly once. It must expose planned provider failures without exposing provider secrets.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm --filter @forgelex/agent-core test -- agent-runtime.test.ts`

### Task 3: Adapter parity and credential redaction

**Files:**
- Modify: `packages/agent-provider-openai/src/openai-agent-provider.test.ts`
- Modify: `packages/agent-provider-anthropic/src/anthropic-agent-provider.test.ts`
- Modify only if a test demonstrates a defect: `packages/agent-provider-openai/src/openai-agent-provider.ts`, `packages/agent-provider-anthropic/src/anthropic-agent-provider.ts`

**Interfaces:**
- Consumes: `AgentRunInput`, fake provider stream/query factories and registered `AgentTool`.
- Produces: equivalent normalized lifecycle, tool, approval, cancellation, timeout and provider-error events for both adapters.

- [ ] **Step 1: Write parity tests first**

```ts
expect(eventTypes(openaiEvents)).toEqual(eventTypes(anthropicEvents));
expect(JSON.stringify(errorEvents)).not.toContain('provider-secret');
```

- [ ] **Step 2: Run each focused adapter test and verify the asserted gap**

Run: `pnpm --filter @forgelex/agent-provider-openai test -- openai-agent-provider.test.ts`

Run: `pnpm --filter @forgelex/agent-provider-anthropic test -- anthropic-agent-provider.test.ts`

- [ ] **Step 3: Make adapters converge on the existing normalized contract**

Keep keys in process/integrator options only. Redact each key from emitted errors. Keep `NormalizedUsage` attached only to `lifecycle:completed`.

- [ ] **Step 4: Re-run both adapter suites**

Run: `pnpm --filter @forgelex/agent-provider-openai test`

Run: `pnpm --filter @forgelex/agent-provider-anthropic test`

### Task 4: Prove legal-gateway reuse and commercial isolation

**Files:**
- Modify: `apps/api/src/provider-parity.test.ts`
- Modify: `STATUS_VALIDACAO.md`

**Interfaces:**
- Consumes: `createSearchCaseLawTool`, `createFixtureResearchService`, `LedgerService`, `AgentRuntime` and both adapters with fake streams.
- Produces: evidence that a legal operation may bill exactly once by its existing legal tool contract while `usage` metadata alone causes no ledger entry; evidence that API/MCP direct flows remain available without `AgentRuntime` ou adapters.

- [ ] **Step 1: Write the failing integration tests**

```ts
expect(await ledgerService.getBalance(tenantId)).toEqual(balanceBefore);
expect(events).toContainEqual(expect.objectContaining({ type: 'lifecycle:completed', usage: expect.any(Object) }));
```

Create a separate test for one actual search tool execution; assert exactly its pre-existing R$0.20 legal debit and no additional debit from `usage`, model or provider metadata.

- [ ] **Step 2: Run the focused parity test and verify it fails**

Run: `pnpm --filter @forgelex/api test -- provider-parity.test.ts`

- [ ] **Step 3: Preserve legal-tool billing while forbidding provider billing**

Do not add a billing adapter, price field or ledger call to any Agent Core/provider package. If tests reveal a coupling, remove it and retain the sole legal-operation debit in the test harness’s existing Legal Tool Gateway execution path.

- [ ] **Step 4: Record only demonstrated validation evidence**

Update the Fase 5 section of `STATUS_VALIDACAO.md` with commands, result, checkout commit, and the limits preserved.

- [ ] **Step 5: Run focused integration tests**

Run: `pnpm --filter @forgelex/api test -- provider-parity.test.ts`

### Task 5: Full gate verification

**Files:**
- Verify: workspace tests and build outputs only

- [ ] **Step 1: Typecheck all workspaces**

Run: `pnpm typecheck`

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm test`

- [ ] **Step 3: Build the web surface, which must not import Agent Core**

Run: `pnpm --filter @forgelex/web build`

- [ ] **Step 4: Check patch integrity**

Run: `git diff --check`

- [ ] **Step 5: Inspect the final diff, status and commit boundary**

Run: `git diff --stat; git status --short`
