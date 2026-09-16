# Prompt de correção visual — ForgeLex

## Contexto

Você está trabalhando no frontend web do ForgeLex, localizado em `apps/web`.
O produto é uma aplicação jurídica web centrada no caso concreto. A interface deve transmitir precisão, confiança e simplicidade operacional. A complexidade técnica de API, provedores, auditoria, billing, âncoras e níveis de impacto deve permanecer subordinada à experiência do advogado.

Foram fornecidos screenshots do estado atual da aplicação nas telas de:

- Início;
- Pesquisa;
- Casos / Matter Workspace;
- Painel;
- Draft Studio;
- Conexões e Provedores;
- Créditos e Faturamento;
- API e Docs.

Os screenshots devem ser tratados como evidência visual do problema atual, não como referência estética a ser preservada.

## Diagnóstico visual obrigatório

O estado atual apresenta os seguintes problemas:

1. A navegação principal está excessivamente carregada. O cabeçalho expõe simultaneamente Início, Research Desk, Casos, Painel, Conexões, Créditos, API & Docs, saldo, botão de ação e, em algumas versões, Draft Studio.
2. O cabeçalho não se adapta proporcionalmente à largura da janela. Os screenshots de Draft Studio, Conexões, Créditos e API exibem overflow horizontal e elementos cortados na extremidade direita.
3. O conteúdo utiliza uma largura máxima excessiva em relação à janela e não possui comportamento responsivo confiável. A aplicação deve caber na viewport sem barra horizontal em resoluções desktop comuns.
4. Há mistura inadequada de português e inglês na experiência do usuário: `Research Desk`, `Draft Studio`, `API & Docs`, `Matter Workspace`, `L0_OBSERVATION`, `L1_ANALYSIS` e outros identificadores técnicos aparecem na navegação ou em títulos destinados ao advogado.
5. A tipografia não está suficientemente padronizada. Títulos editoriais, textos auxiliares, labels, badges e código parecem pertencer a hierarquias diferentes sem uma escala tipográfica consistente.
6. O logo, a navegação, o saldo e o botão principal competem pelo mesmo espaço horizontal.
7. O rodapé é grande, repetitivo e visualmente pesado para uma aplicação de trabalho. Ele ocupa área significativa e repete navegação e claims técnicos em todas as telas.
8. Há excesso de cartões, badges, indicadores e chamadas comerciais. A composição se aproxima de uma landing page ou dashboard demonstrativo, não de uma ferramenta jurídica de uso diário.
9. O Matter Workspace ainda apresenta acesso por token Bearer e detalhes de infraestrutura diretamente ao usuário, o que é aceitável para desenvolvimento, mas inadequado como experiência principal do advogado.
10. A aplicação expõe configurações de provedores, chaves, playground de API, níveis de impacto e detalhes de MCP como se fossem áreas de uso comum. Esses recursos devem ser segregados por perfil ou ficar em uma área técnica secundária.
11. A interface usa grandes espaços vazios em algumas telas e excesso de blocos em outras, sem uma composição comum de container, ritmo vertical e densidade.
12. Existem títulos e labels em inglês mesmo quando o restante da tela está em português. A linguagem visível ao advogado deve ser integralmente português-BR.
13. A barra superior e o rodapé aparecem como molduras pesadas e idênticas em todas as telas, reduzindo a área útil para o trabalho.

## Objetivo

Refatorar a experiência visual do frontend para que o ForgeLex pareça uma aplicação jurídica profissional, limpa e coerente, sem reduzir as capacidades já implementadas.

O resultado deve ser poderoso nos serviços internos e simples para o usuário. O usuário deve trabalhar em um caso, e não navegar por uma coleção de ferramentas técnicas.

## Direção de produto

Adote o seguinte princípio:

> Complexidade no backend; simplicidade no fluxo do advogado.

A experiência principal deve conduzir o usuário por este percurso:

```text
abrir um caso
→ adicionar ou consultar documentos
→ revisar fatos e provas
→ pesquisar fontes
→ elaborar ou revisar um rascunho
```

As capacidades devem aparecer dentro do contexto do caso, com revelação progressiva. Não criar uma tela ou item de navegação para cada entidade ou tool interna.

## Alinhamento de navegação e experiência

Adote uma hierarquia semelhante à de um aplicativo profissional de trabalho:

```text
fluxo jurídico principal
→ Casos | Pesquisa | Rascunhos | Revisão

área secundária/administrativa
→ Configurações | Créditos | Conta

área demonstrativa e técnica
→ Como funciona | API & Docs | Integrações
```

Não colocar todas essas áreas no mesmo nível visual. A referência de produto fornecida pelo solicitante demonstra uma separação clara entre navegação operacional, administração da conta e documentação técnica. O ForgeLex deve preservar sua identidade jurídica, mas adotar essa mesma lógica hierárquica.

### Elementos que devem ser corrigidos explicitamente

- **“Acesso técnico da sessão”** não deve aparecer como bloco destacado no fluxo normal. Se for indispensável para o ambiente de desenvolvimento, deve ficar recolhido em “Detalhes técnicos” ou ser condicionado ao modo técnico.
- **“Saldo”** no cabeçalho só deve aparecer quando vier de uma conta real autenticada. Sem saldo carregado, conta ou resposta do backend, ocultar o valor e usar uma indicação neutra, como “Conta” ou “Créditos”, sem inventar quantia.
- **Pesquisa e Rascunhos** devem continuar em português e como fluxos jurídicos principais. Não exibir nomes técnicos de tools, providers, IDs ou níveis de impacto nessas telas.
- **Tela inicial** não deve funcionar como catálogo de quatro produtos fictícios. Reduzir os quatro cartões de ação ou convertê-los em recomendações contextuais, sem dados ou promessas não comprovadas. A ação central deve ser iniciar uma pesquisa ou abrir um caso.
- **Revisão** deve ser uma fila contextual de pendências reais, não um dashboard com métricas estáticas. Sem atividade real, mostrar estado vazio orientado, sem números como “142”, “38”, “64” ou “2”.
- **Rodapé** deve permanecer discreto e separar claramente “Área técnica” do trabalho jurídico. Não repetir uma lista extensa de navegação nem claims técnicos em todas as telas.

### Critério de densidade

O objetivo não é preencher todos os espaços. O objetivo é equilibrar clareza e orientação:

```text
sem dados
→ estado vazio explicativo + uma ação principal

com poucos dados
→ conteúdo real + contexto suficiente

com muitos dados
→ filtros, agrupamento e detalhes sob demanda
```

Não preencher espaços vazios com cards, gráficos, métricas ou resultados fictícios. A interface deve parecer calma quando não há dados, mas nunca abandonada ou sem orientação.

## Arquitetura visual desejada

### Navegação principal

Reduzir a navegação visível ao essencial para o advogado. A proposta preferencial é:

```text
Casos | Pesquisa | Rascunhos | Revisão
```

O Painel pode ser incorporado à página inicial ou permanecer como uma visão resumida, sem competir com Casos.

Conexões, Créditos, API, MCP, provedores e configurações devem ficar em um menu secundário de conta/administração ou em uma área técnica claramente separada. Não devem disputar espaço com o fluxo jurídico principal.

Se a implementação atual ainda não possuir autenticação de interface suficiente para essa separação, preserve a funcionalidade, mas não a apresente como navegação principal do advogado.

### Caso como centro

O `Matter Workspace` deve ser a tela central da aplicação. Na interface, use português-BR:

- Caso;
- Documentos;
- Fatos e provas;
- Linha do tempo;
- Fontes;
- Rascunhos;
- Revisão;
- Atividade.

Esses itens devem ser seções ou abas internas do caso, não ferramentas independentes no cabeçalho.

### Draft Studio

O recurso de drafting deve aparecer como “Rascunhos” ou “Rascunho do caso”. Não exponha `Draft Studio` como marca técnica na navegação do advogado.

O primeiro fluxo deve ser compacto:

```text
estrutura do rascunho
→ conteúdo da seção
→ fontes vinculadas
→ pendências de revisão
→ histórico de versões
→ aprovação
```

Não criar um editor de texto completo, uma central de ferramentas ou uma tela com painéis independentes para cada contrato interno.

### Área técnica

Manter API, MCP, provedores, chaves, playground, créditos e níveis de impacto disponíveis para o perfil adequado, mas remover esses elementos da experiência principal. A interface técnica pode ter sua própria área de administração/documentação.

## Regras de layout e responsividade

1. Eliminar completamente o overflow horizontal em desktop, notebook e larguras intermediárias.
2. Usar um container global consistente, com largura máxima razoável e gutters laterais simétricos.
3. O cabeçalho deve ser flexível. Ele não pode depender de todos os itens caberem em uma única linha.
4. Em larguras menores, recolher a navegação em menu; não reduzir fontes até ficarem ilegíveis nem deixar elementos cortados.
5. Impedir que o botão principal, o saldo ou badges empurrem o conteúdo para fora da viewport.
6. Usar grid responsivo com colunas que possam se transformar em uma coluna sem quebrar os cards.
7. Remover alturas fixas desnecessárias, margens que criem áreas vazias excessivas e larguras fixas em formulários.
8. Garantir que textos longos, títulos, badges e botões possam quebrar ou ser truncados de modo controlado.
9. Aplicar `box-sizing: border-box` de forma global, verificar imagens/ícones e corrigir qualquer elemento com largura superior à viewport.
10. Validar visualmente pelo menos em 1440px, 1280px, 1024px e 768px de largura.

## Regras de tipografia

1. Definir uma escala tipográfica única para títulos, subtítulos, labels, corpo, metadados e ações.
2. Usar a fonte editorial apenas para títulos e elementos de marca; usar a fonte de interface para corpo, formulários, navegação e dados.
3. Padronizar peso, line-height, letter-spacing e cor por nível hierárquico.
4. Evitar títulos gigantes em telas operacionais. O título deve respeitar a densidade da tarefa.
5. Não usar inglês na interface destinada ao advogado.
6. Reservar fonte monoespaçada para código, hashes e identificadores técnicos em áreas técnicas.
7. Remover labels artificiais ou excessivamente promocionais, como “V2 AGNÓSTICA”, “Nível Forense L4 Guard” e claims semelhantes, da navegação e do conteúdo operacional quando não forem necessários.

## Regras de componentes

1. Reduzir o número de cards e usar cards somente quando houver uma decisão ou informação realmente distinta.
2. Preferir uma composição de workspace com uma área principal e uma coluna contextual pequena, em vez de quatro ou cinco cards equivalentes.
3. Reduzir bordas, sombras, badges e fundos decorativos.
4. Padronizar botão primário, secundário, discreto, estado de carregamento e estado desabilitado.
5. Não usar badges para comunicar informações que poderiam ser texto simples.
6. Estados vazios devem orientar a próxima ação do usuário, sem apresentar dados simulados.
7. Não mostrar tokens, IDs, hashes completos, nomes de tools ou payloads na experiência jurídica cotidiana.
8. Exibir proveniência, origem documental e conflitos de maneira contextual, com detalhes sob demanda.
9. Preservar acessibilidade: foco visível, contraste adequado, labels associados, navegação por teclado e tamanhos de toque razoáveis.
10. Evitar que a tela de Revisão replique a estrutura de um painel analítico quando a tarefa real for apenas revisar pendências.
11. Usar uma ação principal por contexto; não apresentar vários CTAs equivalentes no mesmo bloco.
12. Quando uma tela estiver vazia, explicar o que falta e oferecer o próximo passo real, sem criar conteúdo de demonstração não identificado.

## Tradução da experiência

Substituir os termos visíveis ao usuário, quando estiverem em áreas jurídicas, por:

| Termo técnico atual | Texto de interface |
|---|---|
| Research Desk | Pesquisa jurídica |
| Matter Workspace | Área do caso |
| Draft Studio | Rascunhos |
| API & Docs | Área técnica ou Documentação da API |
| Connections | Configurações de modelos |
| Evidence Coverage | Cobertura das provas |
| Fact Source Link | Origem do fato |
| Anchor | Trecho de origem |
| Review Findings | Pendências de revisão |
| L0–L4 | Níveis de autorização, somente na área técnica |

Identificadores em inglês podem permanecer no código, contratos, rotas e API. Eles não devem aparecer como linguagem principal na interface do advogado.

## Escopo técnico

1. Trabalhar prioritariamente em `apps/web/src`.
2. Preservar contratos, serviços, endpoints e persistência existentes, salvo quando uma mudança for indispensável para a apresentação.
3. Não reescrever o backend.
4. Não criar uma segunda arquitetura de frontend.
5. Não remover funcionalidades apenas para esconder problemas de implementação.
6. Reorganizar a navegação e as telas existentes para que o caso seja o centro.
7. Isolar visualmente a área de desenvolvedor/administração da área jurídica.
8. Remover dados e claims demonstrativos que possam sugerir recursos não comprovados.
9. Não introduzir novas dependências sem necessidade.
10. Preservar alterações de drafting e demais mudanças existentes na árvore de trabalho; não usar reset destrutivo nem sobrescrever trabalho alheio.

## Critérios de aceitação

Considere a correção concluída somente se todos os critérios abaixo forem atendidos:

- não existe barra de rolagem horizontal nas larguras de validação;
- o cabeçalho não corta itens nem força o botão para fora da tela;
- a navegação principal contém somente os fluxos jurídicos essenciais;
- API, MCP, provedores, chaves e níveis de impacto não aparecem como ferramentas principais do advogado;
- a experiência jurídica está integralmente em português-BR;
- `Matter Workspace` é apresentado como o centro da aplicação;
- fatos, provas, documentos, pesquisa, rascunhos e revisão aparecem como partes do caso;
- o layout possui container, espaçamento e densidade consistentes entre as telas;
- fontes, pesos, tamanhos e line-heights seguem uma escala comum;
- cards, badges e sombras foram reduzidos ao necessário;
- o rodapé não domina a tela nem repete excesso de navegação;
- “Acesso técnico da sessão” não aparece aberto no fluxo jurídico normal;
- o saldo não é exibido como valor fictício quando não houver resposta real da conta;
- a tela inicial não funciona como catálogo de quatro ações mockadas sem contexto;
- Revisão mostra atividade real ou um estado vazio orientado, sem métricas pré-preenchidas;
- a navegação separa claramente trabalho jurídico, administração e área técnica;
- estados vazios não apresentam dados fictícios como se fossem reais;
- a interface permanece utilizável sem token técnico visível no fluxo cotidiano, quando a camada de autenticação permitir essa separação;
- não há regressão funcional nas rotas de pesquisa, casos, documentos, rascunhos e revisão já existentes;
- o build do frontend continua verde;
- `pnpm typecheck`, `pnpm test`, `pnpm build` e `git diff --check` passam ao final;
- o diff é revisado e não inclui o arquivo do plano nem alterações não relacionadas.

## Ordem de execução

1. Inspecionar o estado atual da árvore de trabalho e preservar alterações existentes.
2. Corrigir primeiro o container global, overflow e cabeçalho.
3. Reduzir e reorganizar a navegação principal.
4. Padronizar tokens visuais, fontes, tamanhos e espaçamentos.
5. Reorganizar o Matter Workspace como centro da experiência.
6. Integrar Rascunhos e Revisão sem criar uma nova camada de ferramentas independentes.
7. Mover a área técnica para contexto secundário.
8. Revisar textos visíveis e remover claims não demonstrados.
9. Executar o frontend em diferentes larguras e realizar inspeção visual das telas.
10. Rodar as validações finais e revisar o diff.

## Entrega esperada

Entregue uma refatoração visual funcional, não apenas uma alteração cosmética. Informe:

- telas e componentes alterados;
- problemas de layout corrigidos;
- itens removidos da navegação principal e onde foram realocados;
- termos traduzidos;
- larguras utilizadas na validação visual;
- comandos executados e resultados;
- limitações que permanecerem.

Não considere o trabalho concluído apenas porque o frontend compila. A aceitação depende de a aplicação deixar de parecer um painel técnico fragmentado e passar a funcionar visualmente como um workspace jurídico profissional, limpo e centrado no caso.
