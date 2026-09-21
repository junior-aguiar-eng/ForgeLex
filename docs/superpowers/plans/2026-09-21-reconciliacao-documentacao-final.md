# Reconciliação documental final do ForgeLex/STJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** alinhar a documentação pública e canônica à conclusão do produto ForgeLex limitado ao STJ, preservando planos, especificações e evidências históricas.

**Execution status:** `COMPLETED` em 2026-09-21. As alterações e verificações
locais foram concluídas e a publicação foi autorizada.

**Architecture:** o README passa a ser a entrada de produto e operação; o plano mestre e `STATUS_VALIDACAO.md` são o estado programático; `docs/operations` mantém as provas datadas. Planos e specs antigos não são reescritos, apenas recebem contexto quando forem o plano ativo da Fase 14.

**Tech Stack:** Markdown, pnpm, Git.

**Spec:** `Plano de conclusão progressiva do F.md` e `docs/operations/phase14/controlled-charge-evidence.md`.

## Global Constraints

- Produto concluído somente no escopo STJ; Fases 9 a 13 permanecem `FROZEN_STRATEGICALLY`.
- Não registrar segredos, tokens, URLs de checkout, identificadores de pagamento ou dados pessoais.
- Não alterar corpus, provider jurídico, parser, importação, deduplicação ou varredura.
- Evidências históricas preservam suas revisões e medições; documentos de estado apontam para a evidência mais recente.

## Review Focus

- README não pode prometer cobertura além do STJ.
- O status de Mercado Pago não pode permanecer como pré-ativação ou `503` atual.
- Documentos de operação precisam distinguir snapshot histórico de estado ativo.
- Links entre README, plano mestre, status e evidência devem existir e usar caminhos locais válidos.
- Nenhuma alteração pode expor credenciais ou identificadores financeiros.

---

### Task 1: Atualizar a entrada pública e o índice documental

**Files:**
- Modify: `README.md`
- Create: `docs/README.md`

- [x] Inserir no README o estado público atual: STJ, domínio canônico, REST/MCP, cobrança pré-paga e exclusão de modelos/tokens.
- [x] Substituir contagens históricas de testes por comandos reproduzíveis e links de evidência.
- [x] Criar índice documental que diferencie estado atual, evidência operacional e planos/especificações históricas.

### Task 2: Consolidar o estado programático

**Files:**
- Modify: `Plano de conclusão progressiva do F.md`
- Modify: `STATUS_VALIDACAO.md`
- Modify: `docs/superpowers/plans/2026-09-21-fase-14-estabilizacao-stj.md`

- [x] Marcar Fases 0–8 e 14 como concluídas e 9–13 como congeladas estrategicamente.
- [x] Registrar o encerramento de billing, webhook, revogação e limites preservados.
- [x] Marcar todo o checklist do plano ativo da Fase 14 como executado, com nota de acompanhamento não bloqueante.

### Task 3: Preservar e contextualizar evidências operacionais

**Files:**
- Modify: `docs/operations/phase8/final-validation.md`
- Modify: `docs/operations/phase14/strategic-freeze.md`
- Modify: `docs/operations/phase14/controlled-charge-evidence.md`

- [x] Declarar a evidência da Fase 8 como snapshot histórico sucedido pelo encerramento da Fase 14.
- [x] Atualizar a decisão estratégica para refletir que a estabilização do produto STJ foi concluída.
- [x] Confirmar que a evidência da cobrança permanece saneada e vinculada aos demais documentos.

### Task 4: Verificar e publicar a reconciliação

**Files:**
- Verify: `README.md`, `docs/README.md`, plano mestre, status e evidências.

- [x] Executar busca por estados obsoletos de Mercado Pago e Fase 14 nos documentos de estado.
- [x] Executar `pnpm vitest run scripts/phase8/redact-evidence.test.ts` e `git diff --check`.
- [x] Revisar o diff, atualizar este plano como concluído e publicar após autorização expressa para commit e push.
