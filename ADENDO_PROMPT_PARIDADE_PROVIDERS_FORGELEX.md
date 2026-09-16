# Adendo — Paridade operacional dos Agent Providers do FORGELEX

## Objetivo

Antes de iniciar o Segundo vertical slice, fechar a paridade entre os providers de agente suportados pelo FORGELEX. Anthropic e OpenAI devem ser tratados como entregas equivalentes. Nenhum provider pode ser considerado concluído apenas porque possui um adapter compilável ou testes unitários locais.

## Situação atual a considerar

- O contrato comum está em `packages/agent-core`.
- Existe o adapter Anthropic em `packages/agent-provider-anthropic`, baseado no Claude Agent SDK, com testes locais para credencial, conversão de schema, execução de ferramenta, aprovação humana e cancelamento.
- Existe o adapter OpenAI em `packages/agent-provider-openai`, baseado no OpenAI Agents SDK, com testes locais equivalentes para credencial, execução de ferramenta, aprovação humana e cancelamento.
- O primeiro vertical slice comercial já cobre autenticação, matter, documento com âncoras, pesquisa com proveniência, salvamento de authority, billing, auditoria e superfície MCP/REST.
- A existência desses adapters e testes não demonstra, sozinha, uma chamada operacional real nem a paridade comportamental entre Anthropic e OpenAI.
- A validação contra APIs externas depende de credenciais fornecidas por ambiente. Nenhuma chave deve ser criada, gravada, exibida ou incluída em logs, fixtures, snapshots ou commits.

## Escopo obrigatório

Executar uma auditoria e, se necessário, implementar as correções para que Anthropic e OpenAI cumpram o mesmo contrato `AgentProvider` e o mesmo fluxo comercial.

### 1. Auditoria do contrato comum

Verificar, para os dois providers:

- `run` e `cancel`;
- lifecycle events de início, conclusão e erro;
- eventos de pensamento/resposta e chamada/conclusão de ferramenta;
- propagação de `tenantId`, `userId`, `matterId` e `sessionId`;
- `AbortSignal`, timeout e cancelamento;
- validação de argumentos pelo `ToolRegistry`;
- provenance retornada pela ferramenta;
- política de aprovação humana para operações L4;
- limite de turnos;
- conversão de schemas Zod para o formato exigido por cada SDK;
- tratamento de resposta vazia, erro do SDK, erro de ferramenta e encerramento anormal.

Não transportar tipos ou detalhes específicos de Anthropic/OpenAI para `agent-core`, domínio ou ferramentas jurídicas.

### 2. Matriz de testes equivalente

Criar ou completar testes locais determinísticos para ambos os providers, usando injeção dos runtimes (`query`/runner) e sem chamada externa obrigatória. A matriz mínima deve cobrir:

| Comportamento | Anthropic | OpenAI |
|---|---:|---:|
| ausência de credencial falha fechado | obrigatório | obrigatório |
| schema de ferramenta convertido corretamente | obrigatório | obrigatório |
| execução de ferramenta de pesquisa | obrigatório | obrigatório |
| provenance preservada | obrigatório | obrigatório |
| tenant/user/matter propagados | obrigatório | obrigatório |
| aprovação humana para ferramenta mutável | obrigatório | obrigatório |
| cancelamento e abort | obrigatório | obrigatório |
| erro do runtime normalizado | obrigatório | obrigatório |
| limite de turnos | obrigatório | obrigatório |
| ausência de resultado final | obrigatório | obrigatório |

Os testes devem comparar invariantes do contrato, não detalhes acidentais de cada SDK.

### 3. Integração com o fluxo comercial

Demonstrar, para cada provider, o caminho:

```text
AgentProvider
  -> Agent Core
  -> Tool Registry
  -> research.search_case_law
  -> authority com provenance
  -> matter
  -> audit
  -> usage/billing
```

Criar um teste de integração por provider que confirme, no mínimo:

- autenticação do usuário/tenant;
- criação ou uso de um matter;
- execução de uma ferramenta de pesquisa;
- retorno de authority com proveniência verificável;
- preservação do contexto do matter;
- registro de auditoria;
- registro de usage/billing sem duplicidade;
- isolamento entre tenants;
- aprovação humana quando o agente tentar uma operação mutável.

O teste não deve depender de saldo ou estado compartilhado de outros testes.

### 4. Validação operacional externa

Se `ANTHROPIC_API_KEY` estiver disponível no ambiente de execução, executar uma chamada real mínima e segura contra a Anthropic. Se `OPENAI_API_KEY` estiver disponível, executar a chamada equivalente contra a OpenAI.

Cada chamada deve:

- usar uma ferramenta de análise não mutável;
- usar um prompt mínimo, sem dados pessoais ou autos reais;
- limitar turnos e custo;
- registrar apenas metadados não sensíveis;
- confirmar que o runtime recebe e devolve o contrato ForgeLex;
- confirmar que a ferramenta é executada pelo registry correto;
- confirmar que o resultado contém provenance quando a ferramenta a fornecer;
- confirmar cancelamento/erro sem deixar sessão pendente.

Se uma chave não estiver disponível, não simular sucesso. Registrar a validação externa como `BLOCKED_CREDENTIALS`, mantendo a validação local separada como `PASSED_LOCAL`. Se a API responder erro, registrar o status e a causa sem expor segredo.

A interface Claude não é requisito para validar a chamada direta à API Anthropic. Ela só deve ser usada em uma etapa adicional se o produto precisar comprovar o FORGELEX como MCP conectado à interface Claude.

### 5. Configuração e segurança

Verificar que:

- as chaves são lidas somente de variáveis de ambiente ou mecanismo seguro já previsto;
- valores de chaves não aparecem em exceções, eventos, logs, snapshots ou respostas HTTP;
- nenhum provider é escolhido silenciosamente por preferência não documentada;
- a seleção do provider é explícita e validada;
- o provider indisponível falha de modo identificável e fail-closed;
- o billing não registra uma cobrança duplicada em retry ou erro;
- o mesmo `idempotencyKey` mantém comportamento coerente entre providers.

## Critérios de aceite

Esta entrega só pode ser marcada como concluída quando:

1. Anthropic e OpenAI passarem pela mesma matriz de contrato e integração.
2. Os testes locais dos dois pacotes estiverem verdes.
3. O teste integrado de cada provider demonstrar uso de ferramenta, provenance, tenant, auditoria e billing.
4. A validação externa de cada chave disponível estiver concluída; a ausência de chave estiver registrada explicitamente como bloqueio, não como sucesso.
5. Não houver alteração específica que favoreça um provider em detrimento do outro sem justificativa documentada.
6. `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build` e `git diff --check` passarem.
7. O README e o plano distinguirem claramente: implementado, validado localmente, validado contra API real e bloqueado por credencial.
8. O diff for revisado para confirmar que não há segredo, fixture enganosa ou claim de paridade não demonstrada.

## Restrições de execução

- Preservar `AgentProvider`, `Agent Core`, `Tool Registry` e os contratos públicos existentes.
- Não substituir Anthropic por OpenAI nem OpenAI por Anthropic.
- Não iniciar o Segundo vertical slice antes de concluir esta entrega ou registrar formalmente o bloqueio externo de cada provider.
- Não adicionar dependência de interface Claude para uma validação que pode ser feita diretamente pela API Anthropic.
- Não transformar uma fixture local em evidência de chamada real.
- Não fazer push.
- Criar um commit próprio, somente depois dos critérios de aceite passarem.

## Saída obrigatória

Ao concluir, registrar em documentação versionada uma tabela com:

| Provider | Adapter | Testes locais | Integração ForgeLex | API real | Situação | Evidência |
|---|---|---|---|---|---|---|
| Anthropic | | | | | | |
| OpenAI | | | | | | |

Usar exclusivamente estados verificáveis: `PASSED_LOCAL`, `PASSED_INTEGRATION`, `PASSED_EXTERNAL`, `BLOCKED_CREDENTIALS` ou `FAILED`. Não declarar o projeto concluído enquanto a tabela não distinguir esses estados para os dois providers.
