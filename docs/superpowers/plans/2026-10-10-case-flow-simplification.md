# Plano de implementação: simplificação do ciclo documental

> Para execução: usar `superpowers:executing-plans`, tarefa por tarefa. Execução proposta no mesmo chat; nenhuma avaliação humana adicional a Boni. Revisão automatizada é apoio facultativo, não gate de terceiro.

**Objetivo:** reduzir cliques mecânicos, botões simultâneos e perda de contexto no ciclo documental, mantendo fontes, permissões, versões, revisão e decisão explícita.

**Arquitetura:** evoluir telas React existentes com ações derivadas do estado, navegação contextual e painéis progressivos. Manter APIs existentes e adicionar recuperação autenticada de token de aprovação pendente. Reaproveitar leitor, editor e validações de domínio.

**Stack:** React 18, TypeScript, Vite, Tailwind, Fastify, repositórios existentes SQLite/PostgreSQL, Vitest e Playwright. Nenhuma nova biblioteca prevista.

**Especificação:** [design do fluxo](../specs/2026-10-10-case-flow-simplification-design.md).

**Estado:** aprovado por Boni em 10/10/2026; implementado localmente sobre `101ee33`, branch `codex/case-flow-simplification`. Validação final e evidências em [registro operacional](../../operations/stabilization/2026-10-10-case-flow-simplification.md). Sem commit/push/deploy deste incremento.

Os checklists abaixo conservam o roteiro original; o registro operacional discrimina a execução, as verificações e os limites de medição, sem marcar retroativamente etapas de teste prévio que não foram executadas.

## Restrições globais

- Boni é o único avaliador e aprovador humano, conforme `AGENTS.md`.
- Nenhuma permissão de escrita começa marcada automaticamente.
- Uma ação primária destacada por área de trabalho/estado; no máximo duas secundárias na barra principal, sem contar navegação, cancelamento e ações da proposta/seção ativa.
- Sem autosave neste incremento.
- Localização de trecho não equivale a veracidade, suficiência ou pertinência jurídica.
- Edição não salva nunca entra silenciosamente no DOCX.
- Sem troca de provedor, novas bibliotecas de UI, redesign global ou geração interna de IA.
- Nenhuma aprovação por MCP; confirmação pelo usuário autenticado em sessão.

## Condições prioritárias de revisão

1. Recarga/falha após emissão do token: retomar a mesma versão, invalidando token anterior, sem recriar texto — tarefa 1.
2. Versão/contexto alterados em outra aba: preservar edição e impedir aprovação desatualizada — tarefas 1 e 5.
3. Fonte excluída ou autorização revogada: mostrar indisponibilidade, parar espera, manter bloqueios e não confirmar item — tarefas 3 e 4.
4. Seleção de prova com fato pendente/descartado: explicar dependência, sem incorporação silenciosa — tarefa 4.
5. Retorno de IA durante edição e teclado/mobile: não substituir texto, perder foco ou esconder controles essenciais — tarefas 2 a 6.

## Tarefa 1 — concluir e recuperar aprovação pelo editor

**Arquivos:** modificar `apps/web/src/screens/DraftStudioScreen.tsx`, `apps/web/src/screens/DashboardScreen.tsx`, `apps/web/src/operations/operations-client.ts`, `apps/web/src/operations/contracts.ts`, `apps/api/src/app.ts`, `apps/api/src/review/review-queue-service.ts`, `apps/api/src/distribution/openapi.ts`, `packages/legal-tools/src/drafting/draft-service.ts`, `packages/persistence/src/repositories/draft-repository.ts`; testar `packages/persistence/src/repositories/draft-approval.test.ts`, `apps/api/src/review/draft-review-routes.test.ts`, `apps/web/src/operations/operations-client.test.ts`, `tests/e2e/draft-review.spec.ts`.

**Interfaces:** conservar POST `/api/v2/matters/:matterId/drafts/:draftId/approval` e POST `/api/v2/draft-approvals/resolve`. Criar POST `/api/v2/matters/:matterId/drafts/:draftId/approval/:requestId/reissue`, somente sessão com `draft:write`, corpo `{versionId:string}`, resposta `{request,token}` igual ao formato de emissão existente. Identificar a versão pendente na fila; tokens permanecem efêmeros.

- [ ] Testar recarga com solicitação pendente, rotação de token, token antigo inválido, duplo clique/concorrência, outro tenant, OAuth proibido, caso arquivado e revisão/contexto desatualizados. A solicitação e versão permanecem as mesmas; somente uma resolução prevalece.
- [ ] Executar os testes antes da alteração e confirmar falha dos cenários novos com `pnpm exec vitest run packages/persistence/src/repositories/draft-approval.test.ts apps/api/src/review/draft-review-routes.test.ts apps/web/src/operations/operations-client.test.ts`.
- [ ] Implementar confirmação no editor; consumir token somente após confirmação. Reemissão rotaciona hash de token não utilizado da solicitação pendente dentro da transação de escrita e registra auditoria, sem armazenar token bruto. Revalidar controles existentes de aprovação também na recuperação; solicitação finalizada não reabre.
- [ ] Na fila, DRAFT oferece Abrir para aprovar com contexto/versão; memo continua usando `resolveReview`. Remover o caminho que promete aprovação direta e lança `APPROVAL_TOKEN_REQUIRED`.
- [ ] Rodar testes focados e `pnpm test:e2e:draft-review`. E2E emite e resolve através de cliques, recarrega entre emissão/resolução e conclui sem chamada REST de aprovação pelo teste. Confirmar aprovação de vN não aprova vN+1.
- [ ] Registrar resultado/limites; preparar commit atômico, executando commit/push somente no escopo autorizado.

## Tarefa 2 — conservar contexto entre etapas e URLs

**Arquivos:** modificar `apps/web/src/context/AppContext.tsx`, `apps/web/src/navigation/routes.ts`, `apps/web/src/screens/MatterWorkspaceScreen.tsx`, `apps/web/src/screens/DraftStudioScreen.tsx`, `apps/web/src/screens/DashboardScreen.tsx`; criar `apps/web/src/components/CaseFlowHeader.tsx`; testar `apps/web/src/context/AppContext.test.ts`, `apps/web/src/navigation/routes.test.ts`, `tests/e2e/case-ai-access.spec.ts`.

**Interfaces:** estender `setActiveTab(tab, mode?, context?: {matterId?:string; draftId?:string; analysisId?:string; versionId?:string}):void`; `CaseFlowHeader` recebe `{matterId, activeStep:'DOCUMENTS'|'REVIEW'|'TEXT', pendingCount, onStepChange}`. Casos continuam aceitando `caso`; rascunhos continuam aceitando `matterId`/`draftId`. Parâmetros não concedem acesso.

- [ ] Testar caso A → rascunho A, retorno ao caso A, deep link, voltar/avançar e identificador inexistente/sem permissão. Proteger mudanças de rota com edição não salva antes de desmontar telas.
- [ ] Rodar testes de contexto/navegação para confirmar os cenários novos falhando; implementar extensão compatível e cabeçalho, sem substituir todas as telas por novo workspace.
- [ ] Executar testes focados e `pnpm test:e2e:case-ai`; verificar que navegar nunca seleciona outro caso por coincidência de posição na lista.
- [ ] Registrar evidência e preparar commit atômico conforme autorização.

## Tarefa 3 — preparar análise com menos controles e espera explícita

**Arquivos:** modificar `apps/web/src/screens/case-ai/CaseAiAccessPanel.tsx`, `apps/web/src/screens/case-ai/case-ai-model.ts`, `apps/web/src/screens/case-ai/CaseAnalysisPanel.tsx`, `apps/web/src/screens/draft-ai/ReceivedDraftPanel.tsx`; criar `apps/web/src/screens/case-ai/use-case-result-refresh.ts`; testar `apps/web/src/screens/case-ai/case-ai-model.test.ts`, criar `apps/web/src/screens/case-ai/use-case-result-refresh.test.ts`, ampliar `tests/e2e/case-ai-access.spec.ts`.

**Interfaces:** manter `Grant`, seleção e permissões atuais. Hook `useCaseResultRefresh({enabled:boolean, scopeKey:string, refresh:()=>Promise<void>}):{waiting:boolean, paused:boolean, retry:()=>void}`; atualização em foco e espera de 30 s somente visível por até 10 min. `refresh` atualiza listagem/contadores, não o formulário em edição.

- [ ] Testar seleção alterada invalidando prévia, preview paginado incompleto bloqueando autorização, permissões independentes desmarcadas, conexão revogada e clipboard recusado depois da concessão. Retry de cópia não emite nova permissão.
- [ ] Testar hook com relógio controlado: ocultar/voltar, desmontar/trocar caso, revogar, timeout de 10 min e erro de acesso; não criar timers duplicados ou loop de erro.
- [ ] Implementar prévia automática após seleção, resumo explícito e Autorizar e copiar instrução. Persistir sucesso da concessão independentemente do clipboard. Revisar o texto de espera para reconhecer host externo.
- [ ] Substituir atualizações repetidas por recarga de listagem em foco/espera e retry contextual; não atualizar o review aberto nem texto recebido já em edição.
- [ ] Rodar `pnpm exec vitest run apps/web/src/screens/case-ai` e `pnpm test:e2e:case-ai`; confirmar que chamadas de atualização não acionam pesquisa faturável.
- [ ] Registrar evidência e preparar commit atômico conforme autorização.

## Tarefa 4 — conferir e incorporar sem repetir seleção e cadastro

**Arquivos:** modificar `apps/web/src/screens/MatterWorkspaceScreen.tsx`, `apps/web/src/screens/case-ai/CaseAnalysisPanel.tsx`; ampliar `tests/e2e/case-ai-access.spec.ts`; regressão em `apps/api/src/case-context/case-analysis-routes.test.ts` e `packages/persistence/src/repositories/case-analysis-repository.test.ts` sem alterar contratos de adoção.

**Interfaces:** conservar `POST .../analyses/:id/decisions` com `expectedRevision`, lote atômico e decisão explícita. `onSource(DocumentSource)` continua abrindo a fonte exata; `onChanged():Promise<void>` atualiza entidades do caso. Usar contexto da tarefa 2 para saída ao texto.

- [ ] Escrever E2E: incorporar um item em um clique de decisão; editar outro sem perder texto ao abrir fonte; descartar inferência; prova exige seleção explícita do fato pendente; conflito mantém seleção/edição; fonte excluída bloqueia incorporação.
- [ ] Confirmar falhas esperadas nos novos comportamentos de UI; implementar leitura por padrão, edição localizada, ações no item e barra de lote somente quando houver seleção.
- [ ] Recolher formulários de cadastro manual por conjunto; manter contagem/listagem, classificação, trecho e origem visíveis. Conferidos e histórico permanecem acessíveis.
- [ ] Rodar `pnpm test:e2e:case-ai` e testes de adoção acima; verificar duas alegações contrapostas e lacuna preservadas, sem promoção automática a fato confirmado.
- [ ] Registrar evidência e preparar commit atômico conforme autorização.

## Tarefa 5 — centralizar edição, vínculos e pendências

**Arquivos:** modificar `apps/web/src/screens/DraftStudioScreen.tsx`, `apps/web/src/screens/draft-review/ReviewPanel.tsx`, `apps/web/src/screens/draft-review/review-model.ts`, `apps/web/src/screens/draft-ai/ReceivedDraftPanel.tsx`; criar `apps/web/src/screens/draft-review/draft-action-model.ts` e seu teste; ampliar `apps/web/src/screens/draft-review/review-model.test.ts`, `tests/e2e/draft-review.spec.ts`, `tests/e2e/case-ai-access.spec.ts`.

**Interfaces:** `getDraftPrimaryAction({exists:boolean, dirty:boolean, stale:boolean, reviewState:string|undefined, blockingCount:number, approvalStatus:string, readOnly:boolean}):'CREATE'|'SAVE_REVIEW'|'REVIEW'|'APPROVE'|'DOWNLOAD'|null`. Somente estado confirmado autoriza ação; falha/incompleto não equivalem a COMPLETE. Reutilizar `saveAndReview`, fonte `DocumentSource` e aprovação da tarefa 1.

- [ ] Testar política de ações e E2E: edição suja → Salvar e conferir; salva/revisão falha → repetir só conferência; bloqueio/contexto antigo → sem aprovação; aprovada → baixar vN; edição posterior → novo ciclo.
- [ ] Testar agrupamento de revisão: avisos e bloqueios primeiro; confirmações recolhidas com contagens e destinos individuais; não deduplicar achados distintos apenas por texto igual.
- [ ] Implementar barra principal por estado; acesso contextual a salvar sem conferir/download de minuta; vínculos e teses em painéis nomeados da seção ativa. Preservar arrays de vínculos/citações/fontes documentais em payloads e ordinais em versões.
- [ ] Testar chegada de texto de IA durante edição local: somente notificação, adoção explícita, controle de versão e escolha de preservar edição mantidos. Sem vincular automaticamente todos os fatos a todas as seções.
- [ ] Rodar testes de modelos e `pnpm test:e2e:draft-review`, `pnpm test:e2e:case-ai`, `pnpm test:e2e:document-reader`; exportar a versão salva correta, preservando avisos.
- [ ] Registrar evidência e preparar commit atômico conforme autorização.

## Tarefa 6 — comprovar simplificação e documentar limites

**Arquivos:** ampliar `tests/e2e/accessibility.spec.ts`; criar `tests/e2e/case-flow.spec.ts` e `playwright.case-flow.config.ts` seguindo configurações existentes e servidor sintético; atualizar `docs/product/case-document-analysis.md`, `STATUS_VALIDACAO.md`, `CONTINUIDADE.md`; criar `docs/operations/stabilization/2026-10-10-case-flow-simplification.md` para evidências quando houver implementação.

**Interfaces:** roteiro sintético igual ao demonstrado: contrato, pagamento alegado sem recibo, negativa da contraparte; oito propostas, sete incorporadas e uma descartada; rascunho com fontes, edição, revisão, aprovação e download. Fixture MCP pode entregar análise/texto; nenhum atalho de aprovação por API no E2E.

- [ ] Usar o baseline coletado na preparação anterior à tarefa 1: cliques mecânicos, mudanças de tela e botões simultâneos para conexão configurada e primeira conexão. Tempo externo do host e decisões sobre propostas separados.
- [ ] Repetir o roteiro na prévia após tarefas 1–5, com screenshots desktop/mobile e teclado, recuperação após recarga, conflito entre abas, revogação e contexto alterado. Verificar focos, nomes acessíveis e preservação de textos.
- [ ] Verificar metas: pelo menos 40% menos cliques mecânicos e 50% menos botões simultâneos na visão inicial do editor; aprovação sem sair para a fila. Registrar contagens antes/depois; não alegar ganho de tempo medido só por reduzir cliques.
- [ ] Executar `pnpm test`, `pnpm typecheck`, `pnpm lint`, suites E2E afetadas e configuração do ciclo. Havendo mudança de recuperação transacional, também `pnpm test:postgres:draft-ai` e ampliar o smoke local para rotação/concorrência. Nenhuma migration remota faz parte dos testes.
- [ ] Atualizar evidências com SHA, ambiente, comandos/resultados e limites; conciliar o trecho antigo de STATUS que ainda diz “sem commit/push” com o estado Git efetivamente verificado na execução.
- [ ] Entregar prévia a Boni. Homologação em host real é separada da fixture; não alegar execução externa real por testes sintéticos. Commit/push/integração/publicação seguem autorização de escopo.

## Sequência e definição de pronto

Preparação anterior a qualquer alteração: reconfirmar branch/base, status e configuração local e coletar o baseline dos dois cenários previsto na especificação. Depois, executar 1 → 2 → 3 → 4 → 5 → 6. A tarefa 1 pode ser avaliada isoladamente e resolve a falha funcional; as seguintes simplificam o percurso. Não transportar estado de produção para esta prévia.

Pronto neste escopo significa ciclo sintético inteiro por UI, recuperação e regressões aprovadas, metas de simplificação medidas e documentação coerente. Não significa adequação jurídica do texto, validação do modelo externo nem autorização de deploy. Não exigir nova pessoa para avaliar: Boni decide sobre a entrega.
