# Remediação da auditoria ForgeLex — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar os achados técnicos da auditoria de 07/10, tornar os demais verificáveis e ligar Pesquisa aos casos sem nova arquitetura.
**Architecture:** Reutilizar REST/MCP, persistência e componentes existentes; corrigir sincronização e manter permissões, versões, proveniência e ledger. Retenção será preparada com inspeção sem escrita e execução autenticada/agendada, preservando os gates humanos registrados.
**Tech Stack:** TypeScript, React, Fastify, PostgreSQL/SQLite, pnpm, Vitest, Playwright, Cloud Run/Scheduler.
**Spec:** Auditoria de 07/10 apresentada ao usuário e aprovada pela instrução “Vamos executar as recomendações”; comportamento vigente em `CONTINUIDADE.md` e docs/product.

## Global Constraints
- Sem novo modelo/agent core, novo tribunal, mudança de preço ou busca paga para salvar um resultado.
- Não excluir dados, alterar saldo ou declarar conformidade por inferência.
- Revisões humanas/profissionais não podem ser fabricadas por testes.
- Commits atômicos; CI completa antes de integrar; publicar somente resultado concluído no escopo aprovado.

## Review Focus
- Resposta antiga da lista após movimentação ou troca rápida de filtro não substitui a visão atual.
- Falha/duplicação ao salvar autoridade preserva resultado, caso escolhido e proveniência sem novo débito.
- Caso arquivado/lixeira e troca de sessão não permitem gravar nem revelar acervo anterior.
- Retenção não altera valores financeiros nem elimina recibos com exceção ativa; inspeção é estritamente sem escrita.
- Documentação/monitoramento distinguem código publicado, validação local e comprovação humana ausente.

### Task 1: Sincronização do ciclo de vida e diagnóstico da CI
**Files:** MatterWorkspaceScreen.tsx, tests/e2e/matter-lifecycle.spec.ts, .github/workflows/ci.yml.
**Interfaces:** Consome GET/POST lifecycle existentes; produz listagem atual consistente, sem mudar contratos.
- [x] Reproduzir falha com respostas controladas; executar E2E focado e observar RED.
- [x] Corrigir causa demonstrada e adicionar preservação de trace/contexto no job falho.
- [x] Executar suíte lifecycle (GREEN), registrar causa/limites e commit `fix(web)`.

### Task 2: Dependências de build
**Files:** pnpm-workspace.yaml, pnpm-lock.yaml, docs/operations/stabilization/2026-10-07-audit-remediation.md.
**Interfaces:** Consome cadeia Tailwind/PostCSS atual; produz build compatível e tratamento explícito dos advisories.
- [x] Verificar advisories e compatibilidade das versões corrigidas.
- [x] Atualizar cadeias compatíveis; avaliar braces sem supor patch inexistente.
- [x] Build/lint/testes visuais relevantes e audit completo; registrar risco residual e commit `build(web)`.

### Task 3: Pesquisa → Caso
**Files:** ResearchDeskScreen.tsx, componente SaveAuthorityToCase, componente acervo do caso, MatterWorkspaceScreen.tsx, testes focados e E2E research.
**Interfaces:** Consome CaseLaw e GET/POST /api/v2/matters/:matterId/authorities; produz seleção explícita, gravação deduplicada e acervo consultável.
- [x] Testar ausência da ação e vínculo isolado sem débito; observar RED.
- [x] Implementar ação discreta, seleção explícita, estados de erro/duplicação e acervo com fonte/citação.
- [x] Validar tenant, estados lifecycle, preservação da pesquisa e navegação; commit `feat(web)`.

### Task 4: Retenção operacional
**Files:** apps/api/src/operations/retention-service.ts e testes; endpoint/CLI e infra existente conforme diagnóstico.
**Interfaces:** Consome RetentionPolicy e Client existentes; produz inspeção somente leitura e execução autenticada com prova agregada.
- [x] Mapear execução Scheduler existente; escrever testes de inspeção e autorização, RED.
- [x] Preparar operação regular com mesmos cutoffs, exceções e nenhum débito/alteração de valores.
- [x] Validar SQLite/PostgreSQL e inspecionar elegibilidade remota antes de ativação/exclusão; registrar gate operacional e commit.

### Task 5: Acompanhamento e provas humanas
**Files:** CONTINUIDADE.md, STATUS_VALIDACAO.md, plano progressivo, registro de remediação e checklist operacional restrito/sintético.
**Interfaces:** Consome evidências anteriores e novas; produz backlog único datado e automação referenciando main atual.
- [x] Reconciliar P2 e referências antigas, sem apagar histórico nem prometer latência universal.
- [x] Preparar ensaio de suporte e matriz objetiva das decisões/provas humanas ainda necessárias.
- [x] Atualizar automação existente preservando frequência e caráter somente leitura; registrar verificação e commit `docs`.

### Task 6: Reserva histórica, revisão e entrega
**Files:** Registro operacional; código de billing somente se surgir defeito demonstrado.
**Interfaces:** Consome leitura agregada de lease/ledger; produz classificação, sem estorno inferido.
- [x] Reconsultar reserva por leitura e classificar validade/impacto; correção somente com prova e autorização pertinente.
- [x] Build/lint/typecheck, unitários, PostgreSQL e E2E apropriados; revisão independente da branch.
- [x] Corrigir achados relevantes com RED/GREEN; commit/push, PRs e gates necessários para a entrega; registrar limites humanos restantes.

## Encerramento do escopo técnico

Tasks 1–6 executadas. PR #58 integrada, CI da PR/main aprovada e promoção
5/25/100 concluída. Job diário de inspeção autenticado demonstrado; apply e
worker público desligados. Parecer do núcleo sem achados materiais a corrigir;
script de provisionamento validado pelo executor. Comprovações humanas, patch
de braces e decisão de expurgo permanecem no backlog vigente.

[Recibo e limites](../../operations/stabilization/2026-10-07-audit-remediation-publication.md).
