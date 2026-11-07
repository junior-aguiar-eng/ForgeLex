# Prompt para reformulação do plano de conclusão do ForgeLex

> **Registro histórico da tarefa executada (2026-09-19):** este prompt descreve
> a reformulação que originou o plano versionado no SDK. O caminho canônico
> atual é `C:\Users\Boni Jr\.antigravity-ide\SDK\Plano de conclusão progressiva do F.md`.
> O arquivo antigo do Desktop indicado abaixo é referência histórica
> superseded e não deve ser editado por agentes futuros.

Você deve reformular o plano de conclusão progressiva do ForgeLex para que ele permaneça fiel ao projeto original, sem executar alterações no código nesta tarefa.

## Documento que deve ser editado

Edite exclusivamente este arquivo:

`C:\Users\Boni Jr\Desktop\Plano de conclusão progressiva do F.md`

Esse era o documento oficial de planejamento no momento da tarefa. Atualmente,
o documento canônico é o plano versionado no SDK; não edite esse caminho do
Desktop nem crie outro plano concorrente.

## Contexto obrigatório

Antes de editar, leia e compare:

- `C:\Users\Boni Jr\Desktop\Plano de conclusão progressiva do F.md`;
- `C:\Users\Boni Jr\.antigravity-ide\SDK\PROJETO_FORGELEX_PLATAFORMA_AGENTICA_JURIDICA_AGNOSTICA_V2_COMPLETO.md`;
- `C:\Users\Boni Jr\.antigravity-ide\SDK\PLANO_CONTINUIDADE_CODEX_FORGELEX.md`;
- `C:\Users\Boni Jr\Desktop\PROMPTS DE PROJETOS\PLANO_INTEGRACAO_SELETIVA_MCP_JURIDICO_BRASIL_FORGELEX.md`;
- estado atual do repositório ForgeLex, apenas para confirmar nomes de pacotes e fronteiras existentes.

Não altere código, testes, migrations, documentação do produto, OpenAPI, `.env`, Git ou qualquer arquivo do repositório. Esta tarefa é exclusivamente de revisão do plano localizado no Desktop.

## Problema que a reformulação deve corrigir

O plano atual rebaixou excessivamente a parte agêntica ao tratar o Agent Core e os adapters OpenAI/Anthropic como o centro da experiência agêntica, embora o projeto original previsse duas camadas distintas:

1. o MCP como superfície agêntica comercial, usada por ChatGPT, Claude ou outro host externo mediante prompts, descrições de ferramentas, schemas e chamadas sucessivas às tools do ForgeLex;
2. o Agent Core como runtime próprio e opcional para integrações que desejem executar agentes dentro de aplicações próprias.

Não confunda:

- prompt e instrução de uso;
- MCP como protocolo e superfície de ferramentas;
- Legal Tool Gateway como catálogo de operações jurídicas;
- Agent Core como runtime de agentes;
- adapters OpenAI/Anthropic como integrações opcionais.

O MCP não fornece modelo. O host externo fornece o modelo e o raciocínio. O ForgeLex fornece as ferramentas jurídicas, a base jurisprudencial, a proveniência, a autenticação, a autorização, os limites, a auditoria e a cobrança das operações próprias.

## Princípios que o novo plano deve preservar

### 1. Identidade do produto

Descrever o ForgeLex como uma plataforma de infraestrutura jurídica agêntica baseada em:

- ferramentas jurídicas verificáveis;
- prompts e workflows versionados;
- API REST;
- MCP remoto;
- autenticação e autorização;
- proveniência e auditoria;
- billing por operações jurídicas próprias;
- Agent Core opcional.

Não reduzir o ForgeLex a um buscador jurisprudencial simples nem transformá-lo em fornecedor de modelos de IA.

### 2. Ordem de prioridade

O plano deve deixar claro que a prioridade comercial é:

```text
Legal Data Plane
→ Legal Tool Gateway
→ API REST e MCP
→ prompts e workflows agênticos
→ Agent Core opcional
→ adapters opcionais de providers
```

API REST e MCP são dois canais para a mesma infraestrutura jurisprudencial própria. O Agent Core não pode ser pré-requisito para a operação da API ou do MCP.

### 3. Modelo comercial

Preservar expressamente:

- o ForgeLex não fornece modelo de IA;
- não recebe chaves OpenAI/Anthropic do advogado;
- não cobra tokens;
- não calcula margem sobre tokens de terceiros;
- não converte custo de modelo em USD/BRL;
- não envia eventos de consumo de tokens ao ledger comercial;
- cobra operações executadas na própria infraestrutura, inicialmente buscas jurisprudenciais do STJ;
- o custo de ChatGPT, Claude, OpenAI, Anthropic ou outro modelo pertence ao cliente, host ou integrador.

Uma pesquisa agêntica deve ser descrita como composição de operações jurídicas, e não como consumo de tokens:

```text
pesquisa agêntica
= chamadas de ferramentas jurídicas do ForgeLex
+ eventual operação composta ou taxa de workflow definida futuramente
```

Não fixar no plano uma taxa de R$ 0,20 como se ela cobrisse uma pesquisa agêntica inteira. R$ 0,20 é inicialmente o preço unitário de uma busca jurisprudencial, salvo alteração comercial posterior expressamente aprovada.

### 4. MCP como superfície agêntica comercial

O plano deve possuir uma seção própria explicando que o MCP:

- publica um pacote controlado de ferramentas jurídicas;
- fornece descrições semânticas, schemas, capabilities e erros estruturados;
- pode ser acionado repetidamente pelo host durante uma pesquisa;
- autentica o usuário;
- aplica autorização, limites, idempotência, auditoria e billing;
- não recebe conversas completas, arquivos ou histórico do usuário;
- não acessa o contexto do ChatGPT ou Claude além dos argumentos enviados à ferramenta;
- retorna jurisprudência, ementas, metadados, proveniência e status de verificação;
- usa os mesmos application services da API REST.

Registrar também que o comportamento agêntico pode ocorrer no host externo por meio de prompts e chamadas encadeadas ao MCP, sem execução de um modelo dentro do ForgeLex.

### 5. Agent Core como camada opcional

Manter no plano:

- `packages/agent-core`;
- `packages/agent-provider-openai`;
- `packages/agent-provider-anthropic`;
- `FakeAgentProvider`;
- lifecycle de sessões;
- streams;
- timeout;
- cancelamento;
- aprovação humana;
- erros de provider;
- testes de paridade.

Mas redefinir o papel desses componentes:

- são uma opção para integradores ou para uma futura experiência interna do ForgeLex;
- reutilizam os mesmos contratos de tools do Legal Tool Gateway;
- não substituem o MCP;
- não são necessários para API REST ou MCP;
- não definem o modelo comercial;
- não geram cobrança de tokens;
- seus metadados de tokens permanecem externos ao ledger ForgeLex.

## Reformulação obrigatória das fases

Não apague a lógica de completude progressiva. Cada fase ainda deve ser concluída integralmente antes do início da seguinte. Reorganize as fases para refletir a seguinte dependência:

### Fase 0 — Baseline comercial e escopo inicial do STJ

Preservar o STJ como único tribunal comercial inicial. Confirmar também que o primeiro caso agêntico comercial será o uso do MCP por host externo, com modelo e raciocínio fornecidos pelo host.

### Fase 1 — Fundação persistida do Legal Data Plane

Preservar a base própria, ingestão, versões, hashes, proveniência, cobertura histórica e busca sem dependência de consulta live para a operação comercial.

### Fase 2 — Legal Tool Gateway e contratos agênticos

Além das tools jurídicas, incluir:

- schemas de entrada e saída;
- descrições semânticas para modelos;
- prompts/instruções versionados;
- capabilities;
- pré-condições;
- limites;
- erros estruturados;
- classificação da operação faturável;
- critérios de aprovação humana;
- versão do contrato da tool.

### Fase 3 — API REST e MCP equivalentes

Consolidar os dois canais sobre os mesmos application services, com equivalência de:

- resultado;
- proveniência;
- autenticação;
- autorização;
- idempotência;
- erros;
- limites;
- cobrança.

### Fase 4 — Primeiro fluxo agêntico verificável pelo MCP

Criar e validar o fluxo:

```text
pergunta do usuário
→ seleção de tool pelo host
→ busca jurisprudencial
→ eventual verificação de autoridade
→ retorno estruturado
→ síntese pelo host
```

Não exigir Agent Core nem modelo hospedado pelo ForgeLex para concluir essa fase.

Testar chamadas encadeadas, cobrança por operação, replay idempotente, ausência de contexto indevido, tribunal não habilitado, fonte indisponível e ausência de autoridade inventada.

### Fase 5 — Agent Core próprio e adapters opcionais

Renomear a fase atual para deixar claro que ela não é o núcleo do produto comercial.

Objetivo recomendado:

> Completar o runtime próprio de agentes como camada opcional de integração, usando as mesmas tools e contratos do ForgeLex, sem torná-lo requisito da API ou do MCP e sem transferir ao ForgeLex o custo ou o billing dos modelos utilizados pelo integrador.

O gate deve exigir isolamento, testes locais completos, paridade dos adapters e ausência de qualquer efeito sobre o ledger comercial, mas não deve exigir que o Agent Core seja usado para executar o MCP.

### Fases posteriores — Workflows jurídicos e expansão controlada

Descrever workflows como composição de tools, prompts, schemas, gates, proveniência e aprovação humana. Cada workflow deve poder ser executado pelo MCP, pelo Agent Core ou por uma integração própria via API, sem criar implementações jurídicas paralelas.

Preservar o bloqueio de expansão para outros tribunais até o gate definido no plano. Não antecipar STF, TST, TJSP, TJRJ ou TRF3.

## Critérios contra desvirtuamento

Adicionar ao final do plano uma seção de governança com estas perguntas obrigatórias para qualquer nova etapa:

1. A mudança melhora a capacidade do ForgeLex de fornecer ferramentas jurídicas verificáveis?
2. A mesma capability funciona por API REST e MCP?
3. O host externo pode usar a capability sem o ForgeLex fornecer modelo?
4. Se houver modelo, o custo e as credenciais permanecem fora do billing ForgeLex?
5. A mudança preserva a separação entre dados globais do corpus, contexto do tenant e billing?

Se a resposta for negativa, a etapa deve ser marcada como fora de escopo, dependência futura ou decisão que exige nova aprovação.

## Forma de execução da tarefa

1. Faça uma cópia textual mental do plano atual antes de editar e preserve tudo que não contradiga os princípios acima.
2. Edite diretamente o arquivo oficial do Desktop.
3. Não altere o código do repositório.
4. Não crie outro plano concorrente.
5. Não faça commit, push, deploy ou migration.
6. Revise títulos, objetivos, áreas, implementação, testes e gates de todas as fases afetadas.
7. Procure e corrija linguagem que trate OpenAI/Anthropic como produto, runtime comercial obrigatório, fonte de receita ou dependência da API/MCP.
8. Procure e corrija linguagem que reduza o MCP a um simples adapter técnico e omita prompts, descrições de ferramentas, workflows ou chamadas encadeadas.
9. Preserve o histórico conceitual do Agent Core; apenas reposicione-o como camada opcional.
10. Ao terminar, valide que nenhuma fase posterior depende de uma funcionalidade que o plano adiou para uma fase posterior.

## Resultado esperado

O documento final deve deixar inequívoco que:

```text
ForgeLex = infraestrutura jurídica própria + tools + prompts/workflows + API + MCP

Agent Core = runtime opcional para integrações próprias

OpenAI/Anthropic = providers externos, nunca produto ou billing do ForgeLex

Receita ForgeLex = operações jurídicas executadas na infraestrutura própria
```

Ao final da edição, responda apenas com:

- caminho do arquivo editado;
- resumo objetivo das seções reformuladas;
- confirmação de que nenhum arquivo do código foi alterado.
