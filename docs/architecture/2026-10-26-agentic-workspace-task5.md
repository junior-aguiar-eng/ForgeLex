# Tarefa 5 — Trabalho, diálogo e editor

Implementação local na branch `codex/agent-contracts-a0`, sobre a Tarefa 4B
commitada como `a31ce6a`. A Tarefa 5 permanece sem commit. O checkout original
recebe somente as marcações do plano; sua implementação anterior foi preservada.

## Percurso implementado

`/app/trabalho` acrescenta uma superfície à aplicação React/Vite existente,
mantendo suas rotas, identidade visual e serviços. As quatro ações vêm de uma
projeção pública do catálogo; escolher uma ação abre a finalidade, sem executar.
Texto livre converge para o mesmo escopo, com contexto escrito, caso opcional,
documentos selecionados e referência explícita de minuta/versão quando pertinente.
Nenhuma resposta jurídica é pré-selecionada.

O envio explícito inicia a execução existente. O acompanhamento usa sessão no
cabeçalho, SSE com cursor, deduplicação e reconexão limitada; recarregar recupera
pedido, contexto, perguntas/respostas e entrega. Não há tokens na URL, nem cópia
de prompts, papéis, argumentos de tools ou checkpoints para o frontend.

Perguntas usam radio, checkbox ou texto livre conforme o contrato. Complemento
livre e **Ainda não sei** permanecem decisões explícitas. Corrigir uma resposta
mantém o histórico e cria sucessora com revisão de contexto atualizada, sem
herdar autorização financeira. Pedidos contextuais de pesquisa, redação e revisão
reutilizam a conversa e suas referências, sem copiar resultados entre módulos.
Entregas anteriores permanecem acessíveis, com autorização novamente verificada
na leitura de cada artefato.

A entrega principal é o documento efetivamente produzido quando houver redação.
Na ausência de suporte, a tela apresenta análise de lacunas/limites; outline não
é apresentado como peça. Alegações, inferências, requisitos e observações continuam
identificados e sujeitos à revisão. Fontes e contexto abrem sob demanda, com
leitor documental e links seguros; uma minuta selecionada mantém caso e versão.

O editor existente recebe a minuta, sem criar um serviço de edição ou salvamento
paralelo. Seu estado permanece montado durante o retorno ao trabalho, preservando
edição não salva. Mudança de versão e conflito ficam visíveis. Uma entrega iniciada
sem caso é lida pela API autorizada no editor; o usuário escolhe ou cria um caso
antes de salvar. O salvamento humano cria rascunho/versão, sem aprovar juridicamente
a minuta ou adotar fatos. O artefato preliminar original permanece imutável.

## Decisões e correções demonstradas

- A recuperação e a correção exigiram extensões autenticadas da API: contexto,
  mensagens e referências históricas públicas; catálogo sem metadados internos;
  correção por sucessora. Reutilizam repositórios e controle durável das tarefas
  anteriores. O campo opcional `gap.selection` permite perguntas de seleção
  múltipla, preservando a seleção única existente.
- O navegador revelou perda de CORS ao abrir SSE com `reply.hijack()`. A regressão
  reproduziu o cabeçalho ausente; a resposta agora preserva os cabeçalhos já
  preparados. A codificação de quebras de linha foi testada e já era válida.
- Falta de orçamento não elimina `RECONCILIATION_REQUIRED` de dispatch incerto.
  O evento conserva esse estado e acrescenta somente o motivo permitido
  `BUDGET_EXHAUSTED`; a tela informa o limite e impede continuação automática.
- O salvamento anterior aceitava uma versão concorrente: E2E retornou `200` e
  o teste SQLite confirmou sobrescrita do ponteiro atual. Acrescentou-se
  `expectedCurrentVersionId` somente ao endpoint REST de nova versão, ao serviço
  e ao repositório existente. A comparação ocorre sob os locks de caso/minuta;
  conflito retorna `409`, preservando texto local e versão concorrente.
  `baseVersionId` continua significando ancestralidade. Schemas MCP não mudaram.
- Não foi introduzido armazenamento persistente de conteúdo jurídico no navegador.
  A preservação durante navegação usa memória da aplicação; a troca de identidade
  recria o contexto da aplicação. Recuperação após recarga usa a API autorizada.

Consequências: revisões incompatíveis ou antigas exigem conferência explícita;
consumidores REST podem usar o novo campo opcional para evitar perda de edição.
Clientes legados sem esse campo mantêm seu comportamento. A autorização nativa,
consentimento, provider/modelo, orçamento real, retenção/purge e avaliação jurídica
permanecem condições posteriores de ativação.

## Comparação executada

O E2E comparou **conferir a mesma fonte e salvar a mesma revisão** em duas minutas
com texto inicial idêntico. Os dois percursos abriram o documento da fixture e
salvaram pelo serviço existente; não foi usada contagem de elementos HTML como
substituto para o percurso.

| Percurso                              | Intervenções automatizadas | Mudanças de tela | Tempo observado | Fonte lida e versão salva |
| ------------------------------------- | -------------------------: | ---------------: | --------------: | ------------------------- |
| Anterior: Casos → leitor → Rascunhos  |                          9 |                2 |        4.286 ms | Sim                       |
| Trabalho → leitor → editor contextual |                          6 |                1 |        2.090 ms | Sim                       |

A mesma origem/versionamento foi identificada pelo documento
`e9f6a5f3-c2d9-4739-a3de-91f01fd62889`, versão
`1426867d-548e-4fea-a3da-88acd68b3f09`, em banco temporário. Os tempos variam
com máquina e carga; a medição abrange apenas esse subpercurso documental com
fixtures, não o trabalho jurídico integral, tempo humano ou qualidade de IA real.

## Evidência por critério do plano

| Critério                                                       | Evidência                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Objetivo → escopo → pergunta → entrega → fonte → editar/salvar | E2E integrado com API local real, banco temporário, provider fake e editor existente.                                   |
| Quatro ações e entrada livre                                   | E2E confirma zero POSTs de execução ao escolher ação e finalidade; envio só após escopo.                                |
| Finalidade, texto sem anexo e desconhecimento                  | E2E de entrada, texto livre e **Ainda não sei**.                                                                        |
| Radio/checkbox, acessibilidade e envio explícito               | E2E de teclado e seleção múltipla; testes de construção de resposta; Axe.                                               |
| Reuso de informação, resposta livre e correção                 | E2E de resposta fora das opções, recarga, histórico e nova execução após correção.                                      |
| Continuação contextual                                         | E2E análise → redação; revisão seleciona minuta/versão sem cópia de texto.                                              |
| Recarga e eventos sem duplicação                               | E2E recarrega durante execução e após entrega; modelo testa cursor e execução diferente.                                |
| Revogação/orçamento e texto preservado                         | E2E arquiva documento durante pergunta e observa bloqueio; pesquisa sem reserva mantém saldo e informa motivo.          |
| Ação principal e detalhes                                      | Entrada/escopo/pergunta/entrega usam ação principal; operações secundárias sob **Mais opções**.                         |
| Status sem mecanismos internos                                 | Projeção pública e testes de eventos; status de processamento sem inventar pesquisa.                                    |
| Minuta redigida e alternativa limitada                         | E2E confere endereçamento, fatos, fundamentos e pedidos com lacunas; ausência de texto entrega limites.                 |
| Sem espécie de peça predefinida                                | Entrada por necessidade e contexto; escolha de modelo não é pré-condição.                                               |
| Descoberta e retorno contextual                                | Quatro capacidades no mesmo fluxo, fontes sob demanda e links com caso/execução/versão.                                 |
| Editor, edição não salva e conflito                            | E2E retorno ao trabalho e ao editor, salvamento real e conflito `409`; SQLite preserva versão concorrente.              |
| Teclado, 320px e desktop                                       | E2E usa teclado, verifica largura, executa Axe e captura tela móvel; percurso completo em desktop.                      |
| Comparação com percurso anterior                               | Benchmark documental acima, com interação, mudança de tela, tempo e fonte aberta.                                       |
| Regressão MCP externo                                          | Regressão integral aprovada: 1.126 testes; protocolos, OAuth/seleção, erros, idempotência e billing locais preservados. |

## Verificações

A única revisão final identificou sete problemas importantes, reproduzidos antes
da correção e tratados na mesma rodada:

1. **Rever pedido:** texto e finalidade retornam ao formulário; não se reconstrói
   um formulário vazio. A conferência usa o nome acessível do campo restaurado.
2. **Histórico e contexto antigo:** entrega corrigida permanece consultável pelo
   seu ID, com aviso de revisão anterior, ações dependentes suspensas e link para
   o trabalho atual. Só predecessora sem entrega pode seguir sucessora na recuperação.
3. **Retorno pela navegação:** ID da execução é lembrado na instância autenticada
   da aplicação e restaurado pela navegação, inclusive durante carregamento lazy.
4. **Comando tardio:** resposta de componente desmontado/sessão substituída é
   descartada; trabalho aceito da mesma sessão pode continuar sendo acompanhado
   oculto, sem reescrever a URL do editor. Epoch de navegação evita resposta obsoleta.
5. **EOF durante pergunta:** `WAITING_USER` não é terminal; a reconexão usa o cursor
   e observa perda de acesso. O transporte não redispara a tarefa.
6. **Permissão:** ação de editar deriva de `draft:write`, exigida pelo salvamento,
   e não de `matter:write`. A API de destino continua impondo sua autorização.
7. **Fontes por item:** seções, questões, afirmações, observações e requisitos
   preservam `sourceIds`. Referências abrem sob demanda, com versão/hash/extensão
   e identidade disponível. Referência ausente não toma fonte de outro item;
   identificação de fonte não é apresentada como suporte jurídico ou aplicabilidade.

Não foram adiados achados menores nem solicitada nova revisão. As exclusões
consideradas foram decididas assim: competência jurídica e integração real ficam
para as etapas de ativação; benchmark é somente documental automatizado; resultados
finais de testes exigem execução independente pelo implementador; o editor sem caso
só libera campos após vinculação; divergência da versão original é explicitamente
informada; `reviseContext` preserva respostas já fornecidas; Boni continua como único
aprovador humano. Não se criou gate de avaliação por outra pessoa.

O custo desses limites é explícito: uso real depende de avaliação/consentimento e
orçamento posteriores; revisões antigas exigem abrir/conferir a versão vigente;
respostas ignoradas após encerrar a sessão exigem recuperação pela API; mudanças
futuras de campos, snapshots ou respostas devem preservar essas garantias.

Na mesma rodada, o navegador reproduziu duas condições adicionais: a lista de
casos carregada apenas na montagem não incluía um caso criado em seguida, e uma
falha lazy em outra área desmontava o editor/Trabalho sob a boundary compartilhada.
A lista agora é consultada ao abrir o escopo, com descarte de resposta obsoleta.
Trabalho/editor possuem boundaries próprias e permanecem montados; as páginas
anteriores conservam a recuperação por troca de rota. O teste força falha de
carregamento de Pesquisa e confirma o retorno à entrega e à edição não salva.

Verificações concluídas:

- `pnpm exec vitest run --maxWorkers=1`: 190 arquivos aprovados e 3 ignorados;
  1.126 testes aprovados, 18 ignorados e nenhuma falha (626,59 segundos).
- `pnpm exec playwright test --config playwright.agentic-workspace.config.ts
--project=chromium`: 17 E2E aprovados com o código final; inclui os sete achados
  da revisão, isolamento de falha de página, benchmark, Axe, 320px e desktop.
- `pnpm exec playwright test --config playwright.draft-review.config.ts
--project=chromium`: 9 E2E do editor anterior aprovados novamente após as correções.
- `pnpm build`: monorepo aprovado antes da rodada final de UI. Após a rodada,
  API reconstruída e `pnpm --filter @forgelex/web build` aprovado, incluindo
  bundle documental do MCP.
- `pnpm -r run typecheck`: pacotes do monorepo aprovados antes da rodada final;
  tipos web e API revalidados depois das correções.
- ESLint dos módulos alterados de `apps`/`packages` aprovado; Prettier dos módulos novos/registro
  e `git diff --check` aprovados.
- `node scripts/smoke-agentic-case-task-postgres.mjs`: aprovado novamente após
  a rodada final. Migrations repetidas em banco temporário, recuperação entre
  processos sem replay do planejador, entrega idempotente concorrente, isolamento
  de proprietário e edição humana preservada sem deadlock; publicação conflitante
  recusada por `SOURCE_VERSION_CONFLICT`. Container temporário removido.

Os 17 critérios técnicos do plano foram marcados nas duas cópias canônicas.
O estado é **concluído localmente; commit autorizado por Boni em 27/10/2026**.
Antes do commit, a revalidação dos módulos afetados aprovou 73 testes em oito arquivos.

As flags web e API permanecem desligadas por padrão. O fixture de execução só é
importado pelo servidor E2E local mediante flag de teste. Não houve provider real,
inferência paga, migration em banco existente, push ou deploy. Fixtures e análise
técnica não substituem avaliação jurídica ou aprovação de Boni.
