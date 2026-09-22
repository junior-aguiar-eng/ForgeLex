# Contrato de onboarding MCP

**Estado:** congelado no Incremento 0 do marco de experiência do produto.
Este documento é a referência de copy, estados e instrumentação para as
interfaces de onboarding MCP. Ele não declara que um host específico esteja
conectado nem cria uma rota, credencial ou integração externa.

## Públicos e jornada

**Advogado.** Identifica o ForgeLex como fonte jurídica separada do host de
IA; entra na central de conexão, escolhe seu host, obtém instruções adequadas
ao host, executa a verificação gratuita e realiza a primeira pesquisa.

**Desenvolvedor.** Integra a API REST ou o MCP por configuração técnica,
documentação OpenAPI e chave de API. Esse percurso permanece separado do guia
orientado ao advogado: não deve ser apresentado como requisito para uso via
MCP.

## Estados de conexão

| Estado | Significado verificável | Copy vedada |
| --- | --- | --- |
| Não configurado | Não há evidência local de configuração do ForgeLex no host selecionado. | `Conectado` |
| Instruções disponíveis | O ForgeLex exibiu as instruções estáveis do host; isso não prova configuração. | `Conectado` ou `Ativo` |
| Credencial pronta | O usuário concluiu a etapa de credencial exigida pelo ForgeLex; isso não prova acesso do host. | `Conectado` |
| Conectado | Uma verificação iniciada pelo usuário obteve resposta autenticada do ForgeLex pelo caminho MCP aplicável. | `Ativo` sem a evidência de verificação |
| Falha de conexão | A verificação falhou ou não pôde confirmar o acesso; a interface informa a causa técnica saneada e uma ação de recuperação. | `Conectado` |

`Conectado` exige evidência de uma verificação MCP autenticada. Disponibilidade
do serviço, instruções exibidas e criação de credencial são estados distintos
e não autorizam essa copy.

## Taxonomia comercial

- `research.search_case_law` é a única operação jurídica faturável: pesquisa
  no índice próprio do STJ por execução válida, inclusive sem resultados. O
  valor público atual é **R$ 0,20**.
- `research.get_authority`, `research.verify_authority`, a listagem de
  tribunais, healthchecks e o teste de conexão são gratuitos e não geram
  débito.
- Créditos ForgeLex não remuneram host, modelo de IA, tokens, assinatura de
  terceiro ou contexto fornecido pelo usuário.

O valor exibido por interfaces autenticadas deve derivar de
`GET /api/v2/billing/account` (`searchCostCents`). A indicação de R$ 0,20 em
contratos públicos descreve a tarifa atual, mas não substitui essa fonte de
verdade para uma tela que mostre saldo ou preço vigente.

## Eventos de produto

Eventos permitidos: `connection_viewed`, `connection_started`,
`connection_verified`, `example_copied`, `first_search_completed` e
`connection_failed`.

Cada evento pode conter somente plataforma, estado, timestamp e
identificadores técnicos saneados. É proibido registrar consulta, ementa,
número processual, token, chave, header `Authorization`, argumentos de tool,
conteúdo da conversa, arquivo ou histórico do host.

## Contrato público conferido

O OpenAPI público mantém a mesma taxonomia: somente
`research.search_case_law` é `METERED`; obtenção e verificação de autoridade
são gratuitas. O MCP remoto usa a mesma infraestrutura jurídica da API REST e
não acessa conversas, arquivos ou histórico do host.

## Critério para os próximos incrementos

Interfaces de conexão, exemplos, pesquisa, documentação e billing devem usar
estes estados e esta taxonomia. Nenhuma tela pode afirmar conexão confirmada
sem a evidência definida acima ou apresentar cobrança para operação gratuita.
