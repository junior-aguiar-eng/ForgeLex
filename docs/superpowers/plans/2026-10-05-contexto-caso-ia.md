# Contexto autorizado do caso na IA — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Permitir que a IA do cliente consulte somente o material de um caso que ele selecionou e autorizou para aquele aplicativo, com prévia e revogação no site.

**Architecture:** Estender o gateway MCP existente com leitura de contexto e uma autorização persistida por conta, usuário, aplicativo OAuth e caso. Propagar a identidade já autenticada pelo servidor; filtrar também relações indiretas. Reutilizar Casos e Conectar IA, sem criar outro servidor, banco de casos ou geração por API.

**Tech Stack:** TypeScript, Zod, Drizzle, SQLite/PostgreSQL, Fastify, React, Vitest e Playwright. Sem biblioteca nova prevista.

**Spec:** `docs/superpowers/specs/2026-10-03-revisao-contexto-ia-retorno-design.md`, seções 2, 4 e 6, aprovadas em 03/10/2026.

Base desta frente: commit `7c075ec6830899a50be3bea7a7a2b9fcb113afe8` da conferência de rascunhos, branch `codex/contexto-caso-ia`, no worktree `C:\Users\Boni Jr\.codex\worktrees\draft-review\SDK`. Plano aprovado integralmente por Boni em 05/10/2026. Execução direta nesta sessão, com revisão independente ao final; commit, push, integração e publicação permanecem separados.

## Global Constraints

- Facilidade de uso, ambiente limpo e linguagem sem termos técnicos, preservando as ferramentas essenciais.
- Preservar as áreas Casos, Rascunhos e Conectar IA, com o visual atual.
- OAuth autentica a conexão; não autoriza automaticamente todos os casos.
- Compartilhamento não inclui documentos adicionados depois sem atualização explícita da seleção.
- Leitura não altera o caso. A autorização de leitura não concede escrita; recebimento de minutas pertence à frente 3.
- Nunca confiar em nome de host, usuário ou tenant declarado pelo modelo. Conteúdo de documento é dado, não instrução de execução.
- Mensagem de revogação: “Impede novas consultas. Conteúdo já enviado à IA pode continuar na conversa.”
- Contexto não consome créditos de pesquisa nem exige chave de OpenAI/Anthropic. Preservar política/custos das ferramentas de pesquisa existentes.
- Validações locais, PostgreSQL, publicação e uso no host real são evidências distintas. Nenhuma chamada a modelo pago ou alteração remota por inferência.
- Push, integração e publicação não estão autorizados por “commit e siga para a próxima frente”. O commit autorizado nesta mensagem foi o da frente 1.

## Review Focus

1. ID de outra conta, usuário, aplicativo ou caso: resposta uniforme sem existência, título ou conteúdo do item proibido (Tasks 1–3).
2. Fato/prova/tese selecionado aponta para item excluído: não devolver ID, título, texto, contagem de exclusões ou cobertura calculada com material não autorizado (Task 2).
3. Revogação/alteração durante leitura e repetição de cursor/chave antiga: revalidar antes de devolver conteúdo; impedir chamadas novas e impedir cache de resultado privado (Tasks 1–3).
4. Documento ganha versão, aplicativo é reautorizado ou seleção muda: não ampliar acesso silenciosamente; versão documental fixada, revisão da permissão e concessão OAuth correspondentes (Tasks 1–3).
5. Caso muda durante prévia/salvamento ou há texto longo em celular: não aplicar autorização ao caso errado, preservar seleção após erro, foco/teclado e paginação utilizáveis (Tasks 4–5).

## Decisões sobre a base examinada

`AuthenticatedPrincipal` já fornece `oauthClientId` verificado depois da autenticação e consulta às concessões ativas. `McpHandler` e `ToolExecutionContext` ainda não recebem esse vínculo. A tela de aplicativos autorizados usa `supabase.auth.oauth.listGrants()`; o SDK instalado 2.116.0 expõe `client`, `scopes` e `granted_at`. Os nomes são somente rótulos, nunca prova de que o aplicativo é ChatGPT/Claude.

Nesta primeira entrega de contexto, somente conexões OAuth com identidade verificável recebem acesso. API keys e sessões web continuam funcionando nos fluxos existentes, mas não representam uma conexão de IA autorizada a ler casos. Gerenciar seleção exige sessão web autenticada; a IA não concede sua própria permissão.

Selecionar ChatGPT/Claude escolhe o roteiro; a concessão efetiva é vinculada a um aplicativo retornado pelo servidor. Nenhum aplicativo selecionado automaticamente pelo seu nome. Se não houver aplicativo, mostrar a configuração em Conectar IA e oferecer atualização da lista.

Selecionar documento fixa sua versão atual. Nova versão requer atualizar a seleção explicitamente. Fatos, provas, teses e fontes usam IDs explícitos, sem selecionar categorias futuras por curinga. A prévia informa que alterações no registro selecionado podem aparecer em novas consultas; documentos permanecem na versão indicada. Não inclui cronologia, memos de pesquisa, rascunhos nem questões jurídicas nesta frente.

Limites iniciais: até 100 itens por categoria e 500 no total; páginas com 20 itens por padrão, máximo 50; prévia textual de até 300 caracteres por item. Leitura detalhada entrega partes de texto de até 8.000 caracteres, com teto de 24 KiB de JSON UTF-8 por resposta. Textos não cabíveis são paginados, com indicação explícita de continuação, sem truncamento silencioso. Cursores nunca dispensam autorização.

## Task 1 — Persistir e gerenciar a seleção autorizada

**Files:**
- Create: `packages/domain/src/contracts/case-ai-access.ts`.
- Create: `packages/persistence/src/repositories/case-ai-access-repository.ts` e `.test.ts`.
- Create: `apps/api/src/case-context/oauth-client-directory.ts` e `.test.ts`.
- Create: `apps/api/src/case-context/case-ai-access-routes.ts` e `.test.ts`.
- Modify: domain/persistence `src/index.ts`, `packages/domain/src/contracts/auth.ts`, `schema/schema.ts`, `migrations/migration-runner.ts`, `apps/api/src/app.ts`, `auth/fastify-auth.ts`, `distribution/openapi.ts`, expurgo de conta e seus testes.

**Interfaces:**
- `CaseAiOwner = { tenantId: string; userId: string }`; `CaseAiReader = CaseAiOwner & { oauthConnection: VerifiedOAuthConnection }`, sempre derivado de contexto autenticado.
- `CaseAiSelection = { documents: { documentId: string; versionId: string }[]; factIds: string[]; evidenceIds: string[]; thesisIds: string[]; authorityIds: string[] }`.
- `CaseAiGrant = { id; tenantId; userId; oauthClientId; oauthGrantedAt; matterId; revision; status: 'ACTIVE'|'REVOKED'; selection; createdAt; updatedAt; revokedAt? }`.
- `SessionOAuthClientDirectory.list(sessionBearer: string): Promise<{ clientId: string; displayName: string; grantedAt: string }[]>`. Busca concessões do usuário no Auth existente; sem segredo administrativo no navegador. Falha de upstream gera indisponibilidade, nunca lista permissiva.
- `CaseAiAccessRepository.preview(owner, matterId, selection, {cursor?,limit?}): Promise<CaseAiPreview>`; owner contém tenantId/userId autenticados. Prévia valida toda a seleção e suas versões antes de paginar, retorna somente material selecionado, títulos e quantidades da seleção. Cursor vinculado ao hash da seleção, além de conta/usuário/caso.
- `CaseAiPreview = { matter: { id: string; title: string }; items: { kind: CaseItemKind; id: string; title: string; preview: string; versionId?: string }[]; counts: Record<CaseItemKind,number>; nextCursor?: string }`. Limites da prévia seguem o teto por item e respondem por páginas quando o envelope exceder 24 KiB; conceder seleção não depende de carregar todas as páginas simultaneamente. A seleção completa permanece no formulário/PUT, sem duplicá-la em cada resposta.
- `replace(owner, matterId, { oauthClientId, oauthGrantedAt, expectedRevision, selection }): Promise<CaseAiGrant>`; timestamps do aplicativo obtidos pelo servidor, não pelo corpo do cliente. `expectedRevision=0` na criação, revisão atual obrigatória na atualização.
- `listForOwner(owner, matterId)` e `revoke(owner, matterId, grantId, expectedRevision)`. `assertActive(reader, matterId): Promise<CaseAiGrant>` valida tenant/user/client/grantedAt e estado atual. Ausência/proibição externa usa `CASE_CONTEXT_NOT_AUTHORIZED` uniforme.
- `VerifiedOAuthConnection = { clientId: string; grantedAt: string }`; estender principal com `oauthGrantedAt?` a partir da concessão autenticada e validar ISO. Ausência do vínculo completo impede leitura de caso.

- [x] Escrever testes: `foreign_selection_is_rejected_atomically`, `owner_and_client_are_isolated`, `stale_revision_does_not_overwrite`, `revoke_is_persistent`, `new_document_version_is_not_shared`, `reauthorized_client_needs_updated_permission`, `directory_failure_fails_closed`. Conferir erro sem título/texto estrangeiro; concessão antiga não aceita novo `granted_at`.
- [x] Rodar testes novos de persistência/API e confirmar RED pelas interfaces ausentes.
- [x] Implementar contrato Zod estrito, seleção deduplicada e limites. Migration aditiva `persistence-0026-case-ai-access`; índice único `(tenant_id,user_id,oauth_client_id,matter_id)`, revisão crescente e timestamps. Validar seleção e gravar autorização atomicamente, com comparação de revisão dentro da transação. Acrescentar leitura de versão documental específica ao MatterRepository, com document/case/tenant correspondentes, sem modificar o método de versão corrente existente.
- [x] Implementar diretório reutilizando endpoint de concessões do Auth. Gerenciamento exige `authMethod=session` e `matter:read` para GET/prévia, `matter:write` para PUT/revogação; API key e token OAuth recebem 403 nesses endpoints. Uma concessão revogada e posteriormente recriada precisa de atualização explícita da permissão do caso.
- [x] Registrar GET `/api/v2/mcp/authorized-applications`; GET/POST-preview/PUT `/api/v2/matters/:matterId/ai-access` e POST `.../ai-access/:grantId/revoke`. PUT recebe `{ oauthClientId, expectedRevision, selection }`. Prévia não grava permissão. Nenhuma rota externa à autorização existente cria credenciais.
- [x] Incluir grants no expurgo MATTERS antes dos casos. Auditoria registra IDs/revisão/quantidades e sucesso/falha, sem seleção textual, conteúdo ou token.
- [x] Rodar `pnpm exec vitest run packages/persistence/src/repositories/case-ai-access-repository.test.ts apps/api/src/case-context apps/api/src/auth/supabase-auth.test.ts apps/api/src/account/account-closure-purge-service.test.ts`; exigir PASS e migration idempotente.

## Task 2 — Ler contexto filtrado e paginado

**Files:**
- Create: `packages/legal-tools/src/case-context/case-context-service.ts`, `case-context-tools.ts`, `case-context-contracts.ts`, `case-context-service.test.ts`.
- Modify: `packages/legal-tools/src/index.ts`, `packages/agent-core/src/contracts/agent-tools.ts`; repositories existentes de caso/fatos/teses/fontes somente para consultas necessárias e escopadas.

**Interfaces:**
- Contexto de execução aditivo: `oauthConnection?: VerifiedOAuthConnection`, preenchido somente pelo servidor; fonte deve ser `MCP`. O serviço rejeita fallback de identidade padrão para estas operações.
- `CaseItemKind = 'DOCUMENT'|'FACT'|'EVIDENCE'|'THESIS'|'AUTHORITY'`.
- Tipos de página no contrato de domínio: `SharedCasePage = { items: { matterId: string; title: string; grantRevision: number }[]; nextCursor?: string }`; `CaseContextPage = { matterId: string; grantRevision: number; items: CaseAiPreview['items']; nextCursor?: string }`; `CaseItemPage = { matterId: string; kind: CaseItemKind; itemId: string; grantRevision: number; parts: { field: string; text: string; offset: number; documentId?: string; versionId?: string; anchorId?: string }[]; relations: { kind: CaseItemKind; itemId: string; relation: string }[]; nextCursor?: string }`. Partes/relações também paginadas se excederem o envelope; nomes de campos limitados às projeções permitidas.
- `CaseContextService.listShared(reader, {cursor?,limit?}): Promise<SharedCasePage>`: casos com autorização ativa para a identidade completa; somente id/título e revisão da autorização.
- `getContext(reader, {matterId,cursor?,limit?}): Promise<CaseContextPage>`: manifesto paginado dos itens selecionados, com kind/id/título/prévia/referência documental quando aplicável.
- `readItem(reader, {matterId,kind,itemId,cursor?}): Promise<CaseItemPage>`: conteúdo selecionado e relações permitidas, fontes com documentId/versionId/anchorId quando existentes, `nextCursor?` e indicação de continuação. Saída Zod estrita sem tenant/user IDs ou campos administrativos.
- Tools externas: `case.list_shared`, `case.get_context`, `case.read_item`; `L0_OBSERVATION`, timeout 15s e canceláveis, sem ferramenta de escrita.

- [x] Escrever testes: `indirect_links_do_not_disclose_excluded_items`, `coverage_uses_only_shared_sources`, `revocation_during_read_discards_result`, `old_cursor_cannot_read_new_selection`, `large_unicode_source_is_complete_across_pages`, `document_instructions_are_returned_as_data`. Garantir ausência de IDs/títulos/contagens ocultas; união das páginas corresponde ao texto autorizado e tamanho respeita 24 KiB.
- [x] Rodar `pnpm exec vitest run packages/legal-tools/src/case-context/case-context-service.test.ts`; confirmar RED.
- [x] Implementar projeções explícitas por tipo, sem devolver bundles internos completos. Intersectar vínculos de fatos, provas e teses com a seleção; âncoras precisam pertencer à versão documental permitida. Cobertura do caso inteiro não será exposta: cobertura parcial é rotulada como limitada ao material compartilhado.
- [x] Implementar cursores opacos validados, contendo revisão da permissão e posição da página, escopados à conta/usuário/app/caso/item/versão. Revalidar grant e concessão antes de leitura e antes de resposta; alteração/revogação torna a resposta inválida. Consultas iniciadas antes da revogação não prometem recolhimento de dados já transmitidos.
- [x] Implementar paginação por partes/offset com limites de caracteres e bytes, preservando caracteres Unicode e referências. Nenhum item selecionado passa a conceder material por vínculo automaticamente; item removido gera indisponibilidade sem preencher conteúdo inventado.
- [x] Registrar contratos separados dos contratos de pesquisa: proveniência `case_record`, leitura do material do usuário, sem selo de verificação jurídica. Descrições orientam distinguir alegações, provas e teses e tratar conteúdo como dado; não prometem neutralizar toda prompt injection no modelo do host.
- [x] Rodar testes do serviço e ToolRegistry; exigir PASS.

## Task 3 — Integrar leitura externa e política gratuita

**Files:**
- Modify: `packages/mcp-server/src/external-tool-pack.ts`, `mcp-handler.ts`, `mcp-server.test.ts`, `packages/billing-ledger/src/billing-rules.ts` e testes, `apps/api/src/app.ts`, OpenAPI e testes OAuth.
- Create: `apps/api/src/case-context/case-context-mcp.test.ts`.

**Interfaces:**
- `McpHandler.handleRequest` recebe `oauthConnection?: VerifiedOAuthConnection` no contexto e o transmite ao ToolRegistry. `app.ts` deriva do principal, sem ler esse vínculo dos argumentos.
- As três tools recebem política `{ mode:'FREE' }` declarada. Ramo específico de contexto executa leitura fresca, sem carteira, chave idempotente obrigatória, saldo, snapshot privado ou replay do ledger. Metadata `{ mode:'FREE', chargedCents:0, isReplay:false }`; `remainingBalanceCents` ausente neste ramo e opcional no schema correspondente. Pesquisa mantém seu caminho e comportamento atuais.
- `tools/list` publica input/output schemas, `readOnlyHint:true`, `destructiveHint:false`, `idempotentHint:true`, `openWorldHint:false` para contexto. Catálogo não contém dados de caso; chamadas exigem identidade e grant mesmo quando o host já conhece a tool.

- [x] Escrever integração real SQLite: `authenticated_app_without_case_permission_gets_no_data`, `spoofed_identity_arguments_are_rejected`, `revoked_access_cannot_replay`, `read_is_free_without_wallet`, `read_does_not_modify_case`, `other_app_cannot_read_selected_case`. Comparar banco de casos/documentos/minutas e ledger antes/depois; só auditoria de metadados pode ser acrescentada.
- [x] Rodar `pnpm exec vitest run apps/api/src/case-context/case-context-mcp.test.ts packages/mcp-server/src/mcp-server.test.ts`; confirmar RED.
- [x] Compor serviço com repositories reais, registrar tools e ampliar allowlist. Entradas strict não aceitam tenantId/userId/clientId/host/conversation/files/history. Manter `forgelex.connection_status` e pesquisa atuais.
- [x] Implementar ramo gratuito sem cache e auditoria minimizada; não usar o payload bruto de argumentos nem texto do resultado nas auditorias destas tools. Respostas privadas HTTP `Cache-Control:no-store`; não incluir detalhes internos de seleção no erro de acesso.
- [x] Rodar suites MCP, OAuth e billing-rules; exigir PASS, incluindo regressão da busca faturável com fixtures locais.

## Task 4 — Selecionar material e revogar pelo caso

**Files:**
- Create: `apps/web/src/screens/case-ai/CaseAiAccessPanel.tsx`, `case-ai-model.ts` e `.test.ts`.
- Modify: `MatterWorkspaceScreen.tsx`, `ConnectionsScreen.tsx`, `api-client.ts`; roteiro de conexão somente se a documentação atual exigir ajuste.

**Interfaces:**
- `<CaseAiAccessPanel matterId={id} onClose={...} />`: painel acessível dentro do caso, estado isolado por matterId, sem nova rota obrigatória.
- `case-ai-model.ts`: normalização da seleção, resumo de quantidades, instrução inicial e mensagens de conflito/revogação. Estado persistido exibido somente após confirmação do servidor.
- Ações: **Usar este caso na IA**, seleção ChatGPT/Claude, aplicativo autorizado, grupos Documentos/Fatos/Provas/Teses/Fontes, **Ver prévia**, **Permitir acesso**, **Copiar instrução**, **Permissões da IA**, **Revogar acesso**.

- [x] Escrever testes de mensagens/seleção: composição vazia não autoriza, documento duplicado normalizado, conflito mantém escolha, copiar instrução não contém textos/documentos nem credenciais. Nenhum item ou aplicativo pré-selecionado.
- [x] Rodar `pnpm exec vitest run apps/web/src/screens/case-ai/case-ai-model.test.ts`; confirmar RED.
- [x] Implementar seleção progressiva com prévia dos itens/conteúdo permitido e versão documental, grupos recolhidos, uma ação principal e estados textuais. Nome do aplicativo é rótulo escapado, sem afirmar identidade comercial verificada. App indisponível leva a Conectar IA, com retorno ao caso.
- [x] Capturar matterId/revisão no envio, ignorar respostas de seleção anterior e impedir dupla escrita enquanto aguarda. Falha conserva seleção; conflito exige atualizar antes de reaplicar. Mostrar confirmação de revogação somente depois de sucesso e a mensagem exata das constraints.
- [x] Copiar instrução em linguagem jurídica com nome/link do caso e pedido para consultar no ForgeLex o material autorizado, citar fontes e indicar limites; sem nomes técnicos de tools, textos privados, conversa preenchida ou concessão de escrita. Mostrar autorização ativa independentemente de declarar que o host foi testado.
- [x] Verificar teste do modelo, build web e lint. Teclado, foco inicial/retorno, ESC fora de escrita e mobile serão validados na Task 5.

## Task 5 — Validar seleção, hosts e limites da entrega

**Files:**
- Create: `tests/e2e/case-ai-access.spec.ts`, `playwright.case-ai.config.ts`, `docs/product/case-ai-access.md`.
- Modify: `package.json`, `scripts/smoke-postgres.mjs`, `STATUS_VALIDACAO.md`.

- [x] Acrescentar `test:e2e:case-ai` com config isolada, reutilizando o servidor local e autenticação sintética existentes, com dois aplicativos e dois casos.
- [x] Escrever E2E: escolher aplicativo/material, inspecionar prévia, autorizar, ler pelas chamadas MCP reais, adicionar documento e comprovar exclusão, revogar, negar nova leitura e cursor antigo. Outro app/usuário não acessa a seleção. Reload conserva autorização/estado revogado.
- [x] Escrever E2E de seleção após erro e troca de caso durante resposta atrasada; autorização não atravessa casos. Verificar teclado/ESC/foco, 390/1280 px, texto longo, Axe e ausência de overflow. Inspecionar capturas, sem repetir POST privado via mock verde.
- [x] Estender smoke PostgreSQL para grant, atualização concorrente, leitura e revogação; cleanup antes do caso. Executar somente em banco de teste isolado identificado. Sem runtime local, registrar limite e exigir check em CI antes da integração, sem afirmar PostgreSQL validado.
- [x] Rodar `pnpm test`, `pnpm lint`, `pnpm -r run typecheck`, `pnpm test:e2e:case-ai` e regressões `test:e2e:mcp-onboarding`, `test:e2e:documents`, `test:e2e:draft-review`. Execuções de navegador que compartilhem portas/artefatos são sequenciais.
- [x] Documentar ferramentas, gratuidades, dados selecionados/versões, concessão por aplicativo, revogação e ausência de escrita. Registrar evidências por checkout/commit. Atualizar registro canônico com resultados comprovados.
- [x] Realizar revisão independente da branch, com atenção às cinco classes do Review Focus; corrigir Critical/Important e verificar deltas. Método direto preservado; nenhum implementador paralelo.
- [x] Preparar roteiro para ensaio separado no ChatGPT e Claude: conexão gratuita, lista autorizada, leitura de documento sintético, negativa de item excluído e revogação. Antes de conceder OAuth real, pedir confirmação pontual conforme preferência de Boni. Sem endpoint publicado autorizado, deixar ensaio real pendente; não usar produção para fingir validação da branch.

## Auto-revisão e fontes

Cobertura: seleção/identidade/revogação (Task 1), relações e paginação (2), MCP/política/caches (3), jornada simples e proteção assíncrona (4), navegador/PG/hosts (5). Frente 3 permanece fora do código. Os três nomes de tool e tipos são únicos neste plano. A implementação não exige alteração de configuração remota do Supabase.

Fontes oficiais consultadas em 05/10/2026: [Supabase listGrants](https://supabase.com/docs/reference/javascript/oauth-server-listgrants), [changelog](https://supabase.com/changelog), [mudança do status OAuth](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201), [conexão e testes no ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt), [conectores remotos do Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). O SDK instalado e o endpoint existente usam `listGrants`/`granted_at`; o gateway já usa `response.ok`, compatível com o status HTTP 200. Homologação do vínculo `granted_at` após reautorização é parte do ensaio real, sem substituir o bloqueio local por suposição.

Implementação local da segunda frente executada em 05/10/2026. Resultados e limites de validação registrados em `STATUS_VALIDACAO.md` e `docs/product/case-ai-access.md`. Commit, push, CI, integração e publicação são ações distintas.

## Execução remota e limites registrados

- [x] CI PostgreSQL 16 da PR #46 e de main: migrations 0025/0026 e smoke de 14 verificações aprovados, incluindo concorrência de leitura/revogação e review runs.
- [x] Integrar e publicar as frentes 1 e 2: SHA `7a216a8`, candidata sem tráfego e promoção 5/25/100 concluídas; backup/migrations explícitos e rollback identificados.
- [x] Ensaiar leitura selecionada de documento longo e fato, exclusão e revogação com cursores antigos, separadamente no ChatGPT e Claude, com material sintético e conexões OAuth existentes. Ambas as permissões ficaram revogadas; nenhuma operação financeira registrada.
- [ ] Integrar/publicar a correção de mensagem da PR #47 e retestar a apresentação da recusa nos hosts. CI do código `a60e0f5`: quatro jobs aprovados; PostgreSQL/produto cancelados por falta de runner em três tentativas. Build/lint, 19 testes direcionados, três E2E locais e revisão independente passaram.
- [ ] Ensaio suplementar de reconcessão OAuth nativa, com confirmação pontual antes da concessão. Não foi executado e não é apresentado como coberto pelo ensaio de revogação de seleção; testes automatizados confirmam o vínculo `granted_at`.

Recibo: `docs/operations/stabilization/2026-10-05-case-ai-publication.json`.
O retorno de produção ao Draft Studio permanece uma frente posterior.
