# Auditoria e status canônico do ForgeLex

Última auditoria: 2026-09-18. Checkout: `main` em `a7058f3`.

## O que está concluído

- A superfície pública comercial foi removida. `/` entrega somente o painel
  consolidado de autenticação; `LandingScreen` continua existindo apenas como
  ferramenta interna após o login.
- As ferramentas autenticadas, os providers, os contratos da API e o backend
  não foram redesenhados nem removidos.
- O frontend agora usa a sessão Supabase também nas telas de Casos e Minutas.
  O token legado continua disponível para os fluxos técnicos que ainda o
  utilizarem.
- Falhas de conexão com a API deixaram de ser confundidas com uma simples
  sessão encerrada: o frontend as classifica como `API_UNAVAILABLE`.
- O CORS local foi alinhado para `localhost:3000` e `127.0.0.1:3000` no `.env`
  ignorado pelo Git.
- Os exemplos cURL da documentação autenticada foram corrigidos e os metadados
  do frontend deixaram de mencionar rascunhos e revisão humana como proposta
  institucional.
- O README foi alinhado ao script real `pnpm --filter @forgelex/api start` e
  passou a registrar que o bootstrap atual da API executa migrations
  idempotentes.
- As telas autenticadas passaram a ser carregadas sob demanda, reduzindo o
  bundle inicial e eliminando o alerta de chunk acima de 500 kB.

## Validações executadas

| Gate | Resultado | Evidência |
|---|---|---|
| Build completo | PASS | `pnpm test` compilou os 15 projetos do workspace |
| Build do frontend | PASS | `pnpm --filter @forgelex/web build` |
| Typecheck completo | PASS | `pnpm typecheck` |
| Testes automatizados | PASS | 29 arquivos aprovados; 128 testes aprovados; 1 arquivo e 2 testes condicionais ignorados |
| Verificação de diff | PASS | `git diff --check` |
| Readiness da API | PASS | `GET /readyz` respondeu `200` com persistência e billing prontos |
| Catálogo de webhooks | PASS | `GET /api/v2/webhooks/events` respondeu `200` com outbox PostgreSQL disponível |
| Métricas | PASS | `GET /metrics` respondeu `200` sem erros ou falhas de webhook |
| API sem token | PASS | `POST /api/v2/auth/bootstrap` respondeu `401 UNAUTHENTICATED` |
| CORS local | PASS | `OPTIONS` respondeu `204` para `localhost:3000` e `127.0.0.1:3000` |
| Supabase | VALIDADO LOCALMENTE | Login concluído no ForgeLex; workspace autenticado carregado após recarregamento e métricas da API permaneceram sem erros |
| PostgreSQL | PARCIAL | `SELECT 1` previamente validado; API iniciou com rotinas idempotentes e registrou relações de migration já existentes |
| Fluxo autenticado | PASS (renderização) | Casos, Pesquisa, Rascunhos, Revisão, Integrações e Documentação da API carregaram no navegador sem executar consulta faturável |

O bundle inicial do frontend ficou em aproximadamente 408 kB e as telas
autenticadas foram separadas em chunks próprios. Os dois testes condicionais
ignorados correspondem às integrações reais Anthropic e OpenAI sem as
respectivas credenciais.

## Bugs corrigidos nesta auditoria

1. O frontend autenticado consultava Casos e Minutas com `fetch` próprio e
   dependia de token legado, ignorando a sessão Supabase.
2. A indisponibilidade da API produzia um erro genérico e podia devolver o
   usuário à tela de login sem distinguir falha de infraestrutura.
3. A origem `127.0.0.1:3000` não estava autorizada no CORS local.
4. Os exemplos cURL exibiam marcadores `+` indevidos.
5. O README instruía um script `dev` inexistente para a API.
6. O `index.html` mantinha metadados institucionais incompatíveis com a
   direção atual do produto.
7. O bundle inicial carregava todas as telas autenticadas, mesmo antes do
   usuário acessá-las.

## Onde o trabalho parou

O login real foi concluído no ForgeLex. O workspace autenticado carregou após a
entrada e permaneceu disponível depois de um recarregamento, confirmando o
fluxo local de sessão e bootstrap da conta. As principais telas autenticadas
também foram percorridas sem executar consultas, pagamentos ou chamadas reais
de providers. A API permanece ativa em `http://127.0.0.1:3001` após a
autorização explícita para o startup que executa
`runPersistenceMigrations()` e `ledgerService.runMigrations()`.

Não foi executado `pnpm db:migrate`, `pnpm test:postgres`, deploy, push ou
commit. A auditoria visual percorreu as principais rotas autenticadas e não
executou consultas faturáveis, pagamentos, providers reais ou entregas externas.

## Pendências externas

- validar providers Anthropic/OpenAI com credenciais controladas; no estado
  atual, as chaves correspondentes não estão configuradas no `.env` e o botão
  de conexão do frontend permanece sem chamada real ao provider;
- validar entrega efetiva de webhooks com destino acessível;
- realizar QA visual das rotas autenticadas principais após restabelecer uma
  sessão válida; a tela consolidada autenticada já foi carregada nesta
  auditoria;
- decidir se a documentação pública planejada será retomada. O plano em
  `docs/superpowers/plans/2026-09-17-forgelex-ui-publica.md` foi superado
  pela decisão posterior de manter apenas o login público.

## Estado local preservado

Não houve commit. Permanecem no worktree as alterações anteriores e as
correções desta auditoria; o diff deve continuar sendo revisado antes de
qualquer integração.
