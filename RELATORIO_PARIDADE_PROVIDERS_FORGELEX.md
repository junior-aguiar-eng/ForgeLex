# Relatório — Paridade operacional dos Agent Providers

Data da validação: 2026-09-16.

Esta entrega executa o `ADENDO_PROMPT_PARIDADE_PROVIDERS_FORGELEX.md` com a
mesma matriz local para Anthropic e OpenAI. Os runtimes foram injetados nos
testes; nenhuma fixture local é apresentada como chamada real de API.

## Resultado verificável

| Provider | Adapter | Testes locais | Integração ForgeLex | API real | Situação | Evidência |
|---|---|---|---|---|---|---|
| Anthropic | `PASSED_LOCAL` | `PASSED_LOCAL` | `PASSED_INTEGRATION` | `BLOCKED_CREDENTIALS` | `BLOCKED_CREDENTIALS` | `packages/agent-provider-anthropic/src/anthropic-agent-provider.test.ts`; `apps/api/src/provider-parity.test.ts` |
| OpenAI | `PASSED_LOCAL` | `PASSED_LOCAL` | `PASSED_INTEGRATION` | `BLOCKED_CREDENTIALS` | `BLOCKED_CREDENTIALS` | `packages/agent-provider-openai/src/openai-agent-provider.test.ts`; `apps/api/src/provider-parity.test.ts` |

## O que foi validado localmente

Os dois adapters passaram, de forma equivalente, por ausência de credencial,
conversão de schema, execução de ferramenta, proveniência, propagação de
tenant/usuário/matter/sessão, aprovação L4, cancelamento, timeout, erro do
runtime, limite de turnos e ausência de resultado final. Os erros dos runtimes
também são sanitizados para não reproduzir a chave configurada em eventos.

O teste integrado percorre `AgentRuntime`, `ToolRegistry`,
`research.search_case_law`, proveniência, persistência no matter, auditoria,
usage/billing idempotente e isolamento entre tenants. A operação faturável é
reexecutada com a mesma `idempotencyKey` e produz um único `UsageEvent`.

## Validação externa

Em 2026-09-16, `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` não estavam disponíveis
no ambiente de execução. Nenhuma chamada externa foi iniciada. Por isso, o
estado correto é `BLOCKED_CREDENTIALS`, separado dos estados locais aprovados;
não há claim de `PASSED_EXTERNAL`.

O Segundo vertical slice permanece bloqueado pelo gate externo de cada
provider até que as respectivas credenciais sejam fornecidas em ambiente
seguro e a chamada mínima, não mutável e sem dados reais seja executada.
