# Análise jurídica — seis correções locais de 14/10/2026

Boni autorizou a correção dos seis achados nesta conversa. Implementação no
worktree `C:\Users\Boni Jr\.codex\worktrees\fix-analise-six-issues\SDK`, branch
`codex/fix-analise-six-issues`, working tree sobre
`a3af1f6c19a3ec1663289123217483c32dab3189` (`main` com PRs #71–#73 integradas).
O checkout original `codex/case-flow-simplification` foi preservado.

## Alterações

1. Replay vinculado a usuário, sessão, ferramenta e conteúdo antes de qualquer
   retorno de snapshot. Snapshot legado sem vínculo verificável é recusado.
2. Migration aditiva `analise-0002-operation-idempotency`: claim persistente comum
   a combo e avulso; compra concluída pode ser recuperada; requisição concorrente
   com a mesma chave não executa nem cobra novamente. Atualização concorrente de
   direitos de ferramentas diferentes relê a lista; falha devolve só seu direito.
3. Precedentes exigem identificador completo e classe quando informada. Dígitos
   dispersos, prefixos e descrição por palavras semelhantes não confirmam identidade.
   A localização não demonstra suporte jurídico à tese.
4. Norma declarada pelo cliente, mesmo com URL oficial, não vira auditoria de
   vigência pelo servidor. O status `declarado_pelo_cliente` conserva a ressalva;
   sem fonte válida, permanece `nao_verificado`.
5. Resumo conserva trechos ausentes, lacunas probatórias, riscos de preclusão,
   divergências e ressalvas das fontes/panorama normativo. Sem fundamentação a priori.
6. Expurgo e conferência de resíduos incluem as cinco tabelas analíticas, por
   tenant e sob a categoria existente `SESSIONS`. Tabelas opcionais ausentes não
   quebram SQLite/PostgreSQL; dados de outro tenant e exceções são preservados.

## Evidência local

- RED/GREEN observado nos testes de cobrança, identificadores, normas,
  apresentação e exclusão/resíduos; causas adicionais de concorrência foram
  reproduzidas antes de corrigidas.
- Execução conjunta final `packages/analise-juridica/src apps/api/src/account`
  com `--maxWorkers=1 --testTimeout=15000`: 116 testes aprovados em 16 arquivos,
  exit zero. Inclui os 62 testes analíticos e os 54 testes de conta.
- `apps/api/src/account`: 54 testes aprovados em 10 arquivos.
- PostgreSQL 18 temporário em loopback, banco `forgelex_analise_review`:
  sete testes de cobrança aprovados. O smoke verificou o bloqueio por resíduos,
  expurgo de cinco tabelas, outro tenant preservado e módulo ausente compatível.
  Cluster encerrado; porta de teste 55931 sem listener ao terminar.
- `pnpm lint`, `pnpm -r run typecheck`, formato do código alterado e
  `git diff --check`: aprovados.
- `pnpm build`: aprovado; também concluiu no início de `pnpm test`.
- `pnpm test`: 910 testes aprovados e 18 ignorados; exit 1 por encerramento
  inesperado de worker (`vitest-pool`). Sem falha de asserção reportada.
- Repetição completa com `--maxWorkers=1 --testTimeout=15000`: 911 aprovados,
  18 ignorados, 164 arquivos aprovados e três ignorados; exit 1 por dois erros
  de worker. Essa execução não certificou a suíte geral como aprovada.
- Diagnóstico isolado `jurisprudence-repository.test.ts --reporter=verbose`:
  nove aprovados, um ignorado e encerramento de worker no caso
  `faz rollback do lote inteiro quando uma versão é inválida`. Esse teste e sua
  cadeia `persistence`/`legal-data`/`domain` não tinham diff naquela execução.
  A investigação adicional autorizada por Boni está descrita abaixo.
  Logs locais em `.superpowers/analise-six-fixes/`.
- Revisão de IA do diff final: sem defeito material restante confirmado;
  não constitui aprovação humana nem avaliação jurídica substantiva.

## Correção adicional do encerramento de workers

Boni autorizou corrigir a falha no teste de rollback e obter uma suíte geral
verde antes de publicar. A falha foi intermitente: o teste isolado e uma
repetição do arquivo completo passaram com a dependência antiga.

Um programa mínimo, sem Vitest nem Drizzle, reproduziu saída 1 após 20 ciclos
de escrita em FTS5, rollback, leitura, fechamento e coleta de memória, sem erro
JavaScript reportado. O controle sem FTS terminou com saída zero. Não foi
capturada uma pilha nativa; a instrução nativa específica permanece desconhecida.
O fornecedor registra falhas semelhantes de encerramento no Windows em
[libsql-js #231](https://github.com/tursodatabase/libsql-js/issues/231), inclusive
em versões mais novas; esse registro não certifica uma correção universal.

Foi atualizado o cliente existente `@libsql/client` de 0.14.0 para 0.18.0 nos
quatro pacotes que o declaram, com `libsql` 0.5.29 no lockfile. Não houve troca
de arquitetura de persistência nem alteração da lógica de rollback do corpus.
O mesmo programa mínimo passou com a nova dependência em 50 ciclos.

`db-native-lifecycle.test.ts` executa 50 ciclos em um subprocesso e verifica
ausência de linhas e entradas FTS após rollback, coleta de memória e saída zero.
O subprocesso impede que uma falha nativa elimine silenciosamente o worker de
teste. Os arquivos temporários são removidos pelo pai após a saída do filho.
O arquivo original do corpus e a nova regressão passaram juntos: 11 aprovados,
um ignorado por exigir PostgreSQL local, saída zero.

A primeira suíte completa após a atualização terminou sem erro de worker:
911 testes aprovados, 18 ignorados e uma falha em `draft-approval.test.ts`.
O cliente novo reporta `TRANSACTION_ACTIVE` quando uma transação ocupa a única
conexão em memória. A rotina de aprovação agora reconhece esse código como
contenção transitória na mesma política limitada de repetição já existente.
O teste original permaneceu intacto: exige exatamente uma decisão vencedora,
rejeição de domínio da concorrente e preservação do estado por versão.

Após o ajuste, os três arquivos focados passaram juntos: 12 testes aprovados,
um ignorado, saída zero. Instalação com lockfile congelado, lint, build, tipos
e formato passaram após a atualização.

A execução integral seguinte terminou sem erro de worker nem falha de asserção,
mas com timeout de 10 segundos no aquecimento do `beforeAll` de
`case-shortcuts.test.ts`: 910 aprovados, 18 ignorados já presentes e dois não
executados por conta da falha do hook, saída 1. A compilação inicial das cinco
telas/componentes foi movida para a
coleta do módulo, fora dos timers de hooks/testes. Nenhum timeout foi ampliado;
nenhuma asserção foi removida e cada configuração da flag continua recarregando
os módulos. Os quatro arquivos focados passaram juntos, com os dois cenários
da flag: 14 aprovados, um ignorado por PostgreSQL, saída zero.

### Validação integral final

`pnpm test` (build completo e Vitest com os dois workers padrão) terminou com
saída **zero**: **166 arquivos aprovados, três ignorados; 912 testes aprovados,
18 ignorados**, de 930. Sem falha de asserção, timeout de hook ou erro de worker.
Vitest levou 291,87 segundos. Log local:
`.superpowers/analise-six-fixes/full-suite-green-gate.log`.
Lint final aprovado. Verificação de tipos do monorepo aprovada após a atualização
do cliente e o ajuste da aprovação; o build final também compilou o ajuste das telas.
`pnpm --dir apps/web exec tsc --noEmit` também terminou com saída zero após esse ajuste.
Os 18 testes ignorados já estavam presentes nas execuções anteriores; não foram
introduzidos skips para obter este resultado. Esta validação é local e não
substitui publicação ou homologação em produção.

## Limites e publicação

Operações `RUNNING`/`FAILED` sem resultado confirmado não retomam automaticamente.
Requerem conferência/reconciliação antes de uma nova tentativa; não há rotina de
recuperação automática implementada nesta correção. Identidade localizada em fonte
oficial e URL declarada pelo cliente não certificam pertinência jurídica ou vigência.

Após a validação, Boni autorizou expressamente nesta conversa, em 14/10/2026,
commit, push, abertura de PR e integração em `main` das seis correções e da
estabilização da suíte. A entrega Git seguirá por essa branch, com checks da PR.
Não houve migration remota, deploy ou alteração de flag/conta nesta frente.
Não foram realizadas consultas pagas a modelo ou tribunais nem homologação nos
hosts reais. A aplicação de migrations foi apenas em bancos temporários de teste.
Esta rodada não revalida nem altera o estado produtivo dos registros históricos.
