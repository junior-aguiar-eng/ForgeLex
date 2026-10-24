# Tarefa 0 — contratos jurídicos e catálogo V2

Execução local de 24/10/2026, branch codex/agent-contracts-a0.
Fontes obrigatórias: plano de transição e matriz V2 de 10/10/2026.
Base: main a02325b7afb653f80b587b6df21daf7b81cacebb.
Autorização: iniciar A0 e seguir para seu próximo recorte; Boni exigiu aderência
rigorosa à estrutura e aos critérios dos dois documentos.

## Reconciliação do desvio anterior

O commit ce8f60c colocou os contratos em legal-workflows. Essa decisão foi
corrigida por determinação de Boni: o catálogo, definições, contexto e
instruções agora pertencem a packages/legal-agents. Os exports anteriores
reexportam a implementação canônica para preservar consumidores existentes.
Não foi criado outro runtime.

## Arquivos e responsabilidades

- packages/legal-agents/src/agent-definition.ts: contrato dos especialistas.
- packages/legal-agents/src/agent-catalog.ts: especialistas e quatro ações.
- packages/legal-agents/src/context-packet.ts: contexto mínimo e referências
  de texto, documentos, fatos, questões, seções, provas, teses e autoridades; limites e versões.
- packages/legal-agents/src/instructions/: instruções versionadas de pesquisa,
  verificação de autoridade, análise do caso, redação e revisão adversarial.
- packages/legal-agents/src/system-policy.ts: política comum.
- packages/legal-agents/src/playbooks.ts: objetivos, perguntas orientadoras,
  etapas e critérios das quatro ações. Não implementa a interface da Tarefa 5.
- packages/legal-agents/src/workflow-definition.ts e legal-work-contracts.ts:
  entradas, saídas, dependências, papéis e condições de passagem.
- packages/legal-agents/src/legal-evaluations.ts: 15 cenários sintéticos
  positivos/negativos/ambíguos de questões, suporte, requisitos processuais,
  argumentos contrários e pedidos. Define a avaliação; não homologa modelo.
- packages/legal-workflows/src/contracts/legal-workflow.ts: export dos contratos.
- packages/legal-workflows/src/runtime/legal-contract-workflow.ts: coordenação
  dos contratos pelo VersionedWorkflowRunner existente, com handler explícito,
  validação e versões gravadas no estado/checkpoint e no resultado.

Política, instruções e playbook correspondentes às versões registradas são
fornecidos ao handler. O registro demonstra o material fornecido à execução;
não prova obediência semântica de um modelo. Nenhum modelo foi chamado.
Templates de documento não são selecionados automaticamente; o contrato
registra documentTemplate=null. Validações determinísticas têm versão própria.

## Matriz de rastreabilidade da Tarefa 0

| Critério do plano                                                          | Evidência implementada                                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Mapear papéis e serviços                                                   | Matriz V2 original e estado dos papéis abaixo                                                                   |
| Contratos dos quatro workflows e primeiro recorte                          | workflow-definition.ts, legal-work-contracts.ts; pesquisa/verificação STJ é o primeiro recorte do A0 autorizado |
| Separar política, instruções, playbook, template e scripts; versões no run | Arquivos separados; LegalContractWorkflow registra versões e fornece materiais correspondentes ao handler       |
| Relacionar quatro ações a diálogos, playbooks e competências               | LEGAL_ACTION_CATALOG e LEGAL_ACTION_REQUIREMENTS                                                                |
| Handoff inválido: fonte ausente, contexto excessivo, output incompatível   | Testes de schema e execução; ação/contexto/revisão/referências/usuário/caso vinculados                          |
| Definir avaliações jurídicas                                               | 15 cenários de legal-evaluations.ts; avaliação real posterior                                                   |

O primeiro recorte é pesquisa/verificação STJ, conforme o A0 autorizado.
Provider/modelo e piloto real continuam sujeitos à fase E prevista no plano.

## Estado dos papéis do V2

| Papel                | Base existente                                       | Estado neste incremento                                               |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| legal-orchestrator   | AgentRuntime, runner, eventos e checkpoints          | Orquestração jurídica da Tarefa 4B, pendente                          |
| matter-analyst       | Contexto de caso, documentos e âncoras               | Contrato e instruções definidos; inferência pendente                  |
| evidence-analyst     | FactsEvidenceService e coverage                      | Especialista da Tarefa 4B, pendente                                   |
| legal-researcher     | ResearchService e workflow STJ                       | Contrato delimitado ao STJ; investigação/síntese nativa pendente      |
| authority-verifier   | get/verify authority e proveniência                  | Contrato restrito de verificação definido                             |
| procedure-specialist | Domínio/contexto                                     | Fontes normativas da Tarefa 4A e especialista da Tarefa 4B, pendentes |
| legal-drafter        | DraftService, seções/versões e PleadingDraftWorkflow | Contrato candidato definido; redação nativa pendente                  |
| adversarial-reviewer | DraftReviewService                                   | Contrato definido; análise substantiva pendente                       |
| citation-reviewer    | Citações e referências                               | Especialista substantivo da Tarefa 4B, pendente                       |
| final-editor         | Editor, versões e DOCX                               | Especialista da Tarefa 4B, pendente                                   |

Os contratos não anunciam capabilities públicas nem habilitam execução.
Fontes e serviços existentes são reutilizados. Autorizações, dados por tenant,
controle de consumo, retomada de modelos e persistência de conversas continuam
nas tarefas seguintes. Os testes do runner usam handlers determinísticos.

## Validação

Gates locais finais aprovados:
- pnpm build: monorepo completo aprovado.
- Typecheck de legal-agents e legal-workflows: aprovado.
- ESLint dos arquivos TypeScript alterados: aprovado.
- Vitest de legal-agents/legal-workflows: 8 arquivos e 47 testes aprovados.
- pnpm exec vitest run: 177 arquivos aprovados, 3 ignorados; 986 testes
  aprovados, 18 ignorados, nenhuma falha (262,29 segundos).
- git diff --cached --check: aprovado.

A primeira tentativa de suíte integral ocorreu durante a criação do módulo
de coordenação e falhou por módulo ainda ausente. A rodada final acima foi
executada com a implementação concluída e substitui aquele resultado provisório.

Ciclos RED→GREEN confirmados neste recorte:

- ausência inicial do módulo e contratos;
- ação de saída incompatível com o workflow;
- minuta sem referência ou limitação;
- retomada sem checkpoint;
- tentativa de retomar em outro caso;
- referências explícitas de questões/seções: RED observado; GREEN confirmado no gate final.

As revisões encontraram e motivaram a correção do papel de verificação ausente,
da seção sem origem e do vínculo de caso na retomada. A precisão do registro de
versões foi corrigida: o handler recebe os materiais versionados registrados.

## Sequência

Após os gates locais da Tarefa 0, seguir para Tarefa 1: contrato e persistência
da execução. Tarefas 1–7 ainda não estão concluídas por este registro.
Sem push, integração, migrations remotas, inferência paga ou deploy.
As alterações locais de código do checkout original foram preservadas.
