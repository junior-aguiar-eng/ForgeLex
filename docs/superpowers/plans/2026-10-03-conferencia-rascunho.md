# Conferência e correção do rascunho — Implementation Plan

> Registro histórico preservado em 07/10/2026. Esta é a proposta original de
> 03/10, anterior à execução; checkboxes e estados abaixo refletem aquela data.
> As versões executadas e o estado atual estão em `origin/main` e em
> `CONTINUIDADE.md` no checkout atual. Este arquivo não é uma nova pendência.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conferir referências, vínculos e estrutura de uma versão salva, explicar os resultados e permitir corrigir sua origem sem perder o trabalho.

**Architecture:** estender os serviços e repositories atuais com execuções de revisão vinculadas à versão e ao hash. Reutilizar a verificação do acervo jurídico e os vínculos de fatos/provas. O frontend recebe resultados tipados e apresenta detalhes e correções em um painel contextual dentro de Rascunhos.

**Tech Stack:** TypeScript, Zod, Drizzle, SQLite/PostgreSQL, Fastify, React, Vitest e Playwright; nenhuma biblioteca nova prevista.

**Spec:** `docs/superpowers/specs/2026-10-03-revisao-contexto-ia-retorno-design.md`, aprovada por Boni em 03/10/2026. Este plano implementa exclusivamente a seção 3 e as regras transversais pertinentes; leitura do caso pela IA e retorno externo terão planos posteriores.

## Global Constraints

- “facilidade de uso, ambiente limpo e linguagem sem termos técnicos, preservando as ferramentas essenciais”.
- “A confirmação humana e o resultado automático são registros distintos.”
- “A interface deve dizer ‘Localizada no acervo’ quando esse for o caminho utilizado.”
- “Alterar a minuta cria nova versão com conferência pendente.”
- “Conferência humana pode ser feita pelo próprio autor.”
- Preservar exportação da versão salva e avisos no DOCX, inclusive com pendências.
- Sem novo servidor, provider de modelo, cobrança, mudança de cobertura dos tribunais, escrita em conta real ou publicação nesta execução local.
- Não alterar a branch P2 do checkout original. Na execução, usar checkout isolado baseado no estado integrado atual, preservando estes dois documentos.
- Commit, push, migration remota e publicação exigem autorização aplicável à ação. Os passos de commit abaixo só são executados quando autorizados.

## Review Focus

1. IDs válidos de outro caso ou conta: nenhuma fonte, fato, prova ou resultado pode ser resolvido fora do contexto autenticado (Tasks 1–3).
2. Nova versão durante uma consulta lenta: conclusão pertence à versão inicialmente capturada e não revisa/aprova a nova (Tasks 2–3).
3. Reexecução concorrente e resultado fora de ordem: preservar histórico e ordenar tentativas pela abertura, sem trocar o resultado vigente pelo término de uma tentativa antiga (Tasks 1–3).
4. Fonte indisponível, tribunal não suportado ou revisão incompleta: não transformar falha em ausência de julgado, passagem ou aprovação (Tasks 2–3).
5. Edição não salva e detalhes extensos em celular/teclado: abrir fonte ou corrigir vínculo preserva o formulário e o foco (Tasks 4–5).

## Contratos compartilhados

Criar `packages/domain/src/contracts/draft-review.ts` e exportar pelo index.
Usar schemas Zod como fonte dos tipos e dos contratos REST.

```ts
type DraftReviewMode = 'ALL' | 'CITATION' | 'FACT_SUPPORT' | 'STRUCTURE';
type DraftReviewRunState = 'RUNNING' | 'COMPLETE' | 'INCOMPLETE';
type DraftReviewResultStatus = 'PASSED' | 'WARNINGS' | 'BLOCKED' | 'INCOMPLETE';
type DraftReviewCheckState = 'CONFIRMED' | 'ATTENTION' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

interface DraftReviewCheck {
  kind: 'CITATION' | 'FACT_SUPPORT' | 'STRUCTURE';
  state: DraftReviewCheckState;
  code: string;
  message: string;
  sectionId?: string;
  targetType?: 'AUTHORITY' | 'FACT' | 'EVIDENCE';
  targetId?: string;
  humanConfirmed?: boolean;
  checkedAt: string;
  source?: {
    providerId?: string;
    sourceUrl?: string;
    capturedAt?: string;
    contentHash?: string;
    method: 'PERSISTED_CORPUS' | 'PROVIDER';
  };
}

interface DraftReviewRun {
  id: string;
  tenantId: string;
  matterId: string;
  draftId: string;
  draftVersionId: string;
  contentHash: string;
  contextHash: string; // fontes e relações do caso examinadas
  runNumber: number; // crescente por versão, atribuído na abertura
  mode: DraftReviewMode;
  state: DraftReviewRunState;
  status: DraftReviewResultStatus;
  startedBy: string;
  startedAt: string;
  completedAt?: string;
  checks: DraftReviewCheck[];
  blockingCount: number;
  warningCount: number;
}

interface DraftReviewResult {
  draftId: string;
  draftVersionId: string;
  run: DraftReviewRun;
  findings: DraftReviewFinding[];
  blockingCount: number;
  warningCount: number;
  status: DraftReviewResultStatus;
}
```

Estender `DraftReviewFindingSchema` com `reviewRunId?: string`, mantendo os
achados legados legíveis. Preservar os tipos existentes de revisão no storage;
`STRUCTURE` pode mapear para `ADVERSARIAL` nos achados legados, sem esse termo
na interface. `verified` nas citações representa exclusivamente a conferência
humana legada; nenhum processo automático altera esse booleano.

`DraftDetails` mantém os campos atuais e acrescenta `latestReviewRun?` e
`currentReviewRun?`. O primeiro é a tentativa ALL mais recente da versão;
o segundo é a última tentativa ALL completa. `reviewFindings` contém somente
os achados de `currentReviewRun`. Achados sem execução ficam no histórico,
sem converter a versão em automaticamente conferida.

## Mapa de arquivos

| Unidade | Arquivos principais |
| --- | --- |
| Execuções e resultados | `domain/src/contracts/draft-review.ts`, `drafting.ts`, `persistence/src/schema/schema.ts`, `migrations/migration-runner.ts`, `repositories/draft-review-run-repository.ts` |
| Verificação | `legal-tools/src/review/review-service.ts`, `review-tools.ts`, `drafting-review.test.ts` |
| Aprovação e REST | `legal-tools/src/drafting/draft-service.ts`, `persistence/src/repositories/draft-repository.ts`, `apps/api/src/app.ts`, `distribution/openapi.ts` |
| Experiência | `apps/web/src/screens/DraftStudioScreen.tsx`, `screens/draft-review/review-model.ts`, `ReviewPanel.tsx`, `SourcePanel.tsx` |
| Regressão e operação | `tests/e2e/draft-review.spec.ts`, `playwright.draft-review.config.ts`, `scripts/smoke-postgres.mjs`, documentação e purge de conta |

Os caminhos abreviados da tabela pertencem a `packages/`, exceto os indicados
com `apps/`, `tests/`, `scripts/` ou a configuração na raiz.

## Task 1 — Persistir execuções vinculadas à versão

**Files:** criar o contrato acima e
`packages/persistence/src/repositories/draft-review-run-repository.ts`,
`packages/persistence/src/repositories/draft-review-run-repository.test.ts`;
modificar os indexes de domain/persistence, contrato `drafting.ts`,
`schema/schema.ts`, `migrations/migration-runner.ts`,
`repositories/draft-repository.ts`, `migrations/migration-idempotency.test.ts`,
`apps/api/src/account/account-closure-purge-service.ts` e seu teste existente.

**Interfaces:** `new DraftReviewRunRepository(db: ForgeLexDatabase)`;
`start(context: DraftContext, version: DraftVersion, mode: DraftReviewMode, contextHash: string): Promise<DraftReviewRun>`;
`finish(context: DraftContext, runId: string, result: { state: 'COMPLETE' | 'INCOMPLETE'; status: DraftReviewResultStatus; checks: DraftReviewCheck[]; findings: Omit<DraftReviewFinding, 'id' | 'createdAt' | 'reviewRunId'>[] }): Promise<DraftReviewResult>`;
`list(context: DraftContext, draftId: string, versionId: string): Promise<DraftReviewRun[]>`;
`getLatest(context: DraftContext, draftId: string, versionId: string, completeOnly?: boolean): Promise<DraftReviewRun | undefined>`.
`getLatest` considera ALL e ordena `runNumber` decrescente.

- [ ] Escrever testes `run_is_scoped_to_version_and_tenant`,
  `completion_and_findings_are_atomic`, `empty_complete_run_is_persisted`,
  `opening_order_wins_over_completion_order` e `legacy_findings_remain_history`.
  Assertivas: consulta de outra conta não retorna resultado; duas tentativas
  têm números distintos; a tentativa 2 continua mais recente se 1 terminar
  depois; rollback não grava resultado completo com achados parciais;
  execução sem achados ainda existe com estado COMPLETE.
- [ ] Executar `pnpm exec vitest run packages/persistence/src/repositories/draft-review-run-repository.test.ts`; confirmar falha pelas interfaces ausentes.
- [ ] Implementar tabela `draft_review_runs` com os campos do contrato
  (checks em JSON); coluna nullable `review_run_id` e índice nos achados.
  Adicionar migration `persistence-0025-draft-review-runs` somente se 0025
  ainda estiver livre na base da execução; caso ocupado, usar próximo número.
  Nunca alterar migrations já aplicadas ou certificar o legado como revisado.
- [ ] Implementar abertura com número único por versão e conclusão atômica
  de resultados/achados. Não manter transação durante consulta de fonte.
  Numeração concorrente deve usar operação atômica ou retry limitado de
  conflito de unicidade, sem reaplicar uma conclusão já terminal.
- [ ] Incluir a tabela nova na categoria MATTERS do purge, removendo achados
  antes das execuções e estas antes das versões; testar isolamento e retenção.
- [ ] Rodar testes novos, migration-idempotency e purge; todos aprovados.
- [ ] Se autorizado, revisar/stagear apenas esta unidade e commitar.

## Task 2 — Conferir referências e vínculos com resultado explicável

**Files:** modificar `packages/legal-tools/src/review/review-service.ts`,
`review-tools.ts`, `drafting-review.test.ts`; criar
`review/review-service.test.ts` e `review/review-context.ts`. Reutilizar `ResearchService`,
`MatterAuthorityRepository`, `FactsEvidenceService`, `FactsEvidenceRepository`
e `MatterRepository` sem outro provider.

**Interfaces:** injetar em `DraftReviewService` as dependências
`{ drafts: DraftRepository; runs: DraftReviewRunRepository; facts: FactsEvidenceService; authorities: MatterAuthorityRepository; research: ResearchService; evidence: FactsEvidenceRepository; matters: MatterRepository; sourceMethod: 'PERSISTED_CORPUS' | 'PROVIDER' }`.
Preservar nomes públicos `verifyCitations`, `checkFactSupport`,
`adversarialReview`, `runAll(context, draftId, versionId?)`, retornando
`Promise<DraftReviewResult>`. `runAll` fixa uma única versão antes de consultar
fontes, abre uma execução ALL e usa coletores internos sem persistências
independentes. Métodos isolados abrem sua execução específica.
`reviewContextHash(snapshot: { authorities: SavedAuthority[]; facts: Fact[];
supports: FactSupport[]; evidence: EvidenceItem[]; anchors: DocumentAnchor[] }): string`
em `review-context.ts` calcula SHA-256 de JSON canônico, ordenando entidades
e relações por seus IDs. Incluir somente recursos referenciados e seus
conteúdos/relações, não horários da execução ou itens sem relação com a minuta.

- [ ] Escrever `manual_confirmation_does_not_confirm_authority`,
  `automatic_confirmation_preserves_manual_flag`,
  `registered_reference_outside_matter_is_blocked`,
  `source_failure_is_not_not_found`, `version_is_fixed_before_slow_lookup`.
  Assertivas: marca humana true + NOT_FOUND nunca produz CONFIRMED;
  marca false + VERIFIED_OFFICIAL pode confirmar a localização sem alterar
  o booleano; ID de outro caso não expõe seus dados; erro de fonte produz
  INCOMPLETE/UNAVAILABLE; versão 2 criada durante consulta não recebe o run da 1.
- [ ] Rodar `pnpm exec vitest run packages/legal-tools/src/review/review-service.test.ts`; confirmar falhas de comportamento.
- [ ] Resolver referências a partir dos IDs salvos no caso autenticado,
  não diretamente de UUIDs do acervo global. Conferir também IDs vinculados
  às seções que não tenham âncoras de citação. Verificar pertencimento dos
  fatos/provas e dos trechos/documentos envolvidos na cobertura.
- [ ] Para cada julgado registrado, usar `research.verifyAuthority` com
  tribunal, processo e data salvos. Deduplicar consultas da mesma referência
  na execução; limitar concorrência a 4 e espera por consulta a 15 segundos.
  Nunca usar fixture como fallback em produção.
- [ ] Mapear VERIFIED_OFFICIAL/VERIFIED_PROVIDER para localização CONFIRMED;
  CONFLICTING_METADATA/NOT_FOUND/UNVERIFIED para ATTENTION e WARNING;
  tribunal fora da cobertura para ATTENTION com explicação de alcance;
  indisponibilidade/timeout para UNAVAILABLE e execução INCOMPLETE.
  Fonte/target inexistente no caso e referência sem vínculo são BLOCKING.
  Sem referências registradas, registrar WARNING de alcance, sem afirmar
  que detectou todas as citações existentes no texto livre.
- [ ] Manter cobertura PARTIAL como WARNING e UNSUPPORTED/CONFLICTING como
  BLOCKING, conforme o comportamento existente, sempre explicando que são
  relações cadastradas. Conferir estrutura com regras existentes e mensagens
  específicas; não prometer análise semântica ou confirmação de citação literal.
- [ ] Persistir resumo, checks positivos e achados por execução da Task 1;
  falha de qualquer coletor gera INCOMPLETE, sem sucesso automático.
  Capturar o contexto relevante antes das consultas e comparar seu hash antes
  de concluir. Reutilizar esse cálculo na aprovação da Task 3. Acrescentar
  `support_change_invalidates_context_snapshot`: alterar suporte muda o hash
  e exige nova conferência; reordenar relações iguais preserva o hash; mudança
  durante a consulta torna o run INCOMPLETE.
  Atualizar `createReviewTools` para receber o serviço configurado e atualizar
  seus chamadores, preservando nomes internos das ferramentas.
- [ ] Rodar testes novos e `drafting-review.test.ts`; todos aprovados.
- [ ] Se autorizado, commitar esta unidade após revisar o diff.

## Task 3 — Integrar REST, histórico e aprovação da versão correta

**Files:** modificar `apps/api/src/app.ts`, `distribution/openapi.ts`,
`packages/legal-tools/src/drafting/draft-service.ts`,
`packages/persistence/src/repositories/draft-repository.ts`,
`apps/api/src/app.test.ts`, `packages/persistence/src/repositories/draft-approval.test.ts`;
criar `apps/api/src/review/draft-review-routes.test.ts`.

**Interfaces:** `DraftingService(repository: DraftRepository, runs: DraftReviewRunRepository)`;
`getDraft` retorna `DraftDetails` estendido definido acima.
Preservar POST `.../drafts/:draftId/review` e seus campos `type`, `versionId`.
Adicionar GET `.../drafts/:draftId/review-runs?versionId=<UUID>` retornando
`{ items: DraftReviewRun[] }` em ordem decrescente. Adicionar GET
`.../facts/:factId/support` retornando `FactSupport` pelo serviço existente.
Leituras usam `matter:read`; persistência de revisão requer `draft:write`.

- [ ] Escrever `review_requires_write_scope`, `history_does_not_cross_tenant`,
  `approval_requires_complete_all_run_for_exact_version`,
  `latest_incomplete_attempt_blocks_approval` e
  `obsolete_run_does_not_replace_current_findings`.
  Assertivas: 403 para credencial só de leitura na execução;
  404 para caso alheio; aprovação 409 sem execução ALL completa/hash correto;
  tentativa recente INCOMPLETE impede aprovação mesmo com run antigo PASSED;
  GET do rascunho retorna achados de uma única execução/versão.
- [ ] Rodar `pnpm exec vitest run apps/api/src/review/draft-review-routes.test.ts packages/persistence/src/repositories/draft-approval.test.ts` e confirmar falhas esperadas.
- [ ] Compor serviço de revisão com o ResearchService real em `buildApp`;
  validar corpos/query por schemas. Não ampliar o MCP externo nesta frente.
  Preservar resposta principal `status`, contagens, IDs e findings; campos
  novos são aditivos, exceto o estado explícito INCOMPLETE necessário.
- [ ] Aprovação exige tentativa ALL vigente COMPLETE, hash da versão correto,
  contexto do caso ainda correspondente ao contextHash e ausência de BLOCKING.
  Suporte ou referência alterados exigem nova conferência mesmo sem mudança
  do texto. WARNINGS seguem para decisão humana; nenhuma
  tentativa RUNNING/INCOMPLETE herda aprovação anterior. Fazer checagem e
  criação do pedido atomicamente no repository; revalidar essa condição na
  resolução APPROVED, sem impedir a aprovação de versão histórica válida.
  Testar `changed_support_requires_new_review`: após alterar um vínculo,
  o mesmo run não permite aprovação até que se execute nova conferência.
  Preservar aprovações já decididas e teste de vínculo versão/documento.
- [ ] Atualizar documentação de escopos e schemas OpenAPI. Auditoria/webhook
  registram runId/versão/estado sem texto integral; INCOMPLETE não emite
  conclusão bem-sucedida como se todos os checks tivessem terminado.
- [ ] Atualizar fixtures de API/workflows afetadas para executar a revisão
  configurada antes de solicitar aprovação; não fabricar runs para mascarar
  regressões. Verificar todos os `new DraftingService`/`DraftReviewService`.
- [ ] Rodar testes focados e regressões de aprovação; todos aprovados.
- [ ] Se autorizado, commitar esta unidade.

## Task 4 — Apresentar e corrigir os pontos dentro de Rascunhos

**Files:** modificar `apps/web/src/screens/DraftStudioScreen.tsx`; criar
`screens/draft-review/review-model.ts`, `review-model.test.ts`,
`ReviewPanel.tsx`, `SourcePanel.tsx`.

**Interfaces:** `reviewSummary(run?: DraftReviewRun): string`;
`reviewCheckLabel(check: DraftReviewCheck): string`;
`ReviewPanel({ latestRun?, currentRun?, findings, onOpenPoint, onOpenHistory })`;
`SourcePanel({ point, onClose, onLinked, disabled })`.
Definir `ReviewPoint = { check: DraftReviewCheck; finding?: DraftReviewFinding }`
em `review-model.ts`. SourcePanel recebe o contexto autenticado pela camada
de Rascunhos; não resolve fontes a partir de tenant fornecido por dados do check.

- [ ] Testar labels sem códigos internos: undefined -> “Conferência pendente”;
  INCOMPLETE -> “Não foi possível concluir a conferência”; COMPLETE sem
  atenção -> “Conferência concluída”; NOT_FOUND -> “Não localizada no acervo”.
  `humanConfirmed` e confirmação automática têm labels separados.
- [ ] Rodar `pnpm exec vitest run apps/web/src/screens/draft-review/review-model.test.ts`; confirmar falhas antes de implementar o modelo.
- [ ] Trocar rótulos do fluxo para Referências/Julgados/Conferir estrutura.
  Manter “Salvar nova versão” como ação principal durante edição;
  “Conferir rascunho” em versão salva; DOCX/histórico/aprovação ficam acessíveis
  como ações secundárias, sem adicionar um dashboard.
- [ ] Calcular alterações não salvas comparando o payload normalizado ao
  conteúdo carregado/salvo. “Salvar e conferir” usa a versão retornada pelo
  salvamento; falha ao salvar impede revisão e mantém os campos.
  Respostas antigas são ignoradas ao mudar caso/rascunho. Atualizar resultados
  sem chamar uma rotina que recarregue e sobrescreva o formulário editado.
- [ ] Abrir painel contextual com seção, fonte, data de consulta e alcance;
  carregar apenas referências do caso selecionado. Permitir vincular prova
  pelo POST de suporte existente e inspecionar documento/trechos pelo GET
  existente. Guardar o formulário da minuta; após alterar suporte, marcar
  “Confira novamente para atualizar o resultado”, sem certificar resultado antigo.
- [ ] Após nova versão, exibir conferência pendente. Histórico apresenta
  execuções de cada versão separadamente; nunca mistura os achados.
  Não alterar edição, aparência ou download da minuta ao selecionar apenas
  uma execução histórica. Preservar exportação existente da versão salva.
- [ ] Painel tem título, fechamento explícito, foco inicial e retorno do
  foco ao acionador; ESC fecha sem descartar o formulário. Não mostrar IDs,
  JSON ou hashes no fluxo jurídico. Sem fonte disponível, mensagem e caminho
  de correção substituem botão inoperante.
- [ ] Rodar teste do modelo e typecheck web; validar comportamento integrado
  no navegador na Task 5 antes de concluir esta unidade.
- [ ] Se autorizado, commitar após a validação integrada da Task 5.

## Task 5 — Validar a entrega integrada e documentar limites

**Files:** criar `tests/e2e/draft-review.spec.ts`,
`playwright.draft-review.config.ts`, `docs/product/draft-review.md`;
modificar `package.json`, `scripts/smoke-postgres.mjs`,
`tests/e2e/phase-7.spec.ts` se o fluxo de aprovação exigir e
`STATUS_VALIDACAO.md`. Reutilizar servidor local e Auth descartáveis de
`playwright.documents.config.ts`, sem conta de nuvem ou modelo pago.

**Interfaces:** adicionar script `test:e2e:draft-review` ->
`playwright test --config playwright.draft-review.config.ts`.
O smoke PostgreSQL existente exercita migração, run, reexecução e aprovação
em tenant descartável, e remove findings/runs antes de versões no cleanup.

- [ ] Escrever E2E: criar minuta, conferir, abrir fonte, vincular prova,
  conferir novamente sem duplicação, salvar versão nova e verificar pendência.
  Assertivas pela API e tela devem apontar a mesma versão/run; reload mantém
  estado persistido. Usar referência conhecida do acervo de teste para a
  verificação real do serviço, sem interceptar tudo com respostas verdes.
- [ ] Escrever E2E `editing_survives_review_and_source_panel`: editar durante
  consulta retardada, abrir/fechar fonte por teclado e verificar o mesmo
  texto não salvo. `save_failure_preserves_form` confirma ausência de revisão
  da edição que não foi salva. `history_keeps_versions_separate` confirma
  que abrir histórico não modifica o formulário ou a exportação atual.
- [ ] Executar E2E em 390/1280 px, fonte longa, Axe no painel e rascunho,
  teclado/ESC/foco e ausência de overflow. Inspecionar capturas; falhas de
  acessibilidade e perda de conteúdo são defeitos da entrega.
- [ ] Rodar `pnpm test`, `pnpm lint`, `pnpm -r run typecheck`,
  `pnpm test:e2e:draft-review` e `pnpm test:e2e:documents`. Rodar a regressão
  de produto afetada pelo fluxo de aprovação. Não repetir checks já verdes
  sem alteração, falha ou incerteza nova.
- [ ] Rodar `pnpm test:postgres` somente com PostgreSQL de teste isolado
  identificado. Não usar banco produtivo/homologação por configuração ambiente.
  Se runtime local não estiver disponível, registrar o limite e exigir o
  check PostgreSQL em CI antes da integração; não declarar suporte verificado.
- [ ] Documentar verificação restrita a referências cadastradas/metadados,
  consulta ao acervo, distinção humana/automática, estados e compatibilidade
  do legado. Registrar resultados efetivamente executados, checkout e SHA.
- [ ] Revisar diff final contra o desenho e os cinco riscos do Review Focus.
  Commit/push/CI/migration remota/publicação continuam etapas separadas.
- [ ] Se autorizado, commitar testes/documentação e encerrar a entrega local.

## Auto-revisão do plano

Cobertura: fonte e conferência humana (Task 2), versão/hash/execução (1–3),
aprovação (3), correção contextual e preservação do formulário (4–5),
DOCX e acessibilidade (5). Retenção da tabela nova está na Task 1; PostgreSQL
e cleanup estão na Task 5. As frentes 2 e 3 não estão antecipadas no código.

Esta é a proposta de implementação para revisão. Nenhum passo foi executado
e nenhum resultado de teste está afirmado neste documento.
