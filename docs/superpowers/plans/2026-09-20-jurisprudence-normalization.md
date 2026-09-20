# Jurisprudence Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. No commit, push, remote migration, source download, or reingestion is authorized.

**Goal:** Normalize the existing STJ corpus without a new download, remove commercial live fallback and legacy price defaults, and reclaim the redundant storage after local validation.

**Architecture:** A document remains a stable identity and points to an immutable current version. Legal payload and provenance are served from that version. PostgreSQL uses a stored `tsvector` projection; SQLite uses a contentless FTS5 index. New published versions link to their source manifest, while legacy versions retain explicit compatibility visibility until their provenance mapping is verified.

**Tech Stack:** TypeScript, Drizzle, libSQL/SQLite FTS5, PostgreSQL full-text search, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-jurisprudence-canonical-version-design.md`

## Global Constraints

- No new STJ download, parse, or reingestion for this normalization.
- Preserve legal result schemas, STJ-only capability gate, billing ledger, Mercado Pago, API key, REST, and MCP.
- Only `research.search_case_law` may be metered, at R$ 0,20.
- No remote migration, deploy, commit, or push.
- Do not remove a physical structure until the replacement passes local integrity checks.
- Do not start a compacting rewrite without a measured temporary-disk-capacity gate.

## Review Focus

- A document whose current version changes must return only the new version's legal payload and provenance.
- A legacy version lacking a direct manifest link must remain visible only through an explicit compatibility rule, never an implicit failed-run bypass.
- A common full-text term must use a stored index projection rather than recomputing vectors from wide document rows.
- A commercial request with no persistence must fail before billing or live SCON access.
- A direct ledger call without an explicit cost must be rejected.

---

### Task 1: Close commercial fallback and generic legacy pricing

**Files:** billing ledger tests/service; API tests/app; provider parity and PostgreSQL smoke tests.

**Produces:** `executeBillableOperation` requires `costCents`; commercial research requires a persistent data plane; test-only generic debits use explicit non-research capabilities and current price.

- [ ] Write RED tests for omitted `costCents` and API startup without persistence.
- [ ] Make the tests fail against the current default R$ 0,15 and live fallback.
- [ ] Require explicit cost, remove default R$ 0,15 usages, and fail commercial research closed when persistence is unavailable.
- [ ] Run focused billing/API tests.

### Task 2: Normalize current-version serving and search projections

**Files:** persistence schema, repository, migrations, repository/migration tests.

**Produces:** documents have stable identity only; versions own legal payload and provenance; repository joins `currentVersionId`; PostgreSQL uses stored `search_vector` and SQLite uses contentless FTS5.

- [ ] Write RED tests that inspect root-document persistence and recover current-version payload through search and process lookup.
- [ ] Run focused tests and observe root payload dependency.
- [ ] Add incremental migration and repository changes, keeping legacy read compatibility only during migration.
- [ ] Run SQLite and PostgreSQL repository/migration tests.

### Task 3: Link new versions to manifests and repair ingestion scalability

**Files:** source-manifest repository, ingestion service/job, schema/migrations, parser/job/repository tests.

**Produces:** every newly published version has a direct source-manifest reference; publication uses keyset pagination and bounded batches; manifest counters distinguish promoted records from documents/versions created.

- [ ] Write RED tests for keyset pagination, manifest linkage, and counter semantics.
- [ ] Run focused tests and observe failure.
- [ ] Implement the smallest compatible schema and job changes.
- [ ] Run focused ingestion tests.

### Task 4: Local corpus migration, integrity gate, compacting cleanup, and benchmark

**Files:** local-only normalization/verification script and tests; status documentation only after actual evidence.

**Produces:** existing local corpus migrates without network activity; integrity report proves counts/pointers/hashes; only then unused columns/indexes are reclaimed with a measured disk gate.

- [ ] Test a local fixture database migration and rollback-safe failure behavior.
- [ ] Add a dry-run capacity/integrity command before any compacting rewrite.
- [ ] Migrate the existing local database, validate counts and queries, then compact only if the capacity gate is green.
- [ ] Benchmark rare, common, phrase, process-number, REST, and MCP queries against the migrated corpus.

### Task 5: Reconcile documentation and final verification

**Files:** canonical status/docs and OpenAPI only where actual behavior changed.

- [ ] Update only evidenced operational claims and deferred-source decision.
- [ ] Run `pnpm typecheck`, `pnpm test`, `pnpm --filter @forgelex/web build`, and `git diff --check`.
- [ ] Report measured storage before/after and all remaining Phase 1 blockers.
