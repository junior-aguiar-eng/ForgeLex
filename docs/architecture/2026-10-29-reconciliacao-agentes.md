# Reconciliação local do workspace agêntico com a main

Data: 29/10/2026. Preparação local sem commit, push, deploy, migration remota ou chamada paga. A árvore está em merge local não concluído; as duas branches de origem permanecem intactas.

## Bases comparadas

- Main: `6cf772ac1e0ce9fb9952c771ae71b5f55fe3dc6b`, com PR #80 e CI pós-merge aprovada.
- Branch agêntica: `codex/agent-contracts-a0` em `9350f36663735c017d81d898d46512081298e088`; checkout de origem limpo na inspeção. Base comum `a02325b7afb653f80b587b6df21daf7b81cacebb`.
- Checkout de trabalho: branch local `codex/reconciliar-agentes`, criada sobre a main, com o merge da branch agêntica preparado e ainda sem commit.

## Comparação e escolhas

| Área | Main | Branch agêntica | Preparação |
| --- | --- | --- | --- |
| Caso e análise | Seleção autorizada por conexão, `case.save_analysis`, propostas e conferência | Contextos e fontes próprios do trabalho | Preservados ambos os contratos; sem substituir MCP nem abrir fonte automaticamente. |
| Minuta | Fluxo simplificado, URL direta e salvamento com versão base | Editor persistente entre áreas e preservação/adopção com comparação de versão atual | Combina ambos; URL direta, recebimento MCP, proteção de edição e conflito 409 foram exercitados. |
| Pesquisa | Gateway e ledger comerciais existentes, pesquisas salvas e leitor | Especialistas usam serviços existentes e orçamento de inferência separado | Mantidos os componentes das duas linhas; isolamento de custo e idempotência testados em ambiente sintético. |
| Execução | Agent Core e providers, sem interface de conversa agêntica | Conversa, execução persistente, ferramentas, UI e piloto fechado | Reaproveitada a implementação existente com flags desligadas por padrão; não há ativação nem tráfego nesta preparação. |
| Schema | `0031-case-document-analysis` | `0031-agentic-workspace` e 0032–0034; ledger 0009 | IDs completos distintos, ordem explícita; sem renumerar IDs históricos. Migrações aplicadas apenas a bases locais descartáveis para testes. |

Os conflitos explícitos ocorreram em `DraftStudioScreen.tsx`, índices dos pacotes de domínio, ferramentas e persistência, e `case-ai-access.spec.ts`. A reconciliação também ajusta a lista MCP esperada aos contratos da main e fixa LF na fixture sintética cujo hash já era exigido pelo piloto, sem alterar o hash aprovado. O editor aguarda a lista de casos antes de selecionar destino agêntico e usa a URL direta quando não há endereço interno.

## Limites e riscos antes de qualquer ativação

- O piloto histórico continua fechado. O ledger original, o histórico financeiro e os arquivos ignorados da branch de origem não foram copiados, reabertos nem alterados. Preparação de código não autoriza novo gasto.
- As rotinas existentes de expurgo de caso, encerramento de conta e retenção não enumeram as novas tabelas agênticas. A eventual utilização com dados pessoais ou de clientes exige definição e implementação verificável dessa política, inclusive tratamento dos vínculos, antes da ativação. Não inferir prazo ou exclusão pelo merge de código.
- A validação sintética não estabelece pertinência jurídica, prontidão comercial ou comportamento em produção. Os resultados históricos do piloto permanecem sem avaliação jurídica documentada no runbook.
- Flags, configuração, banco, eventual migration e deploy no ambiente publicado exigem decisões próprias; este trabalho não os autoriza nem os executa.
- A CI da main se refere à PR #80, não a esta reconciliação local. É necessário verificar CI do resultado exato quando houver autorização para enviar e integrar.

## Evidências locais

- Build do monorepo e verificação de tipos passaram após resolução inicial dos conflitos. O frontend foi novamente compilado pelos testes de caso após os ajustes do editor. Lint geral passou; o lint focado do editor passou. A configuração de lint ignorou os arquivos de testes de navegador e sua configuração.
- Migrations: testes SQLite a partir de cada base e PostgreSQL local a partir de ambas as sequências, com aplicação repetida e coexistência dos IDs completos.
- PostgreSQL sintético: 14 verificações gerais; 9 de análise de caso; 10 do workspace agêntico; 8 do orçamento; 11 da tarefa de caso.
- Navegador: 24 cenários do fluxo de caso e 18 do workspace agêntico passaram em execuções completas, com adaptadores sintéticos. A combinação com trabalho ativo e área de casos oculta também passou: a entrega não oferece o link do editor e a rota direta é redirecionada.
- Navegador MCP/site: 31 de 32 cenários passaram na execução completa; um cenário OAuth falhou por sincronização assíncrona. Após corrigir a espera, os dois cenários OAuth passaram em execução isolada; a suíte completa não foi repetida.
- Vitest geral após os ajustes de reconciliação: 1.199 aprovados, 17 ignorados, 200 arquivos aprovados e três ignorados. Uma tentativa anterior em paralelo apresentou falhas de fixture, contrato MCP e tempo; as causas foram tratadas e a suíte completa foi repetida.
- Provider OpenAI e homologação paga foram explicitamente desabilitados nos comandos de validação; nenhum dado de cliente foi usado.

## Continuação de 29/10: retenção agêntica — trabalho incompleto

Foram preparados, sem commit, testes e alterações para expurgar conteúdo agêntico vinculado a casos e tenants, verificar resíduos no encerramento e bloquear provisoriamente exclusões com trabalho ou orçamento de inferência pendente. Os três arquivos de testes pertinentes passaram: 27 testes. O lint dos três arquivos de produção alterados passou; a verificação de tipos do monorepo passou durante o trabalho, antes dos últimos ajustes.

Os bloqueios de orçamento são deliberadamente conservadores: qualquer orçamento encontrado impede o encerramento ou a exclusão do caso, inclusive se já estiver encerrado. Eles não implementam a conciliação ou minimização dos registros financeiros. Ainda é necessário resolver a concorrência com trabalhadores e requisições em andamento, a interação com o ledger separado do piloto, exceções de retenção e a restauração de backups; testar SQLite e PostgreSQL e executar as verificações completas sobre o resultado final. O comportamento de exclusão de documentos e suas cópias derivadas também precisa ser verificado contra a política existente. Não tratar a mudança parcial como pronta para integração.

Nenhuma PR foi criada e nenhum commit, push, deploy, migration remota ou chamada paga foi feito nesta continuação.

## Continuação: orçamento liberado em exclusão de caso

A exclusão de caso passou a permitir orçamento no banco principal somente quando seu estado é RELEASED e ambos os saldos reservados são zero, mantendo o registro financeiro; orçamento aberto ou inválido continua impedindo a exclusão. O teste de regressão reproduziu o bloqueio anterior e os sete testes do repositório de expurgo passaram. Este ajuste não resolve o tratamento do ledger isolado, a minimização financeira no encerramento, a concorrência ou a restauração. A reconciliação continua incompleta e não foi enviada.

## Continuação: minimização financeira parcial

A minimização local agora mantém valores de reservas liberadas e chamadas liquidadas ou provisionadas sob pseudônimos, removendo texto livre do payload; reservas e chamadas em andamento continuam bloqueadas. O expurgo de conteúdo aceita orçamento liberado e conserva os registros para a etapa financeira. As três suítes direcionadas passaram com 32 testes. Lint e tipos da API passaram antes do último ajuste de preservação de provisão.

A implementação permanece incompleta: ainda é necessário revisar identificadores e campos retidos fora do payload, concorrência entre encerramento e trabalhadores, ledger separado do piloto, exceções e reprocessamento/restauração; depois validar em PostgreSQL e executar CI do resultado final. A condição de checks aprovados para integração ainda não foi satisfeita.

## Continuação: validações de retenção

A restauração de snapshot SQLite de caso foi testada com conteúdo agêntico e reaplicou o expurgo; a verificação da restauração de conta recebeu cobertura para conversas e orçamentos residuais. As chaves de idempotência e chamada da inferência foram minimizadas, com teste de preservação do vínculo com operação e lançamento financeiro. Passaram os testes específicos de retenção financeira (7), restauração de conta (8), restauração de caso (5), lint dos arquivos de produção e tipos da API.

Uma execução da suíte geral apresentou falhas nos testes `libera saldo livre no cancelamento mas conserva cobertura de chamada em trânsito` e `mantém os 59 centavos históricos e reserva/retry/cancela sem tocar no billing da aplicação` e foi interrompida por ausência prolongada de progresso; suas duas suítes passaram isoladamente, com 34 testes. Como houve alterações de testes durante essa execução, ela não valida a árvore final. Persistem os testes de concorrência, ledger isolado, restauração de conta com banco real, PostgreSQL e suíte completa/CI do estado final. Não foi criado commit nem enviada integração.

## Suíte completa após os ajustes locais

A execução sequencial com `--maxWorkers=1 --testTimeout=15000` terminou com 1.216 testes aprovados e 17 ignorados em 203 arquivos. Os arquivos de produção de retenção passaram no lint e a API passou na verificação de tipos. O resultado é intermediário: ainda não cobre a sincronização transacional entre pedidos já autenticados e encerramento, a conciliação do ledger isolado e restauração real de conta, e não substitui CI sobre o resultado definitivo. Nenhuma integração foi enviada.
