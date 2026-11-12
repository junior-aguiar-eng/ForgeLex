# Editorial generation — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, task-by-task with TDD.

**Goal:** Gerar propostas com provider simulado, a partir de minuta autorizada.
**Architecture:** Perfil standalone em legal-agents; gerador em legal-workflows
envolve FinalEditorService e AgentProvider/ToolRegistry já existentes. API opt-in
por factory de servidor, sem alterar grafo/catalogo/mesa.
**Tech Stack:** TypeScript, Zod, AgentProvider, FakeAgentProvider, Fastify, Vitest.
**Spec:** docs/superpowers/specs/2026-11-03-forgelex-editorial-generation.md

## Global Constraints

- Nenhuma chamada paga, provider real, patch, deploy, novo commit ou push.
- Uma tentativa, 1 turno, 16 eventos, 300000 ms, 128000 bytes de prompt.
- 2048 tokens preservados como teto real futuro; 2048 bytes de proposta como
  limite conservador adicional de simulação, sem alegar tokenização real.
- Sem mudar contratos anteriores, catálogo, grafo v8, carteira ou mesa.

## Review Focus

- Factory desabilitada por padrão; provider real recusado antes de run.
- Proposta inválida/livre/duplicada/sem submissão não pode aparentar sucesso.
- Cancelamento, timeout, submissão tardia e revalidação depois do provider.
- Contexto clonado e tratado como dado; hashes de seção fornecidos, não inventados.
- API aceita só target autorizado, preserva proprietário/scopes/runtime e registros.

### Task 1: Perfil, geração e API simulada

Files:

- Create packages/legal-agents/src/final-editor-generation.ts; export em index.ts
- Create packages/legal-workflows/src/final-editor/final-editor-generator.ts
- Create packages/legal-workflows/src/final-editor/final-editor-generator.test.ts
- Modify packages/legal-workflows/src/index.ts (export)
- Modify apps/api/src/agentic-workspace/execution-routes.ts e final-editor-routes.test.ts
- Atualizar continuidade/pendências, novo relatório/recibo e atributo do diretório.

Interface: FinalEditorGenerator(editor, options?).generate(owner, deliveryId,
target, signal?) retorna resposta SIMULATED com proposta validada. Factory recebe
registry, context, sectionAnchors e profile; retorna AgentProvider síncrono.

- [x] RED: testes do gerador inexistente e rota ausente, incluindo falhas e limites.
- [x] GREEN: implementar perfil, gerador e rota opt-in, sem wiring produtivo.
- [x] Validar testes focados, lint, formatação, tipos e pnpm test com chaves reais
      vazias e bancos opcionais ausentes. Expected: zero falhas; condicionais ignorados.
- [x] Revisão independente read-only, tratar achados e registrar evidências.

Decisão: a autorização detalha o recorte; implementar sem novo gate de plano.
Revisar diferenças desta etapa contra cópias em tmp/editorial-generation-baseline;
preservar alterações locais anteriores. Não confundir base...HEAD vazio com diff.
