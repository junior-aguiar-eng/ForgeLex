# Tarefa 2 — limite e contabilidade de inferência

Autorização de Boni em 25/10/2026: fazer o commit da Tarefa 1 e iniciar a Tarefa 2.
Tarefa 1 commitada como `568a66feb46ad7d2eaf24101eeefebf14e7fa8d4`, na branch
`codex/agent-contracts-a0`, worktree `analise-release/SDK`.
O checkout original do fluxo de casos permanece separado.

## Implementação conforme o plano

- Arquivos propostos: `packages/billing-ledger/src/inference-budget-service.ts`
  e seus testes, com `reserveExecutionBudget`, `authorizeProviderCall`,
  `settleProviderCall` e `releaseUnusedBudget`.
- Suporte interno: `inference-budget-funding.ts`, schema de reservas/chamadas,
  migration aditiva `billing-ledger-0009-inference-budgets` e exports.
- `LedgerService` recebe cobertura interna opcional, vinculada à operação
  persistida. Pesquisa STJ conserva sua chave, fingerprint, callback e débito;
  não há um segundo débito da mesma pesquisa na camada de orçamento.
- `NormalizedUsage` e seu schema são reutilizados de `@forgelex/agent-core`.
  A única dependência adicionada é esse pacote já existente no workspace.
- Smoke isolado: `pnpm test:postgres:inference-budget`, com container temporário
  `postgres:16-alpine`, sem usar bancos de outros projetos ou de produção.

## Decisões e limites do contrato

Reservar transfere fundos da carteira disponível para uma reserva persistida da
execução, preservando os buckets pago/promocional. Não é um débito de consumo.
O bloqueio da linha da conta serializa instâncias/processos; reservas avulsas
ainda em trânsito são consideradas antes da transferência, mesmo com lease
expirada: vencimento não confirma consumo zero nem impede liquidação tardia. Operações comuns
continuam usando a carteira e não podem gastar o saldo reservado.

Autorizar uma chamada separa sua cobertura dentro da reserva, com `callId`, hash
dos parâmetros, limite de custo, contexto e saída. Um retry não recebe outra
autorização de despacho. A liquidação medida usa o `LedgerService` existente e,
na mesma transação, consome a reserva, registra uso e emite um único débito.
Conciliação contábil deve considerar carteira mais fundos ainda reservados.

A política é explicitamente fornecida pelo servidor: identidade/versão,
referência de aprovação, provider/modelo, tarifas e limites. Não existem tarifas,
modelos ou políticas reais padrão. Uma referência textual de aprovação não prova
que Boni aprovou uma política; validar a configuração/evidência pertence à
integração autenticada posterior. As políticas dos testes são sintéticas.

O custo é calculado em centavos com aritmética inteira, reutilizando o uso
normalizado. Cache exige tarifa explícita quando usado. A cobertura usa o maior
preço de entrada configurado entre entrada normal e cache; não pressupõe cache
mais barato. Consumo incompatível, acima do teto, não mensurável ou sem preço
conhecido marca `RECONCILIATION_REQUIRED`, retém cobertura e bloqueia novas
chamadas. Custo zero só é aceito quando medido e compatível com a política.

Cancelar/liberar devolve somente os fundos livres. Chamadas em trânsito ou de
resultado incerto mantêm seu teto retido. Uma liquidação tardia confirmada não
desconta novamente a carteira. Conciliação de resultados incertos requer fluxo
operacional explícito posterior; não há redispatch ou desbloqueio automático.
Isso pode manter saldo indisponível até a conciliação.

A alocação preserva a prioridade promocional existente. Novas chamadas são
recusadas após o vencimento original de promoção reservada; sua devolução não
converte promoção expirada em saldo pago ou promoção renovada. Valores já
autorizados continuam cobertos para liquidação da chamada em trânsito.

## Critérios e evidência

| Critério canônico                        | Evidência                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reservas concorrentes limitadas ao saldo | PostgreSQL com duas conexões/serviços: 8 reservas de 20 centavos sobre 100, somente 5 aprovadas; carteira restante zero                                                |
| Retry e liberação                        | Autorização concorrente com um único despacho; liquidação concorrente com um débito; liberação repetida não duplica crédito; cancelamento preserva chamada em trânsito |
| Consumo não mensurável                   | Testes e smoke congelam orçamento, mantêm teto incerto e não registram custo zero/usage event fictício                                                                 |
| Reserva/settlement e tetos persistidos   | Migration 0009; controle por conta e execução; limites de chamadas, contexto, saída e cobertura antes da execução; uso/preço incompatível exige conciliação            |
| Pesquisa STJ no orçamento                | Chave/fingerprint e débito existentes; replay não repete callback; lease expirada de pesquisa já autorizada não permite redispatch                                     |
| Provider fake tentando exceder limites   | Testes bloqueiam o callback por contexto/custo/chamadas; uso além da saída autorizada gera conciliação; nenhuma inferência real                                        |

## Revisão técnica

Revisão independente por IA encontrou dois problemas importantes, reproduzidos
antes das correções: takeover da lease STJ podia repetir pesquisa ainda em trânsito
e cobertura calculada apenas pela tarifa normal podia subestimar cache mais caro.
Os testes RED também reproduziram erro de replay por snapshot expirado sendo
substituído por `CALL_TERMINAL`. A verificação complementar também reproduziu
reserva de inferência usando indevidamente cobertura de operação avulsa `PENDING`
com lease expirada; essa cobertura é agora preservada até resolução do estado.

Correções: pesquisa já autorizada só admite replay após liquidação; erros de
recuperação de resultado liquidado preservam seu código e não reabrem conciliação;
cobertura de entrada usa o maior preço configurado. Sem revisão humana adicional:
Boni permanece o único aprovador humano.

## Validação e continuidade

- `pnpm build`: monorepo aprovado; rebuild de billing aprovado após correções.
- Typecheck de billing e ESLint do pacote: aprovados.
- Testes focados: 36 aprovados (17 de orçamento e 19 do ledger existente).
- Smoke PostgreSQL: aprovado, incluindo concorrência, lease STJ expirada sem
  redispatch, débito único, retenção de consumo incerto e recuperação por outro processo.
- A espera de inicialização do smoke foi corrigida para TCP após reproduzir
  `57P03` e confirmar o servidor provisório sem TCP no entrypoint da imagem.
- `pnpm exec vitest run --maxWorkers=1`: 180 arquivos aprovados e 3 ignorados;
  1022 testes aprovados e 18 ignorados, sem falhas.
  A execução integral iniciou com 16 testes novos de orçamento. O controle
  adicional de reserva avulsa expirada foi acrescentado depois do início e
  validado no conjunto focado final de 36 testes, com rebuild/typecheck e smoke
  PostgreSQL posteriores aprovados. Não houve alteração de testes antigos ou
  aumento de timeout para obter esses resultados.

Este módulo permanece interno. A integração ao worker/rotas, aplicação dos limites
ao request real dos SDKs, autorização/revogação, projeção pública, retenção/expurgo
das novas tabelas e fluxo operacional de conciliação precisam estar concluídos
antes de expor a capacidade. Referências de configuração não escolhem tarifa ou
modelo comercial. Evals com provider real e teto aprovado continuam na Tarefa 6.

Não houve chamada paga, alteração de saldo real, migration em banco existente ou
remoto, push, integração ou deploy. O commit autorizado nesta atividade foi o da
Tarefa 1; a Tarefa 2 permanece local até autorização de commit. Tarefas 3–7 seguem
pendentes.
