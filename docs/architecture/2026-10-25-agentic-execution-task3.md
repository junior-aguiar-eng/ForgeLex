# Tarefa 3 — serviço durável e transporte de eventos

Implementação local na branch `codex/agent-contracts-a0`, após o commit
`ae3e16c` da Tarefa 2. Não inclui integração, deploy, banco existente nem
inferência paga. Boni permanece o único avaliador humano.

## Implementação

Os módulos propostos ficam em `apps/api/src/agentic-workspace`: serviço,
worker, rotas e projeção/SSE. `execution-store.ts` concentra comandos
idempotentes, mutex persistido por proprietário, jobs, leases e diário de
chamadas. `app.ts` apenas registra o módulo e recebe suas opções internas.

A migration aditiva `persistence-0032-agentic-execution-control` cria quatro
tabelas de controle. As entidades e snapshots da Tarefa 1 são reutilizados.
As transações verificam tenant/usuário e serializam os comandos. A identidade
do mutex tem ordem canônica, independente da ordem das propriedades recebidas.

`startExecution`, `answerExecution`, `cancelExecution` e
`continueFromCheckpoint` exigem chave de idempotência. Respostas selecionadas
e livres usam o mesmo endpoint e o contrato `LegalAnswer`. A resposta cria
uma sucessora com nova revisão e checkpoint vazio; continuação explícita só
reutiliza checkpoint confirmado. Nenhuma sucessora herda autorização financeira.

O worker usa lease persistido com token de exclusão e renovação. Antes de
despachar e confirmar um passo, revalida caso e documentos sob locks. Uma
chamada despachada sem confirmação após perda do lease exige reconciliação,
sem repetição automática. Um checkpoint entre passos pode ser retomado por
outro processo. O cancelamento impede o próximo passo e preserva os IDs de
entregas anteriores; não desfaz efeito externo já despachado.

A limpeza financeira permanece pendente até o orçamento estar `RELEASED`.
Estados `CLOSING` e de reconciliação mantêm nova tentativa persistida, com
intervalo mínimo de 30 segundos. Isso permite liberar diferenças após
liquidação tardia e evita que os primeiros 50 jobs bloqueiem os seguintes.
Ausência de carteira não é tratada como prova de ausência de escrow.

## Transporte e autorização

A flag `FORGELEX_AGENTIC_WORKSPACE_ENABLED` permanece desligada por padrão.
Mesmo ligada, início/resposta/continuação retornam indisponibilidade sem
driver interno injetado, antes de escrever uma nova execução. Nenhum modelo,
provider ou tarifa é escolhido por este incremento.

As rotas exigem sessão nativa e `research:read`; contexto de caso exige
também `matter:read`. API keys/OAuth não recebem acesso a este módulo.
`GET /api/agentic/executions/:id/events?after=sequence` usa autenticação em
cabeçalhos; credenciais na URL são rejeitadas. Cada poll revalida sessão,
escopos, caso e documentos. Desconectar o browser encerra o stream, sem
cancelar o worker.

A projeção usa allowlist de status, pergunta pública, IDs de entrega,
referências de fontes selecionadas e erros saneados. Prompts, argumentos de
tools, contratos internos e checkpoints não integram snapshots ou eventos
públicos. O cursor avança também sobre eventos internos e esgota todos os
lotes antes de encerrar uma execução terminal.

## Critérios e evidências

| Critério do plano                      | Evidência executável                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Flag desligada e regressão REST/MCP    | `execution-routes.test.ts`: health e inventários de 8 tools core/9 com apresentação habilitada |
| Reconexão sem redispatch               | testes de cursor SSE e leituras repetidas; callback executado uma vez                          |
| Projeção sem conteúdo interno          | `event-stream.test.ts` e stream com prompts/argumentos/contratos internos                      |
| Resposta selecionada/livre idempotente | testes HTTP e serviço; um sucessor e checkpoint reiniciado                                     |
| Lease entre instâncias                 | testes e smoke PostgreSQL com duas conexões/workers                                            |
| Worker independente do browser         | aborto do fetch SSE durante execução; trabalho conclui                                         |
| Cancelamento e entrega parcial         | teste de cancelamento em passo em trânsito; próximo passo não inicia                           |
| Recuperação após reinício              | smoke em processo separado: checkpoint seguro retoma, dispatch incerto não repete              |

Revisão final encontrou três pontos relevantes, reproduzidos em cinco testes
que falharam antes da correção: revogação entre planejamento/dispatch e
antes da entrega; pergunta de documento arquivado no snapshot; saldo residual
após liquidação tardia; starvation de limpeza financeira. Todos passaram após
a única rodada de correções. Não há segunda aprovação humana exigida.

Validação executada:

- `pnpm build`: todos os pacotes aprovados.
- `pnpm -r run typecheck`: todos os pacotes aprovados.
- ESLint dos módulos alterados e Prettier dos arquivos do incremento: aprovados.
- Suíte focada da Tarefa 3: 3 arquivos, 28 testes aprovados.
- `node scripts/smoke-agentic-execution-postgres.mjs`: aprovado, incluindo
  migrations repetidas, concorrência com duas conexões e recuperação em
  processo separado. Somente PostgreSQL temporário; container removido.
- `pnpm exec vitest run --maxWorkers=1`: 183 arquivos aprovados e 3 ignorados;
  1051 testes aprovados, 18 ignorados, nenhuma falha (850,82 segundos).

Os oito critérios da Tarefa 3 estão concluídos localmente e marcados no plano.
Este incremento permanece sem commit. A cópia do plano no checkout original
acompanha o estado desta branch; o código original foi preservado.

## Limites e etapas seguintes

O driver jurídico real pertence à Tarefa 4B, fontes à 4A e homologação real
com preço/modelo/teto aprovados à Tarefa 6. Integração de consentimento,
retenção/purge e operação de reconciliação são pré-condições da ativação.
O driver real deve respeitar `AbortSignal` e aplicar os timeouts dos adapters;
este módulo não promete interromper fisicamente qualquer callback externo.
O heartbeat identifica worker vivo; recuperação de processo perdido depende
do vencimento do lease. Testes sintéticos não homologam qualidade jurídica,
produção ou cobrança real.
