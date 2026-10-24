# ForgeLex — evolução da plataforma V2 com reaproveitamento

Proposta revisada em 10/10/2026 após esclarecimento de Boni. Fonte arquitetural:
`PROJETO_FORGELEX_PLATAFORMA_AGENTICA_JURIDICA_AGNOSTICA_V2_COMPLETO.md`.
Este documento complementa o desenho da experiência e o plano de transição;
não inicia implementação, substitui contratos publicados ou reabre fases concluídas.

## Direção corrigida

O produto é a plataforma jurídica agêntica do V2: domínio jurídico, orquestrador,
agentes especializados, workflows, ferramentas, fontes, políticas, memória,
proveniência e avaliações. Não se reduz a chat nativo, processamento documental
ou catálogo de agentes isolados por espécie de petição.

A experiência conversacional é uma superfície de comando e acompanhamento da
plataforma. O MCP permanece uma superfície de distribuição da mesma infraestrutura,
com consumidores externos e operação própria preservados.

A superfície de trabalho apresenta capacidades jurídicas descobríveis, que abrem
diálogo a partir da necessidade do cliente. Contexto escrito, anexado ou de caso
existente e respostas a perguntas adaptativas com opções orientam a coordenação.
Agentes, prompts, scripts e contratos internos ficam no servidor; a interface
recebe somente status, perguntas, fontes e entregas autorizadas. Redação é uma
capacidade acionável, não uma peça predefinida na entrada. As regras de interação,
descoberta e simplicidade visual estão centralizadas na especificação da experiência.

As seções 5.8, 22–28, 49–55, 59–60 e 65–69 do V2 governam a proposta jurídica:
workflows são produtos versionados, especialistas têm contratos, peças exigem
investigação/estrutura/revisão e a interface não constitui a arquitetura.

O V2 contém notas históricas de ordem de execução e contrato comercial. O programa
STJ concluído e o contrato atual de REST/MCP continuam válidos. Esta é uma evolução
nova, a ser aprovada por Boni; não autoriza restaurar toda a ordem histórica nem
começar a cobrar tokens no ledger atual. Hospedagem de modelo e cobrança de
inferência são frentes propostas próprias, não requisitos para continuar usando MCP.

## Arquitetura que será preservada e completada

Adendo de 11/10/2026: a distribuição MCP recebe uma frente própria de apresentação
documental, independente da inferência nativa: seleção identificada → recuperação
da mesma decisão/versão → leitor da fonte no host compatível. Reutilizar o domínio
`CaseLaw`, corpus, proveniência e UI de leitura; adicionar lookup por identidade
precisa e adapter MCP Apps. O reader atual de anexos depende de sessão/caso e não
pode ser transplantado inteiro para um iframe externo. Separar o núcleo visual
de seus adapters. Host sem UI continua usando ferramentas e resultados textuais.

A comparação com Exordial evidencia um componente de apresentação; a explicação
da conversa é do modelo host. Não inferir agentes, qualidade jurídica ou geração
do inteiro teor pela existência desse componente. Escopo e testes:
[`../superpowers/plans/2026-10-11-mcp-decision-presentation.md`](../superpowers/plans/2026-10-11-mcp-decision-presentation.md).

```text
Site ForgeLex                         Hosts externos via REST/MCP
  objetivo + caso + entregas              chamadas autenticadas às capabilities
             │                                      │
             ▼                                      ▼
  aplicação + Legal Orchestrator           distribuição + autorização
             │                                      │
  especialistas + workflows versionados              │
             │                                      │
             └───────────────┬───────────────────────┘
                             ▼
                tools e serviços jurídicos existentes
                             ▼
                  dados, versões e proveniência

            políticas · auditoria · metering · ledger
```

O modelo do site executa especialistas por um adapter quando essa modalidade
estiver habilitada. No MCP atual, o host continua responsável por seu modelo e
raciocínio. Compartilhar ferramentas, contratos, instruções e definições de
workflow não significa transplantar sessões privadas nem garantir a mesma
topologia interna em hosts diferentes.

## Matriz V2 → código → complemento necessário

Base observada: branch `codex/case-flow-simplification`, HEAD `101ee33`, incluindo
alterações locais anteriores. Não é auditoria nova de publicação ou tráfego remoto.

| Plano do V2 | O que reaproveitar | O que completar |
| --- | --- | --- |
| Experience | Casos, leitor, fatos/provas, pesquisa, editor, revisão, conta e conexões em `apps/web` | Mesa de trabalho e atividade agêntica, integrando as superfícies existentes |
| Distribution | API Fastify, OAuth, `packages/mcp-server` e catálogo externo controlado | Evolução aditiva de capabilities/instruções, somente quando realmente implementadas |
| Application | Repositórios de casos, documentos, propostas, rascunhos e review runs | Tarefas e execução durável que relacionem agentes, decisões e entregas |
| Legal Agent | `agent-core`, contratos de eventos/tools e `legal-workflows` | Catálogo de especialistas, roteamento, handoffs, outputs jurídicos e reconciliação |
| Provider Abstraction | Adapters OpenAI/Anthropic e testes de paridade | Integração real, configuração explícita, retomada compatível e medição do piloto |
| Legal Tool | `ToolRegistry`, gateway STJ, contexto e gravações controladas | Capabilities faltantes, políticas por especialista e invocação comum aos canais |
| Legal Services | Serviços de pesquisa, fatos/provas, estratégia, drafting e revisão | Análise jurídica real e revisão substantiva além de vínculos/metadados |
| Legal Data | Corpus STJ, providers/catalog, ingestão e persistência | Legislação versionada e recuperação normativa verificável para workflows que a exigem |
| Commercial Control | Billing/ledger e cobrança das operações próprias | Orçamento do run e eventual contabilidade de inferência separada e aprovada |
| Trust/Infrastructure | Identidade, escopo por caso, auditoria, revisão esperada e idempotência | Controles aplicados em toda chamada de especialista e recuperabilidade das execuções |

Não criar dez deploys nem repetir serviços para reproduzir os dez planos do V2.

## Limites concretos identificados

- `packages/legal-agents`, `jurisdiction-packs` e `packages/evals` não existem
  neste checkout. São estruturas de referência do V2, não entregas já concluídas.
- `PleadingDraftWorkflow` recebe questões e autoridades do chamador. Produz um
  outline genérico; não identifica requisitos processuais de qualquer peça,
  pesquisa fundamentos autonomamente ou executa revisão adversarial substantiva.
- `CaseDocumentAnalysisWorkflow` organiza a fotografia de dados registrados e
  `knownIssues`; declara que não extrai novos fatos nem questões automaticamente.
  Isso é diferente do recebimento recente de análises feitas por host externo.
- `StrategyService.identifyIssues` lista questões persistidas, não realiza
  issue spotting por inferência. O mapa de teses organiza dados existentes.
- O memo de pesquisa compila autoridades/recorte e ressalvas. Sua estrutura não
  demonstra síntese jurídica especializada, tratamento negativo ou distinção.
- `DraftReviewService` reaproveita conferências de fontes, vínculos e estrutura.
  O nome `adversarialReview` encaminha a revisão estrutural; não prova um agente
  capaz de atacar juridicamente a peça.
- O catálogo MCP local tem nove tools explícitas. Não inclui busca legislativa,
  catálogo de prompts ou execução nativa de todos os agentes do V2.

Esses limites orientam extensão incremental: não apagar a base por ainda não
realizar toda a visão; não declarar especialização concluída apenas pelo nome.

## Agentes jurídicos como parte da plataforma

Implementar catálogo agnóstico no módulo proposto `packages/legal-agents`, usando
`agent-core`, sem duplicar o runtime. Contrato por agente conforme seção 66:
papel, objetivo, escopo, tools permitidas, comportamentos proibidos, contrato de
saída, escalonamento, handoff e critérios de qualidade; instruções versionadas.

| Papel do V2 | Base reaproveitável | Responsabilidade ainda a integrar/implementar |
| --- | --- | --- |
| `legal-orchestrator` | Runtime, eventos, workflow runner e checkpoints | Escolher workflow/topologia e especialistas; coordenar dependências e reconciliar resultados |
| `matter-analyst` | Casos, documentos, âncoras, análise recebida | Extrair/interpretar contexto, distinguir dado e alegação, formular questões com origem |
| `evidence-analyst` | Fatos, provas, coverage e propostas | Investigar suporte/contradições e produzir matriz fundamentada, sem confirmar fatos automaticamente |
| `legal-researcher` | Gateway e research memo | Formular plano jurídico, pesquisar fontes pertinentes e comparar posições, não só executar query |
| `authority-verifier` | Obter/verificar autoridade e proveniência | Recuperar passagens e qualificar limites, sem presumir vigência ou tratamento posterior não demonstrado |
| `procedure-specialist` | Contexto do caso e contratos de domínio | Investigar requisitos e posição processual usando regras/fontes disponíveis; não inventar regras ou prazos |
| `legal-drafter` | Drafting, seções, versões e citações | Construir estrutura adequada e argumentos por seção a partir da matriz de questões/fatos/fontes |
| `adversarial-reviewer` | Findings de revisão existentes | Procurar objeções e saltos jurídicos, distinguindo deficiência estrutural de deficiência substantiva |
| `citation-reviewer` | Referências documentais e jurisprudenciais | Separar existência da fonte de suporte à proposição e expor trechos comparados |
| `final-editor` | Editor, versões e DOCX | Revisão editorial preservando conteúdo jurídico e registrando mudanças substantivas sugeridas |
| `client-communication-agent` / `docket-agent` | Entidades e documentos do caso | Evoluções posteriores com escopo próprio; comunicação externa/protocolo continuam fora do primeiro incremento |

Especialista é um contrato executável, não necessariamente um processo dedicado
ou outro modelo. O orquestrador seleciona a menor topologia adequada (V2, seção
23). Papéis podem compartilhar uma implementação inicial, mas outputs e critérios
devem permanecer identificáveis; não invocar todos os agentes em toda tarefa.

## Como a competência jurídica entra no sistema

1. **Workflow versionado:** requisitos de entrada, etapas necessárias, condições
   de passagem, perguntas relevantes e critérios de conclusão.
2. **Especialistas:** interpretação e investigação atribuídas a papéis definidos,
   com contexto mínimo e resultados estruturados que o próximo papel consome.
3. **Instruções jurídicas:** prompts por papel e playbook por tarefa; versão e
   fontes de fundamento registradas. Não confundir template da peça com prompt.
4. **Tools/scripts determinísticos:** localizar trechos, recuperar dispositivos,
   validar schema, reunir vínculos e exportar. Expostos como operações semânticas,
   nunca shell arbitrário entregue ao modelo.
5. **Fontes verificáveis:** jurisprudência e legislação com recorte/versão. O
   conhecimento interno do modelo não substitui recuperação normativa demonstrada.
6. **Avaliação:** exemplos positivos, negativos, ambíguos e sem prova suficiente;
   avaliar requisitos, questões omitidas, contraposição, suporte, pedidos e limites.

O incidente de desconsideração mencionado por Boni é um exemplo de avaliação
de confecção de peça, não a redefinição do produto nem a escolha automática de
um primeiro agente exclusivo. A plataforma deverá selecionar competências e
fontes apropriadas; não declarar essa peça suportada antes da validação concreta.

Legislação não pode ficar como mero acessório posterior se o workflow promete
investigar CC/CPC. Completar o serviço normativo delimitado antes de homologar
esse resultado. A interface e a infraestrutura podem ser testadas anteriormente
com fixtures, claramente diferenciadas de fonte real e competência jurídica.

## Preservação efetiva do MCP

- Manter nomes, schemas e comportamento das tools existentes, autenticação/OAuth,
  seleção por caso, erros, proveniência, idempotência e política comercial.
- Capabilities novas entram no catálogo externo somente após implementação e
  testes. Não expor o catálogo aspiracional inteiro do V2.
- Serviços jurídicos comuns atendem site/REST/MCP. Registro e permissões podem
  diferir por canal; o MCP não ganha acesso a todas as tools internas.
- Não exigir API OpenAI/Anthropic do ForgeLex para executar ferramentas MCP atuais.
  Não converter consumo do modelo do host em débito novo do ledger ForgeLex.
- Definições de tarefa/instruções podem ser distribuídas a hosts. Suporte a
  prompts MCP seria aditivo e testado, não assumido como existente.
- Garantir fixtures de regressão dos nove nomes atuais e testes de operação,
  revogação, conflito e retry; `case.save_analysis` é capacidade do checkout local,
  não prova de publicação remota deste incremento.

## Ordem de evolução

1. Consolidar matriz de reaproveitamento e contratos dos agentes/workflows.
2. Completar fontes e tools que cada workflow precisa; legislação no caminho
   de aceitação de tarefas normativas, mantendo o recorte jurisprudencial STJ.
3. Integrar orquestrador/especialistas, context packets e checkpoints; demonstrar
   decisões jurídicas e revisão, não apenas sequência documental.
4. Conectar a experiência já desenhada e o editor, preservando rotas e o MCP.
5. Homologar por workflow/capability, com métricas jurídicas e execução real
   autorizada; ampliar o catálogo progressivamente.

Sem implementar agora. A prévia existente demonstra organização e interação,
não a competência jurídica nem a execução multiagêntica. A aprovação do projeto
deve considerar ambos: experiência e comportamento técnico/jurídico.

## Acompanhamento de implementação — 24/10/2026

O retrato de 10/10 acima permanece como base histórica. A Tarefa 0 passou a
ter implementação em packages/legal-agents, com agent-definition.ts,
agent-catalog.ts, context-packet.ts, instruções por papel, contratos,
playbooks e avaliações definidas. Os papéis não contemplados no recorte
continuam identificados como pendentes, conforme a matriz desta arquitetura.

O desvio inicial de manter catálogo e contexto em legal-workflows foi corrigido
por determinação de Boni. Os consumidores antigos mantêm exports compatíveis.
O runner existente coordena contratos e registra suas versões sem criar runtime.

Estado e evidências: [registro da Tarefa 0](2026-10-24-agent-contracts-task0.md).
Código: branch codex/agent-contracts-a0, worktree
C:/Users/Boni Jr/.codex/worktrees/analise-release/SDK.

Os testes de contratos usam fixtures e handlers determinísticos. A inferência
jurídica nativa, fontes normativas, orquestração e piloto continuam nas fases
previstas neste documento. Nenhuma capability nova foi publicada no MCP.
