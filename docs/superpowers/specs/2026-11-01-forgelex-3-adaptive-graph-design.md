# Incremento 2 — grafo nativo de orquestração adaptativa

## Objetivo e autorização

Boni solicitou implementar o próximo incremento, preservando os controles
atuais e validando localmente. A direção é o grafo nativo proposto na auditoria.
As escolhas de implementação abaixo são técnicas deste incremento. Mantém-se
a autorização de desenvolvimento local, sem commit/push/deploy, migration
remota, inferência paga ou novos serviços. O incremento 1 e seu complemento
permanecem preservados neste worktree, ainda sem commit.

## Alternativas

Uma nova sequência de `if`s não explicita dependências nem invalidação. Um
framework externo exigiria adaptar o journal, ownership e ledger existentes.
Adota-se um DAG nativo determinístico: o servidor define capacidades e arestas;
o modelo pode solicitar capacidades fechadas, jamais inventar nós ou executar
efeitos. A execução é serial, um nó por etapa do journal atual. Paralelismo
fica fora deste incremento para preservar admissão e cancelamento existentes.

## Contratos e roteamento

Nós: planejamento, análise de matéria, pesquisa, assessoria processual, redação,
revisão adversarial e verificação de suporte. Planejamento conserva TaskPlan.
O servidor compila os nós necessários a partir da ação, necessidades do plano
e ferramentas disponíveis. Pesquisa agrupa demanda jurisprudencial/normativa;
documentos factuais conservam a dispensa processual já implementada.

Um resultado de especialista pode conter `capabilityRequests` opcionais:
capacidade (`CASE_LAW_RESEARCH`, `NORM_RESEARCH`, `PROCEDURAL_ANALYSIS`,
`ADVERSARIAL_REVIEW`), motivo fechado (`MISSING_LEGAL_BASIS`,
`PROCEDURAL_DEPENDENCY`, `MATERIAL_CONFLICT`), issueIds e sourceIds. IDs devem
pertencer ao contexto/plano. Nenhuma solicitação altera a ação nem escolhe
provider, modelo, preço, permissão ou ferramenta nova. O verificador terminal
não pode solicitar replanejamento, criar claims/requisitos ou redigir documento.
Conflitos explícitos em claims de produtores também ativam revisão adversarial.

As dependências são conservadoras: cada capacidade depende dos produtores
anteriores selecionados na ordem análise → pesquisa → procedimento → redação
→ revisão. O verificador depende de todos os produtores ativos e só é executado
se houver fonte jurídica. Isso torna a ordem e a invalidação explícitas, sem
afirmar paralelismo. Capacidade de pesquisa sem nenhuma ferramenta necessária
é marcada indisponível, sem chamada inútil ao modelo, e produz limitação.
Ter apenas parte das ferramentas não transforma uma fonte ausente em disponível.

## Refinamento e reconciliação

No máximo um ciclo de replanejamento por trabalho. Solicitação satisfeita por
um nó ainda pendente é incorporada sem criar outro nó. Demanda nova após um
produtor concluído gera uma nova geração do nó afetado e dos descendentes que
já haviam executado com a entrada antiga; nós pendentes têm dependências
atualizadas. Um pedido do revisor por fundamento pode repetir pesquisa/redação/
revisão, mas nunca deixa a minuta anterior ser entregue como se tivesse sido
reconciliada. Resultados substituídos ficam arquivados por ID de nó e hash no
checkpoint; somente os ativos participam da entrega e de supportAudit.

Há no máximo 10 execuções de papéis, incluindo o planejamento. O custo total
continua limitado a 24 chamadas comerciais, 48 ferramentas e 12 por etapa,
2.048 tokens por chamada, 192.000 bytes de estado/entrega e os prazos existentes.
Antes de aceitar expansão, o servidor calcula se as etapas restantes cabem no
limite de papéis. Se não couberem, ou se o ciclo já foi usado, mantém a última
geração consistente e registra limitação explícita. Falha de fonte não autoriza
repetição automática; pedido de repetir operação indisponível é recusado.
Falhas são registradas por ferramenta: falha jurisprudencial não bloqueia
primeira consulta normativa disponível. Pedidos mistos separam capacidades
indisponíveis das independentes aceitas; ferramentas já falhadas são retiradas
do registro dos próximos nós, sem alterar o manifesto original do checkpoint.
Nenhuma chamada financeira incerta é reexecutada pelo grafo.

## Estado, retomada e compatibilidade

Novos trabalhos usam CaseTaskState v2, com contrato/policy/perfis próprios do
grafo. O estado registra os nós, dependências, geração, status, índices de
execução, hashes de entrada/saída, decisões com motivos fechados e resultados
substituídos. IDs de nó são locais ao estado, isolados pelo envelope de
execução/tenant/usuário do journal; podem ser conservados em uma sucessora
autorizada que retoma o mesmo checkpoint.

Estado v1 com o contrato 1.2.0 capturado neste worktree conserva o hash, perfis
e algoritmo sequencial anteriores, sem
migração automática. Uma fixture capturada antes da mudança prova retomada
sem executar novamente os papéis já concluídos. Versão desconhecida ou hash
divergente permanece rejeitado; isto não habilita checkpoints de contratos
anteriores ao incremento 1 que já eram incompatíveis. `caseTaskStepIndex` continua monotônico pelo
número de papéis executados; transições sem modelo são processadas dentro da
mesma etapa, sem gerar IDs duplicados de chamada.

O manifesto de ferramentas é fixado nos novos checkpoints. Mudança de
manifesto em uma retomada exige reavaliação, não ampliação silenciosa de acesso.
A cada retomada são conferidos DAG canônico, ausência de ciclos, status,
hashes dos resultados ativos/arquivados e sequência de perfis. O hash de entrada
tem preimage compacta: contexto/contrato/plano/ferramentas, hashes das fontes e
dependências, pedidos aceitos e hash da tentativa anterior. A conferência
compara esses vínculos na retomada; não é assinatura de uma autoridade externa.
Ausência de plano após execução de papéis é rejeitada antes de chamar o modelo.
Verificação marcada SKIPPED com evidência jurídica é rejeitada. Toda chamada
continua passando pelos guards atuais; seleção autorizada e evidência
recuperada permanecem separadas. Dados de fonte nunca se tornam instruções.

Resultados parciais por capacidade/limite usam novos códigos canônicos de
limitação para não se tornarem, sozinhos, entregas faturáveis. Diagnósticos de
grafo ficam no checkpoint; a interface recebe apenas as limitações pertinentes.
Uma entrega permanece candidata, com avaliação jurídica NOT_EVALUATED.

## Verificação e limites de alegação

Testes determinísticos cobrem rotas simples/complexas, ferramenta ausente,
conflito tardio, invalidação transitiva, um ciclo de refinamento, limite de nós,
referência inválida, checkpoint alterado, retomada e v1 histórico. Integração
SDK/transporte sintético cobre cobrança única, cancelamento e nova rodada dentro
do teto. Ensaio PostgreSQL usa banco descartável e retomada em outro processo.
Comparação antes/depois usa o mesmo cenário sintético e registra sequência,
etapas e afirmações ativas; não afirma melhoria semântica de modelo real.

Não inclui nova categoria jurídica, migração produtiva, avaliação jurídica real
ou publicação. Rollback para imagem que só leia v1 exige drenar/separar v2;
a nova imagem continua capaz de atender checkpoints v1.
