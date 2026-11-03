# Editorial application Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with TDD.

**Goal:** Aplicar ajustes explicitamente selecionados em nova versão e registrar recibo atômico.
**Architecture:** Serviço de aplicação separado, registro compartilhado, transação nativa existente e controles no diálogo atual.
**Tech Stack:** TypeScript, Zod, Drizzle, Fastify, React, Vitest e Playwright; sem dependências novas.
**Spec:** docs/superpowers/specs/2026-11-03-forgelex-editorial-application.md

## Global Constraints

- Sem chamadas pagas, aplicação automática, push, deploy ou migração operacional.
- Preservar mesa/v8/limites; somente comando humano cria HUMAN/DRAFT derivada.
- 2.048 bytes/proposta, 10 propostas, 100 comandos incluindo aplicação; 1..30 IDs únicos e fundamento 3..1000.
- Boni único aprovador; fontes/citações não recebem validação jurídica implícita.

## Review Focus

- Replay após resposta perdida e nova versão; UUID igual com corpo diferente.
- Concorrência com decisão, edição manual e outra aplicação; rollback sem versão órfã.
- Múltiplos intervalos UTF-16, Unicode, IDs herdados e limite final da seção.
- Autorização revogada, contexto/fontes alterados e fronteiras de runtime.
- Seleção sem defaults, confirmação separada, recarga e histórico obsoleto no móvel.

### Task 1: Aplicação atômica e controles na mesa

**Files:**
- Create packages/legal-workflows/src/final-editor/editorial-review-record.ts
- Create packages/legal-workflows/src/final-editor/editorial-application-service.ts
- Modify packages/legal-workflows/src/final-editor/editorial-review-service.ts and src/index.ts
- Modify packages/persistence/src/repositories/native-case-task-repository.ts
- Modify apps/api/src/agentic-workspace/execution-routes.ts and final-editor-routes.test.ts
- Create apps/web/src/agentic-workspace/EditorialApplicationControls.tsx
- Modify apps/web/src/agentic-workspace/EditorialReviewPanel.tsx and editorial-review-model.ts
- Modify tests/e2e/editorial-review.spec.ts
- Update continuidade/pendências; add architecture report/evidence and scoped .gitattributes.

**Interfaces:** POST editorial-review/applications receives target, proposalHash,
contextHash, expectedRevision, commandId, itemIds, reason, confirmed:true; returns
historical review with application receipt. GET history includes optional receipt
and reconciles either decision or application command. Native apply callback
prepares document and final record under snapshot locks; replay only reads metadata.

- [x] RED API: route missing; acceptance/subset/version/metadata, replay/conflict,
      revoked/stale context, rollback/concurrency and invalid selection assertions.
- [x] GREEN record/service/native writer/routes; focused suite passes.
- [x] RED browser: missing explicit selection/application; implement controls and
      test no write before confirm, new version, reload, lost response and mobile.
- [x] Full build/test, API types, lint, formatting, browser and mesa regression: 1.729 general tests, 17 skipped, zero failures; 135 focused and 12 browser passed.
- [x] One fresh read-only review: no critical/important/minor findings; coverage limits recorded and evidence hashed.

Execution follows the explicit user instruction; routine choices are documented
above without another approval gate. No second commit is included in this task.
