# ForgeLex — Refatoração da UI Pública Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir a superfície pública do ForgeLex para apresentar, de forma limpa e comercialmente atraente, o valor de reunir pesquisa jurídica, contexto do caso e relação jurisprudencial em um único espaço de trabalho.

**Architecture:** Substituir a composição pública atual por quatro superfícies delimitadas: landing institucional, página para advogados, página para desenvolvedores e documentação técnica. A área autenticada, as ferramentas existentes e seus contratos permanecem intactos; a nova UI apenas apresenta fluxos que já têm correspondência no frontend.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, `lucide-react`, CSS existente do frontend.

**Spec:** Este documento contém a especificação visual, de conteúdo e de implementação aprovada para a refatoração da UI pública.

## Global Constraints

- Alterar somente `apps/web` e arquivos de documentação do plano.
- Não alterar `apps/api`, ferramentas, providers, autenticação, contratos, banco ou migrations.
- Não criar capacidades demonstrativas sem correspondência nas ferramentas existentes.
- Não manter componentes, rotas, tipos ou estilos públicos que deixarem de possuir consumidor.
- Não usar estrelas decorativas, slogans genéricos, excesso de cards ou grandes áreas vazias sem função.
- Não fazer commit, push, deploy ou migration.
- Preservar as alterações locais existentes até a revisão do diff.
- Manter a experiência autenticada e suas rotas internas funcionando sem alteração funcional.

---

## Direção aprovada

### Essência do produto

O ForgeLex deve ser apresentado como um espaço de trabalho jurídico que conecta pesquisa, contexto do caso e relação jurisprudencial. O diferencial é permitir que decisões, fundamentos, fatos e perguntas permaneçam relacionados no mesmo percurso, reduzindo dispersão entre ferramentas e assinaturas sem afirmar economia financeira não demonstrada.

### Referências visuais

- **Landing:** composição editorial limpa, hero em tinta escura sobre a base marfim/champagne do ForgeLex, navegação discreta, dois caminhos comerciais e demonstração objetiva.
- **Advogados:** fundo claro, hero dividido entre proposta de valor e conversa demonstrativa, seguido de um problema concreto e seus efeitos.
- **Desenvolvedores:** hero com copy e código realista, integração/API como produto técnico e chamadas objetivas.
- **Documentação:** dark mode próprio, denso e funcional, com quickstart, autenticação, endpoints, parâmetros, respostas e limites.

### Hierarquia comercial

1. O que o ForgeLex resolve.
2. Como a relação jurisprudencial aparece no trabalho.
3. Como o produto se encaixa nas ferramentas já existentes.
4. Um CTA principal por superfície.
5. Documentação como caminho técnico separado, não como extensão da landing.

## Inventário de arquivos e destino

- `apps/web/src/App.tsx`: manter o shell autenticado; simplificar o roteamento público para as superfícies finais.
- `apps/web/src/screens/PublicLandingScreen.tsx`: substituir pela landing única e enxuta.
- `apps/web/src/screens/PublicProductPage.tsx`: remover se as páginas comerciais forem consolidadas em componentes específicos; nenhum código sem consumidor deve permanecer.
- `apps/web/src/screens/PublicAudiencePage.tsx`: substituir ou dividir em componentes focados, evitando uma página parametrizada excessivamente genérica.
- `apps/web/src/screens/public-product-types.ts`: remover se os produtos atuais não forem mais rotas públicas independentes.
- `apps/web/src/screens/public-audience-types.ts`: manter somente se os tipos forem usados pelas novas rotas.
- `apps/web/src/screens/ApiDocsScreen.tsx`: não alterar a ferramenta autenticada; reutilizar apenas informação já exposta, sem duplicar sua lógica.
- `apps/web/src/index.css`: consolidar tokens e estilos da UI pública; remover regras órfãs depois da migração.
- `apps/web/index.html`: manter metadados coerentes com a nova landing, sem alterar configuração de build.
- `apps/web/src/screens/public/`: criar somente se a separação por responsabilidade reduzir duplicação e cada arquivo possuir função clara.

## Plano de execução

### Task 1: Congelar o contrato da superfície pública

**Arquivos:**
- Modify: `apps/web/src/App.tsx`
- Review: `apps/web/src/screens/LandingScreen.tsx`, `ResearchDeskScreen.tsx`, `MatterWorkspaceScreen.tsx`, `DraftStudioScreen.tsx`, `ConnectionsScreen.tsx`, `ApiDocsScreen.tsx`

- [ ] Registrar as rotas públicas finais: `/`, `/para-advogados`, `/para-desenvolvedores` e `/documentacao`.
- [ ] Confirmar que o roteamento autenticado continua apontando para as ferramentas existentes.
- [ ] Remover imports e rotas públicas antigas somente após a nova composição possuir consumidores.
- [ ] Não mover lógica de negócio das ferramentas autenticadas para a camada pública.

### Task 2: Definir os tokens visuais públicos

**Arquivos:**
- Modify: `apps/web/src/index.css`
- Review: `apps/web/src/screens/PublicLandingScreen.tsx`

- [ ] Consolidar largura de conteúdo, escala tipográfica, espaçamento vertical, bordas, sombras e cores em regras públicas nomeadas.
- [ ] Usar os tokens já presentes do ForgeLex como âncora institucional: `--forgelex-ivory`, `--forgelex-paper`, `--forgelex-ink`, `--forgelex-muted`, `--forgelex-accent` e `--forgelex-accent-soft`.
- [ ] Reservar o dark mode técnico para a documentação; ele não deve substituir a identidade marfim, papel, tinta e cognac das páginas comerciais.
- [ ] Limitar componentes de cartão às situações em que agrupem informação ou demonstrem uma ferramenta.
- [ ] Garantir foco visível, contraste adequado, áreas clicáveis confortáveis e responsividade sem criar uma composição mobile paralela.
- [ ] Remover classes específicas de superfícies eliminadas após a troca dos componentes.

### Task 3: Reconstruir a landing comercial

**Arquivos:**
- Replace: `apps/web/src/screens/PublicLandingScreen.tsx`
- Modify: `apps/web/src/index.css`

- [ ] Criar hero com mensagem centrada na relação entre jurisprudência e contexto do caso.
- [ ] Apresentar uma demonstração visual única: pergunta do caso, decisões relacionadas, fundamentos e próxima ação de trabalho.
- [ ] Usar dois caminhos claros: uso no trabalho jurídico e integração técnica.
- [ ] Explicar o diferencial como continuidade do contexto, não como catálogo de funcionalidades.
- [ ] Inserir um bloco de relação jurisprudencial observável, com origem, tema, fundamento e vínculo com o caso.
- [ ] Manter um CTA principal e reduzir CTAs secundários a navegação necessária.
- [ ] Eliminar o conjunto anterior de cards repetitivos, ilustração MCP abstrata e linguagem de “rascunho” ou “revisão humana” na proposta comercial.

### Task 4: Construir a página para advogados

**Arquivos:**
- Create or replace: `apps/web/src/screens/PublicLawyerPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/index.css`

- [ ] Reproduzir a lógica visual da referência: hero claro, copy à esquerda e conversa demonstrativa à direita.
- [ ] Demonstrar uma pergunta jurídica e a passagem para jurisprudência relacionada, sem inventar resultado de tribunal ou precedente específico.
- [ ] Explicar o problema da dispersão entre busca, documentos e contexto do caso.
- [ ] Mostrar como a relação jurisprudencial orienta a análise sem prometer automação decisória.
- [ ] Usar linguagem comercial precisa, sem “mais uma ferramenta”, “caixa-preta” ou promessas de produtividade ilimitada.

### Task 5: Construir a página para desenvolvedores

**Arquivos:**
- Create or replace: `apps/web/src/screens/PublicDeveloperPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/index.css`

- [ ] Criar hero dividido entre benefício técnico e bloco de código visualmente legível.
- [ ] Demonstrar apenas endpoints, parâmetros e conceitos já disponíveis no projeto ou explicitamente marcados como exemplo de interface.
- [ ] Separar integração, autenticação, relação de dados e limites operacionais.
- [ ] Evitar transformar a página comercial em documentação extensa.
- [ ] Direcionar para a documentação independente por CTA único.

### Task 6: Reconstruir a documentação pública

**Arquivos:**
- Create or replace: `apps/web/src/screens/PublicDocumentationPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/index.css`
- Review only: `apps/web/src/screens/ApiDocsScreen.tsx`

- [ ] Criar uma superfície dark própria, inspirada na referência técnica.
- [ ] Implementar quickstart, autenticação, fluxo de integração, endpoints, tabelas de parâmetros, exemplos JSON e códigos de resposta usando dados confirmados.
- [ ] Não copiar componentes da área autenticada que tenham estado, requisições ou contratos diferentes.
- [ ] Diferenciar visualmente conteúdo introdutório, referência de endpoint e exemplos de resposta.
- [ ] Incluir navegação interna consistente e leitura confortável em telas menores.

### Task 7: Limpeza estrutural

**Arquivos:**
- Delete: arquivos públicos sem consumidores após a migração
- Modify: `apps/web/src/App.tsx`, `apps/web/src/index.css`

- [ ] Executar busca por imports, nomes de rotas, classes CSS e textos dos componentes removidos.
- [ ] Excluir `public-product-types.ts`, `public-audience-types.ts` ou equivalentes quando não houver consumidor.
- [ ] Excluir estilos de órbita, cards, previews e superfícies que não participarem da composição final.
- [ ] Confirmar que nenhuma ferramenta autenticada depende dos estilos ou tipos excluídos.

### Task 8: Validação

**Arquivos:**
- Review: diff completo do worktree

- [ ] Executar `pnpm --filter @forgelex/web build`.
- [ ] Executar typecheck do frontend.
- [ ] Executar `pnpm test`.
- [ ] Executar `git diff --check`.
- [ ] Inspecionar visualmente `/`, `/para-advogados`, `/para-desenvolvedores` e `/documentacao`.
- [ ] Verificar que o fluxo de entrada e cadastro continua conectado ao `AuthScreen` existente.
- [ ] Verificar uma rota autenticada de cada ferramenta sem alterar seus comportamentos.
- [ ] Registrar separadamente validação local, pendências e dependências externas.

## Critérios de aceite

- A landing comunica o produto em poucos segundos e não parece um catálogo genérico de SaaS.
- A relação jurisprudencial é demonstrada visualmente e ocupa posição central na proposta de valor.
- A página para advogados e a página para desenvolvedores possuem objetivos, linguagem e demonstrações distintas.
- A documentação é tecnicamente densa e visualmente independente da experiência comercial.
- Não há sobreposição de camadas públicas antigas com componentes novos.
- Não há alteração nas ferramentas, nos contratos ou no backend do projeto.
- Não há arquivos públicos órfãos nem estilos sem consumidor confirmado.
- A implementação é responsiva, acessível nos fluxos principais e validada por build, typecheck, testes e inspeção visual.
