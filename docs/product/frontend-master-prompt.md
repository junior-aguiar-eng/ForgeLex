# Prompt de implementação do frontend completo do ForgeLex

## Papel

Você é uma pessoa engenheira de produto sênior, especializada em React, TypeScript, arquitetura de informação, UX para sistemas jurídicos, acessibilidade e integração segura com APIs. Sua tarefa é projetar e implementar o frontend completo do ForgeLex sobre o repositório existente, preservando os contratos, a autenticação e as capacidades já implementadas.

Não entregue apenas uma landing page, um dashboard cenográfico ou uma tela de MCP. Construa uma experiência coerente de produto, desde a apresentação pública até o trabalho jurídico autenticado, incluindo casos, pesquisa, fatos e provas, rascunhos, revisão, faturamento, integrações, API e conta.

## Resultado pretendido

O frontend deve transmitir simultaneamente:

- seriedade institucional;
- modernidade discreta;
- clareza didática;
- organização documental;
- rigor jurídico;
- transparência operacional;
- confiança sem promessas exageradas.

O usuário deve compreender rapidamente:

1. o que é o ForgeLex;
2. quais problemas ele resolve;
3. quais funções existem;
4. como começar pelo site;
5. como funciona um caso;
6. como pesquisar e verificar autoridades;
7. como preparar e revisar uma minuta;
8. como usar MCP ou API, se desejar;
9. o que é cobrado;
10. quais limites e salvaguardas permanecem sob controle humano.

## Referências visuais e limites de inspiração

Analise como referências de experiência, sem copiar marca, textos, código, imagens, métricas ou trade dress:

- `https://jurisprudencia.exordial.ai/jurisprudencia`
- `https://exordial.ai/planos`

Extraia apenas princípios gerais observáveis:

- cabeçalho simples e previsível;
- primeira dobra com uma promessa clara;
- hierarquia tipográfica forte;
- uma decisão principal por bloco;
- cartões com títulos orientados ao benefício;
- explicações progressivas;
- preços e limitações próximos da ação relevante;
- separação de públicos e jornadas;
- bastante espaço em branco;
- rodapé informativo e organizado;
- linguagem acessível antes dos detalhes técnicos.

Não reproduza:

- logotipo, paleta ou identidade da Exordial;
- alegações de milhões de ementas ou quantidade de tribunais;
- preços, planos, tokens ou métricas da Exordial;
- contatos, CNPJ, endereço, redes sociais ou textos legais da Exordial;
- slogans, títulos, parágrafos ou estrutura visual pixel a pixel;
- qualquer dado não comprovado no repositório ForgeLex.

## Regras de execução

1. Leia integralmente o `AGENTS.md`, se existir, e as instruções locais antes de editar.
2. Confirme `cwd`, remoto, branch, `HEAD`, status e diff antes de qualquer alteração.
3. O working tree pode conter trabalho em andamento. Preserve todas as alterações preexistentes e integre-se a elas; não use `git reset --hard`, `git checkout --`, limpeza ampla ou sobrescrita cega.
4. Consulte primeiro as fontes canônicas do projeto:
   - `README.md`;
   - `STATUS_VALIDACAO.md`;
   - `Plano de conclusão progressiva do F.md`;
   - `docs/README.md`;
   - `docs/product/mcp-onboarding.md`;
   - plano de experiência mais recente em `docs/superpowers/plans/`;
   - contratos de `apps/api`, `packages/domain`, `packages/legal-tools`, `packages/legal-workflows`, `packages/billing-ledger` e `packages/mcp-server`.
5. Inspecione os componentes e estilos existentes antes de propor novos componentes.
6. Reutilize autenticação Supabase, clientes HTTP, contratos, componentes, tokens e padrões já existentes.
7. Não crie backend fictício, respostas simuladas em produção, saldos presumidos, processos jurídicos inventados ou dashboards com métricas falsas.
8. Fixtures são permitidas apenas em testes e devem ser identificadas como fixtures.
9. Não faça commit, push, migração remota, deploy, configuração de OAuth live ou transação real sem autorização expressa.
10. Ao final, informe exatamente o que foi implementado, testado e não comprovado.

## Fontes de verdade obrigatórias

O frontend deve derivar dados operacionais da API. Nunca duplicar como constantes de interface informações que já possuem contrato no backend.

### Produto e capacidades confirmadas

- Produto público: ForgeLex.
- Titular indicado na documentação: ForgeLex Tecnologia Ltda.
- Proposta: “Do caso à minuta, conecte fatos, provas e jurisprudência.”
- Público: advocacia de alta performance e departamentos jurídicos.
- Pesquisa comercial atualmente habilitada: índice próprio persistido do STJ.
- Outros tribunais não podem ser anunciados como pesquisáveis enquanto permanecerem indisponíveis ou estrategicamente congelados.
- Operação faturável: `research.search_case_law`.
- Tarifa pública atual: R$ 0,20 por execução válida de pesquisa, inclusive sem resultados, mas interfaces autenticadas devem usar `searchCostCents` retornado pelo billing.
- Operações gratuitas: `research.get_authority`, `research.verify_authority`, listagem de tribunais, healthcheck e `workflow.legal_research_memo` enquanto o contrato vigente assim determinar.
- Modelo comercial: créditos pré-pagos em BRL, sem mensalidade.
- Pagamento: Mercado Pago, conforme configuração real do ambiente.
- O ForgeLex não fornece modelo de IA e não cobra tokens de OpenAI, Anthropic, ChatGPT ou Claude.
- MCP e REST compartilham a mesma infraestrutura jurídica.
- O MCP não recebe automaticamente conversas, arquivos ou histórico do host; recebe a chamada autenticada e os argumentos autorizados da ferramenta.

### Ferramentas e fluxos confirmados

- pesquisa jurisprudencial;
- recuperação de autoridade;
- verificação de autoridade e proveniência;
- workflow de research memo;
- casos/matters;
- documentos textuais com âncoras;
- fatos candidatos;
- itens de prova;
- linha do tempo;
- cobertura de suporte factual;
- questões jurídicas;
- autoridades vinculadas ao caso;
- mapa de teses;
- rascunhos e versões imutáveis;
- revisão de citações;
- conferência de suporte factual;
- revisão adversarial;
- aprovação humana;
- fila de revisão;
- pesquisa e histórico persistidos;
- API keys criadas, listadas e revogadas;
- saldo, recargas, transações, compras, recibos, métodos de pagamento e reembolso, quando o billing estiver disponível;
- acesso por site, MCP e API REST.

### Limites jurídicos e operacionais

- Fato registrado não equivale a fato verdadeiro ou provado.
- Prova vinculada não equivale a autenticidade ou suficiência jurídica.
- Research memo permanece sujeito a revisão humana.
- Rascunho permanece `DRAFT_ONLY` até o fluxo aplicável.
- Aprovação interna não equivale a protocolo, envio ou efeito externo.
- Resultados com fonte e hash aumentam rastreabilidade, mas não dispensam conferência jurídica.
- Não prometer ausência absoluta de alucinação.
- Não anunciar tribunal, integração, pagamento ou conexão sem evidência real.

## Arquitetura de informação geral

Estruture o frontend em quatro superfícies integradas:

```text
ForgeLex
├── Site público
│   ├── Início
│   ├── Produto
│   ├── Como funciona
│   ├── Pesquisa jurídica
│   ├── Casos e provas
│   ├── Rascunhos e revisão
│   ├── Integrações
│   ├── Créditos
│   ├── Perguntas frequentes
│   └── Acesso
├── Autenticação
│   ├── Entrar
│   ├── Criar conta
│   ├── Confirmar e-mail
│   ├── Recuperar senha
│   └── Estados de sessão
├── Espaço de trabalho autenticado
│   ├── Visão geral
│   ├── Casos
│   ├── Pesquisa
│   ├── Autoridades
│   ├── Rascunhos
│   ├── Revisão
│   ├── Conta e créditos
│   ├── Conectar IA
│   ├── API keys
│   └── Segurança
└── Área documental/técnica
    ├── Guia para advogados
    ├── API para desenvolvedores
    ├── OpenAPI
    ├── Status e limites
    └── Privacidade e segurança
```

Não transforme MCP em eixo central do produto. Ele deve aparecer como um dos canais de acesso, ao lado do site e da API.

## Design system ForgeLex

Preserve e refine a identidade já existente.

### Paleta

Use como base os tokens já definidos:

```css
--forgelex-ivory: #fbf9f5;
--forgelex-paper: #ffffff;
--forgelex-ink: #2d2721;
--forgelex-muted: #71695f;
--forgelex-line: rgba(180, 150, 110, 0.20);
--forgelex-accent: #8e5d2a;
--forgelex-accent-soft: #f9ede0;
```

Regras:

- fundo geral marfim quente;
- superfícies brancas ou papel suave;
- texto principal em tinta escura, nunca preto absoluto;
- conhaque reservado para ações, foco, etiquetas e destaques;
- verde somente para sucesso verificável;
- âmbar para atenção;
- vermelho para erro ou bloqueio;
- azul ou cinza técnico apenas quando necessário para documentação e código;
- contraste mínimo WCAG AA.

### Tipografia

- Interface e leitura: Inter, system-ui ou equivalente já instalado.
- Títulos editoriais: Merriweather, Playfair Display, Georgia ou a família existente.
- Código e identificadores técnicos: fonte monoespaçada do sistema.
- Não usar serifada em controles pequenos, tabelas densas ou formulários.

### Forma e ritmo

- largura máxima de conteúdo próxima a 1200 px;
- seções públicas com bastante respiro vertical;
- cards com raio entre 14 e 18 px;
- bordas champagne discretas;
- sombras mínimas;
- grids de duas ou três colunas apenas quando preservarem leitura;
- parágrafos com largura confortável, evitando blocos excessivamente longos;
- ícones Lucide consistentes, sempre subordinados ao texto;
- animações discretas, respeitando `prefers-reduced-motion`.

### Personalidade

O visual deve parecer uma combinação de:

- escritório jurídico contemporâneo;
- software documental de alta confiança;
- publicação editorial técnica;
- produto SaaS moderno, sem aparência de startup genérica.

Evite:

- gradientes chamativos;
- glassmorphism excessivo;
- ilustrações genéricas de IA;
- robôs, cérebros luminosos, martelos de juiz ou balanças decorativas repetidas;
- excesso de badges;
- dashboards cenográficos;
- linguagem de marketing hiperbólica;
- cards em excesso quando texto estruturado for mais claro.

## Site público

O site público deve ser acessível sem autenticação. Ele apresenta o produto, diferencia suas capacidades e conduz ao cadastro ou login.

### Cabeçalho público

Criar cabeçalho sticky, sóbrio e responsivo.

**Esquerda:** símbolo ForgeLex existente + nome “ForgeLex”.

**Navegação principal:**

- Produto;
- Como funciona;
- Pesquisa jurídica;
- Integrações;
- Desenvolvedores.

**Ações à direita:**

- Entrar;
- Criar acesso.

No mobile, usar menu acessível com botão nomeado, foco contido enquanto aberto, fechamento por Escape e retorno correto do foco.

Não colocar “MCP” como item principal do cabeçalho. “Integrações” é o conceito de primeiro nível; MCP e API aparecem dentro dele.

### Hero

Usar a proposta já validada:

**Eyebrow:** `Pesquisa, estratégia e preparação jurídica`

**Título:** `Do caso à minuta, conecte fatos, provas e jurisprudência.`

**Texto sugerido:**

> Organize o contexto do caso, pesquise jurisprudência com fontes rastreáveis e prepare rascunhos sujeitos à revisão humana em um único espaço de trabalho.

**CTA primário:** `Criar acesso`

**CTA secundário:** `Conhecer o produto`

**Linha de confiança, sem métricas inventadas:**

> Índice próprio do STJ · fontes e proveniência · revisão humana antes de efeitos externos

Não usar números de usuários, processos, tribunais, ementas, taxa de acerto ou economia de tempo sem evidência verificável.

### Seção “Por que o ForgeLex existe”

Explique três problemas concretos:

1. pesquisa fragmentada e difícil de conferir;
2. contexto do caso espalhado entre documentos e anotações;
3. minutas produzidas sem vínculo explícito com fatos, provas e autoridades.

Apresente a resposta ForgeLex sem afirmar automação total:

- pesquisa com rastreabilidade;
- organização estruturada do caso;
- preparação documental com revisão humana.

### Seção “Um espaço de trabalho, quatro movimentos”

Criar quatro blocos numerados:

1. **Estruture o caso** — documentos, fatos candidatos, provas, eventos e questões jurídicas.
2. **Pesquise e confira** — jurisprudência do STJ, autoridade, proveniência e estado de verificação.
3. **Construa a linha jurídica** — research memo e mapa de teses ligados ao material do caso.
4. **Redija e revise** — rascunhos versionados, conferência de citações, suporte factual e aprovação humana.

Cada bloco deve possuir um CTA contextual que leve à documentação pública ou ao cadastro, sem simular dados.

### Seção “Ferramentas do produto”

Apresentar as capacidades em grupos funcionais, não como uma lista de nomes técnicos:

#### Casos e evidências

- documentos textuais e âncoras;
- fatos candidatos;
- provas e vínculos;
- linha do tempo;
- questões jurídicas;
- cobertura factual explícita.

#### Pesquisa e autoridades

- pesquisa jurisprudencial no STJ;
- recuperação da autoridade;
- verificação de processo e proveniência;
- histórico da pesquisa;
- vinculação da autoridade ao caso.

#### Estratégia e documentos

- research memo;
- mapa de teses;
- outline;
- versões de rascunho;
- vínculos com fatos, provas e autoridades.

#### Revisão e governança

- conferência de citações;
- suporte factual;
- revisão adversarial;
- pendências bloqueadoras;
- aprovação humana registrada.

Adicionar uma nota curta:

> O ForgeLex organiza e verifica o trabalho. A decisão jurídica e qualquer efeito externo permanecem sob responsabilidade humana.

### Seção “Use do seu jeito”

Apresentar três caminhos com a mesma importância visual:

1. **Espaço de trabalho ForgeLex** — para organizar casos, pesquisa, rascunhos e revisão.
2. **ChatGPT ou Claude por MCP** — para consultar as ferramentas ForgeLex dentro do host escolhido pelo usuário.
3. **API REST** — para integrar pesquisa e metadados a software próprio.

Não declarar MCP “conectado” ou “ativo” sem verificação. Não afirmar que o ForgeLex acessa o histórico do host. Não exigir conhecimento técnico na primeira leitura.

### Seção “Cobrança transparente”

Não inventar planos de assinatura.

Explicar:

- créditos pré-pagos em reais;
- ausência de mensalidade;
- pesquisa jurisprudencial como operação faturável;
- verificação e operações gratuitas conforme contrato vigente;
- saldo não deve ser prometido como não expirável se isso não estiver formalmente definido no contrato público;
- assinatura e tokens do host não são cobrados pelo ForgeLex.

Exibir preço estático somente em superfície pública vinculada ao contrato atual. Nas áreas autenticadas, buscar `searchCostCents` no backend.

CTA: `Ver como funcionam os créditos`.

### Seção “Como protegemos o trabalho”

Explicar sem claims absolutos:

- isolamento por organização/tenant;
- identidade derivada da credencial autenticada;
- sanitização de segredos em auditoria;
- chaves armazenadas por hash;
- revisão humana;
- nenhuma ação externa automática decorrente apenas de um rascunho ou aprovação interna.

Não afirmar certificações, compliance formal, criptografia específica ou auditoria externa sem documentação correspondente.

### FAQ público

Criar accordions acessíveis para:

- O que é o ForgeLex?
- O ForgeLex escreve petições sozinho?
- Quais tribunais podem ser pesquisados?
- Como funciona a cobrança?
- Preciso usar ChatGPT ou Claude?
- O que é MCP?
- O ForgeLex acessa minhas conversas e arquivos?
- Posso integrar ao meu software?
- Como a revisão humana funciona?
- Uma aprovação no ForgeLex protocola o documento?

As respostas devem refletir os contratos reais e evitar promessas absolutas.

## Rodapé público

O rodapé deve ser amplo, legível e documental, mas só pode exibir dados confirmados.

### Coluna de marca

- `ForgeLex`
- `Pesquisa, estratégia e preparação jurídica com fontes rastreáveis e revisão humana.`
- domínio público, quando configurado pelo ambiente.

### Coluna “Produto”

- Visão geral;
- Casos e evidências;
- Pesquisa jurídica;
- Rascunhos e revisão;
- Créditos.

### Coluna “Integrações”

- Usar no ChatGPT ou Claude;
- API para desenvolvedores;
- OpenAPI;
- Status do serviço, somente se houver rota/página pública correspondente.

### Coluna “Recursos”

- Guia para advogados;
- Documentação técnica;
- Privacidade e segurança;
- Perguntas frequentes.

### Coluna “Legal”

- Termos de Uso, somente se o documento/rota existir;
- Política de Privacidade, somente se o documento/rota existir;
- informações sobre retenção, somente se aprovadas e publicadas.

### Linha institucional inferior

Usar apenas:

> © {ano atual} ForgeLex Tecnologia Ltda. Todos os direitos reservados.

Não inventar CNPJ, endereço, e-mail, telefone, WhatsApp, Instagram, LinkedIn, nome de fundador ou cidade. Se esses dados não estiverem em fonte canônica, omita-os. Não use `#` como destino de link. Recursos ainda não existentes devem ser omitidos ou claramente identificados como indisponíveis, nunca simulados.

## Autenticação

Preserve a autenticação Supabase já configurada e sua lógica de:

- login;
- cadastro por nome, e-mail e senha;
- confirmação de e-mail;
- recuperação de senha;
- redefinição de senha;
- sessão expirada;
- conta desabilitada;
- API indisponível;
- configuração ausente.

Melhorias permitidas:

- integrar o cabeçalho visual do site público;
- oferecer retorno claro à landing;
- acrescentar texto breve sobre proteção da conta;
- manter o formulário simples e centralizado;
- preservar mensagens contra enumeração de contas;
- manter senha mínima conforme contrato atual.

Não solicitar CPF, celular, OAB ou dados profissionais sem requisito aprovado e backend correspondente.

## Shell autenticado

### Cabeçalho do aplicativo

Criar cabeçalho sticky compacto com:

- logo ForgeLex e retorno à visão geral;
- navegação principal: `Casos`, `Pesquisa`, `Rascunhos`, `Revisão`;
- botão contextual `Pesquisar` em telas amplas, sem duplicá-lo de forma confusa;
- indicador discreto de saldo, se carregado da API;
- nome da conta autenticada;
- menu de conta com `Conta`, `Segurança` e `Sair`.

No mobile, consolidar navegação e conta em menu acessível.

### Sidebar contextual

Usar sidebar apenas para recursos secundários:

- Visão geral;
- Conta e créditos;
- Conectar IA;
- API keys;
- API para desenvolvedores;
- Segurança.

A sidebar deve recolher em desktop e virar drawer no mobile. Toda tela deve possuir URL estável e sobreviver a recarregamento, botão Voltar e compartilhamento interno.

## Visão geral autenticada

Não criar dashboard com números falsos. Renderize dados apenas quando retornados pela API.

### Estrutura

1. Saudação curta com nome real da conta.
2. CTA principal: `Abrir um caso` ou `Pesquisar jurisprudência`.
3. Retomada de trabalho recente, se houver.
4. Casos ativos, se retornados.
5. Pesquisas recentes, se retornadas.
6. Pendências de revisão, se retornadas.
7. Resumo de saldo e última operação, se retornados.
8. Atalho discreto para integrações.

### Estados vazios

Cada estado vazio deve responder:

- o que é esta área;
- por que está vazia;
- qual ação inicia o fluxo.

Exemplo:

> Nenhum caso ainda. Crie o primeiro caso para reunir documentos, fatos, provas e questões jurídicas em um único contexto.

Não exibir gráficos vazios, percentuais arbitrários ou tendências sem dados reais.

## Casos

### Lista de casos

Exibir:

- título;
- área ou jurisdição, se informada;
- status real;
- data de atualização;
- quantidade de pendências apenas se calculada pelo backend;
- ação `Abrir caso`.

Incluir busca e filtros somente se houver suporte real ou filtragem local segura sobre dados já carregados.

### Criação de caso

Formulário mínimo, baseado nos contratos existentes:

- título;
- descrição opcional;
- área de prática, se suportada;
- jurisdição, se suportada.

Não exigir cliente, número processual ou parte se os contratos não exigirem.

## Workspace do caso

Organizar o caso como um dossiê documental. Utilizar cabeçalho do caso com título, status, atualização e ações contextuais.

### Navegação interna do caso

- Visão geral;
- Documentos;
- Fatos e provas;
- Linha do tempo;
- Questões jurídicas;
- Autoridades;
- Research memo;
- Teses;
- Rascunhos;
- Revisão.

### Visão geral do caso

Mostrar apenas dados reais:

- resumo fornecido pelo usuário;
- questões abertas;
- documentos vinculados;
- fatos sem suporte ou conflitantes;
- autoridades salvas;
- rascunho atual;
- pendências de revisão.

### Documentos

Representar documento, conteúdo textual e âncoras. Não implementar upload binário se o backend atual aceitar somente conteúdo textual. Se upload não existir, explicar honestamente o formato disponível.

### Fatos e provas

Separar visualmente:

- fato candidato;
- prova;
- vínculo entre ambos;
- fonte/âncora;
- estado de cobertura: `SUPPORTED`, `PARTIAL`, `UNSUPPORTED`, `CONFLICTING`.

Traduzir estados para português sem perder o valor canônico nos dados.

Adicionar aviso contextual:

> O vínculo registra o suporte indicado no caso; não confirma automaticamente autenticidade, veracidade ou suficiência jurídica.

### Linha do tempo

Exibir eventos por data, título, descrição e vínculos documentais. Não inferir datas ausentes.

### Questões jurídicas

Permitir delimitar questões explicitamente. Diferenciar questão, tese e conclusão.

### Research memo

Apresentar:

- questão pesquisada;
- escopo;
- autoridades;
- síntese;
- divergências;
- limitações;
- status de revisão humana;
- checkpoints do workflow, quando expostos.

Nunca apresentar o memo como parecer definitivo.

## Pesquisa jurídica

### Formulário

- consulta textual;
- tribunal derivado do catálogo real;
- indicação clara de custo antes da execução;
- botão `Pesquisar jurisprudência`;
- ação separada `Verificar autoridade`.

Não oferecer tribunal indisponível como opção selecionável. Se o catálogo listar fontes futuras, mostrar como indisponíveis somente quando isso agregar clareza e não parecer promessa de lançamento.

### Resultados

Cada resultado deve exibir, quando disponível:

- tribunal;
- número do processo;
- órgão julgador;
- relator;
- data de julgamento;
- data de publicação;
- ementa;
- fonte;
- provedor;
- estado de verificação;
- ação `Abrir autoridade`;
- ação `Salvar no caso`.

Não cortar a ementa de modo que altere seu sentido. Usar expansão progressiva.

### Estados obrigatórios

- carregando;
- sucesso com resultados;
- sucesso sem resultados, ainda faturável conforme contrato;
- saldo insuficiente;
- tribunal não habilitado;
- fonte indisponível;
- credencial expirada;
- erro recuperável;
- replay idempotente.

Mensagens de erro devem seguir: o que aconteceu + por que, quando conhecido + como continuar.

## Autoridade

Criar uma visualização documental para a autoridade:

- identificação processual;
- metadados do julgamento;
- ementa;
- URL da fonte;
- proveniência;
- hash, quando disponibilizado;
- data e método da verificação;
- divergências encontradas;
- vínculos com casos, questões e teses.

Usar status explícitos, nunca apenas cor:

- verificada em fonte oficial;
- verificada pelo provedor;
- não verificada;
- divergente;
- não localizada.

## Rascunhos

### Lista

Exibir rascunhos por caso, tipo, versão atual, status e atualização.

### Draft Studio

Organizar em três áreas responsivas:

1. outline e seções;
2. conteúdo da versão atual;
3. vínculos e revisão.

O editor não deve parecer um processador de texto genérico. Deve enfatizar:

- versão imutável;
- fatos vinculados;
- provas vinculadas;
- autoridades vinculadas;
- teses vinculadas;
- achados de revisão;
- status da aprovação.

Não implementar geração automática não suportada. Se o backend apenas registra conteúdo e versões, a interface deve refletir isso.

## Revisão

Criar Review Center com:

- fila de pendências;
- prioridade ou impacto apenas se fornecidos;
- tipo de revisão;
- caso e documento relacionados;
- achados;
- bloqueios;
- histórico de decisão;
- ações `Aprovar` e `Rejeitar` com consequências explícitas.

Antes de confirmar:

- mostrar o que será aprovado;
- informar que aprovação interna não produz protocolo ou efeito externo;
- solicitar justificativa quando exigida pelo contrato;
- usar rótulos específicos, nunca `OK`.

## Conta, créditos e faturamento

### Visão de conta

Mostrar, quando retornado:

- saldo total;
- saldo pago;
- saldo promocional;
- custo da pesquisa;
- quantidade estimada de pesquisas, identificada como estimativa;
- pacotes disponíveis;
- intervalo de valor personalizado;
- recarga automática e sua disponibilidade;
- métodos de pagamento;
- compras;
- lançamentos;
- faturas e recibos;
- reembolso.

### Regras de copy

- usar `créditos`, não `tokens`;
- usar valores em reais;
- explicar que créditos pagam operações ForgeLex;
- não confundir assinatura do host com saldo ForgeLex;
- não prometer cartão ou Pix se o backend/provedor do ambiente não oferecer;
- mostrar billing indisponível como estado operacional, não como saldo zero;
- não criar checkout fictício.

## Conectar IA

Tratar MCP como canal opcional, não como centro da suíte.

### Estrutura

- introdução curta;
- abas ou cartões ChatGPT e Claude;
- URL MCP canônica obtida do ambiente;
- copiar URL;
- requisitos por host;
- configuração manual;
- teste gratuito de disponibilidade;
- estado verificável;
- perguntas-modelo;
- privacidade;
- explicação de cobrança.

Estados permitidos:

- não configurado;
- instruções disponíveis;
- credencial pronta;
- conectado, somente após verificação autenticada;
- falha de conexão.

Não usar `Ativo` como sinônimo de conectado.

## API keys e desenvolvedores

### API keys

- listar metadados;
- nome;
- prefixo mascarado;
- escopos;
- criação;
- último uso, se disponível;
- revogação;
- segredo exibido uma única vez.

Nunca persistir segredo no estado global, storage, analytics ou logs.

### Documentação da API

Separar do guia para advogados. Organizar em:

1. autenticação;
2. listar tribunais/capacidades;
3. pesquisar jurisprudência;
4. obter autoridade;
5. verificar autoridade;
6. erros;
7. idempotência;
8. custos;
9. OpenAPI.

Oferecer exemplos cURL, Node.js e Python somente com URLs e contratos reais. Exemplos de resposta devem ser claramente marcados como demonstração e não podem parecer leituras ao vivo.

## Segurança da conta

Exibir apenas ações realmente suportadas:

- alterar ou recuperar senha via Supabase;
- encerrar sessão;
- sessões ou dispositivos somente se o backend os disponibilizar;
- encerramento de conta somente depois de política de retenção e endpoint aprovados.

Não criar botão destrutivo sem implementação, confirmação, reautenticação e política de dados correspondente.

## Microcopy e voz

### Voz

- profissional;
- direta;
- calma;
- precisa;
- didática;
- sem informalidade excessiva;
- sem juridiquês desnecessário;
- sem antropomorfizar a IA.

### Terminologia canônica

Usar consistentemente:

- caso;
- pesquisa jurisprudencial;
- autoridade;
- fonte;
- proveniência;
- fato candidato;
- prova;
- questão jurídica;
- tese;
- research memo, acompanhado de explicação em português na primeira ocorrência;
- rascunho;
- versão;
- revisão humana;
- créditos;
- operação faturável;
- MCP;
- API key.

### CTAs

Começar com verbo e indicar resultado:

- Criar acesso;
- Abrir caso;
- Criar caso;
- Pesquisar jurisprudência;
- Verificar autoridade;
- Salvar no caso;
- Criar nova versão;
- Enviar para revisão;
- Aprovar revisão;
- Rejeitar revisão;
- Adicionar créditos;
- Conectar ao host;
- Copiar URL MCP;
- Criar API key;
- Revogar chave.

Evitar:

- Continuar;
- Enviar;
- Confirmar;
- OK;
- Saiba mais, quando houver ação mais específica.

## Estados transversais

Todo recurso assíncrono deve possuir:

- skeleton ou loading proporcional;
- estado vazio útil;
- erro acionável;
- retry quando seguro;
- sucesso explícito;
- prevenção de duplo envio;
- feedback de idempotência/replay quando relevante;
- sessão expirada com retorno ao login;
- indisponibilidade do backend sem mascarar como “nenhum dado”.

Não usar toast como único lugar de uma informação crítica. Mensagens importantes devem permanecer próximas ao componente afetado.

## Componentes recomendados

Reutilize e evolua os componentes existentes antes de criar abstrações novas. Componentes possíveis:

- `PublicHeader`;
- `AppHeader`;
- `PublicFooter`;
- `AppSidebar`;
- `PageHeader`;
- `Eyebrow`;
- `Surface`;
- `StatusBadge`;
- `EmptyState`;
- `ErrorState`;
- `LoadingState`;
- `MetricCard`, somente com dados reais;
- `DefinitionList`;
- `DocumentPanel`;
- `ProvenancePanel`;
- `AuthorityCard`;
- `EvidenceCoverageBadge`;
- `ReviewFindingCard`;
- `ConfirmationDialog`;
- `CopyButton`;
- `CodeExample`;
- `Accordion`;
- `Tabs`;
- `Breadcrumbs`;
- `DataTable` responsiva;
- `MobileDrawer`.

Não criar um design system paralelo se as classes `surface`, `surface-subtle`, `btn-primary`, `btn-secondary`, `btn-quiet`, `input-control`, `eyebrow` e os tokens atuais forem suficientes.

## Rotas

Implemente ou preserve URLs estáveis, ajustando aos padrões existentes após inspeção:

```text
/
/produto
/como-funciona
/integracoes
/creditos
/guia
/desenvolvedores/api
/entrar
/cadastro
/app
/app/casos
/app/casos/:matterId
/app/casos/:matterId/documentos
/app/casos/:matterId/fatos-provas
/app/casos/:matterId/questoes
/app/casos/:matterId/autoridades
/app/casos/:matterId/memo
/app/casos/:matterId/teses
/app/casos/:matterId/rascunhos
/app/pesquisa
/app/rascunhos
/app/revisao
/app/conta
/app/conta/atividade
/app/conta/chaves
/app/conta/seguranca
/app/conectar
```

Não adicione dependência de roteamento se a History API e o padrão existente resolverem adequadamente. Se optar por biblioteca, justificar pela complexidade real e verificar impacto no bundle e no fallback do Fastify.

## Responsividade

Validar pelo menos:

- 375 × 812;
- 768 × 1024;
- 1366 × 768;
- 1440 × 900.

Regras:

- nenhuma rolagem horizontal involuntária;
- tabelas viram cards ou usam scroll explícito no mobile;
- sidebar vira drawer;
- CTAs permanecem visíveis sem cobrir conteúdo;
- cards não comprimem texto jurídico;
- código possui scroll próprio;
- formulários não usam colunas estreitas em celular;
- alvos de toque de pelo menos 44 × 44 px quando aplicável.

## Acessibilidade

- HTML semântico;
- um `h1` por tela;
- hierarquia de headings coerente;
- landmarks `header`, `nav`, `main`, `aside`, `footer`;
- skip link;
- labels explícitos;
- descrição de erro associada ao campo;
- foco visível;
- navegação completa por teclado;
- dialogs com foco contido e retorno do foco;
- tabs e accordions com ARIA correto;
- estados não dependem apenas de cor;
- ícones decorativos com `aria-hidden`;
- `aria-live` para carregamento e resultado quando adequado;
- suporte a zoom de 200%;
- respeito a `prefers-reduced-motion`;
- contraste WCAG 2.1 AA.

## Privacidade e telemetria

Não registrar em analytics ou logs de frontend:

- consulta jurisprudencial;
- ementa;
- número de processo;
- documentos;
- fatos;
- provas;
- teses;
- rascunhos;
- conteúdo da conversa;
- token;
- API key;
- Authorization header;
- dados pessoais além do estritamente necessário.

Eventos de produto devem usar allowlist e conter somente metadados técnicos saneados. Se não houver infraestrutura de telemetria aprovada, não instalar ferramenta externa nesta implementação.

## Estratégia de implementação

Execute em fatias verticais e funcionais. Ao término de cada fatia, o produto deve continuar executável.

### Fase 0 — Auditoria e mapa

- mapear telas, contratos e alterações locais;
- comparar frontend atual com backend real;
- registrar campos e endpoints disponíveis;
- apontar lacunas sem preenchê-las com invenções;
- definir matriz rota → tela → endpoint → estado.

### Fase 1 — Fundação visual e navegação

- tokens;
- cabeçalhos;
- rodapé;
- containers;
- rotas;
- responsividade;
- estados transversais;
- autenticação integrada.

### Fase 2 — Site público

- landing;
- produto;
- como funciona;
- capacidades;
- integrações;
- créditos;
- segurança;
- FAQ;
- rodapé documental.

### Fase 3 — Visão geral, casos e workspace

- dashboard sem dados falsos;
- lista/criação de casos;
- documentos;
- fatos e provas;
- linha do tempo;
- questões;
- autoridades;
- memo.

### Fase 4 — Pesquisa e autoridade

- consulta;
- catálogo de tribunais;
- custo;
- resultados;
- proveniência;
- verificação;
- salvar no caso;
- histórico.

### Fase 5 — Teses, rascunhos e revisão

- mapa de teses;
- Draft Studio;
- versões;
- vínculos;
- achados;
- aprovação humana;
- fila de revisão.

### Fase 6 — Conta e operação

- saldo;
- recarga;
- transações;
- recibos;
- meios de pagamento;
- reembolso;
- estados de billing.

### Fase 7 — Integrações e desenvolvedores

- Conectar IA;
- MCP;
- API keys;
- documentação REST;
- OpenAPI;
- estados verificáveis.

### Fase 8 — Segurança, acessibilidade e QA

- segurança da conta conforme suporte real;
- revisão de copy;
- responsividade;
- acessibilidade;
- regressão;
- documentação.

## Estratégia de testes

### Unitários

- modelos de apresentação;
- resolução de rotas;
- formatação de moeda e data;
- estados de pesquisa;
- estados de autoridade;
- cobertura fato/prova;
- estados de rascunho e revisão;
- preço derivado do backend;
- segredo de API key exibido uma vez;
- copy por estado.

### Integração

- clients HTTP;
- autenticação e sessão;
- escopos;
- erros `401`, `402`, `403`, `409`, `422`, `429`, `503`;
- idempotência;
- billing indisponível versus saldo zero;
- API key criada/revogada;
- dados de um tenant não aparecem em outro.

### E2E

- visitar landing e criar acesso;
- entrar e recarregar uma rota autenticada;
- criar e abrir caso;
- registrar questão jurídica;
- pesquisar STJ;
- abrir e verificar autoridade;
- salvar no caso;
- criar ou abrir rascunho;
- revisar e registrar decisão humana;
- consultar créditos e atividade;
- configurar integração em ambiente simulado;
- criar/revogar API key sintética;
- navegar por teclado;
- validar mobile e desktop.

Não realizar pagamento real, exclusão real ou conexão externa em E2E compartilhado.

## Gates mínimos

Use os comandos canônicos do repositório, ajustados ao estado corrente:

```bash
pnpm typecheck
pnpm test
pnpm --filter @forgelex/web build
pnpm test:e2e:phase7
git diff --check
```

Execute testes focados durante cada fase. Não repita indiscriminadamente a suíte completa após mudanças triviais, mas execute os gates integrais antes de declarar o frontend concluído.

## Definição de concluído

O frontend somente estará concluído quando:

- o site público explicar o produto completo, não apenas o MCP;
- o login existente estiver integrado à identidade visual;
- cabeçalho e rodapé estiverem completos e sem dados inventados;
- todas as capacidades reais relevantes possuírem superfície compreensível ou indicação honesta de indisponibilidade;
- casos, pesquisa, autoridades, fatos, provas, memo, teses, rascunhos e revisão formarem uma jornada coerente;
- conta, créditos e billing distinguirem ausência de dados, saldo zero e indisponibilidade;
- MCP e API estiverem apresentados como canais opcionais;
- nenhuma métrica, tribunal, contato, preço, certificação ou capacidade falsa estiver publicada;
- todas as telas tiverem loading, vazio, erro e sucesso adequados;
- rotas sobreviverem a recarregamento e navegação do navegador;
- mobile, teclado, contraste e zoom forem validados;
- testes e build passarem;
- alterações preexistentes permanecerem preservadas;
- nenhuma mutação remota, commit, push ou deploy tiver sido feita sem autorização específica.

## Formato da entrega da implementação

Ao concluir, entregue relatório curto e verificável com:

1. telas e fluxos implementados;
2. arquivos principais criados ou alterados;
3. contratos consumidos;
4. testes executados e respectivos resultados;
5. validação visual realizada e viewports cobertos;
6. acessibilidade verificada;
7. limitações ou superfícies não comprovadas;
8. alterações locais preexistentes preservadas;
9. gates não autorizados que permaneceram intocados.
