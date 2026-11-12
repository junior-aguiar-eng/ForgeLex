# Execução comercial — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Concluir executor comercial, cobrança BRL e validação integral; integrar, publicar e ativar somente após os gates técnicos.
**Architecture:** Reutilizar ExecutionService/worker, NativeCaseContextService, AgenticCaseTask e OpenAI provider. Uma composição comercial distinta do piloto liga uma reserva persistente BRL à medição operacional em micro-USD, com limites transacionais e liquidação idempotente. A UI existente ganha autorização simples e recibo; nenhum detalhe técnico entra no fluxo normal.
**Tech Stack:** TypeScript, Fastify, Drizzle, SQLite/PostgreSQL, React, pnpm e Playwright existentes.
**Spec:** docs/operations/agentic-workspace/2026-10-30-commercial-proposal.md; pedido expresso de Boni neste chat em 30/10 autoriza implementação, integração, publicação e ativação após validação.

## Global Constraints

- Preservar piloto histórico encerrado, banco e provisão; sem reaproveitar saldo USD sintético.
- Política aprovada: BRL 500 centavos reservados por trabalho, mínimo 50, inferência até 250000 micro-USD; preço max(50, ceil(microUSD*1800/1000000 + 25)) centavos. Versão imutável por trabalho.
- Uma execução ativa por conta; até 24 chamadas, 2048 tokens de saída/chamada, 64000 bytes/request, 30 s/chamada, cinco minutos de execução; BRL 2000/dia e 10000/mês incluindo reservas. Períodos America/Fortaleza.
- Modelo gpt-6.1-sol Standard; entrada USD2/milhão, saída USD10/milhão, cache USD0.10/milhão. Sem pesquisa paga, fallback, ferramentas hospedadas ou retries automáticos.
- Sem entrega utilizável: zero débito ao cliente; incerteza externa permanece operacional, sem usage ou estorno inventados. Ledger BRL não financia valores USD diretamente.
- Auth e escopo de fontes revistos antes de cada envio; identidade e preço não vêm de parâmetros livres do cliente. Sem texto jurídico/prompt/chaves em logs.
- Boni é único aprovador humano; preço e limites já aprovados. Testes normais sem chamadas pagas; prova real de ativação restrita à conta de Boni/dados sintéticos e teto existente de USD0.25 para um novo trabalho comercial, sem reabrir piloto.
- Publicação preserva configurações existentes, backup/migrations aditivas se necessárias, flags fechadas até validação; não habilitar execução nativa no serviço privado de encerramento.

## Review Focus

Concorrência entre novas reservas e consultas existentes; retomada após crash entre dispatch e usage; cancelamento com custo desconhecido e sem entrega; revalidação de acesso após expurgo; continuação/correção que gere novo executionId sem escapar de autorização/limites.

## Task 1 — Finanças persistentes

Files: packages/billing-ledger/src/commercial-inference-service.ts e teste; schema e migrations do ledger; exports; integração necessária em ledger-service.ts para reservas não serem gastas por consultas concorrentes.
Interface: CommercialInferenceService com reserva/quote, authorizeCall, settleCall/markUncertain, finalize, getReceipt. Agente publica assinaturas concretas imediatamente para o integrador. Registro usa execução/tenant/user, chave e fingerprint; retém política, medição micro-USD e reserva BRL. Sem conteúdo jurídico.

- [x] Escrever testes RED de preço, limites, concorrência, idempotência, saldo insuficiente, cancelamento, custo incerto e retomada.
- [x] Implementar transações usando lock da conta e guarda por tenant; contabilizar reserva/débito/liberação em lançamentos persistentes.
- [x] Passar testes focados, build/tipos do pacote e enviar interface ao integrador.

## Task 2 — Runtime e API comercial

Files: apps/api/src/agentic-workspace/commercial-runtime.ts e testes, commercial-provider.ts ou refatoração compartilhada de real-provider.ts, execution-routes.ts, execution-service.ts, execution-worker.ts quando necessário, app.ts.
Interface pública: GET /api/agentic/commercial/quote retorna moeda BRL, policyVersion, minCostCents 50, maxCostCents 500, availableCents, dailyLimitCents 2000, monthlyLimitCents 10000. POST /api/agentic/commercial/executions aceita StartExecutionSchema + confirmed:true + policyVersion e Idempotency-Key. GET /api/agentic/commercial/executions/:id/receipt retorna reservado/cobrado/liberado, status. /actions sinaliza commercial:true. Respostas/correções/continuações existentes recebem a mesma autorização comercial no servidor antes de enfileirar novo ID.

- [x] Testes RED de composição fechada por padrão, autenticação, autorização, reserva antes de dispatch, falha sem HTTP, contexto revogado, fluxo com fake e cancelamento.
- [x] Compor provider real exclusivamente no servidor com flags próprias; compartilhar validação de transporte sem depender de fixture ou conta do piloto.
- [x] Finalizar financeiramente em terminal durável, incluindo falhas/crash e restart; HTTP incerto não é repetido. Impedir término com saldo preso ou débito indevido.

## Task 3 — Interface profissional

Files: apps/web/src/agentic-workspace/client.ts e componentes comerciais, AgenticWorkspaceScreen.tsx, modelo e testes, Dockerfile/cloudbuild apenas se coordenado com integrador.

- [x] Consumir os endpoints acima apenas quando /actions indicar commercial:true; exibir limite BRL e ação Iniciar trabalho, cancelar e recibo. Reusar erros/status, não inventar painéis técnicos.
- [x] Confirmar preço antes de cada novo trabalho/continuação paga; retry conserva chave. Não cobrar navegação, leitura, edição ou exportação. Preservar todo comportamento do piloto/fixtures.
- [x] Testes de contrato/UI e E2E com API e fake; responsividade e acessibilidade.

## Task 4 — Integração, retenção e gates

Files: testes/scripts PostgreSQL, retenção de conta/caso e minimização financeira, Dockerfile/cloudbuild, runbook e recibos.

- [ ] Cobrir novos registros no encerramento de conta, holds e restauração; bloquear expurgo financeiro pendente sem reconstruir dados apagados.
- [ ] Validar todo o percurso em SQLite e PostgreSQL, navegação, concorrência, interrupção e recuperação. Revisão técnica independente por ferramenta conforme skill; nenhum segundo aprovador humano.
- [ ] Build, lint, tipos, suíte geral, E2E pertinente e CI completa; integrar apenas com checks aprovados e acompanhar pós-merge.
- [ ] Backup, publicação com flags fechadas e configuração preservada; migrations explícitas somente necessárias. Validar serviços e saldo; ativar feature/worker público comercial e verificar uma execução sintética comercial de Boni dentro de USD0.25, sem alterar o piloto histórico.
- [ ] Registrar versão/digest, flags e recibo; confirmar comportamento e monitoramento. Se alguma condição técnica falhar, manter flag fechada e corrigir.
