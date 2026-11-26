# E3 — Estrutura do caso na redação e na orientação guiada: plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa a tarefa. Os passos usam caixas de seleção (`- [ ]`).

**Meta:** a minuta (`create_document`) sai contextualizada pela estrutura do caso, os itens ainda "a confirmar" entram marcados, e o usuário vê em que itens não conferidos a peça se apoia; a orientação guiada mostra uma linha de leitura da estrutura.

**Arquitetura:** o `case-task-driver` monta uma fonte confiável `structure-context:<deliveryId>` (resumo e itens, cada um `CONFIRMADO` ou `A_CONFIRMAR`; retirados ficam de fora) no molde de `structureItemsSource` do E2. Um contrato novo, v14, tem o comportamento do v12 (guiada, edição da mesa) mais a instrução de uso da estrutura; o redator devolve `structureUse`, que o servidor audita e a entrega guarda. A web mostra o aviso nas fontes da peça e a linha na orientação.

**Stack:** TypeScript, zod, vitest, drizzle, React. Pacotes: `packages/domain`, `packages/legal-agents`, `packages/legal-workflows`, `apps/api`, `apps/web`.

**Spec:** `docs/architecture/2026-11-19-estrutura-do-caso.md`, seção "Desenho do E3".

## Restrições globais

- TRAVA DE PRODUTO (`AGENTS.md`): nenhuma tela, aba, rota, botão ou trava de exportação novos; o seletor de ação não muda.
- A peça é redigida na voz da peça (como a parte, por seu advogado). Nada de "segundo o cliente" nem terceira pessoa. "A confirmar" é só pendência de conferência do usuário da Mesa.
- Contratos v1 a v13 e as fixtures `pre-*` em `packages/legal-workflows/src/agentic-case-task/fixtures` seguem passando intactos; tudo que muda no texto do agente entra no v14.
- Sem estrutura no caso: a minuta sai como hoje, sem erro e sem análise nova. Só com o acesso da IA ao caso autorizado.
- Só `create_document` usa a estrutura; `analyze_evidence` e `adjust_structure` não a recebem como contexto de redação.
- Só textos sintéticos nos testes. Português nos textos do usuário. Um commit por tarefa concluída; PR só com a frente completa.

## Foco da revisão

1. Caso sem estrutura (ou sem acesso da IA): redação idêntica à de hoje, sem fonte e sem erro (T3).
2. Execução com `actionId` `analyze_evidence` ou `adjust_structure` nunca recebe a fonte nem cai no v14; em Automático, se o orquestrador escolher `analyze_evidence` no v14, a análise não lê a estrutura nem exige `structureUse` (T2, T3).
3. `structureUse` com id que não está na fonte derruba o trabalho com `STRUCTURE_ITEM_INVALID`, e só itens `A_CONFIRMAR` ficam na entrega (T2).
4. Estrutura grande demais para uma fonte: entram resumo e confirmados primeiro, depois os a confirmar; o excedente é dito na fonte; nunca falha (T1).
5. Item retirado pelo usuário (DISCARD) nunca chega ao agente; item adotado chega como `CONFIRMADO` (T1).
6. Execução já iniciada em v10/v11/v12/v13 e retomada continua na sua versão (T2).

---

### Task 1: Fonte `structure-context` (função pura)

**Arquivos:**
- Modificar: `packages/domain/src/contracts/structure-commands.ts` (exports já saem em `packages/domain/src/index.ts`)
- Testar: `packages/domain/src/contracts/structure-commands.test.ts`

**Interfaces:**
- Consome: `EvidenceReviewItem`, `structureItemLabels`, `TaskSource`, `exceedsSourceTextLimit` (já neste arquivo).
- Produz:
  - `export const STRUCTURE_CONTEXT_SOURCE_PREFIX = 'structure-context:'` (não começa com `structure:`, para não colidir com `readStructureItemIds`).
  - `structureContextSource(deliveryId: string, items: readonly EvidenceReviewItem[], decisions: ReadonlyMap<string, 'ADOPT' | 'DISCARD'>, summary?: string): TaskSource | undefined` (kind `PREVIOUS_DELIVERY`, `contentHash` sha256 do texto, `extent: 'SELECTED_TEXT'`; `undefined` quando não sobra item nem resumo).
  - `readStructureContext(sources: readonly TaskSource[]): ReadonlyMap<string, { label?: string; state: 'A_CONFIRMAR' }> | undefined`: ids dos itens `A_CONFIRMAR` da fonte; `undefined` sem fonte; erro `STRUCTURE_SOURCE_CONFLICT` com duas fontes ou hash que não confere.
  - `StructureUseSchema = z.array(z.strictObject({ itemId, label: z.string().optional() })).max(100)` e `type StructureUse`.

- [ ] **Passo 1: testes** (`structure-commands.test.ts`): (a) item sem decisão vira `A_CONFIRMAR`, `ADOPT` vira `CONFIRMADO`, `DISCARD` não aparece; (b) o texto traz id, label, kind, classification, text, dateText e eventDate, e `userAdded: true` quando for o caso; (c) com 1 resumo de 3000 caracteres e itens que estouram `exceedsSourceTextLimit`, a fonte cabe, traz o resumo e os confirmados primeiro e um campo `omitted: N`; (d) sem itens e sem resumo devolve `undefined`; (e) `readStructureContext` devolve só os `A_CONFIRMAR`, e lança `STRUCTURE_SOURCE_CONFLICT` com hash adulterado.
- [ ] **Passo 2: rodar e ver falhar:** `pnpm --filter @forgelex/domain test -- structure-commands`.
- [ ] **Passo 3: implementar** as quatro exportações acima. Ordem de entrada na fonte: resumo, `CONFIRMADO`, `A_CONFIRMAR`; ao estourar o limite, cortar de trás para frente e registrar `omitted`.
- [ ] **Passo 4: rodar e ver passar**, e `pnpm --filter @forgelex/domain test` e `tsc` limpos.
- [ ] **Passo 5: commit** `feat(domain): fonte structure-context da estrutura do caso para a redação (E3)`.

---

### Task 2: Contrato v14 e auditoria de `structureUse`

**Arquivos:**
- Criar: `packages/legal-agents/src/agentic-structure-draft.ts` (exportar em `packages/legal-agents/src/index.ts`)
- Modificar: `packages/legal-workflows/src/agentic-case-task/case-task.ts`, `packages/domain/src/contracts/agentic-case-task.ts` (campo opcional `structureUse` na entrega, ao lado de `structureAdjustment`)
- Testar: `packages/legal-workflows/src/agentic-case-task/structure-draft.test.ts` (novo) e os testes de contrato/hashes já existentes

**Interfaces:**
- Consome: `scopedDeskEditProfile(role)`, `GuidedDeskPlanSchema`, `ScopedDeskEditStateSchema`, `readStructureContext`, `StructureUseSchema` (T1).
- Produz:
  - `structureDraftProfile(role: CaseTaskRole)` e `STRUCTURE_DRAFT_TASK_POLICY` (`version: '1.15.0'`): perfil do v12 mais o protocolo v14 no texto de `instructions`.
  - Estado `version: z.literal(14)` com a forma do v12 mais `structureUse: StructureUseSchema.optional()`; a união `StateSchema` ganha o v14.
  - Resultado do `legal-drafter` no v14 com `structureUse`; entrega persistida com `structureUse?: StructureUse` (só itens `A_CONFIRMAR`, com label).

- [ ] **Passo 1: testes** (`structure-draft.test.ts`, agente simulado): (a) com fonte `structure-context:` e `create_document`, a execução começa no v14 e a entrega traz `structureUse` só com itens `A_CONFIRMAR` da fonte; (b) `structureUse` com id fora da fonte falha com `STRUCTURE_ITEM_INVALID`; (c) id de item `CONFIRMADO` em `structureUse` é descartado da entrega, sem erro; (d) com `actionId` `analyze_evidence` ou `adjust_structure` a versão não é 14; (e) sem `guidedWorkflow` na configuração a fonte é ignorada e a versão é a de hoje; (f) em v14 com `analyze_evidence` escolhido pelo orquestrador, o resultado é aceito sem `structureUse` e a análise não recebe o texto da fonte; (g) estado salvo em v10, v11, v12 e v13 retoma na própria versão; (h) o perfil v14 traz a frase "voz da peça" e proíbe "segundo o cliente"; (i) os hashes de v1 a v13 e as fixtures `pre-*` não mudam.
- [ ] **Passo 2: rodar e ver falhar:** `pnpm --filter @forgelex/legal-workflows test -- structure-draft`.
- [ ] **Passo 3: implementar o perfil** `structureDraftProfile` no molde de `structureTaskProfile`, com o protocolo v14: a fonte `structure-context:` lista itens `CONFIRMADO` e `A_CONFIRMAR` e o resumo do caso; usar os dois como contexto, redigindo a peça na voz e na pessoa que a peça pede, sem "segundo o cliente" nem terceira pessoa; nunca tratar nada como provado; para o redator, devolver em `structureUse` os ids dos itens `A_CONFIRMAR` em que a peça se apoia; lacuna vira pergunta objetiva; para `analyze_evidence` ignorar a fonte.
- [ ] **Passo 4: implementar a versão 14 em `case-task.ts`.** Seleção em `step()`: sem estado restaurado, `guidedWorkflow` ligado, `readStructureContext(loaded.sources)` presente e `binding.actionId` fora de `analyze_evidence` e `adjust_structure` escolhe 14, antes da escada 12/11/10. Trocar cada teste `version === 11 || version === 12` por um helper `isGuidedDesk(version)` (11, 12, 14) e cada `version === 12` de edição da mesa por `isDeskEdit(version)` (12, 14); `profileFor`, `policyFor`, `planSchemaFor` (14 usa `GuidedDeskPlanSchema`) e `contractHash` ganham o 14. Auditoria no ponto de montagem da entrega, como a do v13: cada id de `structureUse` deve estar em `readStructureContext`; senão `STRUCTURE_ITEM_INVALID`.
- [ ] **Passo 5: rodar tudo de `legal-workflows`, `legal-agents` e `domain`**, `tsc` limpo nos três.
- [ ] **Passo 6: commit** `feat(workflows): contrato v14 usa a estrutura do caso na redação e audita structureUse (E3)`.

---

### Task 3: Montagem da fonte no driver da API

**Arquivos:**
- Modificar: `apps/api/src/agentic-workspace/case-task-driver.ts`
- Testar: `apps/api/src/agentic-workspace/structure-context-driver.test.ts` (novo)

**Interfaces:**
- Consome: `findCurrentStructure`, `reviews.preview(owner, deliveryId)`, `structureContextSource` (T1), `native.withTrustedSources`.
- Produz: `contextSource(owner, matterId, actionId): Promise<TaskSource | undefined>` (interno ao driver); o resumo é o do registro de ajuste mais recente em `review.adjustments` (os 10 guardados), se houver.

- [ ] **Passo 1: testes** (`structure-context-driver.test.ts`, no molde de `structure-adjustment-driver.test.ts`): (a) caso com análise vigente e `create_document`: o pacote do agente traz a fonte `structure-context:<deliveryId>` com os itens e o resumo do último ajuste; (b) caso sem análise: nenhuma fonte, execução conclui como hoje; (c) `actionId` `analyze_evidence`, `adjust_structure` e `research_question`: nenhuma fonte; (d) item DISCARD ausente, ADOPT como `CONFIRMADO`; (e) sem acesso da IA autorizado, nenhuma fonte e nenhum erro; (f) em Automático (sem `actionId`) a fonte é anexada.
- [ ] **Passo 2: rodar e ver falhar:** `pnpm --filter @forgelex/api test -- structure-context-driver`.
- [ ] **Passo 3: implementar** `contextSource` ao lado de `structureSource` e anexar o resultado com `native.withTrustedSources` quando existir, para `actionId` ausente ou `create_document`. Falha de leitura da estrutura não derruba a redação: segue sem fonte.
- [ ] **Passo 4: rodar** `pnpm --filter @forgelex/api test -- agentic-workspace` e `tsc`.
- [ ] **Passo 5: commit** `feat(api): driver anexa a estrutura vigente à redação (E3)`.

---

### Task 4: Aviso nas fontes da peça e linha na orientação guiada

**Arquivos:**
- Modificar: `apps/web/src/agentic-workspace/present-delivery.ts`, `apps/web/src/agentic-workspace/execution-model.ts`, a tela de fontes e conferência da peça (`apps/web/src/screens/DraftStudioScreen.tsx` e seus componentes), `apps/web/src/agentic-workspace/guidance-model.ts` e o componente que mostra o resumo da orientação (localizar com `guidanceSummaryText`)
- Testar: `present-delivery` (teste existente), `guidance-model.test.ts`, e2e em `tests/e2e/shell-gelo.spec.ts`

**Interfaces:**
- Consome: `structureUse` da entrega (T2) e a contagem de itens por estado que a aba Estrutura já calcula em `apps/web/src/desk/case-structure-model.ts`.
- Produz: `structureUseNotice(delivery): string | undefined` → "Baseada em itens ainda a confirmar: F2, P1" (labels; sem labels, "Baseada em N item(ns) ainda a confirmar"); `guidanceStructureLine(counts): string | undefined` → "Estrutura do caso: 5 fatos, 2 a confirmar" (sem estrutura, `undefined`).

- [ ] **Passo 1: testes:** (a) `structureUseNotice` com labels, sem labels e com lista vazia (`undefined`); (b) `guidanceStructureLine` com contagens e sem estrutura; (c) e2e: minuta entregue com `structureUse` mostra o aviso nas fontes da peça, e a orientação do caso com estrutura mostra a linha; sem estrutura, nenhum dos dois aparece; nenhum botão novo.
- [ ] **Passo 2: rodar e ver falhar:** `pnpm --filter @forgelex/web test`.
- [ ] **Passo 3: implementar** as duas funções e ligá-las: o aviso entra onde a tela de fontes e conferência já lista o que sustenta a peça; a linha entra no resumo da orientação, lida da mesma rota `GET .../structure` que a aba usa (reaproveitar o que já está carregado, sem nova rota).
- [ ] **Passo 4: rodar** web completo, `tsc`, e `pnpm test:e2e` do `shell-gelo` com a API real em SQLite, como no E2.
- [ ] **Passo 5: atualizar o spec** na seção "Estado de execução" (E3 entregue, limites e o que não foi verificado com o modelo real) e commitar junto: `feat(web): aviso de itens a confirmar na peça e linha da estrutura na orientação (E3)`.
