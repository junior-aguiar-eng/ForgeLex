# Ajustes do gelo antes do aceite — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o gelo e o site no modelo novo prontos para o aceite de Boni: lateral A, Mesa centralizada, Conta e Conectar IA sem ferramentas antigas, site centrado na Mesa, textos legais atualizados e capturas corretas.

**Architecture:** Tudo atrás de `VITE_FORGELEX_THEME=gelo` (app) e `VITE_FORGELEX_PUBLIC_MODEL=true` (site); o clássico não muda. Remover em vez de esconder: telas e blocos que saem do gelo são tirados do caminho do gelo e as rotas antigas levam ao destino atual.

**Tech Stack:** React 18 + Vite + Tailwind (`apps/web`), Vitest, Playwright (`tests/`), HTML estático (`apps/web/public/legal/`).

**Spec:** [docs/superpowers/specs/2026-11-27-gelo-ajustes-design.md](../specs/2026-11-27-gelo-ajustes-design.md)

## Global Constraints

- O tema clássico e o site sem `PUBLIC_MODEL` saem idênticos (os testes do clássico seguem passando sem alteração).
- Nada de tela, aba ou botão novo além do menu do rodapé da lateral.
- Axe sem violação em 360, 768 e 1440 px nas telas do gelo.
- Cada mudança de texto atualiza no mesmo commit `tests/public-copy.test.ts`, `tests/public-seo.test.ts` e `apps/web/src/public/PublicSite.test.ts` quando afetados.
- O site só afirma o que está publicado (Mesa comercial, pesquisa STJ com fonte, conector MCP para ChatGPT e Claude).
- Commits na branch `claude/gelo-ajustes`, um por tarefa; nada publicado sem autorização de Boni.

## Review Focus

- Usuário que entra direto por `/app/conta` (sem passar pela Mesa) precisa ver Recentes e Pasta na lateral: teste na Tarefa 3.
- Clicar numa conversa ou caso da lateral estando em Conta deve abrir a Mesa com aquela conversa: teste na Tarefa 3.
- Links antigos salvos (`/app/conta/chaves`, `/app/guia/mcp`, `/app/desenvolvedores/api`, `/guia`, `/desenvolvedores/api`, `/integracoes`, `/produto`, `/consulta-processual`) não podem cair em 404: testes nas Tarefas 1 e 6.
- Celular (360 px): a gaveta da lateral abre, mostra o menu do rodapé e fecha com Esc: teste na Tarefa 2.
- Saldo indisponível (falha na leitura): a lateral mostra o nome sem saldo, sem erro: teste na Tarefa 2.

---

### Task 1: Navegação do gelo sem Chaves de API, Guia e API

**Files:**
- Modify: `apps/web/src/navigation/app-navigation.ts`, `apps/web/src/navigation/routes.ts`, `apps/web/src/components/ice/IceFrame.tsx`, `apps/web/src/App.tsx`
- Test: `apps/web/src/navigation/app-navigation.test.ts`, `apps/web/src/navigation/routes.test.ts`

**Interfaces:**
- Produces: `accountSections()` → `[credits 'Faturamento', account_activity 'Atividade', account_security 'Segurança']`; `connectSections()` → `[]` no gelo (IceFrame mostra só o título “Conectar a sua IA”, sem barra de seções); `iceCaseDestination(tab, …)` passa a mandar `api_keys` → `credits` e `for_lawyers_guide`/`api_docs` → `connections`.

- [ ] Teste: `accountSections()` não contém `api_keys`; `iceCaseDestination('api_keys', false, true, 'gelo') === 'credits'`; `iceCaseDestination('for_lawyers_guide', false, true, 'gelo') === 'connections'`; idem `api_docs`; no clássico os três seguem iguais.
- [ ] Rodar `pnpm --filter ./apps/web exec vitest run src/navigation` → FAIL.
- [ ] Implementar (mapa de destino por aba em vez do `Set` atual); `IceFrame` não renderiza `SectionTabs` quando a lista tem menos de duas seções.
- [ ] Rodar de novo → PASS; `pnpm --filter ./apps/web exec tsc --noEmit`.
- [ ] Commit `feat(web): gelo sem Chaves de API, Guia e API nas seções`.

### Task 2: Lateral A

**Files:**
- Modify: `apps/web/src/components/ice/IceSidebar.tsx`, `apps/web/src/navigation/app-navigation.ts`, `apps/web/src/components/ice/desk-history-slot.tsx`
- Test: `apps/web/src/components/ice/IceSidebar.test.tsx` (novo), `tests/e2e/shell-gelo.spec.ts`

**Interfaces:**
- Consumes: `useDeskHistorySlot()`.
- Produces: o contexto do slot ganha `onNewConversation?: () => void` e `showDeleted?: () => void`, registrados pela Mesa (Tarefa 3) e usados pela lateral.

Estrutura (de cima para baixo): marca (logo atual, até o logo novo); botão primário “Nova conversa”; o slot de histórico (Recentes e Pasta, renderizados pela Mesa) sempre presente no gelo, em qualquer aba; rodapé com botão de conta (iniciais, nome e “Saldo R$ x”) que abre um menu (`role="menu"`) com: Conectar IA, Conta e créditos, Recarregar, Conversas excluídas, Sair. Sai o grupo “Trabalho”, a lista Conectar IA/Conta solta, o cartão de saldo e o botão Recolher (com o trilho de ícones). Gaveta do celular mantida.

- [ ] Teste (Vitest + Testing Library): renderiza “Nova conversa”; o menu abre ao clicar no botão de conta e lista os cinco itens na ordem; “Conectar IA” chama `onSelect('connections')`; Esc fecha o menu e devolve o foco ao botão; com saldo `undefined` o botão mostra só o nome.
- [ ] Rodar → FAIL.
- [ ] Implementar; `iceNavigation` com a Mesa passa a devolver `resources: []` (os destinos vão para o menu).
- [ ] Rodar Vitest → PASS; atualizar `shell-gelo.spec.ts` (nomes acessíveis novos; gaveta em 360 px abre, mostra o menu e fecha com Esc) e rodar `pnpm exec playwright test tests/e2e/shell-gelo.spec.ts`.
- [ ] Commit `feat(web): lateral do gelo com nova conversa, histórico e menu da conta`.

### Task 3: Histórico e Pasta em todas as telas do gelo

**Files:**
- Modify: `apps/web/src/App.tsx`, `apps/web/src/screens/AgenticWorkspaceScreen.tsx`, `apps/web/src/desk/ConversationHistory.tsx`
- Test: `tests/e2e/shell-gelo.spec.ts`

**Interfaces:**
- Consumes: `onNewConversation`/`showDeleted` do slot (Tarefa 2).
- Produces: no gelo, `WritingDeskScreen` é montada desde a entrada (retida e oculta fora de `work`), e escolher conversa, caso, “Nova conversa” ou “Conversas excluídas” fora da Mesa chama `setActiveTab('work')` antes de agir.

- [ ] Teste E2E: entrar direto em `/app/conta` → a lateral lista Recentes e Pasta; clicar numa conversa → URL vira a da Mesa com a conversa aberta; “Nova conversa” a partir de `/app/conectar` → Mesa vazia.
- [ ] Rodar → FAIL.
- [ ] Implementar (`workVisited` começa `true` no gelo; a Mesa registra os dois callbacks no slot).
- [ ] Rodar → PASS; rodar também `tests/e2e/agentic-workspace.spec.ts` (sem regressão).
- [ ] Commit `feat(web): histórico e Pasta da Mesa em todas as telas do gelo`.

### Task 4: Mesa centralizada

**Files:**
- Modify: `apps/web/src/desk/ConversationParts.tsx` (`WorkspaceHeader`), `apps/web/src/screens/AgenticWorkspaceScreen.tsx`
- Test: `tests/e2e/shell-gelo.spec.ts`

Conversa vazia, sem peça e sem orientação: saudação “O que vamos preparar hoje?”, subtítulo “Descreva a peça ou a revisão. Anexe o que tiver.” e a caixa de pedido centralizadas na vertical e na horizontal da área principal, largura máxima `680px`. Com conversa ou peça, layout atual (caixa no pé, peça à direita).

- [ ] Teste E2E (1440×1000): na Mesa vazia, o centro vertical da caixa fica entre 40% e 60% da altura da área principal e o centro horizontal a ±24 px do centro da área; após enviar um pedido simulado, a caixa fica no terço inferior.
- [ ] Rodar → FAIL; implementar; rodar → PASS (também em 360 px: sem rolagem horizontal).
- [ ] Commit `feat(web): Mesa vazia centralizada no gelo`.

### Task 5: Conta e Conectar IA enxutas

**Files:**
- Modify: `apps/web/src/components/ice/AccountAside.tsx` (+ `account-aside-model.ts`), `apps/web/src/screens/CreditsScreen.tsx`, `apps/web/src/screens/ConnectionsScreen.tsx`, `apps/web/src/App.tsx` (rodapé e fundo)
- Test: testes existentes de cada arquivo, `tests/e2e/shell-gelo.spec.ts`

No gelo:
- `AccountAside`: sai o cartão “Chaves de API” e `listApiKeys`.
- `CreditsScreen`: a linha de preço passa a “Até R$ 11,50 por trabalho na Mesa (o não usado volta) · R$ 0,20 por pesquisa de jurisprudência”, com valores vindos da conta quando o serviço os expõe, e os pacotes deixam de mostrar “≈ N buscas”.
- `ConnectionsScreen`: ficam cabeçalho, botões ChatGPT/Claude, `HostInstallationGuide`, `AuthorizedApplications` e a privacidade. Saem: link do guia, o parágrafo de Casos, “Testar disponibilidade”, `SavedResearchPermissions` e `FirstUseExamples`. O cartão de créditos diz: “A assinatura da sua IA não paga o ForgeLex: a pesquisa com fonte é cobrada por operação; abrir e conferir uma decisão é gratuito.” A privacidade acrescenta: “Ao autorizar, a sua IA passa a ler os seus casos ativos e pode enviar peças, que só valem depois da sua revisão. Revogue aqui a qualquer momento.”
- `App.tsx`: o rodapé das telas fora da Mesa diz “ForgeLex · peças jurídicas com fonte” e leva Termos, Privacidade e Encerramento. Conferir num navegador real se o fundo da lateral acompanha a rolagem em páginas longas; se não acompanhar, a coluna da lateral recebe `self-stretch` com fundo `bg-surface`.

- [ ] Ajustar os testes existentes para o texto novo (e afirmar a ausência de “Chaves de API”, “Testar disponibilidade” e “Gerenciar pesquisas salvas” no gelo).
- [ ] Rodar → FAIL; implementar; rodar Vitest e `shell-gelo.spec.ts` → PASS; confirmar que os testes do clássico não mudaram.
- [ ] Commit `feat(web): Conta e Conectar IA do gelo sem ferramentas antigas`.

### Task 6: Site público centrado na Mesa

**Files:**
- Modify: `apps/web/src/navigation/site-routes.ts`, `apps/web/src/public/PublicHeader.tsx`, `apps/web/src/public/PublicFooter.tsx`, `apps/web/src/public/pages/HomePage.tsx`, `HowPage.tsx`, `CreditsPage.tsx`, `PublicSections.tsx`, `apps/web/src/public/public-metadata-data.ts`, `apps/web/public/sitemap.xml` (versão do modelo, se gerada à parte)
- Test: `tests/public-copy.test.ts`, `tests/public-seo.test.ts`, `apps/web/src/public/PublicSite.test.ts`, `apps/web/src/navigation/site-routes.test.ts`

Com `PUBLIC_MODEL`: páginas Início (`/`), Como funciona (`/como-funciona`), Preços (`/creditos`, rótulo “Preços”) e Conectar sua IA (âncora na Início ou `/como-funciona#conectar`). `/produto`, `/integracoes`, `/guia`, `/desenvolvedores/api` e `/consulta-processual` resolvem para `home` (sem 404). Início: título proposto “Peças jurídicas prontas para revisar, com a jurisprudência na fonte.” (Boni decide no aceite; o veto ao título rejeitado em `public-copy.test.ts` continua), três passos (descreva, anexe, revise a peça), seção “Jurisprudência que dá para conferir” (STJ, fonte e situação) e seção “Use na sua IA” (ChatGPT e Claude por MCP). Preços: trabalho na Mesa até R$ 11,50 com devolução do não usado e pesquisa a R$ 0,20, pré-pago, sem mensalidade.

- [ ] Testes: `resolveSiteRoute('/produto')` com modelo → `{kind:'public',page:'home'}` (idem para as outras quatro); sem modelo, inalterado; a cópia da Início contém “Mesa” e “peça”; o cabeçalho tem só Início, Como funciona, Preços, Entrar e Criar acesso; o mapa do site do modelo não lista as páginas removidas.
- [ ] Rodar → FAIL; implementar; rodar Vitest e `pnpm exec playwright test tests/e2e/public-model.spec.ts` → PASS.
- [ ] Commit `feat(web): site no modelo novo centrado na Mesa`.

### Task 7: Textos legais

**Files:**
- Modify: `apps/web/public/legal/privacidade.html`, `apps/web/public/legal/termos-de-uso.html`
- Test: testes que leem as versões dos documentos (`rg -l "2026-10-30.v1" tests apps/web/src`)

Aplicar a redação aprovada por Boni em 27/11 ([proposta](../../operations/stabilization/2026-11-18-textos-legais-modelo-novo-proposta.md)): privacidade com as seções “Mesa de trabalho e anexos” (OpenAI pela API, configurada para não armazenar as respostas; sem afirmação sobre treino, que Boni ainda não confirmou) e “IA conectada”; termos com a cláusula “Mesa de trabalho” e a troca da frase sobre o modelo de IA, com os valores R$ 11,50, R$ 20,00 e R$ 100,00. Versão de ambos: `2026-11-27.v1`, “atualizada em 27 de novembro de 2026”. Retenção e encerramento sem mudança.

- [ ] Atualizar os testes que fixam a versão → FAIL; editar os HTML → PASS.
- [ ] Commit `docs(legal): Mesa de trabalho, anexos e IA conectada nos termos e na privacidade`.

### Task 8: Capturas para o aceite

**Files:**
- Modify: `scripts/visual-baseline-lib.mjs`, `scripts/visual-baseline-lib.test.ts`

`PUBLIC_ROUTES` passa a `['/', '/como-funciona', '/creditos', '/cadastro', '/entrar']`; `APP_ROUTES` a `['/app/trabalho', '/app/conectar', '/app/conta', '/app/conta/atividade', '/app/conta/seguranca']`; a captura sobe o ambiente com `VITE_FORGELEX_PUBLIC_MODEL=true`.

- [ ] Teste do módulo com as listas novas → FAIL; implementar → PASS.
- [ ] Rodar `VITE_FORGELEX_THEME=gelo VITE_FORGELEX_PUBLIC_MODEL=true node scripts/visual-baseline.mjs capture --out <scratchpad>/gelo-aceite-2 --axe --viewports 360,768,1440`; esperado: sem violação de axe.
- [ ] Gerar a galeria e enviá-la a Boni; registrar o resultado em `docs/architecture/2026-11-10-mesa-guiada-execucao.md` (seção “Ajustes do gelo, 27/11/2026”) e marcar os itens 12 e 13 da 1A no plano unificado como “aguardam o aceite das novas capturas”.
- [ ] Commit `chore(visual): capturas só das telas atuais, com o site no modelo novo`.
