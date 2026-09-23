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

## Incremento 8 — QA local

Em 22/09/2026, sobre a base publicada `a3cae57`, uma conta descartável percorreu
visão geral, conexão, guia, pesquisa, créditos, atividade, segurança, chaves e
documentação da API. A auditoria automatizada em 375×812, 768×1024, 1366×768,
1440×900 e 320×812 não encontrou rolagem horizontal, títulos `h1` duplicados,
landmarks `main` duplicados ou contraste textual abaixo do limiar WCAG AA nas
telas e estados observados. A medição de contraste é heurística (cores opacas
computadas), não substitui inspeção de estados sobrepostos, leitor de tela ou
auditoria formal de acessibilidade.

Os testes de teclado cobrem seleção do host, navegação lateral fechada e retorno
de foco ao fechar o menu por Escape. Ações móveis relevantes passaram a ter
alvo mínimo de 44 px. A URL de desenvolvimento `127.0.0.1` é identificada
como local e não pode ser copiada como se fosse uma URL MCP utilizável em host
remoto. Selecionar Claude apenas mostra instruções internas; não conecta nem
autentica uma conta Claude. Nenhum estado `Conectado` é inferido dessa seleção.

A revisão de copy removeu promessas não demonstradas de expiração ilimitada do
saldo e disponibilidade de Pix. A documentação da API deixou de repetir um
preço fixo na tela autenticada; o guia e a conta leem `searchCostCents` da API.
Se o faturamento ficar indisponível após uma carga anterior, créditos e
atividade deixam de apresentar o saldo antigo como atual.
O E2E usa resposta controlada para provar o preço variável no guia, saldo zero
com billing disponível, billing desabilitado, credencial revogada e serviço
indisponível. O teste de disponibilidade continua sem consultar saldo.

Na rodada final, `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (inclui build
web), `pnpm test` e E2E Chromium passaram: 463 testes unitários aprovados, 4
pulados e 21 E2E aprovados. O E2E usou somente um banco PostgreSQL descartável,
removido depois dos testes; nenhuma cobrança ou conexão de host externo foi
realizada. O runner E2E emitiu o aviso de ambiente `NO_COLOR`/`FORCE_COLOR`.
Na suíte unitária, o Vitest registrou um timeout ao encerrar um worker de
persistência após informar todos os testes aprovados (exit code 0); a mesma
classe de testes passou isoladamente (9 aprovados, 1 pulado) sem o aviso.

Esta evidência local não equivale a aceite de zoom nativo do navegador a 200%,
varredura completa por teclado/leitor de tela, comportamento dos hosts externos
ou publicação remota. Esses pontos continuam pendentes para o fechamento do
Incremento 8.
