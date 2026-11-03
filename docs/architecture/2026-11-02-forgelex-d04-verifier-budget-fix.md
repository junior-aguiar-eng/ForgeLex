# D04 — correção local da reserva do verificador

Autorização de Boni: investigar e corrigir localmente, preservando mesa e limites,
sem novas chamadas pagas nem deploy. Checkout `forgelex-3-audit/SDK`, branch
`codex/forgelex-3-quality`, HEAD `025f6dd438ecfd78079b4688fd076e476da74ce9`.
Alterações anteriores do working tree preservadas.

## Causa reproduzida

O checkpoint D04 da [campanha real v7](2026-11-02-forgelex-recalibration-v7-results.md)
reproduz o bloqueio com o SDK e o transporte comercial reais, usando chave
sintética, rede proibida e respostas locais. O checkpoint e o packet originais
não foram editados; o hash do contexto reconstruído coincide com o da execução.

A requisição serializada tinha 36.437 bytes. A regra financeira existente reserva
`(bytes * 2 + 8192) * 2 + 2048 * 10` micro-USD. Assim, a próxima chamada exigia
US$ 0,182612; somada a US$ 0,100930 já consumidos, chegaria a US$ 0,283542,
ultrapassando US$ 0,25 por execução. O controle financeiro agiu corretamente.
Esse valor é reconstruído localmente, pois a reserva recusada não foi gravada
no ledger real.

O contexto tinha 24.216 bytes, dos quais 18.950 eram saídas anteriores completas.
Além das afirmações e da minuta, o verificador recebia todos os requisitos e
ressalvas já produzidos, embora não possa aprovar requisitos ou reescrever a peça.

## Alteração

Novas tarefas usam estado v8 e perfil/política 1.9.0. Somente a entrada do
`authority-verifier` omite `requirements` e `findings` anteriores. O perfil
explica essa projeção e proíbe interpretar a ausência como aprovação/resolução.
A projeção conserva todas as claims (também as factuais e sem fonte), cobertura,
minuta completa, demais campos presentes, plano, fontes completas e pares elegíveis.
Não há truncamento de textos nem filtro de afirmações por tipo de fonte.

Os 11 requisitos e 18 findings originais de D04 continuam intactos no estado
e incorporados à entrega. A entrada terminal conserva as 12 claims, as quatro
questões, a minuta e seus cinco pares de suporte normativo. Os outros papéis
continuam recebendo as saídas completas. Os schemas, auditorias, fontes e
validações de suporte permanecem; ausência de check e suporte parcial continuam
produzindo ressalvas. O limite de contexto completo é conferido antes da projeção.

O contrato v7 e os anteriores não mudam. Retomar o checkpoint histórico v7
reproduz a reserva antiga; não há migração silenciosa. A simulação do novo
contrato reexecuta apenas respostas gravadas dos quatro especialistas com
`FakeAgentProvider`, comprovando que suas saídas canônicas são idênticas às
históricas, e usa o SDK com resposta sintética somente para o verificador.

## Evidência local

A requisição candidata tem 25.206 bytes e reserva US$ 0,137688. Com o gasto
anterior, a soma fica em US$ 0,238618 (margem de US$ 0,011382 para essa reserva).
Isso é uma verificação do limite superior, não medição de novo consumo real.
A chamada sintética retorna suporte parcial para os cinco pares; a entrega
permanece `LIMITED`, com revisão humana obrigatória e minuta inalterada.

O teste falhou antes da correção por `BUDGET_EXCEEDED`, reproduzindo a soma
US$ 0,283542. Depois, verifica também recusa com saldo insuficiente, ausência de
entrega nesse caso e preservação de ressalvas quando não há nenhum supportCheck.

- 181 testes focados aprovados em 11 arquivos, incluindo o replay D04 e D01,
  compatibilidade, IDs, suporte, grafo e análise probatória.
- Build completo, tipos da API e lint dos nove arquivos de código envolvidos aprovados.
- `pnpm test`: build completo aprovado; suíte inicial com 1.610 aprovados,
  11 falhas e 17 ignorados em 234 arquivos. Dez falhas em `cobranca.test.ts`
  decorreram da configuração desta invocação: `FORGELEX_ANALISE_TEST_POSTGRES_URL`
  vazia resultou em `URL_INVALID`, em vez de ativar o banco em memória. Removida
  somente a variável do processo de teste, os dez passaram sem mudança de código.
- Resta uma falha preexistente em `closed-pilot.test.ts:510`, teste
  `executa worker, driver e OpenAI SDK reais com SSE sintético e pergunta persistida`:
  espera duas chamadas e recebe uma. A mesma falha foi reproduzida usando aliases
  para legal-agents/legal-workflows do snapshot v7, anterior à correção. A pergunta
  foi persistida; a expectativa antiga de chamada adicional não acompanha o
  encerramento em `task.submit`. Não alterada nesta tarefa.
- `git diff --check` aprovado. Conferidos 1.207 arquivos anteriores inalterados,
  incluindo 353 protegidos (mesa, financeiro, transporte, executor e evidências).
  Os oito arquivos anteriores alterados são os dois registros canônicos, workflow,
  export do perfil e quatro expectativas da nova versão em testes; há três novos
  arquivos de código/teste. Limites da política e instruções dos seis demais
  papéis comparados com v7 e preservados.

[Recibo de validação](evidence/2026-11-02-focused-verifier-v8/validation.json),
[log da suíte completa](evidence/2026-11-02-focused-verifier-v8/full-suite.log),
[reexecução de cobrança](evidence/2026-11-02-focused-verifier-v8/billing-tests.log) e
[reprodução da falha no v7](evidence/2026-11-02-focused-verifier-v8/v7-existing-test-failure.log).

[Reserva local](evidence/2026-11-02-focused-verifier-v8/budget-replay.json).
A execução paga D04 histórica continua sem entrega final. O comportamento e a
qualidade do modelo real com a nova entrada não foram medidos. A margem observada
vale para essas saídas gravadas; respostas futuras maiores ainda podem bloquear.
Nova rodada paga depende de decisão específica de Boni.

Mesa, fórmula de reserva, US$ 0,25 por execução, teto de campanha US$ 1,50,
2048 tokens de saída, 24 chamadas e cinco minutos preservados. Nenhuma consulta
paga, ampliação aos outros 54 cenários, commit, push, migration ou deploy.
