# Adendo ao prompt de correção visual — ForgeLex

## Finalidade

Este documento complementa `PROMPT_CORRECAO_UI_FORGELEX.md`.

Não reinicie a refatoração, não reverta o commit `60ca253` e não descarte funcionalidades já implementadas. Use este adendo para corrigir três pontos identificados na auditoria do histórico completo e do código atual:

1. preservar `API & Docs` como área demonstrativa e técnica;
2. remover dados estáticos apresentados como se fossem reais;
3. reorganizar o `Draft Studio` já implementado sem transformar a interface em um painel fragmentado.

## Evidência do estado atual

O histórico local demonstra a seguinte evolução visual:

```text
8a7f161  base visual com Landing, Painel, Conexões, Créditos e API & Docs
736c623  inclusão do Research Desk
67b995f  inclusão do Matter Workspace e documentos
9cb883f  inclusão visual de fatos, provas, cobertura e timeline
60ca253  inclusão do Draft Studio e revisão humana
```

O problema atual é acumulativo: cada capacidade foi adicionada à aplicação sem uma consolidação posterior da navegação, dos dados e da hierarquia visual.

## Regra central

O ForgeLex deve ser real nos dados e simples na experiência:

```text
dados reais quando disponíveis
→ estado vazio honesto quando não houver dados
→ linguagem jurídica simples para o advogado
→ detalhes técnicos somente no contexto apropriado
```

Não usar conteúdo mockado para preencher visualmente a aplicação como se representasse uma conta, uma equipe, uma busca, um saldo ou uma conexão reais.

## API & Docs deve permanecer

Não remover, ocultar definitivamente ou descaracterizar a seção `API & Docs`.

Ela possui duas finalidades legítimas:

### Demonstração do produto

Destinada a advogados, decisores e visitantes que precisam entender:

- o que o ForgeLex faz;
- como uma pesquisa é realizada;
- como a fonte é apresentada;
- como a rastreabilidade funciona;
- como documentos, casos e rascunhos se conectam;
- quais integrações são possíveis.

Essa camada deve usar linguagem acessível, exemplos explicativos e resultados identificados como demonstração quando não forem dados reais.

### Documentação técnica

Destinada a desenvolvedores, contendo:

- REST;
- MCP;
- autenticação;
- exemplos cURL, Node.js e Python;
- endpoints;
- esquemas;
- códigos de erro;
- limites e cobrança quando efetivamente implementados.

Essas duas finalidades podem permanecer na mesma seção, mas devem ser separadas visualmente por abas, blocos ou níveis progressivos. Não apresentar uma chave de produção fictícia, permissão total fictícia ou chamada “ao vivo” quando a operação não estiver realmente conectada.

### Posicionamento

`API & Docs` deve continuar acessível, mas não deve ocupar a mesma posição hierárquica das ações jurídicas principais. Preferir:

```text
fluxo jurídico:
Casos | Pesquisa | Rascunhos | Revisão

área demonstrativa/técnica:
Como funciona | API & Docs | Integrações
```

Isso é reorganização de prioridade, não remoção de capacidade.

## Substituição obrigatória dos mocks

Auditar especialmente `apps/web/src/context/AppContext.tsx` e todas as telas que dependem dele.

### Busca

O fluxo visual de pesquisa não deve usar `CANONICAL_JURISPRUDENCIA` como fonte de produção.

O comportamento correto é:

```text
enviar consulta para a API real
→ receber resultado da API
→ apresentar proveniência retornada
→ apresentar estado de erro, indisponibilidade ou ausência de resultados
```

A fixture pode permanecer exclusivamente em testes. Se a API estiver indisponível, a interface deve informar isso claramente. Não substituir silenciosamente a falha por quatro acórdãos estáticos.

### Consultas recentes

Não inicializar `recentSearches` com consultas fictícias de uma suposta equipe. Usar uma destas alternativas:

- histórico real carregado da API;
- lista vazia com orientação;
- histórico apenas das consultas realizadas na sessão, explicitamente identificado como local.

### Saldo, créditos e transações

Não inicializar o frontend com saldo, bônus ou lançamentos contábeis fictícios. O saldo deve vir do backend autenticado. Sem conta ou sem dados:

```text
saldo indisponível
ou
nenhum crédito registrado
```

Não exibir R$ 167,50, pesquisas disponíveis ou transações pré-criadas como se fossem dados reais.

### Aprovações e métricas

Não iniciar `approvals` com duas aprovações fictícias nem `stats` com 142 pesquisas, 38 memos e 64 drafts. Carregar dados reais ou apresentar zero/estado vazio claramente identificado.

### Conexões e provedores

Não apresentar Anthropic, OpenAI ou modelo local como “conectado” sem verificação real. O estado inicial deve ser `não configurado`, `desconectado` ou carregado do backend.

Chaves, tokens e credenciais nunca devem ser exibidos em texto estático, mesmo mascarados, como se fossem credenciais da conta.

### Aprovações e drafting

O Draft Studio já existe no commit `60ca253`. Preservar sua capacidade de:

- criar rascunho;
- criar versões;
- organizar seções;
- executar revisão;
- encaminhar para aprovação.

Substituir apenas dados demonstrativos por dados vindos da API. Se não houver caso ou rascunho, mostrar estado vazio. Não criar drafts fictícios para preencher a tela.

## Reorganização do Draft Studio

Não adicionar novos itens técnicos ao cabeçalho. O rascunho deve ser acessado pelo contexto do caso e, se mantido como entrada própria, usar o rótulo “Rascunhos”.

A tela deve priorizar:

```text
selecionar caso
→ selecionar ou criar rascunho
→ editar seção
→ conferir fontes e pendências
→ salvar versão
→ enviar para aprovação
```

Evitar expor simultaneamente:

- token Bearer;
- endpoint da API;
- IDs técnicos;
- hash completo;
- nomes de tools;
- `Review Center` como produto independente;
- níveis L0–L4 na área jurídica.

Esses dados podem existir em detalhes técnicos ou na área apropriada, mas não devem dominar o fluxo de redação.

## Correção da navegação

O cabeçalho atual acumula áreas jurídicas, administrativas e técnicas. Reorganizar sem perder acesso:

### Área principal do advogado

- Casos;
- Pesquisa;
- Rascunhos;
- Revisão.

### Área secundária

- início/visão geral;
- notificações e aprovações;
- conta;
- créditos, quando aplicável.

### Área demonstrativa/técnica

- Como funciona;
- API & Docs;
- Integrações;
- Configurações de modelos.

Não transformar cada workflow, entidade ou tool em item permanente do cabeçalho.

## Correção dos claims

Remover ou revisar textos que afirmem funcionamento não demonstrado, incluindo:

- “Permissão Total (L0-L4)”;
- “Gateway Agêntico Operacional” sem verificação real;
- “Endpoint MCP Canônico” como serviço público se não houver ambiente público comprovado;
- “Chave de API de Produção” quando for apenas exemplo visual;
- “Conectado” para provedores não testados;
- métricas de desempenho, assertividade ou economia sem origem real;
- “tribunais homologados” quando houver somente catálogo ou fixture;
- saldo e histórico de uso fictícios.

Em demonstrações, usar rótulos como:

- “Exemplo de resposta”;
- “Demonstração”; 
- “Sem dados carregados”; 
- “Conecte um provedor para testar”; 
- “Resultado retornado pela API”; 
- “Nenhuma consulta realizada”.

## Responsividade e largura

Os screenshots evidenciam overflow horizontal, especialmente após a inclusão do Draft Studio. Corrigir antes de qualquer refinamento cosmético:

1. garantir que o elemento raiz não exceda `100vw`;
2. localizar grids, botões, badges e containers com largura fixa;
3. corrigir o cabeçalho para que não dependa de sete ou mais itens na mesma linha;
4. recolher a navegação em larguras menores;
5. validar sem rolagem horizontal em 1440px, 1280px, 1024px e 768px;
6. garantir que a área principal preserve margens laterais proporcionais;
7. evitar que o rodapé imponha largura diferente do conteúdo principal.

## Tipografia e idioma

Uniformizar a escala visual e remover a mistura de idioma na experiência jurídica:

- `Pesquisa jurídica` em vez de `Research Desk`;
- `Área do caso` em vez de `Matter Workspace`;
- `Rascunhos` em vez de `Draft Studio`;
- `Documentação da API` em vez de `API & Docs` quando o contexto for técnico em português;
- `Configurações de modelos` em vez de `Connections`;
- `Pendências de revisão` em vez de `Review Findings`.

Preservar nomes de rotas, contratos e identificadores internos em inglês quando isso for necessário para compatibilidade da API.

## Critérios de aceitação adicionais

Além dos critérios do prompt principal, aceitar a correção somente se:

- `API & Docs` continuar acessível e funcional como demonstração/documentação;
- a área demonstrativa não apresentar exemplos estáticos como dados da conta;
- a pesquisa do usuário não filtrar apenas um array fixo do frontend;
- uma busca sem resultados produzir estado vazio honesto;
- o frontend não exibir saldo, transações, aprovações, métricas ou conexões fictícias como reais;
- fixtures permanecerem restritas a testes ou demonstrações explicitamente rotuladas;
- o Draft Studio continuar acessível sem aumentar a quantidade de itens técnicos no cabeçalho;
- o usuário advogado não precisar lidar com token técnico para compreender a proposta do produto;
- a API continue documentada para desenvolvedores;
- nenhuma alteração de backend seja feita apenas para mascarar um mock do frontend;
- a aplicação não possuir overflow horizontal nas larguras validadas;
- os dados reais, quando inexistentes, apareçam como estado vazio e não como cartões preenchidos.

## Validação

Executar validação visual e funcional em ambiente local:

```powershell
pnpm --filter @forgelex/web build
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Abrir o frontend em `http://localhost:3000` e verificar cada tela nas quatro larguras definidas. Se a API não estiver disponível ou não houver credenciais, confirmar que a aplicação mostra estados vazios/erros honestos e não dados substitutos.

## Entrega

Não relatar apenas “layout ajustado”. Registrar:

- como a navegação foi reorganizada;
- onde `API & Docs` ficou acessível;
- quais mocks foram removidos ou isolados em demonstração;
- quais chamadas reais foram conectadas;
- quais estados vazios foram criados;
- como o Draft Studio foi preservado;
- quais problemas de overflow foram corrigidos;
- quais larguras foram verificadas;
- resultados dos comandos de validação;
- limitações que ainda permanecerem.
