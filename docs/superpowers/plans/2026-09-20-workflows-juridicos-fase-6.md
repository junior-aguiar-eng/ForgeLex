# Workflows jurídicos Fase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** consolidar o `legal-research-memo` como execução jurídica canônica, auditável e idempotente sobre REST, MCP e Agent Core opcional.

**Architecture:** Um serviço de workflow compõe exclusivamente o Legal Tool Gateway, repositories de matter/authority/memo e checkpoints persistidos. REST, MCP e Agent Core tornam-se adaptadores finos; o memo conserva snapshots e revisão humana, sem cobrança própria ou dependência de modelo.

**Tech Stack:** TypeScript, Zod, Drizzle, SQLite/PostgreSQL, Vitest e pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-20-fase-6-workflows-juridicos-design.md`

## Global Constraints

- STJ é o único tribunal comercial habilitado.
- Somente `research.search_case_law` é faturável; token, modelo, provider, workflow, checkpoint, verificação e memo não entram no ledger.
- REST e MCP operam sem Agent Core ou adapter de provider.
- Snapshots de memo e authority não são sobrescritos por revalidação posterior.
- Não executar migration remota, deploy, commit ou push sem autorização específica.

## Review Focus

- Resultado de índice incompleto ou falho não cria memo.
- Repetição da chave de idempotência não cria nova busca, memo ou débito.
- Checkpoint e memo de outro tenant não são recuperáveis.
- Conflito de revalidação é histórico, não confirmação implícita.
- Aprovação humana ocorre uma única vez e não pode ser criada por prompt.

### Task 1: Contratos versionados e checkpoints persistíveis

**Files:** `packages/legal-workflows/src/contracts/workflow.ts`, `packages/legal-workflows/src/runtime/workflow-runner.ts`, testes do package.

- [x] Escrever testes de schema para definição, origem, política, resultado e incompatibilidade de retomada.
- [x] Tornar a definição executável tipada com schemas, capabilities, limites e política; incluir origem e resultado estruturado.
- [x] Persistir resultado pendente e checkpoints serializáveis por versão.
- [x] Executar `pnpm --filter @forgelex/legal-workflows test`.

### Task 2: Persistência histórica de workflow e authority

**Files:** schema/migração/repositories de `packages/persistence` e testes.

- [x] Escrever testes de checkpoint tenant-isolado e revalidação que não substitui authority salva.
- [x] Adicionar migração incremental, tabelas e repositories para checkpoints e histórico de verificação.
- [x] Executar testes de persistence e migração local aplicável.

### Task 3: Serviço canônico `legal-research-memo`

**Files:** `packages/legal-workflows/src/research-memo/*`, `packages/legal-tools`, testes.

- [x] Escrever testes para busca concluída, falha de índice, provenance/versionamento, conflito e replay.
- [x] Remover dependência obrigatória de AgentRuntime e executar pesquisa/verificação somente pelos contratos do gateway.
- [x] Persistir snapshot do memo apenas após a sequência válida e encaminhá-lo para revisão humana.
- [x] Executar testes focados do workflow.

### Task 4: Adaptadores REST, MCP e Agent Core

**Files:** `apps/api/src/app.ts`, `packages/mcp-server`, `packages/agent-core` e testes de integração.

- [x] Escrever teste de equivalência de saída e isolamento comercial nas três superfícies.
- [x] Delegar REST à execução canônica; expor a tool MCP; registrar a mesma tool no Agent Core.
- [x] Confirmar replay único, auditoria e ausência de billing de provider.
- [x] Executar testes focados API/MCP/Agent Core.

### Task 5: Gate final

- [x] Executar `pnpm typecheck`, `pnpm test`, build web quando afetado e `git diff --check`.
- [x] Registrar somente evidência confirmada em `STATUS_VALIDACAO.md`.
