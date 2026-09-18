# Relatório — Paridade operacional dos Agent Providers

Data da validação: 2026-09-16.

Este é um relatório técnico de adapters opcionais e não descreve o modelo
comercial vigente. O ForgeLex não fornece modelos de IA, não recebe chaves
OpenAI/Anthropic e não cobra tokens. API REST e MCP cobram somente operações da
infraestrutura jurisprudencial própria; qualquer modelo usado pelo
desenvolvedor ou pelo host do MCP fica fora desse billing.

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
`research.search_case_law`, proveniência, persistência no matter, auditoria e
isolamento entre tenants. O uso de billing registrado nesses testes é legado
de validação técnica e não representa cobrança de tokens nem um modelo
fornecido pelo ForgeLex.

## Validação externa

Em 2026-09-16, `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` não estavam disponíveis
no ambiente de execução. Nenhuma chamada externa foi iniciada. Por isso, o
estado correto é `BLOCKED_CREDENTIALS`, separado dos estados locais aprovados;
não há claim de `PASSED_EXTERNAL`.

Nenhum gate comercial depende de credenciais desses providers. Chamadas
externas, quando realizadas, são testes opcionais de integração dos adapters e
devem ocorrer fora da configuração operacional do ForgeLex.
