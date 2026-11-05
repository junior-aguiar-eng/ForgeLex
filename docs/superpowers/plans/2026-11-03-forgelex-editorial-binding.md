# Editorial binding — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Checkboxes track verified completion.

**Goal:** Conectar contrato editorial a entrega/minuta autorizada e versionada.
**Architecture:** Adaptador nativo transacional retorna snapshot conferido; serviço
em legal-workflows monta o contrato e valida propostas sem escrita. Rotas fornecem
sessão, escopos e restrições do runtime.
**Tech Stack:** TypeScript, Zod, Drizzle, Fastify, Vitest, SQLite em memória, pnpm.
**Spec:** docs/superpowers/specs/2026-11-03-forgelex-editorial-binding.md

## Global Constraints
- Preservar alterações locais do incremento anterior; sem novo commit.
- Sem chamadas pagas, rede, migration remota, aplicação de patches ou deploy.
- Mesa, grafo v8, modelos, carteira e limites inalterados.

## Review Focus
- Acesso cruzado entre tenants/usuários e revogação entre leitura e validação.
- Entrega persistida versus checkpoint intermediário, versão/hash/texto divergentes.
- Texto integral da fonte e approvedItem reconstruídos da origem autorizada.
- Versão corrente/contexto avançados e fronteira de runtime piloto/comercial.
- Ausência de mutação de minuta, execução, suporte e orçamento.

### Task 1: Snapshot e rotas de validação
Files:
- Modify packages/persistence/src/repositories/native-case-task-repository.ts
- Create packages/legal-workflows/src/final-editor/final-editor-service.ts
- Modify packages/legal-workflows/src/index.ts (export somente)
- Create apps/api/src/agentic-workspace/final-editor-routes.test.ts
- Modify apps/api/src/agentic-workspace/execution-routes.ts
- Modify .gitattributes (preservar bytes apenas no novo diretório de evidências)
- Documentar resultado em docs/architecture/2026-11-03-forgelex-editorial-binding.md,
  CONTINUIDADE.md e PENDENCIAS.md, sem reescrever recibos anteriores.

Interfaces: loadEditorialSnapshot(owner, deliveryId, {draftId, versionId}) retorna
delivery, IDs vinculados e sources íntegras; FinalEditorService.load/validate
consome snapshot confiável e exporta contrato editorial já existente.

- [x] RED: fixtures reais SQLite/migrations locais, rotas ausentes falham.
  Casos válidos, isolamento, auth/scopes, revogação, stale version/context,
  checkpoint sem entrega, hashes/textos adulterados, fontes faltantes,
  recusa de contexto do cliente, imutabilidade e ausência de provider.
- [x] GREEN: implementar adaptador e serviço/rotas sem integrar agente ao grafo.
- [x] Regressões: testes editoriais + contexto nativo + driver v8 + approved-case;
  lint/formatação/tipos; pnpm test com credenciais pagas vazias e bancos opcionais
  ausentes. Expected: zero falhas; condicionais continuam ignorados.
- [x] Revisão independente read-only, tratar achados e registrar evidências.

Ruling: o pedido já autoriza esta ligação delimitada; decisões incrementais
acima preservam arquitetura e custo, sem novo gate de aprovação de plano.
Ruling: serviço em legal-workflows, que já depende de legal-agents e persistence;
a API consome esse serviço por sua dependência existente. Evita dependência
transitiva implícita ou alteração de manifests/lockfile; não muda o grafo v8.

Resultados finais: 20 testes editoriais, 78 focados e 1.672 gerais aprovados,
17 condicionais ignorados e zero falhas; build, lint, formatação e tipos passam.
Revisão gpt-6-astra sem achados. Recibo em
docs/architecture/evidence/2026-11-03-editorial-binding/validation.json.
