# Legal Tool Gateway

O gateway canônico da Fase 2 está em
`packages/legal-tools/src/gateway/legal-tool-gateway.ts`. Ele publica somente
as capabilities comerciais STJ abaixo, cada uma com contrato `1.0.0`, schemas
Zod de entrada e saída, timeout de 15 segundos, cancelamento e envelope de
proveniência retornado pelo serviço jurídico.

| Tool | Operação | Aprovação humana | Billing |
| --- | --- | --- | --- |
| `research.search_case_law` | observação | não exigida | `METERED`, uma busca STJ por R$ 0,20 |
| `research.get_authority` | observação | não exigida | `FREE` |
| `research.verify_authority` | observação | não exigida | `FREE` |

O contrato exige o escopo `research:read` e limita todas as tools ao STJ.
`UNSUPPORTED_COURT`, `UNAUTHORIZED_CAPABILITY`,
`SOURCE_PROVIDER_UNAVAILABLE`, indisponibilidade do data plane, entradas
inválidas, timeout e cancelamento são estados semânticos do contrato. O MCP
serializa erros de execução em `error.data` com `code`, `message`, `retryable`
e, quando aplicável, `details`.

REST e MCP expõem o mesmo contrato: o OpenAPI projeta-o em
`x-forgelex-tool-contract` e o MCP em `x-forgelex-contract`. Nenhuma projeção
cria service jurídico paralelo. A validação de saída ocorre no `ToolRegistry`
antes de a resposta seguir para o host.

As instruções e o workflow de pesquisa de autoridade ficam em
`packages/legal-workflows/src/agentic-contracts.ts`, ambos na versão `1.0.0`.
Eles orientam a sequência pesquisar, obter e verificar, e vedam inventar
autoridade ou completar metadados não localizados. São artefatos consumíveis
por hosts; não são prompt privado, modelo ou runtime do ForgeLex.

ChatGPT/OpenAI, Claude/Anthropic e REST são hosts compatíveis. O host fornece
modelo, raciocínio, contexto e credenciais próprias; o ForgeLex recebe somente
argumentos da tool e fornece dados indexados, proveniência, autorização,
auditoria e cobrança da operação jurídica própria. Não há chave Anthropic ou
OpenAI, métrica de token, preço de modelo ou margem de provider no gateway.
