# Mesa guiada do ForgeLex · registro de execução

O [plano unificado](../superpowers/plans/2026-11-11-forgelex-plano-unificado.md) reúne as etapas vigentes. O [plano v2 arquivado](../historico/planos/2026-11-10-forgelex-mesa-guiada-v2.md) teve seu início autorizado por Boni em 10 de novembro de 2026. Fluxo limpo e visual moderno são critérios de aceite da Mesa.

## R0 · revisão de partida

- Branch local `codex/mesa-guiada` criada em worktree gerenciado e inicialmente limpo.
- Revisão de partida `5d854da2cdae9c7c867e202e71ab8f4551cba3f6`. `git ls-remote origin refs/heads/main` e `git rev-parse origin/main` retornaram esse mesmo SHA.
- A auditoria principal usou `8fcd1d0`. A comparação com a base de execução confirmou as alterações posteriores de limites de entrada, transporte e política comercial. A implementação usará os contratos dessa base de execução. Os valores históricos da auditoria não orientam cobrança.
- `pnpm install --frozen-lockfile` concluiu para 18 projetos com pnpm 11.19.0 e reaproveitou os 541 pacotes do cache. O lockfile permaneceu igual.
- Verificação focada de baseline com Vitest. 48 testes aprovados em três arquivos, cobrindo contrato agêntico, navegação e modelo de execução da interface.
- O schema de contexto é estrito. A extensão de orientação em R2/R3 exige leitores compatíveis antes de novos escritores e uma projeção pública que exclua os dados internos. O driver padrão usa v10, o schema v10 é o último da baseline e o leitor editorial ainda limita evidências até v8. O plano usa v11 como próximo número e mantém a leitura histórica em R7/R10.

## R1 · inventário técnico

O script `scripts/skills/inventory-catalog.mjs` verifica o hash da captura, confere o manifesto e os hashes de cada Markdown e conteúdo, cruza identidade, versão e categoria e gera o índice sem copiar o corpo das fichas para a saída.

| Evidência              | Resultado                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captura validada       | 2.077 registros. 303 de Forma e 1.774 de Matéria.                                                                                                                       |
| Cobertura              | 302 tipos distintos de Forma e 91 grupos de Matéria por área/subárea, incluindo grupos com subárea ausente.                                                             |
| Classificação pendente | 580 fichas de Matéria têm área, mas não têm subárea identificável pelos campos examinados. Foram conservadas e sinalizadas.                                             |
| Sobreposição exata     | Nenhum título duplicado na mesma categoria ou conteúdo com hash idêntico. O tipo `notificacao-extrajudicial` está associado a duas formas e exige desambiguação futura. |
| Avaliação              | As 2.077 fichas permanecem pendentes de avaliação para uso no runtime.                                                                                                  |
| Índice local           | `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2/catalog-inventory.json`, ignorado pelo Git.                                                                        |
| SHA-256 do índice      | `770eb0dc3eabc06349e481c396612bb7d037669fef1b07d00559ed617f06d9f7`                                                                                                      |
| Verificação            | Nove testes Node aprovados e Prettier aprovado nos dois arquivos novos.                                                                                                 |

O inventário técnico é independente da elegibilidade. A lista elegível inicial para execução está vazia. Os candidatos registrados no plano para a futura avaliação de Boni são `resposta-acusacao` v3 e, quando a questão do caso a justificar, `cadeia-custodia-cpp-158` v3. A incorporação depende da decisão sobre origem e reutilização prevista no plano. O inventário e os textos da captura permanecem locais.

Para reproduzir em um worktree com as dependências instaladas, a partir da raiz:

```powershell
node --test scripts/skills/inventory-catalog.test.mjs
node scripts/skills/inventory-catalog.mjs --archive "<caminho do ZIP aprovado>" --out "<caminho local novo>.json"
```

## R2 · contratos de orientação e hashes

- `DecisionValue` distingue valores informados, desconhecidos, propostos e confirmados. Uma decisão de origem documental exige evidência. A confirmação pertence ao usuário. O contrato existente de respostas continua recusando opção inválida, resposta vazia e revisão obsoleta.
- `GuidanceSnapshot` aceita contexto interno opcional e versionado. Contextos históricos continuam legíveis. O hash v1 usa campos em ordem fixa e ordena referências de evidência. A revisão e os IDs de perguntas não alteram a identidade das decisões. O hash da seleção de habilidades inclui revisão do contexto, versão do catálogo, entradas e seus vínculos.
- Os contratos de orientação e de seleção não aceitam campos de autorização ou comando. A entrada pública de execução recusa a orientação interna, inclusive se o snapshot/hash for válido. A projeção pública continua omitindo a orientação. A validação de comandos de orientação com owner e revisão pertence a R3. O contrato das chaves já aceitas pelo cliente permanece compatível.
- Validação local: build completo, verificação de tipos de domínio e API, ESLint e Prettier nos arquivos alterados e 79 testes focados em seis suites. Os testes de API e persistência usam banco em memória. Não houve execução de inferência real ou operação em produção.

## R3 · orientação persistida anterior à inferência

A API prepara a conversa, registra cada resposta e reabre a pergunta ativa usando os snapshots existentes. A revisão e os recibos ficam no JSON do contexto. A gravação usa o lock já existente e preserva as revisões anteriores. Nenhuma migration é necessária para esta etapa.

| Operação                                             | Contrato                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/agentic/guidance`                         | Inicia a orientação. Recebe `objective` e `matterId` opcionais e um `Idempotency-Key` UUID.                   |
| `GET /api/agentic/guidance/:conversationId`          | Recupera decisões públicas e pergunta ativa em leitura consistente.                                           |
| `POST /api/agentic/guidance/:conversationId/answer`  | Registra `LegalAnswer` para a pergunta ativa na revisão indicada.                                             |
| `POST /api/agentic/guidance/:conversationId/correct` | Corrige uma decisão ainda válida na revisão indicada. Invalida a peça dependente quando área ou tarefa mudam. |

- As rotas exigem sessão e `research:read`. Contexto vinculado a caso exige `matter:read` e caso ativo. A projeção pública omite hashes, recibos e conteúdos internos.
- A identidade do comando de início localiza a primeira revisão por UUID derivado no escopo do dono. Respostas e correções guardam o comando na revisão produzida. A repetição devolve essa revisão, inclusive após o avanço da conversa. Usar a mesma chave com outro pedido retorna conflito.
- A escolha “Não sei” fica registrada. As regras iniciais guiam área e tarefa e incluem peças de referência para Penal e Cível. A interpretação por IA e o consumo pelo compositor entram nas etapas seguintes.
- A execução que consome orientação precisa apontar para a revisão persistida, sem substituir esse contexto no pedido de início.
- A gravação é opt-in por `FORGELEX_DESK_GUIDANCE_ENABLED=true` junto ao workspace agêntico, fora do piloto fechado. O padrão preserva o rollout leitor antes do escritor.
- Validação local: build da API e dependências, tipos de API e domínio, lint e formatação dos arquivos alterados. 76 testes focados passaram em cinco suítes. Os novos casos cobrem concorrência de duas abas, acesso, chave UUID, opção inválida, retomada, replay histórico, invalidação de peça e recusa de revisão antiga. A preparação verificou ausência de execução, job, chamada e reserva de inferência. Os testes de persistência usam SQLite em memória.

## R4 · seleção única e navegação da Mesa

- A URL da Mesa concentra execução, conversa, revisão de contexto, caso, peça e versão. A navegação por Casos preserva a seleção completa. Links antigos de Rascunhos e Revisão continuam abrindo na Mesa.
- Abrir outra conversa desvincula a peça anterior do envio. O editor montado conserva a edição local para recuperar com Voltar. Quando um link indica uma versão diferente da carregada, o envio com a versão aberta exige confirmação explícita.
- O compositor envia a versão preparada pelo editor e mantém o vínculo da conversa nas continuações. Respostas de outro alvo são ignoradas. Se o usuário apenas abre outra área do app, o trabalho pode terminar e atualizar a seleção guardada da Mesa sem alterar a página ativa.
- A seleção transporta a referência da orientação persistida e limpa seu vínculo ao trocar o caso antes da execução. O formulário guiado e o consumo desse contexto pelo orquestrador seguem em R6 e R7.
- Validação local com 67 testes unitários de navegação, seleção e modelo de execução e 36 testes Playwright da Mesa, revisão editorial, workspace agêntico e autorização comercial simulada. Build web, lint dos arquivos TypeScript alterados e verificação de diff passaram.

## R5 · seleção interna de habilidades

- O catálogo interno valida metadados, papéis existentes e versão elegível por habilidade. A Forma combina área e peça confirmada. A Matéria combina área e tema de cada questão estruturada com referências a fontes presentes no contexto. Uma questão cível e outra penal podem selecionar referências diferentes no mesmo trabalho.
- Candidatos concorrentes para o mesmo alvo produzem uma limitação auditável, assim como falta de ficha elegível, ausência de fonte no escopo e orçamento insuficiente. O resolvedor registra a peça ou o tema, os IDs das questões e as fontes usadas em cada seleção.
- O vínculo verifica o orçamento em bytes UTF-8 por papel e no conjunto antes da leitura. Cada corpo selecionado é carregado uma vez. O snapshot fixa conteúdo, versão, SHA-256, papéis e questões. Uma falha de leitura ou de integridade invalida o vínculo inteiro. A projeção por papel confere novamente versão e hash e entrega apenas referências textuais.
- A validação usa fichas sintéticas. A elegibilidade do acervo real continua sujeita à avaliação de origem e reutilização prevista em R1. O grafo, as ferramentas e as projeções públicas mantêm seus contratos vigentes. A ligação do snapshot ao fluxo do orquestrador entra em R7 e a compatibilidade dos checkpoints em R10.
- Validação local com 385 testes em 29 suítes, incluindo 13 testes novos de catálogo, seleção e integridade. Build do pacote, verificação de tipos, lint e formatação passaram nos arquivos TypeScript da etapa.

## R6 · perguntas e resumo na Mesa

- “Me ajude a começar” abre a orientação dentro da conversa. A Mesa mostra uma pergunta por vez, com opções compactas, texto livre quando previsto e “Não sei”. O compositor continua disponível para pedido livre.
- O resumo reúne área, tarefa e peça em uma linha que se ajusta ao espaço. “Alterar” abre a decisão escolhida na própria conversa. Uma correção troca a revisão ativa e o servidor invalida decisões dependentes. Respostas anteriores ficam recolhidas.
- A pergunta e o resumo usam a superfície da conversa. As opções mantêm uma grade alinhada com duas colunas no celular. O compositor recebe o indicador de foco na borda arredondada. A peça permanece montada durante o fluxo.
- A Mesa habilita a orientação pela capacidade anunciada pela API no modo opt-in. A projeção inclui perguntas usadas nas correções e o histórico da revisão, com rótulos de resposta. As conversas anteriores mantêm as regras `mesa-v1`. Conversas novas usam `mesa-v2` e guardam respostas em texto.
- A conclusão sem peça ou documentos selecionados pode encaminhar o pedido com a conversa e a revisão persistidas. O envio guiado com contexto documental depende de R7. Nesta etapa, o compositor conserva o contexto documental para envio pelo pedido livre.
- Validação local com 41 testes Vitest, quatro cenários Playwright de orientação, 36 regressões de Mesa e revisão, builds de web e API e lint dos arquivos TypeScript alterados. O teste de interface verifica foco visível no compositor, pergunta sem moldura, acesso por teclado, análise Axe, resolução de conflito entre abas, descarte de resposta atrasada e preservação do texto da peça no celular. As capturas mostram o fluxo implementado.

### Correção da repetição do teste de histórico

O trace apresentado por Boni mostrou que o POST do teste devolvia uma execução criada três minutos antes. A chave fixa `history-sidebar` repetia o comando anterior. A lista das 20 conversas recentes já continha conversas posteriores, e o alvo esperado ficava fora dela. O cenário foi reproduzido em uma API local isolada, com uma execução antiga e 21 conversas posteriores.

O teste passou a criar chave UUID e título próprios para cada execução e a localizar esse título. O cenário completo passou duas vezes na mesma API com dados anteriores, incluindo abertura, exclusão, restauração e histórico no celular. A alteração ficou restrita à preparação e aos seletores do teste.

## R7 · interpretação no fluxo agêntico

- Com a orientação habilitada, uma nova execução guiada usa o protocolo v11. O pedido livre continua no v10; um checkpoint restaurado continua na versão em que foi gravado. O orquestrador recebe as decisões persistidas e as respostas vigentes em texto ou por opção.
- A Mesa reaproveita a descrição dada em resposta à pergunta sobre a tarefa e envia a orientação e a seleção documental na mesma solicitação. A API verifica a revisão da conversa antes de anexar o contexto público e conserva a orientação do servidor. Uma correção invalida a execução anterior e as respostas que dependiam dela, mantendo o histórico. A gravação da entrega valida a revisão sob o mesmo bloqueio de conversa usado pela correção.
- O plano separa hipóteses do modelo das escolhas do usuário e registra as fontes usadas. Uma hipótese que altere o trabalho usa o evento `QUESTION`. A resposta é vinculada ao pedido, à orientação e à seleção de fontes. Se faltar confirmação para redigir, a conversa recebe uma entrega limitada sem nova peça, mesmo que o plano seguinte omita a hipótese.
- A seleção de habilidades usa as questões do plano e os papéis ativos no grafo. O checkpoint fixa catálogo, versões e conteúdo e confere a integridade na retomada. Cada especialista recebe somente as referências atribuídas ao seu papel. O catálogo real continua sem fichas elegíveis; a integração foi exercitada com conteúdo sintético.
- R8 mantém a responsabilidade por edição delimitada e preservação dos vínculos documentais. A leitura editorial de checkpoints fica em R10. A autorização comercial, a reconciliação de chamadas pendentes e os limites de replanejamento continuam no fluxo existente.
- Validação local: build, tipos, lint, formatação e `git diff --check`; quatro cenários Playwright de orientação e 36 regressões de Mesa, revisão e autorização comercial simulada. A regressão usou portas isoladas porque as portas padrão estavam ocupadas. O ensaio `pnpm test:postgres:agentic-case-task` passou em PostgreSQL descartável, incluindo leitura dos protocolos históricos e gravação concorrente.
- A suíte Vitest com quatro workers teve 1.958 aprovações, 17 casos ignorados e um timeout no teste de reaprovação. Esse teste passou na reexecução focada. Nela, 112 testes passaram e o teste de recuperação de job após 50 legados excedeu o mesmo limite de 5 segundos; o caso passou na execução isolada. Não houve inferência real nem publicação.

## R8 · integridade documental e edição delimitada

- Em uma peça salva, a ação “Usar trecho na conversa” vincula o pedido a uma seção e a um intervalo de texto. A Mesa mostra a seleção junto ao envio. O escopo pertence ao pedido que o recebeu. Cada novo envio pode indicar seu próprio trecho.
- O protocolo v12 usa a seleção explícita ou entra pelo fluxo da Mesa guiada com peça salva. Em um pedido de edição sem seleção, a resposta orienta a escolher o trecho. Os checkpoints anteriores mantêm o protocolo em que foram gravados.
- O servidor confere a versão, os hashes, o intervalo e o texto original. Aplica as substituições em UTF-16 e grava uma única versão derivada, sob os bloqueios existentes. A revisão é somente leitura.
- A edição delimitada conserva ordem, títulos, vínculos e citações fora do trecho. Citações alteradas perdem a conferência herdada quando ainda identificáveis. O caminho histórico só transfere metadados entre seções com correspondência exata e única. A escrita é recusada quando a associação ficaria ambígua.
- A validação local incluiu build, tipos, lint e `git diff --check`. Passaram 371 testes Vitest em 19 arquivos e a rechecagem final dos oito testes do escritor. Os nove cenários Playwright da Mesa passaram, incluindo a gravação de uma edição selecionada com provedor simulado. O ensaio nativo em PostgreSQL descartável passou com recuperação dos protocolos anteriores, concorrência e replay. As mudanças ficaram locais.

## R9 · pesquisa e fontes na Mesa

- A Mesa abre “Pesquisa e fontes” sobre a conversa e a peça atual. “Fontes do caso” abre os julgados guardados no caso da peça. Os dois painéis mantêm a seleção da Mesa e o texto local.
- Abrir uma pesquisa salva usa a leitura da cópia conservada. Pesquisar novamente exige confirmação, usa os critérios registrados e cria uma nova operação. A cópia mantém os resultados e a data de origem.
- O vínculo guarda a autoridade retornada na cópia, com sua proveniência, no caso escolhido no diálogo. O caso da peça aparece identificado entre as opções. A seleção do destino é explícita.
- Os pontos de conferência distinguem identidade do julgado, fidelidade da citação e aplicabilidade. Resultados indisponíveis mantêm sua posição na cópia. Uma leitura recusada limpa a cópia em exibição, e um tribunal indisponível bloqueia a nova busca.
- A validação local teve 59 testes Vitest e 17 cenários Playwright de Mesa, pesquisas salvas e histórico de pesquisa. Passaram o build web, a verificação de tipos, o lint e a checagem do diff. A reexecução do cenário de indisponibilidade também passou. As mudanças ficaram locais.

## R10 · revisão, aprovação e histórico na Mesa

- A Mesa oferece a fila de pendências, incluindo memorandos, e abre a conferência da peça no contexto do caso e da versão. Links antigos de Rascunhos entram no editor. Links antigos de Revisão abrem a fila ou a conferência da versão indicada.
- A conferência usa a versão salva. A Mesa bloqueia a conferência do buffer editado até que ele seja salvo e exibe a versão antiga em modo de consulta. A aprovação da versão atual usa a conferência existente, confirma o alvo e registra a decisão na sessão do usuário. A API legada continua vinculando a decisão à versão do token.
- A revisão editorial reaproveita a proposta, as decisões por sugestão e a aplicação explícita. Uma decisão preserva o texto. Aplicar ajustes selecionados cria outra versão. Peças sem entrega vinculada oferecem revisão editorial quando a capacidade comercial existente está habilitada.
- O leitor aceita as projeções de evidência dos protocolos v1 a v12. Confere IDs únicos, hashes e a correspondência com a entrega persistida. O leitor de edição delimitada conserva os ordinais e o texto exato da versão derivada. A consulta ao histórico não solicita geração.
- Passaram 234 testes Vitest e 25 cenários Playwright. Os três cenários novos cobrem decisão editorial, aplicação, aprovação formal, histórico da versão anterior e fila de memorandos na Mesa. As regressões de conferência legada e edição na Mesa passaram em portas isoladas. Build, tipos, lint e checagem do diff passaram. As alterações ficaram locais.

## R11 · salvamento atômico e recuperável

- O guard de escrita do caso reúne a criação e a primeira versão em uma transação. A falha de validação da primeira versão reverte o rascunho. O contrato anterior continua disponível.
- O comando opcional vincula tenant, usuário, caso, alvo e conteúdo normalizado. A transação grava a versão e o recibo. A consulta autenticada recupera o resultado original, inclusive quando a peça já tem outra versão. A repetição do comando evita nova escrita e não repete a emissão de auditoria e webhook do primeiro salvamento.
- O editor consulta o recibo antes de reenviar e guarda apenas o identificador pendente na sessão. A recarga permite consultar o resultado. Uma edição feita depois do primeiro envio permanece no editor.
- A migração `persistence-0041-draft-save-commands` e o [procedimento de ativação](../operations/draft-save-recovery.md) estão preparados para autorização separada. Os ensaios usaram estruturas sintéticas em SQLite e PostgreSQL descartável, sem executar a migração nova.
- Passaram 42 testes Vitest, a rechecagem de purga do caso, o ensaio com duas conexões PostgreSQL e 22 cenários Playwright. Os cenários novos cobrem perda da resposta, recarga e reenvio com preservação do texto. Build, tipos, lint e checagem do diff passaram. As alterações ficaram locais.

## R12 · capacidades, contexto e controles financeiros

- O driver deriva as capacidades de pesquisa das ferramentas da composição real. O bootstrap comercial usa o índice STJ existente. A recuperação normativa foi exercitada por injeção de um provedor sintético, sem incorporar fonte normativa operacional.
- A interpretação guiada recebe as capacidades disponíveis. Um pedido que exige só recuperação normativa deixa uma limitação explícita se a ferramenta estiver ausente. O transporte comercial confere os nomes no registro de ferramentas do papel que faz a chamada.
- O fluxo guiado mede o contexto serializado e conserva o texto legal integral dentro dos limites. Excesso é recusado com motivo próprio. O conteúdo complementar que excede o orçamento é sinalizado antes de carregar o corpo. Os recortes históricos identificados como excertos permanecem compatíveis.
- Responder “Não sei” ou escolher uma opção registra a orientação sem inferência ou reserva. O envio comercial exige confirmação da política vigente. A recusa de contexto excedente no ensaio liberou a reserva sem cobrança ou consumo incerto.
- Passaram 568 testes Vitest e quatro cenários Playwright. A suíte cobre a disponibilidade de ferramentas, contexto excedente, seleção complementar, consentimento, entrega utilizável, liquidação, cancelamento e consumo incerto. Build, tipos, lint e checagem do diff passaram. As alterações ficaram locais.

## R13 · regressão integrada e exposição pública

- O cenário integrado reproduziu `GUIDANCE_DECISION_CONFLICT` ao revisar uma peça após a criação guiada. Um novo pedido livre na conversa agora envia `useGuidance: false`. O servidor valida a revisão esperada, inicia outro contexto e mantém a execução anterior acessível com as entregas originais.
- O envio permanece desabilitado enquanto o editor carrega o caso ou a peça selecionada. O teste mantém a resposta da API pendente, confere que o texto local permanece no editor e verifica o envio da versão salva assim que o contexto fica disponível.
- O teste usa uma habilidade sintética de Forma e confirma sua chegada ao redator. Inspeciona o DOM, as respostas de orientação, criação, consulta, entregas e o stream de eventos em busca do identificador, título, corpo e metadados internos da habilidade.
- As evidências locais usam a branch `codex/mesa-guiada`, com base `5d9e3fd` e as alterações locais de R7 a R13. O navegador usa API local, autenticação de teste e provedor sintético. Os ensaios PostgreSQL usam bancos descartáveis em loopback.
- Em 11/11/2026, passaram 2.006 testes Vitest em 268 arquivos, 61 cenários Playwright e 9 testes Node do inventário. Passaram build, tipos, lint e `git diff --check`. Os 17 testes Vitest condicionados a PostgreSQL por configuração ou à homologação real ficaram fora das aprovações. Os ensaios separados de PostgreSQL descartável passaram para a tarefa jurídica, a execução e a concorrência do salvamento manual com tabelas de teste.

| Critério | Evidência                                                                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01      | Inventário conferido diretamente no ZIP de referência. São 2.077 fichas, 303 de Forma e 1.774 de Matéria. Os testes verificam a origem e recusam divergências de hash, identidade e conteúdo.                                 |
| A02      | `guided-desk.spec.ts` verifica DOM, JSON público e SSE com a ficha sintética efetivamente usada.                                                                                                                              |
| A03–A05  | `guided-desk.spec.ts`, `desk-guidance.spec.ts`, `execution-routes.test.ts` e `case-task-driver.test.ts` cobrem envio sem pergunta redundante, perguntas materiais, desconhecimento, correção e histórico.                     |
| A06      | `skill-selection.test.ts` e `case-task.test.ts` verificam as regras de seleção, orçamento de conteúdo, versão fixada, escopo por papel e recusa de adulteração.                                                               |
| A07–A08  | A jornada integrada confere conversa, caso, peça, versão e alvo. `writing-desk.spec.ts` cobre troca de seleção. Os testes dos contratos e repositórios exercitam integridade, autorização e idempotência.                     |
| A09–A10  | A jornada integrada confere a versão após revisão e o texto após alteração delimitada. Os testes do repositório verificam vínculos, versão concorrente e replay.                                                              |
| A11–A12  | `guided-desk.spec.ts` e `desk-research.spec.ts` cobrem pesquisa conservada, proveniência e caso de destino. `desk-review.spec.ts` e `draft-review.spec.ts` verificam a conferência, decisão editorial e aprovação por versão. |
| A13      | `checkpoint-evidence.test.ts` exercita a leitura dos protocolos históricos. O ensaio PostgreSQL retoma v8 com o driver v10 e a jornada integrada passa pelo fluxo guiado e pela edição delimitada na mesma Mesa.              |
| A14–A15  | As suítes de orientação e execução comercial verificam consentimento, reserva e cancelamento. Os testes de pesquisa e do workflow verificam as ferramentas da composição e a limitação explícita quando falta capacidade.     |
| A16      | `guided-desk.spec.ts` exercita a jornada em desktop e viewport móvel, com teclas nos passos de orientação, envio e seleção de trecho. `desk-guidance.spec.ts` confere foco, acessibilidade e disposição dos controles.        |
| A17      | Piloto Penal e regressão Cível reservados ao R14.                                                                                                                                                                             |
| A18      | Esta seção registra código e validação local. Homologação de produção pendente.                                                                                                                                               |
| A19      | Aceite visual de Boni em desktop e celular: atendido em 17/11/2026.                                                                                                                                                           |

## R14 · piloto Penal e regressão Cível

O ensaio usa quatro casos sintéticos na mesma revisão de `codex/mesa-guiada`, com base `5d9e3fd`. A referência é a Mesa em pedido livre com a orientação desativada. Os outros dois modos usam as perguntas da Mesa, com o catálogo sintético habilitado apenas no terceiro modo. O ensaio aciona o navegador, a API, o worker e a persistência local com respostas determinísticas da fixture.

- A resposta à acusação com questão sobre o lacre vincula a Forma ao redator e a Matéria ao analista. A simples menção a cadeia de custódia no outro caso Penal conserva só a Forma. A contestação usa apenas a Forma Cível.
- A opção “Não sei” mantém a peça indefinida. A execução propõe a resposta à acusação como hipótese vinculada ao relato original. Quando a hipótese segue sem confirmação, a entrega registra a limitação e o caso fica sem rascunho.
- A entrega referencia o hash do relato original. Nas três peças confirmadas, o texto da fixture permanece idêntico na entrega, no editor e na versão salva. As projeções públicas e o DOM preservam a privacidade das referências internas.

| Modo                                   | Perguntas de orientação | Perguntas da execução | Chamadas simuladas | Rascunhos | Bytes dos pacotes | Bytes de fichas nos pacotes |
| -------------------------------------- | ----------------------: | --------------------: | -----------------: | --------: | ----------------: | --------------------------: |
| Referência com pedido livre            |                       0 |                     0 |                 17 |         3 |            17.998 |                           0 |
| Mesa guiada                            |                      12 |                     1 |                 17 |         3 |            55.993 |                           0 |
| Mesa guiada com habilidades sintéticas |                      12 |                     1 |                 17 |         3 |            56.598 |                         355 |

As contagens somam os quatro casos por modo. A pergunta de execução dos modos guiados é a confirmação da hipótese no caso indefinido. Os bytes são do JSON entregue ao provedor de teste. O ensaio mede o contrato e o volume de contexto, com zero chamadas a modelos reais.

Para reproduzir, executar `pnpm build` e rodar `pnpm exec playwright test -c playwright.desk-pilot.config.ts` com `FORGELEX_E2E_DESK_PILOT` definido sucessivamente como `baseline`, `guided` e `skills`. O teste imprime as contagens por caso e papel. A regressão Cível integrada usa `pnpm exec playwright test -c playwright.desk-guidance.config.ts` com a variável do piloto desabilitada.

Em 11/11/2026 passaram os 12 cenários da comparação, os 6 cenários de regressão da Mesa e 101 testes Vitest de orientação, seleção de habilidades, workflow e rotas. Lint, formatação dos arquivos de teste, sintaxe Node e checagem do diff passaram. Isso registra a verificação técnica local de A17. A avaliação jurídica e de experiência continua com Boni.

O inventário do ZIP verificou os candidatos capturados abaixo. A elegibilidade continua pendente de decisão de incorporação, condições de reutilização e avaliação de Boni. Os testes carregam fichas autorais sintéticas com identificadores próprios.

| Candidato do acervo       | Versão | SHA-256 do conteúdo                                                |
| ------------------------- | ------ | ------------------------------------------------------------------ |
| `resposta-acusacao`       | 3      | `3d39673b621dcf0409d0ca774f051e52aa56e403dd0477041e270945e7799fe5` |
| `cadeia-custodia-cpp-158` | 3      | `9ca8f7d87916e83f000c1fdae66850fdac4c02235991471ce467afe23676a3f9` |

## R15 · expansão por área e operação

O lote `penal-civel-r15-v1` usa os casos priorizados no R14. O comando de preparação verifica o ZIP das 2.077 fichas e gera uma fila local com versões, hashes, tamanho, proveniência e casos associados. A fila destina-se à avaliação de Boni e mantém os quatro candidatos pendentes.

| Área  | Categoria | Candidato                          | Cobertura do lote                                                                                          |
| ----- | --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Penal | Forma     | `resposta-acusacao` v3             | Resposta à acusação nos dois casos com peça confirmada                                                     |
| Penal | Matéria   | `cadeia-custodia-cpp-158` v3       | Questão sobre o lacre. A menção incidental fica fora da seleção                                            |
| Cível | Forma     | `contestacao-civel` v3             | Contestação confirmada                                                                                     |
| Cível | Matéria   | `adimplemento-pagamento-cc-304` v2 | Candidato para o relato de pagamento parcial. O inventário declara a área civil e registra subárea ausente |

```powershell
node scripts/skills/prepare-catalog-lot.mjs --archive "<ZIP capturado>" --out "<novo JSON local>"
```

O catálogo de teste `catalogo-piloto-sintetico-v2` acrescenta a referência de Matéria Cível. A seleção usa a questão estruturada e vinculada ao relato. O fluxo mantém as perguntas `mesa-v2` de área, tarefa e peça. O teste de retomada carrega um checkpoint da versão antiga com a versão nova do catálogo disponível e verifica que a execução histórica usa a ficha antiga. Uma execução nova usa a versão nova.

O ensaio de operação usa `pnpm exec playwright test -c playwright.desk-pilot.config.ts`, com `FORGELEX_E2E_DESK_PILOT` em `skills` e depois em `expanded`. Os logs locais registram versão, ferramentas, orçamento, volume de contexto e resultados por caso. A contagem de perguntas repetidas compara os enunciados dentro de cada jornada sem correções. O cenário de correção e saída antes do envio é induzido e medido separadamente. A avaliação de integridade confere o vínculo com a fonte, a correspondência do texto entre entrega e peça e o bloqueio da redação quando a hipótese fica indefinida.

| Catálogo sintético | Jornadas concluídas | Perguntas de orientação / repetidas | Perguntas da execução | Chamadas simuladas | Bytes dos pacotes / das fichas |
| ------------------ | ------------------: | ----------------------------------: | --------------------: | -----------------: | -----------------------------: |
| v1                 |                   4 |                              12 / 0 |                     1 |                 17 |                   56.598 / 355 |
| v2                 |                   4 |                              12 / 0 |                     1 |                 17 |                   57.373 / 458 |

As duas versões produziram três rascunhos e uma entrega limitada. A v2 levou 103 bytes adicionais de ficha ao analista Cível. A comparação por caso e papel confirmou as mesmas ferramentas e o mesmo limite de 1.000 bytes por papel e por execução na fixture. O cenário adicional registrou uma correção de área e uma saída antes do envio, com preservação da mensagem. As métricas correspondem à simulação local. A taxa de abandono em uso e a qualidade jurídica das entregas dependem da avaliação do lote em condições autorizadas por Boni.

Em 11/11/2026, passaram 9 cenários Playwright do lote, 6 regressões da Mesa, 79 testes Vitest e 11 testes Node do inventário e da fila. Passaram lint, formatação dos arquivos alterados no R15 e checagem do diff.

### Avaliação das quatro fichas capturadas

A conferência usa os quatro textos das versões indicadas na fila do R15, lidos diretamente do ZIP verificado. A revisão jurídica é amostral e prioriza os pontos que mudariam o resultado nos casos do piloto. A matriz registra a avaliação das fichas para o ForgeLex e deixa a decisão de incorporação com Boni.

| Ficha                              | Resultado da conferência amostral                                                                                                                                                                                                                                                                                                                                          | Ajuste antes de avaliar incorporação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resposta-acusacao` v3             | Os arts. 396 e 396-A e o precedente sobre intimação de testemunha sustentam o roteiro de defesa. A ficha inclui a quebra da cadeia de custódia entre nulidades absolutas, em conflito com a ficha de Matéria e com o exame casuístico do HC 653.515/RJ. A estrutura remete genericamente ao art. 397 após abranger também o Júri.                                          | Condicionar a tese sobre o vestígio à irregularidade, à confiabilidade e ao prejuízo concretos. Identificar o rito e a fase e distinguir o regime do art. 415 no Júri. [CPP, arts. 396-A, 397, 406 e 415](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) · [STJ, HC 653.515/RJ](https://www.stj.jus.br/websecstj/cgi/revista/REJ.cgi/ITA?dt=20220201&formato=HTML&nreg=202100831087&salvar=false&seq=2073941&tipo=0) · [STJ, REsp 2.098.923/PR](https://scon.stj.jus.br/jurisprudencia/externo/informativo/?livre=%40CNOT%3D020737)              |
| `cadeia-custodia-cpp-158` v3       | O núcleo sobre lacres e confiabilidade tem suporte no CPP e no HC 653.515/RJ. A síntese sobre coleta perde a preferência prevista no art. 158-C. A descrição do art. 158-F menciona descarte e omite a devolução e permanência na central após a perícia. O resumo final sobre prints apresenta como regra uma linha jurisprudencial que o corpo da ficha já qualifica.    | Distinguir abertura autorizada com registro e novo lacre de rompimento sem rastreabilidade. Completar o fluxo pós-perícia e limitar a tese sobre prints aos fatos e condições dos precedentes. [CPP, arts. 158-C a 158-F](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) · [STJ, HC 653.515/RJ](https://www.stj.jus.br/websecstj/cgi/revista/REJ.cgi/ITA?dt=20220201&formato=HTML&nreg=202100831087&salvar=false&seq=2073941&tipo=0) · [STJ, AREsp 3.126.435/MT](https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202503861559) |
| `contestacao-civel` v3             | A separação entre defesa direta e indireta é pertinente ao pagamento parcial. A abertura generaliza a preclusão das preliminares, apesar do conhecimento de ofício previsto no art. 337, § 5º. O resumo do art. 335, I, omite a última sessão, e a menção ao REsp 2.180.502/GO funde a hipótese literal do § 2º com o cenário de audiência redesignada e depois cancelada. | Tratar a ordem como roteiro editorial, explicitar as ressalvas legais e separar as hipóteses de prazo. Preservar a impugnação dos fatos e a prova do pagamento vinculado à cobrança. [CPC, arts. 335 a 343 e 373](https://legis.senado.leg.br/norma/584917/publicacao/34619046) · [STJ, REsp 2.180.502/GO](https://scon.stj.jus.br/jurisprudencia/externo/informativo/?acao=pesquisarumaedicao&from=feed&livre=0852.cod.)                                                                                                                                                                                               |
| `adimplemento-pagamento-cc-304` v2 | O art. 314 é pertinente à forma de pagamento. O quadro de quitação abrevia o art. 320 e omite a assinatura do credor ou representante e a regra do parágrafo único sobre prova pelas circunstâncias. O inventário indica área civil com subárea ausente. A ficha também cobre modalidades que excedem o relato de pagamento parcial.                                       | Delimitar o recorte a pagamento e quitação, registrar a subárea e distinguir parcela comprovada, imputação e saldo. Verificar documento, beneficiário e obrigação antes de atribuir efeito extintivo. [Código Civil, arts. 308, 314, 319, 320 e 352 a 355](https://legis.senado.leg.br/norma/552282/publicacao/34620807)                                                                                                                                                                                                                                                                                                |

Os modos `captured` e `captured-limited` do Playwright leem o arquivo apontado por `FORGELEX_E2E_SKILL_ARCHIVE`. O primeiro usa limites exclusivos da fixture de 9.000 bytes por papel e 17.000 por execução. O segundo usa o limite de 1.000 bytes do piloto sintético. As respostas do provedor são determinísticas. As assertivas conferem versão, hash, papel, ausência das referências privadas nas projeções e comportamento quando o orçamento fica abaixo do tamanho das fichas. O ensaio mede a integração e a revisão amostral mede a aderência do texto às fontes selecionadas.

| Caso sintético                 | Fichas recebidas no limite ampliado               | Bytes de conteúdo |
| ------------------------------ | ------------------------------------------------- | ----------------: |
| Penal, lacre rompido no relato | Forma Penal e Matéria de cadeia de custódia       |            15.839 |
| Penal, menção incidental       | Forma Penal                                       |             7.042 |
| Penal, peça indefinida         | Nenhuma. A confirmação pendente impediu a redação |                 0 |
| Cível, pagamento parcial       | Forma Cível e Matéria de pagamento                |            16.246 |

O ensaio com as fichas capturadas somou 96.677 bytes nos 17 pacotes entregues ao provedor simulado, dos quais 39.127 bytes eram conteúdo das fichas. O maior pacote individual teve 12.381 bytes. No controle de 1.000 bytes, os três pedidos com peça confirmada exibiram limitação de contexto e as referências ficaram fora dos pacotes. Os limites medidos pertencem à fixture. A incorporação e a qualidade de respostas produzidas por modelo continuam sem avaliação em uso.

### Reteste com as fichas revisadas

O catálogo de teste `forgelex-r15-revisao-local-v1` carrega quatro redações próprias com versões novas e vincula cada ficha ao hash e à versão de origem no ZIP verificado. A leitura e a seleção do lote ficam restritas à fixture do piloto.

| Ficha                                                                                            | Versão capturada → revisão ForgeLex | Correção incorporada ao recorte                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Resposta à acusação](../../tests/fixtures/desk-pilot-revised/resposta-acusacao.md)              | 3 → 4                               | Distingue rito, fase e fundamentos da absolvição sumária. O exame do lacre parte dos registros e do efeito sobre a prova no caso concreto.           |
| [Cadeia de custódia](../../tests/fixtures/desk-pilot-revised/cadeia-custodia-cpp-158.md)         | 3 → 4                               | Distingue abertura documentada e ruptura sem rastreabilidade. Completa a guarda pós-perícia e contextualiza os precedentes sobre prints.             |
| [Contestação cível](../../tests/fixtures/desk-pilot-revised/contestacao-civel.md)                | 3 → 4                               | Explicita as ressalvas das preliminares, separa os marcos de prazo e vincula o pagamento parcial à obrigação, ao comprovante e ao saldo.             |
| [Pagamento e quitação](../../tests/fixtures/desk-pilot-revised/adimplemento-pagamento-cc-304.md) | 2 → 3                               | Delimita a subárea de obrigações, adimplemento e quitação. Inclui a assinatura, o alcance da prova pelas circunstâncias e a imputação entre débitos. |

| Caso do piloto                 | Bytes de fichas capturadas | Bytes de fichas revisadas |
| ------------------------------ | -------------------------: | ------------------------: |
| Penal, lacre rompido no relato |                     15.839 |                     4.334 |
| Penal, menção incidental       |                      7.042 |                     2.150 |
| Penal, peça indefinida         |                          0 |                         0 |
| Cível, pagamento parcial       |                     16.246 |                     3.558 |
| Total                          |                     39.127 |                    10.042 |

O reteste usou os mesmos quatro casos e limites de 9.000 bytes por papel e 17.000 por execução. As duas versões acionaram 17 chamadas simuladas. As versões revisadas chegaram aos papéis esperados, com hashes próprios e sem exposição dos identificadores privados ou dos trechos marcadores na API e na interface. Os avisos de conferência do lacre e do pagamento são respostas da fixture, vinculadas aos respectivos relatos. A qualidade de geração com modelo e a incorporação permanecem pendentes.

Para repetir, apontar `FORGELEX_E2E_SKILL_ARCHIVE` ao ZIP verificado e rodar `pnpm exec playwright test -c playwright.desk-pilot.config.ts` com `FORGELEX_E2E_DESK_PILOT` em `captured` e em `revised`. A prévia desta rodada usa a Mesa dev em `127.0.0.1:3360`. O histórico **Conversas** contém os quatro casos concluídos.

### Ensaio com GPT‑6.1 Sol

Boni autorizou os quatro casos sintéticos e o teto total de US$ 5. A execução usou o workflow guiado e o transporte do ForgeLex em um executor local isolado. O manifesto registra o worktree, os relatos, as versões e os hashes das quatro fichas. O ensaio usou o corpus fechado, sem pesquisa externa ou alterações na Mesa dev.

A primeira passagem usou as instruções do workflow. Em cinco chamadas, os dois pedidos penais com peça definida falharam por `SKILL_ISSUE_REFERENCE_INVALID`, o pedido indefinido falhou por `ACTION_CONFLICT` após um esclarecimento e o cível pediu a petição inicial. Essa passagem terminou sem minuta e com US$ 0,065074 de consumo calculado.

A segunda passagem usou o mesmo modelo, corpus e versões, com uma instrução adicional apenas no orquestrador do ensaio. Ela esclareceu a correspondência entre as questões e suas classificações, os códigos de tópico e o tratamento de dados ausentes em minutas preliminares. O manifesto da segunda passagem contém a instrução e o orçamento descontado do consumo da primeira.

| Caso                           | Resultado na segunda passagem                           | Fichas entregues aos papéis                                           |
| ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------- |
| Penal, relato de lacre rompido | Minuta `LIMITED`                                        | Cadeia de custódia v4 ao analista e resposta à acusação v4 ao redator |
| Penal, menção incidental       | Minuta `LIMITED`                                        | Resposta à acusação v4 ao redator                                     |
| Penal, peça indefinida         | Pergunta pendente após a resposta “Não sei”, sem minuta | Nenhuma                                                               |
| Cível, pagamento parcial       | Minuta `LIMITED`                                        | Pagamento e quitação v3 ao analista e contestação cível v4 ao redator |

O registro local contabilizou 22 chamadas com uso informado pela API e custo calculado de US$ 0,396394, com zero chamadas de consumo incerto. Os diretórios ignorados `r15-real-v1` e `r15-real-clarified-v1` sob `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2` contêm os manifestos, o ledger, os JSON por caso e as três minutas em Markdown. As peças estão disponíveis para avaliação jurídica de Boni.

### Comparação A/B com autos sintéticos

O ensaio comparou os mesmos documentos sintéticos e sínteses conferidas em fontes oficiais com e sem as quatro fichas revisadas. Usou GPT‑6.1 Sol, orientação `mesa-v2`, ordem alternada dos braços e a mesma instrução em cada par. Os hashes dos insumos coincidiram dentro de cada par. As fontes entraram no corpus local como sínteses com URLs verificáveis, sem pesquisa externa durante as execuções.

| Caso                            | Resultado da comparação                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lacre rompido                   | Ambos reconstruíram V-03, L-101 e L-204, distinguiram a lacuna documental de adulteração e pediram avaliação contextual da prova. O braço com fichas acrescentou pedido expresso de esclarecimento pericial sobre a correspondência entre os materiais e oportunidade de manifestação da defesa. |
| Identificação do acusado        | Ambos distinguiram Sousa de Souza, preservaram P-710 e pediram retificação da capa com base nos documentos. A menção incidental ficou fora da seleção de Matéria e da tese defensiva.                                                                                                            |
| Comunicação com peça indefinida | Ambos solicitaram o teor do ato e ficaram sem minuta após “Não sei”. Nenhuma ficha chegou aos papéis.                                                                                                                                                                                            |
| Pagamento parcial               | Ambos vincularam os R$ 4.000 à F-77, apuraram R$ 8.000 de principal e limitaram o pedido ao abatimento documentado. O braço com fichas mencionou a certidão de audiência ao tratar do prazo e explicitou o inciso II do art. 373.                                                                |

A primeira passagem teve duas interrupções antes da entrega, ambas no braço sem fichas. No lacre, a saída atingiu o limite de tokens. No Cível, a conexão foi interrompida durante a leitura da resposta. Esses pares foram repetidos com a mesma instrução adicional de concisão nos dois braços. As seis minutas usadas na comparação ficaram `LIMITED`, com pendências de comprovação do suporte das citações, verificação processual e capacidade de pesquisa adicional.

O A/B registrou 60 chamadas, US$ 1,300486 de consumo calculado pelo uso informado e US$ 0,108048 reservados por uma chamada com consumo incerto. A exposição total acumulada com o ensaio anterior foi de US$ 1,804928, dentro dos US$ 5. Os resultados por braço, manifestos e minutas estão nos diretórios locais ignorados `r15-ab-real-v1` e `r15-ab-compact-v1`, sob `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2`.

Nesta amostra, os ganhos foram pontuais. A expansão do catálogo permanece em avaliação. Para aferir ganho consistente, é necessário testar mais casos por tema e conferir se o vínculo entre proposição e fonte passa pela verificação.

### Reteste A/B do vínculo entre afirmação e fonte

Nas novas execuções guiadas de criação, o redator registra a afirmação da minuta, o identificador da fonte jurídica e um trecho literal. O workflow confere se a afirmação está na minuta e se o trecho está na fonte. O verificador recebe o par e o trecho proposto, avalia o suporte e devolve sua classificação. A auditoria registra divergência quando o verificador substitui o trecho.

O GPT‑6.1 Sol processou os quatro casos com os mesmos insumos e instruções dentro de cada par. Nos dois braços, três casos produziram minuta e o caso indefinido ficou com pergunta pendente. Todas as 18 verificações de pares do redator tinham trechos localizados na fonte. O verificador classificou 7 de 10 como suficientes sem fichas e 6 de 8 com fichas. Os outros cinco tiveram suporte parcial. As seis minutas continuaram `LIMITED` por bloqueios que incluem suporte parcial, requisitos processuais pendentes ou pesquisa adicional indisponível.

O A/B foi iniciado com uma regra mais estrita de vínculo por seção. Na versão final, os pedidos podem reutilizar fontes já vinculadas a afirmações da fundamentação. A rechecagem dos registros identificou seis avisos que essa correção elimina, sem mudar o status das seis minutas. O contrato entre redator e verificador permaneceu igual durante o ensaio. O reteste fez 40 chamadas e registrou US$ 0,783586 de consumo calculado, sem nova chamada de consumo incerto. A exposição acumulada chegou a US$ 2,588514 dos US$ 5 autorizados. O diretório local ignorado `r15-ab-citations-v1` guarda as minutas e os dados da auditoria.

### Conferência processual com fontes oficiais

O ensaio usa consulta local a um recorte congelado de dispositivos obtidos da Câmara e do Senado e ao destaque oficial do HC 653.515/RJ no Informativo 720 do STJ. Os endereços, trechos, horários de captura e hashes dos downloads ficam em `r15-official-snapshots.json`, no diretório ignorado do ensaio. A consulta do precedente cobre apenas esse julgado. [CPP](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) · [CPC](https://legis.senado.leg.br/norma/584917/publicacao/34619046) · [Código Civil](https://legis.senado.leg.br/norma/552282/publicacao/34620807) · [STJ](https://processo.stj.jus.br/jurisprudencia/externo/informativo/?acao=pesquisar&aplicacao=informativo&livre=%40CNOT%3D%27018701%27)

| Caso              | O que a conferência confirma                                                                                                                                                                                  | O que ainda falta                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lacre             | O rito ordinário e a citação pessoal em 10/11/2026 permitem identificar a resposta escrita e o prazo legal dos arts. 396 e 396-A do CPP. O registro de troca do lacre delimita a diligência sob o art. 158-D. | Dados para aferir a tempestividade, rol e demais atos da defesa, esclarecimento da abertura e avaliação concreta da repercussão na prova.          |
| Identificação     | A denúncia, a identificação e a citação sustentam a grafia Souza, com o mesmo P-710 da capa. O pedido de retificação corresponde à divergência documentada.                                                   | Dados para aferir a tempestividade e elementos da defesa de mérito. Os autos sintéticos não demonstram prejuízo processual pela grafia divergente. |
| Peça indefinida   | O aviso e a resposta da secretaria confirmam apenas a disponibilização de um documento.                                                                                                                       | Teor do ato e registro de comunicação, necessários para identificar medida, fase e prazo.                                                          |
| Pagamento parcial | A audiência sem acordo em 9/11/2026 dá o marco do art. 335, I, do CPC para o rito informado. A regra geral é de 15 dias úteis. O recibo atribui R$ 4.000 ao principal e indica R$ 8.000 de saldo.             | Calendário e protocolo para aferir o prazo. Documentos e critérios de atualização para examinar acessórios.                                        |

O GPT‑6.1 Sol completou os quatro pares. Os hashes dos insumos coincidiram dentro de cada par. As seis minutas de peça confirmada ficaram `LIMITED`. Cada braço teve sete pares do redator com trecho localizado na fonte e suporte considerado suficiente, sem avaliação parcial nesse subconjunto. O workflow registrou 22 requisitos processuais pendentes e manteve achados de suporte insuficiente em outras proposições. O caso indefinido gerou em cada braço uma nota de insuficiência documental, sem selecionar medida.

Os dois braços do caso do lacre pesquisaram e confirmaram a identidade do HC no Informativo 720. As três peças confirmadas em cada braço recuperaram dispositivos oficiais. O reteste fez 98 chamadas e consumiu US$ 1,912236, calculados pelo uso informado, sem nova chamada de consumo incerto. A exposição acumulada, incluindo a reserva anterior, ficou em US$ 4,500750 do teto de US$ 5. As entregas e os registros da pesquisa estão em `r15-ab-official-v1`, no diretório local ignorado.

### Verificação de requisitos processuais por item

A revisão dos 22 itens do A/B encontrou 11 requisitos compostos, cinco instruções amplas de conferência, quatro registros sobre juntada e dois critérios normativos ligados à divergência de identificação. Rito, citação, audiência, grafia e abatimento têm suporte para verificações específicas. Protocolo, tempestividade e juntada continuam pendentes nos autos sintéticos. A revisão item a item consta em `r15-revisao-procedural.md`, no diretório local do ensaio.

Nas novas execuções guiadas, o assessor processual recebe instruções para formular requisitos independentes. O verificador recebe os requisitos identificados, com acesso às fontes do caso. O workflow registra o requisito como verificado quando há uma avaliação integral de suporte e os trechos literais das normas oficiais versionadas e dos documentos dos autos correspondem às fontes da execução. A entrega guarda esses trechos e seus hashes em `procedureAudit`. Avaliações parciais, conflitantes ou com trecho divergente mantêm a pendência. Os resultados da rodada anterior continuam como registro histórico.

### Homologação local da verificação processual

Em 11/11/2026, os três cenários passaram em Chromium, com a Mesa, a API e o workflow locais, documentos sintéticos e provedor simulado. O usuário seleciona os documentos no pedido guiado e o resultado exibe os requisitos verificados com os trechos da norma e dos autos.

| Cenário     | Resultado observado na Mesa                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completo    | Verificou o marco inicial e a tempestividade. Exibiu a regra, a ata, o calendário e o protocolo usados na conferência.                                |
| Parcial     | Verificou o marco inicial com a ata. Indicou a falta dos comprovantes de protocolo e de juntada nos pontos a conferir.                                |
| Divergência | Verificou o marco inicial. Manteve a tempestividade pendente e indicou a divergência entre o trecho enviado pelo verificador e o documento dos autos. |

A homologação encerra esta etapa da verificação processual. A expansão do catálogo fica suspensa. O teste pode ser reproduzido com `pnpm exec playwright test -c playwright.desk-procedure.config.ts` após a compilação das dependências locais.

## E2 · URL da Mesa sem `URLSearchParams.size`

Em 11/11/2026, sobre `main` em `df8c714`. `desk-location.ts` e `routes.ts` decidiam pela propriedade `size`, ausente em Safari e iOS anteriores ao 17 e no Chrome anterior ao 113; nesses navegadores a URL saía sem caso, peça e conversa, e os parâmetros de retorno eram descartados. Ambos passaram a decidir por `toString()`.

| Item                                | Resultado                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes novos                        | Três, removendo `size` de `URLSearchParams.prototype`: URL idêntica com e sem a propriedade, caminho limpo sem seleção e preservação dos parâmetros em `navigateToTab`. Falharam antes da correção. |
| Vitest da navegação                 | 63 aprovados de 63.                                                                                                                                                                                 |
| Tipos e Prettier                    | Sem erros. Prettier exige `--end-of-line auto` neste checkout Windows (CRLF).                                                                                                                       |
| `playwright.writing-desk.config.ts` | 37 aprovados de 37.                                                                                                                                                                                 |
| Outras APIs recentes                | Sem outro `URLSearchParams.size`. Restam `.at(-1)` e `Object.hasOwn` (Safari 15.4, Chrome 92 e 93), fora do escopo; o alvo do build é ES2022 sem polyfill.                                          |

Reversão: reverter o commit.

## E5 · área digitada no resumo da orientação

Em 11/11/2026, sobre `4018c92`. Quando o usuário escrevia a área ou a peça em vez de escolher uma opção, a resposta virava `unknown` e o resumo mostrava “Área a definir”. `guidance-service.ts` passou a projetar o texto livre mais recente de cada campo sem opção como `detail`, limitado a 120 caracteres; a tarefa fica de fora porque o texto dela já reaparece inteiro em `description`. O snapshot, o estado da decisão e o `guidanceHash` não mudam. O resumo exibe “Área: previdenciário, a confirmar”; sem texto digitado continua “Área a definir”.

| Item                                 | Resultado                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes novos                         | `guidance-service.test.ts` (projeção em área e tarefa, opção escolhida sem `detail`) e `guidance-model.test.ts` (texto do resumo). O primeiro falhou antes da correção. |
| Vitest                               | Serviço, modelo, regras e contrato da orientação: 12 aprovados de 12.                                                                                                   |
| Tipos, ESLint e Prettier             | Sem erros (Prettier com `--end-of-line auto` no checkout Windows).                                                                                                      |
| `playwright.desk-guidance.config.ts` | 6 aprovados de 6.                                                                                                                                                       |

Reversão: reverter o commit; o snapshot não muda.

## E7 · locale UTF-8 nos testes de interface

Em 11/11/2026. O fluxo `ci.yml` passou a definir `LANG=C.UTF-8` e `LC_ALL=C.UTF-8` para todos os jobs, e o `README.md` documenta a exigência para quem roda os E2E em Linux ou macOS. Sem locale UTF-8, o Chromium em Linux nomeia como `download` o arquivo de título acentuado e o teste de exportação Word falha. Verificação: configuração apenas; o efeito se confirma na primeira execução da CI. Reversão: reverter o commit.

## E4 · flags e migração da Mesa guiada no roteiro de deploy

Em 11/11/2026, sobre `3dcb72c`. O plano previa declarar `FORGELEX_DESK_GUIDANCE_ENABLED` e `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED` no `cloudbuild.yaml`. As duas são variáveis de execução da API no Cloud Run, enquanto o `cloudbuild.yaml` só carrega as flags de interface do build (`VITE_*`); além disso, o deploy preserva o ambiente do serviço e recusa diferenças além da imagem e de `FORGELEX_SOURCE_SHA`. Declará-las no build não teria efeito. A etapa foi cumprida assim: o passo 3 de `deploy-from-main.ps1` informa o valor efetivo de cada flag (ausente vale como desligada; só `true` liga) e o `ops/gcp/production/README.md` registra o padrão, a ordem obrigatória (backup, migração `0041`, conferência no registro de migrações, só então ligar o salvamento) e a reversão. Nenhuma flag foi alterada em produção ou homologação.

| Item                              | Resultado                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Testes novos                      | Quatro casos de `Get-ApiRuntimeFlagReport` em `deploy-from-main.tests.ps1`; falharam antes da função. |
| `deploy-from-main.tests.ps1`      | 36 aprovados de 36.                                                                                   |
| Sintaxe de `deploy-from-main.ps1` | Sem erros. Não executado contra o gcloud real; o `-DryRun` fica para a E1/M1.                         |
| Prettier do README                | Aprovado.                                                                                             |

Reversão: reverter o commit.

## E1 · estado publicado real e E3 · verificação periódica da chave

Em 11/11/2026, sobre `9b37287`. Leitura somente leitura do Cloud Run, do Cloud Monitoring e do Cloud Scheduler no projeto `project-bbbe1209-c295-4720-867`, com `gcloud run services describe`, `gcloud run revisions list`, `gcloud monitoring uptime list-configs`, `gcloud alpha monitoring policies list` e `gcloud scheduler jobs list`. O `-DryRun` completo de `deploy-from-main.ps1` não foi executado.

| Item                  | Resultado                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 · SHA em produção  | `8fcd1d0` (PR #134) nos dois serviços; `PENDENCIAS.md` dizia `5757733`. A API recebe 100% em `forgelex-api-prod-secretlatest-202611092347`. Os PRs #135 a #137 estão integrados e não publicados.                    |
| E1 · flags da API     | `DESK_GUIDANCE` e `DRAFT_SAVE_COMMANDS` ausentes (desligadas). Estão ligadas `AGENTIC_WORKSPACE`, `COMMERCIAL_EXECUTION`, `SAVED_RESEARCH`, `BILLING`, `ANALISE` e outras; o padrão `false` do plano era o do build. |
| E1 · documentação     | `PENDENCIAS.md` ganhou a seção do estado publicado atual, e as quatro linhas “ainda não publicado” (PRs #130, #132 e #133) foram reescritas.                                                                         |
| E3 · defeito apontado | Não procede: existe Uptime Check em `https://nexojuris.ia.br/readyz` a cada 300 s e a política de alerta da chave está ativa. O que faltava era a documentação; o Uptime Check não está provisionado por script.     |
| E3 · pendente         | Ensaio com chave inválida em homologação (log e e-mail do alerta), não executado.                                                                                                                                    |

Reversão: reverter o commit; nada foi alterado no Cloud Run.

### Complemento da E1 (insumos de U0, U1, V5A, D0 e M1)

Em 11/11/2026, também somente leitura (Cloud Run, Cloud Build, Cloud Logging, Cloud SQL e balanceador por `gcloud`; DNS, RDAP do Registro.br e TLS por consulta pública; Supabase pela lista de projetos e tabelas). O detalhe item a item está em `PENDENCIAS.md`, na seção “Inventário histórico de 11/11/2026”. Plano lido: `claude/plano-unificado` no commit `713774e`.

| Item              | Resultado                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web em produção   | `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` e `VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true` (build `2e3691f7`): `integrated` é verdadeiro e está no ar a Mesa integrada (`WritingDeskScreen`). Build web de homologação não lido.                                                           |
| Piloto fechado    | `FORGELEX_CLOSED_PILOT_ENABLED=false` em produção e no encerramento; ausente na homologação; `_MODEL`, `_TENANT_ID` e `_USER_ID` inexistentes.                                                                                                                                               |
| Flags de servidor | Produção: `AGENTIC_WORKSPACE`, `COMMERCIAL_EXECUTION`, `EDITORIAL_COMMERCIAL` e `ANALISE` ligadas; `DESK_GUIDANCE` e `DRAFT_SAVE_COMMANDS` ausentes. Homologação: nenhuma das seis definida.                                                                                                 |
| Banco             | Produção, `forgelex-api-hml` e encerramento compartilham o segredo `forgelex-hml-database-url` e a instância `forgelex-hml-pg`. Só a `forgelex-api-hml-isolated` tem banco próprio, parado. Homologação não é isolada da produção.                                                           |
| Migração `0041`   | Ausente do código publicado (`8fcd1d0`) e `AUTO_MIGRATE=false`: não aplicada pelo deploy. Registro de migrações do banco não lido (credencial).                                                                                                                                              |
| MCP e preço       | `toolCount=21` no `mcp.call`; lista nominal não lida (401 sem token). Pesquisa R$ 0,20; reserva comercial **R$ 5,00** em produção (R$ 11,50 só em `main`, PR #135); limite diário de R$ 20,00.                                                                                               |
| Clientes MCP      | Claude 108 chamadas (11 `tools/call`), ChatGPT 12 (5), Codex 8 (0), Gemini 0, de 09/11 16:20 a 11/11 22:55 UTC.                                                                                                                                                                              |
| Domínio           | Canônico `nexojuris.ia.br` (Registro.br, expira em 17/09/2027, certificado Google até 20/12/2026); Mercado Pago notifica `https://nexojuris.ia.br/api/v2/webhooks/mercadopago` também na homologação; `ratione.nexojuris.ia.br` responde 200; `hml.nexojuris.ia.br` não respondeu `/readyz`. |
| Não lido          | Registro de migrações do Cloud SQL, Site URL e Redirect URLs do Supabase Auth, painel do Mercado Pago, CAA, regras de host do balanceador, build web de homologação.                                                                                                                         |

## E6 · higiene documental

Em 11/11/2026, sobre `ceb85f8`, por decisão de Boni (DEC-9). Os 53 planos de `docs/superpowers/plans/` foram movidos com `git mv` para `docs/historico/planos/`, preservando o histórico dos arquivos. Não separei “concluídos” de “em aberto”: muitas listas nunca foram marcadas e o estado não se lê pelas caixas; o plano unificado declara todos os anteriores como histórico, e o estado atual fica em `PENDENCIAS.md`. A pasta `docs/superpowers/plans/` deixou de existir; `specs/` e `references/` continuam onde estavam.

| Item                        | Resultado                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referências reescritas      | `superpowers/plans/` virou `historico/planos/` em 26 arquivos Markdown e no `.prettierignore`. Nos planos movidos, os links para `../specs/` e `../references/` apontam agora para `../../superpowers/`. |
| Não reescritos de propósito | `docs/architecture/evidence/2026-11-03-v9-review-remediation/changed-files.json` e `.superpowers/sdd/.../progress.md`, por serem evidência e registro do que existia na época.                           |
| Verificação                 | Varredura dos links relativos de todo `.md` versionado que envolvem os planos: 0 quebrados. Nenhuma referência a `superpowers/plans` fora dos dois arquivos acima.                                       |
| Referência vigente          | Link para o plano unificado incluído na abertura deste registro na reconciliação de 12/11.                                                                                                                |

Reversão: reverter o commit.

## M2 (parcial) · migração 0041 no banco HML isolado

Em 11/11/2026, sobre `9e4d81b`, por decisão de Boni (“aplicar só em isolado”, via Cloud Run Job). A 0041 (`persistence-0041-draft-save-commands`) foi aplicada **somente** em `forgelex-hml-isolated-pg`. O banco compartilhado `forgelex-hml-pg` (produção, `forgelex-api-hml` e encerramento) não foi tocado, nenhuma flag foi alterada e nenhuma revisão de serviço foi criada.

| Passo       | Resultado                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagem      | Cloud Build `ddb1df78-a465-4b5f-a9d0-817da5396e9e` (SUCCESS), `forgelex-hml-isolated/forgelex-api:mig0041-9e4d81b`, digest `sha256:1a949f332726ae425ff93339d5b27ab61fde0d8e3a23e9405660978c02f285a4`. Construída de `main` mais os commits da Frente E, com a Supabase HML como alvo do build web. Mantida no repositório HML isolado. |
| Instância   | Ligada com `--activation-policy=ALWAYS` (a operação levou cerca de 12 min) e parada de novo ao fim: `STOPPED`/`NEVER`.                                                                                                                                                                                                                 |
| Backup      | Sob demanda, `1794441092040`, `SUCCESSFUL`, antes da migração. O banco não tem backup automático.                                                                                                                                                                                                                                      |
| Job         | `forgelex-hml-isolated-migrate-0041` (mesma conta de serviço, VPC `forgelex-hml-vpc`, sub-rede `forgelex-hml-sa-east1` e segredo `forgelex-hml-isolated-database-url`), execução `forgelex-hml-isolated-migrate-0041-qw4ht`, concluída sem erro. Aplicou apenas `draftSaveCommandsMigration`, em transação, e foi apagado depois.      |
| Verificação | Antes: 30 migrações registradas, última `persistence-0023-account-closure`; `matters` e `draft_versions` presentes; `draft_save_commands` ausente. Depois: 0041 registrada, tabela criada e índices `draft_save_commands_pkey`, `draft_save_commands_matter_idx` e `draft_save_commands_version_idx`.                                  |

**Achado.** O banco isolado parou na `persistence-0023`: as migrações `0024` a `0040` não estavam aplicadas e a 0041 entrou fora de ordem. Elas foram aplicadas em seguida (parágrafo abaixo).

**Não verificado.** A 0041 não foi exercitada pela API (criação, leitura do recibo, repetição do comando): o serviço `forgelex-api-hml-isolated` não foi atualizado e roda a imagem anterior. O procedimento de recuperação (`draft-save-recovery.md`, passo 5) fica para o ensaio da M2.

**Migrações pendentes (mesmo dia, depois da pergunta sobre o achado).** Por decisão de Boni, as 18 migrações de persistência pendentes foram aplicadas no mesmo banco isolado, pelo mesmo caminho (Cloud Run Job `forgelex-hml-isolated-migrate-pending`, execução `…-454l7`, 1 tarefa bem-sucedida, Job apagado depois, mesma imagem `mig0041-9e4d81b`). Novo backup sob demanda antes: `1794442309699`, `SUCCESSFUL`. Aplicadas, em ordem do código: `0024-research-judgment-year`, `0025-draft-review-runs`, `0026-case-ai-access`, `0027-draft-ai-receipts`, `0028-matter-lifecycle`, `0029-jurisprudence-search-metadata-index`, `0030-saved-research`, `0031-case-document-analysis`, `0031-agentic-workspace`, `0032-agentic-execution-control`, `0033-legislation-versions`, `0034-agentic-task-deliveries`, `0035-agentic-tenant-guards`, `0036-agentic-admission-deadline`, `0037-native-evidence-review`, `0038-editorial-human-review`, `0039-conversation-history` e `0040-desk-editorial`. Registradas: 31 antes (incluída a 0041) e 49 depois; nenhuma migração de persistência pendente, `assertMigrationsApplied` aprovado e a 0041 continua registrada. Instância parada de novo (`STOPPED`/`NEVER`). As migrações de ledger e de análise não foram tocadas; se faltar alguma delas, a API acusa no `/readyz` e isso não foi checado. O serviço isolado continua na imagem anterior, sem subir contra o esquema novo.

Reversão: restaurar o backup `1794441092040`, ou remover a tabela e o registro da 0041 por decisão separada, com backup (a tabela está vazia).

## U0 · inventário da Mesa (proposta para aprovação de Boni)

Em 11/11/2026, sobre `248bd2c` (Frente E, PR #138), na branch `claude/frente-u-inventario-mesa`. Só leitura: nada foi apagado nem alterado no código. A classificação abaixo é uma **proposta**; a lista só vale depois da aprovação de Boni (aceite da U0).

**Fatos de base.**

- Produção roda `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` e `VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true` (E1): `integrated` é verdadeiro e o cliente vê a Mesa integrada. O padrão sem a variável é **desligado** (`isCaseWorkspaceEnabled` só aceita `true` exato).
- Em `App.tsx`, `integrated = AGENTIC && CASE`. Com `integrated`, `WritingDeskScreen` (337 linhas) envolve `AgenticWorkspaceScreen` (858), `DraftStudioScreen` (1.156) e `DashboardScreen` (54), e abre `ResearchDeskScreen` (150) em modo `compact`. Sem `integrated`, `App.tsx` monta `AgenticWorkspaceScreen` e `DraftStudioScreen` sozinhas.
- Rotas: `/app/trabalho` (`work`), `/app/rascunhos` (`draft_studio`) e `/app/revisao` (`dashboard`) já mostram a aba `work` quando `integrated`; `/app/casos` (`matter`) abre `MatterWorkspaceScreen` (904 linhas), que só `App.tsx` importa.
- O piloto fechado vive em `ClosedPilotPanel` (191 linhas, importado só por `AgenticWorkspaceScreen`), `apps/api/src/agentic-workspace/closed-pilot*.ts`, `task6-homologation.ts` e `scripts/verify-closed-pilot-local.mjs`; está desligado em todos os serviços (E1).

**Classificação proposta.**

| Item                                                            | Onde                                                                                                                           | Proposta                                       | Evidência de uso                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Mesa integrada                                                  | `WritingDeskScreen.tsx`                                                                                                        | mantém                                         | Única Mesa em produção; só `App.tsx` a importa.                                                                                       |
| Núcleo da conversa (composer, perguntas, resultado, orientação) | `AgenticWorkspaceScreen.tsx` e `agentic-workspace/*`                                                                           | mantém                                         | Importado por `WritingDeskScreen`; é o motor da Mesa.                                                                                 |
| Ramo `!integrated` de `AgenticWorkspaceScreen`                  | `showRail`, prop `onEditor` e abertura do editor externo (linhas 349 e 410)                                                    | remove (U1)                                    | Só roda quando `AGENTIC` está ligado e `CASE` desligado; produção não usa.                                                            |
| Ramo `!integrated` de `App.tsx`                                 | linha 74 (`DraftStudioScreen` avulsa) e o ternário da linha 75                                                                 | remove (U1)                                    | Mesmo critério; `/app/rascunhos` e `/app/revisao` passam a redirecionar.                                                              |
| Editor de peças                                                 | `DraftStudioScreen.tsx`                                                                                                        | migra para a Mesa nova (U2)                    | Hoje embutido por `WritingDeskScreen` (`integrated`); o uso avulso sai.                                                               |
| Fila de revisão                                                 | `DashboardScreen.tsx`                                                                                                          | migra (U2)                                     | Embutida por `WritingDeskScreen`; a rota `/app/revisao` redireciona.                                                                  |
| Jurisprudência                                                  | `ResearchDeskScreen.tsx`                                                                                                       | mantém                                         | Rota própria e uso `compact` na Mesa. Recebe a busca ancorada (M4).                                                                   |
| Tela “Casos”                                                    | `MatterWorkspaceScreen.tsx` e rota `/app/casos`                                                                                | migra para a Mesa e depois remove (U7, DEC-14) | Só `App.tsx` a importa; sai depois de a Mesa absorver criar, renomear, arquivar, restaurar e excluir caso e documento e importar PDF. |
| Piloto fechado                                                  | `ClosedPilotPanel.tsx`, `closed-pilot*.ts`, `task6-homologation.ts`                                                            | mantém, isolado fora do `DeskShell` (DEC-11)   | Desligado em produção e homologação; serve a testes. Reavaliar no fim da Frente U.                                                    |
| Arquivos sem uso                                                | `screens/connections/ConnectionChecklist.tsx`, `PlatformConnectionCard.tsx`                                                    | remove (U1)                                    | `knip` 6.45.0 aponta ambos como sem uso; nenhuma outra referência no repositório (só eles mesmos).                                    |
| Exportações e tipos sem uso                                     | 4 exportações (`PRODUCT_TITLE`, `SectionHeader`, `CANONICAL_ORIGIN`, `responseExamples`) e 9 tipos exportados em `apps/web`    | remove o `export` (U1, baixo risco)            | Relatório do `knip` do workspace `apps/web`.                                                                                          |
| Texto “Gerar proposta de teste”                                 | `EditorialReviewPanel.tsx:393`                                                                                                 | mantém por ora; reavaliar (U1)                 | Aparece só quando o modo de geração não é `REAL` nem `COMMERCIAL`; em produção o modo é comercial. Decidir junto com o piloto.        |
| Texto “exemplos sintéticos”                                     | `ClosedPilotPanel.tsx`                                                                                                         | mantém (isolado)                               | Só no piloto fechado.                                                                                                                 |
| Placeholders e exemplos de documentação                         | `AuthScreen` (`voce@exemplo.com`), `ApiDocsPage`/`ApiDocsScreen` (exemplos de pesquisa), `LandingScreen` (“Exemplos de temas”) | mantém; o texto do site muda em V5A            | Não são dados de demonstração.                                                                                                        |

**O que o relatório do `knip` não decide.** Rodado na raiz, ele lista 50 arquivos sem uso, quase todos entradas por linha de comando (`scripts/*.mjs`, `scripts/forgelex-final-evaluation/*`, `playwright.desk-*.config.ts`, `apps/api/src/operations/retention-main.ts`) que o `knip` não reconhece por falta de configuração. Não os classifiquei como remoção; só os dois arquivos de `connections/` foram conferidos um a um.

**Dependência que a U1 precisa tratar.** As suítes `playwright.agentic-workspace.config.ts` e `playwright.agentic-commercial-flow.config.ts` sobem com `AGENTIC=true` e `CASE` desligado, ou seja, exercitam justamente o ramo `!integrated` que a U1 remove. Elas precisam migrar para `integrated` (ou para a Mesa nova) no mesmo commit da remoção. Já `playwright.writing-desk`, `desk-research` e `desk-review` usam as duas flags ligadas. As suítes com `CASE=false` e sem `AGENTIC` (`agentic-flags`, `mcp-site`, `public`, `saved-research`, `chunk-recovery`) testam o site sem a Mesa e não dependem do ramo removido. Os specs que citam `/app/rascunhos` ou `/app/revisao` são `agentic-flags`, `agentic-workspace`, `case-ai-access`, `desk-review`, `matter-lifecycle`, `research-history`, `site-mcp-scope` e `writing-desk`.

**Decisões de Boni (11/11/2026).** (1) A classificação da tabela acima está **aprovada**; a U0 fica aceita. (2) **Confirmado:** o modo “sem casos” (`CASE` desligado) continua só como configuração do site sem Mesa, e não como segunda Mesa. (3) “Gerar proposta de teste”: Boni preferia retirar e deixou a avaliação comigo. Avaliação: o rótulo aparece quando o servidor devolve o modo `SIMULATED` (provedor `fake`, sem provedor real autorizado), nunca em produção, onde `EDITORIAL_COMMERCIAL` ligado devolve `COMMERCIAL`; em um ambiente com a flag desligada o cliente veria um texto de teste. Nenhum teste de interface clica nesse botão (busca por “Gerar proposta” só encontra o código). **Sai na U1**: o botão deixa de aparecer no modo `SIMULATED`; os modos `REAL` e `COMMERCIAL`, a rota do servidor e os testes do gerador simulado ficam, porque a API e os testes de pacote ainda usam o provedor `fake`. (4) **Limite diário de R$ 20,00 mantido** (a reserva de R$ 11,50 não muda). Consequência registrada: depois de R$ 8,50 gastos no dia, uma nova execução comercial é recusada pelo limite, e o mensal segue em R$ 100,00; a Conta e a confirmação de custo precisam mostrar o limite diário restante para o motivo da recusa ficar claro.

## M1 · preparação (somente leitura; nada publicado)

Em 11/11/2026. O deploy depende de a PR #138 entrar em `main`: `deploy-from-main.ps1` exige checkout limpo no SHA de `origin/main`, então o `-DryRun` não foi executado aqui. Pontos de atenção levantados para a publicação:

| Item               | Situação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Política comercial | `main` define `commercial-brl-2026-11-10-v2`: reserva R$ 11,50 (antes R$ 5,00) e `maxInferenceMicroUsd` de 600.000 (antes 250.000). O limite diário continua R$ 20,00 e o mensal R$ 100,00. Com a reserva de R$ 11,50, uma segunda execução no mesmo dia é recusada depois de R$ 8,50 gastos. DEC-5 autorizou manter R$ 11,50 e subir até R$ 20,00 com nova política versionada; em 11/11/2026 Boni decidiu **manter o limite diário em R$ 20,00** (ver decisão 4 da U0), sem mudança de código. |
| Efeito visível     | A Conta e a confirmação de custo leem o preço do serviço (`CommercialPanel`); a mensagem de saldo insuficiente existe. A conferência com uma execução comercial de teste fica para depois do deploy.                                                                                                                                                                                                                                                                                             |
| Flags              | Publicar com `DESK_GUIDANCE` e `DRAFT_SAVE_COMMANDS` ausentes (desligadas). O deploy agora informa o valor efetivo (E4).                                                                                                                                                                                                                                                                                                                                                                         |
| Migração           | O código de `main` traz a `0041` e `AUTO_MIGRATE=false`. O esquema do banco compartilhado, usado por produção, não foi lido; se `main` trouxer migração que ele não tem, a API acusa no `/readyz`. A conferência exige ler o registro de migrações do banco, o que não foi feito.                                                                                                                                                                                                                |
| `mcp.call`         | A conferência do #132 e do piso de 5 decisões depende de tráfego real depois do deploy. Hoje: 5 `tools/call` sem chave de idempotência do Claude e 3 do ChatGPT.                                                                                                                                                                                                                                                                                                                                 |

## U1 · remover duplicidade e código morto

Em 12/11/2026, sobre `63f6a71` (Frente U, branch `claude/frente-u-inventario-mesa`, empilhada na PR #138). Aprovada a classificação da U0, a Mesa integrada passou a ser o único caminho. Produção já rodava `VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED=true` e `VITE_FORGELEX_CASE_WORKSPACE_ENABLED=true` (E1), então nada muda para o cliente de hoje.

**Regra nova.** A Mesa só existe com a Mesa agêntica e os casos ligados (`DESK_ENABLED`, `isDeskEnabled` em `site-capabilities.ts`). Sem as duas, `/app/trabalho` volta para a Visão geral e `/app/rascunhos` e `/app/revisao` voltam para Conectar IA. Com as duas, Rascunhos e Revisão continuam abrindo a Mesa por URL.

| Commit                                     | Conteúdo                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `7ceac5c`                                  | `resolveVisibleTab`, `App.tsx`, cabeçalho e menu lateral só com a Mesa integrada; a tela Casos perde o botão de Revisão avulsa. `App.tsx` deixa de montar `AgenticWorkspaceScreen`, `DraftStudioScreen` e `DashboardScreen` avulsas. |
| `d620201`                                  | `AgenticWorkspaceScreen` perde a prop `integrated`, a coluna lateral própria e o ouvinte de `popstate` do modo avulso. A prop `onEditor` fica: a Mesa a usa para abrir a peça (a U0 a listou por engano como parte do ramo avulso).  |
| `f512c5d`                                  | `DraftStudioScreen` perde a prop `integrated` e a interface do editor avulso (283 linhas a menos no arquivo). Saem estados, funções e importações sem uso e o `ReceivedDraftPanel` (180 linhas), que só o modo avulso usava.         |
| `daef999`, `a6860dd`, `b906e0c`, `ec112eb` | As configurações Playwright base (`playwright.config.ts`, `case-flow`, `documents`, `research`) passam a ligar a Mesa agêntica junto dos casos, e os specs são migrados ou removidos.                                                |

**Testes migrados para a Mesa.** `draft-review`: aprovar e exportar, ESC no painel de fonte, referência do acervo, fatos atualizados ao abrir a peça e vínculo salvo, usando o diálogo “Conferência da peça” e o painel “Precisa de atenção”. `case-flow`: o ciclo completo, com a peça aberta em `/app/trabalho`. `matter-lifecycle`: caso arquivado em outra aba mantém o texto e bloqueia o salvamento. `research-history`: perde só o trecho final do painel de tese. `agentic-flags`: passa a validar que, com os casos ocultos, não há Mesa.

**Testes removidos por serem exclusivos do editor avulso (9).**

| Spec              | Teste                                                                                                                                                                                          | O que o editor avulso tinha e a Mesa não tem                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case-ai-access`  | novo rascunho abre pelo recibo; receber texto preserva edição e exige adoção consciente                                                                                                        | Painel “Textos recebidos da IA”, prévia e adoção de recibo.                                                                                                       |
| `document-reader` | fonte citada abre a versão fixada e destaca âncora                                                                                                                                             | Editor de citações (“Adicionar citação”, “Fontes documentais da versão salva”).                                                                                   |
| `draft-review`    | corrigir fonte preserva edição e mantém histórico; resposta antiga do histórico; falha ao salvar não confere; composição inicial protege o texto; resposta demorada não apaga o texto digitado | Edição por várias seções, “Salvar e conferir”, “Salvar nova versão” e histórico de conferências por versão. Na Mesa o campo fica desabilitado durante a consulta. |
| `documents`       | DOCX exporta a versão salva e não inclui edição não salva                                                                                                                                      | Exportação da versão salva; a Mesa exporta o texto aberto, incluindo a edição local.                                                                              |

**Backlog para as etapas U2 a U5.** O que o editor avulso fazia e a Mesa ainda não faz, e que o histórico do Git preserva (commits anteriores a `f512c5d`): edição por várias seções com título; painéis de tese e de citação; adoção consciente de texto recebido da IA, com prévia; histórico de conferências por versão; salvar-e-conferir em um passo; exportação da versão salva sem a edição local. Nenhum deles existe em produção hoje; reativar qualquer um é decisão de produto de Boni.

**Verificação.**

| Item                      | Resultado                                                                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos, ESLint, Prettier   | `pnpm typecheck` e `pnpm lint` sem erros; Prettier aprovado com `--end-of-line auto`.                                                                                                                                                                                                                                 |
| Vitest                    | Suíte completa: 272 arquivos e 2.023 testes aprovados, 17 ignorados (dependem de PostgreSQL), sem falhas.                                                                                                                                                                                                             |
| Playwright, passando      | `writing-desk` 37, `desk-guidance` 6, `desk-review` 3, `desk-research` 2, `editorial-review` 3, `agentic-workspace` 25, `case-flow` 16, `case-ai` 7, `document-reader` 3, `documents` 4, `matter-lifecycle` 5, `research` 10, `saved-research` 5, `mcp-site` 32, `public` 17, `chunk-recovery` 3 e `agentic-flags` 1. |
| Playwright, intermitente  | `agentic-commercial-flow`: “incorpora somente seleção revisada…” falha às vezes (a Mesa não abre a peça e mostra “O serviço está indisponível”). Falhou 1 de 3 vezes também com os fontes de `248bd2c`, antes da U1: não é regressão da U1.                                                                           |
| Playwright, não executado | `playwright.config.ts` (phase7): precisa de PostgreSQL em `127.0.0.1:55432`, indisponível aqui. Foi alterado para ligar a Mesa agêntica; a primeira execução na CI confirma.                                                                                                                                          |

Reversão: reverter os commits da U1, em ordem inversa; o código removido do editor avulso volta pelo Git.

## U2 · nova estrutura da Mesa (parcial)

Em 12/11/2026, sobre `89ab9cc` (Frente U, branch `claude/frente-u-inventario-mesa`). A flag `VITE_FORGELEX_DESK_SHELL` nasce **desligada**, em `site-capabilities.ts` (`DESK_SHELL_ENABLED`, só `true` exato liga), no `vite-env.d.ts` e no `Dockerfile` (`ARG` com padrão `false`). Ela não entrou em `cloudbuild.yaml` nem nas substituições obrigatórias de `deploy-lib.ps1`: o deploy reaproveita as substituições do último build, e exigir uma nova quebraria a leitura de builds antigos. Ligar a casca em produção exige decisão e ajuste de operação próprios (M1/V6).

**O que a Mesa atual já tinha.** `WritingDeskScreen` já organizava as três áreas pedidas: conversas recolhíveis à esquerda, conversa no centro com o compositor no rodapé e peça à direita sob demanda, com a alternância Conversa/Peça abaixo de `lg`. Por isso a U2 virou, na prática, organização do código, a flag e o estado vazio.

| Item da U2                            | Situação                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Componentes sob `apps/web/src/desk/`  | **Parcial.** `DeskShell`, `DeskToolbar`, `DeskMobileTabs`, `DeskSourcesDialog` e `DeskQueueDialog` saíram da `WritingDeskScreen` (335 para 248 linhas), sem mudar comportamento. **Não** dividi o corpo de `AgenticWorkspaceScreen` (cerca de 790 linhas) nem o de `DraftStudioScreen` (873): cada um é um único componente com estado entrelaçado, e dividi-los sem alterar comportamento pede um desenho próprio. |
| Casca única `DeskShell`               | Feita como componente de layout. A coluna esquerda guarda só as conversas; a lista de casos entra na U7 (DEC-14). Painel de fontes à direita fica para V3 (abas Texto, Fontes e Revisão); hoje as fontes abrem em diálogo, como antes.                                                                                                                                                                              |
| Estado vazio com atalhos              | Feito atrás da flag: “Nova peça”, “Revisar um texto” (preenche o pedido, sem enviar) e “Pesquisar jurisprudência” (abre a pesquisa). Nenhum atalho lista o catálogo de habilidades (DEC-10).                                                                                                                                                                                                                        |
| Preservar o buffer da peça (A07, A09) | Sem mudança de código nesses caminhos; coberto pelas suítes da Mesa, que passam com a flag desligada e ligada.                                                                                                                                                                                                                                                                                                      |

**Arquivos.** `apps/web/src/desk/` (`DeskShell`, `DeskToolbar`, `DeskDialogs`, `DeskShortcuts`), `WritingDeskScreen.tsx`, `AgenticWorkspaceScreen.tsx` (prop opcional `emptyState`), `site-capabilities.ts`, `Dockerfile`, `playwright.desk-shell.config.ts`, `tests/e2e/desk-shell.spec.ts`, `apps/web/src/desk/desk-shortcuts.test.ts` e `tests/dockerfile.test.ts`.

**Verificação.**

| Item                                     | Resultado                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Vitest do web e do Dockerfile            | 44 arquivos e 240 testes aprovados. Tipos, ESLint e Prettier sem erros.                                                             |
| Refatoração sem mudança de comportamento | Com a flag desligada, antes dos atalhos: `writing-desk` 37, `desk-guidance` 6, `desk-review` 3 e `desk-research` 2 aprovados.       |
| Flag desligada, com o spec novo          | `writing-desk` 38 aprovados (inclui a verificação de que o estado vazio não tem atalhos) e `desk-guidance` 6.                       |
| Flag ligada                              | `playwright.desk-shell.config.ts`: 30 aprovados (atalhos, `writing-desk` e `agentic-workspace`).                                    |
| Capturas                                 | Estado vazio no desktop e no celular em `test-results/desk-shell/` (arquivos locais, fora do Git). Sem rolagem horizontal a 390 px. |

**Pendente da U2.** Dividir `AgenticWorkspaceScreen` e `DraftStudioScreen` em componentes menores; lista de casos na coluna esquerda (U7); painel de fontes à direita (V3).

Reversão: manter a flag desligada, ou reverter os commits da U2.

## M3.0 · mapa de correspondência do catálogo (parcial)

Em 12/11/2026, sobre `7ddca59` (branch `claude/frente-u-inventario-mesa`; a M3 é da Frente M, mas foi feita aqui porque destrava a U3). DEC-4: as 2.077 fichas (303 Forma, 1.774 Matéria) são mantidas e incorporadas. O ZIP em Downloads confere com o SHA-256 da captura (`2a0efbbc…`). Inventário R1 regenerado em `.superpowers/sdd/2026-11-12-m3-catalog/` (ignorado pelo Git); o mapa gerado (`catalog-map.json`) fica ali também, porque traz títulos e gatilhos de terceiros, e o que entra no repositório é só o script, os testes e este relatório.

**Script.** `scripts/skills/map-catalog.mjs --inventory <JSON do R1> --out <JSON local>` gera, por ficha, a chave exata do resolvedor. Matéria: a área declarada na própria ficha e o `stableId` como tópico. Forma: uma ou mais áreas e o `stableId` como tipo de peça. A área da Forma vem de (1) regras por palavra do `stableId`, (2) 16 sobrescritas explícitas, cada uma com motivo (ex.: agravo de petição é trabalhista), e (3) votos por citações normativas (CPC, CC, súmulas) que a Forma compartilha com as Matérias de cada área. Regra e votos concordando dão confiança alta; só a regra, média; discordância, só votos ou peça processual genérica vão para a fila.

**Resultado sobre as 2.077 fichas.**

| Item                        | Resultado                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichas com resultado        | 2.077 de 2.077 (1.994 mapeadas, 83 na fila). Nenhuma sem resultado e nenhuma chave duplicada.                                                                                                                                                                                                                                            |
| Matéria                     | 1.774 mapeadas, 25 áreas. As 580 sem subárea não importam: o tópico é o `stableId`.                                                                                                                                                                                                                                                      |
| Forma mapeadas              | 220: 132 com regra e votos concordando (alta) e 88 só pela regra (média). 66 fichas servem a mais de uma área.                                                                                                                                                                                                                           |
| Forma na fila               | 83: 47 peças processuais genéricas sem área clara (agravo, embargos, execução…), 26 em que a regra e os votos discordam, 6 sem nenhuma evidência (`codigo-conduta-etica`, `correicao-parcial`, `excecao-pre-executividade`, `mediacao-extrajudicial-defensoria`, `politica-corporativa`, `restituicao-administrativa`) e 4 só por votos. |
| `notificacao-extrajudicial` | Deixou de gerar `FORM_CONFLICT`: o tipo de peça é o `stableId`, e o `documentType` de origem comum fica registrado como `sourceDocumentType`.                                                                                                                                                                                            |

A qualidade da atribuição de área da Forma é heurística: nenhuma ficha foi lida uma a uma, e a fila é o ponto em que só Boni é chamado (DEC-4). As 83 vão em lotes por área na M3.2.

**Contrato e resolvedor.** As entradas FORM do catálogo passam a declarar `areas` (lista, ao menos uma, sem repetição); MATTER mantém `area` e `topic`. O resolvedor seleciona a Forma quando a área consultada está na lista e o tipo de peça coincide; duas Formas com o mesmo tipo e área em comum continuam em `FORM_CONFLICT`. As fixtures de teste e do piloto foram atualizadas.

**Matéria: candidatos e classificação.** `matterCandidates` (em `packages/legal-agents/src/skills/skill-candidates.ts`) pré-filtra pela área e pelos `triggers` e devolve até oito candidatos em ordem estável; `pickMatterTopic` só aceita a escolha de quem classifica se ela estiver entre eles, e o resolvedor segue exigindo igualdade exata. Verificação contra o catálogo real (teste opcional com `FORGELEX_CATALOG_INVENTORY`): em 1.774 consultas, a própria ficha apareceu entre os oito candidatos em todas e em primeiro lugar em 1.745.

**Orçamento de contexto.** Medido nas fichas reais: Forma com mediana de 7,6 KB, p90 de 11 KB e máximo de 15,6 KB (2 acima de 15 KB); Matéria com mediana de 7,4 KB, p90 de 12,2 KB, p99 de 15,9 KB e máximo de 27 KB (28 acima de 15 KB). O limite do trabalho inteiro é `CASE_TASK_POLICY.maxBytes` = 192.000 bytes. **Proposta, a decidir por Boni:** 64 KB por papel (uma Forma e quatro Matérias típicas) e 96 KB no total (metade do limite). A seleção deixou de zerar quando estoura: a Forma entra primeiro, depois a Matéria com mais fontes selecionadas, o que não cabe é omitido e registrado em `SKILL_BUDGET_PARTIAL` com os ids omitidos; só quando nada cabe a seleção fica vazia (`SKILL_BUDGET_EXCEEDED`). Os valores continuam parâmetros do servidor, ainda sem catálogo em produção.

**Não feito e por quê.** O vocabulário de 25 áreas na Mesa (`desk-guidance`, `guidance-rules.ts`, hoje seis áreas e a tabela de peças fixa em código) fica para a U3: é lá que o cliente chega à área por grande área e por texto livre, e a tabela de peças será substituída pelas Formas do mapa. A guiada continua desligada em produção, então nada se perde. A M3.1 (incorporação, estado de revisão e versão do catálogo por execução), a M3.2 (cruzamento em massa) e a M3.3 (Lote 0) seguem pendentes.

**Verificação.**

| Item                    | Resultado                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest                  | 274 arquivos e 2.035 testes aprovados, 18 ignorados (17 de PostgreSQL e o do catálogo real, que exige o inventário).                                                    |
| Testes novos            | `map-catalog.test.mjs` (8, com `node --test`), áreas em lista e seleção parcial (4 e 1 em `skill-selection.test.ts`) e `skill-candidates.test.ts` (5, mais 1 opcional). |
| Playwright              | `desk-pilot` 4 aprovados (depois de ajustar a fixture) e `agentic-workspace` 25 aprovados.                                                                              |
| Tipos, ESLint, Prettier | Sem erros.                                                                                                                                                              |

Reversão: reverter os commits da M3.0; o catálogo ainda não está em produção.

## M3.1, M3.2 e M3.3 · incorporação, cruzamento e Lote 0 (parciais)

Em 12/11/2026, sobre `03d0d17` (branch `claude/frente-u-inventario-mesa`), em um lote só a pedido de Boni. DEC-4: as 2.077 fichas são incorporadas; o cruzamento em massa substitui a leitura ficha a ficha e só os alertas chegam a Boni. Nada do catálogo foi publicado: o diretório montado fica na pasta local ignorada pelo Git, e a produção continua sem catálogo (`FORGELEX_SKILL_CATALOG_DIR` não está definida em nenhum serviço).

### M3.1 · incorporação

| Item                    | Decisão e resultado                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde fica o conteúdo    | Em um **diretório privado do servidor**, fora dos assets públicos e do bundle do navegador: `catalog.json` (manifesto) e `content/<id>@<versão>.md`. Como o conteúdo é de terceiros e pesa 23 MB, ele não entra no repositório; entra no ambiente de execução por um passo de publicação (a decidir: camada da imagem da API ou Cloud Storage privado). O repositório guarda só o código e o relatório.                                        |
| Como o servidor carrega | `loadFileSkillCatalog` (`apps/api/src/skills/file-skill-catalog.ts`) valida o manifesto, confere na subida que toda ficha elegível tem o arquivo com o tamanho declarado e lê cada versão limitada ao tamanho declarado; o hash é conferido pelo vínculo (`bindDeskSkills`). Sobre o catálogo real (2.081 entradas) a subida leva cerca de 1,1 s. `FORGELEX_SKILL_CATALOG_DIR` liga o catálogo no runtime comercial; sem ela, nada é aplicado. |
| Versão por execução     | O vínculo já registra a versão do catálogo, e cada ficha por versão e hash. As versões convivem lado a lado, então uma execução em andamento continua lendo a versão e o hash que fixou depois de o catálogo ganhar uma versão nova.                                                                                                                                                                                                           |
| Proveniência por ficha  | Origem (`MinutaIA`), versão e hash originais, decisão (`DEC-4`) e data, mais `adjustedFrom` quando a versão é uma redação ajustada. Descreve só o que existe; não cria condição de reutilização.                                                                                                                                                                                                                                               |
| Estados de revisão      | Pendente, em revisão, ajustada, elegível, inelegível e adiada (`REVIEW_STATES`). Só `eligible` chega ao resolvedor; a ficha elegível não pode ter alerta.                                                                                                                                                                                                                                                                                      |
| Orçamento               | Padrão de 64 KB por papel e 96 KB no total (metade do limite de 192 KB do trabalho), trocável por `FORGELEX_SKILL_BUDGET_ROLE_BYTES` e `FORGELEX_SKILL_BUDGET_TOTAL_BYTES`. Valores propostos, a confirmar por Boni.                                                                                                                                                                                                                           |
| Mantidos                | As fixtures `tests/fixtures/desk-pilot-revised/*` e as fichas sintéticas dos testes de regressão continuam.                                                                                                                                                                                                                                                                                                                                    |

**Montagem.** `scripts/skills/build-catalog.mjs` junta o ZIP verificado, o mapa (M3.0), o cruzamento (M3.2) e o Lote 0. Um `stableId` com acento (`federalismo-fiscal-repartição-receitas`) ganhou identificador seguro (`catalogId`, sem acento e com sufixo de hash).

| Resultado da montagem (`catalogo-incorporado-2026-11-12`)        |                          Entradas |
| ---------------------------------------------------------------- | --------------------------------: |
| Fichas do ZIP                                                    |                             2.077 |
| Elegíveis (mapeadas e cruzadas sem alerta)                       | 1.802 (200 Forma e 1.602 Matéria) |
| Ajustadas (as quatro originais do Lote 0)                        |                                 4 |
| Elegíveis do Lote 0 (redações ajustadas, versão original mais 1) |                                 4 |
| Pendentes                                                        |                               271 |
| Total de entradas no manifesto                                   |                             2.081 |

As 271 pendentes são: 82 na fila do mapa (área ambígua), 80 com alerta no cruzamento e 109 sem referência verificável a artigo de código. A fila fica no catálogo e nunca é selecionada.

### M3.2 · cruzamento em massa

`scripts/skills/crosscheck-catalog.mjs` extrai de cada ficha as referências a artigos de CPC, CPP, CC, CP, CF, CLT, CTN e CDC e confere, no texto compilado do Planalto, que o artigo existe e não está revogado. Os oito textos foram baixados com `fetch_oficial.py` (CPP, CP, CLT, CC, CF, CTN e CDC compilados; o CPC é a página anotada, em que vale o texto não tachado). Foram conferidas **14.906 referências a artigos** em 2.077 fichas.

| Resultado                                             |                          Fichas |
| ----------------------------------------------------- | ------------------------------: |
| Cruzadas sem alerta (existência e vigência)           |                           1.877 |
| Com alerta                                            | 83 (7 de Forma e 76 de Matéria) |
| Sem referência verificável a artigo (nada a conferir) |                             117 |

Alertas por tipo: 79 artigos revogados do CC (sobretudo os arts. 757 a 802, do seguro, revogados pela Lei 15.040/2024), 14 do CP, 5 do CPP, 4 da CLT e 1 do CTN; 39 artigos inexistentes (23 no CPC, entre eles o art. 529-A em 12 fichas e o 475-J, da versão antiga; 6 no CC, entre eles o art. 853-A em 5 fichas; 5 no CP, 4 na CLT e 1 no CPP). Os alertas são o que chega a Boni, por área, na fila.

**O que o cruzamento não faz, e por quê.** Ficha cruzada não é ficha revisada: ela passou nas conferências listadas e em nenhuma outra.

| Não conferido                                                                                      | Motivo                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existência de súmulas e precedentes no índice do STJ do ForgeLex (16.289 referências)              | Exige consultar o índice autenticado por referência; não há acesso em lote fora do conector.                                                                  |
| Leis esparsas (por exemplo, Lei 8.429, 9.099, 11.343)                                              | Os oito códigos acima foram baixados; as demais leis não.                                                                                                     |
| Contradição de teor entre Forma e Matéria (como a `resposta-acusacao` contra a cadeia de custódia) | Exige leitura semântica; não é verificável por dado.                                                                                                          |
| Tese exagerada ou generalizada                                                                     | O próprio plano já registra que o cruzamento não a detecta; o risco fica coberto só pela fila das fichas mais selecionadas em casos reais, quando houver uso. |

Por isso a elegibilidade das 1.802 vale como “cruzada em norma”, não como aprovação jurídica de conteúdo. Ligar o catálogo em produção continua decisão de Boni (variável de ambiente e publicação).

### M3.3 · Lote 0 e repetição do piloto

As quatro redações revisadas (`resposta-acusacao`, `cadeia-custodia-cpp-158`, `contestacao-civel` e `adimplemento-pagamento-cc-304`, de `tests/fixtures/desk-pilot-revised`) entram como versões novas elegíveis, ligadas por `adjustedFrom` à original, que passa a ajustada. O piloto da Mesa ganhou o modo `incorporated`, que lê o catálogo do diretório pelo mesmo carregador do servidor.

| Modo do piloto                                 | Resultado                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `incorporated` (catálogo real, 2.081 entradas) | 4 cenários aprovados: a Forma Penal e a Matéria de custódia no caso do lacre, só a Forma no caso incidental, nenhuma ficha na peça indefinida e Forma e Matéria Cíveis na contestação, com versão, hash e ausência de vazamento conferidos |
| `skills`, `expanded` e `revised`               | 4, 5 e 4 cenários aprovados (sem regressão)                                                                                                                                                                                                |

**Ressalva do piloto.** A Mesa ainda usa o vocabulário antigo de áreas (`penal`, `civel`), e o catálogo real usa as 25 áreas das fichas (por exemplo, `processo-penal` e `civil`). Para repetir o piloto, o diretório de teste foi montado com `--area-alias "processo-penal=penal,civil=civel"`, que acrescenta a área antiga só às quatro redações do Lote 0 (o diretório real, sem alias, fica intacto). Esse alias some quando o vocabulário de 25 áreas entrar na Mesa (U3). A avaliação jurídica das quatro redações e a aprovação do Lote 0 continuam com Boni.

### Verificação

| Item         | Resultado                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes novos | `skill-manifest.test.ts` (5), `file-skill-catalog.test.ts` (5), `crosscheck-catalog.test.mjs` (6) e `build-catalog.test.mjs` (5), mais um teste em `map-catalog.test.mjs`. `node --test scripts/skills`: 31 aprovados. |
| Vitest       | 276 arquivos e 2.045 testes aprovados, 18 ignorados (17 de PostgreSQL e o do catálogo real, que exige o inventário). Tipos, ESLint e Prettier sem erros.                                                               |
| Playwright   | `desk-pilot` nos quatro modos, como na tabela acima.                                                                                                                                                                   |

**Pendente.** A fila de 271 fichas e o veredicto de Boni sobre ela; a verificação de súmulas e precedentes no índice do STJ; a publicação do conteúdo no servidor e a decisão de ligar o catálogo; o vocabulário de 25 áreas na Mesa (U3); e a R15 (expansão por área), que reabre só por nova decisão de Boni.

Reversão: reverter os commits e apagar o diretório local; nenhuma flag foi ligada.

## M3.4 — Tratamento das fichas pendentes (12/11/2026)

O catálogo continua desligado: nenhum serviço recebe `FORGELEX_SKILL_CATALOG_DIR` até Boni decidir as fichas. Orçamento mantido em 64 KB por papel e 96 KB no total.

### Alertas e fichas sem referência

| Situação                   | Antes | Depois | Como                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fichas com alerta          | 80    | **6**  | A ficha que diz "revogado", "regime anterior" ou nomeia a lei revogadora conhece o estado do artigo: a citação é histórica (50 fichas). Treze fichas têm suplemento curado com fonte (`crosscheck-supplements.json`: CPC 529-A, CLT 392-D e Lei 8.213, arts. 73-B a 73-H, inseridos por leis de 2026 que o texto compilado ainda não incorpora; CPP 398 por transcrição do art. 394, § 4º; Lei 7.716, art. 2-A, atribuído por engano ao Código Penal). |
| Sem referência verificável | 126   | **83** | Dezesseis leis esparsas oficiais entraram no cruzamento (Leis 6.385, 6.404, 8.112, 8.213, 8.429, 9.099, 9.605, 9.784, 11.101, 11.343, 12.016, 12.529, 12.846, 13.303, 13.709 e 14.133). Cruzadas sem alerta: 1.988 de 2.077.                                                                                                                                                                                                                           |

Os 6 alertas restantes são conteúdo desatualizado de verdade e exigem decisão de Boni: `execucao-fazer-nao-fazer` e `tutela-especifica-cpc-497` (CC 757, revogado pela Lei 15.040/2024), `curatela-tda-epd-cc-1767` (CC 1773), `insolvencia-civil-cpc-1052` (CPC 786-A inexistente), `professor-clt-317` (CLT 324, fim de intervalo) e `prova-testemunhal-cpc-442` (CC 227).

As 83 sem referência verificável ficaram classificadas por motivo: 72 citam normas ainda não carregadas (leis de 2024 a 2026, decretos, resoluções), 6 citam só precedentes e 5 não citam nada verificável (`oficio`, `replica`, `lgpd-transferencia-internacional`, `navegacao-interior-antaq-resolucoes-136-141`, `pnct-conformidade-tributaria-ibs-cbs`). Seguem pendentes; carregar mais leis reduz o grupo dos 72.

### Forma transversal ("coringa")

Nova marca `transversal` na Forma (catálogo, manifesto, resolvedor e montagem). A Forma transversal não declara áreas e serve ao tipo de peça em qualquer área:

- a Forma da área vence a transversal, e nunca entram as duas;
- com a peça confirmada e a área ainda indefinida, a transversal serve, pois a moldura não depende da área;
- duas transversais para o mesmo tipo de peça são conflito, sem escolha por ordem;
- sem Forma da área nem transversal, os limites anteriores continuam (`FORM_UNAVAILABLE`, `FORM_SCOPE_UNRESOLVED`).

O motivo registrado traz `transversal: true`, para a auditoria distinguir as duas origens.

### As 82 fichas ambíguas

`scripts/skills/map-proposals.json` traz uma proposta para cada uma, com a natureza e as citações de lei que a sustentam. **Nada foi aplicado.** A decisão de Boni entra por `map-catalog.mjs --decisions` (áreas ou transversal, motivo, autor e data) e só então a ficha sai da fila.

| Natureza      | Fichas | O que é                                                                                                                                                                                                             | Proposta                                                                          |
| ------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Moldura       |     21 | Ato ou peça que existe em qualquer área e instância (ofício, réplica, procuração, notificação, apelação, decisão, edital, sustentação oral…).                                                                       | Transversal.                                                                      |
| Rito do CPC   |     29 | Texto assentado no CPC (agravo de instrumento, cumprimento de sentença, execuções, tutelas, IRDR…).                                                                                                                 | Processo civil, com a civil ou outra área quando a ficha cita o direito material. |
| Peculiaridade |     26 | A regra por nome e os votos das Matérias apontam áreas diferentes porque a peça pertence a mais de uma (ACP, defesa em PAF, reclamação ao CNJ) ou a área é a do tema (recurso em sentido estrito é processo penal). | Áreas explícitas, uma ou mais.                                                    |
| Sem evidência |      6 | Nome e citações não indicam área (código de conduta, política corporativa, exceção de pré-executividade, mediação, restituição administrativa, correição parcial).                                                  | Área pelo conteúdo; correição parcial transversal.                                |

Portanto, as 82 são em maioria peculiaridade da peça, não erro: só 26 têm divergência real entre regra e votos.

### Orçamento

Tamanhos reais das fichas (bytes): Forma mediana 7.750, p90 11.220, máxima 15.972; Matéria mediana 7.622, p90 12.518, máxima 27.639. Em 64 KB cabem 8 Matérias medianas, 5 do p90 ou 4 do p99. Uma Forma do p99 mais cinco Matérias do p90 somam 76 KB, abaixo dos 96 KB. Casos com mais questões caem na seleção parcial (`SKILL_BUDGET_PARTIAL`), que mantém a Forma e as Matérias de mais fontes. **Recomendação: manter 64 KB e 96 KB.** Subir o teto aumenta o contexto por tarefa (cerca de 16 mil tokens por papel) sem ganho para o caso típico.

### Montagem e verificação

Catálogo reconstruído com o cruzamento novo: 2.081 entradas, 1.908 elegíveis, 165 pendentes, 4 ajustadas e 4 redações do Lote 0 elegíveis (antes, 271 pendentes). `desk-pilot` em `incorporated`: 4 aprovados. Vitest do pacote `legal-agents` e do carregador da API: 95 aprovados. `node --test scripts/skills`: 39 aprovados. Novos testes: `skill-transversal.test.ts` (8), cruzamento (4) e decisão no mapa (3).

**Pendente.** Decisão de Boni sobre as 82 propostas e sobre os 6 alertas; carregar mais leis para as 72 fichas com norma não carregada; verificar súmulas e precedentes no índice do STJ; ligar o catálogo só depois disso.

## M3.5 — Decisões, normas carregadas e precedentes (12/11/2026)

O catálogo continua desligado: nenhum serviço recebe `FORGELEX_SKILL_CATALOG_DIR`. Orçamento mantido em 64 KB por papel e 96 KB no total.

### Decisão de Boni sobre as 82 fichas

Boni aprovou as 82 propostas em 12/11/2026. Elas viraram `scripts/skills/map-decisions.json` (motivo, autor e data em cada linha) e são aplicadas por `map-catalog.mjs --decisions`. A fila do mapa ficou em zero: 2.077 fichas mapeadas, sem chave duplicada. Das 82, 22 viraram Forma transversal (21 molduras e a correição parcial) e 60 ficaram com áreas explícitas.

### Normas carregadas

`fetch-laws.mjs` pergunta ao Senado o ano de cada norma, tenta as URLs possíveis do Planalto e guarda o texto compilado quando o número da norma aparece no cabeçalho. Foram baixadas 101 normas (leis, leis complementares, decretos, medidas provisórias e emendas), além das 16 anteriores, e `law-sources.json` passou a listar as 117. Três delas exigiram a URL certa à mão (Lei 9.615, MP 2.158-35 e MP 2.215-10).

O cruzamento ganhou: normas esparsas de qualquer tipo, siglas (LGPD, LDB, LEP), artigo com letra colada ("22A") ou com "º" ("9º-A"), cabeçalho quebrado ("Art" / ". 71"), "art. 895 CLT" sem "do", lei implícita por ficha (suplemento `impliedLaw`, para fichas que citam "art. 351" sem dizer a lei), fonte documental conferida à mão (`documentary`) e o registro de precedentes verificados e não verificados (`precedents`). Ficha com precedente não verificado fica pendente com a marca `PRECEDENT_UNVERIFIED`.

| Situação                      | Antes |    Depois |
| ----------------------------- | ----: | --------: |
| Cruzadas sem alerta           | 1.988 | **2.062** |
| Com alerta                    |     6 |     **7** |
| Sem referência verificável    |    83 |     **2** |
| Com precedente não verificado |     – |     **6** |

A lista de alertas reais subiu em um: `precos-transferencia-lei-14596` cita o art. 74 da MP 2.158-35 (revogado pela Lei 12.973/2014) no presente. As demais citações de artigos revogados, que apareceram ao carregar as normas, eram históricas e ficaram registradas com motivo: Súmula Vinculante 8 (Lei 8.212, arts. 45 e 46), art. 55 da Lei 8.212 (a Lei 9.766 ainda remete a ele), arts. 41-B a 41-G da Lei 10.671, art. 144 da Lei 8.213 (redação original).

### As 5 "nada verificável"

| Ficha                                         | Resolução                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replica`                                     | Só cita o CPC sem nomeá-lo; com a lei implícita, os artigos conferem.                                                                                                                                                                                                                                                       |
| `lgpd-transferencia-internacional`            | Artigos da LGPD conferem. A Resolução CD/ANPD 19/2024 foi lida no site da ANPD e confere. A Resolução CD/ANPD 32/2026 (reconhecimento da União Europeia) só foi confirmada em fontes secundárias; o texto oficial não foi lido.                                                                                             |
| `oficio`                                      | Conferida contra o Manual de Redação da Presidência, 3ª ed.: unificação de ofício, aviso e memorando, fonte Calibri ou Carlito, fechos "Respeitosamente" e "Atenciosamente", "Ilustríssimo" abolido, exemplo do número do ofício. Texto lido em cópia do PDF hospedada pela UFGD, porque o Planalto não entregou o arquivo. |
| `navegacao-interior-antaq-resolucoes-136-141` | Conferida no DOU: 20, 2, 3, 1 e 2 normas revogadas (28 no total), vigência de 180 dias após a publicação em todas, art. 17 da Res. 136 (120 dias) e art. 9º, § 8º. A Res. 139 não foi conferida.                                                                                                                            |
| `pnct-conformidade-tributaria-ibs-cbs`        | Artigos da LC 214/2025 conferem. O Ato Conjunto RFB/CGIBS 5/2026 não foi lido.                                                                                                                                                                                                                                              |

### Precedentes das 6 fichas

Fontes oficiais usadas: dados abertos do STJ (temas e processos qualificados) e o compêndio oficial de Súmulas do STJ.

| Ficha                                        | Verificado                                                           | Não verificado                                               |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `recurso-apelacao`                           | Temas 1.180, 1.267 e 1.059 do STJ.                                   | Nada. A ficha ficou **elegível**.                            |
| `agravo-instrumento`                         | Temas 1.281, 1.022, 1.267, 988 e 1.180; REsps 1.696.396 e 1.704.520. | REsps 1.803.925, 2.129.011, 2.237.365 e 2.242.573.           |
| `impugnacao-cumprimento-cpc-525`             | Tema 1.458 do STJ (REsp 2.269.091), Súmulas 519 e 393.               | Temas 360 e 100 do STF, ADPF 615, AR 2.876, Temas 881 e 885. |
| `sfh-cdc-cooperativa-anatel-stj-sumulas`     | Súmulas 31, 84, 297, 327, 450, 473, 514 e 586; Temas 50 e 51 do STJ. | Tema 1.011 do STF.                                           |
| `defesa-consumerista`                        | –                                                                    | REsps 1.195.642 e 802.832.                                   |
| `progressao-ect-pccs-irr-309`                | –                                                                    | IRR 309 e Súmula 202 do TST.                                 |
| `remuneracao-egresso-cpor-npor-tema-401-tnu` | –                                                                    | Tema 401 da TNU.                                             |

A consulta ao índice do ForgeLex (`research.verify_authority`) devolveu `NOT_FOUND` para os seis REsps de teste. O corpus persistido é parcial, então a resposta não confirma nem nega; foram seis chamadas. O portal de dados abertos do STJ negou a página de grupo (403), e o acesso foi feito pela API pública, sem contornar a negação.

### Fichas ainda pendentes (15)

- **Alerta (7):** `execucao-fazer-nao-fazer` e `tutela-especifica-cpc-497` (CC 757), `curatela-tda-epd-cc-1767` (CC 1773), `insolvencia-civil-cpc-1052` (CPC 786-A), `professor-clt-317` (CLT 324), `prova-testemunhal-cpc-442` (CC 227) e `precos-transferencia-lei-14596` (MP 2.158-35, art. 74).
- **Precedente não verificado (6):** `agravo-instrumento`, `defesa-consumerista`, `impugnacao-cumprimento-cpc-525`, `progressao-ect-pccs-irr-309`, `remuneracao-egresso-cpor-npor-tema-401-tnu` e `sfh-cdc-cooperativa-anatel-stj-sumulas`.
- **Sem referência verificável (2):** `ata-reuniao-conselho` (cita a Resolução CVM 23/2021, art. 31-B, cuja página oficial não trouxe o texto) e `ensino-arte-bncc-resolucao-cne-ceb-5-2026` (a Lei 15.388/2026 confere; a Resolução CNE/CEB 5/2026 existe segundo fontes secundárias, mas o texto do DOU não foi lido).

### Verificação

`node --test scripts/skills`: 46 aprovados. Catálogo reconstruído: 2.081 entradas, 2.058 elegíveis (as 22 transversais entre elas), 15 pendentes, 4 ajustadas e 4 redações do Lote 0. `desk-pilot` em `incorporated`: 4 aprovados.

## M3.6 — Normas revogadas atualizadas e precedentes verificados (12/11/2026)

Esta seção substitui a lista de pendentes da M3.5: o catálogo reconstruído tem **2.086 entradas, 2.077 fichas elegíveis e nenhuma pendente**. O catálogo continua desligado e o orçamento, em 64 KB por papel e 96 KB no total.

### Lote 1: redação atualizada para a norma equivalente

Cinco fichas citavam artigo revogado como se estivesse em vigor. Cada uma ganhou uma versão nova (`adjustedFrom` aponta a original), com o texto em `tests/fixtures/catalog-lot1/`. A versão nova só entra se passar pelo cruzamento sem alerta, e a conferência fica registrada em `crossChecks` (`norma-atualizada`). A original passa a `adjusted` e guarda o alerta que motivou o ajuste.

| Ficha                            | Versão | O que mudou                                                                                  | Norma equivalente conferida                                                                                                             |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `execucao-fazer-nao-fazer`       | 2 → 3  | Duas menções ao CC art. 757 no art. 499, p.ú., do CPC ganharam a ressalva da revogação.      | Lei 15.040/2024 (contrato de seguro, em vigor um ano após a publicação, art. 134). O texto do CPC no Planalto ainda remete ao art. 757. |
| `tutela-especifica-cpc-497`      | 2 → 3  | Mesma ressalva, na linha da Lei 14.833/2024.                                                 | Lei 15.040/2024.                                                                                                                        |
| `insolvencia-civil-cpc-1052`     | 2 → 3  | "art. 786-A" passou a "art. 786-A do CPC/1973", pois o artigo não existe no CPC de 2015.     | CPC/1973 (art. 1.052 do CPC/2015 mantém o regime).                                                                                      |
| `professor-clt-317`              | 3 → 4  | "CLT 317 a 324" passou a "CLT 317 a 323", com a revogação do art. 324.                       | Lei 7.855/1989 (indicada no texto do Planalto).                                                                                         |
| `precos-transferencia-lei-14596` | 2 → 3  | O art. 74 da MP 2.158-35, citado no presente, ganhou a revogação e a norma que o substituiu. | Lei 12.973/2014, art. 117, IX (revogação a partir de 1º/01/2015); lucros no exterior nos arts. 76 a 92.                                 |

Duas fichas deixaram de alertar sem mudar de texto. `prova-testemunhal-cpc-442` cita o caput do CC 227, revogado pelo CPC, mas usa o parágrafo único, que segue em vigor (suplemento `literal`, texto do Planalto lido). `curatela-tda-epd-cc-1767` já diz que o CC 1.768 a 1.773 foi revogado; o cruzamento só não reconhecia o fim do intervalo, o que foi corrigido.

### Precedentes: de 6 fichas pendentes a nenhuma

A conferência é de **existência e objeto** do precedente (número, órgão, relator ou leading case, data ou situação), não da redação da tese.

| Precedente                              | Fonte oficial                                                      | Resultado                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| REsps 2.129.011, 2.237.365 e 2.242.573  | Espelhos de acórdãos da 2ª e da 4ª Turma do STJ (jan. a set. 2026) | Existem, nos órgãos, relatores e datas que as fichas indicam.                                                                                  |
| REsp 1.803.925                          | Informativo do STJ n. 653 (30/08/2019)                             | Corte Especial, Min. Nancy Andrighi, julgado em 01/08/2019.                                                                                    |
| REsps 802.832 e 1.195.642               | Informativos do STJ (pesquisa por número)                          | 802.832: Min. Sanseverino, julgado em 13/04/2011, questão de ordem remetida à 2ª Seção. 1.195.642: Min. Nancy Andrighi, julgado em 13/11/2012. |
| Temas 360, 100, 881, 885 e 1.011 do STF | Portal do STF (repercussão geral)                                  | Existem, com os leading cases RE 611.503, 586.068, 949.297, 955.227 e 827.996.                                                                 |
| ADPF 615 e AR 2.876                     | Portal do STF                                                      | Existem. Só a existência foi conferida.                                                                                                        |
| IRR 309 e Súmula 202 do TST             | Tabela de repetitivos e documento do Tema 309 no site do TST       | RR 20286-91.2023.5.04.0022, julgado em 8/9/2025, acórdão de 15/9/2025; a Súmula 202 é a referência legislativa do próprio tema.                |
| Tema 401 da TNU                         | Temas representativos no site do CJF                               | Afetado; PEDILEF 5064082-43.2024.4.02.5101, afetação em 30/09/2026, questão idêntica à da ficha.                                               |

Os demais precedentes já tinham sido conferidos na M3.5 (temas do STJ e súmulas do compêndio oficial). A consulta ao índice do ForgeLex segue sem valor de prova: `NOT_FOUND` não nega, porque o corpus é parcial. A tentativa de varrer as íntegras do STJ de 2008 a 2020 foi abandonada: cada arquivo diário leva dezenas de segundos e a data de publicação não bate com o nome do arquivo. O acesso ao SCON do STJ foi negado (403) e não foi contornado.

### As 2 fichas sem referência

- `ata-reuniao-conselho`: o art. 31-B da Resolução CVM 23/2021 trata do comitê de auditoria estatutário, como a ficha diz (PDF oficial da CVM). Os arts. 138 a 165 da Lei 6.404 existem, e a sigla "LSA" passou a ser reconhecida. Não foram conferidos a Lei 14.195/2021, o DREI 81/2020 e a RCVM 44.
- `ensino-arte-bncc-resolucao-cne-ceb-5-2026`: a Resolução CNE/CEB 5/2026 foi lida no DOU (quatro componentes, mínimo de dois por ano ou série, revisão das normas em 180 dias da homologação do plano, implementação até o fim do PNE 2026-2036), e a Lei 15.388/2026 confere.

### Limites que continuam

A Resolução CD/ANPD 32/2026 (reconhecimento da União Europeia), o Ato Conjunto RFB/CGIBS 5/2026, a Resolução ANTAQ 139/2026, a Lei 14.195/2021, o DREI 81/2020 e a RCVM 44 seguem sem leitura do texto oficial. O cruzamento diz o que conferiu em cada ficha e não equivale a revisão jurídica do conteúdo.

### Verificação

`node --test scripts/skills`: 48 aprovados. `desk-pilot` em `incorporated`: 4 aprovados. Catálogo: 2.086 entradas (2.068 elegíveis, 9 ajustadas e superadas, 4 redações do Lote 0 e 5 do Lote 1).

## U3 — Peça e matéria na Mesa (12/11/2026)

Branch `claude/frente-u-inventario-mesa`. A orientação ganhou as regras `mesa-v3`, atrás da flag `FORGELEX_DESK_GUIDANCE_V3_ENABLED` do servidor (desligada). Nada foi publicado nem ligado: o catálogo continua sem `FORGELEX_SKILL_CATALOG_DIR` em qualquer serviço.

### O que mudou

| Camada                        | Mudança                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato (`GuidanceSnapshot`) | Dois campos opcionais: `court` (tribunal) e `rejectedDocumentTypes` (peças que o cliente já recusou). Entram no hash só quando existem, então o hash das orientações v1 e v2 não muda (conferido por um valor de referência gravado no teste).                                                                                                                |
| Regras (`guidance-rules`)     | v1 e v2 seguem como eram (seis áreas e a tabela fixa de peças). A v3 usa as 25 grandes áreas do mapa mais "Outra área", e a peça sai do catálogo. Fluxo: área, tarefa, peça, tribunal.                                                                                                                                                                        |
| Peça proposta                 | A Mesa propõe uma peça por vez, pelo texto do pedido ("Pelo que você informou, a peça é: Resposta à acusação. Está correto?"). "Não, é outra" propõe a próxima candidata; sem mais candidatas, pede para o cliente explicar e segue como pedido livre. "Não sei" também segue como pedido livre. Mudar a área ou a tarefa apaga a peça proposta e as recusas. |
| Ranqueamento                  | Local, sem provedor e sem reservar saldo: nome da peça no texto (+10), expressões da ficha (+5) e palavras do rótulo ponderadas pela raridade no catálogo (+1 a +5). Com a área escolhida, só entram as peças da área e as transversais.                                                                                                                      |
| Tribunal                      | Pergunta em texto livre. Reconhece STF, STJ, TST, TSE, STM, TRF 1 a 6, TRT 1 a 24, TJ e TRE de cada estado, por sigla ou por extenso. Texto que não reconhece vira "Outro tribunal"; "Não sei" deixa em aberto.                                                                                                                                               |
| Manifesto do catálogo         | Cada ficha ganhou `label` (o título) e as Formas ganharam `triggers`, ambos só para o servidor. `piecesFromManifest` monta a lista interna de peças: Formas elegíveis com rótulo, uma por tipo.                                                                                                                                                               |
| API                           | `GuidanceService` recebe a lista de peças e a versão das regras. A projeção traz `court` e um `label` legível por decisão. A lista de peças, as expressões, os ids de ficha e os hashes não saem do servidor.                                                                                                                                                 |
| Interface                     | O resumo mostra tribunal, usa o rótulo legível e marca a peça só proposta como "a confirmar". Perguntas com mais de 12 opções ganham busca sem acento nem caixa.                                                                                                                                                                                              |

### Sobre o catálogo real

Com o catálogo reconstruído, a lista tem 303 peças (22 transversais), todas com expressões. Em 11 de 13 pedidos de teste o resultado foi o esperado: a peça certa em primeiro lugar, ou nenhuma proposta para texto vago ("quero entender como proceder"). Nos dois pedidos genéricos ("petição inicial" e "execução fiscal") as candidatas empatam, e o cliente chega à certa recusando uma ou duas.

### Verificação

Vitest completo: 281 arquivos e 2.096 testes aprovados. Playwright: `desk-guidance-v3` (novo, 2 testes, com axe e celular), `desk-guidance` (6) e `desk-pilot` em `incorporated` (4). `node --test scripts/skills`: 49.

### Decisão de desenho e o que falta

- **Identificação por texto sem provedor.** O plano previa a IA identificando área, tribunal e peça. Fiz primeiro o ranqueamento local: é gratuito, instantâneo e não depende de consentimento. Uma refinação por IA continua possível, sob o consentimento e o custo vigentes, e só vale a pena se o ranqueamento errar mais do que a recusa resolve.
- **A área não é inferida do texto.** O cliente a escolhe (atalho com busca) antes da peça. Inferir a área pela peça proposta poupa uma pergunta e fica para uma segunda rodada.
- **Matéria em uso.** A matéria já sai das questões classificadas da execução. Os chips de matéria e a soma ou retirada de peça e matéria são da U4.
- **Chips no compositor.** Por ora área, peça e tribunal aparecem no resumo do pedido; levá-los para o compositor segue com a U4 (ações) e a U7.
- **Peça ou matéria sem ficha elegível.** Sem peça no catálogo o pedido segue como livre, mas a Mesa ainda não diz "não há apoio específico para isto". Fica para a U4.
- **Ligar.** A v3 só vale para conversas novas, com a flag ligada e o catálogo carregado (as peças vêm dele). Sem catálogo, a v3 funciona sem propor peça.

## U4 — Ações: voltar, alterar, excluir (12/11/2026, parcial)

Branch `claude/frente-u-inventario-mesa`. Entraram as ações que não dependem de modelo de dados novo nem de migração. As demais ficam registradas abaixo, com o motivo.

### Feito

| Ação                           | Como ficou                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voltar                         | Cada pergunta da orientação, menos a primeira, ganhou "Voltar": reabre a resposta mais recente com a opção marcada, pelo mesmo caminho de "Alterar" (nova revisão e reavaliação das decisões dependentes). O que o cliente escolheu ou digitou na pergunta pendente fica guardado por pergunta (`QuestionDraft`) e volta intacto ao "Cancelar alteração".                                   |
| Alterar área, peça ou tribunal | Já existia no resumo; agora cobre o tribunal da mesa-v3.                                                                                                                                                                                                                                                                                                                                    |
| Excluir conversa               | Deixou de pedir confirmação e passou a sair do histórico na hora, com o aviso "Conversa excluída do histórico: … As peças e os recibos foram preservados" e o botão "Desfazer". O aviso fica 10 segundos, pausa com o ponteiro ou o foco e fecha com Esc. A conversa continua recuperável em "Conversas excluídas", sem prazo. Excluir não cancela trabalho em andamento nem consome saldo. |
| Nova peça, nova conversa       | Já existiam no cabeçalho e na lista de conversas; sem mudança.                                                                                                                                                                                                                                                                                                                              |

O aviso é o componente `UndoNotice` (`role="status"`, não rouba o foco), reutilizável pelas próximas ações reversíveis.

### Verificação

Playwright: `desk-guidance-v3` (3, com o novo teste de voltar), `desk-guidance` (6), `writing-desk` (38, incluindo excluir, desfazer, excluir de novo, recarregar e restaurar). Tipos e ESLint do pacote web sem erros.

### Não feito e por quê

- **Adicionar e remover peça ou matéria (chips).** O pedido hoje carrega uma peça e as matérias saem das questões classificadas da execução. Somar ou retirar exige um modelo de pedido com várias peças e matérias, que muda o contrato da execução. Fica para quando esse modelo for decidido.
- **Excluir peça (rascunho).** A verificação pedida pelo plano mostrou que não há rota de exclusão nem de restauração de rascunho: o ciclo de vida existente é o do caso e do documento. Arquivar e restaurar rascunho pede uma coluna nova (migração), que só se aplica com autorização de Boni.
- **Excluir anexo.** Depende da U5.
- **Atalho de teclado e registro de auditoria por ação.** O aviso fecha com Esc; os demais atalhos e a auditoria própria das ações não foram feitos. A exclusão de conversa já grava o estado oculto, mas não há trilha de auditoria dedicada.
- **Flag por grupo de ações.** Não criada: as mudanças são de interface e a reversão é desfazer os commits.
- **Voltar na peça aberta e na fonte aberta.** Só a pergunta guiada ganhou "Voltar"; a peça e a fonte seguem com os controles atuais.

## U4 (complemento) e U5 — rascunho, matérias, anexos e auditoria (12/11/2026)

Branch `claude/frente-u-inventario-mesa`. Esta seção completa a U4 e registra a U5. Tudo o que muda o que o cliente vê ficou atrás de flags de navegador desligadas por padrão; o que é de servidor não exigiu migração.

### U4: o que passou a existir

| Item                                | Como ficou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excluir peça (rascunho)             | **Sem migração.** `ARCHIVED` já era um status do contrato de rascunho, que ninguém usava. Arquivar troca só o status; restaurar devolve o status da versão atual. Nada é apagado: versões, revisões, aprovações e recibos ficam como estão. Rotas `POST …/drafts/:draftId/archive` e `…/restore` (escopo `draft:write`, com auditoria), e `GET …/drafts?archived=true` para a lixeira. A lista padrão não mostra arquivados.                                                                                                                                                  |
| Regras de segurança do arquivamento | Rascunho arquivado não recebe versão nem pedido de aprovação (`DRAFT_ARCHIVED`, 409) até ser restaurado. Aprovação pendente impede arquivar (`DRAFT_APPROVAL_PENDING`, 409): é uma decisão humana em aberto. Arquivar e restaurar são idempotentes.                                                                                                                                                                                                                                                                                                                           |
| Excluir peça na tela                | "Excluir peça" no menu da peça aberta, com o aviso "Peça excluída… Desfazer". Fica indisponível enquanto houver edição não salva, para não perder texto. O Desfazer reabre a peça.                                                                                                                                                                                                                                                                                                                                                                                            |
| Chips de matéria                    | A Mesa sugere uma matéria por vez a partir do que o cliente escreve ("Pelo que você escreveu, a matéria é: X. Está correto?"), sem lista, sem provedor e sem custo. O cliente confirma, recusa ("Não, outra") ou cancela, e remove o chip com o "x". A matéria confirmada segue como **dica** no contexto do pedido ("Matérias indicadas pelo cliente (confira se se aplicam ao caso): …"), que o servidor ainda confere com as fontes. O servidor entrega só o rótulo e um código opaco; o id interno do tópico e a lista não saem dele. Uma peça por pedido, como decidido. |
| Auditoria                           | Excluir e restaurar conversa passaram a gravar `workspace.hide_conversation` e `workspace.restore_conversation` (quem, qual execução e quando), sem o conteúdo. Arquivar e restaurar rascunho gravam `drafting.archive_draft` e `drafting.restore_draft`.                                                                                                                                                                                                                                                                                                                     |
| Voltar na peça e na fonte           | Já funcionavam e foram conferidos no código: "Recolher peça" e "Abrir peça" preservam o texto editado (coberto pelo e2e existente), e o painel de fontes é um diálogo nativo que fecha com Esc e devolve o foco a quem o abriu, sem tocar na peça. Só faltava a pergunta guiada, entregue antes.                                                                                                                                                                                                                                                                              |

### U5: anexos (atrás de `VITE_FORGELEX_ATTACHMENTS_ENABLED`)

- Clipe no compositor para anexar PDF, TXT e MD, até 5 arquivos. A leitura é no navegador e reaproveita `extractPdfText` (limite de 15 MB e 300 páginas). TXT e MD até 2 MB.
- Só o texto extraído segue com o pedido (DEC-12), somado ao contexto escrito; o arquivo não é enviado nem guardado. O texto dos anexos juntos fica limitado a 80.000 caracteres, e o pedido inteiro a 100.000, com mensagem clara antes de enviar.
- Cada anexo é um chip com estado (lendo, texto extraído, sem texto extraível, formato não aceito, erro, grande demais), e pode ser aberto, trocado e removido por clique e por teclado. A leitura em andamento bloqueia o envio.
- Imagens ficam como "sem texto extraível" (OCR na U6). Word (.docx) ainda não é lido e diz isso, sugerindo exportar para PDF.
- **Não feito:** a identificação da peça pela leitura do PDF. O texto do anexo não entra no ranqueamento da peça, porque o servidor o mostraria de volta ao cliente como "pedido". Fica para quando houver um campo próprio para isso.

### Flags

| Flag                                 | Onde                 | Efeito                                                        | Padrão    |
| ------------------------------------ | -------------------- | ------------------------------------------------------------- | --------- |
| `VITE_FORGELEX_ATTACHMENTS_ENABLED`  | navegador (montagem) | Clipe e chips de anexo                                        | desligada |
| `VITE_FORGELEX_MATTER_CHIPS_ENABLED` | navegador (montagem) | Chips de matéria (precisa da orientação guiada e do catálogo) | desligada |
| `FORGELEX_DESK_GUIDANCE_V3_ENABLED`  | servidor             | Regras mesa-v3                                                | desligada |

### Verificação

Vitest completo: 285 arquivos e 2.120 testes aprovados. Playwright: `writing-desk` (39, com excluir peça), `desk-guidance` (6), `desk-guidance-v3` (4, com matérias), `attachments` (2, com PDF real e axe) e `desk-pilot` em `incorporated` (4). Os testes de persistência e de rotas cobrem arquivar, restaurar, bloqueio de escrita, aprovação pendente, isolamento de tenant e auditoria.

### Ainda aberto

- Aplicar nada em banco ou ambiente foi necessário e nada foi aplicado.
- Atalhos de teclado além do Esc: não foram criados. O ponto é desenho (conflito com o botão voltar do navegador e com o desfazer de texto), não código.
- Leitura de Word, OCR (U6) e identificação da peça pelo PDF.
- Duas falhas isoladas de tempo limite apareceram em suítes pesadas rodadas em paralelo e passaram ao rodar sozinhas; a suíte completa passou.

## Reconciliação pós-deploy · 12 de novembro de 2026

Base `origin/main` em `b4c76e0ee593588365992b66597701f161001502`. Plano trazido de `claude/plano-unificado` em `7e66daf2276ac0380d4ba6ea29ba3f67ad23b339`, com o v2 preservado no arquivo histórico. O [estado publicado](../historico/pendencias-ate-2026-11-16.md#estado-publicado-atual--12112026-sha-b4c76e0) reúne as revisões e as flags observadas.

- **E1 e M1.** `gcloud run services describe` e `gcloud run revisions describe` identificaram as revisões ativas e as flags de execução. `gcloud builds list` ligou o digest ativo ao build que habilita a casca, os anexos e os chips. `Invoke-WebRequest` retornou HTTP 200 em `/healthz` e `/readyz` de produção. A [CI de b4c76e0](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/43320401061) passou. O conteúdo do manifesto servido e a jornada autenticada ficaram fora da conferência.
- **M1 e DEC-5.** `pnpm exec vitest run packages/billing-ledger/src/commercial-inference-service.test.ts apps/web/src/agentic-workspace/commercial.test.ts` aprovou 41 testes. Um ensaio temporário com o serviço real de reserva e SQLite em memória liquidou valores em duas contas independentes. Com R$ 8,50 contabilizados, o serviço admitiu a próxima reserva de R$ 11,50. Com R$ 8,51, retornou `COMMERCIAL_DAILY_LIMIT` e o saldo disponível permaneceu igual ao anterior à tentativa. Os dois casos passaram e o arquivo de ensaio foi removido. A suíte web cobre a mensagem de limite diário. O teste usou dados sintéticos, sem chamadas ao provedor.
- **M2.** Parcial. O PR #138 registra a aplicação da `0041` no banco HML isolado. As revisões publicadas têm migração automática e salvamento recuperável desligados. A referência de banco é igual em produção, HML comum e encerramento. A jornada funcional deve ocorrer no ambiente isolado. A consulta não leu a tabela de migrações nem valores de credenciais.
- **M3 e U.** O PR #139 integrou o catálogo e a Mesa única. Os PRs #140–141 viabilizaram a ativação das flags web no build publicado. O escopo e os recortes ainda abertos de U2–U5 estão nos registros acima. U6 e U7 seguem no plano. V0 foi adiada por Boni.
- **Pendências operacionais.** Jornada autenticada de M2, comportamento comercial na jornada, verificações residuais de MCP e ensaio do alerta E3 com chave inválida.

A conferência operacional citada foi somente leitura. A reconciliação local não executou deploy, migração remota, alteração de flags nem chamada comercial.

## M2 · preparação local da homologação

Base `origin/main` em `5793964`. Codex trabalha na preparação da homologação na branch `codex/coordenacao-mesa-m2`. O worktree `retomada-case-flow` estava reservado à sessão do Claude Code na conferência. Alterações que cruzem a Mesa e o fluxo de casos serão encaminhadas a Boni com a evidência do cenário e os arquivos afetados. O [plano unificado](../superpowers/plans/2026-11-11-forgelex-plano-unificado.md#coordenação-entre-codex-e-claude-code) registra a divisão de trabalho.

### Cobertura local de M2

A instalação com lockfile congelado e o build passaram. As cinco suítes somaram 18 cenários aprovados.

Cada configuração da tabela é executada com `pnpm exec playwright test --config <arquivo>`. As suítes usam Chromium, autenticação de teste em loopback, banco SQLite descartável e respostas sintéticas.

| Jornada                                                                                                                        | Cobertura existente                       | Resultado nesta preparação |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------- |
| Pedido completo, “Me ajude a começar”, “Não sei”, resumo, duas abas, recarga, criação e edição delimitada em desktop e celular | `playwright.desk-guidance.config.ts`      | 6 aprovados                |
| Texto livre, 25 áreas, tribunal, peça proposta e chips de matéria com `mesa-v3`                                                | `playwright.desk-guidance-v3.config.ts`   | 4 aprovados                |
| Revisão e aprovação vinculadas à versão, além de navegação por links legados                                                   | `playwright.desk-review.config.ts`        | 3 aprovados                |
| Abertura de pesquisa salva, vínculo ao destino e preservação da peça                                                           | `playwright.desk-research.config.ts`      | 2 aprovados                |
| Perda de resposta após o commit, recarga e recuperação do recibo antes de reenviar                                             | `playwright.desk-save-recovery.config.ts` | 3 aprovados                |

### Jornada pendente no HML isolado

1. Na execução autorizada por Boni, identificar o SHA do serviço `forgelex-api-hml-isolated`, conferir a referência ao banco `forgelex-hml-isolated-pg` e confirmar a `0041` antes de habilitar o salvamento. Seguir o [procedimento de recuperação](../operations/draft-save-recovery.md#preparar-a-aplicação). O serviço HML comum e o serviço de encerramento compartilham o banco de produção.
2. Com conta e dados de teste no ambiente isolado, percorrer a orientação publicada (`mesa-v3`), criação e revisão sem nova versão, edição delimitada e pesquisa salva. Conferir a versão da peça, o caso e a conversa após recarga e atualização em duas abas.
3. Após salvar, simular a perda da resposta. Conferir que a consulta ao recibo recupera a versão persistida e que a tentativa não duplica a versão nem perde uma edição posterior. Registrar SHA, revisão, flags, cenário e resultado por etapa neste registro.
4. Levar a Boni o resultado de A18 e eventuais lacunas. A19 é o aceite visual previsto em V3. O manifesto efetivamente servido e o aceite jurídico do piloto seguem na M3.

O preparo local não atesta o serviço HML, o registro da migração no alvo da execução, o manifesto servido ou o comportamento sob as flags combinadas. O ensaio autenticado em HML permanece pendente.

## M2 · início do ensaio remoto em 12/11/2026

Boni autorizou iniciar M2, com teto total de US$ 1 em inferências, reutilização temporária da chave comercial e pausa temporária do Ratione para liberar o limite de projetos gratuitos do Supabase. Ao encerrar o ensaio, o Auth HML deve voltar à pausa e o Ratione deve ser retomado. O banco Cloud SQL isolado deve voltar à política `NEVER`.

A conferência encontrou `forgelex-api-hml-isolated` na revisão `00002-kf2`, com imagem de setembro, banco `forgelex-hml-isolated-pg` parado e Supabase `hhemvrxygfzbzpgmohfj` inativo. O domínio `hml.nexojuris.ia.br` aponta ao backend isolado no mapa `forgelex-api-hml-map`. A produção recebia 100% do tráfego na revisão `forgelex-api-prod-b4c76e0`.

A primeira retomada do Supabase HML foi recusada pelo limite de dois projetos gratuitos ativos. Após a autorização de Boni, a pausa de Ratione (`hpxbjltyoqxretwtgnkp`) e a retomada do HML foram aceitas. O Cloud SQL recebeu a solicitação de ativação `57a4d7f6-7837-4233-8daf-a54e00000030`. A preparação da imagem usa código de `5793964` e uma cópia privada do catálogo publicado em `gs://forgelex-prod-skill-catalog-bbbe1209/v1`.

### Resultados do ensaio remoto

O build `791d0f6d-9a8f-4348-b062-4751054d89a6` publicou a imagem privada de HML com digest `sha256:77fcc628bf0d9be25d4ed5c8c390468894a1f9cf723f563631e55e9ebb51f275`. O código corresponde a `5793964`; o Dockerfile temporário acrescentou somente a cópia do catálogo ao runtime. O frontend aponta ao Supabase HML. As alterações de código versionado nesta branch continuam documentais.

A inspeção do banco confirmou 49 migrações e a tabela `draft_save_commands`, e identificou as migrações `billing-ledger-0008`, `0009` e `0010` pendentes. Após o backup `1794538101210` concluir com `SUCCESSFUL`, o job temporário aplicou as migrações existentes do ledger e preparou a conta sintética. A primeira configuração de saldo promocional ficou sem validade e foi corrigida exclusivamente nessa conta de teste.

A revisão inicial recusou subir por falta do diário obrigatório de exclusão de casos. O bucket HML já existia. Foram criados os segredos HML `forgelex-hml-isolated-purge-encryption`, `forgelex-hml-isolated-purge-mac` e `forgelex-hml-isolated-purge-key`, além da âncora no bucket isolado. Com essa configuração, a revisão `forgelex-api-hml-isolated-m2-journal-5793964` respondeu 200 em `/readyz`, com persistência, migrações, ledger, Auth e integridade do diário aprovados.

| Cenário remoto                            | Evidência e resultado                                                                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientação `mesa-v3` em desktop e celular | Dois cenários aprovados com Auth real, 25 áreas, proposta confirmável, tribunal, resumo e axe. A expectativa de capitalização foi adaptada ao título do catálogo real.                                                            |
| “Não sei”, recarga e concorrência         | Um cenário aprovado. A resposta concorrente enviada pela API foi preservada e a interface recusou a resposta antiga com a mensagem de atualização em outra aba.                                                                   |
| Salvamento recuperável                    | Três cenários aprovados contra PostgreSQL remoto. Perda da resposta após gravação, recarga com recibo pendente e recuperação preservando edição posterior. Uma única versão foi criada por comando.                               |
| Pesquisa salva e caso                     | Um cenário aprovado. Reabrir a pesquisa conservada gerou zero buscas novas. O vínculo foi salvo apenas no caso escolhido, preservando texto local e URL da peça.                                                                  |
| Criação com IA real                       | Execução `05fbe99e-17d4-4e69-ba2a-a009b7018058` concluída, com uma minuta sintética salva. A entrega manteve `LIMITED`, `humanReviewRequired=true` e `legalAssessment=NOT_EVALUATED`.                                             |
| Revisão com IA real                       | Execução `3cc7b16c-3c44-4447-ab4a-0a4644788ebb` concluída. A peça permaneceu com uma versão e o mesmo identificador de versão.                                                                                                    |
| Edição delimitada pela interface          | Execução `d83eaaa5-d363-4663-b040-4e5a3711e9c5` concluída. A seleção por teclado no compositor resultou em exatamente uma versão nova. O texto fora do intervalo e as demais seções foram comparados integralmente e preservados. |

Foram dez cenários aprovados nesta rodada. As treze chamadas ao provedor tiveram custo confirmado de **US$ 0,192308**, calculado pelo uso registrado e pela política do código. Nenhuma chamada ficou com custo incerto. Antes de cada nova execução, o consumo confirmado mais a reserva máxima de US$ 0,60 foi conferido contra o teto total de US$ 1. Os créditos do ledger eram sintéticos, no banco HML.

As evidências privadas ficam em `.superpowers/m2-20261112/`, incluindo os scripts derivados dos testes existentes, resultados das três execuções reais, contagem de versões, consumo e capturas. O ensaio não constitui aprovação jurídica da minuta nem aceite visual A19. A correção diretamente pelos controles do resumo e o aceite final de A18 por Boni ainda precisam de registro específico.

### Encerramento do ambiente temporário

As sessões do usuário sintético foram encerradas e sua identidade foi removida do Auth HML. O arquivo local de credenciais foi removido. A conta e os documentos sintéticos no banco foram conservados como evidência. O job temporário foi excluído.

O acesso da conta de serviço HML à chave comercial foi revogado. A revisão `forgelex-api-hml-isolated-m2-idle-5793964` desabilita execução comercial e edição editorial comercial, remove a referência à chave OpenAI e mantém a preparação técnica de HML para uma próxima rodada. A conferência final confirmou Cloud SQL isolado em `STOPPED` com política `NEVER`, Auth HML em `INACTIVE` e Ratione novamente em `ACTIVE_HEALTHY`. O site do Ratione respondeu HTTP 200. Os segredos e a âncora do diário HML permanecem para preservar a configuração de integridade das próximas rodadas.

A produção foi conferida em `forgelex-api-prod-b4c76e0`, com 100% do tráfego. A18 permanece parcial pelos itens explicitados acima.

## M2 · correção pelos controles do resumo em 13/11/2026

O cenário restante foi exercitado no HML isolado, na revisão `forgelex-api-hml-isolated-m2-journal-5793964`, com o código `5793964` e o catálogo da rodada anterior. A retomada reutilizou a pausa temporária de Ratione autorizada para M2. O comando foi `pnpm exec playwright test --config .superpowers/m2-summary-20261113/remote.config.ts`. A API respondeu 200 em `/readyz` após o Cloud SQL concluir a retomada.

### Resultado para o aceite A18

| Controle                  | Resultado observado                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancelar alteração        | Passou. A API retornou exatamente o estado anterior, inclusive a revisão do contexto.                                                                       |
| Alterar tarefa            | Passou em 1440 e 390 px. “Elaborar uma peça” mudou para “Revisar um texto”, com uma nova revisão do contexto e invalidação da peça anterior.                |
| Alterar área e recarregar | Passou em 1440 e 390 px. “Penal” mudou para “Civil”. Tarefa e tribunal permaneceram, a peça continuou vazia e a mesma conversa foi recuperada após recarga. |
| Alterar tribunal          | Falhou em 1440 e 390 px. Ao editar TJ-AL para TJ-SP, o botão “Salvar alteração” permaneceu desabilitado apesar do texto preenchido.                         |
| Alterar peça confirmada   | Falhou. Depois de “Não, é outra”, a API respondeu com a revisão 6, mas voltou a propor a mesma `resposta-acusacao` que estava confirmada na revisão 5.      |

Os cinco cenários finais ficaram em dois aprovados e três falhos (tribunal em duas larguras e peça). A primeira observação da peça lia o estado antes de a requisição terminar; o ensaio foi ajustado para aguardar a resposta de `/correct`, e a falha de comportamento permaneceu. As asserções de preservação e invalidação foram mantidas.

### Causas identificadas e evidências

- Tribunal. `QuestionOptions.tsx` inicializa `selected` com o valor atual `tj-al`, embora a pergunta seja de texto livre e não tenha opções. Digitar TJ-SP altera o texto, mas conserva essa seleção inválida. `answerFor` devolve `null`, mantendo o botão desabilitado.
- Peça. `answerV3`, em `guidance-rules.ts`, trata a recusa apenas quando o estado é `proposed`. Ao corrigir uma peça `confirmed`, o caminho de texto livre ranqueia novamente o pedido original e volta à mesma peça. A resposta HTTP 200 e os estados antes/depois estão registrados.
- Capturas e dados privados em `.superpowers/m2-summary-20261113/`: `tribunal-desktop.png`, `tribunal-mobile.png`, `piece-after-correction.png`, `piece-states.json`, `1440-correcao-area-tarefa.png`, `390-correcao-area-tarefa.png`, `1440-states.json` e `390-states.json`. O manifesto de evidências liga esta rodada aos resultados e hashes dos artefatos anteriores.

A consulta aos logs não encontrou chamadas `commercial_call_trace` nesta rodada. O consumo acumulado de M2 continua em US$ 0,192308. A aplicação versionada não foi alterada durante a avaliação. As correções alcançam o componente de perguntas e as regras de orientação, áreas compartilhadas com o fluxo da Mesa, e devem ser coordenadas com Boni antes de uma nova implementação.

**Conclusão desta rodada.** Os dois defeitos impediram recomendar o aceite naquele momento. A correção e o reteste subsequentes estão na seção [Correção dos controles e reteste de M2](#correção-dos-controles-e-reteste-de-m2). Os dez cenários aprovados na rodada anterior continuam registrados como evidência, com a ressalva jurídica e visual já indicada.

### Encerramento desta rodada

O usuário Auth sintético foi removido após encerramento global das sessões. A credencial local foi removida. O HML voltou à revisão `m2-idle-5793964`, e o acesso temporário à chave comercial foi revogado. A conferência final confirmou o banco HML em `STOPPED` com política `NEVER`, o Auth HML em `INACTIVE` e o Ratione em `ACTIVE_HEALTHY`, com HTTP 200 no site. A produção continuou em `forgelex-api-prod-b4c76e0`, com 100% do tráfego.

## Correção dos controles e reteste de M2

Em 13/11/2026, após a solicitação de Boni para corrigir as falhas, foram alterados dois pontos de implementação. `QuestionOptions.tsx` filtra a seleção inicial pelas opções válidas da pergunta, permitindo que o tribunal seja corrigido como texto livre. `guidance-rules.ts` reconhece a pergunta de confirmação da peça também quando a escolha já estava confirmada, aplicando corretamente confirmação, recusa e “Não sei”. As regras de área, tarefa, orçamento e persistência conservaram seus contratos.

### Regressão automatizada

- Três novos casos em `guidance-service.test.ts` falharam antes da correção e passaram depois. Cobrem confirmação, recusa e “Não sei”, preservação de área e tribunal, leitura persistida, replay idempotente e exclusão da peça recusada das propostas seguintes.
- Dois novos cenários em `desk-guidance-v3.spec.ts` reproduziram o botão de tribunal desabilitado em 1440 e 390 px antes da alteração. Após a correção, verificam o salvamento de TJ-SP, persistência na recarga, recusa da peça confirmada e preservação da conversa.
- Resultado local final: 58 testes Vitest aprovados em oito arquivos; 15 cenários Playwright aprovados nas suítes `desk-guidance-v3` (6), `desk-guidance` (6) e `desk-save-recovery` (3). Build, ESLint nos arquivos alterados, Prettier e `git diff --check` passaram.

### Reteste remoto da correção

O build `fac99eba-2ef1-4bc0-9690-a7b6d8c67be8` gerou a imagem privada de HML com digest `sha256:931b320042d5905a6936ae662953dac59218d454b89147803af8eecc9e4113be`. A imagem contém a base `5793964` com o patch local de runtime `9888d4e645eebfa983ad0c090915db3e65ab9994506bd970a0d34c00acbfeece`, conservado em `.superpowers/m2-fix-20261113/runtime.patch`. A revisão `forgelex-api-hml-isolated-m2fix-9888d4e6` retornou 200 em `/readyz` antes dos testes.

Foram repetidos os mesmos cinco cenários do resumo, com **cinco aprovados**. Em desktop e celular, TJ-SP foi salvo e persistiu na recarga, a tarefa e a área foram corrigidas, a seleção anterior da peça foi invalidada e a conversa permaneceu a mesma. A recusa da peça confirmada passou a avançar à próxima candidata do catálogo, sujeita a confirmação. A adequação jurídica dessa próxima candidata não foi avaliada por esse teste funcional.

As capturas, estados da API e relatório do Playwright estão em `.superpowers/m2-fix-20261113/`. Destaques: `1440-03-depois-recarga.png`, `390-03-depois-recarga.png` e `piece-after-correction.png`. O comando de reteste foi `pnpm exec playwright test --config .superpowers/m2-fix-20261113/remote.config.ts`. Os registros da rodada que falhou foram preservados no diretório anterior.

Nenhuma chamada de inferência foi realizada nesta correção e reteste. O consumo acumulado de M2 continua em US$ 0,192308. A conta sintética foi removida após encerramento das sessões e o arquivo local de credenciais foi apagado. A revisão de repouso de HML passou a `m2fix-idle-9888d4e6`, com execução comercial desligada e sem a referência à chave OpenAI. A conferência final confirmou o banco HML em `STOPPED` com política `NEVER`, Auth HML em `INACTIVE` e Ratione novamente em `ACTIVE_HEALTHY`.

**Situação para A18.** Os dois defeitos identificados foram corrigidos no código local e validados em HML. O aceite final cabe a Boni sobre essas evidências. A publicação da correção na branch principal e em produção segue o fluxo de integração e publicação autorizado.

## Publicação das correções de M2 em 13/11/2026

Boni autorizou publicar a `main`, executar `DryRun` primeiro, conferir as flags e validar a produção. A publicação partiu de um worktree limpo em `01b46c5069c91b8660561502d8fea38bf484bd1d`, com [CI pós-merge aprovada](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/43366583998).

1. `pwsh -NoProfile -File ops/gcp/production/deploy-from-main.ps1 -DryRun` passou. As seis flags web estavam em `true`; orientação guiada e v3 ligadas na API; salvamento recuperável ausente/desligado; migração automática em `false`.
2. O mesmo comando sem `-DryRun` construiu a imagem e criou as revisões sem tráfego. O build `d158413d-f737-4704-9354-eb566611a3b6` terminou com sucesso e produziu `sha256:dd3ecc7234660c39b41b72bf97d5d5209c69c7b570c02cf26d589e855d8b5ac3`.
3. O roteiro comparou cada candidata com sua revisão anterior `b4c76e0`, conferindo igualdade de configuração exceto imagem e SHA. Promoveu primeiro `forgelex-closure-hml-private-01b46c5` e depois `forgelex-api-prod-01b46c5`. Ambos recebem 100% do tráfego. O catálogo montado em `/skills` e as flags de execução foram preservados.
4. As sondagens do roteiro passaram. A conferência adicional confirmou 200 em `/`, `/health`, `/readyz` e `/.well-known/oauth-protected-resource/mcp`, além do 401 esperado em `/mcp` sem autenticação.
5. `pnpm exec playwright test --config .superpowers/deploy-m2/remote.config.ts` aprovou cinco cenários autenticados contra `https://nexojuris.ia.br`, com dados sintéticos próprios. Foram conferidos cancelamento, correção de tribunal, rejeição da peça confirmada, correção de tarefa e área, identidade da conversa e persistência após recarga, em desktop e celular. O envio de execução comercial foi bloqueado pelo ensaio. Não houve inferência paga nessa validação.

### Ocorrência residual no cadastro

A conferência ampliada dos logs encontrou um 503 em `/api/v2/auth/bootstrap` às `2026-11-13T05:13:40.518283Z`. O log do Cloud SQL correlacionado apontou `duplicate key value violates unique constraint "forgelex_user_profiles_pkey"`. O perfil era o da conta sintética criada para este ensaio. A rota registrou também 23 respostas 200, e todos os cenários de navegador concluíram. O diff desde `b4c76e0` não altera o cadastro nem o repositório de contas. A investigação da colisão no provisionamento fica registrada como pendência; a publicação preservou o código integrado na `main`.

Uma rodada adicional de três sondagens completas passou após a ocorrência. A consulta final dos logs das duas revisões não encontrou novos 5xx posteriores às 05:13:41 UTC.

### Encerramento e reversão

As sessões de validação foram encerradas globalmente, a identidade sintética foi removida do Auth e o arquivo local de credenciais foi apagado. Os registros internos sintéticos permanecem como evidência. `DryRun`, log do deploy, configuração do ensaio, resultados e capturas ficam no diretório local ignorado `.superpowers/deploy-m2/` deste worktree.

Se necessária, a reversão usa `gcloud run services update-traffic` para as revisões `forgelex-api-prod-b4c76e0` e `forgelex-closure-hml-private-b4c76e0`, ambas com 100%, no projeto `project-bbbe1209-c295-4720-867` e região `southamerica-east1`. Não houve migração nesta publicação.

## Aceite A18 em 14/11/2026

Boni aceitou a A18 (homologação funcional no ambiente isolado) em 14/11/2026, sobre a evidência já registrada neste documento:

- **Homologação isolada (12/11), IA real:** dez cenários aprovados, incluindo orientação `mesa-v3` em desktop e celular, “Não sei”, recarga e duas abas, salvamento com perda de resposta (uma versão por comando), pesquisa salva sem nova busca, e criação, revisão e edição delimitada com IA real. Custo confirmado de US$ 0,192308 de um teto de US$ 1, sem chamada incerta.
- **Controles do resumo (13/11):** dois defeitos encontrados (correção do tribunal e recusa da peça confirmada), corrigidos na PR #146 e validados em HML e em produção, cinco de cinco cenários nos dois ambientes.
- **Local:** suítes de orientação, revisão, pesquisa e recuperação aprovadas; CI da `main` verde.

**Ressalvas que permanecem (não fazem parte da A18):** a avaliação jurídica das minutas continua com Boni; o aceite visual é a A19, em V3; as verificações do MCP com cliente autenticado (lista nominal das ferramentas, chave de idempotência no ChatGPT, piso de resultados) seguem abertas; o salvamento recuperável permanece desligado em produção e depende da migração `0041` e de decisão de Boni.

Efeito no plano: a dependência de V1 em M2 está atendida.

## M3.7 · Conferência em massa de súmulas e temas (14/11/2026)

`scripts/skills/crosscheck-precedents.mjs` lê as 2.077 fichas da pasta local do catálogo, extrai as citações a súmulas e temas e as confere contra listas oficiais, sem leitura ficha a ficha. `scripts/skills/fetch-stf-temas.mjs` consulta o portal do STF tema a tema. Ao todo 19 testes (`crosscheck-precedents.test.mjs` e `fetch-stf-temas.test.mjs`). O relatório traz só identificadores (tipo, tribunal, número, motivo e `stableId` das fichas); `--with-context` acrescenta o trecho citado e fica desligado por padrão.

**Fontes oficiais usadas**

| Fonte | Conteúdo | Observação |
| --- | --- | --- |
| STJ, `processo.stj.jus.br/SCON/sumstj/toc.jsp`, PDF `VerbetesSTJ_asc` | 676 súmulas, com a situação (em vigor, alterada, cancelada, revogada) | O PDF `SumulasSTJ.pdf` baixado antes termina na 649 e foi descartado: com ele, 28 citações das súmulas 650 a 691 apareceriam como inexistentes. |
| STF, `portal.stf.jus.br/jurisprudencia/sumariosumulas.asp` (base 30 e 26) | 736 súmulas e 62 vinculantes, com “superada”, “cancelada” e “alterada” | |
| STJ, dados abertos, `temas.csv` (precedentes qualificados) | 1.474 temas do tipo Tema (sem Controvérsias), com a situação | |
| TST, Livro de Jurisprudência (Res. 225/2025, `livrointernet-12-pdf`) | 463 súmulas (1 a 463, sem buraco), 156 canceladas | A edição de 2011 termina na 429 e foi descartada. Cancelamento parcial (“cancelado o item II”) mantém a súmula em vigor. |
| TNU, CJF, `phpdoc/virtus/listaSumulas.php` | 89 súmulas, com cancelada, revogada e alterada | |
| TNU, CJF, `temas-representativos?b_size:int=1000` | 402 temas com a situação (Desafetado, Revisado e Cancelado saem de vigor) | Uma página só. |
| STF, `portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=N` | 728 temas consultados um a um (cerca de 1 por segundo): repercussão geral e situação | A planilha `merito_julgado.xlsx` do STF é de abril de 2022 e foi descartada. Tema sem o campo “Situação” não existe (os anos “2021”, “2023”, “2024” e “2025”, lidos como tema, foram descartados). |

**Sem fonte:** o SCON do STJ (`scon.stj.jus.br`) e o site do TSE (`www.tse.jus.br`) negam acesso (403) e não foram contornados; por isso as súmulas do TSE (16 citações distintas) não foram conferidas. **TRF:** nenhuma súmula de TRF regional é citada nas fichas; as menções a “TRF” são do foro (“TJ ou TRF”, “Súm. 702 → TRF”), e “TRF” deixou de ser tratado como tribunal que atribui súmula.

**Resultado** (4.051 citações distintas):

| Situação | Citações |
| --- | ---: |
| Conferidas e corretas | 2.438 |
| Históricas (a própria ficha diz que foi cancelada, superada, revogada, pendente etc.) | 124 |
| Alerta | 0 |
| Aviso | 44 |
| Não conferidas: tribunal não declarado | 1.355 |
| Não conferidas: tribunal sem lista (TSE e outros) | 90 |

**Os 44 avisos** são citações de número que existe, mas sem tese de repercussão geral firmada ou com redação alterada, e ficam para revisão de Boni, sem presumir erro da ficha: 24 temas do STF com **mérito pendente** (34 fichas; o mais citado é o Tema 1.389, em 7), 18 temas do STF **sem repercussão geral** (21 fichas; por exemplo os Temas 1.402, 1.221 e 1.345), 1 em definição e a Súmula 359 do STF (“alterada”, em 6 fichas). Muitas dessas fichas descrevem o estado do tema (“pendente de julgamento”, “repercussão geral negada”), e as que o fazem na mesma frase já saem como históricas; o aviso é o que sobra.

**Nenhuma ficha foi editada.** Pela primeira passada, apareciam 2 alertas de súmula cancelada (Súmula 263 do STJ em `leasing-arrendamento-mercantil` e Súmula 394 do STF em `foro-prerrogativa-funcao-cf-102`). As duas fichas declaram no corpo que a súmula está cancelada e a mantêm no cabeçalho como gatilho de busca. Boni autorizou retirar as súmulas canceladas; **não havia o que retirar do catálogo**: o gerador (`build-catalog.mjs`) só leva os gatilhos ao manifesto nas fichas de Forma (`kind === 'FORM'`), e as duas são de Matéria, então a súmula cancelada nunca esteve no catálogo como gatilho. O que existe no catálogo é o aviso no corpo (“CANCELADA… não invocar”), que foi mantido, pois retirá-lo tiraria a orientação.

**O que a rodada mostrou sobre a própria conferência.** A primeira passada deu 38 alertas, e a inspeção do contexto de cada um mostrou que quase todos eram leitura errada: citação histórica não reconhecida (“com cancelamento da Súm. 512”, “supera Súm. 276”, “ex-Súm. 423”, “inconstitucional a Súm. 277”), tribunal atribuído a partir de outra citação da mesma frase (“STF (Tema 810)”, “Tema 745 … Tema 986 STJ”, “fixou no Tema 386”), lista de temas lida só pelo primeiro número (“Temas 126 e 1.072/STJ”), ano lido como tema (“Tema 944, 2021”), cancelamento parcial lido como total (TST 221 e 191), o ponto de “Súm.” tratado como fim de frase e fontes desatualizadas. Cada caso virou teste. As 124 citações históricas e a ausência de alertas dependem dessa leitura heurística da frase; o relatório lista o que não conferiu.

**Não conferido:** a tese de cada súmula e de cada tema (se a ficha atribui ao precedente o conteúdo certo); súmulas do TSE; as 1.355 citações sem tribunal declarado (só se sabe que o número existe no STJ ou no STF); e os números de processo (REsp, HC, ADI etc.), pois a extração por padrão mistura artigos de lei (“CC 1.723”) com classes processuais, e o índice do ForgeLex não tem valor de prova negativa (M3.6).

## Evidências locais

As referências aprovadas estão na pasta Downloads de Boni. O ZIP e o conteúdo das fichas são insumos de análise local. O inventário completo será gerado no workspace local ignorado pelo Git.

| Insumo             | Arquivo                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| Plano aprovado     | `ForgeLex-Plano-Detalhado-Mesa-Guiada-Habilidades-Ocultas-v2-2026-11-10.md` |
| Auditoria ForgeLex | `ForgeLex-Auditoria-Arquitetural-Mesa-Juridica-2026-11-10.md`               |
| Plano anterior     | `ForgeLex-Plano-Implementacao-Mesa-Juridica-2026-11-10.md`                  |
| Análise Rimor      | `JUIT-Analise-Reversa-REA-2026-11-10.md`                                    |
| Análise MinutaIA   | `MinutaIA-Analise-Reversa-Tecnica-REA-2026-11-10.md`                        |
| Acervo capturado   | `MinutaIA-Habilidades-Oficiais-2077-2026-11-10.zip`                         |

SHA-256 verificado do ZIP `2a0efbbc301e53c357d5fe6baac1a896c84669fc1646a62c2aec410550543d01`.

## Frente S — execução Daybreak — 14/11/2026 (America/Fortaleza)

Autorização: Boni pediu “vamos implementar!” após receber a Frente S do plano unificado.
Isso autoriza implementação e validação local, sem merge, deploy ou mudanças em produção.

### S0 — reconciliação

Base remota reconferida: `main` = `a00ffa934dbd075cba8b63142e3b61ed675cd4e5`.
PR #152 integrado nessa base; branch da fixture preservada em `/workspace/ForgeLex`.
Frente de autorização isolada em `/workspace/ForgeLex-security-auth`, branch
`fix/daybreak-authorization`, originada de `origin/main`.

Verificação: PowerShell 7.5.4 portátil em `/tmp/forgelex-pwsh`, suíte
`ops/gcp/production/deploy-from-main.tests.ps1`: **43 passaram, 0 falharam**.
Não houve chamada gcloud real nem operação de release. O helper valida projeto, ID,
status, substituições e imagem/digest; não equivale a atestação independente da origem,
configuração ou identidade do builder. IAM e estado publicado não foram inspecionados.
A lacuna de confiança além do bypass de tag permanece risco residual explícito.

Ruling: os getters dos fixes MCP e reembolso retornaram FORBIDDEN (“finding chat is
unavailable in the current workspace”). Implementar pelo código e evidência do relatório,
sem contornar a restrição e sem declarar revisão dos diffs salvos — custo: não reaproveitar
automaticamente esses fixes.

Pre-flight: S1 produz permissões usadas por S4; S2 e S3 compartilham billing-operations
mas terão mudanças financeiras separadas da fixture; S4 e S6 requerem leases entre réplicas.
Ruling: usar worktrees por subsistema e preservar a branch da fixture; acompanhar esta
execução no registro existente, conforme a regra do plano unificado, sem novo ledger.

### S1 — autorização e isolamento — validado localmente

Implementação: escopos por ferramenta MCP antes da cobrança; memo autenticado exige
`research:read` e `matter:write` independentemente do canal declarado. Contextos internos
sem metadados de autenticação conservam compatibilidade, mas o HTTP sempre fornece esses
metadados. OAuth verifica conexão/grant exato, inclusive replay e resposta final; os efeitos
persistentes verificam o grant dentro da transação sob o mesmo lock de matter usado na
revogação. Memo REST recusa tokens OAuth destinados ao MCP antes das leituras do caso.

Integrações: `credentials:read/write`, mutações só por sessão de proprietário;
`webhooks:read/write` e autorização de cada família de evento. Listas filtram destinos e
entregas não autorizados. Campos de identidade do JSON não substituem o tenant autenticado.
OpenAPI, tela de chaves e orientação de migração atualizados.

Evidências: 21 regressões falharam no código-base original; teste de corrida PostgreSQL
sem a checagem transacional gravou indevidamente um checkpoint (esperado zero), depois
passou com a correção. PostgreSQL isolado: 13/13 testes de autorização, incluindo revogação
enquanto o checkpoint espera o lock. Verificação focada final: 96 passaram, 1 teste
PostgreSQL pulado nesse comando; ele foi executado separadamente com sucesso. Build e
API typecheck aprovados; ESLint dos arquivos alterados e diff check aprovados.

A revisão independente encontrou três pontos importantes (transação, replay, metadados de
autenticação), todos corrigidos e cobertos por testes. Item menor adiado: guarda redundante
de mutação no handler GET de credenciais; não altera autorização nem dados.

Ruling: usar trabalho paralelo somente entre frentes independentes em worktrees distintas,
conforme a skill dispatching-parallel-agents; preservar implementação e revisão financeira
no coordenador. Custo observado: disputa de CPU causou timeouts de suítes gerais. As
execuções gerais redundantes foram interrompidas e a verificação completa será serial em
S8. Falhas observadas por contenção não são declaradas resolvidas antes dessa execução.

Ruling: o getter de fix não estava disponível; a correção foi desenvolvida do código-fonte
com reprodução local, sem afirmar que o diff salvo do Daybreak foi aplicado.
Ruling: manter contextos internos sem autenticação explícita como chamadas confiáveis de
servidor; contextos autenticados não podem evitar a política trocando `source`.
Custo se mal utilizado: um novo adaptador remoto deve obrigatoriamente fornecer metadados,
como os adaptadores HTTP deste patch já fazem.

Estado: sem CI remota nova, sem push, sem integração e sem publicação. A validação integrada
S8 ainda é necessária, especialmente com as alterações de worker e pagamentos.

### S2–S7 — implementação isolada e montagem para revisão

Branches locais (sem push): S1 `fix/daybreak-authorization` (`f0e2207`), S2
`fix/daybreak-payments` (`8fd899c`, inclui a base do PR #153), S3
`fix/daybreak-refunds` (`df6a52d`), S4 `fix/daybreak-webhooks` (`d53c377`), S5
`fix/daybreak-ingestion` (`c9ab7ec`), S6 `fix/daybreak-sse` (`bf22f2d`), S7
`fix/daybreak-secrets` (`b40643f`). A montagem local está em
`/workspace/ForgeLex-security-review`, branch `review/daybreak-security`, base `a00ffa9`.
Ela usa patches locais, não merge de PR. Combina registros de migração 0042/0043 e os testes
financeiros das duas frentes; as branches de implementação permanecem separadas.

**S2.** Liquidação, crédito, compra, pagamento e fatura agora compartilham a transação da
carteira. Falha de gravação desfaz o conjunto; retry recupera sem crédito duplicado.
Aprovação válida pode suceder falha; identidade ainda não persistida gera erro recuperável,
sem liberar crédito. Reconciliação não é paga automaticamente por nova notificação.
Recarga tem claim transacional antes do provedor, com CAS entre réplicas e mutex local;
Mercado Pago continua sem recarga automática habilitada.

Callbacks usam identidade canônica do recurso/estado e recibo durável da tupla autenticada.
Novas entregas exigem idade máxima de cinco minutos e futuro máximo de um minuto; aceitam
milissegundos e exemplos legados em segundos. Retry já recebido/autenticado pode ser antigo,
com cooldown de 15 segundos e lease recuperável de cinco minutos. Alterar `payload.id` ou
espaços não cria outra identidade. Não se confirma recibo quando o evento canônico ainda
está em andamento. Recibos antigos desconhecidos não são autenticados retroativamente:
retornam erro explícito e exigem recuperação operacional se forem legítimos.

Fontes do contrato consultadas via Context7: documentação Mercado Pago de notificações
Checkout Pro/Orders (ACK 200/201 em 22 segundos; retries após 15 minutos e além), Wallet
Connect/Point (timestamp em milissegundos) e exemplos legados de assinatura em segundos.
Documentação de GET Orders mostra variantes com/sem currency. Na ausência dela, só há
normalização de moeda por pagamentos explicitamente vinculados via reference_id, consultados
na API autenticada, com IDs, referência, estados, soma de valores e moedas coerentes.
Sem evidência suficiente, não se inventa BRL: mantém-se reconciliação. Não houve pagamento
ou chamada à API real do Mercado Pago.

Evidências S2: testes RED de ordenação/identidade antecipada e fatura parcial; 60 testes
financeiros focados aprovados antes da revisão; três PostgreSQL de liquidação/duas réplicas
e recarga aprovados. Correções da revisão: 48 testes S2 focados aprovados. Testes de SQLite
usam falhas reais de trigger e promises controladas; PostgreSQL usa instâncias independentes.

**S3.** Reserva recalcula lote/carteira/reservas pendentes sob lock antes da rede. Intenção
persistente e estados PREPARED, PROVIDER_PENDING, PROVIDER_SUCCEEDED, LEDGER_SETTLED,
RECONCILIATION_REQUIRED tornam resultados ambíguos recuperáveis sem devolver saldo por
suposição. Chave `refund:<request>` e valor congelados. Confirmação remota persistida permite
repetir só a parte local. Migração `billing-ledger-0011-refund-recovery` põe pedidos PENDING
antigos em reconciliação, sem fabricar retenção ou inferir ausência de efeito remoto.
Evidências: 25 casos PostgreSQL em banco novo, testes de migração, snapshot consumido,
reserva pendente, concorrência, crash antes do envio e falha local depois do sucesso remoto.
A recuperação é método explícito do serviço; não há CLI/endpoint novo nem scheduler.

**S4.** HTTPS com IP validado/fixado, hostname/TLS preservados, sem redirects e sem corpos
remotos no histórico; testes de socket, DNS e transporte controlados. Admission persistente
4 global/1 por tenant, fencing e recuperação de lease; fila provisória 1.000 global/250 por
tenant, com backpressure em enqueue/requeue. Revogar/suspender terminaliza trabalho
inviável dentro do mesmo lock de admissão; snapshots antigos de endpoints não quebram o
evento de negócio e não recriam fila inativa. Lease usa relógio da API, pressupõe relógios
sincronizados; dimensionamento operacional dos limites continua pré-requisito para habilitar.
Evidências isoladas: 31 testes, incluindo oito conexões PostgreSQL; revisão/cleanup: 15 testes.

**S5.** Teto de 1 MiB UTF-8/5.000 parágrafos antes de expansão/acesso ao banco, lotes de 250
âncoras dentro da transação; resposta completa preservada dentro do teto. HTTP 413 com
códigos estáveis; envelope JSON comporta escapes sem remover o limite de texto. Unicode,
CRLF e hashes preservados; corrigida perda de parágrafo em CR isolado. Evidências: 72 testes
API/repositório e typecheck completo. Documento acima do teto precisa ser reduzido.

**S6.** Leases persistentes: 2 por usuário/execução, 5 por usuário (entre tenants), 20 por
tenant; 100 por processo. Relógio de banco, lease 30 segundos/renovação 10 segundos.
Polling compartilhado por tenant/execução dentro de cada runtime, com autenticação e cursor
por assinante. Limpeza em encerramento/erro/revogação e backpressure de consumidores lentos.
Evidências: 28 rotas, 4 poller, 4 leases locais e 3 PostgreSQL. Réplicas compartilham limites,
mas não o poller em memória. Falha ao apagar lease conserva ocupação até expiração.

**S7.** URLs sem senha em argv; PGPASSFILE privado por filho, diretório 0700/arquivo 0600,
escape e allowlist de opções; ambientes/diagnósticos não propagam segredos de banco.
Provisionador histórico interrompe antes de ler configuração; alternativa segura documentada.
Evidências: 29 testes CLI/subprocessos reais controlados, sintaxe, lint, build e formatação dos
arquivos alterados. Não executou pg_dump/pg_restore reais. Windows falha fechado; usar Linux
ou WSL. SIGKILL/crash não garante unlink, mas o arquivo permanece protegido por permissões.

### Revisão integrada — correções importantes e decisões

Revisor independente reproduziu três problemas antes de recomendar aceite:
1. Timestamp era aparado na verificação e não no recibo: parser agora único, normalizado,
   rejeitando chaves duplicadas normalizadas.
2. Evento RECEIVED era tratado como terminado: agora retorna retry-later e o segundo
   recibo continua recuperável após falha transitória do primeiro.
3. Destinos inativos consumiam fila indefinidamente: terminalização, varredura de filas
   antigas, fencing e recusa de requeue inativo recuperam a capacidade.

RED: quatro falhas em três arquivos; regressão adicional de snapshot aposentado falhou antes
da correção. GREEN: 71 testes em quatro arquivos. O teste PostgreSQL de grant bloqueado
já havia provado RED→GREEN na revisão S1. Não houve correção baseada só em inspeção.

Ruling: preservar a resposta de ingestão completa e limitada, sem paginação nova, para não
romper os consumidores existentes; custo: até 5.000 âncoras ainda podem compor uma resposta.
Ruling: nenhuma liberação automática de retenção financeira por timeout/erro definitivo;
custo: intervenção explícita de reconciliação e procedimento operacional antes de publicação.
Ruling: conservar falha fechada em Windows em vez de criar garantia de ACL não testada;
custo: exportador exige Linux/WSL até existir suporte seguro validado.

Itens menores/residuais não corrigidos nesta frente: relógio da API nos leases S4; recuperação
de refund sem caller operacional HTTP/CLI; SSE conserva a política anterior de até três
falhas sucessivas de reautenticação antes de encerrar (pode retomar envios entre rechecagens);
atestação independente da origem/build e IAM de produção não verificados em S0.
Os limites de fila são candidatos para homologação, não medição de capacidade em produção.

### S8 — verificação local conjunta

Já aprovados: build integrado; lint; typecheck recursivo; `format:check:code`; `git diff --check`;
20 testes PostgreSQL combinando grants/locks, liquidação e limites entre réplicas; teste
PostgreSQL adicional pagamento→consumo→refund→replay; fase 7 E2E com PostgreSQL local e
Chromium do ambiente (1/1, inclui crédito exato e replay). Configuração temporária do navegador
removida depois da execução. Nenhum teste acessou provedores de pagamento reais.

`pnpm format:check` global continua falhando em 393 arquivos legados, mesma contagem observada
na base isolada; `format:check:code`, usado pela CI, passou. Não houve reformatação em massa.
Resultado final da suíte geral serial: **2.256 passaram, 27 pulados; 295 arquivos
aprovados e seis arquivos pulados**, em 453,62 segundos. Comando: `pnpm test
--maxWorkers=1 --testTimeout=30000` (inclui build). Os testes de PostgreSQL opcionais foram
executados separadamente conforme as evidências acima; os pulos não são prova de
compatibilidade com provedores reais ou de verificações em produção. PR #153 reconferido: aberto/rascunho, head `46929e9`, base `a00ffa9`.
Nenhuma CI remota nova, push, merge, publicação, migração ou alteração em produção.


### Publicação autorizada e envio remoto — 14/11/2026

Decisão de Boni: “commit, push e deploy”. Enviadas as frentes S-A a S-F em PRs
separados: #154 (autorização), #153 (pagamentos/reembolsos e fixture), #155 (webhooks),
#156 (ingestão), #157 (streams) e #158 (scripts). #153 deixou de ser rascunho.
O Git/gh local recusou autenticação; o conector GitHub publicou árvores de conteúdo
equivalentes com novos SHAs, sem sobrescrever commits remotos ou usar force-push.

CI remota iniciou nas seis frentes. Produção permanece inalterada: faltam gcloud e
credenciais Google Cloud neste ambiente. Portanto backup, migrations, candidata sem
tráfego e promoção ainda não foram executados. A autorização existe; o impedimento é
acesso técnico, não ausência de outro aprovador. Nenhum achado foi fechado no Daybreak.

## Fechamento das etapas parciais U2, U4 e U5 (16/11/2026)

Sobre `main` em `2ccdc3f`, na branch `claude/frente-u-fechar-parciais` (PR #177). Boni pediu para fechar as etapas que
estavam pela metade antes de seguir. Antes de agir, o estado real foi levantado por este registro, não pelas caixas do
plano, que estavam desatualizadas (U0 e U1 apareciam abertas, embora aceitas em 11/11 e executadas em 12/11).

**Decisões de Boni (16/11/2026).**

| Etapa | Decisão                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U2    | Dividir `AgenticWorkspaceScreen` e `DraftStudioScreen` e fechar a etapa; a lista de casos fica na U7 e o painel de fontes na V3, que já eram delas.       |
| U4    | Manter **uma peça por pedido** e fechar. Várias peças por pedido mudariam o contrato da execução e saem do escopo da U4; não se criam atalhos de teclado. |
| U5    | Entra só a leitura de Word (.docx). Identificar a peça pelo PDF e salvar o anexo como documento do caso **não entram agora**. A OCR segue na U6.          |

### O que foi feito

| Etapa | Entrega                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U5    | **Word (.docx) nos anexos**, no navegador e só o texto (DEC-12), mostrado para conferência antes do envio. Lê o corpo e as notas de rodapé e de fim; texto inserido em alterações rastreadas entra, o apagado não; caixas de texto não se repetem. O XML não é lido como documento (entidades declaradas no arquivo não são expandidas) e cada parte descompactada tem teto de 20 MB contado em fluxo, contra pacote que expande demais. Arquivo acima de 15 MB é recusado sem ser lido. `.doc` antigo recebe orientação própria. Declara `jszip` 3.10.2 em `apps/web`, a versão que o `docx` já usava no bundle. |
| U2    | `AgenticWorkspaceScreen` de 797 para 632 linhas e `DraftStudioScreen` de 916 para 809, com apresentação e modelo em `apps/web/src/desk/` (`ConversationHistory`, `ConversationParts`, `SupportingSurface`, `DraftStudioParts`, `draft-studio-model`). O JSX foi movido sem alterar o resultado no DOM.                                                                                                                                                                                                                                                                                                            |
| U4    | Sem código novo: o conjunto entregue em 12/11 (voltar, alterar, excluir conversa e peça com Desfazer, chips de matéria como dica, auditoria) é o fechamento, com uma peça por pedido.                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Limite honesto da U2.** A divisão é de **apresentação**. O estado e os fluxos assíncronos (que se entrelaçam por refs e
por tickets de seleção) continuam dentro dos dois componentes. Não é a divisão em componentes pequenos que o plano
descreve; é a que se conseguiu sem mudar comportamento, medida pelas suítes abaixo. Extrair a lógica, não só o JSX, é
outra etapa e exige refatorar os fluxos com cobertura própria.

### Adiado, com dono

| Item                                                                                                                                                     | Onde fica                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Lista de casos na coluna esquerda da Mesa                                                                                                                | U7 (DEC-14)                                                                                    |
| Painel de fontes à direita (hoje as fontes abrem em diálogo)                                                                                             | V3 (abas Texto, Fontes e Revisão)                                                              |
| Várias peças por pedido                                                                                                                                  | Decisão de produto futura, junto de um modelo de pedido novo                                   |
| Atalhos de teclado além do Esc                                                                                                                           | Desenho (conflito com o botão voltar do navegador e o desfazer de texto); sem etapa            |
| Aviso "ainda não há apoio específico" quando peça ou matéria não têm ficha elegível (critério da U3)                                                     | **Resolvido para a peça em 17/11/2026** (seção abaixo); a matéria segue sem aviso                 |
| Chips de área, tribunal e peça no compositor (hoje só no resumo do pedido)                                                                               | U7 e V3                                                                                        |
| Identificar a peça pela leitura do PDF                                                                                                                   | Aberto: precisa de campo próprio no contrato, para o servidor não devolver o anexo como pedido |
| Salvar o anexo como documento do caso                                                                                                                    | Depende da U7                                                                                  |
| Funções do editor avulso removidas na U1 (várias seções, painéis de tese e citação, adoção de texto da IA, histórico de conferências, salvar-e-conferir) | Continuam sendo decisão de produto de Boni, como registrado na U1                              |

### Verificação

| Item                              | Resultado                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest do web                     | 47 arquivos e 284 testes aprovados. O leitor de Word tem 23 testes (inclui ida e volta com o exportador do produto), com mutações conferidas; as duas que sobreviveram eram equivalentes e uma ganhou teste. `attachments.test.ts` cobre Word por MIME, vazio, erro, cancelamento e 15 MB.            |
| Tipos, ESLint, Prettier           | Tipos do web sem erros; ESLint limpo em `desk`, `documents` e `agentic-workspace`; `format:check:code` aprovado. `DraftStudioScreen.tsx` está no `.prettierignore` e não foi reformatado.                                                                                                             |
| Playwright, estado-base           | Rodado **antes** de refatorar: `writing-desk` 38 aprovados e 1 falho; `desk-shell` 30 e 1; `desk-guidance` 6; `desk-guidance-v3` 6; `desk-research` 2; `desk-review` 3; `desk-save-recovery` 4; `desk-procedure` 3; `desk-pilot` 4; `attachments` 4; `agentic-workspace` 25.                          |
| Playwright, depois das duas telas | **Idêntico** ao estado-base, suíte por suíte, depois de cada tela. A única falha é a mesma nos dois momentos: `writing-desk.spec.ts:290`, em que o download do Word chega com o nome `download` em vez de `*.docx` neste ambiente. A CI passa esse spec em `main`; a causa local não foi investigada. |
| Playwright, Word                  | `attachments` passou de 2 para 4 cenários: leitura real de um `.docx` com nota de rodapé, o texto seguindo com o pedido sem o arquivo, e um pacote corrompido com erro legível. O cenário "estados" trocou o `.docx` falso por um `.doc` legado.                                                      |
| CI                                | Os commits intermediários do PR passaram na CI.                                                                                                                                                                                                                                                       |

### Achado: suítes da Mesa fora da CI

Nove suítes Playwright **não rodam na CI**: `attachments`, `desk-shell`, `desk-guidance`, `desk-guidance-v3`,
`desk-pilot`, `desk-procedure`, `desk-research`, `desk-review` e `desk-save-recovery`. Várias cobrem recursos já ativos em
produção (orientação guiada, v3, salvamento recuperável). Elas só protegem contra regressão na máquina de quem as roda.
**Resolvido em 17/11/2026** pelo job `e2e-desk` (PR #178): as nove suítes rodam em paralelo ao `e2e-product`, cada uma em passo próprio, em cerca de 4 minutos. Passou na primeira execução na CI, inclusive o `desk-shell`, o que confirma que a falha local do download do Word é específica do ambiente. Foi **uma** execução: o job não é verificação obrigatória e só deve virar depois de algumas execuções verdes seguidas (decisão de Boni, na proteção de branch).

Reversão: reverter os commits do PR #177; o leitor de Word fica atrás da flag de anexos
(`VITE_FORGELEX_ATTACHMENTS_ENABLED`), desligada por padrão.

## U6 — OCR no navegador (17/11/2026)

Sobre `main` em `27d0329`, na branch `claude/u6-ocr` (PR #179). Boni pediu a U6 depois de fechar as parciais. Atrás de
`VITE_FORGELEX_OCR_ENABLED`, **desligada por padrão**, e só vale com os anexos ligados (`OCR_ENABLED` em
`site-capabilities.ts`). Nada foi publicado nem ligado.

### O que foi feito

Um PDF só de imagem ou uma imagem anexada passa a oferecer "Reconhecer texto (OCR)", dizendo que a leitura é feita no
navegador. O motor é o Tesseract.js 7.0.0 (Apache-2.0), só o LSTM, em português, **no navegador, sem enviar o arquivo
ao servidor** (DEC-13). Durante o reconhecimento há andamento por página, botão Cancelar e o envio fica bloqueado. O
texto fica marcado "Reconhecido por OCR — conferir" (com a confiança média), é **editável** antes do envio e segue para a
IA rotulado `texto reconhecido por OCR; pode conter erros de leitura`. PDF com mais de 20 páginas é **recusado** antes de
gastar tempo, em vez de reconhecer só uma parte e entregar um texto incompleto sem o cliente notar.

| Peça                       | Onde                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orquestração               | `apps/web/src/ocr/ocr-document.ts`: abre o PDF ou a imagem, reconhece página por página, junta, limita e cancela; motor, PDF e imagem entram por injeção e são carregados sob demanda.     |
| Motor e fontes de imagem   | `tesseract-engine.ts` (Tesseract.js) e `browser-sources.ts` (páginas do pdf.js em canvas a cerca de 200 dpi; imagens reduzidas a 4.000 px no lado maior).                                  |
| Arquivos do motor          | `apps/web/ocr-assets-plugin.ts`: worker, núcleo WebAssembly (três variantes LSTM, conforme o suporte a SIMD) e idioma `por` (`4.0.0_best_int`, 1,4 MB), servidos de **`/ocr/`**, mais `NOTICE.txt`. |
| Anexos                     | `use-attachments.ts` (reconhecer, cancelar, editar), `AttachmentChips.tsx` e `attachments.ts` (rótulo no contexto, oferta só para PDF ou imagem sem texto, espaço de edição).               |
| Flag ponta a ponta         | `site-capabilities.ts`, `Dockerfile`, `cloudbuild.yaml`, `deploy-lib.ps1`, `deploy-from-main.ps1 -OcrEnabled`, `dev-mesa.mjs`, README de `ops/gcp/production`.                              |
| Servidor                   | `static-web.ts`: arquivo ausente em `/ocr/` responde 404, nunca a página inicial (o worker a executaria como script).                                                                      |
| Fixtures                   | `scripts/generate-ocr-fixtures.mjs` gera `tests/e2e/fixtures/ocr/` (PDF de 2 páginas só imagem, PNG com texto, página em branco e PDF de 21 páginas); a geração é determinística.            |

**Decisões técnicas desta etapa (minhas, para Boni rever).** Idioma `best_int` (1,4 MB) em vez do pacote com o motor
legado (6,7 MB). Arquivos servidos da nossa origem, não do CDN que a biblioteca usa por padrão: o arquivo do cliente não
sai do navegador, e as requisições de OCR também não vão a terceiros. Os arquivos só entram na imagem quando o OCR está
ligado no build (com a flag desligada `dist/` tem 3,2 MB; ligada, 16 MB). `tesseract.js: false` em `allowBuilds`: o
script de instalação do pacote é só um aviso de financiamento. O PDF "só imagem" passou a ter um código (`PDF_NO_TEXT`) no
leitor existente, para os anexos o tratarem como "sem texto extraível" e não como "Erro na leitura"; a mensagem do leitor,
usada também na tela de casos, não mudou.

### Medição de tempo (define o limite de páginas)

Chromium headless, Xeon de 2,1 GHz com 4 vCPU virtuais, motor real:

| Caso                                              | Resultado                                                       |
| ------------------------------------------------- | --------------------------------------------------------------- |
| Página densa A4 (1652×2336 px, ≈2.700 caracteres) | **4,6 a 5,0 s** por página; 2.702 caracteres reconhecidos       |
| Página de poucas linhas                           | cerca de 0,8 s                                                  |
| Imagem de uma página, com a carga do motor        | 1,4 s                                                           |
| PDF de 2 páginas, com a carga do motor            | 3,1 s                                                           |
| Carga do motor (worker, núcleo e idioma)          | cerca de 0,8 s a frio                                           |

Limite escolhido: **20 páginas** (cerca de 95 s no pior caso aqui, com cancelamento a qualquer momento) e 15 MB por
arquivo. O tempo em um notebook de cliente pode ser menor ou maior; o limite está em `OCR_MAX_PAGES`.

### Verificação

As 11 suítes da Mesa foram rodadas no Chromium **depois** das mudanças e comparadas com o estado-base de 16/11/2026
(antes da refatoração das telas): resultado **idêntico, suíte por suíte**, com uma única diferença esperada.

| Suíte                | Estado-base         | Depois da U6                                   |
| -------------------- | ------------------- | ---------------------------------------------- |
| `writing-desk`       | 38 aprovados, 1 falho | 38 aprovados, 1 falho (o mesmo)               |
| `desk-shell`         | 30 aprovados, 1 falho | 30 aprovados, 1 falho (o mesmo)               |
| `desk-guidance`      | 6                   | 6                                              |
| `desk-guidance-v3`   | 6                   | 6                                              |
| `desk-research`      | 2                   | 2                                              |
| `desk-review`        | 3                   | 3                                              |
| `desk-save-recovery` | 4                   | 4                                              |
| `desk-procedure`     | 3                   | 3                                              |
| `desk-pilot`         | 4                   | 4                                              |
| `attachments`        | 4                   | **9** (os 5 cenários novos de OCR)             |
| `agentic-workspace`  | 25                  | 25                                             |

A falha é a mesma nos dois momentos, `writing-desk.spec.ts:290` (o download do Word chega com o nome `download` neste
ambiente; a CI passa esse spec em `main`).

| Item                    | Resultado                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest completo         | 306 arquivos e 2.518 testes aprovados, 40 ignorados (PostgreSQL), nenhum falho.                                                                                                                                |
| Orquestração do OCR     | 18 testes. **14 mutações, todas mortas**: três sobreviveram na primeira rodada (página renderizada depois do cancelamento, progresso que regride, motor não encerrado na hora) e ganharam teste próprio.      |
| Playwright, anexos      | 9 cenários com o **motor real**: PDF escaneado reconhece, edita e segue com o pedido; imagem; página em branco; PDF de 21 páginas recusado; cancelar volta ao estado anterior e bloqueia o envio.                |
| Requisições             | No Chromium, nenhuma requisição de OCR saiu da origem (CDN, dados de idioma); só `/ocr/…`.                                                                                                                     |
| Build                   | Pacote principal 473.908 B sem a flag e 473.921 B com ela (**+13 B**); o motor é um chunk de 833 B carregado sob demanda e a carga inicial é só o pacote principal. O validador do Dockerfile aprova os dois. |
| Dependências            | `pnpm audit --prod`: só um aviso baixo, em `fast-xml-parser` da API, sem relação; `check-build-audit` limpo.                                                                                                   |

### Aberto, para decisão de Boni

- **Qualidade em documentos reais.** O último item do plano ("medir qualidade em documentos reais autorizados por Boni;
  só então avaliar OCR no servidor") **não foi feito**. Todos os arquivos medidos são sintéticos e limpos, o melhor caso do
  OCR; não se sabe a taxa de erro em digitalizações de verdade (ruído, inclinação, carimbos, manuscrito). **Por isso a U6
  está pronta no código, mas a flag deve continuar desligada** até essa medição. OCR no servidor só entra depois, em decisão
  própria sobre custo e retenção.
- **Licença do pacote de idioma.** O `NOTICE.txt` traz o texto das duas licenças Apache-2.0 do código e, para o idioma,
  uma **declaração de origem** (pacote `@tesseract.js-data/por`, MIT; modelos do projeto Tesseract, Apache-2.0), não o texto
  de uma licença. Boni deve conferir.
- **Balanceador.** O servidor da aplicação não define política de segurança de conteúdo, mas o balanceador não foi lido.
  Se houver uma lá, ela precisa permitir worker `blob:` e WebAssembly (`wasm-unsafe-eval`).
- **Cache local.** O Tesseract.js guarda os dados de idioma (públicos, não o documento) no IndexedDB do navegador.
- **PowerShell.** Não havia `pwsh` aqui: as mudanças em `deploy-lib.ps1`, `deploy-from-main.ps1` e seus testes só são
  exercitadas pela CI.

Reversão: manter a flag desligada, ou reverter os commits do PR #179.

## Aviso "ainda não há apoio específico" (17/11/2026)

Sobre `main` em `5ddffd1`, na branch `claude/aviso-sem-apoio`. Fecha a promessa que a U3 deixou para a U4 e que o
fechamento de 16/11 registrou como aberta: quando não há ficha de apoio para a peça, a Mesa passa a **dizer isso** em vez de
seguir como pedido livre sem avisar. Nenhuma flag nova e nenhuma mudança de contrato; vale onde a orientação mesa-v3 já vale.

**Como funciona.** Na mesa-v3, se nenhuma peça do catálogo serve para propor, a Mesa pede uma explicação em texto livre; se,
com o texto, ainda não há candidata, o pedido segue como livre. O navegador recebe essa decisão com `value` nulo e o que o
cliente digitou em `detail`. Agora, nesse caso, o resumo do pedido mostra, abaixo da linha de resumo:

> Ainda não temos orientação específica para esta peça. Vamos seguir com o seu pedido como está; confira o resultado com atenção.

| Situação                                                              | Aviso |
| --------------------------------------------------------------------- | ----- |
| O cliente explicou a peça em texto e nenhuma do catálogo serviu       | sim   |
| O cliente respondeu "Não sei" (ainda não descreveu nada)              | não   |
| Há peça proposta ou confirmada                                        | não   |
| A peça nunca foi perguntada, ou a conversa não é mesa-v3              | não   |

A regra é `guidanceSupportNote` em `apps/web/src/agentic-workspace/guidance-model.ts`, o texto é a constante
`GUIDANCE_NO_SUPPORT_NOTE` (ajustar a redação é mexer só ali) e a exibição está em `GuidanceSummary.tsx`.

**Redação.** O texto é proposta minha; Boni escolheu seguir com ele ao escolher a frente, e pode trocá-lo.

**Não coberto.**

- **Matéria sem ficha elegível.** O critério da U3 falava em "peça ou matéria". Só a peça foi tratada. Para a matéria, os
  chips sugeridos (`MatterChips`) simplesmente não aparecem quando não há sugestão, e a Mesa não diz nada.
- **Regras mesa-v1 e mesa-v2.** Usam a tabela fixa de peças e não propõem peças do catálogo; não têm esse caso.
- **Detalhe cosmético que já existia.** Quando o texto digitado termina em ponto, o resumo mostra "…formandos., a
  confirmar". Vem de `guidanceDecisionText` e não foi alterado.

**Verificação.**

| Item          | Resultado                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest do web | 48 arquivos e 314 testes aprovados; 6 testes novos da regra. **5 mutações, todas mortas** (avisar fora da v3, com "Não sei", com peça proposta, sem a peça perguntada, e nunca avisar). |
| Playwright    | `desk-guidance-v3`: 8 cenários na pilha real, 2 novos (aviso quando nenhuma peça serve, com texto acessível e sem violação de acessibilidade; sem aviso com "Não sei").                 |
| Regressão     | `desk-guidance` 6, `desk-pilot` 4, `desk-procedure` 3 aprovados; `desk-shell` 30 aprovados e 1 falho, a mesma falha anterior (download do Word neste ambiente).                          |
| Qualidade     | ESLint, Prettier (escopo da CI) e tipos limpos.                                                                                                                                         |

Reversão: reverter o commit; não há flag, e o efeito é só um parágrafo no resumo.

## V0 — Tokens de cor sem mudança visual (17/11/2026)

Sobre `main` em `8d53ad0`, na branch `claude/v0-tokens`. Boni retomou a V0, que a reconciliação de 12/11 tinha adiado. Toda cor do app passa a vir de variáveis CSS, e o tema `classico` guarda nelas os mesmos valores de sempre. Nenhuma flag nova e nenhum tema novo: o que muda é onde a cor mora, para a V1 poder trocar um bloco só.

### O que foi feito

- **`apps/web/src/index.css`.** Um bloco `:root` com 51 variáveis `--fl-*`, cada uma em "R G B" para o Tailwind compor a transparência: `ivory` 50–300, `cognac` 50–900 (sem o 300, que nunca existiu), `stone` 50–950 (os 11 tons), os tons usados de `amber` e `emerald`, mais `champagne`, `canvas`, `canvas-deep`, `surface`, `surface-muted`, `ink`, `muted`, `danger`, `placeholder`, `scrollbar-thumb` e duas cores de sombra. As variáveis antigas `--forgelex-*` continuam, agora derivadas. Os 23 hexadecimais e as `rgba(...)` literais do arquivo viraram `rgb(var(--fl-x) / alfa)`.
- **`apps/web/tailwind.config.js`.** `ivory`, `cognac`, `champagne`, `stone`, `amber` e `emerald` apontam para `rgb(var(--fl-x) / <alpha-value>)`; as sombras `card` e `card-hover` têm a cor por variável. Os 16 nomes semânticos da seção 7.1 do plano existem: `canvas`, `surface`, `surface-muted`, `line`, `line-control`, `ink`, `ink-soft`, `muted`, `subtle`, `accent`, `accent-strong`, `accent-soft`, `ok`, `warn`, `danger` (e `canvas-deep`, para o fundo atrás da página do editor, que não estava na tabela).
- **17 arquivos `.tsx`.** As 45 cores literais (`bg-[#FBF9F5]`, `bg-[#FDFBF7]`, `bg-[#F1EEE8]`, `text-[#FBF9F5]`) viraram `bg-canvas`, `bg-surface-muted`, `bg-canvas-deep` e `text-canvas`. O plano falava em 48; o número atual é 45.
- **`apps/web/src/theme-tokens.test.ts`** (8 testes). Trava o tema clássico nos valores de antes (cada tom, a transparência das bordas, as sombras, os nomes semânticos) e impede o retorno de hexadecimal literal em qualquer `.ts`, `.tsx` ou `.css` da interface.

**Mapeamento semântico provisório.** No tema clássico cada nome aponta para a cor que a interface já usa naquele papel (`accent` = `cognac-600`, `ink-soft` = `stone-700`, `subtle` = `stone-500`, `ok` = `emerald-700`, `warn` = `amber-700`, `line` e `line-control` = a borda `champagne-border`). Nenhuma classe usa esses nomes ainda, exceto `canvas`, `surface-muted` e `canvas-deep`. A V1 revisa o mapeamento junto com a tabela de tons legados.

### Fora da V0, de propósito

- **Leitor de decisão e leitor do MCP** (`decision-reader.css`, `mcp-reader.css`). Já têm tema próprio por variáveis `--reader-*`, com versão escura. A V3 os revisa.
- **`documents/draft-print.ts`.** Monta a página de impressão, um documento à parte que não carrega o CSS do app.
- **Páginas estáticas de `public/legal/*.html`.** Têm CSS próprio com cores literais. Ficam para a V2 (site público).

### Verificação

| Item | Resultado |
| ---- | --------- |
| CSS gerado | Tailwind compilado antes e depois e comparado regra a regra, com variáveis e transparência resolvidas: 739 regras antes, 741 depois. As únicas diferenças são as 4 classes arbitrárias que viraram 5 utilitários de mesmo valor e uma regra `.border-subtle` sem uso (o nome semântico `subtle` casa com o trecho `border-subtle` de `border-champagne-border-subtle`; nenhum elemento a usa). O comparador foi testado: mudar uma unidade em um canal de `stone-600` ou de `cognac-600` faz a diferença aparecer. |
| Estilos nas telas | 22 telas (10 públicas e 12 autenticadas) em 1440 px e 390 px, 44 capturas. Para cada elemento, cor do texto, fundo, as quatro bordas, contorno, sombra, decoração, cursor, preenchimento, traço e imagem de fundo: **idênticos antes e depois**, sem uma diferença. |
| Pixels | 38 das 44 capturas idênticas byte a byte. As 6 restantes (Casos, Revisão e Segurança da conta, nos dois tamanhos) diferem em horário e no e-mail sintético sorteado a cada subida do ambiente, conferido por recorte. |
| Vitest do web | 49 arquivos e 322 testes aprovados (+1 arquivo e +8 testes). **6 mutações no teste novo, todas mortas** (um canal de `stone-600`, a transparência de `champagne-border`, hexadecimal em `.tsx`, nome semântico removido, hexadecimal em `index.css`, a transparência da sombra). |
| Playwright | `public` 17 aprovados. `desk-shell` 30 aprovados e 1 falho; `draft-review` 4 aprovados e 1 falho. As duas falhas são o download do Word deste ambiente (nome `download`, sem `.docx`) e a de `draft-review` falha igual em `main`, conferida com as alterações guardadas. |
| Qualidade | ESLint, Prettier e tipos limpos. |

**Armadilha encontrada.** A primeira comparação deu 44 de 44 telas diferentes: o servidor de desenvolvimento tinha lido o `tailwind.config.js` antigo e tratava `bg-canvas` como classe desconhecida (fundo transparente). Depois de reiniciar o ambiente tudo bateu. Regra: **mudou o `tailwind.config.js`, reinicie `pnpm dev:mesa`**.

### Não coberto

- Telas que exigem dados (Mesa com peça aberta, leitor de decisão, Casos com um caso aberto) não foram capturadas. Para elas vale a comparação do CSS inteiro, que é exaustiva para as classes, mais as suítes de Playwright.
- A referência de screenshots para a V1 ficou só na máquina da sessão, fora do Git, como o plano pede; o container é descartável. Quem for fazer a V1 deve recapturar antes de mexer.

### Achado, sem correção

`border-cognac-300` aparece em 7 lugares (`EvidenceChangesPanel`, `EditorialReviewPanel`, `SideTable`, `EvidenceReviewPanel`, `MatterWorkspaceScreen`, `ResearchDeskScreen`, `CreditsScreen`), mas o `cognac` nunca teve o tom 300. A classe não gera regra e a borda fica na cor padrão. Corrigir mudaria o visual, então a V0 deixou como está; a V1 decide o tom ao mapear os legados.

Reversão: reverter o commit. Sem flag, sem migração e sem efeito sobre o que já foi publicado.

## V1 · preparação: ferramenta de referência visual versionada (17/11/2026)

Sobre `main` em `7d77775`, na branch `claude/v1-captura`. É o primeiro passo da V1 que propus ao fechar a V0: a captura de telas e a comparação que usei na V0 viviam só no container da sessão. A V1 troca cores de propósito e tem de provar que o tema `classico` não mudou; as V2 a V7 vão precisar da mesma prova. Nenhum código do app mudou nesta etapa.

### O que foi feito

- **`scripts/visual-baseline.mjs`** (`pnpm visual:baseline`). Dois comandos:
  - `capture --out <pasta>` sobe um ambiente novo (`scripts/dev-mesa.mjs`, que exige `pnpm build`), abre 26 telas em 1440 px e 390 px e grava, por tela, a imagem e o estilo computado de todos os elementos (cor do texto, fundo, as quatro bordas, contorno, sombra, decoração, cursor, preenchimento, traço, cor de destaque e imagem de fundo). A V1 acrescentou a tipografia (família, peso, tamanho, altura de linha e espaçamento de letras) e o raio, para provar que o tema `classico` também não mudou de fonte. Encerra o ambiente no fim. `--only <trecho>` limita as telas; `--origin` e `--api` reaproveitam um ambiente já aberto.
  - `compare <antes> <depois>` aponta tela, elemento, propriedade e os dois valores de cada diferença de estilo, e conta os pixels diferentes de cada imagem. `--styles-only` ignora as imagens, para quando a mudança de visual é de propósito. Sai com código 1 se houver diferença.
- **As 26 telas.** As 10 do site público, as 12 autenticadas que não dependem de dados e as 4 que ficaram sem referência na V0, agora criadas pela API do ambiente sintético com nomes fixos: **Mesa com peça aberta**, **leitor de decisão** (pesquisa salva aberta em "Pesquisa e fontes"), **Casos com caso aberto** e **leitor de documento** do caso.
- **`scripts/visual-baseline-lib.mjs`** e seu teste (12 testes). A parte sem navegador: roteiro de telas, normalização do que muda a cada execução, comparação de estilos e leitura da saída do ambiente.

### Como a captura fica igual de uma execução para outra

Antes de capturar, a ferramenta troca por valores fixos o que o ambiente muda sozinho: data e hora, o e-mail sintético sorteado, identificadores (UUID) e a porta local (que aparece nos exemplos de uso da API). Espera as fontes carregarem e dois quadros pintados, desliga animações e esconde o cursor de texto.

### Verificação

| Item                 | Resultado                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest dos scripts   | 18 arquivos e 162 testes aprovados; 12 são da ferramenta nova (normalização de data, hora, e-mail, UUID e porta, sem tocar em valores e contagens; comparação de estilos; leitura do ambiente). |
| Estabilidade         | Duas capturas completas, cada uma em ambiente novo: **52 imagens idênticas byte a byte e estilos idênticos**, incluindo as 4 telas com dados.                                                  |
| Sensibilidade        | Mudar 1 unidade em um canal de `--fl-cognac-600` e capturar de novo: a comparação acusa 1005 diferenças de estilo, cada uma com elemento e propriedade, e 49 das 52 imagens (diferença de canal 1). |
| Qualidade            | Prettier limpo nos três arquivos novos.                                                                                                                                                        |

### Três armadilhas encontradas e tratadas

- **Dados que mudam sozinhos.** A primeira comparação entre duas capturas dava diferença em horário, no e-mail sintético e na porta da API escrita na tela de Conectar e no site de desenvolvedores. Virou a normalização acima, com teste.
- **Corrida de fontes no desktop.** Mesmo com os estilos idênticos, 26 imagens de 1440 px saíam com diferença de até 96 em um canal, em quase toda página, e as de 390 px não. Esperar `document.fonts.ready` e dois quadros resolveu: depois disso, 52 de 52 idênticas.
- **Processo sobrando.** O ambiente deixava o Vite vivo ao encerrar (o `dev-mesa` o inicia por um `pnpm` e encerra só o `pnpm`), e as portas iam subindo de 3401 para 3404 e além. A ferramenta agora encerra o grupo de processos inteiro; conferido sem sobras depois da captura.

### Uso nas etapas seguintes

```bash
pnpm build
pnpm visual:baseline capture --out <pasta-antes>   # com o código de antes (main)
pnpm visual:baseline capture --out <pasta-depois>  # com a mudança
pnpm visual:baseline compare <pasta-antes> <pasta-depois>
```

Cada captura leva uns 4 minutos. Para a V1 com o tema `classico` o critério é zero diferença; para o tema `gelo`, `--styles-only` mostra o que mudou de cor, elemento a elemento.

### Não coberto

- **Reaproveitar um ambiente aberto não é reprodutível.** Repetir a captura no mesmo ambiente acumula atividade e rascunhos e muda as telas. Para uma referência, use sempre o ambiente novo (o padrão).
- **Estados que não são capturados:** passar o mouse e foco, a Mesa durante uma execução, mensagens de erro, a lista de conversas com histórico, e qualquer tela atrás de uma flag desligada no ambiente de desenvolvimento.
- **Só Chromium.** Firefox e Safari não são comparados.
- **A imagem não prova a cor sozinha.** O estilo computado é a prova de cor; a imagem pega o que o estilo não mostra (posição, tamanho, texto).
- **Imagens fora do Git.** A ferramenta é versionada; as capturas, não. Guarde cada uma enquanto a etapa durar.

Reversão: reverter o commit. Nada do app depende da ferramenta.

## V1 — Tema gelo, fontes e primitivos (17/11/2026)

Sobre `main` em `2e02e6d`, na branch `claude/v1-tema-gelo`. O tema gelo entra como um bloco de variáveis, desligado: o padrão continua sendo o clássico, o build de produção sai como antes e nada foi publicado. Esta etapa não toca nas telas, só no que as cores, as fontes, os raios e o foco leem.

### O que foi feito

- **Tema gelo em `index.css`.** O bloco `[data-theme="gelo"]` redefine todas as variáveis do `:root` (tons legados, papéis semânticos, bordas de controle, fontes, raios e foco) com os valores da seção 7.1. Um teste exige que ele cubra todas, sem herdar nenhuma. Os papéis semânticos da 7.1 ganharam variável própria (`--fl-accent`, `--fl-ink`, `--fl-line-control`...); no clássico valem a cor que a interface já usava, no gelo a da tabela.
- **Escolha do tema antes da primeira pintura.** Um script no `<head>` do `index.html` lê `VITE_FORGELEX_THEME` e põe `data-theme` no `<html>`. Valores: `classico` (padrão; também vale se a variável não existir ou tiver outro valor), `gelo` (fixo) e `previa` (clássico, mas `?tema=gelo` troca e fica guardado em `localStorage`, com `?tema=classico` para voltar; é a prévia de homologação). Em produção, com `classico`, o parâmetro e o armazenamento não mudam nada. O gelo pré-carrega só a Inter 400.
- **Fontes no próprio site (DEC-3).** Inter 400, 500 e 600 e Spectral 400, 500 e 600, só o subconjunto latino, em `apps/web/public/fonts` (6 arquivos `woff2`, de 21 a 24 KB, 137 KB no total), com `font-display: swap` e as licenças OFL ao lado. As famílias se chamam `ForgeLex Inter` e `ForgeLex Spectral`, para não disputar com as fontes do clássico. O servidor trata `/fonts/` como arquivo estático: fonte ausente é 404, nunca a página inicial.
- **Primitivos só com tokens semânticos.** `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.input-control`, `.surface`, `.surface-subtle`, foco e barra de rolagem usam só variáveis semânticas. Surgiram `.seal` (verificada) e `.seal-gap` (lacuna), sem uso até a V3; o Tailwind não os emite antes disso. Borda de botão secundário e de campo, foco e raios mudam por tema: no gelo, `line-control` sólido (3:1), foco de 2 px, raio de 10 px nos controles e 18 px nos cartões.
- **Medidor de contraste (`scripts/theme-contrast.mjs`, `pnpm theme:contrast`).** Lê as classes de texto e fundo que o código usa, mede cada par em cada tema e sai com código 1 se um par que o clássico cumpre deixar de ser cumprido em outro tema. Entrou na CI, depois dos testes unitários.
- **Ferramenta de referência visual (`--axe`).** `visual-baseline.mjs capture --axe` roda o axe (WCAG 2.0 e 2.1, A e AA) em cada tela. A captura também grava agora tipografia (família, peso, tamanho, altura de linha, espaçamento) e raio.
- **Body do `index.html`** usava `bg-[#FBF9F5]`, que a V0 não alcançou; virou `bg-canvas`.

### Tons legados no gelo (proposta minha)

A tabela 7.1 do plano só define os papéis semânticos. Os tons legados, que as classes atuais ainda usam, precisavam de equivalente; esta é a minha proposta, e Boni pode trocar qualquer linha (cada uma é uma variável e um teste).

| Tom                   | Clássico  | Gelo      | Papel no gelo                      |
| --------------------- | --------- | --------- | ---------------------------------- |
| ivory 50              | `#FCFBF8` | `#F7FAFB` | superfície suave                   |
| ivory 100             | `#F8F6F0` | `#F4F7F8` | fundo da aplicação (`canvas`)      |
| ivory 200             | `#F2EFE8` | `#EDF2F4` | área secundária                    |
| ivory 300             | `#E7E2D6` | `#E2E8EB` | divisória                          |
| cognac 50             | `#FDF8F3` | `#F5F9FA` | destaque muito claro               |
| cognac 100            | `#F9EDE0` | `#F0F6F7` | `accent-soft`                      |
| cognac 200            | `#F2D7BF` | `#D2E3E7` | destaque claro                     |
| cognac 400            | `#B87A3E` | `#2F7A8E` | ícone e destaque médio (4,5:1)     |
| cognac 500            | `#9C6A36` | `#1F7085` | anel de foco                       |
| cognac 600            | `#8E5D2A` | `#0F5C6E` | `accent`                           |
| cognac 700            | `#73481D` | `#0B4552` | `accent-strong`                    |
| cognac 800            | `#5A3716` | `#083642` | texto de destaque                  |
| cognac 900            | `#3D240E` | `#05252E` | texto de destaque escuro           |
| champagne borda       | `#B4966E` a 22% | `#7B96A4` a 22% | dá `#E2E8EB` sobre o branco |
| champagne claro       | `#F4EDE2` | `#EDF3F5` | realce suave                       |
| stone 50 a 100        | `#FAFAF9`, `#F5F5F4` | `#F7FAFB`, `#EEF2F4` | superfícies          |
| stone 200 a 300       | `#E7E5E4`, `#D6D3D1` | `#E2E8EB`, `#C9D2D7` | linhas                |
| stone 400             | `#A8A29E` | `#96A2A9` | ícone decorativo                   |
| stone 500 a 600       | `#78716C`, `#57534E` | `#67727A`, `#4C585F` | `subtle`, `muted`    |
| stone 700 a 900       | `#44403C`, `#292524`, `#1C1917` | `#2A363C`, `#1A2428`, `#101619` | `ink-soft`, texto, `ink` |
| stone 950             | `#0C0A09` | `#080C0E` | texto mais escuro                  |
| emerald 50, 200, 300  | `#ECFDF5`, `#A7F3D0`, `#6EE7B7` | `#EEF7F2`, `#BDE0CD`, `#8FCAAC` | fundos do selo   |
| emerald 600, 700, 800 | `#059669`, `#047857`, `#065F46` | `#287759`, `#1F6B4C`, `#175439` | `ok` em 700      |
| amber                 | padrão do Tailwind | igual | `warn` não muda de tema (decisão do plano) |

### Verificação

| Item                       | Resultado                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clássico inalterado        | Captura de 52 imagens (26 telas, dois tamanhos, incluindo as 4 com dados) antes e depois: **estilo de todos os elementos idêntico, com cor, tipografia e raio, e as 52 imagens idênticas byte a byte**.                                          |
| Gelo e acessibilidade      | axe em 52 telas: **nenhuma violação**, no gelo e no clássico.                                                                                                                                                                                   |
| Contraste                  | 101 pares distintos usados no código. Abaixo de 4,5:1: **14 no clássico e 9 no gelo**; nenhum par que o clássico cumpre deixa de ser cumprido no gelo. Os valores da tabela 7.1 foram reproduzidos pelo script (por exemplo `ink` sobre `canvas` 16,95:1, `subtle` sobre branco 4,92:1, `ok` sobre branco 6,43:1). |
| Testes novos               | `theme-tokens` 27 (valores dos dois temas, completude do gelo, fontes, primitivos, sem literais), `theme-script` 7 (o script do `index.html` executado de verdade para cada valor da variável), `static-web` +1 (`/fonts/`), duas asserções novas no teste do Dockerfile, `theme-contrast-lib` 15, `visual-baseline-lib` 15. |
| Suíte completa             | 310 arquivos e 2589 testes aprovados (40 pulados, que exigem PostgreSQL). ESLint, Prettier e tipos limpos. O build de produção copia as fontes para `dist/fonts` e escreve o valor da variável no `index.html`.                                  |
| Playwright                 | `public` 17 aprovados; `desk-shell` 30 aprovados e 1 falho, o download do Word deste ambiente, igual ao de `main`.                                                                                                                              |

Os 9 pares ainda abaixo de 4,5:1 no gelo são ícones decorativos (`stone-400` sobre campo, `amber-600`, `emerald-300`) e artefatos do medidor (`text-white` numa lista de classes cujo fundo está no elemento pai). Nenhum é texto lido.

### Decisões que ficam com Boni

- **Tons legados do gelo.** A tabela acima é proposta minha. A V2 e as seguintes migram as classes para os nomes semânticos, e os tons legados somem na V7.
- **Fontes do clássico.** O Google Fonts continua sendo pedido pelo `index.html` nos dois temas, porque o clássico ainda depende dele; o gelo simplesmente não usa. A dependência de terceiros só some na limpeza final.
- **Publicar o gelo.** `VITE_FORGELEX_THEME` está no `Dockerfile` (padrão `classico`), mas **não** passa pelo `cloudbuild.yaml` nem pelo `deploy-from-main.ps1`. O deploy compara as substituições do build com as esperadas, e um valor novo mexeria nessa conferência de procedência; não consigo rodar o PowerShell aqui. Isso entra junto com a primeira publicação em homologação, com testes na CI. Até lá, nenhum build de produção sai com gelo.

### Não coberto

- **Leitor de decisão e leitor do MCP** (`--reader-*`) continuam com a paleta quente no tema gelo, como já se via na tela "Pesquisa e fontes". A V3 os revisa.
- **CSP do balanceador** continua não lida. As fontes são da própria origem, então valem com `font-src 'self'` ou `default-src 'self'`. Se a política proibir script inline, o `data-theme` não é escrito e a página fica no clássico, que é o lado seguro; a prévia só funcionaria com o script liberado.
- **Estados** (passar o mouse, foco, mensagens de erro) não entram nem na captura nem no medidor de contraste, que ignora classes com variante.
- **Medidor de contraste** mede pares por lista de classes e não distingue texto grande, ícone e texto lido; por isso lista, não bloqueia, o que já falhava no clássico.
- **Só Chromium**; capturas ficam fora do Git.

Reversão: `VITE_FORGELEX_THEME=classico`, que é o padrão; ou reverter o commit. Nada do que está publicado muda.

## V2 — Casca e site público (17/11/2026)

Sobre `main` em `66617a0`, na branch `claude/v2-casca`. A casca nova (lateral, Visão geral, Entrar, seções de Conta e Conectar IA, rótulos novos) existe **só no tema gelo**. O clássico, que é o que roda em produção, continua exatamente como está: o plano manda que nada mude para o cliente sem flag, e a flag desta etapa é o tema (`VITE_FORGELEX_THEME`). Reverter é voltar para `classico`. Depois da primeira entrega, Boni enviou o protótipo (artefato de 17/11); a casca foi adaptada a ele, em vez da leitura do texto da seção 7.2.

### Decisões de Boni nesta etapa

- **Navegação.** Mesa, Casos e Jurisprudência na lateral, com a conta no rodapé. A lateral nasce recolhida em trilho de ícones na Mesa, para não tomar espaço das três áreas.
- **Andamento processual.** A troca vale só dentro do app. O site público continua com "Consulta processual" (URL, sitemap, título e texto) até a V5A, quando a DEC-7 deixa o texto mudar.
- **Primeiros passos.** O estado fica no navegador, por usuário, sem API nem banco.

### O que foi feito

- **Tema ativo (`theme/active-theme.ts`).** Lê o `data-theme` que o script da V1 escreve no `<html>` e decide, em tempo de execução, qual casca o `App` monta.
- **Lateral (`IceSidebar`).** Como no protótipo: marca no alto; grupo **Trabalho** (Mesa, Casos, Jurisprudência); grupo **Conta e recursos** (Visão geral, Andamento processual, Conectar IA, Conta); rodapé com o nome do usuário, o saldo e "Sair da conta". Na tela larga não há cabeçalho: a marca e a navegação ficam na lateral. Abaixo de `lg`, `IceHeader` traz a marca e o botão da gaveta, que tem os mesmos itens, fecha com Escape e devolve o foco ao botão. Na Mesa nasce recolhida; fora dela, aberta; a escolha do cliente prevalece até recarregar. `Header` e `Sidebar` clássicos não foram tocados.
- **Cabeçalho de página (`PageHeader`) e seções.** Conta tem as seções Faturamento, Atividade, Segurança e Chaves de API no alto; Conectar IA tem Conexão, Guia de conexão e API para desenvolvedores. A lateral acende o item pai da seção aberta (`highlightedTab`).
- **Visão geral (`OverviewScreen`).** Substitui a tela inicial no gelo, com dados reais: "Primeiros passos" (Conectar sua IA, Criar o primeiro caso, quando Casos está ligado, e Verificar uma citação), atalhos, casos ativos, conexões e consumo do mês. As regras ficam num modelo puro (`overview-model.ts`), testado. O cartão é ocultável, com "Mostrar primeiros passos" para voltar; o estado de cada passo vem do que o app já sabe (conexão, casos, citação verificada), e a chave no `localStorage` leva o identificador do usuário.
- **Entrar (`IceAuthLayout`).** Duas colunas na tela larga (contexto do produto ao lado do formulário); só o formulário no celular.
- **Tokens novos.** `accent-tint` e `ok-tint` (clássico e gelo), nos mesmos arquivos do medidor de contraste.
- **Rotas por tema (`navigation/routes.ts`).** No gelo, `datajud` vira "Andamento processual" em `/app/andamento-processual` e `research` vira "Jurisprudência" (o caminho `/app/pesquisa` não muda). O caminho antigo é reescrito para o novo ao carregar, mantendo consulta e âncora. A página pública `/consulta-processual` não mudou.
- **Título da página de andamento.** `DataJudPage` ganhou a propriedade `title`; no gelo, dentro do app, é "Andamento processual", com a linha do tempo do protótipo.
- **Páginas públicas.** O tema gelo da V1 as serve; sem alteração de estrutura ou texto, que ficam para a V5A. `PublicSections` passou a exportar `PILLARS`, usado na coluna de contexto de Entrar.

### Verificação

| Item | Resultado |
| ---- | --------- |
| Clássico inalterado | 52 capturas (26 telas, dois tamanhos) depois da V2 contra as de depois da V1: **estilo de todos os elementos idêntico e as 52 imagens idênticas**. |
| Gelo e acessibilidade | axe em 52 telas com a casca nova: **nenhuma violação**. |
| Vitest | 316 arquivos e 2631 testes aprovados. ESLint e tipos limpos; Prettier limpo nos arquivos alterados (os três CSS que acusam já estavam fora do padrão em `main`); medidor de contraste: 109 pares, **nenhuma piora** em relação ao clássico. |
| Playwright, casca nova | `shell-gelo.spec.ts`, 12 cenários aprovados: lateral e rodapé; sem cabeçalho na tela larga; Rascunhos e Revisão acendem a Mesa; trilho na Mesa e troca pelo cliente; andamento e jurisprudência; Visão com dados reais; Primeiros passos (ocultar, lembrar, isolar por usuário); seções de Conta e Conectar; Entrar em duas colunas; gaveta no celular; axe na Visão, na Mesa recolhida, em Conta, na gaveta e em Entrar. |
| Suíte da Mesa nos dois temas | Gelo: `desk-shell`, `writing-desk` e `agentic-workspace` com 42 aprovados e 1 falho, o download do Word deste ambiente (o mesmo de `main`; na CI passa). Clássico: 30 aprovados e o mesmo 1. |
| Suíte pública nos dois temas | 17 aprovados no clássico e 17 no gelo; `datajud.spec` e `agentic-workspace.spec` escolhem rótulo, caminho e título conforme `FORGELEX_E2E_THEME`. |
| CI | Passos novos: a casca do gelo no job `e2e-desk` e a suíte pública com o gelo ligado no `e2e-public`. |

### Divergências em relação ao protótipo

- **Mesa, Pesquisa, Casos e Decisão.** Ficam para a V3: a Mesa segue com o trilho provisório de 80 px e a composição atual.
- **Cabeçalho público.** Sem destaque da página atual nem botão "Entrar" discreto; é da V5A.
- **Consumo do mês.** Soma das operações do mês que a API de recibos já devolve; sem dado, a Visão diz "Consumo indisponível no momento" em vez de inventar número. O texto dos passos e dos cartões é proposta minha.
- **Dois usuários de verdade.** A Auth sintética dos testes devolve sempre a mesma identidade; o isolamento por usuário foi provado pela chave e pelos testes unitários.

### Não coberto

- **Outros textos do app** ainda dizem "Pesquisa" e "consulta processual" (botão "Pesquisa e fontes" da Mesa, rótulos de teste); seguem V3, V4 e V5A.
- **Publicação.** Nada foi publicado. O gelo ainda não passa pelo Cloud Build nem pelo `deploy-from-main.ps1` (V1), então nenhum build de produção sai com a casca nova.

Reversão: `VITE_FORGELEX_THEME=classico` (o padrão), ou reverter o commit.

## V3 — Mesa, parte 1: composição e abas da peça (17/11/2026)

Sobre `main` em `b15bbd3`, na branch `claude/v3-mesa`. Primeira das duas PRs que o plano prevê para a V3. Tudo vale **só no tema gelo**; o clássico segue como está.

### Decisão de Boni nesta etapa

- **Lateral na Mesa.** Como no protótipo: as conversas recentes passam para dentro da lateral e ela fica aberta na Mesa. A coluna de histórico da Mesa some; o trilho de ícones (V2) deixa de ser o padrão da Mesa e continua disponível pelo botão "Recolher".

### O que foi feito

- **Conversas recentes na lateral.** `components/ice/desk-history-slot.tsx` dá à lateral um ponto onde a Mesa renderiza a lista (portal), com a lista, a lixeira, o "Desfazer" e o diálogo do celular como eram. O clássico usa o contexto padrão, sem elemento, e mantém a coluna. `DeskShell` e `DeskToolbar` recebem `historyInSidebar`: no gelo não reservam coluna nem mostram o botão "Recolher conversas".
- **Abas da peça.** `DraftCanvas` ganhou `PieceTabs` (Texto, Fontes, Revisão; `role="tablist"`, setas, Home e End). "Fontes do caso" e "Conferência da peça" deixam de ser botões de diálogo no gelo: Fontes mostra o conteúdo de `DeskCaseSources`; Revisão mostra a conferência (`ReviewBody`, extraída de `ReviewDialog`, que passa a ser só o diálogo em volta do mesmo conteúdo) e, abaixo, a revisão editorial. O texto continua montado e só escondido nas outras abas: o que foi digitado, a seleção e a rolagem ficam. Sem caso não há Fontes; sem versão salva não há Revisão (as abas ficam desabilitadas).
- **Abrir a conferência de fora.** Uma pendência da fila que abre a conferência leva direto à aba Revisão; "Editar a seção" a partir de um apontamento volta à aba Texto.

### Verificação

| Item | Resultado |
| ---- | --------- |
| Clássico inalterado | 52 capturas contra as de depois da V2: **estilo idêntico e as 52 imagens idênticas**. |
| Gelo e acessibilidade | axe em 52 telas: nenhuma violação. Três testes novos de acessibilidade das abas (Texto, Fontes, Revisão). |
| Vitest | 316 arquivos e 2638 testes aprovados; ESLint, tipos e Prettier limpos; contraste sem piora. |
| Playwright, gelo | 46 cenários, 45 aprovados e 1 falho: o download do Word deste ambiente (o mesmo de `main`; na CI passa). Novos: lateral aberta na Mesa com a lista dentro dela e recolhimento; abas com o texto preservado e sem diálogos; teclado; abas desabilitadas sem caso; axe das abas. |
| Playwright, clássico | `desk-shell` (30 de 31, o mesmo falho do Word), `draft-review` (4 de 5, o falho é o mesmo download do Word), `desk-review`, `editorial-review` e `desk-save-recovery` aprovados. |

### Divergências em relação ao protótipo e o que fica para a parte 2

- **Revisão editorial.** No protótipo as sugestões (aceitar e recusar) aparecem em linha na aba Revisão. Aqui a aba mostra a conferência e o botão da revisão editorial existente, que abre o próprio diálogo; reescrevê-la mexe em recibos e execução comercial, e fica fora desta parte.
- **Cabeçalho da Mesa, seletor de caso, "Criar caso a partir desta conversa", etapas do trabalho e estado vazio com os dois selos** são a parte 2 (V3b).
- **Orientação.** A pergunta ativa e o "Não sei" já existiam; no gelo seguem com as cores legadas mapeadas pela V1. O acabamento visual fica para a parte 2.
- **Download do Word** neste ambiente (sem relação com a V3).

Reversão: `VITE_FORGELEX_THEME=classico` (o padrão), ou reverter o commit.

## V3 — Mesa, parte 2: caso, etapas e estado vazio (17/11/2026)

Sobre `main` em `ceb205a`, na branch `claude/v3-mesa-2`. Segunda e última PR da V3. Tudo vale **só no tema gelo**; o clássico segue como está, com o DOM idêntico.

### O que foi feito

- **Seletor de caso no cabeçalho da Mesa.** `DeskCaseSelector` mostra "Caso" com a opção **Sem caso — somente texto** e os casos do cliente. O estado do caso continua no pedido (`Composer`), que renderiza o seletor no cabeçalho por portal (`desk-case-slot`), sem subir estado. O campo "Caso" saiu de "Caso e documentos", que agora diz onde escolher quando não há caso. **A07:** o caso não troca depois que a conversa começa; o seletor fica desabilitado com o motivo escrito ("Fixo nesta conversa", "Fixo pela peça aberta"), e trocar o caso antes de enviar zera os documentos e a minuta escolhidos.
- **Criar caso a partir desta conversa.** Botão no cabeçalho (antes de enviar): o nome é sugerido pela primeira frase do pedido (`caseNameFrom`, até 80 caracteres), é editável e o caso nasce **só com o nome**, pelo `POST /api/v2/matters` de sempre. O texto do pedido continua onde estava. Na aba Fontes de uma peça sem caso, o mesmo gesto liga a peça ao caso criado.
- **Aba Fontes sem caso.** Deixa de ficar desabilitada: explica que, sem caso, não há questões, cobertura de fontes nem análise de aderência, e oferece criar o caso. Revisão continua exigindo versão salva.
- **Etapas do trabalho.** `workStages` (puro, testado) deriva as etapas dos eventos que o servidor realmente envia: STATUS (recebido, em andamento, concluído, interrompido), SOURCE (documentos lidos, contados sem repetir), QUESTION (esperando a resposta) e DELIVERY (entrega). Sem etapa inventada: não há "pesquisando no STJ" nem "3 consultas" porque o servidor não informa isso. `WorkStages` mostra a lista ordenada com o estado também em texto. **ERROR** continua no aviso `role="alert"` sempre visível, no parágrafo "Andamento" (região viva) e marcado na etapa de trabalho.
- **Estado vazio.** `DeskEmptyGuide` junta, abaixo dos atalhos de sempre, "Comece por um exemplo" (três exemplos que só preenchem o pedido, sem enviar nem cobrar) e "Dois selos, dois sentidos" (Análise da IA, rotulada e conferida por você; Verificada, número, data e órgão conferidos na fonte oficial). Os textos dos exemplos e dos selos são proposta minha.

### Verificação

| Item | Resultado |
| ---- | --------- |
| Clássico inalterado | 52 capturas contra as de depois da V3 parte 1: **estilo idêntico e as 52 imagens idênticas**. A primeira captura acusou um elemento a mais no clássico (um `div` em volta dos atalhos); foi corrigido e a segunda confere. |
| Gelo e acessibilidade | axe em 52 telas: nenhuma violação; mais axe nas etapas e no estado vazio. |
| Vitest | 318 arquivos e 2655 testes aprovados (+11 do modelo das etapas, +6 do nome sugerido, +o contador de documentos lidos nos eventos); ESLint e tipos limpos; contraste sem piora. |
| Playwright, gelo | 52 cenários, 51 aprovados e 1 falho: o download do Word deste ambiente (o mesmo de `main`; na CI passa). Novos: seletor no cabeçalho e criação do caso só com o nome; caso fixo com o motivo; etapas; erro sempre visível e anunciado; estado vazio; Fontes sem caso. Mutações conferidas: desligar o bloqueio do seletor e desligar as etapas derrubam os testes. |
| Playwright, clássico | `desk-shell`, `draft-review` (exceto o Word), `desk-review`, `editorial-review`, `desk-save-recovery`, `desk-guidance`, `desk-guidance-v3` e `agentic-workspace` aprovados. |

### Divergências em relação ao protótipo

- **Etapas com números.** O protótipo mostra detalhes como "12 fatos e 5 provas" e "3 consultas, R$ 0,60". Aqui só aparece o que o servidor informa; os detalhes ricos dependem de eventos novos (fica registrado como pendência para a V4/M4).
- **Criar caso com a conversa e os documentos.** No protótipo, o caso leva a conversa, os anexos e as fontes e a IA propõe fatos. Aqui o caso nasce só com o nome (aceite do plano); levar o restante exige uma operação de servidor própria.
- **Cabeçalho.** Sem o título "Mesa" no cabeçalho (a lateral já marca a página) e sem o botão "Nova tarefa" (a lateral tem "Nova conversa"). Sem o link "Base do caso" nem o contador de questões, que dependem de dados que a Mesa não carrega.
- **Revisão editorial em linha** (aceitar e recusar na aba Revisão) segue fora, como na parte 1.

### Não coberto

- **Orientação** (pergunta ativa, "Não sei"): o comportamento já existia e continua; seguem as cores legadas mapeadas pela V1, sem acabamento próprio.
- **Download do Word** neste ambiente (sem relação com a V3).

Reversão: `VITE_FORGELEX_THEME=classico` (o padrão), ou reverter o commit.

## V4 — Jurisprudência, leitor e selos (17/11/2026)

Sobre `main` em `0e8d8b3`, na branch `claude/v4-jurisprudencia`. Tudo vale **só no tema gelo**; o clássico segue como está.

### Escopo e dependência

O plano põe a V4 atrás da M4 (busca ancorada no caso, com a frase de aderência por resultado), que **ainda não existe**. Esta PR faz a parte da V4 que não depende dela: a linguagem visual dos selos, o título e a legenda da Jurisprudência e o leitor de decisões. A aderência ao caso (análise da IA por resultado, consultas sugeridas pelas questões do caso, "Pesquisar com o caso") fica para depois da M4; o selo da IA existe e aparece na explicação do estado vazio da Mesa, mas nenhum resultado de pesquisa o mostra, porque nenhum resultado tem análise.

### O que foi feito

- **Selos (`components/ice/Seal`, `verification-seal.ts`).** A verificação é um fato da fonte, com estados próprios, em ícone e texto (nunca só cor): **Verificada** (verde, só a conferência na fonte oficial), **Conferida no fornecedor** (aviso), **A conferir na fonte** (neutro), **Metadados divergentes** (aviso) e **Sem correspondência** (erro, com "isso não prova que não exista"). Estado desconhecido nunca aparece como verificado. O selo da análise da IA (petróleo, rotulado "Análise da IA") é um componente à parte, para não confundir verificação com leitura da IA. O selo de origem externa (M5) não foi criado.
- **Jurisprudência.** Título "Jurisprudência" com a frase que leva ao Andamento processual; antes da primeira busca, a legenda "Como ler os resultados" com três selos; o resultado da conferência de decisão usa o selo. O resto da tela (consulta, cobrança, pesquisas salvas) não mudou.
- **Leitor de decisões.** No gelo usa a paleta e a fonte editorial do tema (variáveis `--reader-*` sobrescritas só com `data-theme="gelo"`) e mostra o selo de verificação no alto do registro, não mais escondido em "Origem e fonte". O leitor do MCP (isolado) e o clássico ficam iguais.
- **Fontes do caso e pesquisa salva.** O selo entra pelo `CitationChecks`, que as duas telas já usam.
- **Mesa.** O estado vazio passa a usar os mesmos componentes de selo.

### Verificação

| Item | Resultado |
| ---- | --------- |
| Clássico inalterado | 52 capturas contra as da V3: **estilo idêntico e as 52 imagens idênticas**. |
| Gelo e acessibilidade | axe em 52 telas: nenhuma violação; mais axe na Jurisprudência antes e depois de uma busca. Tons dos selos sobre os dois fundos: 4,66 a 6,47 para 1 (o menor é o aviso sobre o fundo da página). |
| Vitest | 319 arquivos e 2661 testes aprovados (+6 do modelo dos selos); ESLint, tipos, `format:check:code` e contraste sem piora. |
| Playwright, gelo | `research-gelo.spec.ts` (novo, 2 cenários, com passo próprio na CI): título, legenda, ausência de promessa de aderência, selo no leitor, paleta do leitor, selo na conferência; `shell-gelo` com 51 de 52 (o falho é o download do Word deste ambiente). |
| Playwright, clássico e MCP | `saved-research` (inclui o leitor isolado do MCP), `research`, `desk-research` e as 32 do `mcp-site` aprovados; `case-flow` com o mesmo download do Word falhando. |

### Divergências em relação ao protótipo

- **Lista com painel da decisão ao lado.** O protótipo mostra os resultados numa lista e a decisão selecionada num painel. O leitor atual é um leitor passo a passo ("1 de N"), compartilhado com o leitor do MCP; trocá-lo por lista e painel mexe nos dois e fica fora desta etapa.
- **Aderência ao caso, "Pesquisar com o caso" e consultas sugeridas.** Dependem da M4.
- **Leitor de decisão em página própria (`Decisao`).** Segue o leitor existente, no tema.

Reversão: `VITE_FORGELEX_THEME=classico` (o padrão), ou reverter o commit.

## V5 — Conta e Conectar IA (17/11/2026)

Sobre `main` em `ae43108`, na branch `claude/v5-conta-conectar`. Tudo vale **só no tema gelo**; o clássico segue como está, com o DOM idêntico.

### Escopo e decisão de Boni

O plano põe a V5 atrás da U7 (a tela "Casos" sai e a Mesa a absorve), que **ainda não foi feita**. Casos e Caso novo, portanto, **ficam de fora** (não faz sentido vestir uma tela que vai sair). Conta e Conectar IA já tinham a estrutura do protótipo desde a V2 (seções no alto) e são mais completas que ele. Decisão de Boni: complementar **só com dado real**, sem criar endpoint novo.

### Auditoria pedida pelo plano

- **Botões inertes.** Varri todos os `<button>` do app sem tratador: o único é a aba única "Ementa" do leitor de decisões, que é um `tab` selecionado por definição, não um botão que prometa algo. Também não há `href="#"`, tratador vazio nem texto de "em breve".
- **Valores financeiros.** Nenhum valor em reais está escrito no código do app: pacotes, tarifas e saldo vêm do serviço e passam por `formatBRL`. A coluna nova segue a regra e usa os centavos como vieram.

### O que foi feito

- **Coluna lateral da Conta (`AccountAside`).** Ao lado de Faturamento, em telas largas (abaixo de `lg` vai para baixo): **Identificação** (nome e espaço de trabalho da conta, "conta pré-paga, em reais"), **Chaves de API** (quantas e quais, só pelo prefixo público e o estado; nunca o segredo nem os escopos; leva a "Gerenciar chaves"), **Atividade da conta** (os três lançamentos mais recentes, com os rótulos da tela de lançamentos e o valor em centavos do serviço; leva a "Ver atividade") e **Encerramento de conta** (o pedido é em Segurança e a política segue a publicada; leva a Segurança e à política de destinação). Cada cartão busca o próprio dado e, se falhar, diz que está indisponível sem derrubar os outros. O modelo (`account-aside-model.ts`) é puro e testado.
- **Conectar IA.** "Como fica o trabalho", em três passos que o próprio serviço sustenta: a conversa é na IA do cliente, com a assinatura dele; ela chama as ferramentas do ForgeLex quando precisa de fonte; o que for cobrado aparece na atividade da conta, por operação, e comando gratuito não gera lançamento.

### Verificação

| Item | Resultado |
| ---- | --------- |
| Clássico inalterado | 52 capturas contra as da V4: **estilo idêntico e as 52 imagens idênticas**. |
| Gelo e acessibilidade | axe em 52 telas: nenhuma violação; mais axe em Conta no celular e em Conectar IA. |
| Vitest | 320 arquivos e 2669 testes aprovados (+8 do modelo da coluna lateral); ESLint, tipos, `format:check:code` e contraste sem piora. |
| Playwright, gelo | 55 cenários, 54 aprovados e 1 falho (o download do Word deste ambiente, igual a `main`; na CI passa). Novos: a coluna lateral com uma chave criada (aparece o prefixo, nunca o segredo), a ida a Segurança, a coluna no celular sem rolagem lateral e "Como fica o trabalho". |

### Divergências em relação ao protótipo

- **Tabela de ferramentas publicadas, com tarifa** (Conectar): o serviço não expõe esse catálogo; criar o endpoint ficou fora do escopo decidido. Fica como pendência.
- **"Consumo recente" e "Tarifas vigentes" como blocos da Conta:** a tela real já tem saldo, valores, lançamentos e recarga, e é mais completa; não foram reescritos.
- **"Baixar recibos", "Última recarga" e "Dados de cobrança"** do protótipo não têm correspondente real e não foram criados.
- **Casos e Caso novo:** aguardam a U7.

Reversão: `VITE_FORGELEX_THEME=classico` (o padrão), ou reverter o commit.

## Aceite A19 em 17/11/2026

**Decisão de Boni (17/11/2026):** aprovou todas as telas da jornada visual do tema gelo, em desktop e celular, e pediu o registro da A19.

**O que foi mostrado.** As capturas de `main` em `9aace0` (etapas V0 a V5), com dados sintéticos de teste, numa página de revisão com as duas capturas de cada tela (1440 px e 390 px) e o que olhar em cada uma. Foram 14 telas, na ordem em que uma pessoa as atravessa:

1. Início e Produto (site público, tema da V1; o texto novo é da V5A).
2. Entrar.
3. Visão geral.
4. Mesa sem trabalho em curso e Mesa com a peça aberta.
5. Jurisprudência e Pesquisa e fontes, com o leitor de decisões.
6. Andamento processual.
7. Conectar IA.
8. Conta: Faturamento, Atividade, Segurança e Chaves de API.
9. Casos, **no layout anterior**: a tela sai na U7 e não foi redesenhada. Boni aprovou a captura como estava.

**Evidência e seus limites.**

- A aprovação é a declaração de Boni na conversa de 17/11/2026. A página de revisão tinha controle de veredito por tela, mas, ao conferir o armazenamento dela, **estava vazio**: o registro não foi gravado pela página. Por isso o aceite consta pela palavra de Boni, não pela leitura dos vereditos.
- A aprovação cobre o que estava nas capturas. **Não foram fotografados** (e portanto não passam por este aceite): as etapas do trabalho em andamento e com erro, as abas Fontes e Revisão abertas, o seletor de caso aberto, os diálogos e o selo de verificação no registro do leitor (fica abaixo da área capturada). Esses estados têm teste automatizado e axe; se Boni quiser vê-los, são capturados à parte.
- O aceite vale para o **tema gelo**, que continua só atrás do tema `gelo`. Nada foi publicado: o gelo ainda não passa pelo Cloud Build nem pelo `deploy-from-main.ps1`.

**Não decide.** O aceite visual não decide a publicação do gelo, nem a V5A (site público), a U7, a M4 e a M5, que seguem pendentes.

## V5A — Site público no modelo novo, parte 1: título e página inicial (17/11/2026)

Sobre `main` em `47ae880`, na branch `claude/v5a-site-publico`. Primeira entrega da V5A. Tudo vale **só com `VITE_FORGELEX_PUBLIC_MODEL=true`**, desligada por padrão: com ela desligada o site é exatamente o de hoje (escopo congelado). A flag **deve continuar desligada em produção até a V5A inteira estar pronta**, porque só a página inicial muda nesta parte.

### Decisão de Boni: o título

Escritas três propostas, todas só com o que está no ar na publicação de 14/11 (`cd94c2c`) e sem o título vetado. **Boni escolheu a A em 17/11/2026:**

- **Título:** "Sua IA, com jurisprudência que dá para conferir."
- **Subtítulo:** "Conecte o ForgeLex ao ChatGPT ou ao Claude por MCP e pesquise decisões com a fonte e o estado de verificação de cada resultado. Você paga só pelo uso."

As outras duas, para o registro: **B** "Pesquise na sua IA. Escreva na Mesa." (prometia mais, dependia de a Mesa estar aberta ao cliente) e **C** "A citação que você usa, conferida na fonte." (deixava de fora a vigência, que ainda não tem conferência no ar).

### Cada afirmação do título e a função no ar

| Afirmação | Função publicada |
| --------- | ---------------- |
| Conectar ao ChatGPT ou ao Claude por MCP | Conexão MCP com OAuth e ferramentas de pesquisa, publicada. O texto abaixo mantém "conforme a disponibilidade do MCP". |
| Fonte e estado de verificação por resultado | Leitor de decisões e verificação de autoridade, publicados. |
| Pagar só pelo uso | Créditos pré-pagos em reais, com valores vindos do serviço, publicados. |

### O que foi feito

- **Flag `VITE_FORGELEX_PUBLIC_MODEL`** (`config/site-capabilities.ts`) e a propriedade `model` em `PublicSite`, que as páginas recebem; os testes ligam o modelo sem recarregar módulos.
- **Página inicial.** Título e subtítulo aprovados; os quatro passos do percurso reescritos (acesso, conexão, pesquisa com a fonte à vista, conferência e Mesa); "Mesa de trabalho" entra nas ferramentas e nas formas de uso, com o que está no ar: elaborar e revisar peças com orientação, a partir de anexos em PDF, texto ou Markdown; a pergunta "O que é a Mesa de trabalho?" e a de "O que é o ForgeLex?" reescritas; sai o aviso de que o fluxo de casos e rascunhos "está suspenso" (as âncoras antigas ficam).
- **Metadados da inicial** (`metadataFor`): título, descrição e canônica. Para as outras páginas o metadado segue o atual.
- **Fica de fora, de propósito:** Word, OCR, agentes analíticos, vigência e Gemini. Testes de unidade e de ponta a ponta conferem que essas palavras não aparecem, com uma mutação provada (pôr "OCR" no texto da Mesa derruba o teste).

### Verificação

| Item | Resultado |
| ---- | --------- |
| Texto atual preservado | Com a flag desligada o HTML da inicial é idêntico ao anterior (teste compara os dois); `public-copy.test.ts` segue exigindo o texto atual e o veto ao título rejeitado, e agora também o título novo. |
| Playwright | `public-model.spec.ts` (novo, 3 cenários, passo próprio na CI): título, metadados, ausência do que não está no ar e axe; celular sem rolagem lateral e menu por teclado; as outras páginas com o texto atual. Suíte pública existente: 17 aprovados. |

### Pendente na V5A

Reescrever `ProductPage`, `HowPage`, `IntegrationsPage`, `CreditsPage`, `GuidePage` e `ApiDocsPage`; `LandingScreen` (a dupla versão do título por `CASE_WORKSPACE_ENABLED`); `ConnectionsScreen`; `index.html`, `sitemap.xml`, a imagem Open Graph e `README.md`; os textos legais em `apps/web/public/legal/` (**a aprovação é de Boni**; só devem descrever o que acontece de fato); `public-seo.test.ts`; e as URLs canônicas com o domínio vigente (D3). Depois, ligar a flag e publicar texto e função juntos.

Reversão: desligar `VITE_FORGELEX_PUBLIC_MODEL` (o padrão), ou reverter o commit.

## V5A — Site público no modelo novo, parte 2: as demais páginas públicas (17/11/2026)

Na branch `claude/v5a-paginas`, empilhada sobre `claude/v5a-site-publico` (parte 1, [#191](https://github.com/junior-aguiar-eng/ForgeLex/pull/191)). Continua **só com `VITE_FORGELEX_PUBLIC_MODEL=true`**, desligada por padrão e **desligada em produção** até a V5A inteira estar pronta.

### O que foi feito

| Página | Texto novo (resumo) |
| ------ | ------------------- |
| Produto | "Pesquisa com fonte, conexão com a sua IA e Mesa de trabalho."; ferramentas e percurso no modelo novo, mais as salvaguardas. |
| Como funciona | "Da conta à pesquisa com fonte, e da fonte à peça."; percurso de quatro passos, terminando na Mesa. |
| Integrações | "Conecte o ForgeLex à sua IA, à Mesa e ao seu software."; quatro formas de uso (site, ChatGPT ou Claude, Mesa, API). |
| Créditos | "Você paga só pelo uso."; mesmo conteúdo contratual de hoje: pré-pago em reais, pesquisa válida faturável, abrir e verificar sem cobrança própria, custo do aplicativo de IA separado. |
| Guia | "Conecte sua IA e pesquise com a fonte à vista."; passo novo e cartão "Mesa de trabalho" (anexos em PDF, texto ou Markdown) com link para `/entrar?next=%2Fapp%2Ftrabalho`. |
| API | Só o título muda ("Integre a pesquisa do ForgeLex ao seu software."); autenticação, exemplos, consulta gratuita TJAL e OpenAPI ficam como estão. |

Os metadados (título e descrição) de cada uma dessas páginas mudam com o texto, em `public-metadata.ts`; a canônica e a indexação não mudam. A consulta processual gratuita (DataJud) e a página não encontrada **não mudam**, como o plano pede.

### Regra mantida

Nenhuma frase afirma o que não está no ar: Word, OCR, agentes analíticos, vigência e Gemini não aparecem; o texto não diz que o fluxo de casos "está suspenso" nem oferece `/app/casos`, `/app/rascunhos` ou `/app/revisao`. **A Mesa aparece sem preço**: o texto só afirma a cobrança da pesquisa jurisprudencial válida, que é o que está publicado com tarifa. Se a Mesa tiver tarifa própria, o texto dela entra quando Boni confirmar o valor (A24).

### Verificação

| Item | Resultado |
| ---- | --------- |
| Vitest | 320 arquivos e 2.695 testes aprovados. Novos: cada página, com o modelo desligado, sai idêntica à de antes e sem "Mesa de trabalho"; com ele ligado traz um só h1, texto novo e nada do que não está no ar; Créditos conserva o que é cobrado; Guia leva à Mesa; metadados por página. Mutação provada: pôr "OCR" no cartão da Mesa do Guia derruba o teste. |
| Playwright | `public-model.spec.ts` agora com 4 cenários: as seis páginas conferem título, metadados e ausência do que não está no ar, com axe sem violação em cada uma; a consulta gratuita segue como é. Suíte pública existente: 17 aprovados. |
| Capturas | Com a flag desligada, as 52 capturas saíram idênticas às da parte 1 (estilos e imagens). Com ela ligada, as seis páginas foram vistas em 1440 px (Produto e Guia conferidos a olho: o cartão "Mesa de trabalho" do Guia, o quinto passo e o título novo). O axe passou nas seis, no e2e. |

### Pendente na V5A

`PublicFooter` (o texto de apresentação do rodapé segue o atual); `LandingScreen` (a dupla versão do título por `CASE_WORKSPACE_ENABLED`); `ConnectionsScreen`; `index.html`, `sitemap.xml`, imagem Open Graph e `README.md`; `public-seo.test.ts`; URLs canônicas com o domínio vigente (D3); os textos legais em `apps/web/public/legal/` (**a aprovação é de Boni**). Depois, ligar a flag e publicar texto e função juntos.

Reversão: desligar `VITE_FORGELEX_PUBLIC_MODEL` (o padrão), ou reverter o commit.

## V5A — Site público no modelo novo, parte 3: rodapé, tela inicial, HTML estático, imagem e README (18/11/2026)

Sobre `main` em `3f7ab5d`, na branch `claude/v5a-resto`. Continua **só com `VITE_FORGELEX_PUBLIC_MODEL=true`**, desligada por padrão e **desligada em produção** até a V5A inteira estar pronta.

### O que foi feito

| Item | O que mudou |
| ---- | ----------- |
| Rodapé público | Frase de apresentação nova no modelo ("Jurisprudência com fonte e estado de verificação para a sua IA, por MCP, com Mesa de trabalho e API."); links e documentos legais iguais. |
| Tela inicial interna (`LandingScreen`) | No modelo novo mostra o título e o subtítulo aprovados, num só texto: some a dupla versão por `CASE_WORKSPACE_ENABLED` (a flag continua mandando no botão "Abrir caso", que é função). Com o modelo desligado, nada muda. O título passou para `config/public-model-copy.ts`, módulo pequeno que o site e o app dividem. |
| Tela Conectar IA | **Sem mudança.** Já diz o que o modelo diz (conectar à IA do cliente, a assinatura dela não paga o ForgeLex, só a pesquisa é cobrada) e já tem "Como fica o trabalho" da V5. |
| HTML que o robô lê sem JavaScript | Novo plugin de build (`public-site-html-plugin.ts`): com o modelo ligado, troca título e descrição da inicial no `index.html` pelas mesmas strings do código (`public-metadata-data.ts`, fonte única) e acrescenta `og:image`, `og:image:alt` e `twitter:image`, com `summary_large_image`. Sem a flag, o `index.html` sai igual. |
| Imagem Open Graph | `apps/web/public/og/forgelex-modelo.png` (1200×630, 66 KB) com o título aprovado; entra no `index.html` só no modelo novo. |
| Domínio sem valor fixo | `VITE_PUBLIC_ORIGIN` troca o domínio de `canonical`, `og:url`, imagem, `sitemap.xml` e `robots.txt` no build (D3); sem ela vale `https://nexojuris.ia.br`. Conferido com um build real em outro domínio: nada do domínio antigo sobra. |
| `sitemap.xml` | Mesmas oito páginas; só passa a seguir `VITE_PUBLIC_ORIGIN`. |
| `README.md` | Título e subtítulo aprovados no alto e a seção "Posicionamento público". |

### Textos legais

**Não alterei nenhum.** Levantei o que dizem e o que o modelo novo exige e deixei uma redação proposta para Boni em [docs/operations/stabilization/2026-11-18-textos-legais-modelo-novo-proposta.md](../operations/stabilization/2026-11-18-textos-legais-modelo-novo-proposta.md). A lacuna principal: a política de privacidade não diz que, na Mesa, o texto do pedido e dos anexos vai a um provedor de modelo contratado pelo ForgeLex (o código do piloto usa OpenAI). Dependem de Boni o nome do provedor e suas condições, onde fica o texto extraído do anexo e a tarifa da Mesa.

### Verificação

| Item | Resultado |
| ---- | --------- |
| Vitest | 321 arquivos e 2.708 testes aprovados. Novos: `public-site-html.test.ts` (7: HTML idêntico sem flag, título e descrição nas três marcas, imagem, domínio trocado, sitemap e robots, falha alta se o texto esperado sumir), rodapé (2), tela inicial interna nos dois estados de casos (3). Mutação provada: pôr "OCR" na frase do rodapé derruba 9 testes. |
| Playwright | `public-model.spec.ts` com 5 cenários; o novo lê o HTML bruto, confere título, `og:image`, o PNG servido e o rodapé. Suíte pública existente: 17 aprovados. |
| Builds reais | Padrão: sem `og:image`, título atual. Modelo com `VITE_PUBLIC_ORIGIN=https://exemplo.com.br`: título novo, imagem no domínio novo, `sitemap.xml` e `robots.txt` sem o domínio antigo. |
| Clássico | Com a flag desligada, 52 capturas idênticas às da parte 2 (estilos e imagens). |

### Pendente na V5A

Os textos legais (aprovação de Boni, a proposta acima) e a tarifa da Mesa (A24). Depois, ligar a flag e publicar texto e função juntos: a ligação em `Dockerfile`/Cloud Build e `deploy-from-main.ps1` é decisão de publicação de Boni e não faz parte desta entrega.

Reversão: desligar `VITE_FORGELEX_PUBLIC_MODEL` (o padrão), ou reverter o commit.

## V6 — Preparação: tema e texto público chegam ao build de produção (18/11/2026)

Sobre `main` em `b5660d4`, na branch `claude/v6-plumbing`. **Não liga nada.** Hoje a publicação de produção (`cloudbuild.yaml` e `deploy-from-main.ps1`) não passa `VITE_FORGELEX_THEME` nem `VITE_FORGELEX_PUBLIC_MODEL` ao build: o `Dockerfile` já tinha o tema, mas só com o padrão `classico`, e o texto público do modelo novo (V5A) não tinha caminho algum. Sem isso não haveria como ligar o gelo nem o texto novo na produção.

| Arquivo | Mudança |
| ------- | ------- |
| `Dockerfile` | `ARG` e `ENV` de `VITE_FORGELEX_PUBLIC_MODEL` (padrão `false`), antes do `pnpm build`. |
| `ops/gcp/production/cloudbuild.yaml` | Argumentos de build e substituições `_VITE_FORGELEX_THEME` (`classico`) e `_VITE_FORGELEX_PUBLIC_MODEL` (`false`). |
| `deploy-lib.ps1` | `_VITE_FORGELEX_PUBLIC_MODEL` entra nas flags opcionais (ausente = `false`, preservada do build anterior). `_VITE_FORGELEX_THEME` é tratada à parte: ausente = `classico`, preservada do build anterior, e **só `classico` e `gelo` são aceitos** (`previa`, vazio ou maiúsculas são recusados, inclusive se vierem do build anterior). |
| `deploy-from-main.ps1` | Parâmetros `-Theme classico|gelo` e `-PublicModelEnabled true|false`, que só mudam o valor se informados. |
| `README.md` do ops | Os dois parâmetros, a regra e a reversão. |

**Efeito na produção atual: nenhum.** O build anterior de produção não traz as duas substituições, então valem `classico` e `false`, os mesmos valores de hoje; a imagem sai igual.

**Verificação.** `tests/dockerfile.test.ts` confere os dois `ARG`, a ordem antes do build e as duas linhas do `cloudbuild.yaml`. Os testes do deploy (`deploy-from-main.tests.ps1`, que a CI executa) ganharam 3 casos (padrões, preservação e troca de propósito, recusa de `previa`, `Gelo` e `escuro`, e de `sim` na flag) e a contagem de substituições passou de 12 para 14. **Não consegui rodar o PowerShell neste contêiner** (o classificador negou executar o binário baixado); a conferência desses testes é da CI.

**Ligar de fato** (fora desta entrega, decisão de Boni, em publicação isolada): `./ops/gcp/production/deploy-from-main.ps1 -DryRun -Theme gelo` para ver o plano, depois sem `-DryRun`. Reversão: `-Theme classico`.

Reversão desta entrega: reverter o commit; nada em produção muda enquanto os parâmetros não forem usados.

## V6 — Favicon, theme-color, imagem de prévia e passada completa no tema gelo (18/11/2026)

Sobre `main` em `cad9fcb`, na branch `claude/v6-favicon`. **Não liga o tema.** Tudo o que muda vale só com `VITE_FORGELEX_THEME=gelo`; o clássico sai igual.

### O que foi feito

| Item | O que mudou |
| ---- | ----------- |
| Favicon | O script do tema no `index.html` (o mesmo que escolhe o tema antes da primeira pintura) troca o `href` do `<link rel="icon">` por um SVG na cor do acento do gelo, `#0F5C6E`. O clássico mantém o marrom `#8E5D2A`. |
| `theme-color` | No gelo o script acrescenta `<meta name="theme-color" content="#F4F7F8">`, o fundo da página, para a barra do navegador no celular. O clássico **não tem** `theme-color`, como hoje. |
| Imagem Open Graph | `apps/web/public/og/forgelex-modelo-gelo.png` (1200×630, 67 KB), a mesma do modelo novo na paleta do gelo (Spectral, fundo `#F4F7F8`, acento `#0F5C6E`). O plugin do `index.html` usa essa imagem quando o build é `VITE_FORGELEX_THEME=gelo` e a original nos demais temas. |
| Ferramenta de capturas | Nova opção `--viewports 360,768,1440` (`parseViewports`, com teste); sem ela valem os dois tamanhos de sempre. |

As duas cores não ficam soltas: um teste lê o bloco `[data-theme="gelo"]` de `index.css` e exige que o favicon e o `theme-color` usem o acento (`--fl-accent`) e o fundo (`--fl-canvas`) de lá. Se o tema mudar de cor, o teste acusa.

### Passada completa (item de aceite da V6)

| Item | Resultado |
| ---- | --------- |
| Axe (WCAG 2.0 e 2.1, A e AA) | **Sem violação em 78 telas**: as 26 telas do roteiro em 360, 768 e 1440 px, com o tema gelo. |
| Olhada humana | Vi a Mesa com peça em 360 px e o diálogo "Pesquisa e fontes" em 768 px. **Não revi as 78 imagens**: o aceite visual por tela continua sendo de Boni (como na A19). |
| Achado antigo | No diálogo "Pesquisa e fontes" a 768 px, o cartão "Consulta jurisprudencial" passa da borda direita do diálogo e perde a borda. **Acontece igual no tema clássico** (capturado e comparado), então não é regressão do gelo. Fica anotado, sem correção aqui para não mexer no clássico. |
| Leitor de tela nos eventos da Mesa | **Não feito.** Exige leitor de tela de verdade (NVDA, VoiceOver); é conferência de Boni antes de ligar o tema. |

### Verificação

Vitest do script de tema (3 casos novos: favicon e `theme-color` só no gelo, cores iguais às do CSS, página sem `querySelector` não quebra; mutação provada trocando um dígito do `#F4F7F8`), do plugin (imagem por tema) e da ferramenta de capturas. Playwright: o clássico não define `theme-color` e mantém o favicon (`public-site.spec.ts`, 18 aprovados); o gelo define os dois já na página de entrada (`shell-gelo.spec.ts`); `public-model.spec.ts` 5 aprovados.

### Pendente para ligar o gelo

1. Boni confere as telas (aceite visual) e o leitor de tela nos eventos da Mesa.
2. Decidir o achado do cartão a 768 px (corrigir antes ou depois).
3. Homologação com `VITE_FORGELEX_THEME=gelo`, depois produção, em publicação isolada: `deploy-from-main.ps1 -Theme gelo`.

Reversão: `-Theme classico` e novo deploy; ou reverter este commit.

## V5A — A Mesa de trabalho em destaque no site (18/11/2026)

Sobre `main` em `f935b58`, na branch `claude/v5a-mesa`. Continua **só com `VITE_FORGELEX_PUBLIC_MODEL=true`**, desligada por padrão.

### Por que

Observação de Boni em 18/11/2026: nos textos do site faltavam referências à Mesa agêntica, "a parte mais interessante e complexa". Procede: a Mesa aparecia como um cartão a mais, e o produto lia como pesquisa de jurisprudência. O texto do clássico (hoje em produção) segue o escopo congelado e não muda; a correção é no modelo novo.

### O que a Mesa faz e o que o site passa a dizer

Cada frase corresponde a função publicada (web com Mesa agêntica, casos, pesquisa salva, anexos e chips ligados; orientação guiada e `mesa-v3` ligadas na API; salvamento recuperável ligado em 14/11; cenários da A18 aceitos por Boni).

| Frente | Texto | Função publicada |
| ------ | ----- | ---------------- |
| Ela pergunta o que falta | Pedido em uma frase ou "ajuda para começar"; pergunta o que muda o resultado; "não sei"; corrigir o resumo antes de enviar. | Orientação guiada e `mesa-v3`, A18 (Me ajude a começar, Não sei, correção pelo resumo). |
| Elabora, revisa e edita um trecho | Peça nova ou revisão sem gerar versão a cada pedido; alteração só do trecho selecionado. | A18 (criação, revisão sem nova versão, edição delimitada). |
| Cada versão fica guardada | Versão com histórico; resposta perdida não duplica nem perde; a revisão aponta e o cliente decide o que aplicar. | Salvamento recuperável (migração `0041`, flag ligada em 14/11); revisão editorial. |
| Fontes dentro da peça | Pesquisar sem sair da Mesa; origem e estado de verificação; pesquisa salva reabre sem nova busca. | R9 (pesquisa salva e fontes na Mesa), A11. |
| Seu material e seu caso | PDF, texto e Markdown; o arquivo não é enviado nem guardado, só o texto extraído; peças e pesquisas por caso. | DEC-12 e U5 (anexos); casos. |
| Você acompanha e decide | Andamento à vista; conferência e uso jurídico são do cliente. | Andamento da execução. |

Evitei de propósito o que depende do tema gelo ou de avaliação de Boni: os selos "Análise da IA" e "Verificada", a lista de "Etapas do trabalho", o número de áreas e o catálogo de fichas (a avaliação jurídica do Lote 0 segue com Boni).

### Onde entra

- **Início:** nova seção "Da pergunta à peça, com a IA trabalhando e você decidindo." logo depois do topo, com as seis frentes e um botão "Conhecer a Mesa de trabalho" no topo. O título e o subtítulo aprovados por Boni **não mudaram**.
- **Produto:** a mesma seção abre a página; o título passa a "Mesa de trabalho e pesquisa com fonte, no site e na sua IA."
- **Como funciona:** passos próprios da Mesa (descreva, responda só o que falta, acompanhe, revise e salve a versão) antes dos da pesquisa por MCP.
- **Ferramentas e formas de uso:** a Mesa vem em primeiro lugar, e o cartão é mais completo.
- **Guia:** os quatro passos da Mesa dentro do cartão dela.
- **FAQ:** "O que é a Mesa de trabalho?" detalhada e duas perguntas novas, "O que a Mesa faz com meus anexos?" e "A Mesa usa créditos?".
- **Rodapé, metadados e imagem de prévia:** a Mesa entra na frase do rodapé, nas descrições e na imagem Open Graph (as duas versões foram refeitas).

### Cobrança da Mesa

O código mostra que os trabalhos da Mesa são medidos e cobrados (`COMMERCIAL_EXECUTION_ENABLED` ligada em produção, com reserva e liquidação). O texto anterior só dizia que a pesquisa válida é faturável, o que ficava incompleto. Agora Créditos, Início, Guia e FAQ dizem que **os trabalhos da Mesa usam créditos da conta, sem mensalidade, com saldo e consumo à vista**. **Nenhum valor é citado**: a tarifa da Mesa segue sem publicação (A24) e depende de Boni.

### Verificação

Vitest: 321 arquivos e 2.723 testes. Novos testes: seção da Mesa depois do topo e antes de "Por que o ForgeLex existe", as seis frentes com as frases que correspondem a funções, a Mesa antes do resto nas ferramentas e nas formas de uso, passos próprios em Como funciona, ids sem repetição nas seis páginas, créditos da Mesa sem preço, e nada disso com o modelo desligado. Mutações provadas: trocar o título de uma frente e inserir "Word" derrubam testes. Playwright: `public-model` 5 aprovados (agora conta as seis frentes) e suíte pública 18 aprovados, com axe sem violação. Linhas removidas conferidas: só o modelo novo muda; o clássico é o mesmo.

Reversão: desligar `VITE_FORGELEX_PUBLIC_MODEL` (o padrão), ou reverter o commit.

## U7 — Casos dentro da Mesa, parte 1: gerenciar casos (18/11/2026)

Sobre `main` em `f935b58`, na branch `claude/proxima`. Só no tema gelo (o seletor de caso da Mesa já é do gelo); o clássico e a tela "Casos" ficam como estão.

### Decisão de Boni sobre o escopo da U7 (18/11/2026)

A DEC-14 lista o que a Mesa deve absorver da tela "Casos" (criar e renomear caso, arquivar, restaurar e excluir caso e documento, importar PDF). O levantamento mostrou que a tela, que está no ar (flag de casos ligada em produção), também guarda **Fatos, Provas (com vínculo a fato e âncora), Linha do tempo, Questões jurídicas e Memorando de pesquisa**, e que a Mesa não tem nenhuma dessas funções. Remover a tela tiraria o único lugar onde o cliente vê e edita o que cadastrou. **Boni decidiu: manter como "Dados do caso".** A Mesa absorve a parte da DEC-14; a tela deixa de ser porta de entrada e passa a "Dados do caso", aberta a partir do caso na Mesa, com Fatos, Provas, Linha do tempo, Questões e Memorando intactos. O caso segue como eixo da busca ancorada (M4) e do MCP.

### Achado: renomear caso não existia

Nem o backend nem a tela "Casos" renomeavam caso (só criavam). Esta fatia acrescenta a rota.

### O que foi feito

| Camada | Mudança |
| ------ | ------- |
| Persistência | `MatterLifecycleRepository.rename`: título aparado, de 3 a 200 caracteres; mesma regra de gestão do ciclo de vida (sessão web, escrita, autor ou administrador); só caso ativo; o estado é conferido de novo no próprio `UPDATE`, então um arquivamento concorrente não é sobrescrito. **Não é transição:** a `lifecycleRevision` que as execuções capturam não muda. |
| API | `PATCH /api/v2/matters/:matterId` com `{ title }`, só sessão web: 403 para chave de API e OAuth e para quem não é autor nem administrador, 400 para título inválido, 404 para outro tenant, 409 para caso em arquivo ou lixeira (o guarda de ciclo de vida já existente). Cada renomeação aceita grava `matter.renamed` na auditoria. Documentada no OpenAPI (`MatterRename`, `MatterRenameResult`). |
| Mesa (gelo) | Botão **Gerenciar casos** no seletor de caso abre um diálogo com a lista (Em uso, Arquivados, Lixeira) e, por caso: **Renomear**, **Arquivar**, **Mover para a lixeira** e **Restaurar**, com a confirmação que já existia e que diz o efeito sobre o acesso da IA. O seletor acompanha a mudança, e um caso arquivado ou na lixeira deixa de ser o escolhido. O caso **em uso** na conversa ou peça aberta pode ser renomeado, mas não sair de uso. |
| Fica fora desta fatia | **Exclusão definitiva** (pede o nome do caso e acompanha o diário): continua na tela Casos, e o diálogo diz isso. Ciclo de vida **do documento** e importação de PDF. |

### Verificação

| Item | Resultado |
| ---- | --------- |
| Vitest | 322 arquivos e 2.725 testes. Novos: repositório (autor, administrador, chave, escopo, outro tenant, títulos inválidos, caso arquivado, revisão intacta), rota (cada ator e status, auditoria, OpenAPI) e modelo do gerenciador. Mutação provada: tirar a checagem de autorização do `rename` derruba o teste. |
| Playwright (gelo) | Suíte do gelo: 57 aprovados. Novo cenário: renomear (nome curto recusado em texto, nome válido atualiza lista e seletor), axe sem violação com o diálogo aberto, arquivar com confirmação, restaurar, seletor acompanha. Cenário do caso fixo estendido: o caso em uso pode ser renomeado e não aparece com Arquivar nem Lixeira. |
| Tipos, lint, formato | `tsc` (API e web), ESLint e `pnpm format:check:code` limpos. |

### Próximas fatias da U7

1. Documentos do caso na Mesa (arquivar, restaurar, excluir) e PDF como anexo.
2. A tela "Casos" vira **Dados do caso**, aberta a partir do caso na Mesa; `/app/casos` redireciona preservando links; o item "Casos" sai da lateral.
3. Decidir o destino da exclusão definitiva (ficar em Dados do caso ou ir para a Mesa).

Reversão: reverter o commit; a rota nova some e a tela "Casos" continua igual. A rota só existe depois de a API ser publicada.

## Retomada e reordenação das pendências (18/11/2026)

Sobre `main` em `d2c2d69` (merge do #196). Só documentação e conferência de código; nada foi publicado.

### CI do push do #196 (run 525)

Falhou só o `e2e-product`, em "Initialize containers": `failed to bind host port 0.0.0.0:55432/tcp: address already in use`
ao subir o Postgres de serviço. Nenhum teste rodou; os outros seis jobs passaram (inclusive `validate`, `postgres`, `e2e-desk`
e `e2e-public`). No PR, o mesmo job tinha passado. Boni reexecutou e passou. **Causa não provada.** O `ci.yml` (linhas 71 e 154)
mapeia o Postgres de serviço na porta fixa `55432:5432`; o `e2e-product` roda em `ubuntu-latest` (imagem 26.04 nessa execução),
enquanto o job `postgres` está fixado em `ubuntu-24.04`. Hipótese não testada: algo na imagem ou no host do runner ocupou a 55432.
Uma porta aleatória para o serviço (e a URL lida do mapeamento) removeria a dependência. Terceira instabilidade do
`e2e-product` registrada (ver `PENDENCIAS.md`).

### E2 — fechada

`rg` no `apps/web/src` (sem testes) por `.size`, `structuredClone`, `.at(`, `findLast`, `toSorted`, `Object.groupBy`,
`replaceAll`, `Object.hasOwn` e `randomUUID`. Nenhum outro `.size` sobre `URLSearchParams` (os demais são `File.size`, universal).
Há `Array.prototype.at`, `Object.hasOwn` e `crypto.randomUUID` (Safari 15.4 e Chrome 92–93; `randomUUID` só em contexto seguro,
e o site é HTTPS), coerentes com o alvo ES2022. Sem mudança de código. Limite: não medi a lista de navegadores suportados, que o
repositório não declara (`browserslist` ausente).

### Plano

`docs/superpowers/plans/2026-11-11-forgelex-plano-unificado.md`: estado atualizado para 18/11 (seção 1), nova seção 1A com as
pendências da mais antiga para a mais recente e quem as executa, E2 marcada, PR-U2 em andamento e S.5 corrigindo o S.4 (o Daybreak
foi publicado em 16/11; as caixas de S0 a S7 não foram marcadas na época e precisam de conferência).

## U1 · fechamento dos itens mortos (19/11/2026)

Sobre `main` em `6bd76e1`. Só `apps/web`; nada muda para o cliente de hoje (produção usa o modo comercial).

| Item da U0 | O que foi feito |
| ---------- | --------------- |
| `ConnectionChecklist.tsx` e `PlatformConnectionCard.tsx` | Removidos. `grep` confirmou que só eles mesmos se referenciavam. |
| `PRODUCT_TITLE` (`config/research-copy.ts`) | Removida: não tinha nenhum uso, nem interno. |
| `CANONICAL_ORIGIN`, `SectionHeader`, `responseExamples` | Perdem o `export`; só têm uso interno no próprio arquivo. |
| “Gerar proposta de teste” (decisão 3 da U0, que dizia “sai na U1” e não tinha sido feita) | `EditorialReviewPanel` só mostra a geração no modo `REAL`; o rótulo de teste e as bifurcações de `REAL` viraram código direto. `generate()` recusa qualquer modo diferente de `REAL`. O tipo mantém `SIMULATED`, que a API ainda devolve; os modos `COMMERCIAL` e `REAL`, a rota e o gerador simulado ficam. Nenhum teste referenciava o rótulo. |

**Não feito.** Os 9 tipos exportados sem uso: sem o `knip` (o `npx knip` foi bloqueado por baixar pacote fora do lockfile), uma busca por `grep` listou 38 tipos exportados sem uso externo, mas incluí-los todos ampliaria a mudança sem a lista aprovada da U0. Ficam como estão.

**Verificação.** `tsc` do web, ESLint e Prettier nos arquivos alterados; Vitest `apps/web` (61 arquivos, 467 testes) e `tests/public-*` aprovados depois do build; `playwright.editorial-review.config.ts` (3 cenários) aprovado. Não rodei a suíte completa, nem as demais configurações Playwright: ficam para a CI do PR.

Reversão: reverter o commit; os dois arquivos removidos voltam pelo Git.

## U3 · área proposta pelo texto, aviso de matéria sem apoio e aceite de três interações (19/11/2026)

Sobre `main` em `11fda82`. Regras `mesa-v3`; sem mudança de contrato, sem migração e sem provedor. A reconciliação do plano (as caixas da U3 estavam sem marcar) acompanha esta seção.

**O que mudou.**

| Item | Como ficou |
| ---- | ---------- |
| Área proposta pelo texto | Só na orientação inicial (`initialGuidance`), com o texto do pedido. Usa o ranqueamento local das peças, sem provedor e sem saldo. Propõe quando **todas as peças que empatam no topo são de uma única área** e nenhuma é transversal; texto vago, empate entre áreas, peça em mais de uma área, catálogo ausente ou texto vazio mantêm a lista das 25 áreas. A decisão nasce `proposed` e `origin: model`, sem campo novo no `GuidanceSnapshot`; o resolvedor de habilidades só lê área `confirmed` ou `known`, então a proposta não chega à execução antes da confirmação. |
| Pergunta | “Pelo que você informou, a área é: X. Está correto?”, com “Sim, é essa” e “Não, é outra” (e “Não sei”). “Sim” confirma; “Não” volta à lista e **a Mesa não propõe de novo** (só a orientação inicial propõe); “Não sei” segue com a área em aberto. A correção pelo resumo da própria confirmação (“Sim” para “Não”) reabre a área e tira a confirmação da peça, sem gravar “nao” como valor. |
| Matéria sem apoio | `MatterChips`: sem sugestão na primeira tentativa, a Mesa diz “Não encontrei uma matéria de apoio para essa descrição. Descreva de outro jeito ou siga sem matéria; o pedido segue como está.” (antes: “Não encontrei uma matéria para isso…”). **Redação corrigida no mesmo PR:** a primeira versão dizia “Ainda não temos orientação específica para essa matéria”, o que afirma a cobertura do catálogo; o ranqueamento é lexical e pode não achar uma matéria que existe, então a frase podia ser falsa. A nova descreve só o resultado da busca. A mensagem depois de uma recusa (“Não há outra matéria parecida…”) não mudou. O aviso da peça, de 17/11, usa a redação antiga e tem o mesmo limite (só aparece depois de o cliente explicar a peça em texto); não foi alterado. |
| Aceite “peça em até três interações” | Cenário E2E novo: do texto livre, área (sim), tarefa e peça (sim) = 3 interações, sem lista; conferido que o id da peça e as expressões não aparecem no HTML. |

**Verificação.** Vitest: 17 testes das regras `mesa-v3` (7 novos: proposta, três interações, recusa, “não sei”, casos sem proposta, correção e `mesa-v2` sem proposta), 8 do serviço de orientação (3 ajustados porque o catálogo de teste agora leva à proposta de área); `desk-guidance-v3` no Playwright: 11 aprovados (3 novos, com axe, incluindo celular). Fixture do E2E ganhou a peça sintética “Recurso ordinário trabalhista” (área única), sem alterar os outros cenários. `tsc` (web e API), ESLint e Prettier limpos nos arquivos alterados.

**Limite.** A proposta de área só dispara quando a peça de topo tem **uma** área. No catálogo de teste, peças como “Resposta à acusação” têm duas (`penal` e `processo-penal`) e, por isso, não geram proposta. A taxa de acerto e de disparo no catálogo real (2.077 fichas, fora do repositório) **não foi medida**; se for baixa, o próximo passo é decidir entre aceitar a primeira área da peça ou mostrar só as áreas candidatas.

**Continua aberto na U3.** Chips de área, tribunal e peça no compositor (V3 e U7) e a refinação por IA, que só vale se o ranqueamento errar mais do que a recusa resolve.

Reversão: reverter o commit; as orientações já gravadas não mudam (o contrato é o mesmo).

## CI · diagnóstico das três falhas intermitentes do `e2e-product` (19/11/2026)

Sobre `main` em `11fda82`. Método: evidência e reprodução antes de qualquer correção. Nada de produção muda (PostgreSQL em produção; o SQLite só existe em desenvolvimento e nos E2E).

### 1. `database is locked` (`agentic-commercial-flow.spec.ts`, 15/11): causa provada

`createDatabase` abria os arquivos SQLite com tempo de espera pela trava igual a zero (`libsql` usa `timeout = 0`). A conexão de apoio do teste (`UPDATE facts…` por fora do servidor) recebia `SQLITE_BUSY` na hora sempre que o servidor, em outro processo, estava no meio de uma transação de escrita; o resultado dependia do momento.

**Reprodução (dois processos).** Um processo segura a trava de escrita por 300 ms; o outro escreve: sem `timeout`, falha em 1 ms com `SQLITE_BUSY: database is locked`; com `timeout: 5000`, espera e conclui em 310 ms; com a trava segurada por 8 s, falha em 5 s. (Um primeiro experimento no mesmo processo enganava: a espera bloqueia o laço de eventos e a trava nunca era solta.)

**Primeira correção, errada, e por que voltei atrás.** Dar o tempo de espera a todo `createDatabase` quebrou `webhook-repository.test.ts`: `claimDueDelivery` trata `SQLITE_BUSY` como "outro worker já reivindicou" (`webhook-repository.ts:209`), e a espera de 5 s travou dois "workers" no mesmo processo. A falha do erro imediato é parte do desenho dali.

**Correção.** Opt-in `DatabaseConfig.busyTimeoutMs` (padrão: não esperar), usado só nas duas conexões de apoio do E2E que escrevem por fora do servidor. Teste de regressão `packages/persistence/src/db-busy-timeout.test.ts`: com o opt-in a escrita espera e conclui; sem ele continua recusando na hora.

### 2. `matter-lifecycle.spec.ts:48`, campo "Texto do documento" desabilitado (16/11): mecanismo provado, gatilho no CI não provado

O teste arquiva o caso por API, "por trás" da tela. A tela só passa a saber disso quando uma leitura do caso chega ao servidor **depois** do arquivamento. Duas leituras podem fazer isso: o evento `focus` da janela (`MatterWorkspaceScreen`, `refresh`) e a **carga inicial** do caso (`loadMatterResources`, 8 requisições) ainda em andamento. Reproduzi as duas com sondas (apagadas): disparar `focus` após o arquivamento, e reter a leitura inicial até depois do arquivamento. Nos dois casos o campo fica desabilitado e o `fill` estoura, o sintoma do CI.

**O que não sei.** Não reproduzi a falha em condição normal (16 de 16 passaram localmente, com 4 workers), então não provo que foi a carga inicial lenta, e não o `focus`, no runner do CI. A primeira é a hipótese mais forte (runner lento alonga a carga inicial), mas é hipótese.

**Correção (só no teste).** O teste de "resposta atrasada" passa a esperar as 8 respostas da carga inicial antes de arquivar (`openCase`). É comportamento correto da tela (caso arquivado em outro lugar vira somente leitura). Suíte `matter-lifecycle`: 30 passagens (5 testes × 6 repetições).

### 3. Porta 55432 em uso (`Initialize containers`, 18/11): causa não provada, mitigação aplicada

O erro ocorre no passo 2 do job, antes do checkout: algo no runner (imagem `ubuntu-latest`, 26.04 nessa execução) já escutava a 55432. O `e2e-product` mapeava `55432:5432` fixo e o `postgres` está fixado em `ubuntu-24.04`. Não há como inspecionar o runner antes desse passo (ele roda antes de qualquer `run`), então **a causa continua não provada**.

**Mitigação (decisão de Boni, 19/11/2026), só no job `e2e-product`.** O serviço publica `5432` (porta do host escolhida pelo Docker) e um passo novo, logo após o checkout, grava `FORGELEX_E2E_DATABASE_URL` em `$GITHUB_ENV` com a porta publicada (`job.services.postgres.ports['5432']`); o passo falha com mensagem clara se a porta não vier. Por que é seguro: os únicos leitores da porta nesse job são `playwright.config.ts` e `scripts/e2e-phase-7-server.mjs`, e os dois já leem a URL do ambiente (o 55432 era só o valor padrão); os demais E2E do job usam SQLite em arquivo. Se a variável não chegar, o erro é conexão recusada, alto e imediato. O job `postgres` (que também usa 55432) e o `docker-compose.yml` ficam como estão. Conferido localmente: YAML válido e o passo de shell com porta (grava a URL) e sem porta (sai com erro).

**O que não está provado.** A mudança só é exercitada pelo CI do PR. Como a falha era intermitente, uma passagem verde não prova que ela acabou: a mitigação elimina a dependência de uma porta fixa, mas não explica por que a 55432 estava ocupada.

### Verificação

Vitest: `packages/persistence` 250 testes aprovados (inclui `webhook-repository`); suíte completa registrada no PR. Playwright: `agentic-commercial-flow` 4 aprovados, `matter-lifecycle` 30 passagens. ESLint, Prettier e `tsc` do pacote `persistence` limpos.

Reversão: reverter o commit; o `busyTimeoutMs` não tem efeito sem ser passado.

## U7 · casos dentro da Mesa, parte 2: aba Documentos (19/11/2026)

Sobre `main` em `10edebc`. Só `apps/web`, só no tema gelo; sem rota nova, sem migração e sem mudança de contrato. O clássico e a tela "Casos" não mudam.

**Decisões de Boni (19/11/2026) que orientam a U7.** Documentos do caso numa **aba própria da peça**; salvar o anexo no caso por **botão explícito**; exclusão definitiva **em "Dados do caso"**. Sobre tirar "Casos" do menu do clássico: a recomendação é **só no gelo** (o clássico some na V7), e a confirmação dele **ainda não veio**.

**O que foi feito.**

| Item | Como ficou |
| ---- | ---------- |
| Aba | `DraftCanvas` ganha a aba **Documentos** entre Fontes e Revisão (`PieceTab` com `documentos`). Habilitada quando há caso; sem caso fica desabilitada. A ordem preserva as asserções de teclado existentes (`End` continua em Revisão). |
| Painel | `DeskCaseDocuments` (novo): lista os documentos do caso por visão (Em uso, Arquivados, Lixeira), com **Abrir**, **Arquivar**, **Mover para a lixeira** e **Restaurar**, pela confirmação já existente (`LifecycleDialog`, que diz o efeito sobre a IA). Abrir reaproveita o leitor da peça. Sem a exclusão definitiva. |
| Quem gerencia | Como na tela "Casos": criador do caso ou proprietário, e só com o caso em uso. Quem não gerencia vê a lista e abre os documentos. |
| Modelo | `documentLifecycleNotice` e `documentStateLabel`, com teste. |
| Rotas | Nenhuma nova: `GET /api/v2/matters/:id?view=` e `POST …/documents/:id/{archive,trash,restore}` já existiam. |

**Limite conhecido.** As abas só aparecem com uma **peça aberta**, mas os documentos pertencem ao caso: sem peça aberta o cliente não alcança a aba. O botão "Salvar no caso" no anexo (próxima fatia) funciona sem peça. Se isso incomodar, a alternativa é uma entrada no seletor de caso.

**Nota sobre a exclusão definitiva.** No caso ela pede o nome para confirmar; no documento, a confirmação existente **não** pede o nome (só o caso pede). A decisão de mantê-la em "Dados do caso" vale para os dois.

**Verificação.** Vitest do web: 61 arquivos, 470 testes (3 novos do modelo). `shell-gelo` (Playwright): 58 aprovados, 1 novo (listar, arquivar e restaurar com confirmação, abrir, sem excluir definitivamente, com axe) e 3 ajustados para a aba nova; o `writing-desk.spec.ts:292` só passa com `LANG=C.UTF-8` (limite conhecido da E7, já definido na CI). `tsc`, ESLint e Prettier limpos nos arquivos alterados.

**Não feito (próximas fatias).** Botão "Salvar no caso" no anexo (com trava contra clique duplo, já que a rota de ingestão não tem chave de idempotência); "Dados do caso", o redirecionamento de `/app/casos` e a saída do item "Casos" da lateral.

Reversão: reverter o commit; a aba some e nada mais muda.

## U7 · casos dentro da Mesa, parte 3: salvar o anexo no caso (19/11/2026)

Sobre `main` em `10edebc`, na mesma branch da parte 2. Só `apps/web` e só no tema gelo (decisão de Boni); sem rota nova, sem migração e sem mudança de contrato. Ele substitui na Mesa a importação de PDF da tela "Casos" (`PdfTextImport`).

**O que foi feito.**

| Item | Como ficou |
| ---- | ---------- |
| Botão | No chip do anexo pronto, "Salvar no caso", só no gelo e só com um caso escolhido que a lista de casos em uso conhece. Sem caso, o chip mostra uma dica (“Para guardar o texto de um anexo como documento do caso, escolha um caso.”) e nenhum botão. No clássico, nada muda. |
| O que grava | `POST /api/v2/matters/:id/documents`, só por sessão: título = nome do arquivo sem extensão (com “(texto reconhecido por OCR)” quando veio de OCR, porque o documento ganha âncoras citáveis e pode ter erros), `originalFilename` = `<arquivo>.txt` (convenção da importação de PDF; `.txt` e `.md` ficam como estão), `mimeType` `text/plain`, só o texto extraído (DEC-12). |
| Depois de salvar | O chip diz “Salvo no caso “X” como “Y” (N parágrafos)” e avisa que o documento salvo **não muda** se o texto for editado depois. O botão some. Trocar ou remover o anexo apaga o “salvo”; outro caso é outro destino. |
| Recusa | `saveFailureMessage` traduz os códigos estáveis da S5 (`DOCUMENT_TEXT_TOO_LARGE`, `DOCUMENT_ANCHOR_LIMIT_EXCEEDED`) e `MATTER_NOT_FOUND`; a nova tentativa funciona. |

**Duas travas contra duplicação.** A rota de ingestão não recebe chave de idempotência e cada chamada cria um documento (não achei busca por duplicata pelo hash do conteúdo). Por isso: uma chamada em andamento barra outra igual (`createSingleFlight`) e um anexo já salvo não é salvo de novo. A regra mora em `createSaveController`, sem React, para ser testada.

**Achado na verificação: o E2E sozinho não provava as travas.** Com as duas travas desligadas, o cenário de clique duplo continuou passando, porque o botão desabilitado da própria interface barra o segundo clique depois do redesenho. As travas cobrem a corrida *antes* do redesenho, e isso só os testes unitários provam. Mutação feita: sem a trava de chamada em andamento, 2 testes quebram; sem a de anexo já salvo, 1 quebra; restauradas.

**Verificação.** Vitest do web: 63 arquivos, 484 testes (controlador, trava, construção do documento e mensagens). Playwright: `attachments-gelo` (novo, 2 cenários, com axe: sem caso só a dica; com caso grava uma vez, “não muda depois”, trocar apaga o salvo; recusa em texto e nova tentativa) e `attachments` (10; o novo prova que **no clássico, mesmo com caso vinculado, não há botão nem dica**), `desk-guidance-v3` (11) e `shell-gelo`. O novo spec entra no job `e2e-desk` do CI. Um seletor de teste meu casava com a opção “Escolha um caso” do tema clássico (texto já existente); troquei por uma busca pelo texto completo da dica. `tsc`, ESLint e Prettier limpos nos arquivos alterados.

**Limites.** (1) O texto de OCR que o cliente editou depois de salvar não altera o documento salvo; o aviso diz isso, mas não há “atualizar o documento”. (2) Texto muito grande esbarra nos tetos da S5 (1 MiB, 5.000 linhas com conteúdo), e o cliente é orientado a dividir o arquivo. (3) A aba Documentos só aparece com uma peça aberta, mas o botão do anexo funciona sem peça. (4) Ainda não medi com PDF real de produção; só textos sintéticos.

Reversão: reverter o commit; o botão some e nada mais muda.

### Achado na verificação da parte 3: `shell-gelo.spec.ts:278` já era intermitente (19/11/2026)

Uma execução completa do `shell-gelo` falhou no cenário de acessibilidade da casca nova, que passou isolado. **Não é desta mudança:** repetido na `main` limpa (`git stash`), falhou 4 vezes em 16 com 3 workers. O axe acusa contraste de 2,56 a 3,58 sempre no botão primário “Abrir a jurisprudência” da Visão (`<button class="btn-primary …">`), com cores intermediárias (por exemplo #d4dee0 sobre #3a7988), o que indica leitura no meio de uma troca de cor.

**Hipótese, não provada.** `.btn-primary` tem `transition` de 160 ms (`index.css`), e a ação da Visão pode mudar de estilo quando os dados de “Primeiros passos” chegam, depois de a página já parecer pronta. **Tentativa que não funcionou:** esperar `document.getAnimations()` terminar antes de cada leitura do axe; 3 falhas em 24, sem diferença do que a `main` já tinha. Desfeita; nada foi alterado no spec. Próximo passo: esperar um sinal de que os dados da Visão chegaram (e não só as animações em curso) antes da primeira leitura. Registrado na seção 1A do plano (item 15). O spec roda no `e2e-desk`, que não é check obrigatório.

### Correção da aba Documentos depois da CI (19/11/2026)

O `e2e-desk` do commit da parte 2 falhou **por defeito meu**, não pela intermitência conhecida: no painel Documentos havia dois `role="status"` ao mesmo tempo (o aviso da operação e o "Carregando documentos…"), e o seletor do meu teste exigia um só. Localmente a recarga era rápida demais para coincidir; o runner da CI era mais lento.

O seletor frágil era o sintoma; o defeito real era de interface: depois de arquivar, a **lista inteira sumia** atrás de "Carregando documentos…" até a recarga terminar (piscada, e dois avisos de estado). Reproduzi primeiro com um teste que segura a recarga e exige a lista à vista (falhou: `Documento dois` não visível), depois corrigi: a recarga depois de uma operação (`keepList`) mantém a lista, e "Carregando…" fica só para a primeira carga e a troca de visão; trocar de visão limpa o aviso anterior. Os avisos nos testes passam a ser buscados pelo texto, não só pelo papel. Resultado: os 4 cenários da aba (3 antigos ajustados, 1 novo) passam 6 vezes seguidas com 3 workers.

## U7 · casos dentro da Mesa, parte 4: Dados do caso (19/11/2026)

Sobre `main` em `10edebc`, na mesma branch das partes 2 e 3. Só `apps/web` e só no tema gelo; sem rota nova de API, sem migração e sem mudança de contrato. O clássico não muda.

**Princípio (Boni, 19/11/2026).** Arquitetura, fluxo e interface devem ser fáceis de usar e fluidos: intuitivos, práticos e sem dificuldade para o cliente. Daí as escolhas abaixo: o caminho para o caso está **onde o cliente já está** (na Mesa), e a volta **leva de volta ao mesmo caso**.

| Item | Como ficou |
| ---- | ---------- |
| Lateral | O item "Casos" **sai** da lateral do gelo (continua só se a Mesa estiver desligada, porque aí a tela Casos é o único lugar dos casos). Em Dados do caso, o item **Mesa** fica aceso. |
| Rota | O caminho é o mesmo (`/app/casos`), então nenhum link antigo quebra. **Sem `?caso=`** abre a Mesa (e o desvio não entra no histórico); **com `?caso=`**, é a tela Dados do caso. Regra pura em `iceCaseDestination`. |
| A tela | O título e o `h1` passam a ser "Dados do caso", com o subtítulo do que ela guarda e o botão **← Voltar à Mesa**, que leva à Mesa **com o mesmo caso escolhido** (lê a URL na hora do clique, porque a tela troca de caso sem recarregar). O cabeçalho antigo ("Área do caso") some no gelo para não haver dois `h1`. Fatos, provas, linha do tempo, questões, memorando e exclusão definitiva continuam como estavam. |
| Entradas a partir da Mesa | (1) Botão **Dados do caso** ao lado do seletor, só com caso escolhido. (2) No gerenciador de casos, cada linha tem **Dados do caso**, e a de um caso **na lixeira** tem **Excluir definitivamente…**, que abre a tela **direto na lixeira** (`?visao=trash`), onde mora a exclusão. (3) Na aba Documentos, o texto da exclusão definitiva virou um botão **Dados do caso** que abre a lixeira de documentos (`?documentos=trash`) quando a visão é essa. |
| Textos | "na tela do caso" e "use a tela Casos" viraram "em Dados do caso" ou um botão, em vez de uma instrução que o cliente precisa seguir sozinho. |

**Verificação.** Vitest do web: modelo de rotas e de navegação (89 testes, 7 vermelhos antes da implementação). Playwright no gelo: 4 cenários novos (lateral e redirecionamento; entrada pelo seletor; caso na lixeira até a exclusão; aba Documentos até Dados do caso), com axe na nova tela. **Mutação:** com a regra de redirecionamento desligada, o cenário falha (`/app/casos` não vira a Mesa). Os specs compartilhados que clicavam em "Casos" para sair da Mesa (`writing-desk`, `agentic-workspace`, `shell-gelo`) passam a usar "Jurisprudência" no gelo e continuam com "Casos" no clássico.

**Limites.** (1) Quem usa o gelo sem a Mesa (configuração que não é a de produção) continua com o item "Casos" e o título "Dados do caso". (2) "Criar caso" dentro da tela continua existindo, mas o caminho natural é pela Mesa. (3) A tela ainda é a mesma de 904 linhas; reorganizá-la por dentro (por exemplo, dividir em abas) não foi feito e seria outra etapa.

Reversão: reverter o commit; o item "Casos" e o caminho antigo voltam.

### Item 15 resolvido: a intermitência do `shell-gelo.spec.ts:278` tinha causa de produto (19/11/2026)

**Causa, provada.** A Visão decidia o estado dos "Primeiros passos" com dados que chegam depois (conexão da IA e lista de casos), e as leituras que falhavam eram engolidas. Até a resposta, "conectar" e "criar caso" contavam como pendentes e o primeiro era destacado; quando os dados chegavam, o destaque **pulava** para "Abrir a jurisprudência" (`btn-secondary` → `btn-primary`), que tem `transition` de 160 ms. Medido no navegador logo depois do login: o botão aparece `secondary` (fundo branco) a 124 ms, vira `primary` a 165 ms e as cores calculadas atravessam a transição; em 244 ms valem `rgb(58,121,136)` e `rgb(212,222,224)`, **exatamente** o `#3a7988` e `#d4dee0` que o axe acusava (contraste 3,58). O teste lia a página dentro dessa janela, por isso a taxa dependia da velocidade da máquina (4 falhas em 16 na `main` limpa).

**O que não resolveu (e foi desfeito).** Esperar `document.getAnimations()` terminar antes do axe: o botão ainda nem tinha trocado de estilo quando a espera rodava (3 falhas em 24).

**Correção, na origem (e boa para o cliente, não só para o teste).** O estado dos passos só aparece quando se sabe o resultado das leituras que o definem, com resposta **ou com falha** (`stepsReady`, `useOverviewData` com `settled`). Antes disso há um esqueleto do mesmo tamanho (sem pular o layout), "Verificando…" no lugar da contagem e um aviso de estado para leitores de tela. Quem usa a Visão deixa de ver o destaque trocar de lugar depois de a página parecer pronta.

**Verificação.** `stepsReady` com teste (vermelho antes). Cenário E2E novo: com a lista de casos presa, não há "Falta este", "Feito", botões nem contagem; depois de liberar, o estado final aparece, **nada anima** (`document.getAnimations()` vazio) e o botão destacado não muda em 400 ms. **Mutação:** com `stepsKnown` sempre verdadeiro, o cenário falha. O cenário de acessibilidade, que falhava cerca de 1 em 4, passou **32 de 32** repetições com 3 workers (por acaso seria cerca de 0,01% se nada tivesse mudado). Isso não é prova de 0%, mas a causa foi medida e eliminada, não só escondida.

### Aceite visual da U7 e da Visão: preparado (19/11/2026)

**Reaproveitamento (sem refazer a "mesa visual").** A ferramenta `visual-baseline` já capturava as telas com dados; acrescentei a ela só as telas novas (`u7Screens`: aba Documentos, “Salvar no caso” antes e depois, o gerenciador com um caso na lixeira e a Visão com o esqueleto) e fiz o `--only` aceitar uma lista. Um caso à parte e título por tamanho, para não alterar as capturas antigas. Nova `scripts/visual-review-page.mjs`: gera **um HTML único** (imagens em JPEG comprimido, 1,6 MB para 18 imagens) a partir de uma pasta de capturas e de um manifesto (`docs/operations/visual-review/2026-11-19-u7-e-visao.json`: 7 telas, o que olhar em cada uma). Cada tela tem um veredito (Aprovado, Ajustar, Não vi) e uma nota; o **resumo em texto** fica fixo no pé da página, com “Copiar” e “Baixar .txt”, porque no A19 depender do armazenamento do navegador deixou o registro vazio. Da próxima vez basta um manifesto novo.

**Evidência.** 12 telas do app e 18 dos dados capturadas no tema gelo, desktop (1440 px) e celular (390 px); **axe sem violação em todas**. A página foi aberta no navegador: 18 de 18 imagens carregam, sem erro de JavaScript, e o resumo reflete vereditos e notas.

**Achado do aceite, corrigido (de produto).** Na captura do celular, “Salvar no caso” não aparecia. Causa: um endereço com `?matterId=` faz a Mesa abrir **a peça** (`hasDeskPiece`), e no celular isso mostra a aba “Peça” (uma minuta em branco, com o caso travado) e esconde a Conversa, onde ficam o compositor e os anexos. Isso atingia também o meu botão **← Voltar à Mesa**, que voltava por `?matterId=`. Agora ele chama `setActiveTab('work')`: como a Mesa fica montada enquanto se está em Dados do caso, o cliente volta **exatamente onde estava** (conversa, texto digitado e caso escolhido). Cenário novo cobre o caminho principal (o anterior só usava link direto); mutação: voltando por `?matterId=`, ele falha.

**O que não cobre.** Estados que não são fotografados: o seletor aberto, o diálogo de confirmação de arquivar, e a Mesa durante uma execução. Link direto para Dados do caso, sem ter passado pela Mesa, volta para a Mesa limpa, sem o caso escolhido. A decisão de aceitar é de Boni.

## 19/11/2026 — Trava de produto e fim de "Dados do caso"

Decisão de Boni: a Mesa agêntica é a única superfície; agentes nos bastidores; visual limpo. Registrada como **trava inegociável** no `AGENTS.md` e no plano (seção 2). No gelo, "Dados do caso" deixou de existir: `/app/casos` (com ou sem `?caso=`) abre a Mesa; os botões e a moldura saíram; a exclusão definitiva (pede o nome do caso; documento, o id) passou a viver no gerenciador de casos e na aba Documentos da Mesa. A tela `MatterWorkspaceScreen` continua só no clássico, que sai com a V7; os fatos, provas e memorandos que ela editava devem passar a ser organizados pelos agentes, sem formulário (próxima fatia). `writing-desk.spec.ts` "edição local, exportação" falha neste container também sem esta mudança (download do Word).

## A0 — Avaliação offline

Em 14/11/2026, Boni autorizou A0 e A1 em modo offline. Base de código `5fb4dee293981d58df99b9377a6916a83810da90`. O [ensaio](../../packages/legal-workflows/src/agentic-case-task/api-prompts-offline.test.ts) usa as tarefas e documentos D03/D04 do corpus do executor, cenários derivados e a rubrica jurídica existente. Cada papel devolve uma resposta fixa pelo `FakeAgentProvider`. A pesquisa usa resultados locais, e `fetch` é bloqueado durante os testes.

O controle anterior à correção passou em 8/8. As duas versões históricas da Mesa emitiram os hashes de contrato `b638f35a5c194d0be4903e136db7673f2ba3b766fd5f9c3ca8bb05e0f713c523` (v11) e `0dbb3f5ea7bf95be5ee1aadc60e54af6a05ad6e207de01673b5834ff5c9c59ad` (v12). SHA-256 do relatório inicial `08ecef26b25d31cb72f071e799e43aa0ec00542755c488b75e7b61a51a609dfa`.

| Cenário | Resultado técnico com respostas fixas |
| --- | --- |
| Quitação sem comprovante | Revisão com ressalva e apontamento sustentado pela fatura |
| Minuta com urgência sem prova | Minuta condicionada, com requisitos pendentes |
| Prazo sem marco e calendário | Pergunta pelos dados indispensáveis, sem entrega de data |
| Precedentes em posições opostas | Ambas as fontes e correspondência literal registradas |
| Autoridade ausente do corpus | Resultado limitado, sem referência criada |
| Relatos contraditórios | As duas versões e suas origens preservadas |
| Edição de seleção | Troca localizada, com offsets UTF-16 e preservação de quebras e seções |
| Gramática e soma | Revisão aponta a soma divergente e preserva as parcelas e a peça |

O teste exporta, quando solicitado, hashes das entradas, do contrato e do prompt de cada papel, rota de papéis, desfecho, rubrica e parâmetros/tarifas da política corrente. Para reproduzir em PowerShell:

```powershell
$env:FORGELEX_API_PROMPTS_OFFLINE_VARIANT = 'baseline'
$env:FORGELEX_API_PROMPTS_OFFLINE_REPORT = Join-Path $env:TEMP 'forgelex-a0-baseline.json'
pnpm exec vitest run packages/legal-workflows/src/agentic-case-task/api-prompts-offline.test.ts
$env:FORGELEX_API_PROMPTS_OFFLINE_VARIANT = 'candidate'
$env:FORGELEX_API_PROMPTS_OFFLINE_REPORT = Join-Path $env:TEMP 'forgelex-a1-candidate.json'
pnpm exec vitest run packages/legal-workflows/src/agentic-case-task/api-prompts-offline.test.ts
```

## A1 — Instruções operacionais

O prompt v12 de EDIT juntava a instrução histórica de devolver o documento inteiro à exigência de retornar `editProposal`. A versão 13 do workflow usa o perfil `1.14.0`, disponível por seleção explícita no motor. O perfil revisado envia um contrato de edição por seleção, orienta a pesquisa por questão e distingue suporte integral de parcial na verificação. A regra anterior de `deliveryImpact` já descrevia quitação sem prova, minuta condicionada e prazo sem dados indispensáveis. Os testes exercitaram essa regra e o reaproveitamento de uma resposta existente.

Foram aprovados 11 testes no controle e 11 no perfil revisado, incluindo suporte parcial, resposta já registrada e edição sem seleção. Os dois relatórios tiveram os mesmos hashes de entrada, desfechos e status por cenário. A edição com seleção retomou um checkpoint original mesmo ao alternar a versão configurada para novas execuções. As suítes de agentes, workflow e resultado cobrável somaram 363 testes aprovados e 1 ignorado. Build, verificação de tipos, lint e formatação do código alterado passaram.

O perfil comercial padrão continua selecionando os contratos históricos. O ensaio valida composição dos prompts, roteamento, contratos e persistência da entrega simulada. Comparação semântica de modelos, custo e latência real e avaliação jurídica de Boni ficam em A3. Nenhuma chamada paga, publicação ou mudança de política financeira foi realizada.

## A2 — Perfis por papel e orçamento

Em 14/11/2026, Boni autorizou a preparação e a validação offline. Os [perfis versionados](../../packages/billing-ledger/src/commercial-inference-profiles.ts) cobrem os sete papéis da Mesa e o editor final. A matriz usa Terra para classificação, análise factual, pesquisa e conferência literal, Sol para assessoria processual, redação e revisão, e Luna para edição final. O teto é de 2.048, 4.096 ou 8.192 tokens, conforme o papel.

| Conjunto | Variável de avaliação |
| --- | --- |
| `a2-output-v1` | Tetos por papel, com Sol e esforço low |
| `a2-roles-v1` | Modelo e esforço por papel, com os mesmos tetos |
| `a2-escalated-v1` | Configurações de maior esforço selecionadas explicitamente para o ensaio |
| `a2-verbosity-v1` | Verbosidade low ou medium por papel, com Sol, esforço low e teto de 2.048 |

Modelos e tarifas de contexto curto conferidos na [tabela oficial](https://developers.openai.com/api/docs/pricing) e parâmetros na [referência de Responses](https://developers.openai.com/api/reference/resources/responses/methods/create). A composição de avaliação usa transporte injetado com chave sintética. O runtime comercial padrão continua disponível com Sol, esforço low e 2.048 tokens. Escalonamento automático por ambiguidade e escolha de perfil em produção dependem de evidência da A3.

A reserva vincula o conjunto de perfis à execução. Cada chamada registra o papel e usa o teto e a tarifa correspondentes ao reservar, enviar e liquidar. O transporte informa o mesmo teto no prompt e no payload. A reserva usa bytes serializados mais margem de 8.192 para entrada e o teto inteiro para saída, sem supor desconto de cache. Mantidos os limites de exposição, chamadas, tempo e carteira. Uma chamada recusada pelo ledger termina antes do envio e preserva o uso liquidado. A trilha registra perfil, uso, raciocínio quando reportado, truncamento e duração, sem conteúdo do pedido.

Os ensaios usaram respostas simuladas e ledger local em memória. Verificaram os tetos no payload, a reserva antes do envio, a liquidação de uma saída truncada, a recusa abaixo da reserva mínima e acima da exposição remanescente, e a retomada com tarifas fixadas e reenvio bloqueado por idempotência. As sete suítes pertinentes passaram com 134 testes. Build, verificação de tipos, lint, formatação do código da A2 e git diff --check passaram. Nenhuma chamada paga ou ativação foi realizada.

## A3 — Comparação preparada e orçamento

Em 14/11/2026, Boni autorizou a preparação offline e pediu o orçamento antes de qualquer chamada paga. O [executor offline](../../scripts/forgelex-final-evaluation/api-prompts-a3-offline.mjs) gera pacote com hash, rubrica, versões de contrato, parâmetros, oito entradas congeladas, rotas, custos por chamada e o ledger local de avaliação. Ele recebe `current` ou `revised` para simular a escolha de prompts na segunda fase.

- Primeira comparação, 16 execuções. Prompts atuais e revisados, com Sol, esforço low e 2.048 tokens.
- Segunda comparação, 16 execuções. Mesmo prompt escolhido após a primeira fase, com Sol fixo de um lado e os perfis `a2-roles-v1` de outro. Os prompts revisados serviram como premissa para o cálculo abaixo. A escolha jurídica cabe a Boni.
- Nos quatro braços, corpus fechado e sintético, capacidade de pesquisa local, `store: false`, ferramentas sem paralelismo, cache explícito sem breakpoint e schema padrão. Os experimentos de cache e schema ficam fora das 32 execuções.
- A rubrica registra cobertura, fidelidade, suporte e utilidade por cenário. Uma pergunta indispensável em A03 conta como resultado esperado. A avaliação real deve registrar denominadores, erros de schema, falhas, tokens, custo e exposição, mediana e P95 de latência por papel e execução.

### Orçamento calculado

| Braço | Execuções | Chamadas na simulação | Estimativa em US$ | Soma das reservas simuladas em US$ |
| --- | ---: | ---: | ---: | ---: |
| Prompts atuais, Sol fixo | 8 | 25 | 0,312568–0,881102 | 1,659778 |
| Prompts revisados, Sol fixo | 8 | 25 | 0,313342–0,882656 | 1,662888 |
| Prompt selecionado, Sol fixo | 8 | 25 | 0,313342–0,882656 | 1,662888 |
| Prompt selecionado, perfis por papel | 8 | 25 | 0,214136–0,950496 | 1,483178 |
| **Total** | **32** | **100** | **1,153388–3,596910** | **6,468732** |

A faixa usa as solicitações iniciais serializadas pelo SDK em cada papel observado. O cenário inferior supõe quatro bytes por token de entrada e 512 tokens de saída por chamada. O cenário superior supõe dois bytes por token de entrada e uso integral do teto de saída. São cenários de planejamento. Chamadas adicionais, handoffs mais extensos e raciocínio real podem alterar rota e consumo. A soma de reservas considera bytes serializados mais 8.192 e saída integral. Como o ledger liquida cada chamada antes da próxima e para diante de custo incerto, essa soma expressa margem conservadora sobre as rotas simuladas, sem representar saldo simultaneamente reservado.

O limite de US$ 0,60 por execução, com até 24 chamadas e cinco minutos, resulta em exposição máxima de **US$ 19,20** para 32 execuções. Para limitar a autorização, a proposta é **US$ 3,50 agregados para a primeira fase** e **US$ 7,00 acumulados** para as duas fases, incluindo custos incertos. Um teto menor pode interromper a rodada se a rota real crescer. Valores em USD de inferência antes de câmbio e tributos, com tarifas Standard de contexto curto da [OpenAI](https://developers.openai.com/api/docs/pricing), zero escrita de cache prevista e sem desconto por leitura.

### Evidência offline e pendências

O pacote simulado encerrou 28 entregas e quatro perguntas esperadas. SHA-256 do pacote reproduzido: 50506364f43a997ff5c7d529776b958fab6cf1e72b3512d92c5947541a786357. Passaram 63 testes de provider e workflow, oito testes do ledger de avaliação, build, verificação de tipos, lint e formatação dos arquivos novos e dos ajustes de transporte. Registrou 100 chamadas sintéticas sem custo incerto. A prova de precificação usa os valores de uma resposta sintética fixa e não estima uso real a partir dela. O comando para reproduzir é `node scripts/forgelex-final-evaluation/api-prompts-a3-offline.mjs revised`.

O ensaio de schema habilitou `strict: true` por opção apenas em `task.get_sources` com objeto fechado sem parâmetros. O handoff `task.submit` conserva os opcionais e sua validação Zod. A taxa de erros do modelo fica para experimento separado. [Contrato de ferramentas da OpenAI](https://developers.openai.com/api/docs/guides/function-calling).

O cache implícito pode escrever até o fim de uma mensagem dinâmica elegível. O breakpoint explícito após instruções estáveis exige um bloco de desenvolvedor em `input`. O próximo ensaio sintético deve medir escrita e leitura por duração, limitar o breakpoint ao conteúdo estável e testar isolamento do contexto por cliente antes de qualquer adoção. O transporte atual agora cobre recusa de escrita tarifada tanto no contador agregado quanto em detalhes por duração, retendo custo incerto. [Documentação de prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

O executor disponível nesta etapa trabalha somente offline. A campanha paga precisa de autorização explícita, seleção de prompts após a primeira fase e ligação da composição real ao pacote e ao ledger da campanha. Toda inferência real e avaliação jurídica permanecem pendentes.

## A3 — Fase 1 executada em 14/11/2026

Boni autorizou os dois braços de prompts, oito casos cada, com teto agregado de **US$ 3,50** incluindo custos incertos. O executor usou apenas o corpus sintético, pesquisa local, `gpt-6.1-sol` com esforço `low`, teto de 2.048 tokens e a configuração comercial de cache. A prévia pelo mesmo caminho de SDK e ledger passou nos 16 casos com 54 chamadas simuladas. A etapa real encerrou 16 execuções e 37 chamadas, sem repetições e sem iniciar a segunda fase.

| Métrica | Prompts atuais | Prompts revisados |
| --- | ---: | ---: |
| Entregas | 4/8 | 4/8 |
| Perguntas que interromperam o fluxo | 3/8 | 2/8 |
| Falhas de contrato | 1/8 | 2/8 |
| Chamadas liquidadas | 17 | 20 |
| Tokens de entrada / saída | 55.043 / 4.955 | 72.472 / 8.329 |
| Custo calculado | US$ 0,159636 | US$ 0,228234 |
| Mediana / P95 por execução | 9,27 s / 21,84 s | 8,22 s / 66,26 s |
| Mediana / P95 por chamada | 4,41 s / 9,88 s | 4,80 s / 13,03 s |

Custo total calculado pelos tokens **US$ 0,387870**, sem tokens em cache, sem reserva incerta e com 37 chamadas liquidadas. P95 usa posto mais próximo e é descritivo. O tempo por execução inclui perguntas e falhas. A minuta adicional do braço revisado levou 66,26 s e custou US$ 0,093816.

| Caso | Atual | Revisado |
| --- | --- | --- |
| A01 · Quitação | Revisão limitada | Revisão limitada |
| A02 · Urgência | Pediu o tipo de peça | Minuta condicionada de cinco seções, com fundamentos pendentes |
| A03 · Prazo | `ACTION_CONFLICT` | `ACTION_CONFLICT` |
| A04 · Posições opostas | Pediu tema e corpus | Pediu tema e corpus |
| A05 · Autoridade fictícia | Pediu identificação | Pediu identificação |
| A06 · Datas divergentes | Preservou os dois relatos com ressalva sobre evento e ano | `ACTION_CONFLICT` |
| A07 · Seleção | Edição exata com CRLF e conteúdo externo preservados | Edição exata com CRLF e conteúdo externo preservados |
| A08 · Gramática e soma | Revisão entregue | Revisão entregue |

`ACTION_CONFLICT` ocorreu quando o plano sugeriu ação diferente da ação vinculada à execução. Nos casos A04/A05, os dois braços pediram esclarecimento antes de chegar ao pesquisador, portanto a rodada não aferiu os prompts de pesquisa ou de verificação de autoridades. Os resultados de A02 e A06 mostram ganhos e perdas distintas, com uma tentativa por caso. A avaliação jurídica e a escolha do braço ficam com Boni.

Diretório local `%TEMP%/forgelex-a3-phase1-real-fb8149c2b7f1444b8d162b47b2feef9f`. Contém 16 resultados, trilha por papel, pacote, resumo e ledger. SHA-256 do pacote `7b3a500f1380902beeaff47ee8f09d20d2612cd2bcfd2e075c1541146a2d3b69`, do resumo `937ecd6d9ffa2ee2b4a597a100b532f9e64208fa5bd09c4105d1efb8ec5580a5`. Ledger e formatação verificados juntamente com o ensaio offline.

## A3 — Diagnóstico de ACTION_CONFLICT e revalidação offline

Em 14/11/2026, a primeira fase paga registrou `ACTION_CONFLICT` em A03 nos dois braços e em A06 no braço revisado. O erro ocorre quando `plan.action` difere da ação vinculada pelo servidor. O orquestrador recebia o objetivo textual, enquanto a ação vinculada aparecia apenas na validação do workflow. A ação que o modelo tentou devolver nos três casos não consta da trilha histórica.

O orquestrador passou a receber `boundAction` na política confiável. A instrução exige o mesmo identificador em `task.submit.action` e orienta registrar lacuna impeditiva sem mudar a ação. A rejeição de divergência continua ativa. A07 e os testes de retomada preservam os contratos históricos. Como a política do orquestrador mudou nos dois braços, resultados antigos podem servir como histórico, e uma nova comparação completa usa as 16 execuções com a mesma revisão do contrato.

- **A03** declara que faltam data de intimação e calendário. Espera a pergunta necessária, sem data calculada.
- **A04** delimita a suficiência da prova de entrega de equipamento e nomeia o corpus fechado P-01. A simulação chegou ao pesquisador e ao verificador, com dois suportes rastreáveis.
- **A05** dá o identificador e a origem alegada da referência sintética X00. A simulação chegou ao pesquisador, consultou o corpus e registrou `SEARCH_NO_RESULTS`.
- **A06** explicita que os relatos tratam do mesmo equipamento e do mesmo ano. A análise preservou as duas datas e suas origens.

Passaram 77 testes do workflow e de compatibilidade, build, verificação de tipos, lint e formatação dos arquivos ajustados. Os quatro braços passaram nas 32 simulações. O executor da primeira fase passou nos 16 casos com 54 chamadas sintéticas, duas perguntas esperadas e nenhum custo incerto. SHA-256 do pacote atualizado `9f572b790fee104fccad1917db729ffb8483faa91a545e7de83b7c006937759b`.

| Reexecução proposta | Execuções | Chamadas simuladas | Custo estimado | Soma das reservas simuladas | Teto proposto com incerteza |
| --- | ---: | ---: | ---: | ---: | ---: |
| A03–A06 nos dois braços, para confirmar as correções | 8 | 22 | US$ 0,277818–0,780902 | US$ 1,471676 | US$ 1,75 |
| Primeira fase integral, para comparar prompts sob o contrato corrigido | 16 | 54 | US$ 0,683160–1,919230 | US$ 3,617222 | US$ 3,50 |

São opções alternativas. O cálculo usa as reservas do executor completo, incluindo o turno adicional de consulta em A04/A05. Mantém as hipóteses de entrada e saída do orçamento anterior e as [tarifas oficiais](https://developers.openai.com/api/docs/pricing). A soma das reservas é conservadora. O ledger liquida a chamada antes da próxima e impede uma nova reserva que exceda o teto. Os oito casos focados confirmariam os pontos afetados, enquanto a execução integral também reavaliaria A01, A02, A07 e A08 com a nova instrução. Nenhuma inferência paga foi feita nesta revisão.

## A3 — Reexecução da primeira fase com os ajustes

Em 14/11/2026, Boni autorizou 16 novas execuções da primeira fase com teto adicional de US$ 3,50, incluindo custo incerto. O pacote validado offline foi executado com Sol, esforço low e teto de 2.048 tokens. As 16 execuções fizeram 44 chamadas liquidadas. Uso calculado de **US$ 0,431990**, exposição igual ao uso e nenhuma reserva incerta. Somada à rodada original, a primeira fase acumulou US$ 0,819860. A segunda fase segue pendente.

| Métrica | Prompts atuais | Prompts revisados |
| --- | ---: | ---: |
| Entregas / perguntas / falhas | 6 / 2 / 0 | 6 / 2 / 0 |
| Chamadas | 22 | 22 |
| Tokens de entrada / saída | 72.563 / 7.140 | 72.767 / 6.993 |
| Custo pelos tokens | US$ 0,216526 | US$ 0,215464 |
| Mediana / P95 por execução | 13,72 s / 29,87 s | 12,81 s / 30,12 s |
| Mediana / P95 por chamada | 4,92 s / 10,90 s | 4,62 s / 10,32 s |

Cache reportado em zero. P95 usa posto mais próximo e é descritivo. As métricas de execução incluem perguntas.

| Caso | Resultado observado nos dois braços |
| --- | --- |
| A01 · Quitação | Entregaram revisão com ressalva sobre a falta de comprovante. |
| A02 · Urgência | Pediram o tipo de peça antes de redigir. A minuta do braço revisado na rodada original não se repetiu. |
| A03 · Prazo | Listaram os dados faltantes, sem calcular uma data. Produziram entrega limitada em vez da pergunta esperada na simulação. |
| A04 · Posições opostas | Pediram os registros do P-01 antes do pesquisador. O braço revisado apontou que a ferramenta não estava acessível naquele passo. A comparação positiva de fontes e o verificador continuam sem evidência real. |
| A05 · Autoridade fictícia | Chegaram ao pesquisador e registraram resultado vazio e X00 sem validação no corpus. |
| A06 · Datas divergentes | Preservaram as duas datas e suas origens, sem escolher a data efetiva. |
| A07 · Seleção | A alteração foi exata nos dois braços, com CRLF e conteúdo fora da seleção preservados. |
| A08 · Gramática e soma | Entregaram a revisão. |

Nenhum ACTION_CONFLICT na repetição, incluindo os pares A03 e A06. Os dois braços empataram em desfechos e tiveram custos quase iguais. A avaliação jurídica e a seleção de prompt continuam com Boni. Em A04, a ferramenta está registrada para o pesquisador e o orquestrador pode interromper o fluxo antes de o pesquisador receber a tarefa. O resultado aponta para essa passagem entre papéis.

Evidências locais em %TEMP%/forgelex-a3-recheck-real-20261114. SHA-256 do pacote 9f572b790fee104fccad1917db729ffb8483faa91a545e7de83b7c006937759b. SHA-256 do resumo 00db120eb60791341c98a6b3082a81a5a95aeff7a3b29ecf530aee3ab78e3ecf. A soma das 44 liquidações foi conferida contra o resumo e o ledger encerrou sem lock.

## A3 — Encaminhamento de A04

Na reexecução paga, os dois braços pediram os registros P-01 antes de chegar ao pesquisador. O orquestrador sabia que a execução tinha capacidade de pesquisa, mas sua lista de ferramentas não incluía a consulta reservada ao especialista. A política confiável agora identifica o pesquisador, a ferramenta disponível no próximo passo e o campo requiresCaseLaw do plano. Com tema e recorte definidos, os registros a recuperar passam a ser descritos como produto da consulta. Dúvidas indispensáveis sobre o próprio pedido continuam elegíveis a esclarecimento.

O teste de contrato reproduziu a ausência da instrução e passou após a correção. Passaram 77 testes, build e verificação de tipos do workflow, lint focado e diff check. O executor offline completou os quatro braços. No teste dirigido pelo SDK e ledger com transporte simulado, os dois braços de A04 passaram por orquestrador, pesquisador e verificador, com quatro chamadas por braço e duas fontes rastreadas em cada entrega. SHA-256 do pacote 09266302dfb98262678c820bd89900fa35eacce20423d5e07b505fcfbdaa81f4.

O custo estimado das duas execuções é de US$ 0,102666 a US$ 0,287248. A soma conservadora das reservas da rota simulada é de US$ 0,541726. Teto agregado proposto de US$ 0,60 incluindo custo incerto, com possibilidade de interrupção se a rota real crescer. Mantidos os parâmetros de Sol Standard da primeira fase. O ensaio usou respostas simuladas. O encaminhamento pelo modelo real ainda precisa ser confirmado. Nenhuma chamada paga foi feita.

## A3 — Reexecução paga de A04

Em 14/11/2026, Boni autorizou somente A04 nos dois braços, com teto agregado de US$ 0,60 incluindo custos incertos. A prévia com o mesmo escopo e teto passou nos dois braços. O ledger real encerrou as duas execuções e liquidou as dez chamadas por **US$ 0,084944**, sem custo incerto. A segunda fase segue pendente.

| Braço | Pesquisador | Verificador | Resultado | Chamadas | Custo |
| --- | --- | --- | --- | ---: | ---: |
| Prompts atuais | Sim | Sim | Entrega limitada | 5 | US$ 0,042688 |
| Prompts revisados | Sim | Sim | Entrega limitada | 5 | US$ 0,042256 |

Nos dois braços, o verificador registrou quatro pares proposição–fonte com trecho literal correspondente. Duas proposições tiveram suporte integral e duas, suporte parcial. O corpus é sintético e as entregas preservaram ressalvas de escopo.

Evidências em %TEMP%/forgelex-a04-real-20261114. SHA-256 do pacote: b37c6d8d206ca41106ac86492b605bdb7c26738a3b2e9dffbe687ee38c1a38a1.

## A3 — Preparação da segunda fase

Boni selecionou os prompts revisados. Os dois braços usam a versão 13 do workflow e os oito cenários com a mesma entrada e o mesmo teto por papel. O controle usa Sol com esforço low em a2-output-v1. O candidato usa Sol ou Terra e esforço low ou medium conforme o papel em a2-roles-v1. Os tetos comuns são 2.048 para o orquestrador, 8.192 para o redator e 4.096 para os outros papéis exercitados. Cache, schema, corpus e ferramentas são iguais. O editor final e Luna ficam fora desta amostra.

A02 agora pede expressamente minuta preliminar condicionada com modalidade e fase em aberto. A03 aceita pergunta indispensável ou entrega limitada que identifique os dados faltantes e deixe a data em aberto. A04 exige consulta ao P-01 pelo pesquisador e verificação rastreável das duas posições. Suporte parcial fundamentado é válido. As demais dimensões da rubrica continuam aplicáveis.

| Braço | Execuções | Chamadas simuladas | Custo projetado | Soma das reservas simuladas |
| --- | ---: | ---: | ---: | ---: |
| Sol fixo, a2-output-v1 | 8 | 27 | US$ 0,343286–1,434064 | US$ 2,286472 |
| Perfis por papel, a2-roles-v1 | 8 | 27 | US$ 0,229608–1,012157 | US$ 1,581924 |
| Total | 16 | 54 | US$ 0,572894–2,446221 | US$ 3,868396 |

Estimativa pelas solicitações reais do SDK com transporte simulado, em Standard de contexto curto. O cenário inferior usa quatro bytes por token de entrada e 512 tokens de saída. O superior usa dois bytes por token de entrada e usa o teto inteiro de saída. Não conta com economia de cache. A soma conservadora das reservas inclui margem de entrada e teto de saída. Teto adicional proposto de US$ 4,00 incluindo custos incertos. A exposição máxima sob os tetos individuais, sem o limite agregado proposto, seria US$ 9,60. [Tarifas oficiais](https://developers.openai.com/api/docs/pricing).

O executor realizou as 16 simulações, com 14 entregas, duas perguntas esperadas e nenhuma falha. A04 chegou ao pesquisador e ao verificador nos dois braços. Foram conferidos os oito pares de hashes e os tetos de saída por papel. Passaram oito testes do ledger, formatação e diff check. O pacote tem SHA-256 a2d5b94d5660209414ce0fadd29ba888e02427289bc65c59135b7877cae99d6f. Evidências em %TEMP%/forgelex-a3-fase2-mock-1a50843ce551464885ac5085078a138f.

O modo mock-profiles aceita apenas transporte simulado. O despacho real dos perfis deverá usar o teto aprovado e preservar a mesma composição e as mesmas verificações testadas aqui. Nenhuma chamada paga foi realizada nesta preparação.

## A3 — Execução da segunda fase em 15/11/2026

Boni autorizou 16 execuções pagas com teto agregado de US$ 4,00, incluindo custos incertos. O executor usou os prompts revisados, os oito cenários congelados e tetos de saída iguais por papel. O braço fixo usou Sol em low. O outro usou Sol e Terra com esforço por papel. A prévia passou com 54 chamadas simuladas. A rodada real encerrou as 16 execuções com 60 chamadas liquidadas, custo calculado de **US$ 0,587839** e nenhuma reserva incerta.

| Métrica | Sol fixo | Perfis por papel |
| --- | ---: | ---: |
| Entregas / perguntas / falhas | 8 / 0 / 0 | 8 / 0 / 0 |
| Entregas LIMITED / CANDIDATE | 8 / 0 | 7 / 1 |
| Chamadas | 30 | 30 |
| Tokens de entrada / saída | 108.290 / 13.032 | 104.439 / 12.403 |
| Custo calculado | US$ 0,346900 | US$ 0,240939 |
| Mediana / P95 por execução | 21,34 s / 71,22 s | 17,13 s / 70,91 s |

Os perfis por papel reduziram o custo calculado em 30,5% e a mediana por execução em 19,7% nesta amostra. O P95 usa posto mais próximo e corresponde ao maior tempo em cada braço de oito execuções. O cache reportado foi zero.

Nos dois braços, A02 entregou minuta condicionada, com cinco seções no braço fixo e quatro no braço por papel. A03 identificou dados faltantes e deixou o prazo sem cálculo. A04 passou pelo pesquisador e pelo verificador em ambos, com dois pares de suporte integral e dois de suporte parcial por braço. A07 preservou CRLF e conteúdo fora da seleção. Os códigos de entrega descrevem o estado do workflow. A avaliação jurídica pela rubrica permanece com Boni.

Foram verificados 36 testes do transporte comercial, tipos da API e git diff --check. Evidências em %TEMP%/forgelex-a3-fase2-real-20261115. SHA-256 do pacote a50a7aaf0277db39731f6ab7ed0027f4affcd92f558b442ebafbc7d0ec737b73. SHA-256 do resumo a54f2bd79b772fa303828f2b80277603f15335052760091f0710241193400330. O ledger confirmou o teto autorizado, o total das liquidações e o encerramento sem lock. Cache e schema seguem como experimentos separados.

## A3 — Ensaios offline de cache e schemas em 17/11/2026

Boni autorizou a preparação offline de dois experimentos com os perfis por papel `a2-roles-v1`. O ensaio de cache usa o pesquisador em Terra e o redator em Sol. O ensaio de schemas usa o pesquisador e o verificador em Terra com seus esforços e tetos originais. Cada experimento tem um controle próprio.

### Cache de prompts

São 24 chamadas propostas, quatro por papel em cada um dos três modos. O controle usa cache explícito sem breakpoint. Os braços experimentais usam cache implícito e cache explícito com breakpoint após as instruções estáveis. Ambos usam TTL de 30 minutos. A sequência cobre início sem cache, outro tenant sintético, repetição no primeiro tenant e alteração da parte dinâmica. O prefixo começa com um identificador derivado de campanha, braço, papel e tenant. No modo explícito, o breakpoint precede o texto dinâmico. O modo implícito pode incluir a mensagem do usuário no prefixo e, neste ensaio, fica restrito ao corpus sintético. [Documentação de Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching).

O simulador conferiu leitura e escrita, separação de prefixos, rejeição de uso inconsistente ou escrita de 12 horas e retenção da reserva de chamada incerta. A reserva dos braços de cache cobre toda a entrada pela tarifa de escrita de 30 minutos. A taxa real de acertos, a latência e o isolamento do serviço do provedor ficam para a execução controlada. O ensaio usa apenas transporte simulado. A execução paga depende de ligar o transporte de avaliação ao controle de reserva e à leitura do evento terminal do provedor.

### Schemas estritos

São oito chamadas propostas. Cada braço testa `research.get_authority` e `research.verify_authority` com data conhecida e desconhecida, encerrando após a primeira entrega válida da ferramenta. O braço estrito torna a data obrigatória no JSON e permite valor nulo. O adapter converte o nulo em ausência antes de chamar o validador Zod e recusa campos extras. Os testes também cobrem a regressão de `task.get_sources`, que já admite objeto fechado vazio. `task.submit` conserva o contrato atual. [Documentação de Function Calling](https://developers.openai.com/api/docs/guides/function-calling).

As oito chamadas simuladas atravessaram o SDK e o transporte com reserva prévia. Os testes de provider confirmaram rejeição de campos extras e ausência de identificador obrigatório. A rodada paga mede aceitação pelo provedor, argumentos válidos na primeira tentativa, erros de ferramenta, custo e latência. Quatro casos por braço dão evidência de compatibilidade neste recorte.

### Orçamento proposto

| Experimento | Chamadas | Estimativa de custo | Soma conservadora das reservas | Teto proposto incluindo custo incerto |
| --- | ---: | ---: | ---: | ---: |
| Cache | 24 | US$ 0,175384–1,530532 | US$ 2,176320 | US$ 2,25 |
| Schemas | 8 | US$ 0,012521–0,168398 | US$ 0,238488 | US$ 0,25 |
| Total | 32 | US$ 0,187905–1,698930 | US$ 2,414808 | US$ 2,50 |

A estimativa inferior usa quatro bytes serializados por token de entrada e 256 tokens de saída. A superior usa dois bytes por token e o teto inteiro de saída, com tarifa de escrita de 30 minutos em toda a entrada nos braços de cache. Ambas prescindem de descontos por acertos. A soma conservadora usa bytes serializados mais 8.192 como limite de entrada e o teto de saída. Tarifas Standard de contexto curto conferidas em 17/11. [Preços de Sol](https://developers.openai.com/api/docs/pricing) · [Preços de Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

Para reproduzir os orçamentos offline, definir `FORGELEX_A3_EXPERIMENT_BUDGET=1` e executar o Vitest com `--reporter=verbose --silent=false` nos dois arquivos de teste. Passaram 57 testes focados, build do provider, verificação de tipos da API e lint focado. Chamadas pagas nesta preparação: zero.

**Renumeração da versão dos prompts revisados (24/11/2026).** Ao integrar a Frente A com `main`, a versão 13 do workflow (prompts revisados, perfil `1.14.0`) passou a ser a **16** e o perfil passou a `1.17.0`: a versão 13 e o perfil `1.14.0` já tinham sido tomados pelo ajuste da estrutura do caso (E2), e as versões 14 e 15 pela estrutura na redação (E3) e pela identificação do documento (E4). O comportamento dos prompts revisados não mudou; os registros acima mantêm os nomes da época das medições ("versão 13", `1.14.0`). A seleção continua sendo `workflowVersion: 16`, e o ajuste da estrutura segue na 13.


## MIN — Mesa mínima no gelo e Pasta de casos (26/11/2026)

**Decisão de Boni (26/11/2026):** regra do mínimo, registrada no `AGENTS.md`: o produto é uma conversa (anexar e pedir);
fora dela, só o obrigatório por lei ou pagamento. Boni cobrou a tela Casos ainda em produção: a trava de 19/11 só tinha
valido no gelo, e o clássico seguia publicado. Caminho escolhido por ele: ir ao gelo (V6), sem remendar o clássico.

**Base:** `main` em `58590de`. Commits na branch `claude/sharp-bhaskara-4768df`: `0833107` (regra), `e4dba52` (Mesa mínima
e Pasta), `96e438e` (histórico do caso e correção comercial), `8a610e0` (testes).

**Entregue (só no gelo; o clássico não mudou):**
- Lateral: Nova conversa, Pasta, Recentes, Conectar IA, Conta, saldo e Sair. Casos, Visão geral, Jurisprudência,
  Andamento, Rascunhos e Revisão saíram; os caminhos antigos abrem a Mesa.
- Pedido: texto, anexo e Enviar. Peça: texto, Salvar e Exportar; salvar sem caso cria o caso por trás.
- Pasta: até 20 casos (limite só na tela), criar, abrir, renomear, excluir de vez com confirmação.
- Conversa nova num caso recebe o histórico das outras conversas do caso (`case-history:`), como resultado de IA.
- Servidor: relato colado e anexo num caso não viram mais análise de fatos e provas sozinhos (E1b/E4 retirados).
- **Correção de defeito anterior:** no modo comercial, a conferência do contexto antes de cada chamada recarregava sem as
  fontes montadas pelo servidor e falhava (`CONTEXT_CONFLICT`); atingia a estrutura do caso na redação (E3/E4).

**Verificação (local, 26/11):** unitários web 549/549 e servidor 406/406; navegador: gelo 18/18 e anexos-gelo 1/1;
clássico: anexos 11/11, fluxo comercial 4/4, casca 31/31, Mesa principal 39/40 (`editorial-review.spec.ts:41` falha só
no Windows: o fixture `desk-piece.txt` sai em CRLF no checkout).

**Não verificado / limites:** modelo real (só agente simulado); exclusão definitiva de ponta a ponta (o ambiente de teste
responde "indisponível"); conversa solta em Recentes não tem exclusão definitiva própria (só esconder, como antes);
sem painel de acesso da IA por caso no gelo.

**Acesso da IA conectada (decisão de Boni, 26/11):** a conexão aprovada no login da IA vale para os casos ativos da
conta, sem painel. Antes de cada ferramenta de caso no conector (`case.*`, `draft.*`, `analise.*` e o memorando), o
servidor põe em dia a permissão daquela conexão em cada caso ativo: todo o material atual e envio de peças novas
(`CaseAiAccessRepository.syncAutomatic`). Caso vazio também entra (a seleção pode ser vazia). Revogação na mesma conexão
é respeitada; desconectar a IA corta tudo (a conexão nova começa do zero); o que o usuário já tinha dado na conexão é
mantido. Efeito de segurança aceito por Boni: qualquer IA que ele conectar por OAuth lê todos os casos ativos e pode
mandar peças, que esperam revisão. Testes: `case-ai-access.spec.ts` reescrita para a regra (5/5: leitura automática e
gratuita, uma permissão por conexão, sessão do site e token desconhecido barrados, revogação que não volta, caso
arquivado fora e caso novo dentro); unitários de persistência, servidor e conector 491/491.
