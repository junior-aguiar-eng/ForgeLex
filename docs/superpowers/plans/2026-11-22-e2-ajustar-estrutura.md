# E2 — Ajustar a estrutura do caso pela conversa: plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa a tarefa. Os passos usam caixas de seleção (`- [ ]`).

**Meta:** o usuário corrige a estrutura do caso (alterar, remover, acrescentar) falando no compositor, e a aba Estrutura mostra o resultado e um resumo do caso.

**Arquitetura:** uma ação nova `adjust_structure` roda um agente que lê o pedido e os itens da análise vigente e devolve **comandos estruturados** e um resumo. O servidor valida os comandos (função pura) e os aplica pelo fluxo de decisões que já existe (`evidence-review`: `ADOPT`/`DISCARD`); itens acrescentados nascem com o selo "informado por você, a confirmar". A aba lê tudo isso e numera fatos e provas.

**Stack:** TypeScript, zod, vitest, drizzle (SQLite/Postgres), React. Pacotes: `packages/domain`, `packages/legal-agents`, `packages/legal-workflows`, `packages/persistence`, `apps/api`, `apps/web`.

**Spec:** `docs/architecture/2026-11-19-estrutura-do-caso.md`, seções "Desenho do E2" e "Desenho do E1b".

## Restrições globais

- TRAVA DE PRODUTO (`AGENTS.md`): nenhuma tela, painel, rota "de dados" ou botão novo; o seletor de ação não ganha opção.
- Relato do usuário não é prova documental: item acrescentado nunca tem trecho (`sources: []`, `references: []`) nem prova, e nunca entra no contexto do caso sem confirmação explícita.
- Contratos versionados dos agentes não mudam: tudo que é novo entra em versão nova (fixtures `pre-*` em `packages/legal-workflows/src/agentic-case-task/fixtures` seguem passando intactas).
- Acesso da IA ao caso, autorização de inferência e orçamento valem como em qualquer trabalho.
- Só textos sintéticos nos testes. Português nos textos do usuário.
- Um commit por tarefa concluída; PR só com a frente completa.

## Foco da revisão

Entradas que o spec implica e nenhuma tarefa exercita por si só; cada linha tem o teste na tarefa dona:

1. "O fato 3" que não existe, ou número fora do intervalo: o agente pergunta, o servidor não adivinha (T1).
2. Corrigir um item já decidido (`EVIDENCE_ALREADY_DECIDED`): vira aviso ao usuário, não erro 500 (T4).
3. Data do evento sobre um item que não é da linha do tempo (`EVIDENCE_DATE_INVALID` no repositório): comando é rejeitado antes de gravar (T1).
4. Nova análise substitui a vigente depois de correções: correções antigas não se reaplicam sozinhas (T2, T4).
5. Pedido de correção longo (600+ caracteres) em Automático não pode cair na regra do relato colado do E1b (T5).

---

### Tarefa 1: Comandos de ajuste e resolvedor puro

**Arquivos:**
- Criar: `packages/domain/src/contracts/structure-commands.ts` (exportar em `packages/domain/src/index.ts`)
- Criar: `packages/domain/src/contracts/structure-commands.test.ts`

**Interfaces:**
- Produz:
  - `StructureCommandSchema`: união discriminada por `op`: `{op:'ALTERAR', itemId: string /^[a-f0-9]{64}$/, texto?: string(3..4000), dataEvento?: string.date()}` (exige `texto` ou `dataEvento`), `{op:'REMOVER', itemId}`, `{op:'ACRESCENTAR', texto: string(3..4000), frase: string(1..2000)}`. Limite de 20 comandos por trabalho.
  - `resolveStructureCommands(input: { items: EvidenceReviewItem[]; decidedIds: ReadonlySet<string>; commands: StructureCommand[] }): { decisions: EvidenceReviewCommand['decisions']; added: { texto: string; frase: string }[]; questions: { itemId?: string; reason: 'ITEM_DESCONHECIDO' | 'JA_DECIDIDO' | 'DATA_SO_PARA_LINHA_DO_TEMPO' | 'SEM_EFEITO' }[] }`

- [ ] **Passo 1: Escrever os testes que falham** (`structure-commands.test.ts`): ALTERAR com `texto` vira `{action:'ADOPT', text}`; ALTERAR com `dataEvento` num item `TIMELINE` vira `ADOPT` com `eventDate`; REMOVER vira `DISCARD`; ACRESCENTAR vai para `added`; `itemId` que não está em `items` gera `questions` com `ITEM_DESCONHECIDO` e nenhuma decisão; item em `decidedIds` gera `JA_DECIDIDO`; `dataEvento` em item `FACT` gera `DATA_SO_PARA_LINHA_DO_TEMPO`; ALTERAR sem `texto` nem `dataEvento` falha no schema; dois comandos para o mesmo `itemId` mantêm o último e não duplicam decisão (o schema de decisões rejeita duplicadas).
- [ ] **Passo 2:** Rodar `pnpm --filter @forgelex/domain exec vitest run src/contracts/structure-commands.test.ts`. Esperado: FALHA (módulo ausente).
- [ ] **Passo 3:** Implementar o schema e `resolveStructureCommands` em `structure-commands.ts`, sem I/O.
- [ ] **Passo 4:** Rodar o teste. Esperado: PASSA.
- [ ] **Passo 5:** Commit `feat(domain): comandos de ajuste da estrutura e resolvedor puro (E2)`.

### Tarefa 2: Item acrescentado com selo, no repositório de revisão

**Arquivos:**
- Modificar: `packages/domain/src/contracts/evidence-review.ts` (campo opcional `userAdded?: { frase: string; addedAt: string }` em `EvidenceReviewItem`)
- Modificar: `packages/persistence/src/repositories/native-evidence-review-repository.ts` (`SavedReview` ganha `added?: EvidenceReviewItem[]`, aditivo; `emptyReview` inalterado)
- Testar: `packages/persistence/src/repositories/evidence-review-items.test.ts` e o teste do repositório de revisão existente

**Interfaces:**
- Consome: `EvidenceReviewItem`, `SavedReview`, `adoptAnalysisItem` (já aceita `FACT` com `sources: []`: cria fato `ASSERTED` sem âncora).
- Produz: `NativeEvidenceReviewRepository.addUserItems(owner, deliveryId, added: {texto: string; frase: string}[]): Promise<EvidenceReview>` — cria itens `kind:'FACT'`, `classification:'ALLEGATION'`, `sources:[]`, `references:[]`, `originIds:[]`, `userAdded` preenchido, id = `evidenceHash([deliveryId,'user',texto])`; incrementa `revision` (o `reviewToken` muda porque os itens mudam); `preview` passa a devolver `items` derivados + `added`.

- [ ] **Passo 1: Testes que falham:** acrescentar item aparece em `preview().items` com `userAdded` e sem `sources`; o `reviewToken` muda; repetir o mesmo texto não duplica; `decide` com `ADOPT` desse item cria um fato `ASSERTED` sem âncora no caso; **antes** do `ADOPT` nada existe no contexto aprovado do caso (consulta ao repositório de fatos vazia).
- [ ] **Passo 2:** Rodar `pnpm --filter @forgelex/persistence exec vitest run src/repositories/` e ver falhar.
- [ ] **Passo 3:** Implementar `addUserItems` e a união de itens em `guarded`/`preview`; manter `version: 1` (campo opcional).
- [ ] **Passo 4:** Rodar de novo; passa. Rodar também o teste de fixtures de revisão existente para confirmar que revisões antigas (sem `added`) seguem idênticas.
- [ ] **Passo 5:** Commit `feat(persistence): itens acrescentados pelo usuário entram na revisão com selo (E2)`.

### Tarefa 3: Localizar a análise vigente do caso num ponto único

**Arquivos:**
- Modificar: `apps/api/src/agentic-workspace/execution-routes.ts:710-733` (a rota `GET /api/agentic/matters/:matterId/structure` usa o auxiliar)
- Criar: `apps/api/src/agentic-workspace/current-structure.ts`
- Testar: o teste da rota de estrutura (E1) continua passando; novo `current-structure.test.ts`

**Interfaces:**
- Produz: `findCurrentStructure(deps: { store: ExecutionStore; native: NativeCaseTask; manages?: (e: AgenticExecution) => boolean }, owner: AgenticOwner, matterId: string): Promise<{ executionId: string; deliveryId: string; updatedAt: string } | null>` — a mesma lógica hoje embutida na rota (últimas 50 conversas, `COMPLETED`, `action === 'analyze_evidence'`).

- [ ] **Passo 1:** Escrever `current-structure.test.ts`: caso com duas análises devolve a mais recente; caso só com execução cancelada devolve `null`; análise de outro caso é ignorada.
- [ ] **Passo 2:** Rodar `pnpm --filter @forgelex/api exec vitest run src/agentic-workspace/current-structure.test.ts` e ver falhar.
- [ ] **Passo 3:** Mover a lógica para o auxiliar e fazer a rota chamá-lo, sem mudar a resposta.
- [ ] **Passo 4:** Rodar os testes da rota de estrutura (E1) e o novo; passam.
- [ ] **Passo 5:** Commit `refactor(api): localizar a análise vigente do caso num auxiliar (E2)`.

### Tarefa 4: Ação `adjust_structure` (agente e contrato novo)

**Arquivos (seguir o precedente de `analyze_evidence`):**
- Modificar: `packages/domain/src/contracts/agentic-case-task.ts` (`AgenticTaskActionSchema` ganha `'adjust_structure'`; novo campo de resultado `structureAdjustment: { commands: StructureCommand[]; caseSummary: string(1..1500) }`)
- Criar: `packages/legal-agents/src/agentic-structure.ts` (perfil do papel `matter-analyst` para a ação, esquema do resultado, ação pública `{id:'adjust_structure', label:'Ajustar a estrutura'}` fora do seletor)
- Modificar: `packages/legal-agents/src/agentic-case-contracts.ts`, `packages/legal-workflows/src/agentic-case-task/case-task.ts`, `orchestration-graph.ts` (nó do analista, revisor adversarial confere que cada `itemId` existe nos itens recebidos), `apps/web/src/agentic-workspace/execution-model.ts` (tipo)
- Testar: `packages/legal-workflows/src/agentic-case-task/structure-adjustment.test.ts` (modelo: `evidence-analysis.test.ts`)

**Interfaces:**
- Consome: `StructureCommandSchema` (T1). O agente recebe como fontes os itens da análise vigente como `PREVIOUS_DELIVERY`/`CASE_EVIDENCE` com `id` e texto, e a frase do usuário como `USER_TEXT`.
- Produz: entrega com `action: 'adjust_structure'` cujo resultado contém `structureAdjustment`. Versão nova do contrato (depois de v12); versões anteriores não aceitam a ação.

- [ ] **Passo 1: Testes que falham:** (a) plano com `adjust_structure` é aceito só na versão nova e recusado nas anteriores; (b) resultado com `itemId` fora dos itens recebidos é recusado pelo conferidor; (c) resultado com `ACRESCENTAR` sem `frase` é recusado; (d) fixtures `pre-*` seguem com o mesmo hash de contrato.
- [ ] **Passo 2:** Rodar `pnpm --filter @forgelex/legal-workflows exec vitest run src/agentic-case-task/structure-adjustment.test.ts` e ver falhar.
- [ ] **Passo 3:** Implementar na ordem: enum e esquema (domain), perfil e instruções do papel (legal-agents; instruir a não inventar fato, a perguntar quando a referência for ambígua e a usar `ACRESCENTAR` só para o que o usuário afirma sem fonte), grafo e conferência (workflows).
- [ ] **Passo 4:** Rodar o teste novo e a suíte `pnpm --filter @forgelex/legal-workflows test`; passam, incluindo as fixtures.
- [ ] **Passo 5:** Commit `feat(agents): ação adjust_structure com comandos estruturados e resumo (E2)`.

### Tarefa 5: Aplicar os comandos quando o trabalho termina

**Arquivos:**
- Modificar: `apps/api/src/agentic-workspace/case-task-driver.ts` (depois de persistir a entrega de `adjust_structure`) e `execution-service.ts`/`pasted-account.ts` (a regra do relato colado ignora pedidos que já trazem `actionId`; nada a mudar além do teste)
- Criar: `apps/api/src/agentic-workspace/apply-structure-adjustment.ts`
- Testar: `apps/api/src/agentic-workspace/apply-structure-adjustment.test.ts`

**Interfaces:**
- Consome: `findCurrentStructure` (T3), `resolveStructureCommands` (T1), `addUserItems` e `decide` (T2).
- Produz: `applyStructureAdjustment(deps, owner, matterId, delivery: AgenticTaskDelivery): Promise<{ applied: number; questions: ReturnType<typeof resolveStructureCommands>['questions'] }>` — resolve a análise vigente, chama `resolveStructureCommands`, grava `added` e as `decisions` (um `commandId` por trabalho, derivado do id da execução, para o replay ser idempotente) e guarda `caseSummary` e `questions` com a entrega.

- [ ] **Passo 1: Testes que falham:** ALTERAR e REMOVER viram decisões e o fato aparece no caso; ACRESCENTAR cria item com selo e **não** cria fato no caso; reaplicar o mesmo trabalho não duplica (idempotência); item já decidido devolve `JA_DECIDIDO` sem lançar; análise vigente trocada entre o pedido e a aplicação (revisão diferente) aplica nada e devolve pergunta ao usuário (foco da revisão 4); pedido de correção de 700 caracteres com `actionId: 'adjust_structure'` não vira `analyze_evidence` (foco da revisão 5).
- [ ] **Passo 2:** Rodar `pnpm --filter @forgelex/api exec vitest run src/agentic-workspace/apply-structure-adjustment.test.ts` e ver falhar.
- [ ] **Passo 3:** Implementar o auxiliar e ligá-lo ao ponto de conclusão do driver para entregas `adjust_structure`; o resumo do caso fica na entrega e é exposto pela rota existente de entregas.
- [ ] **Passo 4:** Rodar o teste novo, `execution-service.test.ts` e `pasted-account.test.ts`; passam.
- [ ] **Passo 5:** Commit `feat(api): aplicar os comandos de ajuste da estrutura ao terminar o trabalho (E2)`.

### Tarefa 6: Aba Estrutura numera, marca e resume; compositor envia a ação

**Arquivos:**
- Modificar: `apps/web/src/desk/case-structure-model.ts` (numeração `F1…`/`P1…` na ordem exibida, `StructureEntry` ganha `label?: string`, `userAdded?: boolean`), `apps/web/src/desk/DeskCaseStructure.tsx` (mostra o rótulo, o selo "informado por você, a confirmar", o resumo no topo e o que mudou), `apps/web/src/agentic-workspace/Composer.tsx` (envia `actionId: 'adjust_structure'` quando a aba Estrutura da peça está ativa e o usuário não escolheu outra ação)
- Testar: `apps/web/src/desk/case-structure-model.test.ts`, teste de componente da aba e o teste e2e `tests/e2e/shell-gelo.spec.ts` (estender)

**Interfaces:**
- Consome: resposta da entrega com `caseSummary` e itens com `userAdded` (T2, T5).
- Produz: o compositor recebe da peça um indicador `structureTabActive: boolean` (via o contexto de peça que já o alimenta); sem ele, o comportamento atual não muda.

- [ ] **Passo 1: Testes que falham:** numeração estável (mesma ordem, mesmos rótulos entre duas renderizações); item `userAdded` mostra o selo e não mostra fonte; item alterado/removido aparece marcado; com a aba ativa o envio inclui `actionId: 'adjust_structure'` e, com ela inativa, não inclui; usuário que escolheu outra ação no seletor nunca é sobrescrito.
- [ ] **Passo 2:** Rodar `pnpm --filter @forgelex/web exec vitest run src/desk/case-structure-model.test.ts` e ver falhar.
- [ ] **Passo 3:** Implementar modelo, componente e o envio da ação; sem botão novo, sem opção nova no seletor.
- [ ] **Passo 4:** Rodar os testes unitários e o e2e da aba (rotas simuladas); passam. Conferir no navegador (preview) com um caso sintético: corrigir "o fato 2 foi em 2021" e ver o resultado.
- [ ] **Passo 5:** Commit `feat(web): aba Estrutura numera itens, mostra o selo e o resumo e envia ajustes (E2)`.

---

## Autoavaliação

- **Cobertura do spec:** alterar/remover/acrescentar (T1, T2, T5); selo e confirmação explícita (T2); ação nova com versão de contrato (T4); resumo (T4, T5, T6); numeração e aba (T6); envio sem seletor (T6); antimeta do selo (T2 testa que nada entra no contexto antes do `ADOPT`).
- **Consistência de tipos:** `StructureCommand`, `resolveStructureCommands`, `addUserItems`, `findCurrentStructure` e `applyStructureAdjustment` têm a mesma assinatura onde são produzidos e consumidos.
- **Risco assumido:** T4 depende de leitura profunda de `case-task.ts` (versões v1–v12); o executor deve copiar o precedente de `analyze_evidence` e rodar as fixtures `pre-*` a cada passo. Se a versão nova exigir mais de uma tarefa, dividir T4 em contrato e grafo.
- **Fatias do spec:** T1–T2 e T5 (alterar/remover) + T6 numeração formam a fatia 1; acrescentar (T2, T5) a fatia 2; resumo (T4 campo, T6 exibição) a fatia 3. Se for preferível entregar em três PRs, cortar por esses grupos.
