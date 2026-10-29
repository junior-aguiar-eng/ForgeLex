# Executor fechado de Boni — configuração e consumo

Implementação local dos itens 1 e 2 da Tarefa 7, autorizada em 28/10/2026.
As flags permanecem desligadas; não houve ativação, push ou deploy nesta etapa.

## Configuração explícita

`buildApp()` compõe o executor real quando `FORGELEX_CLOSED_PILOT_ENABLED=true`.
Também exige `FORGELEX_AGENTIC_WORKSPACE_ENABLED=true`, banco da aplicação
durável e separado do ledger e os IDs **verificados** da sessão de Boni em
`FORGELEX_CLOSED_PILOT_TENANT_ID` e `FORGELEX_CLOSED_PILOT_USER_ID`. Não há
inscrição automática do primeiro login. Não usar os IDs fictícios dos testes.
O frontend usa sua flag de build existente
`VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true`.

Na continuidade de 28/10, a sessão já existente de Boni foi verificada e os
IDs foram preparados em `.env.closed-pilot.local`, ignorado pelo Git, com
ambas as flags desligadas. Esse perfil não é carregado automaticamente, não
contém chave e não substitui a configuração/validação de autenticação e banco
duráveis do ambiente local. Os identificadores pessoais não entram no relatório
versionado. A aplicação publicada não recebeu o executor por esta operação.

O modelo é fixo `gpt-6.1-sol`, provider OpenAI; não é parâmetro do cliente.
A chave exclusiva existente é lida de `OPENAI_API_KEY` ou do `.env.local`
ignorado na raiz deste checkout. Nunca colocar chave em comando, documentação,
Git ou resposta HTTP. Esta implementação não cria ou substitui chave.

O ledger obrigatório é o arquivo original
`.superpowers/sdd/2026-10-10-agentic-workspace-transition/task6-pilot/pilot.sqlite`.
A inicialização não provisiona saldo, copia conta ou aplica migrations.
Ausência de arquivo, história financeira divergente ou banco da aplicação em
memória impedem inicialização normal. Os dois bancos de memória dos testes
são injeção interna de dependências, indisponível como opção HTTP.

O runner histórico continua `PILOT_CLOSED`. A nova composição usa somente o
saldo residual da mesma conta USD: 441 centavos disponíveis, 55 consumidos
no ledger e 4 provisionados pelo cancelamento histórico. O teto cumulativo
continua 500 centavos. Não misturar com crédito BRL nem conceder outros US$ 5.

## Autorização e envio

Somente sessão autenticada com o par tenant/user configurado acessa as rotas
do piloto. `POST /api/agentic/pilot/executions` exige `Idempotency-Key` e corpo
estrito `{caseId, maxCostCents, confirmed: true}`. Aceita exclusivamente os
cinco exemplos da fixture aprovada da Tarefa 6, cujo SHA256 é fixado no código.
Texto livre, modelo, tarifas, respostas, correções e continuações genéricas
são recusados. O cancelamento da própria execução permanece disponível.

O job nasce aguardando autorização; a reserva USD persistente ocorre antes
de entrar na fila executável. Retry com a mesma chave/corpo recupera a mesma
execução e reserva, inclusive após reconstruir o serviço. Alterar o corpo
com a mesma chave causa conflito. Cancelar usa uma chave própria.

Antes de cada HTTP, o servidor revalida execução, owner, revisão, seleção
sintética e integridade financeira. Usa o worker, driver e OpenAI Agents SDK
existentes, somente Responses HTTPS, sem redirecionamento, fallback, pesquisa
paga, tools hospedadas, tracing ou retries automáticos do SDK. O transporte
limita saída a 2.048 tokens e request a 64.000 bytes, `store:false`, tier
Standard e cache explícito sem breakpoints; timeout de transporte de 30 s.
`store:false` não constitui garantia de Zero Data Retention do provider.

## Consumo e falhas

`GET /api/agentic/pilot/budget` mostra moeda USD, teto, disponível, escrow,
consumo arredondado e provisão; `?executionId=` inclui limite/consumo/reserva
da execução própria gerenciada. A interface exige confirmação desmarcada
por padrão e a remove ao trocar exemplo ou limite. O retry conserva a chave.

Reservas e autorizações de chamadas usam o lock da conta financeira existente.
Toda chamada reserva seu limite conservador antes do HTTP. Usage válido
liquida o custo arredondado; fundos não usados são liberados ao encerrar.
Timeout, cancelamento ou resposta sem usage não significam custo zero:
mantêm a parcela incerta retida e suspendem novos envios até conciliação.
Uma autorização de HTTP ainda sem liquidação também suspende outros envios,
inclusive se o processo cair antes de registrar a resposta. Em operação normal,
a suspensão termina quando o usage é liquidado; após queda, exige conciliação.
O cancelamento histórico continua provisionado em 4 centavos, com custo e
usage reais desconhecidos. Não há conciliação com fatura nesta implementação.

Tarifa técnica já aprovada da Tarefa 6: US$ 2/10 por milhão de tokens
entrada/saída e US$ 0,10 para entrada cacheada; conferida na
[tabela oficial](https://developers.openai.com/api/docs/pricing).
As limitações de medição e custos adicionais estão descritas no
[guia oficial de controle de gasto](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api#limits-and-other-costs).
Não inferir margem comercial ou correção jurídica desses valores.

## Ativação e rollback

Antes de ativar, identificar os IDs reais de Boni, banco/artefato isolados,
migrations existentes e backup/rollback. Esta etapa implementa a composição e
os controles; não escolhe um destino remoto nem aplica migrations existentes.
Usar o [runbook](runbook.md) para a decisão e verificação operacional de Boni.
Desligar a flag agêntica interrompe registro de rotas/scheduler; preserva
casos, versões, entregas e ledger. Uma chamada em voo exige acompanhamento e
conciliação; desligar flag não prova estorno. Dados pessoais/clientes,
ampliação comercial e avaliação jurídica continuam fora deste piloto.
