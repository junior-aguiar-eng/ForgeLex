# Pesquisa, histórico e ano do julgamento — validação local

Implementação do plano aprovado por Boni em 02/10/2026 na branch
`codex/research-history-year`, a partir de
`dd8ce234fece8b02dac4c1f2827af33935b7f17f` (`origin/main` no início).
Worktree: `C:\Users\Boni Jr\.codex\worktrees\document-io\SDK`.
O checkout original `codex/p2-search-chunk-recovery`, HEAD
`ace7b7a487845e2f7b3098b138037b2641a51952`, preserva as alterações P2.

## Comportamento entregue

- Histórico e exemplos preenchem o formulário sem POST faturável. Consultar
  inicia uma nova operação intencional; detalhes e cópia são gratuitos.
- Um card por termo armazenado, tribunal e ano, com a última consulta e
  contagem antes do limite. O extrato financeiro mantém cada débito real.
- Ano opcional de 1989 ao ano corrente UTC nas duas telas, POST, GET e MCP;
  validação antes da cobrança e intervalo inclusivo na data do julgamento,
  aplicado antes do limite tanto nas fixtures quanto no índice persistido.
- Avisos explícitos, tarifa obtida da API, identificação dos filtros dos
  resultados carregados e cópia confirmada pela área de transferência.
- Bloqueio síncrono compartilhado enquanto a consulta está em andamento;
  Tentar novamente conserva filtros e chave inclusive após navegar entre
  as telas. Uma nova consulta intencional recebe outra chave.
- Estado de resultados somente em memória da sessão, descartado ao sair
  ou trocar a identidade. Nenhum novo armazenamento permanente de resultados
  e nenhum estorno automático de débitos anteriores.

## Regressões e revisão

Os testes inicialmente falharam para contrato/ano, agrupamento, validação
antes da cobrança, exemplos que executavam POST e proteção ausente.
A revisão encontrou perda da chave ao navegar entre telas e erro no
registro do histórico após uma cobrança concluída. Ambos foram corrigidos.

A falha de gravação do histórico agora retorna 503 recuperável. Repetir
a mesma chave recupera o resultado do ledger, conserva o débito único e
registra o valor original cobrado, mesmo quando a repetição cobra zero.
O teste provoca essa falha e confere saldo, registro e valor de 20 centavos.
O teste de encerramento de sessão também demonstrou resultados antigos
antes de adicionar a identidade à chave do AppProvider.

A regressão do onboarding detectou leitura de billing na tela de conexão
causada pelo carregamento global da tarifa. A leitura da tarifa foi restrita
às duas telas de pesquisa, preservando o teste gratuito sem consulta de saldo.

A revisão final do diff não identificou outro defeito concreto. Isso não
substitui os limites dos cenários automatizados descritos abaixo.

## Verificações executadas

- Build completo, lint e typecheck de todos os pacotes aprovados.
- `pnpm audit --prod --audit-level moderate`: sem vulnerabilidades conhecidas.
- PostgreSQL 18 descartável, somente em `127.0.0.1:55439`, banco
  `forgelex_research_test`: nove verificações específicas aprovadas,
  incluindo migration idempotente, agrupamento de 25 operações antes do
  limite, isolamento usuário/tenant, replay sem duplicação, histórico antigo
  nullable, limites dezembro/janeiro, julgamento distinto da publicação,
  compatibilidade sem ano e recuperação do custo original com isolamento.
- Smoke geral PostgreSQL: 12 verificações aprovadas, incluindo ledger,
  concorrência, isolamento, fluxo do caso, histórico, outbox e readiness.
- Captura de 390 px inspecionada; avisos, seletor e histórico responsivos,
  sem rolagem horizontal. Os testes usam API real, Auth local e dados fictícios.

Suíte geral: 110 arquivos aprovados e um ignorado, 562 testes aprovados e
quatro ignorados. Os sete cenários específicos da pesquisa passaram no
Chromium: histórico/exemplos, cliques rápidos, Enter repetido, duas buscas
intencionais, cópia e falha de clipboard, ano nas duas telas, navegação
durante perda da resposta, replay e limpeza ao encerrar a sessão.
As 38 verificações de acessibilidade existentes passaram em 1366 e 320 px.
Após restringir a leitura da tarifa, os sete E2E da pesquisa passaram
novamente (54,0 s), assim como os 28 testes de onboarding MCP e o fluxo
principal com PostgreSQL (29/29, 1,6 min). O teste gratuito de disponibilidade
agora confirma nenhuma consulta ao saldo. O build do web (incluindo tsc)
foi repetido depois dessa correção.
Uma execução intermediária do Vitest teve queda de worker, sem falha de
asserção; a execução final foi repetida sem builds concorrentes.

Os quatro ignorados na suíte geral são dois ensaios que exigem credenciais
reais de provedores e dois ensaios PostgreSQL com habilitação explícita.
Os dois ensaios PostgreSQL foram depois habilitados na instância descartável
e passaram (ranking full-text/GIN e idempotência de migrations).
Os ensaios de provedores reais continuam fora do gate, para não consumir
serviços pagos nem exigir contas de terceiros.

Os logs locais `.research-*.log` e `test-results/` são artefatos ignorados
pelo Git. Os cenários ficam reproduzíveis no CI existente, com
`pnpm test:e2e:research` e `FORGELEX_LOCAL_POSTGRES_URL` apontando para um
PostgreSQL local ao executar `node scripts/smoke-research-postgres.mjs`.
Nenhum ensaio usou conta, saldo ou consulta paga em produção.

## Integração e publicação

Esta evidência é local. Não houve push, integração em main, migration no
banco produtivo, build remoto ou deploy desta frente. O runtime anteriormente
registrado neste documento canônico não comprova publicação desta mudança.

A publicação requer primeiro `persistence-0024-research-judgment-year`, que
adiciona `research_search_history.judgment_year INTEGER` nullable, e depois
a nova aplicação. Registros antigos ficam sem ano. A listagem individual
do histórico permanece padrão; `grouped=true` habilita o agrupamento.
Rollback da aplicação pode conservar a coluna adicional, sem migration
destrutiva. Na publicação, registrar SHA, digest, revisão, tráfego e
validação do domínio em STATUS_VALIDACAO.md antes de declarar produção.
