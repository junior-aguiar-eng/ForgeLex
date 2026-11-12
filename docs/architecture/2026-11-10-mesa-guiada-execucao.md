# Mesa guiada do ForgeLex · registro de execução

O [plano v2](../historico/planos/2026-11-10-forgelex-mesa-guiada-v2.md) teve seu início autorizado por Boni em 10 de novembro de 2026. Fluxo limpo e visual moderno são critérios de aceite da Mesa.

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
| A19      | Aceite visual de Boni em desktop e celular pendente.                                                                                                                                                                          |

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

Em 11/11/2026, também somente leitura (Cloud Run, Cloud Build, Cloud Logging, Cloud SQL e balanceador por `gcloud`; DNS, RDAP do Registro.br e TLS por consulta pública; Supabase pela lista de projetos e tabelas). O detalhe item a item está em `PENDENCIAS.md`, na seção “Estado publicado atual — 11/11/2026”. Plano lido: `claude/plano-unificado` no commit `713774e`.

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
| Pendente                    | O link do registro de execução para o plano unificado (outro item da E6) espera esse plano entrar nesta branch.                                                                                          |

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
