# Integração comercial do editor — 05/11/2026

Implementação local no checkout `forgelex-3-audit/SDK`. Ativação produtiva, commit, push e deploy não executados. A validação usa transporte de inferência simulado; não houve nova chamada paga.

## Política e decisão de Boni

Reutiliza `commercial-brl-2026-10-30-v1`: reserva de R$ 5, mínimo de R$ 0,50 por revisão concluída, teto operacional de US$ 0,25 e limites compartilhados de R$ 20/dia e R$ 100/mês. Preço e limites vêm do ledger existente, sem cópia das fórmulas.

Em 05/11, Boni decidiu: **“Cobrar a revisão concluída, mesmo sem alterações”**. A cobrança exige resultado editorial validado e persistido, com consumo contabilizado pelo ledger. Falha sem resultado não gera débito do cliente. A política não transforma validação estrutural em aprovação jurídica.

A decisão de reutilizar a política está em `evidence/2026-11-04-editorial-release-preflight/ordering-and-policy-decisions.json`. A decisão posterior em `nov04-usage-and-proceed-decision.json` mantém D04-v8 como residual não bloqueante. Sua reserva de US$ 0,083620 e os ledgers anteriores foram preservados. A autorização do ensaio real anterior foi consumida.

## Implementação

- Composição editorial própria sobre `ExecutionService`, `ExecutionWorker`, `CommercialInferenceService` e o transporte editorial existente. Identidade financeira independente da execução que produziu a minuta; grafo v8 preservado.
- Comando idempotente e checkpoint inicial vinculados à entrega, minuta, versão e hash do contexto; conversa vinculada ao caso original para as regras de acesso e retenção. Resultado e finalização usam persistência e recuperação existentes. Nenhuma migration nova.
- Reserva em reais antes da ativação e autorização USD antes do envio. Revalidação de conta, contexto e cancelamento antes de transmitir. Uma tentativa; resposta incerta não dispara repetição. Liquidação recuperável pelo journal existente.
- Rotas autenticadas para disponibilidade, início, leitura, descoberta do último comando e cancelamento. A leitura histórica usa a autorização existente para histórico editorial; uma nova versão da minuta impede gerar/aplicar sobre a antiga, mas não impede consultar seu recibo.
- Painel confirma limite em reais e cobrança mesmo sem sugestões. Consulta o servidor antes de habilitar início, recuperando o último comando mesmo sem dados guardados na aba. O acompanhamento e a atualização do recibo são explícitos. Gerar nunca aplica alterações.
- Encerramento de conta reconhece os comandos editoriais terminais no mesmo procedimento de drenagem financeira, preservando custo operacional incerto.

## Ativação e operação

O bootstrap comercial só cria a composição editorial se `FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=true`, além dos requisitos comerciais já existentes. Nenhuma configuração de ambiente foi modificada. Não reutilizar autorização histórica de publicação para ativar esta entrega.

Antes de uma eventual publicação: escolher o SHA, revisar diff e CI, conferir banco/backup no alvo e decidir a ativação. Ao suspender o serviço, drenar ou reconciliar comandos em andamento antes de retirar seu worker; desligar a composição não apaga reservas nem liquida trabalhos pendentes. A descoberta histórica percorre páginas de comandos do proprietário, sem nova tabela ou índice específico; desempenho em contas com grande histórico não foi medido nesta tarefa.

## Validação

- Suíte integral: **1.780 aprovados, 17 condicionais ignorados, zero falhas** (245 arquivos descobertos no repositório; contagem de suites no relatório estruturado). A primeira tentativa encerrou sem resumo final e não foi contada como aprovação; a repetição gerou relatório completo.
- Focais em SQLite: **66 aprovados**.
- PostgreSQL em container descartável: **66 aprovados**, inclusive concorrência. A rodada inicial, concorrente com build/testes e alterações ainda em andamento, teve 12 timeouts e uma regressão ainda não corrigida. A execução final isolada passou sem alterar os limites de tempo.
- Navegador: **15 aprovados**, cobrindo perda de resposta, descoberta sem dados da aba, nova tentativa confirmada, chave pendente, histórico após edição humana e fluxo editorial existente. A sobreposição de avisos durante carregamento foi corrigida e a suíte inteira do painel passou depois.
- Build do monorepo aprovado; builds finais da API e web aprovados após os ajustes. Tipos da API/web, lint e formatação dos arquivos alterados aprovados; `git diff --check` sem erros.

[Recibo, hashes e relatórios](evidence/2026-11-05-editorial-commercial-integration/validation.json).

Os testes usam transporte simulado. Não medem a qualidade semântica de novos patches gerados por modelo real, não substituem CI e não atestam estado de produção. Nenhuma nova chamada paga foi realizada.
