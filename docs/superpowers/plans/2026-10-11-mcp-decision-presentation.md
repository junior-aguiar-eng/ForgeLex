# ForgeLex — plano da camada visual de decisões no MCP

> Adendo autorizado em 11/10/2026: o plano
> [apresentação e pesquisas salvas](2026-10-11-saved-research-mcp-reader.md)
> substitui, neste incremento, a restrição de nenhuma nova escrita MCP.
> A única escrita nova é a coleção manual de até seis pesquisas completas,
> mediante a permissão revogável “Gerenciar pesquisas salvas”. Nenhum fluxo de
> casos é reativado. Abrir uma pesquisa salva também apresenta o leitor comum.
> A análise permanece atribuída ao ChatGPT ou Claude. A execução local foi
> autorizada; integração, migração de produção e publicação dependem da
> autorização específica desta entrega.

> **For agentic workers:** após autorização de Boni para implementar, usar
> `superpowers:executing-plans`, tarefa por tarefa. Este documento planeja a
> entrega; não autoriza implementação, instalação, commit, push ou publicação.

**Goal:** apresentar o texto disponível da decisão em leitor próprio, preservando
o modelo do host, os serviços e o MCP existentes.

**Architecture:** lookup exato no corpus → projeção mínima → leitor React comum
→ adapters site/MCP Apps. Pesquisa e apresentação são ferramentas distintas;
apenas apresentação associa recurso visual. Sem novo backend jurídico ou LLM.

**Tech Stack:** TypeScript, React/Vite, Fastify, Zod, Vitest, Playwright e Drizzle
existentes. Bridge MCP Apps oficial com versão conferida no início da execução;
dependência/bundle somente no módulo UI necessário, sem trocar o transporte.

**Spec:** [Desenho](../specs/2026-10-11-mcp-decision-presentation-design.md).
Integra o incremento M do plano V2 histórico
(`2026-10-10-agentic-workspace-transition.md`, conservado no checkout de origem).
O restante da orquestração V2 continua suspenso.

## Restrições globais

- Flag `FORGELEX_MCP_DECISION_UI_ENABLED` desligada por padrão; evolução aditiva.
- Boni é o único avaliador/aprovador humano. Preservar trabalho local anterior.
- Análise externa pertence ao modelo host. UI não implementa agentes jurídicos.
- Primeiro incremento de leitura, sem nova escrita MCP, LLM, migração destrutiva,
  ingestão, pesquisa externa automática ou cobrança pela apresentação.
- Ementa como retornada, estado de completude explícito; inteiro teor só como
  link existente. Não completar relatório/votos/dispositivo por inferência.
- Identificar decisão e versão; não usar processo isolado como chave de display.
- Reaproveitar domínio, corpus, autenticação, fontes e ações; não importar AuthContext
  ou rotas privadas no bundle MCP. Modelo não fornece o texto apresentado.
- Um componente por seleção, leitura de uma decisão por vez, detalhes sob demanda.
- Host decide posicionamento; fallback textual útil em cliente sem UI.

## Foco de verificação

1. Duas decisões do mesmo processo: mostrar exatamente a selecionada (tarefa M1).
2. Registro/versão excluído ou indisponível: sem substituição silenciosa (M1/M3).
3. Texto longo, parcial ou com markup malicioso: completo no limite e escapado (M2).
4. Host sem UI, bridge ausente ou payload vazio na reabertura: texto/erro útil (M3/M4).
5. Troca rápida/teclado/mobile: nenhuma mistura de metadados, texto e citação (M2/M4).

## M1 — identidade precisa e projeção da decisão

**Modificar:** `packages/legal-data/src/services/jurisprudence-search-service.ts`,
`packages/persistence/src/repositories/jurisprudence-repository.ts`,
`packages/legal-tools/src/research/research-service.ts`,
`packages/domain/src/contracts/legal-objects.ts` e exports afetados.
**Criar:** `packages/domain/src/contracts/decision-presentation.ts`,
`packages/legal-tools/src/research/decision-presentation-service.ts` e testes.
**Testar:** `packages/persistence/src/repositories/jurisprudence-repository.test.ts`,
`packages/legal-tools/src/research/decision-presentation-service.test.ts`.

**Interfaces propostas:** `DecisionRef = {recordId: string; versionId: string}`;
`getPublishedDecision(ref: DecisionRef): Promise<JurisprudenceDocument | undefined>`
com projeção da identidade da versão; `presentDecisions(refs: DecisionRef[],
context: ToolExecutionContext): Promise<DecisionPresentation>`. Schema v1:
`items`, `unavailable`, `limitations`; itens derivam de `CaseLaw` com identidade,
completude e origem explícitas. Campo versionId é aditivo na pesquisa atual.

- [ ] Escrever testes com mesmo processo, datas e textos diferentes: refs A/B
  retornam os respectivos textos; versão errada e registro não publicado não
  fazem fallback. Item não acessível não vaza texto/metadados privados.
- [ ] Executar `pnpm exec vitest run packages/legal-tools/src/research/decision-presentation-service.test.ts`
  e confirmar falha pelos métodos ainda ausentes.
- [ ] Implementar lookup por registro/versão com condições de publicação atuais;
  adicionar identidade à projeção, sem modificar a semântica de tools antigas.
- [ ] Validar 1–20 refs distintas, rejeitar texto/URL/metadados enviados pelo modelo,
  preservar ordem; retornar indisponíveis identificados sem substituir a seleção.
- [ ] Executar testes M1 e testes de repositório SQLite/PostgreSQL pertinentes.
  Verificar mesma saída de busca existente exceto campos aditivos documentados.

**Aceitação:** o viewer pode usar a identidade selecionada, sem depender de uma
nova busca textual ou da tool legada por número de processo.

## M2 — núcleo visual reutilizado no site

**Criar:** `apps/web/src/research/DecisionReader.tsx`, `decision-reader-model.ts`,
`decision-citation.ts` e testes correspondentes.
**Modificar:** `apps/web/src/screens/ResearchDeskScreen.tsx` e
`apps/web/src/components/CopyCitationButton.tsx` para consumir o núcleo comum.
**Reaproveitar:** foco/erro/seleção do `DocumentReaderDialog`, estilo existente e
`SaveAuthorityToCase` como ação do site; não mover chamadas do caso para o viewer.

**Interfaces:** `DecisionReader({presentation, selectedRef, onSelect, onCopy,
onOpenSource})`; callbacks de ações separados do DTO de apresentação.
`formatDecisionCitation(item): string` contém julgamento e publicação distintos.
`selectDecision(presentation, ref)` retorna somente item identificado, nunca o primeiro.

- [ ] Testes de seleção A/B, trechos/ausência, datas rotuladas, links ausentes e
  payload com HTML/script; texto permanece escapado e a fonte não ganha selo falso.
- [ ] Executar testes antes da implementação e confirmar falhas esperadas.
- [ ] Implementar uma decisão por vez, navegação limitada à seleção, parágrafos
  preservados, texto selecionável, fonte/proveniência em disclosure e cópia com erro.
- [ ] Integrar ao site sem duplicar consulta, billing, citação ou salvamento no caso;
  nenhuma tela exige o reader para continuar seu fluxo existente.
- [ ] Testar teclado, foco, mobile 320px, claro/escuro e texto extenso. Copiar após
  navegação usa item selecionado, sem estado antigo. Nenhum botão faz busca nova.

**Aceitação:** o mesmo reader passivo recebe dados do site ou do adapter externo.

## M3 — recurso e ferramenta aditivos no MCP

**Criar:** `packages/legal-tools/src/research/present-decisions.ts`,
`packages/mcp-server/src/decision-ui-resource.ts`,
`packages/mcp-server/src/decision-presentation-handler.ts` e testes;
`apps/web/src/mcp-ui/{DecisionApp.tsx,host-bridge.ts}` e entrada de bundle.
**Modificar:** `packages/mcp-server/src/{mcp-handler,external-tool-pack}.ts`,
montagem/configuração em `apps/api/src/app.ts`, contratos/políticas no registry e
ledger existentes, `apps/web/vite.config.ts`, manifests somente onde necessário.

**Interfaces:** `research.present_decisions({items: DecisionRef[], idempotencyKey?: string})` retorna
`DecisionPresentation`; política `FREE`, annotations de leitura e idempotência.
Seguir o contrato de idempotência do handler atual para apresentação/retries;
não executar busca ou cobrar ao renovar uma apresentação.
`readDecisionUiResource(uri)` aceita apenas URI versionada registrada; template
estático, sem credenciais/conteúdo de caso. Bridge entrega DTO validado ao reader.

- [ ] Testar flag desligada: mesmas nove tools locais e comportamento de inicialização.
  Flag ligada: nova tool + resource descobríveis; URI desconhecida rejeitada.
- [ ] Testar política gratuita: apresentar/navegar não chama search nem debita;
  busca antiga mantém preço/idempotência. Autenticação inválida não fornece decisões.
- [ ] Registrar tool/recursos no handler existente e servir bundle mínimo com
  `_meta.ui.resourceUri`, MIME MCP Apps e capabilities de recursos necessárias.
  Preservar conteúdo textual das tools antigas; retorno visual inclui fallback útil.
- [ ] Implementar adapter de bridge oficial e validação de payload; CSP restrita,
  sem fetch autenticado do iframe ao site, tokens em HTML ou HTML de fonte executável.
- [ ] Reabertura com payload vazio mostra indisponibilidade, sem fonte inventada.
  Não implementar persistência de histórico privado por conveniência do widget.
- [ ] Executar testes de handler/recursos, tools, ledger e OAuth; build/types/lint.

**Aceitação:** host textual funciona; host UI recebe mesma seleção e fonte.

## M4 — homologação e entrega controlada

**Criar:** `tests/e2e/mcp-decision-reader.spec.ts` e
`docs/product/mcp-decision-presentation.md`; atualizar continuidade/status somente
com evidência efetiva da implementação futura, não com resultado da simulação.

- [ ] E2E com fixtures: leitura → próxima/anterior → origem → citação; texto longo,
  parcial, ausente, falha do clipboard e indisponibilidade; sem overflow/erros JS.
- [ ] Regressão de pesquisa/documentos/casos: ações preservadas e sem consulta paga
  nova durante navegação. Flags desligadas mantêm fluxo antigo.
- [ ] Registrar evidência local com commit/ambiente. Homologar em host real com
  conexão autorizada: render, reabertura, tamanho/modo, temas e fallback. Prévia HTML
  não substitui esta etapa; não prometer painel lateral se o host não permitir.
- [ ] Boni aprova apresentação e evidências; commit/push/integração/deploy dependem
  do escopo que autorizar. Publicação não é consequência automática da aprovação visual.

**Aceitação:** decisão e versão corretas são conferíveis, fontes distinguíveis de
análise e MCP preservado. Execução agêntica do V2 segue sua frente independente.

## Prévia desta atividade

`forgelex-mcp-decisions-preview.html`: dois arranjos visuais, com navegação local,
ementa, trecho identificado, origem e citação. Sem API real, cobrança, salvamento,
instalação ou alteração de código do produto. A avaliação visual é de Boni.

Referência de aparência para a implementação:
[cópia integral da prévia aprovada](../references/2026-10-11-mcp-decisions-approved-preview.html).
O leitor real deve conservar cabeçalho, hierarquia dos dados, área delimitada
de leitura, apresentação por abas e ações compactas dessa referência.
Os controles das pesquisas salvas são acréscimos funcionais; não autorizam
substituir o desenho aprovado. O arranjo da conversa pertence ao aplicativo.

Validação da prévia em 11/10/2026: Chromium local, duas alternativas, navegação
entre dois registros, seção de resultado disponível apenas na referência com esse
texto, disclosure de origem e fallback selecionável da citação. Tema escuro e
viewport 320px conferidos, sem overflow horizontal no conteúdo; zero erros de
console observados. Não foram executados testes ou chamadas MCP do produto.
