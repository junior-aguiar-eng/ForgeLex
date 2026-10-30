# ForgeLex — experiência de trabalho agêntico

Proposta revisada para avaliação de Boni, 10/10/2026. Não autoriza implementação,
chamadas pagas, migration, commit, push, integração ou publicação.

## Direção arquitetural corrigida

O produto é a plataforma agêntica do
`PROJETO_FORGELEX_PLATAFORMA_AGENTICA_JURIDICA_AGNOSTICA_V2_COMPLETO.md`, não apenas
um agente generalista com ferramentas nem um catálogo isolado de petições.
Este documento define sua experiência; o núcleo jurídico e a matriz de
reaproveitamento estão em
`docs/architecture/2026-10-10-v2-agentic-platform-reuse.md`.

Aplicar o catálogo de papéis do V2, workflows jurídicos versionados, prompts,
context packets, fontes, ferramentas/scripts e avaliações jurídicas. A conversa
é superfície de comando; o MCP preserva sua distribuição externa. Um exemplo
de peça serve para avaliar competências, não redefine a plataforma.

## Intenção e critérios de sucesso

O usuário informa uma necessidade jurídica por ação orientada ou solicitação
livre, com contexto escrito, documentos anexados ou contexto de caso existente.
Anexo e cadastro prévio de caso não são obrigatórios para iniciar o diálogo.
O ForgeLex esclarece informações materiais, conduz as operações intermediárias,
adapta o plano aos resultados e entrega artefatos com contexto de origem, fontes
e lacunas verificáveis. Entregas de caso mantêm seu vínculo; documentos extensos
continuam em leitor e editor próprios.

O sucesso não é reduzir apenas o número de botões: é reduzir decisões operacionais,
trocas de contexto e intervenções que não exigem julgamento jurídico. Medir
conclusão da tarefa, intervenções necessárias, tempo, custo e qualidade das fontes.
Não fixar percentual de redução sem comparar o mesmo trabalho antes/depois.

Boni é o único avaliador e aprovador humano do projeto, conforme `AGENTS.md`.
O usuário autenticado da aplicação controla as próprias tarefas e documentos;
essa autorização operacional não cria um segundo aprovador do desenvolvimento.

## Estado observado, sem transportar conclusões para produção

Checkout: `C:\Users\Boni Jr\.antigravity-ide\SDK`.
Branch: `codex/case-flow-simplification`. HEAD: `101ee331fc621ebf38fd536a549c38b0f9340d12`.
Há alterações locais da simplificação anterior, ainda sem commit. Este desenho
preserva esse trabalho. Não foi consultado tráfego remoto nesta atividade.

| Capacidade | Evidência no checkout | Reutilização e limite |
| --- | --- | --- |
| Runtime e eventos de agentes | `packages/agent-core/src/runtime/agent-runtime.ts`, `contracts/agent-events.ts` | Reutilizar contratos. `run` delega ao provider; não constitui serviço conversacional durável. |
| Registro, validação, timeout e cancelamento de tools | `packages/agent-core/src/registry/tool-registry.ts` | Reutilizar; selecionar ferramentas por tarefa e autorização no servidor. |
| Adaptadores OpenAI/Anthropic | `packages/agent-provider-openai`, `packages/agent-provider-anthropic` | Reutilizar; estados ativos em memória não provam retomada após reinício. Homologação real é uma etapa futura. |
| Pesquisa STJ | `packages/legal-tools/src/gateway/legal-tool-gateway.ts` | Preservar buscar/obter/verificar, proveniência e cobrança própria. Verificação de metadados não prova suporte semântico à tese. |
| Casos, documentos e contexto autorizado | `packages/legal-tools/src/case-context`, `apps/api/src/case-context` | Preservar seleções e revisões. Criar consentimento próprio para processamento nativo; não herdar consentimento OAuth externo indiscriminadamente. |
| Análise documental e propostas | `packages/legal-workflows/src/case-document-analysis`, `packages/persistence/src/repositories/case-analysis-repository.ts` | Reutilizar propostas e adoção humana; o fluxo local atual recebe análise de host externo. Não confirmar fatos automaticamente. |
| Workflows e checkpoints | `packages/legal-workflows/src/runtime/workflow-runner.ts`, `packages/persistence/src/repositories/workflow-checkpoint-repository.ts` | Reutilizar padrões. Checkpoint de workflow não equivale a histórico de conversa ou estado completo de SDK. |
| Rascunhos, revisão e DOCX | `apps/web/src/screens/DraftStudioScreen.tsx`, `packages/legal-tools/src/drafting`, `apps/api/src/review` | Preservar editor, versões e fontes. Exportar versão salva; aprovação jurídica pertence ao usuário. |
| Ledger e pagamentos | `packages/billing-ledger`, `apps/api/src/billing` | Preservar contabilidade da operação jurídica. Reserva e medição de inferência são capacidades adicionais. |
| REST/MCP | `apps/api/src/app.ts`, `packages/mcp-server` | Manter contratos e consumidores existentes. A API atual não conecta providers a um chat nativo operacional. |

O V2 é referência de arquitetura e comportamento jurídico: seções 22–28
(agentes, topologias e workflows), 49–55 (afirmações, redação e revisão), 59–60
(avaliações), 65–69 (instruções, contexto e experiência). Aproveitar esses contratos
e o código presente, sem impor todos os agentes/fontes em cada execução.

## Alternativas e escolha recomendada

1. **Mesa do caso com conversa e entregas integradas — recomendada.** Acrescenta
   uma entrada de trabalho, reutiliza serviços e editor e preserva rotas atuais.
   Exige integração de execução, mas permite homologação progressiva e rollback.
2. **Chat como substituição integral da interface.** Entrada simples, mas piora
   leitura/edição extensa e pode perder organização entre conversas e versões.
3. **Assistente lateral nas telas atuais.** Menor intervenção visual, mas mantém
   boa parte da coordenação manual e das mudanças de contexto.

## Organização da experiência

- Navegação principal: **Trabalho**, **Casos**, **Biblioteca**. Conta, consumo,
  conexões, pesquisa manual e recursos administrativos ficam acessíveis em menu.
- Entrada: campo “O que você precisa fazer?”, anexos e caso opcional. É permitido
  pesquisar sem caso; salvar um resultado persistente solicita vinculação ou
  criação do caso, sem um cadastro longo obrigatório antes de começar.
- Ações iniciais descobríveis: **Analisar documentos**, **Pesquisar uma questão**,
  **Criar uma peça** e **Revisar um texto**. Cada ação inicia um diálogo orientado
  à necessidade; não dispara uma entrega predefinida nem exige coordenar agentes.
- Caso persistente reúne documentos, fatos/propostas, pesquisas, conversas e
  entregas. Conversa e caso não são a mesma entidade.
- Histórico agrupa tarefas pelo caso e objetivo, evitando listas de chats sem
  relação. Biblioteca oferece tarefas orientadas ao resultado e permite edição
  das instruções, com versão do modelo de tarefa registrada.
- Área principal mostra pedido, progresso compacto e resultado. **Contexto**
  abre documentos autorizados e escopo. **Fontes** abre trechos e suas origens.
- Progresso usa estados compreensíveis: processando, coletando informações,
  analisando, pesquisando, estruturando, aprimorando e concluindo, conforme a
  atividade efetiva. Não apresentar nomes de agentes, topologias, prompts,
  contratos, scripts ou catálogo de tools na experiência de trabalho. Esses
  detalhes pertencem à operação interna; fontes e lacunas jurídicas continuam
  acessíveis. Status não pode afirmar pesquisa ou coleta que não ocorreu.
- Entregas aparecem como resumo, tabela, linha do tempo ou minuta. Abrir o editor
  mantém o caso e a execução, sem exigir copiar conteúdo entre módulos.
- Quando a redação for solicitada, a entrega é a minuta efetivamente redigida, com
  endereçamento, fatos, fundamentos e pedidos. Pesquisa e outline são insumos;
  não substituem a peça. Campos ausentes e suporte pendente ficam marcados,
  sem inventar dados. Insuficiência material pode mudar a entrega para análise
  fundamentada de lacunas, claramente identificada.
- Uma ação principal de execução por estado; isso não elimina as opções iniciais
  que apresentam capacidades. No resultado, oferecer apenas ações pertinentes:
  pesquisar fundamentos ou criar peça a partir da análise; editar, revisar ou
  baixar um documento. Ações secundárias ficam em **Mais opções**. Não repetir
  a mesma capacidade em menus, cartões e barras da mesma superfície.
- Contexto, fontes e observações abrem sob demanda junto ao trabalho. Links
  mantêm caso/tarefa/versão e retorno identificável; não criar redes de atalhos
  entre módulos nem exigir copiar resultados. Conexões/MCP ficam acessíveis sem
  disputar o centro do trabalho. A UI expõe capacidades jurídicas, não mecanismos.

## Premissas explícitas do diálogo jurídico

Decisões de Boni consolidadas em 10/10/2026; prevalecem sobre arranjos divergentes
das prévias exploratórias anteriores.

**Ação → diálogo → contexto → execução especializada → entrega.** A ação é uma
porta de entrada compreensível. Não é uma peça pronta, um formulário extenso ou
uma sequência de chamadas que o cliente tenha de comandar. Agentes, prompts,
playbooks, ferramentas/scripts e orquestração são especializados na finalidade,
selecionados conforme contexto e versionados internamente. Ações podem compartilhar
especialistas e serviços; não exigem um robô dedicado por botão ou espécie de peça.

| Ação visível | O diálogo esclarece quando necessário | Capacidade interna do V2 |
| --- | --- | --- |
| Analisar documentos | Objetivo da análise, documentos e questão a examinar | Análise do caso/provas, questões, contradições e lacunas |
| Pesquisar uma questão | Problema, contexto, regime, recorte e finalidade | Plano de investigação, fontes, verificação e síntese |
| Criar uma peça | Resultado pretendido, posição da parte, fatos e situação processual | Procedimento, análise, pesquisa, estrutura, redação e revisão |
| Revisar um texto | Texto/versão, finalidade e alcance da revisão | Revisão substantiva, citações e edição conforme o pedido |

Conhecer a espécie de peça não é pré-condição de entrada. O cliente pode informá-la
ou solicitar avaliação da medida adequada. Tampouco toda análise gera uma peça:
uma entrega pode dar origem a novo pedido no mesmo contexto. O sistema não
transforma sugestões ou escolhas de objetivo em conclusões jurídicas.

### Perguntas com opções, adaptativas e neutras

- Priorizar uma pergunta relevante por vez, com opções marcáveis em linguagem
  jurídica compreensível. Seleção única para decisões excludentes; múltipla para
  objetivos compatíveis. Não transformar o diálogo num questionário obrigatório.
- Reutilizar o contexto escrito, os documentos selecionados e respostas anteriores.
  Não perguntar informação já fornecida; ambiguidade, conflito ou mudança relevante
  podem exigir esclarecimento, com motivo explícito. Extração de documento continua
  alegação/proposta até conferência; reutilizar não significa certificar o fato.
- As próximas opções e campos dependem da ação, das respostas e do contexto.
  Campos complementares surgem somente quando necessários. Manter resposta livre,
  **Outro objetivo** e **Ainda não sei** quando pertinentes; desconhecimento não
  autoriza inventar fatos ou avançar com pressuposto jurídico indispensável ausente.
- Formular opções sem pressupor cabimento ou procedência: **Avaliar se cabe recurso**,
  por exemplo, antes de exigir a escolha de um recurso. Não pré-marcar respostas
  jurídicas nem registrar sugestão do modelo como escolha do cliente.
- Respostas de objetivo/contexto não equivalem à autorização de acesso, consumo,
  adoção de fatos ou aprovação da entrega. Esses atos continuam explícitos e distintos.
- Permitir corrigir resposta ou contexto, preservar os insumos e reavaliar somente
  o trabalho dependente da mudança. Não sobrescrever entregas/versões anteriores
  nem manter aprovação válida para conteúdo alterado.

Exemplo de pergunta após **Analisar documentos**: “O que você gostaria de obter?”
Opções possíveis: resumo de fatos/andamento; riscos, contradições e lacunas;
avaliação de questão específica; preparação para elaborar uma peça; outro objetivo.
São opções de finalidade, não afirmações sobre os documentos ou o mérito do caso.

### Critérios de aceitação da experiência

1. O cliente identifica as quatro capacidades iniciais e consegue abrir o diálogo
   por ação ou texto livre, sem conhecer agentes, tools ou a espécie da peça.
2. O trabalho começa com contexto escrito, anexo ou caso existente; a falta de
   anexo não bloqueia uma questão que possa ser tratada pelo contexto informado.
3. Perguntas necessárias usam opções adequadas, permitem resposta livre e não
   repetem informações disponíveis nem induzem conclusão jurídica.
4. A continuação reaproveita o contexto: análise → pedido de pesquisa/redação/revisão,
   quando pertinente, sem copiar conteúdo ou cadastrar o caso novamente.
5. A tela mostra status verdadeiro, resultado e ações pertinentes. Fontes e revisão
   permanecem acessíveis; não há painel de agentes nem duplicação de funcionalidades.
6. A peça aparece apenas quando produzida por uma solicitação de redação. Pesquisa
   e outline não substituem essa entrega; lacunas e limites permanecem identificados.

## Primeiro fluxo e estados

Fluxos da plataforma: pesquisa jurídica complexa, análise de autos e confecção/
revisão de peças, conforme V2. Cada fluxo integra especialistas e critérios
jurídicos próprios; não se limita a ler documentos e gerar texto. A seleção do
primeiro workflow a homologar será explícita, sem presumir que o exemplo de
contestação ou de incidente constitui todo o projeto. A pergunta inicial deve
identificar objetivo e posição processual quando houver ambiguidade material.

1. **Pedido e diálogo:** ação visível, descrição livre ou tarefa da biblioteca.
   Aproveitar contexto escrito/anexos/caso e esclarecer a necessidade por perguntas
   adaptativas com opções. Não solicitar todos os dados de todas as ações de uma vez.
2. **Escopo:** fontes selecionadas, objetivo e limite de consumo ficam explícitos.
   Uma autorização abrange leituras, análise, pesquisas e novas entregas internas
   previstas. Expor indicação breve do plano, expansível, sem exigir aprovação de
   cada chamada de tool.
3. **Execução:** extrair contexto → identificar questões → selecionar ferramentas
   → pesquisar/obter fontes → redigir → verificar. Essa é uma trajetória possível,
   não um roteiro fixo: omitir pesquisa desnecessária, voltar a um documento ou
   pedir esclarecimento se faltar informação material.
4. **Intervenção:** mostrar exatamente o que falta e por quê, preferindo opções
   neutras com resposta livre quando pertinente. Falta de documento
   pode permitir minuta preliminar marcada; identidade processual ambígua pode
   exigir resposta. Nunca inventar o dado para seguir.
5. **Entrega:** texto, fontes por afirmação, limitações e propostas não adotadas.
   Guardar como entrega preliminar no caso; não equivale à aprovação profissional.
6. **Revisão:** editar, conferir fontes, decidir propostas, salvar nova versão,
   aprovar e exportar. Edições posteriores tornam a aprovação anterior inaplicável
   à nova versão. DOCX usa a versão efetivamente salva.

Estado de execução proposto:
`QUEUED → RUNNING ↔ WAITING_USER → COMPLETED | FAILED | CANCELLED`.
Interrupção do processamento e desconexão do navegador são eventos distintos.
Cancelar encerra a execução e impede novas chamadas; continuar depois inicia uma
execução sucessora a partir do checkpoint seguro, sem fingir retomada de SDK não
suportada. Entrega pode estar `PRELIMINARY` mesmo com execução `COMPLETED`.

## Arquitetura incremental

### Apresentação documental no MCP — adendo de 11/10/2026

Incluir uma camada visual aditiva para decisões consultadas, reaproveitando
pesquisa, proveniência e componentes de leitura/citação. A resposta analítica do
host pertence ao ChatGPT/Claude; a responsabilidade do ForgeLex é entregar o
registro correto e apresentar seu conteúdo disponível sem paráfrase. Essa camada
é independente do runtime e dos especialistas jurídicos do V2.

Desenho e aceitação em
[`2026-10-11-mcp-decision-presentation-design.md`](2026-10-11-mcp-decision-presentation-design.md);
execução futura no
[`../plans/2026-10-11-mcp-decision-presentation.md`](../plans/2026-10-11-mcp-decision-presentation.md).
Uma decisão por vez, navegação discreta para seleção múltipla, fonte e metadados
sob demanda. Inteiro teor é link externo quando disponível; ementa e dispositivo
não equivalem a relatório/votos completos. A prévia não atribui ao ForgeLex a
explicação gerada pelo modelo externo nem demonstra MCP Apps em funcionamento.

`Interface de trabalho → aplicação/execução → Legal Orchestrator → especialistas
e workflows versionados → AgentRuntime/adapters + tools autorizadas → serviços
jurídicos e fontes existentes/estendidas`.

REST/MCP permanecem outra entrada para a infraestrutura jurídica comum. O host
externo mantém seu modelo; não é obrigado a adotar o runtime nativo do site.

Adicionar um módulo `apps/api/src/agentic-workspace` e uma superfície web isolada.
Domínio e persistência recebem conversas, mensagens, execuções e eventos. Não
criar outro monorepo, trocar framework/banco nem duplicar o serviço de pesquisa.

O orquestrador recebe contexto autorizado, objetivo, workflows e catálogo de
especialistas. Cada especialista recebe context packet mínimo, instruções
versionadas, tools estreitas, output contract e condições de handoff. O catálogo
V2 distingue análise do caso/provas, pesquisa, procedimento, redação e revisão;
papéis não devem desaparecer atrás de um prompt genérico único.

Controles de autorização, orçamento, schema, efeitos e idempotência são impostos
pelo servidor antes de cada chamada; instruções ao modelo são complementares.
Não considerar a sanitização por expressões regulares uma barreira suficiente
contra instruções maliciosas em documentos. Documentos são dados não confiáveis.

Uma camada durável normaliza eventos do provider e armazena a sequência interna.
A projeção pública usa allowlist: status simples, perguntas, entregas e referências
autorizadas. Não enviar prompts, contratos de agentes, catálogo interno de tools
ou argumentos brutos ao frontend, nem apenas ocultá-los visualmente. Não guardar
cadeia privada de raciocínio; registrar plano operacional, ferramentas, evidências,
resultados e consumo na trilha interna com acesso controlado.

Reutilizar leitura/análise/rascunho com adaptações de identidade necessárias. Não
exigir token OAuth do host externo de uma chamada nativa autenticada nem remover
suas validações: criar contexto interno validado que imponha o mesmo escopo.

## Autonomia, integridade e custo

- Ler apenas fontes selecionadas e autorizadas. Revogação, exclusão ou mudança de
  versão invalida o contexto e impede novas leituras/ações indevidas.
- Novos rascunhos são versões preliminares; não sobrescrever edições humanas.
  Gravações com revisão esperada e chave idempotente, incluindo retries.
- Propostas de fatos e teses permanecem propostas até adoção explícita.
- Pesquisa sem resultado, provider indisponível e fonte insuficiente são estados
  diferentes. Não transformar falha em pesquisa negativa.
- Identificação da citação, coincidência do trecho e suporte à afirmação são
  verificações diferentes. Explicitar suporte parcial/ausente/indeterminado.
- Ferramentas semânticas de verificação ajudam, mas não garantem correção jurídica;
  avaliação com exemplos de referência aprovados por Boni mede o resultado.
- Teto por execução e reserva antes de chamada paga, tanto de modelo quanto de
  pesquisa própria. Limite de turnos, ferramentas e concorrência. Cancelamento
  não estorna automaticamente consumo já ocorrido.
- Primeira integração usa um provider/modelo escolhido expressamente por Boni,
  sem fallback para outro provedor ou envio de documentos a destino não autorizado.
- Sem protocolo, envio a terceiros ou efeitos externos no primeiro incremento.
  Controle de efeito externo, se futuramente incluído, exige autorização própria.

## Entregas e decisões

**Nesta atividade:** desenho, plano incremental e prévia interativa sintética,
sem inferência, pesquisa, persistência de caso ou cobrança reais.

**Próximos incrementos futuros:** contratos e catálogo de especialistas do V2,
fontes/tools suficientes por workflow, execução persistente e avaliação jurídica.
Integrar progressivamente com a mesa do caso e revisão no editor; flags desligadas
por padrão. Nem adapters nem workflows estruturais atuais provam competência
jurídica completa; observar os limites registrados na matriz de reaproveitamento.

**Dependência jurídica:** legislação delimitada, versionada e verificável deve
anteceder a homologação de workflows que prometem pesquisar normas. Não relegar
esse requisito para depois da entrega jurídica. Interface e infraestrutura podem
ser demonstradas previamente com fixtures explícitas.

**Depois:** ampliar workflows, biblioteca administrável e especialistas por
benefício demonstrado. Expansão de tribunais permanece decisão estratégica própria.

Antes de execução real, Boni decide provider/modelo, teto financeiro do piloto e
escopo de transmissão de documentos. Antes de lançamento comercial, decide preços,
margem e políticas de consumo. Essas escolhas não impedem avaliar a experiência
com dados sintéticos agora.

Aceitação da experiência: Boni consegue iniciar a tarefa, entender a execução,
resolver uma lacuna, abrir fonte, editar a entrega e identificar o que foi salvo.
Aceitação técnica futura: isolamento, revogação, reinício, cancelamento, conflito,
idempotência, orçamento concorrente e qualidade das fontes demonstrados.

## Prévia

`forgelex-agentic-workspace.html` no diretório de visualizações desta conversa.
Dois arranjos exploratórios: **Conversa e entrega** e **Revisão lado a lado**.
Os conteúdos são sintéticos; referências ilustram navegação documental, não
pesquisa jurisprudencial homologada. A demonstração não prova backend agêntico.

Validação da prévia em 10/10/2026: Chromium local, duas variantes, aparência
clara/escura e largura de 360px. Percurso pedido/escopo, lacuna, fonte, editor,
salvamento, invalidação de aprovação após edição, biblioteca/cronologia e
interrupção/continuação passaram sem erros JavaScript; sem overflow horizontal
na verificação de 360px. Não foram executados testes do produto nesta atividade.

Arranjo exploratório anterior, superado pelas premissas acima: a prévia integrada
`forgelex-v2-integrated-experience.html` passa a abrir na peça redigida. A variante
“Solicitação e andamento” demonstra os status genéricos. A integração MCP mantém
contexto autorizado e retorno para revisão, sem expor catálogo interno de tools.
Caso fictício; referências normativas e jurisprudenciais oficiais. A minuta
exemplifica a apresentação e mantém lacunas explícitas, sem prova de geração real.

A próxima prévia deverá começar pela necessidade e apresentar ações com diálogo
guiado por opções. O documento será resultado eventual da interação. A abertura
direta na petição demonstrativa não é o desenho aprovado da entrada do produto.
Referências técnicas complementares:
`docs/architecture/2026-10-10-agentic-platform-reference-research.md`.
