# Referências para a experiência e a execução agêntica do ForgeLex

Pesquisa em 10/10/2026, solicitada por Boni. Escopo: documentação pública,
artigos de engenharia e inspeção estática de arquivos públicos no GitHub.
Nenhum projeto externo foi instalado ou executado. Não houve inferência,
integração, transmissão de documentos de clientes ou alteração do produto.

Base local de comparação: `codex/case-flow-simplification`, HEAD `101ee33`,
e `2026-10-10-v2-agentic-platform-reuse.md`. A matriz local é a referência
prévia; esta pesquisa não constitui nova auditoria de todos os módulos.

## O que foi encontrado

| Referência | Evidência examinada | Contribuição possível | Limite |
| --- | --- | --- | --- |
| Harvey | Artigos assinados pela engenharia sobre agentes e busca agêntica | Capacidades compostas de instruções, ferramentas e subagentes; coordenação compartilhada; pesquisa iterativa e avaliações | Descrição do fornecedor, sem acesso ao código ou ambiente comercial |
| CoCounsel | Página oficial do produto | Solicitação em linguagem natural, análise/pesquisa/redação na mesma experiência, possibilidade de redirecionar o trabalho | Não permite confirmar prompts, runtime ou topologia interna; conteúdo e disponibilidade por mercado não são equivalentes ao Brasil |
| Legora | Página oficial de Workflows | Composição de redação, revisão, extração e pesquisa orientada pelo objetivo | Alegações de produto; não demonstra implementação nem desempenho jurídico |
| L-MARS | README, `lmars/workflow.py`, `lmars/agents.py` e árvore do repositório | Ciclo de busca, avaliação de suficiência, reformulação e síntese, limitado por número de rodadas; avaliação de citações | Pesquisa acadêmica, sem homologação brasileira ou geração completa de peças demonstrada nesta inspeção |
| judicialmind/legal-agents | README, `index.js` e estrutura de arquivos | Organização de instruções jurídicas por responsabilidade e jurisdição | O código examinado carrega definições Markdown; isso não constitui, por si, execução orquestrada |
| NyayaAI | README, `server.py` e árvore publicada | Exemplo de entrada conversacional, histórico e eventos de execução | O servidor importa `agents.orchestrator`, ausente na árvore consultada; README anuncia Mastra, enquanto o servidor importa Claude Agent SDK |
| mcp-juridico-brasil | README e árvore de módulos | Ferramentas processuais distribuídas via MCP, separadas do modelo do cliente | Não é uma plataforma de especialistas que redige peças; tools e cobertura não foram homologadas nesta pesquisa |

## Achados técnicos que importam

**Capacidades que se combinam.** A engenharia do Harvey descreve pacotes de
instruções e operações, alguns com subagentes, utilizáveis no mesmo atendimento.
Isso sustenta a distinção entre a entrada do usuário e a capacidade acionada:
redação pode ser escolhida durante o trabalho. Não implica copiar o framework
ou a regra de implementação adotados pelo fornecedor.

**Investigação com retorno às fontes.** O artigo de busca do Harvey descreve
seleção de fontes, recuperação, análise e exame de suficiência. No L-MARS,
`LMarsWorkflow.run` implementa rodadas limitadas, acumula e deduplica resultados,
consulta `JudgeAgent` e utiliza `next_query` para refinar a busca. Não basta
executar uma consulta e encaminhar os resultados diretamente à redação.

**Verificação tem alcance limitado.** O L-MARS distingue suporte da citação de
validade doutrinária. O código também pode sintetizar ao atingir o limite de
rodadas e tem fallback para resultados filtrados quando não há resultado válido.
Esses comportamentos não devem ser transplantados como garantia de suficiência.
No ForgeLex, uma execução pode terminar com informação insuficiente e explicar
o limite; conferir uma fonte não certifica o cabimento de um pedido.

**Prompts não equivalem a um sistema em execução.** `judicialmind/legal-agents`
fornece definições e um carregador. É uma referência para contratos e organização,
sem evidência de execução completa apenas por listar especialistas. O NyayaAI
mostra outro risco: documentação e arquivos publicados não correspondem
integralmente. Não adotar esses repositórios como base pronta para o ForgeLex.

## Aplicação proposta ao V2

Esta seção é proposta de desenho, não autorização nem implementação.

1. **Entrada aberta:** objetivo em texto, contexto escrito, documentos anexados
   ou caso existente. Perguntar dados materiais quando necessários; não exigir
   que o usuário escolha agentes, ferramentas ou espécie de peça na entrada.
2. **Coordenação contextual:** o orquestrador identifica o objetivo e aciona
   responsabilidades adequadas. As capacidades de análise, pesquisa, estratégia,
   redação e revisão podem se combinar e retornar a uma etapa anterior.
3. **Contexto e entregas explícitos:** cada especialista recebe apenas o contexto
   autorizado e devolve fatos alegados, referências, questões, lacunas ou um
   documento, conforme seu contrato. Rastreabilidade fica na execução interna;
   fontes e ressalvas jurídicas ficam disponíveis ao usuário.
4. **Redação como capacidade:** uma peça é criada quando o pedido ou a sequência
   de interação exigir. O tipo, o regime, a fase e os requisitos são definidos
   pelo contexto. Pesquisa e outline são insumos; quando houver redação, o
   resultado é um documento editável, ligado à tarefa e ao contexto de origem.
5. **Progresso simples e verdadeiro:** processando, coletando informações,
   pesquisando, estruturando, aprimorando e concluindo, somente conforme a
   atividade real. Não expor topologia, prompts ou catálogo de ferramentas.
6. **Operações existentes compartilhadas:** aproveitar casos, documentos,
   fatos/provas, pesquisa STJ, fontes, editor, versões e revisão. Serviços e
   permissões continuam comuns às superfícies nativa e REST/MCP; o modelo e a
   coordenação de um host externo continuam sob responsabilidade daquele host.
7. **Qualidade verificável:** avaliar escolha da capacidade, perguntas necessárias,
   suporte das afirmações, coerência dos pedidos, fidelidade aos documentos e
   tratamento de insuficiência. Casos de avaliação definidos e aprovados por Boni,
   sem criar dependência de avaliador humano externo.

Modelos e fontes estrangeiros são referências arquiteturais. Não importar regras
processuais, formatos de petição ou precedentes como conteúdo jurídico brasileiro.
Reutilização de código depende de licença e revisão do trecho escolhido; esta
pesquisa não seleciona framework, provedor ou modelo nem adiciona dependências.

## Como deve mudar a próxima prévia

A tela inicial mostra uma solicitação e seu contexto, não uma peça pronta. Uma
mesma interação pode começar pela análise e depois receber o pedido de pesquisa,
redação ou revisão. O documento aparece quando produzido e é aberto no editor.
Os cenários precisam demonstrar capacidades diferentes, inclusive trabalho que
não gera peça, e uma dúvida relevante que altera a investigação.

O objetivo é testar a compreensão da experiência antes de programar o runtime.
As simulações anteriores com uma petição exposta na entrada não definem essa
direção de produto. O exemplo de IDPJ não restringe a plataforma a essa matéria.

## Fontes examinadas

- [Harvey — princípios de desenvolvimento de agentes](https://www.harvey.ai/blog/principles-that-helped-us-scale-agent-development)
- [Harvey — busca agêntica](https://www.harvey.ai/blog/how-agentic-search-unlocks-legal-research-intelligence)
- [CoCounsel — experiência de análise, pesquisa e redação](https://legal.thomsonreuters.com/en/products/cocounsel-legal/corp)
- [Legora — Workflows](https://legora.com/product/workflows)
- [L-MARS — repositório](https://github.com/boqiny/L-MARS)
- [L-MARS — ciclo de execução inspecionado](https://github.com/boqiny/L-MARS/blob/main/lmars/workflow.py)
- [L-MARS — agentes inspecionados](https://github.com/boqiny/L-MARS/blob/main/lmars/agents.py)
- [L-MARS — artigo acadêmico](https://arxiv.org/abs/2509.00761)
- [Legal Agents — definições](https://github.com/judicialmind/legal-agents)
- [Legal Agents — carregador inspecionado](https://github.com/judicialmind/legal-agents/blob/main/index.js)
- [NyayaAI — repositório](https://github.com/B97784/NyayaAI)
- [NyayaAI — servidor inspecionado](https://github.com/B97784/NyayaAI/blob/main/server.py)
- [MCP Jurídico Brasil — repositório](https://github.com/DeHor-Labs/mcp-juridico-brasil)

Links de código apontam para branches mutáveis; observações correspondem à
consulta de 10/10/2026. Inspeção estática não confirma executabilidade, segurança,
cobertura jurídica ou resultados dos benchmarks anunciados pelos autores.
