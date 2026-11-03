# ForgeLex — onde estamos e como continuar

## Próximo incremento delimitado: editor final — 02/11/2026

[Contrato proposto](docs/superpowers/specs/2026-11-02-forgelex-final-editor-contract.md):
propostas editoriais ancoradas na versão/hash da minuta, com mudanças substantivas
separadas e aplicação apenas por decisão explícita de Boni. Próximo incremento
local: schemas, validador e fixtures em `legal-agents`, sem ativar um oitavo papel,
chamar modelo, mudar a mesa ou aplicar alterações automaticamente. O contrato
está documentado; sua implementação e integração ainda não foram executadas.

## Consolidação local validada — 02/11/2026

[Registro e evidências](docs/architecture/2026-11-02-forgelex-local-consolidation.md):
trabalho organizado em commits locais; teste residual do piloto corrigido.
Build completo e suíte geral aprovados: 1.621 testes, zero falhas, 17 condicionais
ignorados; 15 testes do executor, tipos da API e lint também aprovados.
V8 permanece validado apenas localmente. Sem chamadas pagas, push, migration
remota ou deploy. A falha antiga do piloto nos recibos anteriores é histórica.

## Bloqueio D04 corrigido localmente — 02/11/2026

[Diagnóstico, correção e replay](docs/architecture/2026-11-02-forgelex-d04-verifier-budget-fix.md):
novas tarefas v8 enviam ao verificador uma projeção com todas as claims, plano,
fontes e minuta; requisitos/findings anteriores permanecem no estado e na entrega.
Com as mesmas saídas gravadas de D04, a reserva caiu de US$ 0,182612 para
US$ 0,137688; com o consumo anterior soma US$ 0,238618, dentro de US$ 0,25.
181 testes focados, build completo, tipos da API e lint aprovados. A suíte ampla
identificou teste antigo do piloto que esperava duas chamadas; essa pendência
foi corrigida e validada na consolidação registrada acima.
Mesa, limites e checkpoints históricos preservados. Zero chamadas pagas novas.
A entrega D04 real continua pendente: o replay usa resposta sintética do verificador.
Nova medição paga exige decisão específica; sem os outros 54 cenários ou deploy.

## Calibração v7 executada — 02/11/2026

[Resultados e evidências](docs/architecture/2026-11-02-forgelex-recalibration-v7-results.md):
seis execuções, 21 chamadas e US$ 0,275842 calculados, nenhum custo incerto.
Inicial: três perguntas. V7: D01 e D03 entregues com ressalvas; D04 completou
minuta e revisão intermediárias, mas a reserva da chamada ao verificador foi
recusada. Sem `CLAIM_ID_CONFLICT` ou `SUPPORT_CHECK_INVALID` nesta amostra.
A reserva de D04 foi reproduzida e corrigida localmente no registro v8 acima,
preservando os limites; ainda sem medição do novo contrato pelo modelo real. As entregas dependem de avaliação por Boni. Acumulado
das quatro campanhas: US$ 1,126430. Autorização desta rodada encerrada; sem os
54 lugares restantes, repetição paga ou deploy.

## Três pendências v6 corrigidas localmente — 02/11/2026

[Correção e evidências](docs/architecture/2026-11-02-forgelex-v6-pending-fix.md):
novos pedidos v7 evitam releitura redundante no corpus fechado, separam IDs por
papel/tentativa e restringem checks aos pares válidos de afirmação/fonte jurídica.
Checkpoints anteriores preservados, inclusive retomada do v6 real. Reprodução
SDK de D01 cabe na mesma reserva; 313 cenários, 15 testes do executor e seis
simulações validados. Build, tipos e lint aprovados. Mesa e limites intactos.
Nenhuma chamada paga durante a correção. A medição v7 posterior está no registro
acima; avaliação por Boni, 54 cenários restantes e publicação continuam separados.

## Calibração v6 executada — 02/11/2026

[Resultados e evidências](docs/architecture/2026-11-02-forgelex-recalibration-v6-results.md):
seis execuções, 30 chamadas, US$ 0,341614 calculados, nenhum custo incerto.
Inicial: três perguntas. V6: D03 entregue com ressalvas; D01 bloqueado pela
reserva financeira e D04 por `CLAIM_ID_CONFLICT`. D03 conserva checks de suporte
inválidos. Total das três campanhas: US$ 0,850588. Escopo autorizado encerrado.
As três pendências locais foram tratadas no registro v7 acima. Mesa e limites
preservados; sem os 54 cenários restantes, repetição de chamadas ou deploy.

## Falhas de entrega corrigidas localmente — 02/11/2026

[Correção e limites do diagnóstico](docs/architecture/2026-11-02-forgelex-delivery-failure-fix.md):
estado v6 encerra o papel após submissão aceita, classifica respostas incompletas
com consumo liquidado e conserva diagnóstico saneado. Matriz probatória restrita
à análise de provas; contratos antigos preservados. 300 testes, 15 testes do
executor e seis simulações SDK aprovados; build, tipos e lint aprovados.
Mesa, limites e campanhas anteriores intactos; nenhuma nova chamada paga.
A validação local não prova a causa exata de todos os erros históricos. A medição
real subsequente está registrada acima; qualquer nova rodada exige outra decisão.
Sem commit, push ou deploy.

## Calibração v5 executada — 02/11/2026

[Resultado real e diagnóstico](docs/architecture/2026-11-02-forgelex-recalibration-v5-results.md):
seis execuções, 33 chamadas, custo calculado US$ 0,373532, nenhum custo incerto.
Inicial: três perguntas. Candidato v5: lacunas tratadas como ressalvas, avanço
para especialistas, mas três `OPENAI_AGENT_ERROR` e nenhuma entrega final.
As duas campanhas somam US$ 0,508974 calculados. Escopo autorizado encerrado.
Diagnóstico saneado e reprodução local implementados no registro v6 acima;
não aumentar limites nem alterar a mesa por inferência. Sem deploy.

## Nova calibração v5 preparada — 02/11/2026

[Campanha e orçamento](docs/architecture/2026-11-02-forgelex-recalibration-v5.md):
`2026-11-02-delivery-gaps-v5`, seis execuções propostas, teto novo de US$ 1,50.
Manifesto próprio, campanha histórica preservada e ledger pago ainda inexistente.
76 testes e seis simulações SDK aprovados; nenhuma chamada paga nesta preparação.
Este registro descreve a preparação; a execução real subsequente está acima.
Não reutilizar a autorização encerrada nem executar os 54 lugares restantes.

## Lacunas e entrega com ressalvas — correção local de 02/11/2026

[Correção e validação](docs/architecture/2026-11-02-forgelex-delivery-gaps.md):
novos pedidos distinguem dúvida impeditiva de lacuna que permite entrega
limitada. Ressalva permanece na entrega e não cria cobrança sozinha. Mesa e
aprovações preservadas; checkpoints antigos mantêm seus contratos. Estado v5.
231 testes de regressão, 11 de preparação/orçamento e seis simulações SDK
aprovados; build, tipos e lint aprovados. Nenhuma nova inferência paga.
A calibração real subsequente foi executada na campanha v5, registrada no início
deste documento; confirmou avanço com ressalvas, mas encontrou falhas posteriores.

## Calibração real — 02/11/2026

Seis execuções autorizadas por Boni, teto US$ 1,50: **US$ 0,135442** calculados
pelos tokens retornados, 18 chamadas, nenhum custo incerto. Todas pararam na
primeira pergunta, sem entrega final. [Resultado e evidências](docs/architecture/2026-11-02-forgelex-calibration-results.md).
Na revisão, ambas as versões bloquearam uma correção por lacuna que o próprio
plano descreve como não impeditiva. A correção foi implementada e validada
localmente no registro acima, ainda sem nova medição real. Os 54 lugares
restantes não estão autorizados.
Mesa preservada; sem alteração de código do produto, commit, push ou deploy.

## Mesa — menu na mensagem (02/11/2026)

As opções existentes agora ficam em um seletor dentro da caixa de mensagem,
conforme esclarecimento de Boni. A linha de botões externos foi retirada;
seleção não envia pedido nem cobra. Rascunhos/Revisão e controles existentes
foram preservados. [Registro local](docs/architecture/2026-11-02-forgelex-mesa-menu.md).
Sem publicação. O candidato da avaliação foi regenerado com este menu e o
executor da calibração; alterações posteriores de código exigem nova preparação.

## Avaliação final — preparação de 02/11/2026

[Cenários, comparação e custo](docs/architecture/2026-11-02-forgelex-3-final-evaluation.md)
preparados offline: 24 cenários pareados, 12 de capacidades novas e 24 controles
locais. Versão inicial arquivada e candidato congelado com hashes. Nenhuma nota
jurídica atribuída. Estimativa original da calibração: seis execuções,
estimativa US$ 0,36–1,08, teto US$ 1,50. Rodada completa: US$ 3,60–10,80,
teto proposto US$ 15 incluindo calibração. A calibração já foi autorizada e
executada conforme registro acima; restante depende de nova decisão.
Executor dos seis lugares e orçamento compartilhado implementados:
11 testes de preparação/orçamento, 10 regressões do transporte e seis simulações
dos motores inicial/atual aprovados na preparação offline. Executor dos demais
lugares e avaliação jurídica por Boni ainda pendentes. Mesa e controles do
produto preservados; união de edição/revisão fica para depois.

## Incremento 6 local — revisão de itens alterados (02/11/2026)

A [nova aprovação de fatos e provas](docs/architecture/2026-11-02-forgelex-3-evidence-reapproval.md)
acrescenta a opção **Revisar alterações** na mesa do caso. O diálogo compara a
última aprovação e o conteúdo atual, com fontes sob demanda e seleção vazia.
Somente a aprovação humana explícita libera o conteúdo atualizado para novos
pedidos. Recibos anteriores, histórico, autorização e controles financeiros são
preservados. A decisão não cria cobrança ou execução; fontes indisponíveis e
condições inválidas permanecem bloqueadas.

Evidências no [recibo local](docs/architecture/evidence/2026-11-02-evidence-reapproval-validation.json).
Sem commit, push, deploy ou inferência paga. Não inclui editor novo de registros
nem homologação com autos reais.

## Incremento 5 local — contexto aprovado na peça e revisão (02/11/2026)

O [reaproveitamento automático](docs/architecture/2026-11-02-forgelex-3-approved-case-context.md)
recupera fatos/provas aprovados do caso em novos pedidos, sem seletor adicional.
Preserva texto revisado, fontes e relações contrárias; vincula fatos/provas às
seções das minutas e entrega esse contexto ao revisor sem aprovar ou sobrescrever
peças. Referências congeladas em retomadas, verificação de acesso e integridade,
histórico preservado e estado v4 separado dos contratos anteriores. Fontes
consultáveis na mesa; arquitetura e controles permanecem internos.

Captura limitada, sem truncamento silencioso. Registros modificados depois da
aprovação não são reutilizados automaticamente. Build, tipos, lint, E2E e
PostgreSQL locais aprovados; resultado consolidado no
[recibo](docs/architecture/evidence/2026-11-02-approved-case-context-validation.json).
Sem commit/push/deploy/inferência paga; não homologado com conteúdo jurídico real.

## Direção de produto reafirmada por Boni — 01/11/2026

Preservar a mesa ajustada pelo Claude Code: mesa e pedidos, com escolhas
objetivas sobre o resultado jurídico. Orquestração, agentes, etapas técnicas,
metadados e controles são internos. Não criar configurações ou painéis de
engenharia para o cliente. Revisões e aprovações humanas aparecem apenas como
decisões concretas dentro da mesa.

A apresentação operacional da matriz foi retirada e a incorporação de itens
passou a abrir somente por “Guardar no caso”, sem painel permanente. A proposta
de selecionar novamente cada fato/prova em cada pedido foi abandonada. O uso
automático dos itens já aprovados foi implementado no incremento 5, conforme o [design corrigido](docs/superpowers/specs/2026-11-01-forgelex-3-approved-case-context-design.md).

Validação desta correção: 31 testes pertinentes e 3 cenários de navegador
aprovados, build web com TypeScript e lint dos arquivos alterados sem erros.
Acessibilidade da revisão mobile e apresentação desktop conferidas. Sem
publicação. [Recibo local](docs/architecture/evidence/2026-11-01-mesa-objective-options-validation.json).

## Incremento 4 local — incorporação probatória revisada (01/11/2026)

A [revisão para incorporar ao caso](docs/architecture/2026-11-01-forgelex-3-evidence-adoption.md)
permite selecionar, editar, aprovar ou descartar os itens da análise probatória.
A gravação é transacional, vinculada à sessão de quem revisa, com fontes atuais,
revisão/token e repetição idempotente. Preserva entrega original, controles de
acesso e cobrança. Fatos entram como alegações ou controvérsias, nunca confirmados
automaticamente. Migration 0037 aditiva e validações locais; sem publicação,
inferência paga ou aprovação de itens reais. Avaliação semântica real permanece
separada da implementação e dos ensaios sintéticos.

## Incremento 3 local — análise probatória (01/11/2026)

A [capacidade probatória](docs/architecture/2026-11-01-forgelex-3-evidence.md)
adiciona a ação Analisar fatos e provas: matriz questão–alegação–trecho,
cronologia conservadora e contradições, com conferência literal de fontes e
revisão adversarial. Estado v3 apenas para a nova ação; v1/v2 preservados.
Só relatos não tornam a ação utilizável para cobrança. A entrega é candidata;
fatos/provas não são incorporados automaticamente. Trabalho local sem publicação.
A ponte de incorporação revisada foi implementada no incremento 4 acima.
Avaliação semântica real permanece separada.

## Incremento 2 local — grafo adaptativo (01/11/2026)

O [grafo nativo](docs/architecture/2026-11-01-forgelex-3-adaptive-graph.md)
seleciona capacidades, explicita dependências e admite um ciclo de refinamento,
arquivando saídas invalidadas antes de produzir a entrega ativa. Novos trabalhos
usam estado v2; checkpoints v1 do contrato 1.2.0 capturado continuam no fluxo
sequencial anterior. Limites, journal, controles de acesso e cobrança preservados.
Desenvolvimento e validação locais, sem commit/push/merge/deploy. A vertical
probatória foi implementada no incremento 3 acima; avaliação semântica real e
publicação não foram executadas.

## Incremento local de qualidade — 01/11/2026

Em `codex/forgelex-3-quality`, sobre a main `025f6dd`, foi implementada a
verificação terminal dos handoffs e a auditoria de suporte por afirmação/fonte.
O [relatório da auditoria](docs/architecture/2026-11-01-forgelex-3-audit.md)
registra arquitetura, comparação sintética, limitações e próximos incrementos.
O [complemento das pendências locais](docs/architecture/2026-11-01-forgelex-3-pending-local.md)
conecta pesquisa/obtenção/verificação STJ ao runtime comercial, com pesquisa
incluída no teto por decisão de Boni, e corrige a fixture SQLite isolada.
Trabalho local, sem commit/push/merge/deploy. Reutiliza o índice persistido e
não conclui o programa ForgeLex 3.0. Os registros de publicação abaixo mantêm
suas datas e não comprovam o estado produtivo de 01/11.

Atualizado em 24/10/2026. Este resumo orienta a próxima sessão; o histórico de
validações e publicações permanece em [STATUS_VALIDACAO.md](STATUS_VALIDACAO.md).

Boni é o único avaliador e aprovador humano do projeto, por decisão expressa
de 10/10/2026. Nenhuma frente depende de segundo revisor ou parecer de terceiro;
aplica-se [AGENTS.md](AGENTS.md), inclusive sobre exigências de planos antigos.

## Plataforma agêntica — estado em 31/10/2026

A transição agêntica, antes suspensa, foi retomada e está **integrada à `main`**:
a mesa em conversa única, com conversas recentes (PRs #89 e #91), e a execução
comercial com cobrança por trabalho. A revisão técnica de 30/10 e as correções
dela (stream de eventos, conciliação de chamada comercial incerta, cobrança,
logs) estão na PR #87, na #88 e na #90 (dependências). O texto da revisão está em
[REVISAO_PLATAFORMA_AGENTICA_2026-10-30.md](REVISAO_PLATAFORMA_AGENTICA_2026-10-30.md).
**Publicação e ativação da execução comercial não foram feitas por este registro**:
dependem de recibo próprio de Boni (backup, migrations, flags, chave no gerenciador
de segredos e configuração da instância). Pendências em [PENDENCIAS.md](PENDENCIAS.md).

## Dependências de segurança — publicadas em 24/10/2026

PR #78 integrada em main `6499eb0`; seis checks aprovados na PR e
pós-merge. Zod 4.6.7 com conversão nativa e regressões dos contratos, SDKs MCP
e dependências corrigidas. 948 testes aprovados, 18 ignorados, sem novos skips;
audits de produção e completo sem alertas conhecidos na consulta desta entrega.

API `forgelex-api-prod-deps-6499eb0` e worker
`forgelex-closure-hml-private-deps-6499eb0` em 100%, após inventário/testes
no container, candidata e revisão comercial sem tráfego. Oito probes públicos
aprovados após a limpeza; IAM, configuração e Scheduler preservados.
Nenhuma migration reaplicada, AUTO_MIGRATE=false e 47 arquivos locais intactos.
O advisory de braces foi retirado pelo upstream em 23/10; a mitigação permanece.
[Recibo, provas e limites](docs/operations/stabilization/2026-10-24-security-dependencies-publication.md). Homologação nos hosts reais e avaliação
jurídica continuam com seus limites anteriores.

## Correção do Hono — registro da publicação de 20/10

Main `e93a508`, PR #76 e seis checks pós-merge aprovados. Build canônico,
verificação do inventário do container e candidatas pública/privada validados
antes da promoção. API `forgelex-api-prod-hono-e93a508` e worker
`forgelex-closure-hml-private-hono-e93a508` atenderam 100% até a publicação de 24/10. Nenhuma migration reaplicada;
AUTO_MIGRATE=false e 47 arquivos locais preservados. Hono 4.13.11 no lockfile
do build; pacote ausente no runtime de produção.
[Publicação, provas e limites](docs/operations/stabilization/2026-10-20-hono-publication.md).

## Camada analítica — publicada em 18/10, conferida em 20/10

PR #75 integrada em `cabf504040833ffd1af3f134761b0cb9f6eb6e32`, com seis
checks aprovados na PR e em main. Backup manual `1792347340554` concluído
antes das duas migrations analíticas; o banco produtivo passou de 38 para
40 migrations. Startup permanece em verificação, com auto-migrate desligado.

Candidata e revisão comercial passaram por ensaios autenticados com dados
sintéticos antes da promoção. A revisão `forgelex-api-prod-analise-cabf504`
iniciou o atendimento em 18/10 e foi substituída pela revisão do Hono acima,
preservando análise e cobrança habilitadas. O worker privado
de encerramento também foi atualizado para conservar o expurgo das novas
tabelas. A conferência de 20/10 e a limpeza operacional estão no
[recibo da publicação](docs/operations/stabilization/2026-10-18-analise-publication.md).
O ensaio técnico não substitui homologação da camada analítica nos hosts
ChatGPT/Claude nem avaliação jurídica de resultados por Boni.

## Preparação da camada analítica — registro anterior à publicação

Worktree isolado `analise-publication-readiness/SDK`, base `3657a63` (main após
PR #74). O checkout original e seus 47 arquivos locais foram preservados.
O módulo agora respeita `apply`/`verify`; a API produtiva verifica o schema quando
auto-migrate está desligado. O comando explícito de migration inclui o schema
analítico somente com `FORGELEX_ANALISE_ENABLED=true`. A CI passa a exercitar
cobrança/interrupções e migration/expurgo no banco PostgreSQL dedicado.

A [reconciliação operacional](docs/operations/analise-reconciliation.md) foi
definida com diagnóstico somente leitura e decisão de Boni por cenário;
não implementa reparo de saldo/direitos nem retomada automática.
Ver [validação e limites](docs/operations/stabilization/2026-10-18-analise-publication-readiness.md).
Validação local concluída: 923 testes aprovados e 18 ignorados; build, lint,
tipos e ensaios PostgreSQL aprovados. Boni autorizou commit, push, PR e
integração condicionada a todos os checks aprovados em 18/10. Implementação
`dd87fc3`, enviada na [PR #75](https://github.com/junior-aguiar-eng/ForgeLex/pull/75),
que registra CI remota e estado de integração. Esta preparação não incluiu
operações remotas; a publicação posterior está registrada acima.

## Camada analítica — correções e estabilização de 14/10

As PRs #71–#73 do Claude estão integradas no `main` observado em `a3af1f6`.
Os seis achados de isolamento, cobrança, fontes, apresentação e exclusão de conta
foram tratados na branch `codex/fix-analise-six-issues`, em worktree próprio.
O checkout de simplificação anterior foi preservado. Testes e limites estão no
[registro local](docs/operations/stabilization/2026-10-14-analise-six-fixes.md).
Após corrigir o encerramento dos workers e estabilizar o aquecimento das telas,
`pnpm test` passou com saída zero: 912 aprovados, 18 ignorados. Build, lint e tipos
aprovados; nenhum teste foi ignorado para obter esse resultado.
Boni autorizou commit, push, PR e integração em `main` em 14/10. Entrega Git na
[PR #74](https://github.com/junior-aguiar-eng/ForgeLex/pull/74), que registra os
checks e o estado de integração. Migration remota e deploy não foram executados.
Operações interrompidas sem resultado continuam exigindo
reconciliação, sem retomada automática. Os estados produtivos abaixo pertencem
às datas de seus registros; não foram revalidados nesta rodada.

## Pesquisas salvas e leitor MCP — publicado em 11/10

PR #68 integrada em `5be473d0e1566f1956971247cf26da9cd9224415`, com seis checks
aprovados na PR e em main. Migração aditiva 0030 aplicada separadamente ao
PostgreSQL produtivo após backup; 38 migrações e três novas tabelas conferidas.
Revisão `forgelex-api-prod-saved-5be473d0` atende 100% do tráfego, com cobrança
normal, pesquisas salvas e leitor ativos. A apresentação pública usa tribunais
superiores e consulta processual; a cobertura real continua STJ/TJAL.

Até seis pesquisas completas, escolhidas manualmente, sem substituição
automática; reabertura gratuita. Na publicação, nenhuma permissão foi ampliada.
Ensaios posteriores confirmaram o leitor no ChatGPT e Claude Web; Boni
comprovou também o Claude Desktop por captura, após pedir expressamente o
painel. Site e ChatGPT salvaram a mesma pesquisa sem duplicar; ambos os
aplicativos web listaram e reabriram suas 20 decisões. A única pesquisa do
ensaio autorizado custou R$ 0,20. Gerenciamento autorizado expressamente para
ChatGPT e, depois, somente a conexão Claude mais recente. As duas conexões
Claude anteriores continuam sem acesso à coleção.
Falta testar salvamento pelo Claude e coleção no Desktop; cópia automática no
ChatGPT exigiu alternativa manual, que funcionou. Leitor aberto antes de
autorizar conserva o aviso antigo até reabertura.
[Ensaios reais, aprovação de Boni e limites](docs/operations/stabilization/2026-10-12-mcp-live-validation.md).

Reverter por controles mantendo imagem compatível com as novas tabelas de
encerramento/restauração. Depois de existirem pesquisas salvas, a imagem antiga
não é rollback completo para tratamento desses dados.
[Publicação, provas e limites](docs/operations/stabilization/2026-10-11-saved-research-publication.md).

O backlog atual está em [PENDENCIAS.md](PENDENCIAS.md). A remediação da auditoria
foi integrada pela PR #58: correções técnicas e ponte direta Pesquisa → Caso.
O runtime daquela entrega é `forgelex-api-prod-audit-5aca51e`, código `5aca51e`,
preservado como rollback do congelamento publicado em 11/10.
[Evidências e limites](docs/operations/stabilization/2026-10-07-audit-remediation.md).

A pendência de ativação técnica da retenção foi encerrada em 09/10, após
autorização explícita de Boni e duas execuções em modo apply, ambas sem conteúdo
elegível. A entrega residual adiciona mitigação local de braces e audit completo
na CI; o advisory upstream e as comprovações humanas continuam abertos.
[Registro de 09/10](docs/operations/stabilization/2026-10-09-audit-residual-closure.md).

O encerramento técnico seguinte foi integrado pela PR #61 em `86156a0`.
A medição do corpus real demonstrou custo de acesso aos metadados de versões;
a migration 0029 foi aplicada ao banco publicado após seis checks e revisão.
O plano usa o índice de cobertura, com zero Heap Fetches nessa etapa. Amostras
da mesma consulta ampla: 20,3 s antes, 13,3–16,5 s depois, resultados idênticos.
Não houve novo deploy HTTP. As correções executáveis do recorte auditado estão
encerradas; manutenção, dependências externas e comprovações humanas são
separadas no backlog.
[Medições, aplicação e limites](docs/operations/stabilization/2026-10-09-technical-pending-closure.md).

PR #60 reúne a entrega residual; o código `c0a2d3c` passou nos seis checks
obrigatórios, com 794 unitários e 130 E2E aprovados. Serviços PostgreSQL da CI
usam o espelho Docker Official Image no ECR Public. Sem novo deploy HTTP,
pois o comportamento de runtime não foi alterado por esse incremento.

## Congelamento do site — publicado em 11/10

Boni autorizou a execução do plano de escopo MCP. A branch isolada
`codex/site-mcp-scope-freeze`, base main `f5f9316`, oculta casos, análise,
rascunhos, revisão e atalhos no frontend por configuração reversível.
Backend, banco, catálogo MCP, API, conta e consulta gratuita são preservados.
O checkout original e seus trabalhos anteriores permanecem intactos.
[Escopo e reversão](docs/product/site-mcp-scope-freeze.md).

Vistoria complementar de 11/10 confirmou produção já publicada, PostgreSQL
real somente leitura e conexão OAuth gratuita em ChatGPT/Claude. A regressão
PostgreSQL descartável aprovou 39 testes e 55 checks. Essa vistoria precedeu
a publicação do novo site.
[Evidências e limites](docs/operations/stabilization/2026-10-11-site-mcp-external-validation.md).

Boni autorizou commit, push, PR, integração em main e deploy. PR #66 integrada
em `a6672d4`, seis jobs da CI aprovados e build canônico concluído. A revisão
`forgelex-api-prod-site-a6672d49` recebe 100% do tráfego. Promoção 5/25/100:
470 probes sem erros. Interface publicada, seis redirecionamentos, ausência de
carregamento da fila/casos e recuperação de aba antiga conferidos no navegador.
OAuth gratuito confirmado no Codex após o deploy. Configuração de backend,
Cloud SQL, Supabase e grants preservada; sem migration remota nesta publicação.
[Publicação, recibo e rollback](docs/operations/stabilization/2026-10-11-site-mcp-publication.md).

| Plano/frente | Estado atual |
| --- | --- |
| Simplificação do fluxo de casos (10/10, artefatos locais anteriores) | Suspenso; histórico e trabalho local preservados |
| Mesa/orquestração jurídica V2 e transição agêntica (10/10) | Retomadas em 30–31/10: mesa única e execução comercial integradas (ver seção acima); a visão V2 original segue como referência histórica |
| Apresentação visual de decisões MCP (11/10) | Publicada pela PR #68; leitor comprovado no ChatGPT e Claude Web/Desktop; limites da coleção registrados no ensaio de 12/10 |
| Ocultação do site (11/10) | Publicada pela PR #66; validação técnica em produção registrada; avaliação humana por Boni |

A descrição do fluxo abaixo registra o produto anteriormente publicado,
preservado no backend e oculto na interface atual.

## O produto hoje

O percurso é **caso → documentos → análise na IA externa → rascunho no site →
conferência das fontes → edição → versão salva → DOCX**. O ForgeLex conserva
documentos, versões, referências, permissões e histórico. ChatGPT/Claude fazem
a análise com sua própria conta, usando o MCP autorizado por caso. O envio de
texto depende de permissão específica; receber texto não significa aprovação
jurídica. A revisão humana continua necessária.

O produto STJ tem pesquisa, cobrança por operação, API e MCP. O estado canônico
marca as Fases 8 e 14 concluídas e a expansão para outros tribunais congelada.
Os pacotes de agentes/workflows existentes não tornam necessário hospedar um
modelo no site nem montar uma nova arquitetura. O documento V2 é uma visão
ampla; sua extensão não deve ser usada como uma lista de urgências.

## Publicado, local e futuro

As revisões nas evidências de cada incremento identificam suas publicações
originais. O runtime atual incorpora essas entregas e está indicado no início.

| Frente                                                       | Estado nesta consolidação                                          | Evidência e limite                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Contexto autorizado e retorno de texto por MCP               | Publicado; homologações anteriores em ChatGPT e Claude registradas | Recebimentos versionados, idempotência e adoção humana; ver STATUS                                                               |
| Arquivo, lixeira, restauração e exclusão                     | Publicado                                                          | Homologado em `forgelex-api-prod-lifecycle-ui-326a96e` com dados sintéticos; incluído na revisão atual do leitor                 |
| Leitura integral de documentos e abertura das fontes         | Publicado; percurso completo homologado em produção                | PR #54, revisão `forgelex-api-prod-reader-0dc9ec5`, 100%; Claude → versão 2 → DOCX inspecionado; permissões sintéticas revogadas |
| Identificação das conexões de IA no caso                     | Publicado; integração e promoção verificadas | PR #56, revisão `forgelex-api-prod-connection-a23cc07`, 100%; CI da PR e de main aprovada                     |
| Julgados da Pesquisa no caso                                 | Publicado; salvar, conferir fonte e reutilizar nos rascunhos | PR #58; CI com 130 E2E; runtime `forgelex-api-prod-audit-5aca51e`; sem nova pesquisa para salvar/copiar |
| Retenção operacional                                        | Limpeza diária às 8h, autenticada por OAuth, ativada em 09/10 | Autorização nominal; apply manual e via Scheduler concluídos com zero removidos; worker HTTP desabilitado; ver registro residual |
| Mesa do caso e orientação do próximo passo                   | Suspensa como execução                                                    | Organizar os recursos existentes em torno do caso, com detalhes técnicos sob demanda; não há execução autorizada nesta entrega   |
| Novos agentes internos, modelos hospedados e novos tribunais | Fora do incremento atual                                           | Exigem necessidade demonstrada e decisão própria; não bloqueiam o fluxo MCP externo                                              |

## A entrega encerrada

O leitor foi integrado e publicado, com testes, revisão independente e promoção
gradual aprovados. O caso sintético passou por leitura no Claude, retorno ao
rascunho, conferência da fonte, edição salva como versão 2 e exportação DOCX.
O arquivo indicado pelo usuário na área de trabalho foi inspecionado: versão 2,
edição de teste, seis referências à versão documental 1 e revisão humana pendente.
As duas permissões sintéticas foram revogadas; nova leitura pelo Claude recebeu
`CASE_CONTEXT_NOT_AUTHORIZED`. Caso, documento e rascunho foram preservados. O
[registro da entrega](docs/operations/stabilization/2026-10-07-document-reader-publication.md)
separa essas evidências.

A investigação da falha de conferência reproduziu um contexto desatualizado:
a conferência encontrava um fato que o painel ainda não tinha carregado. Abrir
um rascunho agora atualiza também o contexto do caso. O teste falhou antes da
correção e passou depois. Isso comprova esse defeito; não identifica, sozinho,
a ordem exata das respostas na primeira ocorrência intermitente.

## Cuidados para a próxima sessão

O percurso real encontrou uma dificuldade concreta: reconectar o Claude criou
uma nova conexão, enquanto a seleção sintética continuava autorizada na antiga.
Ambas apareciam como “Claude”. A leitura inicial retornou lista vazia; atualizar
as conexões, revogar a seleção antiga e selecionar a nova resolveu o ensaio.
O incremento de **identificar a conexão no fluxo do caso e orientar a reconexão**
foi implementado e enviado ao GitHub na branch `codex/case-ai-connection-identity`, com
nome/data/estado e detalhes sob demanda. A mudança invalida a prévia quando a
conexão escolhida muda e conserva o material para conferência, sem escolher ou
transferir permissões automaticamente. Foi integrado pela PR #56 em `a23cc07`
e publicado com 100% do tráfego; conferência da interface no caso sintético
sem concessão de novas permissões.
[Comportamento e limites da validação](docs/product/case-ai-connection-identity.md).

Casos já conservam julgados para teses, seções, citações e leitura autorizada
pela IA. A busca dentro do research memo salva as fontes no caso. A tela geral
Pesquisa oferece **Salvar julgado no caso** desde a publicação da PR #58.
O usuário escolhe um caso ativo; o acervo permite conferir a fonte e copiar a
citação. O vínculo conserva a proveniência e não decide a pertinência jurídica.

Registro anterior à remediação: o GitHub informou três alertas no lockfile em
07/10: `source-map-js` (alta, correção 1.2.2), `postcss-selector-parser`
(média, correção 7.1.6) e `braces` (alta, sem versão corrigida no alerta).
`pnpm why` localiza os três nas ferramentas de build do frontend; o Dockerfile
entrega a API com dependências de produção e o frontend como arquivos estáticos.
Não foi demonstrado caminho de exploração por entrada de usuário no servidor.
Na remediação, os dois primeiros foram corrigidos com build aprovado e CSS
idêntico. O alerta alto de `braces` permanece acompanhado, sem patch publicado
na consulta de 07/10. O audit de produção sem alertas não encerra esse residual.

Usar um checkout baseado em main e confirmar Git e revisão em produção.
Em 10/10, `C:/Users/Boni Jr/.antigravity-ide/SDK` passou à branch local
`codex/docs-repository-hygiene`, criada sobre `origin/main` (`117b7d0`).
A branch histórica `codex/p2-search-chunk-recovery` foi preservada com seus
três commits exclusivos e cópia recuperável. O checkout de main continua em
`C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`. Os registros antigos
não substituem o estado atual nem autorizam integrar diferenças históricas.
[Inventário, limpeza e recuperação](docs/operations/stabilization/2026-10-10-documentation-repository-hygiene.md).

## Consolidação documental e higiene local — 10/10/2026

README, índice e plano mestre foram reconciliados com as publicações atuais.
O status distingue as correções técnicas encerradas das comprovações humanas,
dependências externas e manutenção contínua. Branches locais já integradas e
fora de uso foram retiradas após inventário e bundle verificado; branches
vinculadas a worktrees e os dois históricos exclusivos foram preservados.
Os worktrees do app permanecem disponíveis; a vinculação do worktree
`document-reader` foi recusada por pertencer a outro chat. Boni autorizou
commit e push da revisão documental em `codex/docs-repository-hygiene`.
Integração em main, PR, migration e deploy ficam fora desta manutenção.

## Organização do repositório em 07/10 — registro anterior à publicação

- `main` local atualizado por fast-forward até `origin/main` (`9439524`),
  no checkout `draft-review/SDK`. Não houve integração de novas branches.
- Incremento de conexões: código `85d1c22`, em
  `codex/case-ai-connection-identity`, com documentação e validações locais.
- Pendências antigas dos P2: commits separados para busca, recuperação de
  páginas e registro histórico, na branch `codex/p2-search-chunk-recovery`.
  A base antiga não é o checkout para continuar novos incrementos.
- Duas propostas originais de 03/10 preservadas no commit `e2733f0`, branch
  `codex/datajud-workspace-publication`, claramente marcadas como históricas.
  As versões executadas continuam em main; não são tarefas novas.

O desenho de revisão/contexto/retorno e o plano de conferência foram reconciliados
com as publicações já registradas. Esta consolidação faz commit e push; não faz
PR, merge, migration ou deploy. As novas mudanças continuavam em branch naquele registro. A integração e
publicação posteriores da PR #56 estão no registro abaixo.

Referências: [plano de execução](Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md),
[comportamento do leitor](docs/product/document-reader.md) e
[última publicação anterior](docs/operations/stabilization/2026-10-06-matter-lifecycle-publication.md).

## Publicação do incremento das conexões

PR #56 integrada e publicada em 07/10/2026. CI da PR e de main: seis jobs
aprovados, 761 testes unitários (17 condicionais ignorados) e 127 E2E. Banco
temporário limpo automaticamente, candidata sem tráfego validada e promoção
5/25/100 concluída. Configuração preservada, sem migration.

[Registro e limites da publicação](docs/operations/stabilization/2026-10-07-case-ai-connection-publication.md).

## Publicação da remediação da auditoria

PR #58 integrada em `5aca51e`. CI da PR e de main com seis jobs aprovados;
764 unitários aprovados, 17 condicionais ignorados e 130 E2E em main.
Promoção 5/25/100 e configuração preservada, sem migration. Inspeção de retenção
diária às 8h, com duas execuções reais; somente leitura e zero elegíveis nas
medições. A reserva histórica foi classificada sem alterar saldo ou registros.

Este registro de 07/10 antecede a ativação autorizada de retenção em 09/10.
A autorização técnica de expurgo foi posteriormente registrada e executada;
as comprovações humanas seguem abertas em PENDENCIAS e não foram encerradas
por testes. A organização dos checkouts foi atualizada em 10/10 acima.
[Recibo, rollback e limites](docs/operations/stabilization/2026-10-07-audit-remediation-publication.md).
