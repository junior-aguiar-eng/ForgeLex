# Editorial human review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, inline with TDD.

**Goal:** Revisar propostas na mesa e guardar decisões no histórico sem aplicar.
**Architecture:** Serviço editorial com registro separado sob snapshot autorizado;
diálogo na entrega existente, sem IA ou alteração da minuta.
**Tech Stack:** TypeScript, React, Fastify, Zod, Drizzle/SQLite, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-11-03-forgelex-editorial-human-review.md

## Global Constraints

- Sem chamadas pagas, aplicação, commit, push ou deploy; preservar v8 e mesa.
- 2.048 bytes/proposta, 10 propostas, 100 comandos, uma decisão/comando,
  fundamento de 3 a 1.000 caracteres. Nenhum novo serviço ou dependência.
- Boni único aprovador humano; decisões editoriais não aprovam conteúdo jurídico.

## Review Focus

- Replay idempotente versus conflito de revisão/versão/autorização.
- Resposta perdida/tardia, troca de entrega, reabertura e mudança de arquivo.
- Propostas adulteradas, IDs estranhos e JSON com HTML não executam nem escrevem.
- Histórico preservado e identidade de fonte/contexto conferida atomicamente.
- Mesa móvel/teclado/ressalvas e ausência de geração/aplicação implícita.

### Task 1: Revisão persistida e diálogo na mesa

Files:

- Modify persistence schema.ts, migrations/migration-runner.ts e native-case-task-repository.ts
- Create persistence/migrations/editorial-review-upgrade.test.ts
- Modify persistence/migrations/agentic-case-reconciliation.test.ts para manter o snapshot histórico sem a migração 0038 antes das tabelas agênticas
- Create legal-workflows/src/final-editor/editorial-review-service.ts; export index.ts
- Modify final-editor-service.ts apenas para reutilizar montagem do contexto
- Modify API execution-routes.ts e final-editor-routes.test.ts
- Create web/agentic-workspace/EditorialReviewPanel.tsx e editorial-review-model.ts
- Modify web/agentic-workspace/ResultCard.tsx
- Create tests/e2e/editorial-review.spec.ts e playwright.editorial-review.config.ts
- Atualizar continuidade/pendências; relatório e recibo em architecture/evidence.

Interface: GET editorial-review retorna contexto, contextHash, revision e history;
POST preview recebe target/proposal e valida sem escrever; POST decisions recebe
target/proposal/contextHash/expectedRevision/commandId/decision, salva só histórico.
UI recebe deliveryId/draftId/versionId; lê histórico e importa JSON, decide por item.

- [x] RED API e migração: rota/coluna ausentes; autorização, CAS/replay, adulteração,
      fonte/versão obsoleta, imutabilidade da minuta e preservação de decisão anterior.
- [x] GREEN serviço, persistência e rotas humanas com mesmos limites/runtime.
- [x] RED navegador: botão ausente; implementar diálogo, validar histórico recarregado,
      antes/depois, ressalvas, campos vazios, erro/retry, mobile/Axe e ausência de IA/patch.
- [x] Testes focados, lint, tipos/build e Playwright aprovados; build de pnpm test passou; após corrigir a preparação histórica do teste de migração, repetição integral de Vitest: 1.711 aprovados, 17 ignorados, zero falhas.
- [x] Revisão read-only final, tratar achados e registrar recibo/hashes.

Execução autorizada diretamente pelo pedido; sem novo gate de plano. Baseline local
em tmp/editorial-review-baseline para distinguir mudanças anteriores sem commit.
