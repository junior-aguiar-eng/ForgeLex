# Ciclo de vida de casos e documentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano em execução nativa sequencial. Steps use checkbox (`- [ ]`) syntax for tracking. Ao final, realizar uma revisão independente da branch inteira antes da integração.

**Goal:** Permitir arquivar, restaurar e excluir casos/documentos com interface discreta, preservando referências históricas e impedindo acesso indevido ou recuperação de conteúdo definitivamente excluído por restore.

**Architecture:** Contratos aditivos de lifecycle; repositório transacional com bloqueio por caso; serviços de disponibilidade compartilhados; rotas exclusivas da sessão web; journal durável separado para purge/restore; componentes pequenos de gestão nas telas existentes.

**Tech Stack:** TypeScript, Zod, Drizzle, SQLite/PostgreSQL, Fastify, React, Vitest e Playwright. Reutilizar os adaptadores de banco e padrões operacionais de journal/restore existentes.

**Spec:** [Especificação aprovada](../specs/2026-10-06-casos-documentos-ciclo-vida-design.md).

**Checkout:** `C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`; branch `codex/casos-documentos-ciclo-vida`, base `dbdc349`, especificação em `f6a008f`. Não modificar o checkout original com trabalho P2 independente.

## Global Constraints

- Estados `ACTIVE | ARCHIVED | TRASHED | PURGED`, revisão monotônica, ator/datas e estado anterior à Lixeira. Preservar `OPEN | CLOSED | ARCHIVED` e `INDEXED | FAILED`; casos já arquivados migram para `ARCHIVED`, restauração legada usa `OPEN`.
- Somente sessão web com `matter:write` e criador do caso ou owner/admin da organização pode gerir. Outro tenant: 404; mesmo tenant sem gestão: 403. Sem ferramentas de gestão MCP, API key ou OAuth.
- Caso inativo impede novas gravações e pesquisa associada; documento só muda com caso ativo. Ordem de bloqueio: caso → documento/rascunho → dependentes. Revalidar no commit, inclusive após trabalho demorado.
- Arquivar/enviar à Lixeira revoga atomicamente acessos IA afetados; restauração não concede acesso nem restaura filhos automaticamente. Sem cobrança/reembolso por gestão e sem alterações do ledger/saldo.
- Arquivado permanece legível pelo humano em sessão; Lixeira não fornece fontes para trabalho. `PURGED` não aparece nem retorna conteúdo. Referência histórica arquivada pode ser consultada explicitamente; original purgado nunca é reconstruído pelo resolver.
- Exclusão definitiva somente da Lixeira, individual e confirmada. Sem prazo automático, operação em lote ou botões novos para fatos/teses/rascunhos. Cópias anteriores em textos de outros materiais não são reescritas ao excluir somente um documento.
- Journal próprio fora do snapshot restaurável: `PREPARED` → `COMPLETED | ABORTED`; rollback precisa ser comprovado. Restore inconclusivo permanece sem tráfego. Resultado local comprometido não significa conclusão durável nem autoriza repetir purge.
- UI: `Mais opções`, `Em uso`, `Arquivados`, `Lixeira`, `Arquivar`, `Restaurar`, `Excluir`, `Excluir definitivamente`. Preservar buffers; salvar/descartar/cancelar antes de transição. Exclusão de caso exige digitar o título apresentado.
- Auditoria somente IDs, ação, resultado, revisão e contagens. Não registrar texto, título digitado ou tokens. Homologação exclusivamente sintética.

## Review Focus

1. Usuário de outro caso/tenant, OAuth ou API key contornando filtros por URLs antigas: tarefas 2, 4 e 7.
2. Corrida entre lifecycle e gravação/receipt/replay/aprovação: tarefas 2, 3, 4 e 9, ambas as ordens com barreiras reais.
3. Documento indisponível continuando a confirmar prova ou aprovação antiga: tarefa 4, contexto e revisão atualizados.
4. Purge parcial ou restore ressuscitando originais após falha do journal: tarefas 5, 6 e 9.
5. Buffer perdido por menu, Escape, falha de salvamento ou outra aba: tarefa 8.

## Mapa de arquivos e responsabilidades

Todos os caminhos abaixo são relativos ao checkout acima. Arquivos novos são identificados nas tarefas; arquivos existentes recebem alterações focadas.

- `packages/domain/src/contracts/matter-lifecycle.ts` (novo): estados, comandos, resultados e disponibilidade; `matter.ts` e `index.ts`: integração dos contratos.
- `packages/persistence/src/repositories/matter-lifecycle-repository.ts` e `matter-write-guard.ts` (novos): transições, autorização e serialização. Repositórios existentes preservam seus domínios e usam o guard.
- `packages/persistence/src/repositories/matter-purge-repository.ts` (novo): inventário, expurgo escopado e verificação de resíduos; schema/migrations persistem lifecycle e operações.
- `apps/api/src/matters/` (novo): rotas, serviço de purge, journal/GCS, reconciliação e gate de restore; `app.ts` apenas compõe dependências e adapta rotas existentes afetadas.
- `apps/web/src/screens/matter-lifecycle/` (novo): menus, filtros e confirmação; telas existentes continuam responsáveis pelo conteúdo e salvamento.
- Testes acompanham cada módulo; `scripts/smoke-matter-lifecycle-postgres.mjs`, `scripts/verify-matter-lifecycle-restore.mjs`, configuração/suite Playwright novas e CI verificam integração.

## Task 1 — Contratos e persistência aditiva

**Files:** Criar `packages/domain/src/contracts/matter-lifecycle.ts` e teste; modificar contratos `matter.ts`, exports domain/persistence, `schema/schema.ts`, `migrations/migration-runner.ts` e `migration-idempotency.test.ts`.

**Interfaces produzidas:** `LifecycleState`; `LifecycleView = 'active' | 'archived' | 'trash'`; `LifecycleAction = 'archive' | 'trash' | 'restore'`; `LifecycleTarget = { tenantId: string; matterId: string; documentId?: string }`; `LifecycleActor = { userId: string; role: 'owner' | 'admin' | 'member'; authType: 'web_session'; scopes: string[] }`; `LifecycleCommand = { expectedLifecycleRevision: number }`; `PurgeCommand` acrescenta `confirmation: string`; `LifecycleResult = { id: string; lifecycleState: LifecycleState; lifecycleRevision: number; archivedAt?: string; trashedAt?: string; purgedAt?: string }`. Actor é construído no servidor, nunca pelo corpo HTTP.

- [ ] RED: `rejectUnknownFieldsAndNegativeRevision` verifica `expect(schema.safeParse({expectedLifecycleRevision:-1}).success).toBe(false)` e rejeita ator enviado no corpo; `migrateLegacyStatesTwice` verifica OPEN/CLOSED→ACTIVE, ARCHIVED→ARCHIVED, documentos FAILED→ACTIVE e segunda migração sem mudança de revisão. Confirmação de documento é seu ID; confirmação de caso é seu título exato, validado contra o alvo bloqueado, sem persistir o texto da confirmação.
- [ ] Executar `pnpm exec vitest run packages/domain/src/contracts/matter-lifecycle.test.ts packages/persistence/src/migrations/migration-idempotency.test.ts`; registrar falha relevante antes da implementação.
- [ ] Implementar contratos strict e migration `persistence-0028-matter-lifecycle`: campos lifecycle nos dois alvos, estado/status anteriores, revisão inicial 0 e datas/atores opcionais; não alterar conteúdo legado.
- [ ] Adicionar tabela `matter_lifecycle_purge_operations` com operationId, alvo/tenant, revisão, fingerprint, estado local, datas e contagens; adicionar `matter_id` opcional em `research_search_history` e índices escopados. Sem backfill por coincidência textual.
- [ ] GREEN: repetir o comando; adicionar as tabelas/colunas ao inventário de encerramento de conta e teste de resíduos. Commit `feat(matters): definir estados de arquivo e lixeira`.

## Task 2 — Transições, autorização e revogação atômica

**Files:** Criar `matter-lifecycle-repository.ts/.test.ts` e `matter-write-guard.ts/.test.ts`; modificar `case-ai-access-repository.ts` e exports persistence.

**Interfaces:** `MatterLifecycleRepository.transition(target: LifecycleTarget, actor: LifecycleActor, action: LifecycleAction, command: LifecycleCommand): Promise<LifecycleResult>`; `assertCanManage(target, actor): Promise<void>`. `MatterWriteGuard.run<T>(target: LifecycleTarget, expectedMatterRevision: number, write: (tx: ForgeLexDatabase) => Promise<T>): Promise<T>` bloqueia caso e valida disponibilidade antes da callback; `captureRevision(target): Promise<number>` admite somente caso/documento ativos.

- [ ] RED: `restorePreviousStateWithoutRestoringChildren` verifica ARCHIVED→TRASHED→ARCHIVED e OPEN/CLOSED preservados; `rejectStaleRevision` verifica revisão velha não gera evento; `revokeOnlyAffectedGrants` verifica todas as concessões do caso ou somente seleções do documento, incluindo versões fixadas.
- [ ] RED: `managementAuthorizationMatrix` cobre criador/member, owner/admin, outro member, outro tenant e documento de outro caso; `rollbackTransitionAndRevocationTogether` injeta falha e verifica estados/revisões/concessões originais.
- [ ] Executar os dois testes novos com Vitest; registrar falhas relevantes.
- [ ] Implementar matriz A→ARCHIVED, A/ARCHIVED→TRASHED, ARCHIVED→A e TRASHED→estado anterior; rejeitar PURGED e repetir comando com revisão velha. Caso inativo bloqueia transição de documento. Lock do caso precede lock do documento e alteração dos grants.
- [ ] GREEN: repetir testes; verificar zero operações financeiras e auditoria sem conteúdo. Commit `feat(matters): arquivar e restaurar com revogação de acesso`.

## Task 3 — Guard de gravação em todos os serviços do caso

**Files:** Modificar `matter-repository.ts`, `facts-evidence-repository.ts`, `legal-issue-repository.ts`, `legal-thesis-repository.ts`, `matter-authority-repository.ts`, `research-memo-repository.ts`, `workflow-checkpoint-repository.ts`, `draft-repository.ts`, `draft-ai-receipt-repository.ts`, `research-history-repository.ts`; serviços em `packages/legal-tools/src/facts-evidence/`, `drafting/`, `research/`, e integração correspondente em `apps/api/src/app.ts`.

**Interfaces consumidas:** guard da tarefa 2. `ResearchHistoryInput` ganha `matterId?: string`; contexto de pesquisa associada transporta matterId e revisão capturada internamente até gravação. Pesquisa avulsa permanece sem matterId.

- [ ] RED: criar `packages/legal-tools/src/matter-write-lifecycle.test.ts` com tabela de operações: importar/versionar documento, fatos/vínculos/provas/timeline, teses/issues, autoridades/verificações/memos/checkpoints, drafts/adotar/revisar/pedir/decidir aprovação e conceder IA. Em ARCHIVED/TRASHED, `expect(write).rejects` e contagem de cada tabela inalterada.
- [ ] RED: `inactiveAssociatedResearchNeverStartsBilling` verifica operação paga não chamada; `lateResultCannotCommitAfterArchive` verifica revisão capturada inválida, sem gravação de resultado nem reembolso automático.
- [ ] Executar `pnpm exec vitest run packages/legal-tools/src/matter-write-lifecycle.test.ts`; registrar falhas.
- [ ] Aplicar guard dentro das transações; callbacks escrevem pelo tx recebido. Não reacquirir lock na ordem inversa nem usar repositório externo ao tx. Para trabalho demorado, capturar revisão antes e revalidar na gravação; receipt/replay mantém grant/revisão e ordem de bloqueio existentes.
- [ ] Persistir associação de histórico/sessão/checkpoint quando pesquisa deriva de caso; replay de operationId não pode trocar caso. Inventariar caminhos que não atravessam serviços usuais, inclusive aprovação por token e ferramentas internas.
- [ ] GREEN: repetir teste novo e suítes facts/evidence, drafting, research e receipts. Commit `feat(matters): bloquear gravações em casos indisponíveis`.

## Task 4 — Leitura humana, IA, referências e revisão

**Files:** Modificar `matter-repository.ts`, `draft-review-context.ts`, `draft-review-run-repository.ts`, `draft-repository.ts`, `packages/legal-tools/src/case-context/case-context-service.ts`, serviços de drafting/facts-evidence e `apps/web/src/documents/draft-docx.ts`; criar `packages/legal-tools/src/matter-source-availability.test.ts`.

**Interfaces produzidas:** `MatterRepository.listMatters(tenantId: string, view?: LifecycleView): Promise<Matter[]>`, equivalente `listDocuments(tenantId, matterId, view?)`; `getMatterForWork(tenantId, matterId): Promise<Matter | undefined>`; `getDocumentSource(target: LifecycleTarget, versionId: string, audience: 'web_history' | 'work'): Promise<{ availability: 'AVAILABLE' | 'ARCHIVED' | 'UNAVAILABLE'; lifecycleRevision: number; source?: IngestedTextDocument }>`; `source` só existe para disponível ou arquivado em histórico humano. API autentica o audience; MCP sempre work.

- [ ] RED: `archivedPinnedSourceHumanOnly` preserva versão fixada para sessão humana; `trashedSourceDoesNotConfirmEvidence` mantém IDs/vínculos, mas suporte indisponível e revisão bloqueante; `purgedAnchorsNeverReachDomainParser` não retorna texto nem falha de parser como vazamento.
- [ ] RED: `restoreRequiresFreshReview` exige novo contexto/hash; `oldApprovalTokenCannotApproveUnavailableSource` revalida no commit; `revokedContextCannotReadOrReplay` cobre manifest, readItem, cursor, referências novas e draft.save com `CASE_CONTEXT_NOT_AUTHORIZED`.
- [ ] Executar `pnpm exec vitest run packages/legal-tools/src/matter-source-availability.test.ts`; registrar falhas.
- [ ] Separar leitores ativos de histórico explícito; disponibilidade efetiva inclui pai. Incluir disponibilidade/revisões de caso/documentos no contexto de review; referências indisponíveis geram checks DOCUMENT/CASE_DOCUMENT. Aprovações concluídas permanecem históricas.
- [ ] DOCX exporta somente versão salva e avisos de fonte indisponível; resolvedor não reconstitui original e trechos já copiados permanecem como no rascunho salvo. GREEN nos testes novos, review, receipts e DOCX; commit `feat(drafting): revisar disponibilidade das fontes do caso`.

## Task 5 — Journal durável e bloqueio de restore

**Files:** Criar `apps/api/src/matters/matter-purge-journal.ts/.test.ts`, `matter-purge-journal-gcs.ts/.test.ts`, `matter-purge-restore.ts/.test.ts`; modificar composição `app.ts` e ferramentas operacionais de restore sem mudar contratos de account closure.

**Interfaces:** `PurgeIntent = { operationId: string; target: LifecycleTarget; expectedLifecycleRevision: number; fingerprint: string; preparedAt: string }`; journal sela IDs e não grava texto. `MatterPurgeJournal.prepare(intent: PurgeIntent): Promise<void>`, `complete(operationId: string): Promise<void>`, `abortVerified(operationId: string): Promise<void>`, `list(): Promise<PurgeJournalEvent[]>`, `assertAnchor(): Promise<void>`. `PurgeJournalEvent` é união versionada: PREPARED contém intent selado; COMPLETED/ABORTED contêm operationId e recordedAt. `PurgeRecoveryPort` oferece `localOutcome(operationId): Promise<'committed' | 'rolled_back' | 'unknown'>`, `reapply(intent: PurgeIntent): Promise<void>` e `verifyResiduals(target: LifecycleTarget): Promise<void>`. `MatterPurgeRestoreGate` recebe journal e esse port; `check(): Promise<boolean>` e `reapply(): Promise<{reapplied: number}>`. Testes usam port falso nesta tarefa; tarefa 6 fornece implementação persistente.

- [ ] RED: `unresolvedIntentBlocksOldSnapshot` mantém gate false mesmo sem registro local; `missingAnchorFailsClosed` não aceita journal vazio novo; `conflictingTerminalBlocksRestore` rejeita dois terminais; `committedButTerminalFailedReconcilesSameOperation` impede novo purge e falso sucesso.
- [ ] Executar `pnpm exec vitest run apps/api/src/matters/matter-purge-journal.test.ts apps/api/src/matters/matter-purge-journal-gcs.test.ts apps/api/src/matters/matter-purge-restore.test.ts`; registrar falhas.
- [ ] Implementar namespace/prefixo lifecycle, criptografia autenticada e escritas condicionais idempotentes no armazenamento independente. Configuração ausente bloqueia purge em produção; não cria journal em memória como fallback operacional.
- [ ] Gate exige âncora, terminal válido e reaplicação/verificação antes da readiness de base restaurada. PREPARED pendente precisa evidência transacional confiável para concluir/abortar; ausência em backup não é rollback. Falhas após commit ficam pendentes da mesma operação.
- [ ] GREEN: repetir testes e regressões journal/restore de account closure. Commit `feat(matters): registrar exclusões em journal durável`.

## Task 6 — Purge escopado de documentos e casos

**Files:** Criar `packages/persistence/src/repositories/matter-purge-repository.ts/.test.ts`, `apps/api/src/matters/matter-purge-service.ts/.test.ts` e `matter-purge-reconciler.ts/.test.ts`; modificar inventário/resíduos de account closure; documentar inventário em `docs/product/matter-lifecycle.md`.

**Interfaces:** `MatterPurgeRepository` implementa `PurgeRecoveryPort` da tarefa 5; `purge(target: LifecycleTarget, actor: LifecycleActor, command: PurgeCommand, intent: PurgeIntent): Promise<LifecycleResult>`. `reapply` não depende da revisão do backup; `localOutcome` não presume rollback por ausência no snapshot. `MatterPurgeService.execute(target: LifecycleTarget, actor: LifecycleActor, command: PurgeCommand): Promise<LifecycleResult>` só resolve após terminal durável; `MatterPurgeReconciler.runOne(operationId: string): Promise<'completed' | 'pending' | 'aborted'>`.

- [ ] RED: `documentPurgeRedactsEveryVersion` remove originais/anchors/metadados, mantém mínimos FKs e cópias em draft; `casePurgeLeavesOtherCaseAndLedgerIntact` verifica todos os filhos do alvo, incluindo sessões/checkpoints/histórico associado, sem alterar outro caso/saldo/ledger.
- [ ] RED: `purgeOutsideTrashOrRetentionHoldRejected` impede escrita; `failureRollsBackAllChildren` verifica rollback; `journalFailureAfterCommitDoesNotRestoreContent` retorna pendência recuperável sem declarar conclusão.
- [ ] Executar testes novos Vitest e registrar falhas.
- [ ] Escrever inventário por tabela e associação: filhos diretos pelo tenant+matterId, anchors/versions por documentos, tokens/decisões por pedidos, sessões e respectivos filhos por matterId. Histórico de pesquisas usa associação explícita da tarefa 3; legado só recebe associação com evidência persistida inequívoca, jamais por query/título semelhante. Associação ambígua de material do alvo impede purge com conflito explicativo até resolução, sem apagar estruturas compartilhadas por tenant.
- [ ] Implementar PREPARED antes do tx; sob lock validar autorização, revisão, Lixeira, confirmação e retenção, expurgar em ordem de FK e registrar resultado local/operationId. Documento mantém tombstones mínimos e referência `Documento excluído — fonte indisponível`; caso mantém marcador mínimo sem título/descrição.
- [ ] Confirmar terminal após commit; abortar somente após rollback comprovado; reconciliar mesma operação. No restore, reaplicar terminal COMPLETED sobre todas as versões/filhos presentes no snapshot e verificar resíduos. Atualizar inventário de encerramento sem excluir metadata operacional necessária ao restore.
- [ ] GREEN: repetir testes e account closure purge/residuals. Commit `feat(matters): excluir definitivamente dados do caso`.

## Task 7 — API web, filtros e contratos públicos

**Files:** Criar `apps/api/src/matters/matter-lifecycle-routes.ts/.test.ts`; modificar `app.ts`, `apps/api/src/distribution/openapi.ts` e `apps/web/src/api-client.ts/.test.ts`.

**Interfaces:** `registerMatterLifecycleRoutes(app: FastifyInstance, dependencies): void` com dependências tipadas para autenticação existente, repositório lifecycle, serviço purge e auditoria. Cliente `transitionMatter(target, action, command): Promise<LifecycleResult>` e `purgeMatter(target, command): Promise<LifecycleResult>`, ambos sessão web.

- [ ] RED: `routeAuthorizationAndViewMatrix` cobre sessão/API key/OAuth, role, tenant, case/document mismatch, view inválida, UUID/corpo inválidos, stale409, purge fora da Lixeira e resposta sem conteúdo/no-store.
- [ ] Executar `pnpm exec vitest run apps/api/src/matters/matter-lifecycle-routes.test.ts apps/web/src/api-client.test.ts`; registrar falhas.
- [ ] Registrar POST `/api/v2/matters/:matterId/{archive,trash,restore,purge}` e equivalentes `/documents/:documentId/{action}` com schemas strict e revision obrigatória. Purge exige confirmação; pending journal mapeia erro recuperável com operationId, sem mensagem de sucesso final.
- [ ] Adaptar listas `view=active|archived|trash` (default active) e todos os leitores indiretos/URLs de versões, suporte, drafts e aprovações: histórico inativo exige sessão web; purgado404 sem conteúdo. API key/OAuth não recebem inativos por consulta explícita.
- [ ] Documentar operações como gratuitas e sem gestão MCP; GREEN nos testes de rotas, cliente e regressões MCP. Commit `feat(api): disponibilizar gestão de casos pela sessão web`.

## Task 8 — Interface discreta e proteção de trabalho não salvo

**Files:** Criar `apps/web/src/screens/matter-lifecycle/MatterLifecycleMenu.tsx`, `LifecycleConfirmation.tsx`, `lifecycle-model.ts/.test.ts`; modificar `MatterWorkspaceScreen.tsx`, `DraftStudioScreen.tsx`, painel `case-ai/CaseAiAccessPanel.tsx` e estilos existentes; criar `tests/e2e/matter-lifecycle.spec.ts` e `playwright.matter-lifecycle.config.ts` seguindo fixtures isoladas atuais.

**Interfaces:** `runLifecycleAction(action, target, savedRevision): Promise<void>` usa cliente da tarefa 7; `resolveUnsavedChanges(): Promise<'saved' | 'discarded' | 'cancelled'>` reaproveita fluxo de edição atual. Modelo `availableLifecycleActions(state, canManage, parentActive)` retorna ações permitidas; labels vêm das restrições globais.

- [ ] RED: `menuRespectsStateAndRole` testa ações por estado; E2E `saveFailureAndEscapePreserveBuffer` testa salvar/descartar/cancelar; `otherTabArchivePreservesTextAndDisablesWrite` testa conflito sem descarte nem overwrite.
- [ ] Executar Vitest do modelo e `pnpm exec playwright test --config playwright.matter-lifecycle.config.ts`; registrar falhas funcionais.
- [ ] Implementar menu no caso aberto e em cada documento, filtros e estados vazios; manter OPEN/CLOSED em Em uso. Arquivados/Lixeira exibem modo de leitura e restauração disponível conforme pai ativo. Nenhuma concessão IA reativada pela restauração. Sucessos usam exatamente `Arquivado`, `Enviado para a Lixeira`, `Restaurado` e `Excluído definitivamente`.
- [ ] Implementar diálogos: Excluir informa Lixeira e revogação IA; definitivo documento identifica alvo e explica limite das cópias anteriores; definitivo caso exige título exato e explica materiais associados removidos. Cancelar/Escape não envia requisição. Pending não mostra sucesso definitivo.
- [ ] Integrar resolução de buffers antes da transição; em stale atualizar estado/revisão sem perder texto local. Após sucesso atualizar filtros e seleção, tratar URL antiga e mostrar fonte indisponível no histórico com pendência de revisão.
- [ ] GREEN: suíte nova mais documentos/draft-review/case-ai; verificar foco, teclado, leitores de tela, contraste e viewport móvel com evidência visual. Commit `feat(web): organizar casos e documentos com arquivo e lixeira`.

## Task 9 — PostgreSQL, restore e CI

**Files:** Criar `scripts/smoke-matter-lifecycle-postgres.mjs`, `scripts/verify-matter-lifecycle-restore.mjs`; modificar `package.json`, `.github/workflows/ci.yml` e `docs/product/matter-lifecycle.md`.

**Interfaces consumidas:** tarefas 1–8. Scripts exigem banco/schema isolado e journal sintético independente; nunca aceitam alvo de produção como fixture padrão.

- [ ] RED: smoke PG testa ambas as ordens lifecycle versus write humano, aprovação, IA read e receipt/replay com duas conexões e barreiras nas transações reais; afirma linearização, revogação e ausência de efeitos financeiros. Testa migration duas vezes, defaults, isolamento, FKs e rollback.
- [ ] RED: restore cria snapshot anterior ao purge; purge document/case com journal externo; restaura snapshot e verifica APIs/SQL sem originais antes de servir. Simula PREPARED sem terminal, perda de âncora e terminal após commit falho; readiness false onde inconclusivo.
- [ ] Implementar scripts e comandos `test:postgres:matter-lifecycle` e `verify:matter-lifecycle-restore`; executar ambos com URL isolada. Se PG local indisponível, registrar limite e exigir execução real na CI; SQLite não substitui essa evidência.
- [ ] Adicionar scripts ao job postgres e nova suíte ao e2e-product; executar `pnpm lint`, `pnpm build`, `pnpm -r run typecheck`, `pnpm exec vitest run` e suites E2E afetadas. Zero falhas obrigatórias antes de encerrar implementação.
- [ ] Atualizar matriz de evidências por SHA/ambiente e inventário/limites de cópias e backups. Commit `test(matters): validar concorrência e restauração no PostgreSQL`.

## Task 10 — Revisão final e gates de integração/publicação

**Files:** Registro em `docs/product/matter-lifecycle-validation.md`, `STATUS_VALIDACAO.md` e evidências de publicação em `docs/operations/stabilization/2026-10-06-matter-lifecycle-publication.md` (data efetiva se posterior).

- [ ] Solicitar uma revisão independente da branch inteira contra especificação, plano e diff final; corrigir achados e repetir apenas verificações afetadas. Não iniciar agentes durante a redação/revisão deste plano.
- [ ] Conferir diff `main...HEAD`, escopo, ausência de dados privados e staged antes dos commits finais. Gates remotos dependem da autorização aplicável: não tratar aprovação da especificação como publicação já executada/autorizada.
- [ ] Com autorização de publicação, push/PR e anexação da PR; exigir CI verde no SHA proposto, integrar e exigir CI verde no SHA integrado. Sem contornar checks ou omitir falhas.
- [ ] Antes de migration remota, preparar backup, journal lifecycle/âncora independente e ensaio de restore; publicar candidata pelo SHA integrado e verificar digest/revisão/configuração/readiness antes da promoção de tráfego.
- [ ] Homologar navegador, ChatGPT e Claude com casos/documentos sintéticos: bloquear após archive/trash, restore sem auto grant, fontes antigas indisponíveis e revisão atual. Confirmar exclusão definitiva no momento da ação de navegador; nunca usar material real.
- [ ] Registrar tráfego/revisão promovida e evidências distintas de CI, PG, restore, UI e hosts; remover credenciais/concessões/fixtures sintéticas conforme permitido. Só declarar conclusão das etapas comprovadas.

## Revisão do plano e execução

Auto-revisão: contratos/estados/defaults (1–2), autorização/concorrência (2–3/7/9), leitores/IA/fontes/revisão (4/7), journal/purge/restore/retenção (5–6/9), UI/buffers (8), CI/revisão/entrega (9–10). Os cinco riscos do Review Focus têm testes nas tarefas indicadas. Interfaces posteriores usam os nomes definidos acima; não há refatoração geral nem exclusão por tenant como atalho.

Preservar execução nativa sequencial já escolhida nesta conversa: implementação nesta sessão, uma revisão independente da branch ao final. O plano foi aprovado e executado nesta conversa; as caixas acima preservam a especificação original. O estado final comprovado está no [registro de publicação e homologação](../../operations/stabilization/2026-10-06-matter-lifecycle-publication.md).
