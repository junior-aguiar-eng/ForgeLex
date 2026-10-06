# Recebimento de textos da IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber gratuitamente o texto produzido no aplicativo de IA como versão pendente de revisão, preservando histórico e edição atual.

**Architecture:** Uma permissão explícita de recebimento define o destino. Uma operação transacional grava versão e recibo idempotente sem trocar a versão de trabalho existente. O MCP executa essa mutação separadamente da leitura e do faturamento; somente uma sessão web pode adotar a versão.

**Tech Stack:** TypeScript, Zod, Drizzle, SQLite local/PostgreSQL 16 na CI, Fastify, React, Vitest e Playwright existentes; sem dependência nova prevista.

**Spec:** `docs/superpowers/specs/2026-10-06-retorno-producao-ia-design.md`, aprovada por Boni em 06/10/2026.

## Global Constraints

- Branch `codex/retorno-producao-ia`, checkout isolado existente; base `9e74b7f`. Não tocar no checkout SDK original.
- Receber o texto é gratuito. Não exige chave de API nem geração no servidor.
- Permissões atuais migram com recebimento desabilitado; destino escolhido pelo cliente.
- `draft.save_from_ai`: mutação interna, `readOnlyHint:false`, `destructiveHint:false`, `idempotentHint:true`, `openWorldHint:false`.
- Título e títulos de seção até 200 caracteres; 1 a 100 seções com ordinais únicos; até 500 referências; notas opcionais até 2.000 caracteres; corpo completo até 512 KiB em UTF-8; chave entre 16 e 128 caracteres.
- Resposta pequena, até 24 KiB; cobrança zero sem acessar carteira ou replay privado do ledger.
- Texto sem referências pode ser recebido, mas permanece sem conferência. Vínculo inválido recusa todo o envio; não aceitar identidade, aprovação ou `verified:true` do host.
- Recebimento não altera título, status, versão atual ou aprovações de rascunho existente; adoção web usa comparação com a versão atual observada.
- Auditoria sem payload, notas, texto, chave bruta ou credenciais; não instalar/reautorizar conectores nem alterar produção durante implementação local.

## Review Focus

- Resposta perdida depois do commit: repetir a mesma chave retorna o recibo, sem duplicação; coberto nas Tasks 2/3.
- Referência válida de outra seção/versão documental: rejeitar, sem migrar para documento recente; coberto nas Tasks 1/2/4.
- Desabilitar recebimento ou editar o destino em outra aba: invalidar a revisão antiga e conservar o formulário; coberto nas Tasks 1/2/5.
- Texto UTF-8 multibyte, somente espaços ou marcação potencialmente ativa: medir bytes, rejeitar vazio e renderizar como conteúdo seguro; coberto nas Tasks 1/5.
- Encerramento/restauração de conta e aprovação já existente: incluir recibos na política de dados e preservar revisão/aprovação histórica; coberto nas Tasks 1/2/6.

---

## Task 1: Contratos, permissão e armazenamento

**Files:** Create `packages/domain/src/contracts/draft-ai-receipt.ts`, `packages/domain/src/contracts/draft-ai-receipt.test.ts`. Modify `packages/domain/src/contracts/case-ai-access.ts`, `packages/domain/src/index.ts`, `packages/persistence/src/schema/schema.ts`, `packages/persistence/src/migrations/migration-runner.ts`, `packages/persistence/src/repositories/case-ai-access-repository.ts`, `apps/api/src/case-context/case-ai-access-routes.ts`, `apps/api/src/distribution/openapi.ts`, `packages/persistence/src/repositories/account-closure-repository.ts`, `apps/api/src/account/account-closure-policy.ts`, `apps/api/src/account/account-closure-purge-service.ts`, `apps/api/src/account/account-closure-purge-service.test.ts`, `apps/api/src/account/account-closure-restore.ts`. Test existing migration, case-access routes/repository and account-closure suites.

**Interfaces:** Export `DraftReceivePermissionSchema`/`DraftReceivePermission = {enabled:false} | {enabled:true; destination:{mode:'NEW'} | {mode:'EXISTING';draftId:string}}`; `DraftSaveFromAiInputSchema`/`DraftSaveFromAiInput`; `DraftAiReferenceSchema`/`DraftAiReference`; `DraftAiReceiptSchema`/`DraftAiReceipt`. Add default `{enabled:false}` as `receivePermission` on grants and as optional input to `CaseAiAccessRepository.replace`; its omission disables receiving, never inherits write permission accidentally. Add optional `draftReceiving:{enabled:true;destination:...}` to the authorized case manifest.

- [ ] Write failing tests for strict input, trim-empty content, duplicate ordinal, orphan section reference, 100/101 sections, 500/501 references, 16/128 key limits, Unicode byte boundary, disabled legacy grants, invalid/cross-case destination and account cleanup. Assertions:
  ```ts
  expect(DraftSaveFromAiInputSchema.safeParse({...valid, draftId: foreignId}).success).toBe(false);
  expect((await repo.listForOwner(owner, matterId))[0].receivePermission).toEqual({enabled:false});
  expect(await countReceiptsAfterAccountDeletion()).toBe(0);
  ```
- [ ] Run `pnpm exec vitest run packages/domain/src/contracts/draft-ai-receipt.test.ts packages/persistence/src/repositories/case-ai-access-repository.test.ts apps/api/src/case-context/case-ai-access-routes.test.ts packages/persistence/src/repositories/account-closure-repository.test.ts`; confirm failures identify missing behavior.
- [ ] Define input as `{matterId, expectedGrantRevision, idempotencyKey, title, sections:[{ordinal,title,content}], references:[{sectionOrdinal,kind,itemId,documentVersionId?,anchorId?,citationText?}], notes?}`. UUID IDs; revision positive integer; title minimum 3 trimmed characters to match drafting; other section titles nonempty. `kind` is the existing five-kind enum; DOCUMENT requires `documentVersionId`; only DOCUMENT accepts `anchorId`; references default empty. Strict schemas reject host-owned identity, destination and approval fields.
- [ ] Add `persistence-0027-draft-ai-receipts`: disabled permission JSON on grants and table `draft_ai_receipts` with tenant/user/client/concession/case/grant revision, destination, receipt/version IDs, timestamps, payload hash, key hash and reference JSON. Add nullable `derivedFromVersionId` to draft versions for explicit provenance inheritance; never accept a parent from another case/draft. Store the SHA-256 key hash, not the raw key; unique scope tenant/user/client/concession/case/key hash and unique version. Add migration fallback/defaults for both dialects. Include the table in account export/restore/purge dependency order; verify the actual account policy before extending it.
- [ ] Keep grant replacement/revocation serialized by the matter lock; validate EXISTING target in authenticated tenant/case. `loadSelection` still validates only selected source material. Map public permission errors without destination titles/content. Extend OpenAPI, manifest schema and body-byte guard without globally relaxing request limits.
- [ ] Run targeted suites plus `pnpm exec vitest run packages/persistence/src/migrations/migration-idempotency.test.ts`; all pass. Commit `feat(drafting): definir permissão e recibos de textos da IA` with this task's files.

## Task 2: Recebimento atômico e adoção humana

**Files:** Create `packages/persistence/src/repositories/draft-ai-receipt-repository.ts`, `packages/persistence/src/repositories/draft-ai-receipt-repository.test.ts`. Modify `packages/persistence/src/repositories/draft-repository.ts`, `packages/persistence/src/index.ts`; extend `packages/persistence/src/repositories/draft-approval.test.ts`.

**Interfaces:** Export `DraftAiReceiptRepository.receive(reader:CaseAiReader,input:DraftSaveFromAiInput,options?:{signal?:AbortSignal}):Promise<DraftAiReceipt>`, `listForOwner(owner:CaseAiOwner,matterId:string,draftId:string):Promise<DraftAiReceipt[]>`, `getReferences(owner,matterId,draftId,versionId):Promise<DraftAiReference[]>`, `adopt(owner,matterId,draftId,versionId,expectedCurrentVersionId:string|null):Promise<{draft:Draft;version:DraftVersionBundle}>`. Public receipt contains `id,draftId,versionId,versionNumber,receivedAt,reviewPending:true,isReplay,openPath,application:{clientId,label?}`; no text, key/hash or OAuth timestamp.

- [ ] Write failing repository tests: replay returns same IDs; changed payload/key conflicts; disabled/revoked/stale revision denied; missing/foreign/wrong-version references denied; cancellation while waiting for lock aborts before commit; injected insert failure leaves no orphan; existing approved current version unchanged; NEW receipt creates one DRAFT; separate keys create separate sends. Assertions:
  ```ts
  expect(second).toMatchObject({id:first.id,versionId:first.versionId,isReplay:true});
  expect(await drafts.getDraft(tenantId,matterId,existing.id)).toEqual(before);
  await expect(repo.adopt(owner,matterId,draftId,receivedVersionId,staleCurrentId)).rejects.toThrow('DRAFT_ADOPTION_CONFLICT');
  ```
- [ ] Run `pnpm exec vitest run packages/persistence/src/repositories/draft-ai-receipt-repository.test.ts packages/persistence/src/repositories/draft-approval.test.ts`; verify RED.
- [ ] Implement one transaction, lock order matter then draft, re-read active grant and exact expected revision/concession, validate selection/destination/references, then inspect replay. Fingerprint normalized content and references including revision/destination; same key with changed input returns `DRAFT_RECEIPT_CONFLICT`. Reject replay after permission change or revoked connection. Check `options.signal` before mutation and immediately before commit; abort before commit rolls back, abort after commit is a recoverable delivery failure. Produce no partial receipt or duplicate NEW draft.
- [ ] Extract a transaction-aware version insertion helper in `draft-repository.ts`; read max version and insert under the draft lock. Use it for HUMAN/WORKFLOW/SYSTEM writers as well as external receipt. Keep the existing writers' behavior; avoid nested independent transactions. Preserve the existing unique index `draft_versions_draft_number_idx`; do not create a redundant index. For an existing destination external insertion preserves the draft row; for NEW it initializes current version. Native citations from references always have `verified:false`; document refs remain attached to the receipt and exact version.
- [ ] Implement `adopt` as a web-owner-scoped compare-and-update under the same locks; target must be a receipt version from that case/draft. Preserve immutable history/approval requests; current state becomes DRAFT and no review is copied from another version. Future human edits retain document-reference provenance when derived from an adopted receipt, using explicit parent version metadata so editing cannot silently drop sources. Extend `DraftContentInput` and the web version POST with optional `baseVersionId`, scoped to the same draft; the UI sends the version it edited, and existing callers remain compatible.
- [ ] Run targeted tests; verify GREEN and intentional failures roll back all inserts. Commit `feat(drafting): receber versões da IA sem substituir a edição atual`.

## Task 3: Ferramenta MCP e API do editor

**Files:** Create `packages/legal-tools/src/drafting/draft-ai-service.ts`, `packages/legal-tools/src/drafting/draft-ai-tools.ts`, `packages/legal-tools/src/drafting/draft-ai-service.test.ts`, `apps/api/src/drafting/draft-ai-routes.ts`, `apps/api/src/drafting/draft-ai-routes.test.ts`, `apps/api/src/drafting/draft-ai-mcp.test.ts`, `packages/mcp-server/src/draft-ai-handler.ts`. Modify `packages/legal-tools/src/index.ts`, `packages/billing-ledger/src/billing-rules.ts`, `packages/billing-ledger/src/billing-rules.test.ts`, `packages/mcp-server/src/mcp-handler.ts`, `packages/mcp-server/src/external-tool-pack.ts`, `apps/api/src/app.ts`, `apps/api/src/distribution/openapi.ts`, `packages/legal-tools/src/case-context/case-context-service.ts`.

**Interfaces:** `DraftAiService.receive(context:ToolExecutionContext,input:DraftSaveFromAiInput):Promise<DraftAiReceipt>`; `createDraftAiTool(service):AgentTool<DraftSaveFromAiInput,DraftAiReceipt>`; `registerDraftAiRoutes(app,repo,auth,audit?)`. GET `/api/v2/matters/:matterId/drafts/:draftId/ai-receipts` lists public receipt metadata; GET `/.../ai-receipts/:receiptId` returns receipt + its exact version bundle to the web owner; POST `/.../ai-receipts/:receiptId/adopt` consumes `{expectedCurrentVersionId:string|null}`. All require session, no-store; adoption additionally `draft:write` and `matter:write`.

- [ ] Write failing tests for tool exposure/annotation, OAuth-only write identity, correct manifest capability, cross-owner metadata denial, adoption denial for OAuth/API key, strict 512 KiB input, output <=24 KiB, FREE billing and zero calls to ledger/wallet. Lost response/audit failure after commit must replay one receipt. Assert:
  ```ts
  expect(saved.result.billing).toEqual({mode:'FREE',chargedCents:0,isReplay:false});
  expect(listedTool.annotations).toMatchObject({readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false});
  expect(denied.result).toMatchObject({isError:true}); expect(JSON.stringify(denied)).not.toContain(privateText);
  ```
- [ ] Run `pnpm exec vitest run packages/legal-tools/src/drafting/draft-ai-service.test.ts apps/api/src/drafting/draft-ai-mcp.test.ts apps/api/src/drafting/draft-ai-routes.test.ts`; verify RED.
- [ ] Register only `draft.save_from_ai` as new external tool; L3_INTERNAL_MUTATION, explicit FREE policy in `billing-rules.ts` and dedicated execution branch. Service forwards the execution abort signal into the repository. Do not include it in `isCaseContextTool` or the existing paid gateway. Authenticate OAuth and revalidate before service; validate write permission in transaction. Ensure transport annotation override in `app.ts` is correct as well as `tools/list`. Existing connection grants/scopes are not silently rewritten.
- [ ] Handler emits compact normal MCP result with `isError:false` or bounded `isError:true`. Distinguish unauthorized, outdated permission, invalid source, key conflict, oversized content and temporary unavailability with actionable Portuguese; no raw errors/body. Response-level billing uses actual receipt `isReplay`. Post-commit delivery/audit failure cannot rerun insert; replay requires fresh authorization. Audit metadata only, never serialization of tool arguments. GET receipt/version web routes validate owner and receipt relation; adopting another user's or unrelated version is impossible.
- [ ] Run Task 3 tests plus `pnpm exec vitest run apps/api/src/case-context/case-context-mcp.test.ts packages/mcp-server/src/mcp-server.test.ts`; GREEN. Commit `feat(mcp): receber textos da IA com autorização e cobrança zero`.

## Task 4: Fontes e conferência da versão recebida

**Files:** Modify `packages/persistence/src/repositories/draft-review-context.ts`, `packages/legal-tools/src/review/review-service.ts`, `packages/domain/src/contracts/draft-review.ts`, `apps/web/src/screens/draft-review/SourcePanel.tsx`, `apps/web/src/screens/draft-review/review-model.ts`; extend `packages/legal-tools/src/review/review-service.test.ts`, `packages/persistence/src/repositories/draft-review-run-repository.test.ts`, `apps/web/src/screens/draft-review/review-model.test.ts`.

**Interfaces:** Extend `DraftReviewContextSnapshot` with `documentReferences` resolved from receipt/derivation and exact document version/hash/anchor, and referenced `theses`. Add DOCUMENT to check target type and CASE_DOCUMENT to source method only as compatible enum extensions. Include them in `reviewContextHash`. `DraftAiReference` from Task 1 is the reference type; no second reference schema.

- [ ] Write failing tests: document reference resolves selected old version after new document version; deleting a target/anchor yields blocking missing-source result; hash changes on relevant source/receipt references; derived human edit preserves provenance; model's citation is never human-confirmed. Assert `check.targetType === 'DOCUMENT'`, `check.source.method === 'CASE_DOCUMENT'` and missing-target `blockingCount > 0`.
- [ ] Run `pnpm exec vitest run packages/legal-tools/src/review/review-service.test.ts packages/persistence/src/repositories/draft-review-run-repository.test.ts apps/web/src/screens/draft-review/review-model.test.ts`; confirm RED.
- [ ] Load only authenticated case records and pinned document versions. Check reference existence/association without claiming factual truth or legal confirmation. Surface per-section document sources and unavailable references, distinguish reference validation from authority/provider verification; keep existing review modes and approval gates. Display source text safely with exact version metadata in the existing source panel.
- [ ] Run targeted tests and existing `packages/legal-tools/src/drafting-review.test.ts`; GREEN. Commit `feat(review): conferir fontes dos textos recebidos da IA`.

## Task 5: Interface limpa e edição preservada

**Files:** Modify `apps/web/src/screens/case-ai/CaseAiAccessPanel.tsx`, `apps/web/src/screens/case-ai/case-ai-model.ts`, `apps/web/src/screens/case-ai/case-ai-model.test.ts`, `apps/web/src/screens/DraftStudioScreen.tsx`. Create `apps/web/src/screens/draft-ai/ReceivedDraftPanel.tsx`, `apps/web/src/screens/draft-ai/received-draft-model.ts`, `apps/web/src/screens/draft-ai/received-draft-model.test.ts`. Extend `tests/e2e/case-ai-access.spec.ts`, `tests/e2e/draft-review.spec.ts`, `tests/e2e/documents.spec.ts` using their existing configurations.

**Interfaces:** Permission control consumes Task 1 `receivePermission`; received panel consumes Task 3 receipt/version APIs, and `onAdopt` reloads current version only after successful adoption. `shouldApplyReceiptResponse({requestMatterId,requestDraftId,currentMatterId,currentDraftId}):boolean` guards late responses; adoption state preserves dirty editor buffer until explicit choice.

- [ ] Write failing model/E2E tests for disabled default, explicit valid destination, destination change conflict, metadata refresh preserving unsaved text, receiving during approved current version, viewing without adopting, save/discard before adoption, stale adoption 409, cross-case late response, empty-reference text awaiting review and safe rendering of HTML/script-like content. Assert unchanged editor text/current version until successful explicit adoption; old version and approval history remain accessible. Verify new-draft path and received sources in DOCX/PDF through existing export checks.
- [ ] Run `pnpm exec vitest run apps/web/src/screens/case-ai/case-ai-model.test.ts apps/web/src/screens/draft-ai/received-draft-model.test.ts`, then existing `pnpm test:e2e:case-ai`/`pnpm test:e2e:draft-review` as needed; verify RED for missing UI behavior.
- [ ] Implement exact copy from spec: permission checkbox, NEW/EXISTING destination selector, **Texto recebido da IA — Aguardando revisão**, **Ver texto recebido**, **Usar esta versão**. Generate initial host instructions including grant revision, authorized destination and key reuse; do not expose hashes, IDs or API terms as controls. Origin label is app-declared metadata, not verified vendor identity.
- [ ] Load receipts on explicit refresh/current-screen fetch; no polling that changes form data. Lazy preview and source panel; dirty-state choice uses existing save operation or explicit discard. Keep buffer intact on failed save/adoption, double click and case changes. Mark adopting/refreshing requests pending, ignore stale responses and keep accessible labels/focus. No automatic review or approval on receipt/adoption.
- [ ] Run unit tests and `pnpm test:e2e:case-ai`, `pnpm test:e2e:draft-review`, `pnpm test:e2e:documents`; GREEN. Commit `feat(web): conferir e adotar textos recebidos da IA`.

## Task 6: PostgreSQL, regressões e registro da entrega

**Files:** Create `scripts/smoke-draft-ai-postgres.mjs`. Modify `package.json`, `.github/workflows/ci.yml`, `STATUS_VALIDACAO.md`, `docs/product/case-ai-access.md`; create `docs/product/draft-ai-receiving.md`. Extend `apps/api/src/account/account-closure-restore.test.ts` and existing export/closure coverage if receipts require a new snapshot table.

**Interfaces:** Add `test:postgres:draft-ai = pnpm build && node scripts/smoke-draft-ai-postgres.mjs`; use the existing CI PostgreSQL 16 test service, never production or the user's live database. Fixtures use uniquely scoped synthetic tenants/cases and bounded cleanup. Process exits nonzero on failure and prints only metadata/check names.

- [ ] Write isolated smoke assertions for double migrations, legacy permission disabled, two simultaneous same-key sends, same-key changed payload, concurrent HUMAN/external numbering, failed inserts without orphan, revocation-before-commit and commit-before-revocation, stale adoption, pinned source version and receipt cleanup/restore. Use barriers around actual transactions, not timing-only sleeps. Confirm `Set(versionNumbers).size === versionNumbers.length`, exactly one receipt/new draft for replay and unchanged existing current version before adoption.
- [ ] Implement the smoke runner using Task 2 interfaces; add it to the existing `postgres` CI job. Extend browser scenarios in their existing CI commands so no suite is created but omitted from CI. Test snapshot restore relationships and approval/receipt isolation on synthetic data.
- [ ] Run `pnpm lint`, `pnpm build`, `pnpm typecheck`, targeted full-unit regression and the three E2E commands from Task 5. Run PostgreSQL locally only against an explicitly isolated test DB; otherwise record it as pending CI. For PostgreSQL Vitest on Windows use `--maxWorkers=1`.
- [ ] Review the entire branch diff against this plan/spec with an independent reviewer under the selected execution workflow. Fix demonstrated issues and rerun affected checks; do not announce CI, integration, publication or host installation based on local tests.
- [ ] Update product/status docs with exact executed commands/results, pending gates and approved copy. Commit `test(drafting): validar recebimento concorrente no PostgreSQL` with associated test configuration and documentation.

## Integração e homologação posteriores

CI PostgreSQL e demais checks devem passar no SHA da PR e no SHA integrado antes de publicação. Uma migration aditiva exige execução explícita no ambiente publicado. Homologação real usa caso sintético em ChatGPT e Claude separadamente: habilitar destino, enviar texto, repetir a chave, conferir versão/fontes/editor, adotar conscientemente e negar envio/replay após revogar. Confirmar pontualmente nova concessão OAuth quando aplicável. Não executar pesquisa faturável ou usar material real para esse ensaio. Integração, migration, deploy e homologação real não são afirmados nesta entrega de planejamento.

## Autorrevisão e execução

Cobertura conferida: permissão/limites/cleanup (Task 1), transação/replay/concorrência/adoção (Task 2), identidade/envelope/auditoria/API (Task 3), referências/revisão (Task 4), buffer/UX/exportações (Task 5), PostgreSQL/CI/restore/regressões (Task 6). Os cinco riscos de Review Focus possuem testes nas tarefas indicadas. Não há implementação de produto neste commit.

Recomendação: execução nativa nesta conversa, com revisão independente da branch ao final. As tarefas compartilham contratos e transações; execução sequencial reduz retrabalho de integração. A alternativa é execução por subagentes com revisão de cada tarefa, ao custo de mais contextos. Aguardar revisão deste plano e escolha do modo antes de escrever código de produto.
