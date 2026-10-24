# A0 — início dos contratos de agentes jurídicos

Data: 24/10/2026. Autorização de Boni: “commit e inicie o A0”.
Base de implementação: main em `a02325b7afb653f80b587b6df21daf7b81cacebb`.
Branch: `codex/agent-contracts-a0`, worktree `analise-release/SDK`.

## Correção de estrutura na continuação

Por determinação de Boni, a decisão inicial de manter contratos em
legal-workflows foi substituída pela estrutura prevista no plano e na matriz:
packages/legal-agents. Este registro preserva o histórico do primeiro recorte;
o estado atual e os critérios da Tarefa 0 estão em
[2026-10-24-agent-contracts-task0.md](2026-10-24-agent-contracts-task0.md).

## Recorte e decisões

O plano, spec e duas referências de arquitetura de 10/10 foram preservados
no commit `41a1fd0`. São documentos históricos; seu retrato do checkout antigo
não deve ser apresentado como estado de main ou produção.

Este incremento inicia a Tarefa 0, sem declarar toda a tarefa concluída.
O primeiro contrato cobre pesquisa e verificação de autoridades STJ. Reutiliza
as três ferramentas e as instruções versionadas já existentes em legal-workflows.

Decisão: manter os contratos em `packages/legal-workflows`, evitando criar um
pacote legal-agents antes de existir uma fronteira que justifique essa separação.
Custo de revisão dessa decisão: mover contratos/exports se o catálogo crescer.

## Entrega implementada

- Catálogo interno com um papel de pesquisa, objetivo, escopo, allowlist de
  ferramentas, versões de workflow/instrução, schemas e regras de escalonamento.
- Quatro ações identificadas; somente pesquisa tem contrato neste recorte.
  Todas continuam com execução desabilitada. Não existe catálogo público novo.
- Contexto limitado em tamanho e quantidade; entrega vinculada ao contexto.
- Handoff estrutural com revisão humana obrigatória, proveniência e status
  preservados. Fonte indisponível e resultado limitado exigem motivo explícito.
- Validação das ferramentas requeridas contra o registro existente.

O catálogo e o validador não concedem acesso, verificam autoria de respostas,
provam adequação jurídica ou ativam agentes. A futura execução deve impor
permissões, contexto por tenant/caso, versões consumidas e origem dos resultados
no servidor. A identidade contextId não substitui autorização.

## Mapa atualizado e sequência

AgentRuntime, ToolRegistry, adapters, runner versionado e armazenamento de
checkpoints já existem. Os workflows atuais não equivalem a um orquestrador
jurídico conectado às aplicações. Os contratos MCP mantêm o modelo no host.

Permanecem na Tarefa 0: contratos de análise/redação/revisão, handoffs entre
especialistas, separação completa entre política/playbook/template e avaliações
jurídicas positivas, negativas e ambíguas. Os testes deste recorte validam
contratos e fixtures; não medem competência jurídica de um modelo.

Depois dos contratos: execução persistente por tenant, autorização e retomada;
controle de consumo e eventos; orquestração; interface; piloto real autorizado.
Sem migrations, chamadas de IA, push, integração ou deploy nesta atividade.

## Evidências locais

- RED inicial: suíte falhou pela ausência do módulo de contratos.
- RED adicional: teste reproduziu aceitação de status verificado com
  provenance.verified=false; validação foi corrigida e teste passou.
- `pnpm exec vitest run packages/legal-workflows/src`: 4 arquivos, 18 testes aprovados.
- Build e typecheck de legal-workflows: aprovados. ESLint dos três arquivos TS: aprovado.
- Revisão final por agente: uma inconsistência entre status oficial e método da fonte,
  reproduzida em RED e corrigida; suíte final 18/18. Sem outros achados materiais.

As alterações preexistentes em `codex/case-flow-simplification` continuam no
checkout original, sem staging, commit ou edição por este incremento.
