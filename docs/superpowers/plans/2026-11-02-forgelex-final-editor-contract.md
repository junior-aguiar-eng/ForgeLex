# Final editor contracts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implementar o contrato e a validação pura das propostas editoriais, sem ativar o papel.
**Architecture:** Reutilizar schemas do domínio em `legal-agents`. Entrada vinculada a minuta entregue/versionada; saída contém somente propostas ancoradas. Nenhum acesso a banco, rede ou runtime.
**Tech Stack:** TypeScript, Zod 4, node:crypto, Vitest e pnpm existentes.
**Spec:** `docs/superpowers/specs/2026-11-02-forgelex-final-editor-contract.md`.

## Global Constraints

- Exatamente os três arquivos de código previstos na spec; documentação e recibo locais acompanham a entrega.
- `contractVersion: 1.0.0`; `humanReviewRequired: true`; `legalAssessment: NOT_EVALUATED`.
- Até 30 changes, 30 substantiveSuggestions, 20 limitations; trechos e motivos até 4.000 caracteres.
- Hash do documento: SHA-256 UTF-8 de `JSON.stringify(TaskDocumentSchema.parse(document))`.
- Hash da seção: SHA-256 UTF-8 do conteúdo original; offsets UTF-16, sem dividir pares substitutos.
- Fluxo v8, sete papéis, mesa, carteira, fontes e limites atuais inalterados. Sem modelo/rede, migration, push ou deploy.
- Nenhum commit novo nesta etapa: a autorização anterior foi executada para a consolidação. Registrar alterações locais revisáveis.

## Review Focus

- Espaços iniciais/finais e Unicode: before/after e conteúdo de seção não podem ser normalizados para validar âncoras.
- Referências ambíguas: IDs duplicados de fonte, claim ou proposta e hashes inconsistentes devem falhar.
- Mudanças fora de ordem: detectar sobreposição sem reordenar ou alterar o objeto entregue pelo chamador.
- Proposta vazia: não inventar aprovação; LIMITED exige limitação, suporte parcial e findings originais permanecem intactos.
- Fronteira de confiança: validar JSON não prova entrega persistida/autorizada nem equivalência semântica; rejeitar checkpoints sem envelope e campos de execução/aprovação.

### Task 1: Schemas e validação de proposta editorial

**Files:**
- Create: `packages/legal-agents/src/final-editor-contracts.ts`
- Create/Test: `packages/legal-agents/src/final-editor-contracts.test.ts`
- Modify: `packages/legal-agents/src/index.ts`

**Interfaces:**
- Consumes: TaskDocumentSchema, TaskSourceSchema, TaskClaimSchema, TaskRequirementSchema, TaskFindingSchema e TaskSupportAuditSchema de `@forgelex/domain`.
- Produces: `FinalEditorialContextSchema`, `FinalEditorialProposalSchema`, tipos inferidos e `validateFinalEditorialProposal(context: unknown, proposal: unknown): FinalEditorialProposal`.
- `substantiveSuggestions`: id, sectionIndex, sectionHash, start, end, before, reason, sourceIds; nunca after/patch. Campos id/refs até 200 caracteres, max 100 referências por item.
- Contexto usa os limites existentes de claims/requirements/findings/supportAudit/fontes; todas as coleções explícitas. Claims/fontes com IDs distintos e referências consistentes. A origem persistida e autorização continuam responsabilidade do futuro chamador servidor.

- [x] **Step 1: Escrever testes e observar RED**
  Testar proposta válida com acentos/emoji/espaços; stale IDs/revisão/hashes;
  fonte nova ou duplicada/hash inválido; trecho incorreto; faixas inválidas;
  overlap sem ordenar entrada; sugestões substantivas sem patch; limites exatos
  e excesso; chaves desconhecidas/aprovação indevida; no-op LIMITED e imutabilidade.
  Rodar `pnpm exec vitest run packages/legal-agents/src/final-editor-contracts.test.ts`.
  Expected: falha porque o novo contrato não está implementado.

- [x] **Step 2: Implementar o contrato**
  Schemas strictObject; reutilizar contratos do domínio, preservando conteúdo bruto
  das seções e trechos. Validar hashes/ref integridade no contexto; conferir
  envelope, âncoras, UTF-16 e sobreposição no validador. Não aplicar nenhum patch.
  Exportar somente os schemas, tipos e validador definidos acima.

- [x] **Step 3: GREEN e regressões**
  Rodar `pnpm exec vitest run packages/legal-agents/src packages/legal-workflows/src/agentic-case-task apps/api/src/agentic-workspace/verifier-budget.test.ts`.
  Expected: todos aprovados, inclusive compatibilidade e orçamento D04.
  Rodar build, tipos, lint e formatação pertinentes; suite geral `pnpm test` com
  chaves/aprovação reais desabilitadas e bancos opcionais ausentes do processo.
  Expected: zero falhas; condicionais PostgreSQL e integração paga ignorados.

- [x] **Step 4: Revisão e registro**
  Revisão read-only independente requerida pela skill de execução; tratar achados
  materiais com regressão RED→GREEN. Registrar resultados, hashes de proteção e
  limites no recibo; atualizar continuidade/pendências. Não ativar catálogo/runtime.

## Decisões do recorte

- O conteúdo bruto das seções é preservado no contexto; o hash de documento segue
  a canonicalização já fixada na spec, enquanto sectionHash/before protegem o texto
  exato. O schema de domínio faz trim de conteúdo, portanto esse campo recebe
  validação equivalente sem transformação no contrato editorial.
- Resultado final: 31 testes próprios, 228 focados, build completo e 1.652
  testes gerais aprovados; 17 condicionais ignorados, zero falhas. Lint,
  formatação e tipos de legal-agents/API aprovados. Evidências no registro
  `docs/architecture/2026-11-02-forgelex-final-editor-contract.md`.
- Uma coleção `substantiveSuggestions` explícita pode apontar o mesmo trecho de
  uma change, pois é observação sem patch. Sobreposição proibida refere-se às changes.
- LIMITATION não é aprovação; nenhuma heurística tenta certificar equivalência jurídica.
- A revisão identificou perda de identidade na conversão UTF-8 de substitutos
  isolados e duplicação de auditoria por claim/fonte. Ambos foram reproduzidos
  e corrigidos localmente; fontes, seções e substituições exigem Unicode válido,
  e cada par de auditoria admite um único registro.
- Uma regressão adicional confirmou que `safeParse` não deve lançar exceção
  para documento inválido. A canonicalização agora verifica seu resultado antes
  de calcular o hash, mantendo erro de schema explícito.
