# ForgeLex — plano de ocultação e congelamento do fluxo de casos

> **For agentic workers:** executar sequencialmente com
> `superpowers:executing-plans`, após autorização de Boni para implementação.
> Boni é o único aprovador humano. Este plano não autoriza implementação,
> commit, push, integração, alteração de dados ou publicação.

**Goal:** retirar da experiência do site os casos, a análise documental, os
rascunhos e a revisão, mantendo sua implementação recuperável e preservando
MCP, API, conta e consulta processual gratuita.

**Architecture:** uma configuração do frontend controla a disponibilidade do
fluxo existente. Navegação, montagem das telas, atalhos e carregamento da fila
respeitam a mesma configuração. Os serviços, contratos e dados do backend
permanecem como estão; a retirada das ferramentas de casos do MCP é outra etapa.

**Tech Stack:** TypeScript, React, Vite, Vitest e Playwright existentes; sem novas
dependências ou migrações. Docker apenas para propagar a configuração de build.

**Spec:** [escopo acordado neste documento](#escopo-acordado), decorrente das
decisões de Boni em 11/10/2026 e da análise do código/Git nesta conversa.


> Execução autorizada por Boni em 11/10/2026 e concluída tecnicamente no worktree
> codex/site-mcp-scope-freeze. Evidências em
> [registro local](../../operations/stabilization/2026-10-11-site-mcp-scope-freeze.md).
> Prévia sintética disponível; aprovação visual de Boni, commit e publicação pendentes.

## Escopo acordado

Boni decidiu concentrar o produto em MCP de pesquisa e decisões, utilizado com
ChatGPT/Claude, preservando a área de desenvolvedor e a consulta gratuita
TJAL/DataJud. Para reduzir o risco da transição, aprovou a abordagem de ocultar
o fluxo de casos no site e manter sua implementação congelada no repositório.
Esta solicitação autoriza preparar o plano; a implementação será uma execução
posterior.

| Área | Resultado deste incremento |
| --- | --- |
| Casos, análise documental, rascunhos e revisão | Ocultos; URLs antigas encaminhadas para Conectar IA; código preservado |
| MCP atual, inclusive catálogo de ferramentas | Inalterado neste incremento |
| API e documentação técnica de endpoints | Contratos preservados, incluindo endpoints de casos já publicados |
| Conectar IA, guia, aplicativos autorizados e OAuth | Preservados e acessíveis |
| Conta, créditos, atividade, segurança e chaves | Preservados |
| Consulta processual gratuita | Preservada em `/consulta-processual` e `/app/consulta-processual` |
| Pesquisa jurisprudencial existente no site | Preservada como recurso auxiliar; ocultar esta pesquisa ampliaria o escopo |
| Planos de mesa e orquestração jurídica nativa | Suspensos como trabalho futuro; artefatos preservados como histórico |
| Camada visual de decisões no MCP | Plano mantido como frente independente; não implementada aqui |

Congelar significa suspender evolução funcional, manter código e testes e
permitir manutenção necessária à segurança/compatibilidade. Ocultar a interface
não bloqueia chamadas REST/MCP nem revoga autorizações existentes. O produto
deve descrever essa situação com precisão, sem anunciar que tais serviços foram
desligados ou que dados foram eliminados.

## Restrições globais

- Não excluir pastas, telas, serviços, tabelas, migrações, dados ou registros.
- Não alterar `apps/api`, `packages/*`, scripts de migração, contratos OpenAPI,
  políticas de autorização, cobrança, ingestão STJ ou rotinas de encerramento.
- Preservar `packages/agent-core`: seu `ToolRegistry` é usado pelo MCP e API.
- Preservar a listagem de aplicativos autorizados, embora sua rota esteja hoje
  no módulo de permissões de casos. Não separar esse módulo neste incremento.
- Não incorporar à main análise documental/simplificação ainda não integradas.
- Não executar reset, clean, remoção recursiva, stash descartável ou limpeza do
  checkout atual. Preservar trabalho prévio antes de preparar a execução.
- Não retirar testes antigos para tornar a CI verde; executar casos com a
  configuração explicitamente habilitada e o site enxuto com ela desabilitada.
- Não reescrever regras fiscais, contratuais ou de retenção por mudança visual.
- Não implementar agentes, modelos, prompts jurídicos, leitor MCP ou nova API.
- Commit/push/integração/deploy permanecem sujeitos ao escopo autorizado por Boni.

## Estado inicial e preparação

Snapshot verificado em 11/10/2026:

- Checkout: `C:/Users/Boni Jr/.antigravity-ide/SDK`.
- Branch local: `codex/case-flow-simplification`; HEAD `101ee331fc621ebf38fd536a549c38b0f9340d12`.
- Remoto: `https://github.com/junior-aguiar-eng/ForgeLex.git`.
- `origin/main` consultado no remoto: `f5f9316dd0255e49029972806fb161963ab4d54a`.
- Há alterações rastreadas e arquivos não rastreados anteriores a este plano.
- O commit de análise documental está em `codex/case-document-analysis`, fora de
  main; a simplificação está sem commit. Main já possui o fluxo anterior de casos.
- Dados reais, autorizações em uso e runtime de produção não foram inventariados.

Antes de implementar:

- [x] Reconfirmar remoto, branch, HEAD, diff e estado dos arquivos não rastreados.
- [x] Preservar inventário e cópia recuperável do trabalho anterior, incluindo
  documentos/prévias não rastreados e arquivos ignorados necessários. Não copiar
  credenciais para relatório nem repositório. Manter o checkout original intacto.
- [x] Preparar worktree gerenciado isolado a partir de main atualizado, mantendo
  o plano disponível nele. Registrar o SHA-base efetivo; não trabalhar sobre as
  alterações locais de simplificação nem transportar seus patches por acidente.
- [x] Executar a baseline de lint/build/unitários no worktree e registrar falhas
  anteriores. Prévia e E2E usam credenciais/dados sintéticos locais.

## Configuração e comportamento definidos

Criar `apps/web/src/config/site-capabilities.ts` com:

- `isCaseWorkspaceEnabled(value: string | undefined): boolean`: somente o valor
  exato `'true'` habilita o fluxo.
- `CASE_WORKSPACE_ENABLED: boolean`: derivado de
  `import.meta.env.VITE_FORGELEX_CASE_WORKSPACE_ENABLED`.

Ausente ou `'false'`: site enxuto. `'true'`: telas e ações antigas disponíveis
para testes e eventual reativação autorizada. A variável é pública e serve só à
apresentação; não constitui controle de segurança.

Vite fixa o valor no build: mudar uma variável de ambiente do servidor após a
compilação não altera o bundle. Reativar requer reiniciar o servidor de prévia
ou reconstruir o frontend. Publicar a reconstrução requer autorização própria.

Em `navigation/routes.ts`, adicionar
`resolveVisibleTab(tab: AppTab, casesEnabled: boolean): AppTab`: com o fluxo
desabilitado, `matter`, `draft_studio` e `dashboard` resolvem para `connections`;
as outras abas mantêm seu destino. Preservar o catálogo bruto de rotas e aliases.

O redirecionamento dos caminhos `/app/casos`, `/app/rascunhos`, `/app/revisao`,
`/casos`, `/rascunhos` e `/revisao`, inclusive barra final, deve substituir a
entrada do histórico por `/app/conectar`, sem transportar parâmetros/hash do
caso. Não aplicar essa limpeza às rotas de conta, OAuth, recuperação de senha
ou retorno de pagamento. `/app` e seu início atual ficam preservados nesta etapa.

## Foco de verificação

1. URL antiga, `next` de login, acesso interno e voltar/avançar: nunca montar tela
   oculta, perder controle da navegação ou produzir loop (tarefa 1/4).
2. Retorno de pagamento, senha, consentimento OAuth e encerramento: conservar
   parâmetros, prioridade de tratamento e comportamento existentes (tarefa 1/4).
3. API de revisão indisponível: não chamar nem depender dela no modo enxuto;
   conta, MCP e pesquisa devem continuar funcionando (tarefa 2/4).
4. Flag habilitada: manter acesso às telas, ações e fila do fluxo congelado e
   conservar testes de regressão existentes (tarefas 1/2/4).
5. Mobile/teclado e páginas públicas: sem atalhos mortos, anúncios de módulos
   ocultos, perda de foco ou controles duplicados novos (tarefas 1/3/4).

## Tarefa 1 — configuração, rotas e montagem das telas

**Arquivos:** criar `apps/web/src/config/site-capabilities.ts` e
`site-capabilities.test.ts`; modificar `apps/web/src/vite-env.d.ts`,
`apps/web/src/navigation/routes.ts`, `routes.test.ts`, `site-routes.ts`,
`site-routes.test.ts`, `apps/web/src/context/AppContext.tsx`, `apps/web/src/App.tsx`,
`apps/web/src/components/Header.tsx` e `Sidebar.tsx`.

**Interfaces:** consumir `CASE_WORKSPACE_ENABLED` e `resolveVisibleTab(...)` na
inicialização, sincronização do histórico, navegação interna, retorno pós-login
e proteção de montagem. `AppTab`, rotas brutas e contratos de contexto permanecem
compatíveis. Não transportar a assinatura de navegação da simplificação local
para main; adaptar somente o mecanismo presente no SHA-base da execução.

- [x] Testar os dois valores da flag e ausência/valores inesperados; testar os
  seis caminhos antigos, barra final, tentativa interna e `next` pós-login.
- [x] Preservar os testes de callback de senha, destino interno seguro e retorno
  de pagamento. Fixar que seus parâmetros permanecem intactos.
- [x] Implementar a configuração e política única de abas. Ao redirecionar,
  sincronizar URL, título e estado antes de montar conteúdo; usar replace sem
  loop e sem carregar os componentes ocultos.
- [x] Ocultar os três itens antigos no Header. Manter pesquisa e oferecer
  Conectar IA como ação visível, reutilizando o menu atual. Preservar recursos
  de conta/desenvolvedor/consulta na Sidebar; não adicionar outro painel.
- [x] Garantir uma segunda proteção no ponto de renderização em `App.tsx`, para
  que um estado antigo não monte uma tela oculta. Preservar imports e arquivos.
- [x] Executar `pnpm exec vitest run apps/web/src/config/site-capabilities.test.ts apps/web/src/navigation/routes.test.ts apps/web/src/navigation/site-routes.test.ts apps/web/src/App.test.ts`.

**Aceite:** URLs antigas chegam a Conectar IA, navegação não exibe módulos
ocultos e a flag habilitada mantém o acesso original.

## Tarefa 2 — carregamento operacional e atalhos de casos

**Arquivos:** modificar `apps/web/src/context/AppContext.tsx`,
`AppContext.test.ts`, `apps/web/src/screens/LandingScreen.tsx`,
`ResearchDeskScreen.tsx`, `ConnectionsScreen.tsx`, `ConnectionsScreen.test.ts`;
criar `apps/web/src/screens/case-shortcuts.test.ts`.

**Interfaces:** preservar `AppContextType` e `createOperationalActions(...)`.
Adicionar `loadVisibleOperationalState(client: OperationsClient,
casesEnabled: boolean)`, retornando `{ tribunals, history, reviewQueue }` com
os tipos `OperationalResource<...>` já existentes. O modo enxuto não consulta a
fila: retorna `{ state: 'unavailable', data: [] }` nesse recurso interno. Não
apresentar isso como prova de inexistência de pendências reais.

- [x] Testar que `loadReviewQueue` não é chamado com flag desabilitada, inclusive
  em atualização manual; tribunais e histórico mantêm seus resultados reais.
- [x] Testar que a flag habilitada conserva a carga da fila e os testes existentes
  de `resolveReview`, incluindo falha sem aprovação inventada.
- [x] Usar o helper na inicialização/refresh. Não modificar OperationsClient,
  API, autenticação ou billing; deixar ações de revisão disponíveis ao modo antigo.
- [x] Condicionar a montagem de `SaveAuthorityToCase` nas duas telas de pesquisa
  e o texto/link de compartilhamento de caso em ConnectionsScreen. Conservar os
  arquivos, cópia de citação, fontes, pesquisa e AuthorizedApplications.
- [x] Testar presença/ausência dos atalhos nos dois modos, sem disparar chamadas
  de casos só por renderizar resultados ou abrir Conectar IA.
- [x] Executar `pnpm exec vitest run apps/web/src/context/AppContext.test.ts apps/web/src/screens/case-shortcuts.test.ts apps/web/src/screens/ConnectionsScreen.test.ts apps/web/src/screens/ApiDocsScreen.test.ts`.

**Aceite:** a interface enxuta não carrega casos/fila por caminhos ocultos e
preserva as funções de pesquisa, integração e conta.

## Tarefa 3 — apresentação pública e registro do congelamento

**Arquivos:** modificar `apps/web/src/public/pages/PublicSections.tsx`,
`ProductPage.tsx`, `HowPage.tsx`, `GuidePage.tsx`, `IntegrationsPage.tsx`,
`apps/web/src/public/PublicFooter.tsx`, `public-metadata.ts`,
`PublicSite.test.ts`; ajustar textos de shell em `App.tsx`/`Sidebar.tsx`.
Criar `docs/product/site-mcp-scope-freeze.md`; atualizar o estado pertinente em
`CONTINUIDADE.md`, `STATUS_VALIDACAO.md` e `docs/product/mcp-onboarding.md`.

**Interfaces:** conservar `PublicPage`, caminhos públicos, URLs canônicas e
documentação técnica. A apresentação passa a descrever pesquisa do STJ por MCP,
conexão com ChatGPT/Claude, conta/créditos, API e consulta gratuita.

- [x] Testar que páginas/rodapé não oferecem casos, rascunhos ou revisão, e que
  os destinos de cadastro, conexão, API e consulta permanecem disponíveis.
- [x] Adaptar textos, FAQ e metadados mantendo uma H1 e conteúdo principal por
  página. Não fixar preços, prometer compatibilidade universal do host ou anunciar
  o leitor MCP ainda não implementado. Não impor número artificial de FAQs.
- [x] Manter URLs de produto/guia/integrações. Nas antigas âncoras públicas
  `#casos`, `#rascunhos`, `#revisao`, mostrar aviso breve no contexto adequado
  ou encaminhar para a seção de integração, sem restaurar cartões antigos.
- [x] Registrar matriz de componentes congelados, configuração, limites do MCP
  atual e procedimento de reversão. Marcar os planos de simplificação e V2 como
  suspensos no índice de continuidade, sem apagar/regravar seu conteúdo histórico.
- [x] Registrar que o plano visual MCP permanece independente e que referências
  a salvar em casos deverão ser revistas quando essa frente for executada.
- [x] Preservar políticas legais/retentivas e API Docs. Atualizar somente status
  comprovado; implementação, homologação e publicação são estados distintos.
- [x] Executar `pnpm exec vitest run apps/web/src/public/PublicSite.test.ts apps/web/src/App.test.ts`.

**Aceite:** o site comunica o escopo atual sem oferecer caminhos ocultos; a
documentação explica o que continua implementado e como recuperar a interface.

## Tarefa 4 — regressão nos dois modos, prévia e reversão

**Arquivos:** criar `playwright.mcp-site.config.ts` e
`tests/e2e/site-mcp-scope.spec.ts`; modificar `tests/e2e/mcp-onboarding.spec.ts`,
`public-site.spec.ts`, `playwright.config.ts`, `playwright.documents.config.ts`,
`playwright.public.config.ts`, `playwright.research.config.ts`, `package.json`,
`.github/workflows/ci.yml` e `Dockerfile`. Revisar configs que herdam documentos
(`case-ai`, `matter-lifecycle`, `document-reader`, `draft-review`) para conservar
a flag habilitada sem mudanças na infraestrutura de API/banco.

**Interfaces:** config Playwright nova reutiliza os servidores/fixtures locais
de `playwright.config.ts`, define os testes `mcp-onboarding.spec.ts` e
`site-mcp-scope.spec.ts` e fixa flag `'false'` no servidor Vite. Configs antigas
de casos fixam `'true'`. `test:e2e:mcp-onboarding` passa a usar a config nova;
adicionar `test:e2e:mcp-site` para executá-la. Site público fixa `'false'` e não
reutiliza servidor local com configuração desconhecida. Nenhuma flag no backend.

- [x] Atualizar as expectativas de navegação/copy dos testes de onboarding e
  público, conservando testes de OAuth, revogação, chaves e cobrança.
- [x] E2E novo: login, seis URLs antigas, reload, voltar/avançar, `next` de login
  e ausência de chamadas de fila/casos ao navegar por conexão, pesquisa e conta.
  Usar fixture de decisão sintética para testar resultados sem atalhos de casos.
- [x] E2E novo: Conectar IA, aplicações autorizadas, guia, API Docs, conta, chaves
  e consulta gratuita acessíveis em desktop/mobile; foco/Escape e axe sem violações
  WCAG 2.1 AA nas telas alteradas. Verificar ausência de erros JS e overflow.
- [x] Manter E2E antigos de casos com flag `'true'`, incluindo documentos/leitor,
  revisão e lifecycle. Não adicionar `skip`, remover assertions funcionais ou
  alterar fixture para esconder regressão.
- [x] Acrescentar no estágio de build do Docker `ARG`/`ENV` da flag, default
  `'false'`. Preservar estágio runtime, validação Supabase e contratos de build.
  Em CI, testar explicitamente o site enxuto e manter as suítes congeladas.
- [x] Executar `pnpm lint`, `pnpm build`, `pnpm -r run typecheck` e
  `pnpm exec vitest run`; uma execução final completa após mudanças.
- [x] Executar `pnpm test:e2e:mcp-site`, `pnpm test:e2e:public`,
  `pnpm test:e2e:research`, `pnpm test:e2e:account-closure`,
  `pnpm test:e2e:chunk-recovery` e as suítes de casos exigidas pela CI. As bases
  são locais/sintéticas; nenhuma migração ou operação de teste em produção.
- [x] Construir e inspecionar a prévia local do bundle enxuto; conferir as mesmas
  URLs principais. Registrar SHA, flag, resultados e limitações da homologação.
- [x] Testar reversão local com build `'true'`: abrir caso, documento, rascunho e
  revisão com os dados sintéticos existentes, sem migração/restauração de banco.
  Reconstruir `'false'` ao terminar para entregar a prévia no escopo acordado.
- [x] Conferir diff final: nenhuma mudança em API/packages/schema, exclusão de
  arquivos ou inclusão involuntária dos trabalhos anteriores. O catálogo MCP e
  OpenAPI devem permanecer iguais à baseline; executar seus testes existentes.

**Aceite:** ambos os modos passam nas verificações correspondentes, prévia
enxuta homologada e reversão demonstrada localmente. Testes simulados locais não
comprovam execução real nos hosts nem publicação; descrever esse limite.

## Pontos de parada e entrega

Parar e corrigir antes de seguir se houver redirecionamento em loop, perda de
callback/parâmetro financeiro, tela oculta montada, dependência da fila no modo
enxuto, diferença no contrato MCP/API ou necessidade de alterar backend/banco.
Se ampliar o escopo for necessário, apresentar a causa e o ajuste a Boni antes
de executar a ampliação. Não compensar problema com exclusão estrutural.

Entregar a Boni o diff, evidências de testes e URL da prévia local. A aprovação
visual é de Boni. Commit/push/integração/publicação ocorrerão somente conforme
as autorizações dadas para esses atos, com mudanças selecionadas explicitamente.

Reversão em produção, se futuramente necessária: usar a revisão anterior
preservada ou publicar bundle reconstruído com flag `'true'`, mediante autorização.
Não executar SQL, restaurar banco ou modificar grants para reverter esta UI.

Etapa futura separada: restringir o MCP a pesquisa/decisões, retirando ferramentas
de casos e o memorando vinculado a `matterId`, com plano próprio de compatibilidade.
Esta etapa não é condição para concluir a ocultação visual.
