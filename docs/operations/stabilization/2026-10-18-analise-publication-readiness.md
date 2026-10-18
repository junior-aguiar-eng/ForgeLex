# Camada analítica — preparação local para publicação

Data: 18/10/2026. Pedido de Boni: corrigir o controle de migrations, incluir
regressão PostgreSQL na CI e definir reconciliação de operações interrompidas,
preservando alterações locais e sem deploy.

Base `3657a6354d422d59411209e64cf24653f45ec49f` (main após PR #74), branch
`codex/analise-publication-readiness`, no worktree isolado
`C:\Users\Boni Jr\.codex\worktrees\analise-publication-readiness\SDK`.
O checkout original permaneceu em `codex/case-flow-simplification`, `101ee33`.
Comparação SHA-256 dos 47 arquivos modificados/não rastreados antes e depois:
nenhuma diferença.

## Implementação

- `ModuloAnalise` recebe `migrationMode`, usando a verificação de infraestrutura
  `assertMigrationsApplied` em `verify`. A API encaminha a mesma política
  `autoMigrate` já usada para persistência/ledger. Produção com controle
  desligado recusa schema analítico ausente/parcial antes de registrar as tools.
- `scripts/migrate-postgres.mjs` inclui as duas migrations analíticas somente
  quando seu processo recebe `FORGELEX_ANALISE_ENABLED=true`; o journal conserva
  IDs/datas ao repetir. O comportamento sem módulo permanece compatível.
- A CI cria `forgelex_analise_review` separado do banco dos outros testes;
  executa os dez testes de cobrança/interrupção e depois o smoke de migrations,
  inicialização somente leitura e expurgo. PostgreSQL 16 continua sendo a
  versão configurada no serviço de CI; nenhuma dependência foi adicionada.
- O [roteiro de reconciliação](../analise-reconciliation.md) define contenção,
  consultas sem snapshots, vínculo por tenant/usuário/chave, decisão por
  cenário e evidências restritas. Preserva o bloqueio de resultados incertos;
  não adiciona reparo genérico, nova tentativa automática, estorno ou devolução
  presumida de direito ao combo. Boni é o único aprovador humano.

## Verificação

- RED observado: duas regressões de schema ausente/parcial resolviam em vez de
  recusar; a regressão de startup produtivo também resolvia indevidamente.
  Smoke PostgreSQL anterior ao rebuild reproduziu a aplicação implícita.
- GREEN focado: 18 testes aprovados em três arquivos, abrangendo schema,
  inicialização da API e cobrança/interrupções.
- PostgreSQL 18.6 temporário em `127.0.0.1:55942`, banco dedicado:
  `cobranca.test.ts --maxWorkers=1 --testTimeout=15000`: dez aprovados.
  Interrupções após liquidação conservaram `RUNNING`/`FAILED`, um único débito
  e um único uso mesmo após uma nova instância e timestamp antigo. Interrupção
  após consumo de combo não devolveu direito nem cobrou avulso na repetição.
- `node scripts/smoke-analise-postgres.mjs`: saída zero. Conferiu ausência de
  DDL em `verify`, CLI sem/com opção analítica, ambas as migrations, repetição
  idempotente, startup em transação somente leitura e expurgo das cinco tabelas,
  preservando outro tenant e tolerando módulo ausente.
- As duas consultas do roteiro foram executadas em transação PostgreSQL
  somente leitura contra fixture sintética. Encontraram a operação esperada;
  outro usuário ou tenant não recebeu linhas. Esse diagnóstico não alterou
  conteúdo de conta real.
- `pnpm build`, `pnpm lint`, `pnpm -r run typecheck`, formato dos novos testes
  e scripts e `git diff --check`: saída zero.
- A primeira execução geral encontrou o contrato estático de imports da
  camada analítica rejeitando o novo verificador de infraestrutura. O símbolo
  `assertMigrationsApplied` foi incluído nominalmente na lista permitida;
  as restrições de tabelas e de dependência do produto foram preservadas.
- Validação geral final `pnpm test` (build completo + Vitest): saída zero,
  **168 arquivos aprovados, três ignorados; 923 testes aprovados e 18 ignorados**
  de 941, em 259,28 segundos de Vitest. Nenhum skip foi adicionado; os 18 já
  estavam presentes na suíte anterior. Sem falha de asserção ou erro de worker.
- O parser YAML do Prettier aceitou `.github/workflows/ci.yml`. Não houve
  execução local das suítes Playwright nem execução remota do workflow novo.
- Revisão estática de IA do diff: nenhum defeito concreto reportado. Não
  substitui decisão de Boni nem homologação produtiva.

Logs locais de validação em `tmp/`: `migrations-red.log`, `startup-red.log`,
`focused-green.log`, `analise-postgres.log`, `smoke-prebuild-red.log`,
`smoke-green.log`, `build.log`, `lint.log`, `typecheck.log` e `final-test.log`.
O cluster temporário foi encerrado e a porta 55942 ficou sem listener.

## Limites e próximo gate

Não houve commit, push, PR, integração, migration remota, alteração de flag,
deploy, promoção de tráfego, compra, cobrança real ou concessão de acesso.
A configuração nova da CI não foi executada no GitHub nesta preparação.
Os comandos equivalentes PostgreSQL passaram localmente na versão 18.6;
isso não declara execução remota na versão 16.

Uma publicação futura exige autorização própria e evidências de backup,
schema produtivo, candidata com `FORGELEX_AUTO_MIGRATE=false`, homologação e
promoção. Operações interrompidas com resultado incerto continuam bloqueadas
até decisão de reconciliação; este roteiro não simula recuperação de operação
real nem qualifica juridicamente resultados ou preços do novo produto.
