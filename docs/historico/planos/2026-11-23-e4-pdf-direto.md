# E4 — PDF direto: dissecação, soma das análises e divisão em trechos: plano de implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa a tarefa. Os passos usam caixas de seleção (`- [ ]`).

**Meta:** o anexo de PDF dispara sozinho a análise de fatos e provas, que também identifica o tipo da peça e as partes; PDF longo é dividido em trechos; todas as análises do caso somam numa estrutura só, que a aba, o ajuste pela conversa (E2) e a redação (E3) usam.

**Arquitetura:** o navegador divide o texto do anexo nos limites "Página N" e envia um início por trecho, com um cabeçalho que o servidor reconhece. O servidor roteia o início com anexo para `analyze_evidence` e recusa o duplicado já analisado. O contrato v15 acrescenta `documentProfile` à análise. Um buscador novo (`findCaseStructure`) lista as análises vivas do caso; a aba, o E2 e o E3 passam a trabalhar com a lista unida, com itens numerados em sequência. Sem tabela nova.

**Stack:** TypeScript, zod, vitest, drizzle, React. Pacotes: `packages/domain`, `packages/legal-agents`, `packages/legal-workflows`, `packages/persistence`, `apps/api`, `apps/web`.

**Spec:** `docs/architecture/2026-11-19-estrutura-do-caso.md`, seção "Desenho do E4".

## Restrições globais

- TRAVA DE PRODUTO (`AGENTS.md`): nenhuma tela, aba, rota "de dados" ou botão novo. A divisão em trechos só ganha uma linha de texto no compositor.
- O arquivo do PDF nunca é guardado nem enviado; só o texto extraído (DEC-12). O texto do anexo vive no contexto da conversa da análise.
- Contratos v1 a v14 e as fixtures `pre-*` em `packages/legal-workflows/src/agentic-case-task/fixtures` seguem passando intactos; o que muda o texto do agente entra no v15.
- Item sem origem visível, documento que some da soma sem aviso e análise do mesmo texto somada duas vezes são falhas. Contradição entre documentos aparece; o agente não a resolve.
- A estrutura passa a contar conversas de análise do caso mesmo escondidas do histórico (chamada de desenho; o caso apagado leva tudo).
- Só textos sintéticos nos testes. Português nos textos do usuário. Um commit por tarefa concluída; PR só com a frente completa.

## Foco da revisão

1. Trecho já analisado reenviado: o servidor recusa com `ALREADY_ANALYZED` (409), o cliente o conta como feito, e nada é cobrado de novo; análise falha ou cancelada não conta como feita (T1, T5).
2. Pedido de usuário com ação escolhida, com pergunta no fim ou sem anexo com texto nunca é roteado para análise (T1).
3. Todos os testes de análise existentes passam também com a análise rodando no v15, e as partes citadas que não existem no texto viram limitação, não erro (T2).
4. Conversa de análise escondida do histórico continua na soma; análise de outro usuário ou outro caso nunca entra (T3).
5. Duas análises do mesmo texto: só a mais nova soma; numeração F/P única e estável na ordem de chegada (T3, T4).
6. PDF de 300 páginas: nenhum trecho passa do teto, mais de 12 trechos pede dividir o envio, saldo que não cobre todos bloqueia antes de enviar (T5).
7. Ajuste pela conversa sobre item de uma análise antiga aplica na análise dona; falha numa análise não derruba as outras (T6).

---

### Task 1: Cabeçalho do anexo e disparo pelo anexo

**Arquivos:**
- Criar: `packages/domain/src/contracts/attachment-blocks.ts` (exportar em `packages/domain/src/index.ts`), sem imports de Node (a web usa)
- Modificar: `apps/api/src/agentic-workspace/pasted-account.ts`, `apps/api/src/agentic-workspace/execution-service.ts`, `apps/api/src/agentic-workspace/execution-store.ts`
- Testar: `packages/domain/src/contracts/attachment-blocks.test.ts`, `apps/api/src/agentic-workspace/pasted-account.test.ts`, teste de `execution-service`

**Interfaces:**
- Produz: `buildAttachmentHeader(a: { name: string; ocr: boolean; part?: { index: number; total: number; pageFrom: number; pageTo: number; documentCode: string } }): string` (a linha que hoje é `Anexo "nome" (texto extraído):`, com `, parte i de n, páginas a–b, documento <código>` quando houver `part`) e `parseAttachmentBlocks(contextText: string): { name: string; ocr: boolean; part?: {…}; chars: number }[]` (um item por bloco, `chars` do texto até o próximo bloco). A web passa a usar o builder dentro de `attachmentContext`.
- Produz: `routeCaseInput<T extends StartLike>(input: T): T` em `pasted-account.ts` (regras de hoje mais: contexto escrito com ao menos um bloco de anexo com `chars > 0`), `PASTED_ACCOUNT_MIN_CHARS` e `routePastedAccount` continuam exportados.
- Produz: `ExecutionStore.hasLiveEvidenceAnalysis(owner, matterId, objective, contextText?)`: com `contextText`, compara o texto completo do contexto da conversa (não só o objetivo).

- [ ] **Passo 1: testes.** (a) builder e parser fazem ida e volta, com e sem `part`, e com nome contendo aspas; (b) anexo sem `part` e com `part`; texto sem bloco devolve lista vazia; (c) `routeCaseInput`: com anexo com texto e objetivo curto roteia; ação escolhida, `conversationId`, peça aberta, objetivo que termina em "?" e anexo vazio não roteiam; os testes atuais de `routePastedAccount` seguem passando; (d) serviço: início roteado por anexo cujo texto já tem análise viva (qualquer estado menos `FAILED` e `CANCELLED`) é recusado com `ALREADY_ANALYZED` (409), sem criar conversa; o mesmo texto em análise falha é aceito; o relato colado do E1b duplicado continua só deixando de ser roteado (sem erro).
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run packages/domain/src/contracts/attachment-blocks.test.ts apps/api/src/agentic-workspace/pasted-account.test.ts`.
- [ ] **Passo 3: implementar** as assinaturas acima. O `execution-service` chama `routeCaseInput` e, quando o roteamento veio de anexo e o texto completo já tem análise viva, recusa; quando veio do relato colado, mantém o comportamento do E1b. A comparação usa o texto do contexto da conversa, lido do snapshot (`agentic_contexts`), nos mesmos 200 trabalhos recentes do caso.
- [ ] **Passo 4: rodar** os testes novos, `apps/api/src/agentic-workspace` e `tsc` dos pacotes tocados.
- [ ] **Passo 5: commit** `feat(api): anexo com texto dispara a análise e o duplicado é recusado (E4)`.

---

### Task 2: Contrato v15 e `documentProfile`

**Arquivos:**
- Criar: `packages/legal-agents/src/agentic-document-profile.ts` (exportar em `index.ts`)
- Modificar: `packages/domain/src/contracts/agentic-case-task.ts` (campo opcional `documentProfile` na entrega), `packages/legal-workflows/src/agentic-case-task/case-task.ts`
- Testar: `packages/legal-workflows/src/agentic-case-task/document-profile.test.ts` (novo) e os testes de análise existentes

**Interfaces:**
- Produz (domain): `DocumentProfileSchema = z.strictObject({ pieceType: string (1 a 120).optional(), pieceTypeCertainty: z.enum(['IDENTIFICADA', 'INCERTA']), parties: z.array(z.strictObject({ name: string (1 a 200), role: string (1 a 80), sourceId, start: int, quote: string (1 a 400), quoteStatus: z.enum(['MATCHED', 'MISMATCH']).optional() })).max(10) })` e `type DocumentProfile`.
- Produz (legal-agents): `documentProfileProfile(role)` com política `DOCUMENT_PROFILE_TASK_POLICY` (`version: '1.16.0'`): perfil do v14 mais o protocolo do v15 (analista de `analyze_evidence` devolve `documentProfile`; só o que o texto sustenta; `INCERTA` quando não houver peça processual; nada de inventar parte; o texto do anexo e o relato não são prova).
- Produz (workflows): estado `version: z.literal(15)` com a forma do v14 mais `documentProfile`; seleção em `step()`: `binding.actionId === 'analyze_evidence'` escolhe 15 antes da escada atual (os caminhos de `adjust_structure` e do v14 não mudam); o analista do v15 devolve `documentProfile`; o servidor confere cada `quote` contra a fonte (mesma regra de `auditTaskEvidence`: divergência vira `quoteStatus: 'MISMATCH'` e a limitação `EVIDENCE_REFERENCE_MISMATCH`, nunca erro); a entrega guarda o perfil.

- [ ] **Passo 1: testes.** (a) `analyze_evidence` começa no v15 e a entrega traz `documentProfile` com as partes e `quoteStatus: 'MATCHED'`; (b) parte com citação que não está no texto vira `MISMATCH` com a limitação, e a entrega sai; (c) texto sem peça processual: `pieceTypeCertainty: 'INCERTA'` e sem `pieceType`, sem erro; (d) `sourceId` fora das fontes recebidas derruba o trabalho com `EVIDENCE_REFERENCE_INVALID`; (e) os testes de `evidence-analysis.test.ts` e dos handoffs de análise rodam também com a análise forçada no v15 e dão o mesmo resultado (equivalência de comportamento); (f) estados salvos em v10 a v14 retomam na própria versão; v1 a v14 e `pre-*` com hashes iguais; (g) outras ações escolhidas não vão ao v15.
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run packages/legal-workflows/src/agentic-case-task/document-profile.test.ts`.
- [ ] **Passo 3: implementar** o schema, o perfil e a versão 15, usando o `v14` como molde: os testes de faixa de versão (`>= 11`, helpers `isGuidedDesk` e `isDeskEdit`) passam a incluir o 15 onde o comportamento do v14 deve valer; `profileFor`, `policyFor`, `planSchemaFor` e `contractHash` ganham o 15.
- [ ] **Passo 4: rodar** domain, legal-agents e legal-workflows da raiz, `tsc` limpo.
- [ ] **Passo 5: commit** `feat(workflows): contrato v15 identifica a peça e as partes na análise (E4)`.

---

### Task 3: `findCaseStructure`, rota e conversas escondidas

**Arquivos:**
- Criar: `apps/api/src/agentic-workspace/case-structure.ts`
- Modificar: `apps/api/src/agentic-workspace/current-structure.ts` (sem mudar `findCurrentStructure`), `apps/api/src/agentic-workspace/execution-routes.ts`, `packages/persistence/src/repositories/agentic-workspace-repository.ts` (`listMatterConversations` com `includeHidden`)
- Testar: `apps/api/src/agentic-workspace/case-structure.test.ts`, teste do repositório

**Interfaces:**
- Produz: `findCaseStructure(deps, owner, matterId): Promise<CaseStructureEntry[]>` com `CaseStructureEntry = { executionId; deliveryId; updatedAt; contextTextHash: string; documentKey?: string }`, da mais antiga para a mais nova, no máximo 60, só `analyze_evidence` concluídas e gerenciáveis, de conversas do usuário e do caso (escondidas incluídas), com uma entrada por `contextTextHash` (a mais nova vence). `documentKey` vem do cabeçalho do anexo (`documento <código>`), quando houver.
- Produz: a rota `GET /api/agentic/matters/:matterId/structure` devolve `{ structure, structures }`; `structure` continua sendo a mais recente (ou `null`) e `structures` é a lista. Mesmas permissões de hoje.
- Produz: `listMatterConversations(owner, matterId, { limit, offset, includeHidden? })`.

- [ ] **Passo 1: testes.** (a) duas análises do caso voltam em ordem de chegada; (b) conversa escondida do histórico continua na lista; (c) análise de outro usuário, de outro caso, falha ou cancelada, ou de outra ação não entra; (d) duas análises do mesmo texto: só a mais nova; (e) mais de 60: as 60 mais recentes; (f) a rota devolve `structure` igual a antes e `structures` na ordem; sem análise, `structure: null` e `structures: []`; (g) `findCurrentStructure` e seus testes não mudam.
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run apps/api/src/agentic-workspace/case-structure.test.ts`.
- [ ] **Passo 3: implementar** reaproveitando o paging e o critério de `findCurrentStructure`; o `contextTextHash` é o sha256 do texto do contexto da conversa.
- [ ] **Passo 4: rodar** `apps/api/src/agentic-workspace`, os testes de persistência do repositório e `tsc`.
- [ ] **Passo 5: commit** `feat(api): estrutura do caso soma todas as análises vivas (E4)`.

---

### Task 4: Aba Estrutura com a soma e "Documentos do caso"

**Arquivos:**
- Modificar: `apps/web/src/desk/DeskCaseStructure.tsx`, `apps/web/src/desk/case-structure-model.ts`, `apps/web/src/agentic-workspace/present-delivery.ts` (origem do item), `apps/web/src/agentic-workspace/execution-model.ts` (`documentProfile` na entrega)
- Testar: `apps/web/src/desk/case-structure-model.test.ts`, `apps/web/src/desk/DeskCaseStructure.test.ts`, e2e em `tests/e2e/shell-gelo.spec.ts`

**Interfaces:**
- Consome: `structures` da rota (T3), `documentProfile` da entrega (T2).
- Produz: `unifyStructures(entries: { delivery: Delivery; review?: StructureReview; documentKey?: string }[]): { sections: StructureSection[]; documents: StructureDocument[]; summary?: string }`, com os itens de todas as análises numerados em sequência pela ordem da lista (a numeração F/P de `structureItemLabels` roda sobre a lista unida) e `StructureEntry.origin?: string` ("Documento 2" ou "Contrato, páginas 21 a 40"). `StructureDocument = { title: string; pieceType?: string; parties: string[]; analyzedAt: string; parts?: { count: number; pages: number } }`; trechos com o mesmo `documentKey` viram um documento, com o perfil do primeiro que identificou a peça. `summary` é o resumo mais recente entre as revisões.

- [ ] **Passo 1: testes.** (a) duas análises: seções somadas, numeração contínua F1…Fn e origem em cada item; (b) trechos do mesmo `documentKey` viram um documento só, com contagem de partes; (c) análise sem `documentProfile` ainda lista o documento ("Documento N"); (d) o aviso "lido em N partes" aparece; (e) uma análise só rende o mesmo resultado de hoje (sem marca de origem desnecessária); (f) e2e: com duas análises simuladas a aba mostra a soma e "Documentos do caso", sem botão novo; (g) o conjunto vazio e o estado de carregamento seguem como antes.
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run apps/web/src/desk/case-structure-model.test.ts`.
- [ ] **Passo 3: implementar** `unifyStructures` e ligar a aba: ela lê `structures`, busca a entrega e a revisão de cada análise (em paralelo, sem falhar a aba inteira por uma que não carregar: a análise que falhar sai da soma com um aviso em "Pontos a conferir").
- [ ] **Passo 4: rodar** web completo, `tsc` e `npx playwright test --config playwright.shell-gelo.config.ts`.
- [ ] **Passo 5: commit** `feat(web): aba Estrutura soma as análises e lista os documentos do caso (E4)`.

---

### Task 5: Divisão em trechos no compositor

**Arquivos:**
- Criar: `apps/web/src/agentic-workspace/attachment-parts.ts`
- Modificar: `apps/web/src/agentic-workspace/attachments.ts` (`attachmentContext` usa o builder da T1), `apps/web/src/agentic-workspace/Composer.tsx`
- Testar: `apps/web/src/agentic-workspace/attachment-parts.test.ts`, e2e em `tests/e2e/attachments.spec.ts` (ou o e2e de anexos existente)

**Interfaces:**
- Consome: `buildAttachmentHeader` (T1); o texto do PDF começa cada página com a linha `Página N`.
- Produz: `ATTACHMENT_PART_MAX_CHARS = 40_000`, `ATTACHMENT_MAX_PARTS = 12` e `splitAttachment(attachment: Attachment, fullTextHash: string): AttachmentPart[]`, com `AttachmentPart = { index; total; pageFrom; pageTo; text }`: corta só nos limites de página, junta páginas até o teto, nunca divide uma página (página maior que o teto vira uma parte sozinha, recusada com mensagem se passar do limite do pedido). Texto sem marcas de página (TXT, MD, Word) é cortado em parágrafos, com `pageFrom`/`pageTo` omitidos. Anexo que cabe em uma parte devolve uma parte só e o texto de hoje.
- Produz: `partsPlan(attachments): { parts: AttachmentPart[][]; total: number; tooMany: boolean }`.
- Comportamento do compositor: quando `total > 1`, mostra "Este PDF será analisado em N partes" e o valor máximo total (N vezes o valor por trabalho); saldo menor que o total bloqueia o envio com mensagem; `tooMany` pede para dividir em dois envios; os trechos saem em ordem de página, um início por trecho com o mesmo pedido, e cada um recusado com `ALREADY_ANALYZED` conta como feito; a conversa da primeira parte abre na Mesa; falha de um trecho interrompe os seguintes e diz quantos foram enviados.

- [ ] **Passo 1: testes.** (a) PDF de 300 "páginas" sintéticas gera trechos de páginas inteiras, todos até 40.000 caracteres, cobrindo todas as páginas sem sobra nem repetição; (b) página sozinha acima do teto; (c) texto sem marcas de página; (d) anexo pequeno devolve uma parte só com o mesmo texto de antes; (e) mais de 12 trechos marca `tooMany`; (f) cabeçalho de cada trecho traz parte, páginas e o mesmo código de documento; (g) e2e: PDF longo envia N inícios em ordem, mostra a linha de custo, bloqueia com saldo curto e reenviar o mesmo PDF só envia os trechos faltantes (os já analisados voltam 409 simulado).
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run apps/web/src/agentic-workspace/attachment-parts.test.ts`.
- [ ] **Passo 3: implementar** a função pura e depois o envio em sequência no compositor, reaproveitando o `authorization` atual em cada início.
- [ ] **Passo 4: rodar** web completo, `tsc` e o e2e de anexos.
- [ ] **Passo 5: commit** `feat(web): PDF longo é dividido em trechos e analisado parte a parte (E4)`.

---

### Task 6: Ajuste pela conversa (E2) sobre a soma

**Arquivos:**
- Modificar: `apps/api/src/agentic-workspace/case-task-driver.ts` (`structureSource`, `applyAdjustment`), `apps/api/src/agentic-workspace/apply-structure-adjustment.ts`, `apps/api/src/agentic-workspace/execution-service.ts` (a verificação de que existe estrutura)
- Testar: `apps/api/src/agentic-workspace/structure-adjustment-driver.test.ts` (estender) e `apply-structure-adjustment` testes

**Interfaces:**
- Consome: `findCaseStructure` (T3), `structureItemsSource(key, items, decidedIds)` (a função não muda; passa a receber a lista unida e uma chave estável do caso).
- Produz: a fonte `structure:` com os itens de todas as análises, com os mesmos rótulos da aba (F/P em sequência); `applyStructureAdjustment` parte os comandos por análise dona do item, aplica uma análise por vez (cada uma na sua transação, com `commandId` derivado de `(executionId, deliveryId)`), junta as perguntas e o resumo; ACRESCENTAR vai para a análise mais recente; falha numa análise vira pergunta (`ANALISE_ALTERADA` ou o motivo existente) sem desfazer as outras.

- [ ] **Passo 1: testes.** (a) com duas análises, o agente recebe os itens das duas com rótulos contínuos; (b) REMOVER de um item da primeira análise grava DISCARD na primeira e não toca a segunda; (c) ACRESCENTAR entra na mais recente; (d) repetir o passo concluído não aplica duas vezes em nenhuma análise; (e) uma análise que mudou depois da leitura vira pergunta e as outras se aplicam; (f) com uma análise só, o comportamento e os testes de hoje não mudam; (g) mais de 1000 itens no total segue `TASK_CONTEXT_LIMIT`.
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run apps/api/src/agentic-workspace/structure-adjustment-driver.test.ts`.
- [ ] **Passo 3: implementar** partindo os comandos pelo mapa `itemId → deliveryId` construído ao montar a fonte.
- [ ] **Passo 4: rodar** `apps/api/src/agentic-workspace`, persistência do `applyStructureCommands` e `tsc`.
- [ ] **Passo 5: commit** `feat(api): ajuste pela conversa vale para a soma das análises (E4)`.

---

### Task 7: Redação (E3) sobre a soma e fechamento

**Arquivos:**
- Modificar: `apps/api/src/agentic-workspace/case-task-driver.ts` (`contextSource`), `packages/domain/src/contracts/structure-commands.ts` (`structureContextSource` aceita linhas de documento), `docs/architecture/2026-11-19-estrutura-do-caso.md` (estado de execução do E4)
- Testar: `apps/api/src/agentic-workspace/structure-context-driver.test.ts` (estender), `packages/domain/src/contracts/structure-commands.test.ts`

**Interfaces:**
- Produz: `structureContextSource(key, items, decisions, summary?, documents?: string[])`: o novo último parâmetro traz uma linha por documento ("Documento 1: Petição inicial; partes: A (autor), B (réu)") que entra no texto da fonte antes dos itens; o teto e a omissão declarada seguem iguais. `contextSource` do driver usa `findCaseStructure`, junta itens e decisões de todas as análises, uma linha por documento (trechos do mesmo PDF numa linha só) e o resumo mais recente.

- [ ] **Passo 1: testes.** (a) com duas análises a fonte traz os itens das duas, confirmados antes dos a confirmar, e uma linha por documento; (b) trechos do mesmo PDF viram uma linha; (c) item descartado de qualquer análise nunca aparece; (d) com uma análise só a fonte é a de hoje mais, no máximo, a linha do documento; (e) sem análise nenhuma, sem fonte e sem erro; (f) o teto de tamanho corta os itens e mantém as linhas de documento.
- [ ] **Passo 2: rodar e ver falhar:** `npx vitest run apps/api/src/agentic-workspace/structure-context-driver.test.ts packages/domain/src/contracts/structure-commands.test.ts`.
- [ ] **Passo 3: implementar** o parâmetro e a montagem pela soma.
- [ ] **Passo 4: verificação final do PR:** testes dos seis pacotes e dos e2e (`shell-gelo`, `desk-guidance-v3`, anexos), `tsc` e prettier limpos; atualizar o spec (E4 entregue, limites e o que não foi verificado com o modelo real) e commitar junto: `feat(api): redação usa a soma das análises e as linhas de documento (E4)`.
