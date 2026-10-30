# Executor e consumo do piloto fechado — itens 1 e 2 da Tarefa 7

Autorização: Boni pediu implementação em 28/10/2026. Base `ca30715`.
Somente Boni, exemplos sintéticos aprovados, OpenAI `gpt-6.1-sol`, teto
cumulativo US$ 5,00, sem pesquisa paga/fallback/push/deploy. Nenhuma chamada
paga é necessária para implementar/verificar. Flags permanecem desligadas.

## Decisão de implementação

Reutilizar runtime, transporte limitado da Tarefa 6, repositórios, worker e
`InferenceBudgetService`. O ledger USD existente fica separado do banco da
aplicação e do billing BRL. Não provisionar conta/saldo nem migrar o ledger ao
iniciar. Exigir sua história original (54 chamadas liquidadas, cancelamento
provisionado em 4 centavos) e a igualdade saldo + escrow + consumo/provisão = 500.
O runner histórico continua encerrado; a nova autorização usa somente o saldo
remanescente dessa mesma conta. A identidade real de Boni é configuração
obrigatória do servidor, sem inscrição automática do primeiro usuário.

Uma consulta interna de execução permite ao serviço financeiro validar a
execução no banco da aplicação, mantendo a conta USD histórica no ledger
separado. Não copiar conteúdo nem criar serviço financeiro paralelo.

O início fechado recebe apenas caseId, limite em centavos e confirmação
explícita. A preparação dos documentos ocorre dentro da transação idempotente
já existente. O job nasce aguardando autorização; só entra no worker depois
da reserva durável. Crash/retry não repetem a reserva. O servidor restringe
objetivo, contexto, documentos e pacote enviado às fixtures aprovadas e
revalida acesso/revisão antes de cada HTTP. Respostas livres, correções e
continuações genéricas ficam indisponíveis nesse modo sintético restrito.

O painel informa moeda, teto cumulativo, saldo disponível, escrow, consumo
arredondado e provisão incerta, sem chamar provisão de custo faturado.

## Arquivos e verificações

1. [x] `packages/billing-ledger/src/inference-budget-service.ts` e testes:
       lookup interno opcional para banco separado e inspeção financeira sob o
       lock existente. Testar comportamento padrão, isolamento, concorrência e
       teto histórico sem reposição; não alterar schemas/migrations.
2. [x] `execution-service.ts`/testes e paginação filtrada em `execution-store.ts`: preparação transacional interna e job WAITING
       antes de autorizar; liberação explícita após reserva, cleanup pelo ledger
       correto. Testar retry, cancelamento e impossibilidade de claim prematuro.
3. [x] Criar `closed-pilot.ts`, `closed-pilot-finance.ts` e testes no módulo API;
       integrar configuração de `buildApp`/rotas. Exigir owner explícito, chave
       existente, histórico financeiro íntegro e fixtures versionadas. Testar
       identidade errada, ausência de história, injeção de prompt/fontes/config,
       idempotência, falhas e reload; usar transporte falso, sem rede paga.
4. [x] Painel fechado na superfície Trabalho, reaproveitando cliente/editor.
       Testar consentimento não marcado, casos fixos, limite explícito, consumo
       legível e ausência de entrada livre no modo fechado.
5. [x] Verificar tipos/lint/build afetados, testes focados, regressão e rollback
       pertinentes. Registrar hashes/resultados/limites e atualizar o plano canônico.

## Limites

Não habilitar runtime ou editar `.env.local`; reutilização da chave já foi
autorizada. Configuração ativa exige IDs verificados de Boni e o ledger original.
Não fazer migration em banco existente, nova inferência real, commit, push ou
deploy por consequência da implementação. Risco de timeouts históricos continua
registrado; não aumentar limites para esconder falhas.

Ruling: os itens e restrições já foram especificados/aprovados por Boni;
seguir o caminho de reaproveitamento acima sem criar novo ciclo de aprovação
de design ou credencial. Essa é decisão de implementação, não autorização de
ativação/publicação. Preço comercial e dados de clientes permanecem fora do escopo.

## Resultado verificável

Suíte geral: 1.160 aprovados/17 ignorados, zero falhas, 819,38 s; inclui 11
testes do executor fechado. SDK real exercitado com SSE sintético, sem
inferência paga. Revisão e regressões RED→GREEN: chamada AUTHORIZED após crash,
paginação após 50 jobs não geridos e corrida cancelamento/reserva entre bancos.
Build monorepo/API e tipos aprovados; lint com zero erros e dois avisos do
contador de geração. Navegador: 17/18; teste novo aprovado, teste existente do
editor falhou e passou isolado sem alterações. Limitação permanece registrada.
Rollback local repetido aprovado; não houve ativação, commit, push ou deploy.
Ver [evidência](../../architecture/evidence/2026-10-28-closed-pilot-executor.json).
