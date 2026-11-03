# Revisão humana editorial na mesa — 03/11/2026

Checkout `C:/Users/Boni Jr/.codex/worktrees/forgelex-3-audit/SDK`, branch
`codex/forgelex-3-quality`, HEAD `5ba4ca87f3d4602db878ce8935552354c2743ee2`.

Boni solicitou revisão humana na mesa e escolheu salvar decisões no histórico do
caso. A mudança preserva a minuta, os limites financeiros e o grafo v8.

## Uso e implementação

A entrega de minuta concluída, vinculada a caso e versão válida, tem a ação
**Revisar proposta editorial**. O diálogo mantém o padrão visual da mesa, mostra
original/sugestão, justificativas, seção, fontes e ressalvas. Sugestões substantivas
aparecem separadas, sem texto de substituição. Nenhuma decisão vem selecionada.

Carregar JSON de proposta, ou envelope da geração simulada anterior, passa pelo
validador do servidor. O arquivo não autentica origem em IA. Abrir ou revisar
não chama gerador/modelo; a factory produtiva continua ausente.

Cada item permite **Concordar**, **Rejeitar** ou **Adiar**, com fundamento de 3 a
1.000 caracteres e clique explícito em **Salvar decisão**. O histórico conserva
proposta, identidade/hash do contexto, item, ação, fundamento, autor autenticado
e data do servidor. Uma nova decisão sobre o mesmo item acrescenta um evento;
não sobrescreve o anterior. Reabrir/atualizar recarrega o histórico autorizado.

Concordar não aplica patch, gera versão ou aprova juridicamente a minuta.
`humanReviewRequired` e `legalAssessment: NOT_EVALUATED` permanecem no contrato.

## Persistência e fronteiras

A migração aditiva `persistence-0038-editorial-human-review` acrescenta
`editorial_review_json` à entrega existente, separada do payload, hash da entrega
e revisão probatória. Isso acompanha a retenção/exclusão da própria entrega;
nenhuma infraestrutura ou tabela paralela foi adicionada. A migração foi
executada somente em bancos descartáveis dos testes, não em bancos operacionais.

O callback de revisão reutiliza o snapshot sob transação e locks de conversa,
caso, documentos e minuta. Contexto/fontes e versão são conferidos na transação
da decisão; revisão otimista evita sobrescrita entre abas e UUID de comando
permite repetição idempotente. Repetição com corpo diferente é recusada.

Rotas humanas `GET editorial-review`, `POST editorial-review/preview` e
`POST editorial-review/decisions` mantêm sessão, proprietário e fronteiras do
runtime. Salvar exige também `matter:write`. O servidor controla autor/data;
o cliente não envia comando de aplicação. Alterações do contexto/versão invalidam
decisões pendentes. A consulta histórica reautoriza o proprietário, caso e fontes
originais, preserva a leitura da versão registrada e não exige que ela seja a
versão editável atual. Entrega obsoleta retorna histórico com `stale: true`, sem
contexto editável; a mesa permite consultar os registros e bloqueia novas decisões.

Limites adicionais: 2.048 bytes UTF-8 por proposta, 10 propostas e 100 comandos
por entrega, uma decisão por comando. O diálogo limita arquivo a 8 KB para
acomodar envelope/formatação; o servidor impõe o limite canônico de 2.048 bytes.
Ao atingir teto, recusa nova gravação sem truncar nem apagar o histórico.

Resposta perdida bloqueia novos comandos e permite verificar o mesmo UUID/corpo.
Se o retry recebe conflito definitivo, a UI consulta o histórico por `commandId`:
informa o registro localizado ou sua ausência no momento da consulta, sem presumir
falha da primeira chamada nem criar outro comando automaticamente. Falha de acesso
mantém a incerteza e nunca é convertida em permissão para leitura histórica.
Fechar uma consulta cancela a espera local; resposta tardia é ignorada. Fechar
uma gravação pendente não declara cancelamento da decisão: mantém resultado
incerto para verificação. Nenhum texto é interpretado como HTML.

## Validação

Evidências: [recibo e hashes](evidence/2026-11-03-editorial-human-review/validation.json),
[mesa desktop](evidence/2026-11-03-editorial-human-review/desktop.png) e
[mesa móvel](evidence/2026-11-03-editorial-human-review/mobile.png).

- 117 testes focados aprovados, em sete arquivos, incluindo API, migração,
  geração simulada, contrato puro e regressões de contexto/fluxo.
- Sete testes Playwright com navegador/API reais locais, SQLite descartável
  e provedor simulado: gravação/recarga sem alteração de minuta, replay após
  resposta perdida, JSON inválido/conflito, fechamento de consulta pendente,
  IDs herdados de Object, reconciliação e consulta após edição humana da minuta.
- Três regressões Playwright da mesa passaram: opções no compositor, pedido livre
  e percurso de caso/pergunta/entrega/fontes/edição manual.
- Axe sem violações no diálogo e ausência de overflow horizontal a 320 px;
  capturas desktop/móvel inspecionadas. A verificação de rede cobre ausência de
  chamadas ao gerador, executor ou escrita de minuta durante a revisão.
- Migração preserva payload/revisão probatória e pode ser repetida. Concorrência
  local retorna uma decisão salva e um conflito; tetos 10/100 cobertos.
- A suíte geral detectou que o teste de reconciliação incluía a migração 0038
  no snapshot histórico de main antes da existência das tabelas agênticas.
  Corrigida a preparação, os quatro testes de migração/reconciliação passaram,
  incluindo presença única da nova coluna e do registro de migração.
- Lint e formatação dos arquivos pertinentes, builds de persistência/workflows/API
  e web, e verificação de tipos da API aprovados.

Revisão independente read-only por `gpt-6-astra`: três achados importantes,
reproduzidos e corrigidos com testes RED→GREEN, sem nova rodada de revisão:

1. IDs como `constructor`, `toString` e `__proto__` agora são lidos por propriedade
   própria no estado do formulário; selecionar ação antes do fundamento não quebra a mesa.
2. Leitura histórica separada da habilitação para decidir: nova versão/contexto
   não apaga nem esconde o registro, mantendo autorização e bloqueio de novas decisões.
3. Retry conflitante após resposta perdida consulta o comando no histórico,
   permitindo recuperação com ou sem registro, inclusive após fechar/reabrir.

Build completo aprovado. Após corrigir apenas a preparação do teste de
reconciliação, a repetição integral de `pnpm exec vitest run` passou com **1.711
testes aprovados, 17 ignorados e zero falhas**, em 235 arquivos aprovados e três
ignorados. O resultado anterior com uma falha e o ciclo isolado RED→GREEN foram
preservados no recibo. Os hashes das evidências anteriores e do contrato/gerador
foram conferidos; HEAD e índice permanecem inalterados.

## Decisões e limites da evidência

- Coluna própria na entrega reaproveita retenção e locks; exige migração aditiva
  em uma futura instalação, que não foi autorizada/executada nesta etapa.
- Importação JSON mantém geração desabilitada: o operador precisa ter a proposta,
  cuja origem não é autenticada pelo arquivo.
- Tetos explícitos limitam armazenamento: novas decisões podem ser recusadas ao
  atingir capacidade, sem perda das anteriores.
- Revisão contra baseline local preserva trabalho anterior sem commit; um diff
  apenas de HEAD não representa o conjunto local.

Esta evidência não mede qualidade de modelo ou equivalência jurídica, nem prova
concorrência PostgreSQL ou operação em produção. Boni continua único avaliador
e aprovador humano. Sem chamadas pagas, aplicação automática, commit, push,
migração remota, ampliação de cenários ou deploy.
