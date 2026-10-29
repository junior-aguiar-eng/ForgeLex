# Tarefa 4A — inventário de capabilities e recuperação normativa delimitada

Base: `f3ead80`, commit autorizado da Tarefa 3 em 26/10/2026. Implementação
na branch `codex/agent-contracts-a0`. Sem ativação, provider/modelo escolhido,
inferência paga, migração em banco existente ou deploy.

## Inventário confrontado com o V2

| Capability do V2 / necessidade                           | Implementação existente e limite observado                                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research.search_case_law`                               | `ResearchService` + `JurisprudenceSearchService` + repositório persistido; gateway comercial delimitado ao STJ. Índice indisponível é erro, não lista vazia.                                                      |
| `research.get_authority` / `verify_authority`            | Recuperação por processo e conferência de metadados/proveniência do índice. Não verifica, por si só, se o julgado sustenta uma afirmação nem tratamento posterior.                                                |
| `research.search_precedents`                             | Não há capability específica que classifique precedentes qualificados com esse contrato; encontrar um registro STJ não implementa essa classificação.                                                             |
| `research.search_legislation`                            | Não existia recuperação normativa persistida. Este incremento oferece apenas retrieval por norma/dispositivo/versão, via factory interna `research.get_legislation`, sem busca textual geral ou registro público. |
| `research.check_currentness` / `find_negative_treatment` | Não implementados como operações verificáveis. A conferência STJ de identidade/metadados não os substitui.                                                                                                        |
| `research.build_memo`                                    | Contratos/playbooks existem; orquestração jurídica e avaliação pertencem à 4B/6.                                                                                                                                  |
| Contexto do caso                                         | `case.list_shared`, `case.get_context`, `case.read_item` e serviços existentes; seleção/autorização do executor continuam na 4B.                                                                                  |
| Fatos/provas                                             | `facts.extract/list/find_support`, `evidence.map_support/get_coverage`: capacidades estruturais; não equivalem a adoção automática de fatos ou mérito probatório validado.                                        |
| Redação/revisão                                          | Serviços de draft, suporte factual e citações existentes; nome `review.adversarial_review` não prova revisão jurídica substantiva com modelo, reservada à 4B/6.                                                   |
| Tribunais do catálogo                                    | `CourtCatalog` descreve mais tribunais que o gateway habilita. Metadados não autorizam expor STF, TST ou demais tribunais como fonte operacional.                                                                 |
| Camada normativa de `analise-juridica`                   | `verificarDispositivos` registra declaração do cliente e URL; seus próprios testes deixam explícita a ausência de conferência normativa pelo servidor. Não foi reutilizada como prova de fonte recuperada.        |

O workflow técnico de referência continua sendo `research-authority-workflow`
da Tarefa 0: suas três tools são as operações STJ reais do gateway, sem duplicar
pesquisa, ledger, corpus ou idempotência. Isso não seleciona o primeiro piloto
jurídico a homologar. Workflows que exijam normas, atualidade ou tratamento
posterior não ficam homologados por este incremento.

## Fronteiras e contrato implementado

- `legal-data`: schemas, verificação de snapshot e serviço de ingestão/consulta.
- `source-catalog`: cobertura explícita por fonte, norma e dispositivos, com
  versão indicada como atual; catálogo vazio por padrão.
- `source-providers`: `IndexedLegislationProvider`, separado do router STJ.
- `persistence`: repositório append-only e migration aditiva
  `persistence-0033-legislation-versions`. Nenhum dado de caso é gravado ali.
- `legal-tools/legislation`: factory interna, sem singleton de fixture, registro
  no gateway, endpoint ou capability MCP nova.

A cobertura inicial técnica é limitada a snapshots de URLs HTTPS dos hosts
exatos `www.planalto.gov.br` e `planalto.gov.br`, sem credenciais ou porta
alternativa. Cada entrada aponta uma URL exata. Nenhuma entrada de corpus real
foi incluída e nenhuma página foi coletada automaticamente.

A ingestão interna recebe identidade, versão, texto, URL, captura, referência
de curadoria, período registrado e snapshot textual. Confere hashes e exige
que o texto seja exatamente o trecho indicado no snapshot por índices de
unidades UTF-16. Repetição idêntica é idempotente; mudança sob a mesma identidade
de versão é conflito, inclusive entre processos. Novas capturas distintas
precisam de uma identidade de versão distinta. A curadoria é entrada confiável
do servidor, nunca instrução ou declaração de um modelo/cliente público.

Seletores obrigatórios:

| Seletor   | Resposta e limite                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| `EXACT`   | A versão solicitada, sem fallback para outra.                                                                     |
| `CURRENT` | A versão indicada pelo catálogo; não é consulta online de vigência.                                               |
| `ON_DATE` | Um único período registrado que inclua a data, com fim exclusivo; sobreposição é ambiguidade e lacuna é ausência. |

Toda resposta informa `legalApplicability=NOT_EVALUATED` e
`freshness=SNAPSHOT_ONLY`. Período registrado não determina sozinho direito
intertemporal, retroatividade, regime de transição ou aplicabilidade ao caso.
Hash e trecho provam consistência do insumo, não fidelidade de uma extração
externa nem identificação jurídica correta. Boni deve avaliar a curadoria e
o corpus real antes da homologação de um workflow normativo.

Ausência de cobertura, versão ausente, indisponibilidade, fonte incorreta e
ambiguidade são estados `LIMITED` distintos. Não se usa conhecimento do modelo
para completar texto ou produzir resultado de pesquisa normativa fictício.

## Evidências

Os testes usam texto explicitamente sintético em URL fictícia de fixture,
sem reproduzir ou atestar regra jurídica brasileira. A consulta restitui só o
dispositivo selecionado e sua proveniência; o snapshot bruto permanece interno.

- RED inicial: módulo de recuperação inexistente.
- RED adicional: índice final além do snapshot era truncado por `slice` e aceito;
  validação explícita do limite corrigiu a falha.
- GREEN focado final: 48 testes em 6 arquivos, incluindo 19 casos normativos,
  gateway/pesquisa STJ, router de fontes e rotas REST/MCP da Tarefa 3.
- Revisão final: uma falha de identidade indexada/payload e sua classificação
  de integridade foram tratadas em uma única rodada. Quatro regressões com
  alteração real de linha persistida falharam antes e passaram depois:
  versão trocada no JSON, versão trocada na coluna, JSON inválido e data inválida.
  O repositório agora confronta identidade e ID derivado e sinaliza corrupção
  com erro interno tipado, sem expor detalhes de infraestrutura.
- `pnpm build` e `pnpm -r run typecheck` completos aprovados; após a correção de
  integridade, `legal-data` e `persistence` reconstruídos e tipos revalidados.
  ESLint e Prettier dos módulos alterados aprovados.
- `node scripts/smoke-legislation-postgres.mjs` final aprovado: migrations
  repetidas, ingestão concorrente por duas conexões, imutabilidade, adulteração
  real da identidade indexada e recuperação em outro processo. Somente banco
  temporário, com container removido.
- `pnpm exec vitest run --maxWorkers=1`: 184 arquivos aprovados, 3 ignorados;
  1070 testes aprovados, 18 ignorados e nenhuma falha, em 526,91 segundos.

Os cinco critérios do plano estão concluídos localmente (5/5), com marcação
nas duas cópias do plano. A Tarefa 4A permanece sem commit; a Tarefa 3 foi
commitada como `f3ead80`. Nenhum push, deploy, inferência paga ou migration em
banco existente foi executado. A cópia do plano original acompanha o estado
deste worktree; seu código foi preservado.

| Critério do plano                                                      | Evidência do incremento                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventário versus V2 e workflow                                        | Matriz acima e teste que confronta `RESEARCH_AUTHORITY_WORKFLOW.steps` com os contratos reais do gateway.                                                        |
| Dispositivo/versão/fonte e distinção temporal                          | `LegislationService`, catálogo explícito, repositório e provider; testes de `EXACT`, `CURRENT` e `ON_DATE`, incluindo fronteira de período.                      |
| Indisponibilidade, ausência, recuperação incorreta e fora da cobertura | `packages/legal-tools/src/legislation/legislation.test.ts`: negativos de fonte, hashes, trecho, identidade, corrupção persistida, versão, lacuna e sobreposição. |
| Reutilização STJ e limites de suporte/tratamento                       | `ResearchService` e gateway preservados; testes existentes de pesquisa/gateway/router executados junto ao incremento. Limites substantivos constam da matriz.    |
| REST/MCP e exposição                                                   | `execution-routes.test.ts`: flag desligada, rotas existentes e inventários MCP preservados; nenhuma montagem ou gateway recebe a factory normativa.              |

## Pré-condições que permanecem fora deste incremento

Corpus real curado e homologado por Boni; evidência de extração/identidade e
intervalos normativos; política de atualização; escolha explícita do workflow
de piloto; integrações da 4B e avaliação com provider/teto autorizados na 6.
Busca normativa geral e tratamento posterior exigem incrementos próprios;
não são anunciados como implementados por uma factory de retrieval.
O período de uma versão é imutável: adicionar versão que se sobreponha a um
período aberto retorna limitação. Uma política de encerramento/supersessão de
curadoria será necessária para atualizar esses períodos sem perder o histórico;
este incremento não escolhe silenciosamente qual registro prevalece.
