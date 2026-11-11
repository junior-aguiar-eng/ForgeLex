# Mesa guiada do ForgeLex · registro de execução

O [plano v2](../superpowers/plans/2026-11-10-forgelex-mesa-guiada-v2.md) teve seu início autorizado por Boni em 10 de novembro de 2026. Fluxo limpo e visual moderno são critérios de aceite da Mesa.

## R0 · revisão de partida

- Branch local `codex/mesa-guiada` criada em worktree gerenciado e inicialmente limpo.
- Revisão de partida `5d854da2cdae9c7c867e202e71ab8f4551cba3f6`. `git ls-remote origin refs/heads/main` e `git rev-parse origin/main` retornaram esse mesmo SHA.
- A auditoria principal usou `8fcd1d0`. A comparação com a base de execução confirmou as alterações posteriores de limites de entrada, transporte e política comercial. A implementação usará os contratos dessa base de execução. Os valores históricos da auditoria não orientam cobrança.
- `pnpm install --frozen-lockfile` concluiu para 18 projetos com pnpm 11.19.0 e reaproveitou os 541 pacotes do cache. O lockfile permaneceu igual.
- Verificação focada de baseline com Vitest. 48 testes aprovados em três arquivos, cobrindo contrato agêntico, navegação e modelo de execução da interface.
- O schema de contexto é estrito. A extensão de orientação em R2/R3 exige leitores compatíveis antes de novos escritores e uma projeção pública que exclua os dados internos. O driver padrão usa v10, o schema v10 é o último da baseline e o leitor editorial ainda limita evidências até v8. O plano usa v11 como próximo número e mantém a leitura histórica em R7/R10.

## R1 · inventário técnico

O script `scripts/skills/inventory-catalog.mjs` verifica o hash da captura, confere o manifesto e os hashes de cada Markdown e conteúdo, cruza identidade, versão e categoria e gera o índice sem copiar o corpo das fichas para a saída.

| Evidência | Resultado |
|---|---|
| Captura validada | 2.077 registros. 303 de Forma e 1.774 de Matéria. |
| Cobertura | 302 tipos distintos de Forma e 91 grupos de Matéria por área/subárea, incluindo grupos com subárea ausente. |
| Classificação pendente | 580 fichas de Matéria têm área, mas não têm subárea identificável pelos campos examinados. Foram conservadas e sinalizadas. |
| Sobreposição exata | Nenhum título duplicado na mesma categoria ou conteúdo com hash idêntico. O tipo `notificacao-extrajudicial` está associado a duas formas e exige desambiguação futura. |
| Avaliação | As 2.077 fichas permanecem pendentes de avaliação para uso no runtime. |
| Índice local | `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2/catalog-inventory.json`, ignorado pelo Git. |
| SHA-256 do índice | `770eb0dc3eabc06349e481c396612bb7d037669fef1b07d00559ed617f06d9f7` |
| Verificação | Nove testes Node aprovados e Prettier aprovado nos dois arquivos novos. |

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

| Operação | Contrato |
|---|---|
| `POST /api/agentic/guidance` | Inicia a orientação. Recebe `objective` e `matterId` opcionais e um `Idempotency-Key` UUID. |
| `GET /api/agentic/guidance/:conversationId` | Recupera decisões públicas e pergunta ativa em leitura consistente. |
| `POST /api/agentic/guidance/:conversationId/answer` | Registra `LegalAnswer` para a pergunta ativa na revisão indicada. |
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

| Critério | Evidência |
| --- | --- |
| A01 | Inventário conferido diretamente no ZIP de referência. São 2.077 fichas, 303 de Forma e 1.774 de Matéria. Os testes verificam a origem e recusam divergências de hash, identidade e conteúdo. |
| A02 | `guided-desk.spec.ts` verifica DOM, JSON público e SSE com a ficha sintética efetivamente usada. |
| A03–A05 | `guided-desk.spec.ts`, `desk-guidance.spec.ts`, `execution-routes.test.ts` e `case-task-driver.test.ts` cobrem envio sem pergunta redundante, perguntas materiais, desconhecimento, correção e histórico. |
| A06 | `skill-selection.test.ts` e `case-task.test.ts` verificam as regras de seleção, orçamento de conteúdo, versão fixada, escopo por papel e recusa de adulteração. |
| A07–A08 | A jornada integrada confere conversa, caso, peça, versão e alvo. `writing-desk.spec.ts` cobre troca de seleção. Os testes dos contratos e repositórios exercitam integridade, autorização e idempotência. |
| A09–A10 | A jornada integrada confere a versão após revisão e o texto após alteração delimitada. Os testes do repositório verificam vínculos, versão concorrente e replay. |
| A11–A12 | `guided-desk.spec.ts` e `desk-research.spec.ts` cobrem pesquisa conservada, proveniência e caso de destino. `desk-review.spec.ts` e `draft-review.spec.ts` verificam a conferência, decisão editorial e aprovação por versão. |
| A13 | `checkpoint-evidence.test.ts` exercita a leitura dos protocolos históricos. O ensaio PostgreSQL retoma v8 com o driver v10 e a jornada integrada passa pelo fluxo guiado e pela edição delimitada na mesma Mesa. |
| A14–A15 | As suítes de orientação e execução comercial verificam consentimento, reserva e cancelamento. Os testes de pesquisa e do workflow verificam as ferramentas da composição e a limitação explícita quando falta capacidade. |
| A16 | `guided-desk.spec.ts` exercita a jornada em desktop e viewport móvel, com teclas nos passos de orientação, envio e seleção de trecho. `desk-guidance.spec.ts` confere foco, acessibilidade e disposição dos controles. |
| A17 | Piloto Penal e regressão Cível reservados ao R14. |
| A18 | Esta seção registra código e validação local. Homologação de produção pendente. |
| A19 | Aceite visual de Boni em desktop e celular pendente. |

## R14 · piloto Penal e regressão Cível

O ensaio usa quatro casos sintéticos na mesma revisão de `codex/mesa-guiada`, com base `5d9e3fd`. A referência é a Mesa em pedido livre com a orientação desativada. Os outros dois modos usam as perguntas da Mesa, com o catálogo sintético habilitado apenas no terceiro modo. O ensaio aciona o navegador, a API, o worker e a persistência local com respostas determinísticas da fixture.

- A resposta à acusação com questão sobre o lacre vincula a Forma ao redator e a Matéria ao analista. A simples menção a cadeia de custódia no outro caso Penal conserva só a Forma. A contestação usa apenas a Forma Cível.
- A opção “Não sei” mantém a peça indefinida. A execução propõe a resposta à acusação como hipótese vinculada ao relato original. Quando a hipótese segue sem confirmação, a entrega registra a limitação e o caso fica sem rascunho.
- A entrega referencia o hash do relato original. Nas três peças confirmadas, o texto da fixture permanece idêntico na entrega, no editor e na versão salva. As projeções públicas e o DOM preservam a privacidade das referências internas.

| Modo | Perguntas de orientação | Perguntas da execução | Chamadas simuladas | Rascunhos | Bytes dos pacotes | Bytes de fichas nos pacotes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Referência com pedido livre | 0 | 0 | 17 | 3 | 17.998 | 0 |
| Mesa guiada | 12 | 1 | 17 | 3 | 55.993 | 0 |
| Mesa guiada com habilidades sintéticas | 12 | 1 | 17 | 3 | 56.598 | 355 |

As contagens somam os quatro casos por modo. A pergunta de execução dos modos guiados é a confirmação da hipótese no caso indefinido. Os bytes são do JSON entregue ao provedor de teste. O ensaio mede o contrato e o volume de contexto, com zero chamadas a modelos reais.

Para reproduzir, executar `pnpm build` e rodar `pnpm exec playwright test -c playwright.desk-pilot.config.ts` com `FORGELEX_E2E_DESK_PILOT` definido sucessivamente como `baseline`, `guided` e `skills`. O teste imprime as contagens por caso e papel. A regressão Cível integrada usa `pnpm exec playwright test -c playwright.desk-guidance.config.ts` com a variável do piloto desabilitada.

Em 11/11/2026 passaram os 12 cenários da comparação, os 6 cenários de regressão da Mesa e 101 testes Vitest de orientação, seleção de habilidades, workflow e rotas. Lint, formatação dos arquivos de teste, sintaxe Node e checagem do diff passaram. Isso registra a verificação técnica local de A17. A avaliação jurídica e de experiência continua com Boni.

O inventário do ZIP verificou os candidatos capturados abaixo. A elegibilidade continua pendente de decisão de incorporação, condições de reutilização e avaliação de Boni. Os testes carregam fichas autorais sintéticas com identificadores próprios.

| Candidato do acervo | Versão | SHA-256 do conteúdo |
| --- | --- | --- |
| `resposta-acusacao` | 3 | `3d39673b621dcf0409d0ca774f051e52aa56e403dd0477041e270945e7799fe5` |
| `cadeia-custodia-cpp-158` | 3 | `9ca8f7d87916e83f000c1fdae66850fdac4c02235991471ce467afe23676a3f9` |

## R15 · expansão por área e operação

O lote `penal-civel-r15-v1` usa os casos priorizados no R14. O comando de preparação verifica o ZIP das 2.077 fichas e gera uma fila local com versões, hashes, tamanho, proveniência e casos associados. A fila destina-se à avaliação de Boni e mantém os quatro candidatos pendentes.

| Área | Categoria | Candidato | Cobertura do lote |
| --- | --- | --- | --- |
| Penal | Forma | `resposta-acusacao` v3 | Resposta à acusação nos dois casos com peça confirmada |
| Penal | Matéria | `cadeia-custodia-cpp-158` v3 | Questão sobre o lacre. A menção incidental fica fora da seleção |
| Cível | Forma | `contestacao-civel` v3 | Contestação confirmada |
| Cível | Matéria | `adimplemento-pagamento-cc-304` v2 | Candidato para o relato de pagamento parcial. O inventário declara a área civil e registra subárea ausente |

```powershell
node scripts/skills/prepare-catalog-lot.mjs --archive "<ZIP capturado>" --out "<novo JSON local>"
```

O catálogo de teste `catalogo-piloto-sintetico-v2` acrescenta a referência de Matéria Cível. A seleção usa a questão estruturada e vinculada ao relato. O fluxo mantém as perguntas `mesa-v2` de área, tarefa e peça. O teste de retomada carrega um checkpoint da versão antiga com a versão nova do catálogo disponível e verifica que a execução histórica usa a ficha antiga. Uma execução nova usa a versão nova.

O ensaio de operação usa `pnpm exec playwright test -c playwright.desk-pilot.config.ts`, com `FORGELEX_E2E_DESK_PILOT` em `skills` e depois em `expanded`. Os logs locais registram versão, ferramentas, orçamento, volume de contexto e resultados por caso. A contagem de perguntas repetidas compara os enunciados dentro de cada jornada sem correções. O cenário de correção e saída antes do envio é induzido e medido separadamente. A avaliação de integridade confere o vínculo com a fonte, a correspondência do texto entre entrega e peça e o bloqueio da redação quando a hipótese fica indefinida.

| Catálogo sintético | Jornadas concluídas | Perguntas de orientação / repetidas | Perguntas da execução | Chamadas simuladas | Bytes dos pacotes / das fichas |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 | 4 | 12 / 0 | 1 | 17 | 56.598 / 355 |
| v2 | 4 | 12 / 0 | 1 | 17 | 57.373 / 458 |

As duas versões produziram três rascunhos e uma entrega limitada. A v2 levou 103 bytes adicionais de ficha ao analista Cível. A comparação por caso e papel confirmou as mesmas ferramentas e o mesmo limite de 1.000 bytes por papel e por execução na fixture. O cenário adicional registrou uma correção de área e uma saída antes do envio, com preservação da mensagem. As métricas correspondem à simulação local. A taxa de abandono em uso e a qualidade jurídica das entregas dependem da avaliação do lote em condições autorizadas por Boni.

Em 11/11/2026, passaram 9 cenários Playwright do lote, 6 regressões da Mesa, 79 testes Vitest e 11 testes Node do inventário e da fila. Passaram lint, formatação dos arquivos alterados no R15 e checagem do diff.

### Avaliação das quatro fichas capturadas

A conferência usa os quatro textos das versões indicadas na fila do R15, lidos diretamente do ZIP verificado. A revisão jurídica é amostral e prioriza os pontos que mudariam o resultado nos casos do piloto. A matriz registra a avaliação das fichas para o ForgeLex e deixa a decisão de incorporação com Boni.

| Ficha | Resultado da conferência amostral | Ajuste antes de avaliar incorporação |
| --- | --- | --- |
| `resposta-acusacao` v3 | Os arts. 396 e 396-A e o precedente sobre intimação de testemunha sustentam o roteiro de defesa. A ficha inclui a quebra da cadeia de custódia entre nulidades absolutas, em conflito com a ficha de Matéria e com o exame casuístico do HC 653.515/RJ. A estrutura remete genericamente ao art. 397 após abranger também o Júri. | Condicionar a tese sobre o vestígio à irregularidade, à confiabilidade e ao prejuízo concretos. Identificar o rito e a fase e distinguir o regime do art. 415 no Júri. [CPP, arts. 396-A, 397, 406 e 415](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) · [STJ, HC 653.515/RJ](https://www.stj.jus.br/websecstj/cgi/revista/REJ.cgi/ITA?dt=20220201&formato=HTML&nreg=202100831087&salvar=false&seq=2073941&tipo=0) · [STJ, REsp 2.098.923/PR](https://scon.stj.jus.br/jurisprudencia/externo/informativo/?livre=%40CNOT%3D020737) |
| `cadeia-custodia-cpp-158` v3 | O núcleo sobre lacres e confiabilidade tem suporte no CPP e no HC 653.515/RJ. A síntese sobre coleta perde a preferência prevista no art. 158-C. A descrição do art. 158-F menciona descarte e omite a devolução e permanência na central após a perícia. O resumo final sobre prints apresenta como regra uma linha jurisprudencial que o corpo da ficha já qualifica. | Distinguir abertura autorizada com registro e novo lacre de rompimento sem rastreabilidade. Completar o fluxo pós-perícia e limitar a tese sobre prints aos fatos e condições dos precedentes. [CPP, arts. 158-C a 158-F](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) · [STJ, HC 653.515/RJ](https://www.stj.jus.br/websecstj/cgi/revista/REJ.cgi/ITA?dt=20220201&formato=HTML&nreg=202100831087&salvar=false&seq=2073941&tipo=0) · [STJ, AREsp 3.126.435/MT](https://scon.stj.jus.br/SCON/GetInteiroTeorDoAcordao?num_registro=202503861559) |
| `contestacao-civel` v3 | A separação entre defesa direta e indireta é pertinente ao pagamento parcial. A abertura generaliza a preclusão das preliminares, apesar do conhecimento de ofício previsto no art. 337, § 5º. O resumo do art. 335, I, omite a última sessão, e a menção ao REsp 2.180.502/GO funde a hipótese literal do § 2º com o cenário de audiência redesignada e depois cancelada. | Tratar a ordem como roteiro editorial, explicitar as ressalvas legais e separar as hipóteses de prazo. Preservar a impugnação dos fatos e a prova do pagamento vinculado à cobrança. [CPC, arts. 335 a 343 e 373](https://legis.senado.leg.br/norma/584917/publicacao/34619046) · [STJ, REsp 2.180.502/GO](https://scon.stj.jus.br/jurisprudencia/externo/informativo/?acao=pesquisarumaedicao&from=feed&livre=0852.cod.) |
| `adimplemento-pagamento-cc-304` v2 | O art. 314 é pertinente à forma de pagamento. O quadro de quitação abrevia o art. 320 e omite a assinatura do credor ou representante e a regra do parágrafo único sobre prova pelas circunstâncias. O inventário indica área civil com subárea ausente. A ficha também cobre modalidades que excedem o relato de pagamento parcial. | Delimitar o recorte a pagamento e quitação, registrar a subárea e distinguir parcela comprovada, imputação e saldo. Verificar documento, beneficiário e obrigação antes de atribuir efeito extintivo. [Código Civil, arts. 308, 314, 319, 320 e 352 a 355](https://legis.senado.leg.br/norma/552282/publicacao/34620807) |

Os modos `captured` e `captured-limited` do Playwright leem o arquivo apontado por `FORGELEX_E2E_SKILL_ARCHIVE`. O primeiro usa limites exclusivos da fixture de 9.000 bytes por papel e 17.000 por execução. O segundo usa o limite de 1.000 bytes do piloto sintético. As respostas do provedor são determinísticas. As assertivas conferem versão, hash, papel, ausência das referências privadas nas projeções e comportamento quando o orçamento fica abaixo do tamanho das fichas. O ensaio mede a integração e a revisão amostral mede a aderência do texto às fontes selecionadas.

| Caso sintético | Fichas recebidas no limite ampliado | Bytes de conteúdo |
| --- | --- | ---: |
| Penal, lacre rompido no relato | Forma Penal e Matéria de cadeia de custódia | 15.839 |
| Penal, menção incidental | Forma Penal | 7.042 |
| Penal, peça indefinida | Nenhuma. A confirmação pendente impediu a redação | 0 |
| Cível, pagamento parcial | Forma Cível e Matéria de pagamento | 16.246 |

O ensaio com as fichas capturadas somou 96.677 bytes nos 17 pacotes entregues ao provedor simulado, dos quais 39.127 bytes eram conteúdo das fichas. O maior pacote individual teve 12.381 bytes. No controle de 1.000 bytes, os três pedidos com peça confirmada exibiram limitação de contexto e as referências ficaram fora dos pacotes. Os limites medidos pertencem à fixture. A incorporação e a qualidade de respostas produzidas por modelo continuam sem avaliação em uso.

### Reteste com as fichas revisadas

O catálogo de teste `forgelex-r15-revisao-local-v1` carrega quatro redações próprias com versões novas e vincula cada ficha ao hash e à versão de origem no ZIP verificado. A leitura e a seleção do lote ficam restritas à fixture do piloto.

| Ficha | Versão capturada → revisão ForgeLex | Correção incorporada ao recorte |
| --- | --- | --- |
| [Resposta à acusação](../../tests/fixtures/desk-pilot-revised/resposta-acusacao.md) | 3 → 4 | Distingue rito, fase e fundamentos da absolvição sumária. O exame do lacre parte dos registros e do efeito sobre a prova no caso concreto. |
| [Cadeia de custódia](../../tests/fixtures/desk-pilot-revised/cadeia-custodia-cpp-158.md) | 3 → 4 | Distingue abertura documentada e ruptura sem rastreabilidade. Completa a guarda pós-perícia e contextualiza os precedentes sobre prints. |
| [Contestação cível](../../tests/fixtures/desk-pilot-revised/contestacao-civel.md) | 3 → 4 | Explicita as ressalvas das preliminares, separa os marcos de prazo e vincula o pagamento parcial à obrigação, ao comprovante e ao saldo. |
| [Pagamento e quitação](../../tests/fixtures/desk-pilot-revised/adimplemento-pagamento-cc-304.md) | 2 → 3 | Delimita a subárea de obrigações, adimplemento e quitação. Inclui a assinatura, o alcance da prova pelas circunstâncias e a imputação entre débitos. |

| Caso do piloto | Bytes de fichas capturadas | Bytes de fichas revisadas |
| --- | ---: | ---: |
| Penal, lacre rompido no relato | 15.839 | 4.334 |
| Penal, menção incidental | 7.042 | 2.150 |
| Penal, peça indefinida | 0 | 0 |
| Cível, pagamento parcial | 16.246 | 3.558 |
| Total | 39.127 | 10.042 |

O reteste usou os mesmos quatro casos e limites de 9.000 bytes por papel e 17.000 por execução. As duas versões acionaram 17 chamadas simuladas. As versões revisadas chegaram aos papéis esperados, com hashes próprios e sem exposição dos identificadores privados ou dos trechos marcadores na API e na interface. Os avisos de conferência do lacre e do pagamento são respostas da fixture, vinculadas aos respectivos relatos. A qualidade de geração com modelo e a incorporação permanecem pendentes.

Para repetir, apontar `FORGELEX_E2E_SKILL_ARCHIVE` ao ZIP verificado e rodar `pnpm exec playwright test -c playwright.desk-pilot.config.ts` com `FORGELEX_E2E_DESK_PILOT` em `captured` e em `revised`. A prévia desta rodada usa a Mesa dev em `127.0.0.1:3360`. O histórico **Conversas** contém os quatro casos concluídos.

### Ensaio com GPT‑6.1 Sol

Boni autorizou os quatro casos sintéticos e o teto total de US$ 5. A execução usou o workflow guiado e o transporte do ForgeLex em um executor local isolado. O manifesto registra o worktree, os relatos, as versões e os hashes das quatro fichas. O ensaio usou o corpus fechado, sem pesquisa externa ou alterações na Mesa dev.

A primeira passagem usou as instruções do workflow. Em cinco chamadas, os dois pedidos penais com peça definida falharam por `SKILL_ISSUE_REFERENCE_INVALID`, o pedido indefinido falhou por `ACTION_CONFLICT` após um esclarecimento e o cível pediu a petição inicial. Essa passagem terminou sem minuta e com US$ 0,065074 de consumo calculado.

A segunda passagem usou o mesmo modelo, corpus e versões, com uma instrução adicional apenas no orquestrador do ensaio. Ela esclareceu a correspondência entre as questões e suas classificações, os códigos de tópico e o tratamento de dados ausentes em minutas preliminares. O manifesto da segunda passagem contém a instrução e o orçamento descontado do consumo da primeira.

| Caso | Resultado na segunda passagem | Fichas entregues aos papéis |
| --- | --- | --- |
| Penal, relato de lacre rompido | Minuta `LIMITED` | Cadeia de custódia v4 ao analista e resposta à acusação v4 ao redator |
| Penal, menção incidental | Minuta `LIMITED` | Resposta à acusação v4 ao redator |
| Penal, peça indefinida | Pergunta pendente após a resposta “Não sei”, sem minuta | Nenhuma |
| Cível, pagamento parcial | Minuta `LIMITED` | Pagamento e quitação v3 ao analista e contestação cível v4 ao redator |

O registro local contabilizou 22 chamadas com uso informado pela API e custo calculado de US$ 0,396394, com zero chamadas de consumo incerto. Os diretórios ignorados `r15-real-v1` e `r15-real-clarified-v1` sob `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2` contêm os manifestos, o ledger, os JSON por caso e as três minutas em Markdown. As peças estão disponíveis para avaliação jurídica de Boni.

### Comparação A/B com autos sintéticos

O ensaio comparou os mesmos documentos sintéticos e sínteses conferidas em fontes oficiais com e sem as quatro fichas revisadas. Usou GPT‑6.1 Sol, orientação `mesa-v2`, ordem alternada dos braços e a mesma instrução em cada par. Os hashes dos insumos coincidiram dentro de cada par. As fontes entraram no corpus local como sínteses com URLs verificáveis, sem pesquisa externa durante as execuções.

| Caso | Resultado da comparação |
| --- | --- |
| Lacre rompido | Ambos reconstruíram V-03, L-101 e L-204, distinguiram a lacuna documental de adulteração e pediram avaliação contextual da prova. O braço com fichas acrescentou pedido expresso de esclarecimento pericial sobre a correspondência entre os materiais e oportunidade de manifestação da defesa. |
| Identificação do acusado | Ambos distinguiram Sousa de Souza, preservaram P-710 e pediram retificação da capa com base nos documentos. A menção incidental ficou fora da seleção de Matéria e da tese defensiva. |
| Comunicação com peça indefinida | Ambos solicitaram o teor do ato e ficaram sem minuta após “Não sei”. Nenhuma ficha chegou aos papéis. |
| Pagamento parcial | Ambos vincularam os R$ 4.000 à F-77, apuraram R$ 8.000 de principal e limitaram o pedido ao abatimento documentado. O braço com fichas mencionou a certidão de audiência ao tratar do prazo e explicitou o inciso II do art. 373. |

A primeira passagem teve duas interrupções antes da entrega, ambas no braço sem fichas. No lacre, a saída atingiu o limite de tokens. No Cível, a conexão foi interrompida durante a leitura da resposta. Esses pares foram repetidos com a mesma instrução adicional de concisão nos dois braços. As seis minutas usadas na comparação ficaram `LIMITED`, com pendências de comprovação do suporte das citações, verificação processual e capacidade de pesquisa adicional.

O A/B registrou 60 chamadas, US$ 1,300486 de consumo calculado pelo uso informado e US$ 0,108048 reservados por uma chamada com consumo incerto. A exposição total acumulada com o ensaio anterior foi de US$ 1,804928, dentro dos US$ 5. Os resultados por braço, manifestos e minutas estão nos diretórios locais ignorados `r15-ab-real-v1` e `r15-ab-compact-v1`, sob `.superpowers/sdd/2026-11-10-forgelex-mesa-guiada-v2`.

Nesta amostra, os ganhos foram pontuais. A expansão do catálogo permanece em avaliação. Para aferir ganho consistente, é necessário testar mais casos por tema e conferir se o vínculo entre proposição e fonte passa pela verificação.

### Reteste A/B do vínculo entre afirmação e fonte

Nas novas execuções guiadas de criação, o redator registra a afirmação da minuta, o identificador da fonte jurídica e um trecho literal. O workflow confere se a afirmação está na minuta e se o trecho está na fonte. O verificador recebe o par e o trecho proposto, avalia o suporte e devolve sua classificação. A auditoria registra divergência quando o verificador substitui o trecho.

O GPT‑6.1 Sol processou os quatro casos com os mesmos insumos e instruções dentro de cada par. Nos dois braços, três casos produziram minuta e o caso indefinido ficou com pergunta pendente. Todas as 18 verificações de pares do redator tinham trechos localizados na fonte. O verificador classificou 7 de 10 como suficientes sem fichas e 6 de 8 com fichas. Os outros cinco tiveram suporte parcial. As seis minutas continuaram `LIMITED` por bloqueios que incluem suporte parcial, requisitos processuais pendentes ou pesquisa adicional indisponível.

O A/B foi iniciado com uma regra mais estrita de vínculo por seção. Na versão final, os pedidos podem reutilizar fontes já vinculadas a afirmações da fundamentação. A rechecagem dos registros identificou seis avisos que essa correção elimina, sem mudar o status das seis minutas. O contrato entre redator e verificador permaneceu igual durante o ensaio. O reteste fez 40 chamadas e registrou US$ 0,783586 de consumo calculado, sem nova chamada de consumo incerto. A exposição acumulada chegou a US$ 2,588514 dos US$ 5 autorizados. O diretório local ignorado `r15-ab-citations-v1` guarda as minutas e os dados da auditoria.

### Conferência processual com fontes oficiais

O ensaio usa consulta local a um recorte congelado de dispositivos obtidos da Câmara e do Senado e ao destaque oficial do HC 653.515/RJ no Informativo 720 do STJ. Os endereços, trechos, horários de captura e hashes dos downloads ficam em `r15-official-snapshots.json`, no diretório ignorado do ensaio. A consulta do precedente cobre apenas esse julgado. [CPP](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) · [CPC](https://legis.senado.leg.br/norma/584917/publicacao/34619046) · [Código Civil](https://legis.senado.leg.br/norma/552282/publicacao/34620807) · [STJ](https://processo.stj.jus.br/jurisprudencia/externo/informativo/?acao=pesquisar&aplicacao=informativo&livre=%40CNOT%3D%27018701%27)

| Caso | O que a conferência confirma | O que ainda falta |
| --- | --- | --- |
| Lacre | O rito ordinário e a citação pessoal em 10/11/2026 permitem identificar a resposta escrita e o prazo legal dos arts. 396 e 396-A do CPP. O registro de troca do lacre delimita a diligência sob o art. 158-D. | Dados para aferir a tempestividade, rol e demais atos da defesa, esclarecimento da abertura e avaliação concreta da repercussão na prova. |
| Identificação | A denúncia, a identificação e a citação sustentam a grafia Souza, com o mesmo P-710 da capa. O pedido de retificação corresponde à divergência documentada. | Dados para aferir a tempestividade e elementos da defesa de mérito. Os autos sintéticos não demonstram prejuízo processual pela grafia divergente. |
| Peça indefinida | O aviso e a resposta da secretaria confirmam apenas a disponibilização de um documento. | Teor do ato e registro de comunicação, necessários para identificar medida, fase e prazo. |
| Pagamento parcial | A audiência sem acordo em 9/11/2026 dá o marco do art. 335, I, do CPC para o rito informado. A regra geral é de 15 dias úteis. O recibo atribui R$ 4.000 ao principal e indica R$ 8.000 de saldo. | Calendário e protocolo para aferir o prazo. Documentos e critérios de atualização para examinar acessórios. |

O GPT‑6.1 Sol completou os quatro pares. Os hashes dos insumos coincidiram dentro de cada par. As seis minutas de peça confirmada ficaram `LIMITED`. Cada braço teve sete pares do redator com trecho localizado na fonte e suporte considerado suficiente, sem avaliação parcial nesse subconjunto. O workflow registrou 22 requisitos processuais pendentes e manteve achados de suporte insuficiente em outras proposições. O caso indefinido gerou em cada braço uma nota de insuficiência documental, sem selecionar medida.

Os dois braços do caso do lacre pesquisaram e confirmaram a identidade do HC no Informativo 720. As três peças confirmadas em cada braço recuperaram dispositivos oficiais. O reteste fez 98 chamadas e consumiu US$ 1,912236, calculados pelo uso informado, sem nova chamada de consumo incerto. A exposição acumulada, incluindo a reserva anterior, ficou em US$ 4,500750 do teto de US$ 5. As entregas e os registros da pesquisa estão em `r15-ab-official-v1`, no diretório local ignorado.

### Verificação de requisitos processuais por item

A revisão dos 22 itens do A/B encontrou 11 requisitos compostos, cinco instruções amplas de conferência, quatro registros sobre juntada e dois critérios normativos ligados à divergência de identificação. Rito, citação, audiência, grafia e abatimento têm suporte para verificações específicas. Protocolo, tempestividade e juntada continuam pendentes nos autos sintéticos. A revisão item a item consta em `r15-revisao-procedural.md`, no diretório local do ensaio.

Nas novas execuções guiadas, o assessor processual recebe instruções para formular requisitos independentes. O verificador recebe os requisitos identificados, com acesso às fontes do caso. O workflow registra o requisito como verificado quando há uma avaliação integral de suporte e os trechos literais das normas oficiais versionadas e dos documentos dos autos correspondem às fontes da execução. A entrega guarda esses trechos e seus hashes em `procedureAudit`. Avaliações parciais, conflitantes ou com trecho divergente mantêm a pendência. Os resultados da rodada anterior continuam como registro histórico.

### Homologação local da verificação processual

Em 11/11/2026, os três cenários passaram em Chromium, com a Mesa, a API e o workflow locais, documentos sintéticos e provedor simulado. O usuário seleciona os documentos no pedido guiado e o resultado exibe os requisitos verificados com os trechos da norma e dos autos.

| Cenário | Resultado observado na Mesa |
| --- | --- |
| Completo | Verificou o marco inicial e a tempestividade. Exibiu a regra, a ata, o calendário e o protocolo usados na conferência. |
| Parcial | Verificou o marco inicial com a ata. Indicou a falta dos comprovantes de protocolo e de juntada nos pontos a conferir. |
| Divergência | Verificou o marco inicial. Manteve a tempestividade pendente e indicou a divergência entre o trecho enviado pelo verificador e o documento dos autos. |

A homologação encerra esta etapa da verificação processual. A expansão do catálogo fica suspensa. O teste pode ser reproduzido com `pnpm exec playwright test -c playwright.desk-procedure.config.ts` após a compilação das dependências locais.

## E2 · URL da Mesa sem `URLSearchParams.size`

Em 11/11/2026, sobre `main` em `df8c714`. `desk-location.ts` e `routes.ts` decidiam pela propriedade `size`, ausente em Safari e iOS anteriores ao 17 e no Chrome anterior ao 113; nesses navegadores a URL saía sem caso, peça e conversa, e os parâmetros de retorno eram descartados. Ambos passaram a decidir por `toString()`.

| Item | Resultado |
| --- | --- |
| Testes novos | Três, removendo `size` de `URLSearchParams.prototype`: URL idêntica com e sem a propriedade, caminho limpo sem seleção e preservação dos parâmetros em `navigateToTab`. Falharam antes da correção. |
| Vitest da navegação | 63 aprovados de 63. |
| Tipos e Prettier | Sem erros. Prettier exige `--end-of-line auto` neste checkout Windows (CRLF). |
| `playwright.writing-desk.config.ts` | 37 aprovados de 37. |
| Outras APIs recentes | Sem outro `URLSearchParams.size`. Restam `.at(-1)` e `Object.hasOwn` (Safari 15.4, Chrome 92 e 93), fora do escopo; o alvo do build é ES2022 sem polyfill. |

Reversão: reverter o commit.

## E5 · área digitada no resumo da orientação

Em 11/11/2026, sobre `4018c92`. Quando o usuário escrevia a área ou a peça em vez de escolher uma opção, a resposta virava `unknown` e o resumo mostrava “Área a definir”. `guidance-service.ts` passou a projetar o texto livre mais recente de cada campo sem opção como `detail`, limitado a 120 caracteres; a tarefa fica de fora porque o texto dela já reaparece inteiro em `description`. O snapshot, o estado da decisão e o `guidanceHash` não mudam. O resumo exibe “Área: previdenciário, a confirmar”; sem texto digitado continua “Área a definir”.

| Item | Resultado |
| --- | --- |
| Testes novos | `guidance-service.test.ts` (projeção em área e tarefa, opção escolhida sem `detail`) e `guidance-model.test.ts` (texto do resumo). O primeiro falhou antes da correção. |
| Vitest | Serviço, modelo, regras e contrato da orientação: 12 aprovados de 12. |
| Tipos, ESLint e Prettier | Sem erros (Prettier com `--end-of-line auto` no checkout Windows). |
| `playwright.desk-guidance.config.ts` | 6 aprovados de 6. |

Reversão: reverter o commit; o snapshot não muda.

## E7 · locale UTF-8 nos testes de interface

Em 11/11/2026. O fluxo `ci.yml` passou a definir `LANG=C.UTF-8` e `LC_ALL=C.UTF-8` para todos os jobs, e o `README.md` documenta a exigência para quem roda os E2E em Linux ou macOS. Sem locale UTF-8, o Chromium em Linux nomeia como `download` o arquivo de título acentuado e o teste de exportação Word falha. Verificação: configuração apenas; o efeito se confirma na primeira execução da CI. Reversão: reverter o commit.

## Evidências locais

As referências aprovadas estão na pasta Downloads de Boni. O ZIP e o conteúdo das fichas são insumos de análise local. O inventário completo será gerado no workspace local ignorado pelo Git.

| Insumo | Arquivo |
|---|---|
| Plano aprovado | `ForgeLex-Plano-Detalhado-Mesa-Guiada-Habilidades-Ocultas-v2-2026-11-10.md` |
| Auditoria ForgeLex | `ForgeLex-Auditoria-Arquitetural-Mesa-Juridica-2026-11-10.md` |
| Plano anterior | `ForgeLex-Plano-Implementacao-Mesa-Juridica-2026-11-10.md` |
| Análise Rimor | `JUIT-Analise-Reversa-REA-2026-11-10.md` |
| Análise MinutaIA | `MinutaIA-Analise-Reversa-Tecnica-REA-2026-11-10.md` |
| Acervo capturado | `MinutaIA-Habilidades-Oficiais-2077-2026-11-10.zip` |

SHA-256 verificado do ZIP `2a0efbbc301e53c357d5fe6baac1a896c84669fc1646a62c2aec410550543d01`.
