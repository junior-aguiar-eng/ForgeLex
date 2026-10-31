# Revisão da plataforma agêntica — 30/10/2026

Escopo: commits `41a1fd0..7abf606` (plano agêntico → execução comercial), com foco em
`apps/api/src/agentic-workspace`, `packages/billing-ledger` (execução comercial),
`packages/legal-workflows`, retenção de conta e UI `apps/web/src/agentic-workspace`.
Nenhum arquivo do projeto foi alterado nesta revisão.

## 1. O que foi executado e o resultado

| Verificação | Resultado |
| --- | --- |
| `pnpm build`, `typecheck` (16 pacotes), `lint` | Aprovados |
| `vitest run` completo | 1313 aprovados, 17 ignorados, 0 falhas |
| Migrations em PostgreSQL 16 limpo (35 persistence + 10 billing) | Aplicadas sem erro |
| Smokes PG: `commercial-inference`, `agentic-retention`, `operational-retention` | Aprovados |
| E2E Playwright: `agentic-workspace` (23), `agentic-commercial-flow` (1), `agentic-flags` (1) | 25/25 aprovados |
| Smokes PG: `agentic-workspace`, `agentic-execution`, `agentic-case-task`, `inference-budget` | **Não executados** — exigem Docker (indisponível aqui) e **não estão na CI** |
| Chamada real à OpenAI | Não executada (sem chave/autorização) |

**Conclusão:** não há quebra de build, tipos, lint, testes ou fluxo E2E. A "bagunça" é de
projeto, operação e higiene — não de código que falhe hoje. Os achados abaixo vêm de leitura
do código; o único provado por execução está marcado.

## 2. Achados (por gravidade)

### ALTA

**A1. Uma chamada ao provedor que termina "incerta" trava a conta inteira, sem ferramenta de saída.**
- Causa: após o envio, qualquer fim sem `usage` válido (cancelar o trabalho durante a chamada,
  timeout de 30 s, erro de rede, prazo de 5 min, **deploy/`worker.stop()` durante a chamada**)
  chama `markUncertain` (`commercial-provider.ts:99-102`). `assertReconciled`
  (`commercial-inference-service.ts:240-248`) então bloqueia toda nova reserva e chamada do
  **tenant** com `COMMERCIAL_RECONCILIATION_REQUIRED`.
- Não existe endpoint, script ou runbook para conciliar: `settleCall`/`markNotDispatched` só são
  chamados pelo transporte (grep em `apps`, `packages`, `scripts`, `docs`). Na prática, a saída é
  SQL manual.
- O comportamento é intencional e coberto por teste
  (`commercial-inference-service.test.ts:207-217`), mas "cancelar" é ação comum do cliente.
- Sugestão: ferramenta operacional de conciliação (Boni) e distinguir cancelamento do usuário
  (abortar antes de ler a resposta ≠ custo desconhecido) de falha real.
- Verificado depois: as 116 respostas da homologação real (`docs/architecture/evidence`) trazem
  `model` exatamente `gpt-6.1-sol`; a suspeita de ID datado do modelo não se confirmou.

### MÉDIA

**M1. Falha transitória de autenticação derruba o stream como "acesso revogado" — PROVADO por sonda.**
`execution-routes.ts:437-438` converte qualquer falha de `authenticate` em `ACCESS_REVOKED`;
`SupabaseIdentityVerifier.verify` devolve `null` em timeout/429/5xx (`fastify-auth.ts:111-113`) e
não há cache. Sonda temporária: uma única verificação nula no 3º tick encerrou o SSE com
`ACCESS_REVOKED` (sonda removida). A UI trata como negado e não reconecta
(`use-execution-events.ts:36`), enquanto a execução paga continua. O mesmo ocorre quando o
token expira com pergunta aberta. Efeito colateral: 1 chamada ao Supabase por segundo por stream.

**M2. Leituras viram transações de escrita com lock por tenant.**
`getExecution` e `listClientEvents` passam por `ExecutionStore.atomic`
(`execution-store.ts:42-58`: lock do tenant, upsert e `version+1`) e `activeContext`
(`execution-service.ts:125-173`) faz `UPDATE` sem efeito em conversa, caso e cada documento.
A tela refaz o `GET` a cada evento (`AgenticWorkspaceScreen.tsx`, efeito com `events.cursor`) e
o SSE repete isso a cada 1 s. Serializa leitor, worker (`renewLease`, `beginStep`, `finishStep`)
e gera tuplas mortas em `matters`/`legal_documents`. `getExecution` ainda faz N+1 (até 1000
execuções anteriores).

**M3. Varreduras globais a cada segundo, sem expiração de perguntas abandonadas.**
`sweepAdmissions` lê e faz parse de todo job `WAITING` (`commercial-runtime.ts:233`); pergunta
sem resposta permanece `WAITING` para sempre (`admissionExpiresAt` nulo) e é relida a cada
segundo. `recover()` lê a tabela inteira no boot (`:291`). `managedJobs` faz uma consulta por job
para filtrar (`execution-service.ts:526-534`).

**M4. Responder à pergunta é destrutivo antes da cobrança ser autorizada.**
`commercial.successor` chama `answerExecution` (cancela a execução antiga e consome a pergunta)
**antes** de `finance.reserve` (`commercial-runtime.ts:279-286`). Se a reserva falhar (saldo,
limite diário), a pergunta vira `QUESTION_EXPIRED`, a sucessora expira em 120 s e o trabalho se
perde. A sucessora também reinicia sem checkpoint (`execution-service.ts:461-468`): o orquestrador
roda e é cobrado de novo, e pode fazer outra pergunta.

**M5. Execuções sem entrega utilizável custam à plataforma, não ao cliente, e não entram nos limites.**
`finalize` cobra R$ 0 sem entrega utilizável (`commercial-inference-service.ts:602-605`) e o limite
diário/mensal soma só `chargedCents` das execuções encerradas (`:356-366`). Cada execução pode
consumir até US$ 0,25 (24 chamadas). Não há teto de execuções gratuitas por dia; basta saldo ≥ R$ 5.

**M6. Decisão de cobrança depende de lista negra de códigos.**
`hasUsableResult` (`commercial-runtime.ts:44-84`) trata como utilizável qualquer finding
fundamentado cujo código não esteja na lista. Código de limitação novo em `case-task.ts` — ou
código arbitrário emitido pelo modelo — passa a gerar cobrança. O ideal é lista positiva ou
derivar do `status` da entrega.

**M7. Falhas engolidas sem log nem métrica.**
`catch {}` em `tick`/`sweep` (`execution-routes.ts:71-86`); `releaseBudget` ignora erros e
reagenda a cada 30 s indefinidamente (`execution-service.ts:700-708`); `handle` converte erro
desconhecido em `EXECUTION_UNAVAILABLE` sem registrar. Reserva de R$ 5 presa ficaria invisível.

**M8. Contador de reconexão do SSE nunca zera.**
`use-execution-events.ts:57`: `retries` só cresce. Com timeout do Cloud Run em 360 s
(`commercial-execution.md`), uma pergunta aberta por ~30 min esgota 5 reconexões e a UI mostra
`EXECUTION_UNAVAILABLE`. Correção: zerar após conexão bem-sucedida.

**M9. Smokes PostgreSQL do núcleo agêntico fora da CI.**
Os quatro scripts que cobrem recuperação após queda e concorrência
(`smoke-agentic-workspace/execution/case-task`, `smoke-inference-budget`) dependem de Docker e
não aparecem em `.github/workflows/ci.yml`. Não pude executá-los. O núcleo de leasing/reconciliação
só é exercitado em SQLite em memória no `vitest`.

### BAIXA / higiene

- **Constantes duplicadas:** `'gpt-6.1-sol'` em 6+ lugares (provider, política, drain, piloto,
  transporte, homologação); allowlist de tools copiada em dois providers; limites 500/2000/10000
  e 50/500 fixos em `reserve`/`quote` em vez de ler `COMMERCIAL_POLICY`
  (`commercial-inference-service.ts:285-291, 367-369`). Códigos `PILOT_*` aparecem no caminho comercial.
- **Três modos coexistentes** (simples, piloto fechado, comercial) com
  `CASE_TASK_CONFIGURATION_CONFLICT`; ~1000 linhas de piloto. `task6-homologation.ts` (harness de
  homologação real, tenant fixo, grava arquivos) está em `apps/api/src` e vai para `dist`/imagem;
  o teste real (`provider-real.integration.test.ts`) está em uma linha minificada.
- **Formatação:** 193 arquivos fora do Prettier (`app.ts` com linhas enormes); a CI não roda
  `format:check`.
- **Documentação divergente:** `CONTINUIDADE.md` (24/10) ainda lista a transição agêntica como
  "Suspensa"; `PENDENCIAS.md` não menciona a execução comercial; README diz que os adaptadores de
  provedor "não são runtime comercial", mas a execução comercial usa o adaptador OpenAI;
  `commercial-execution.md` diz "preparada nesta branch… ainda precisa de recibo".
- **Raiz do repositório:** ~15 arquivos de prompts/relatórios/PNGs do Codex versionados e 17
  `playwright.*.config.ts`.

## 3. O que está sólido

- Isolamento tenant/usuário consistente nas rotas e no repositório; escopos `matter:read`
  verificados em rotas, SSE e entrega.
- Idempotência por chave com `inputHash`; reserva única por conta; matemática de preço em
  inteiros/BigInt; teto de chamadas, tokens, bytes e tempo aplicados antes do envio.
- Destino do HTTP travado em `api.openai.com/v1/responses`, `redirect: 'error'`, `store: false`,
  tools restritas.
- Retenção/encerramento de conta cobre as novas tabelas (smokes PG aprovados).

## 4. Ordem sugerida de correção

1. A1 (conciliação + cancelamento ≠ incerteza + modelo datado) — risco financeiro/suporte.
2. M1 e M8 — correções pequenas e de efeito visível ao usuário.
3. M4, M5, M6 — integridade da cobrança.
4. M7 (log/métricas) antes de ativar em produção.
5. M2/M3 — antes de carga real; M9 — colocar os smokes na CI com PostgreSQL de serviço.
6. Higiene (constantes, documentos, raiz, formatação).

## 5. Limites desta revisão

Não validei: comportamento real da API OpenAI, deploy/Cloud Run, os quatro smokes com Docker,
nem a qualidade jurídica das entregas. Achados M2–M9 e A1 são por leitura de código (A1 com apoio
nos testes existentes); M1 foi reproduzido por teste descartável.

## 6. Correções aplicadas (30–31/10/2026)

| Achado | Correção |
| --- | --- |
| M1 | O stream tolera falhas de verificação isoladas e só encerra após 3 consecutivas ou se a identidade mudar (`execution-routes.ts`). Se chegar `ACCESS_REVOKED` no meio do stream, o cliente reconecta, e uma revogação real é recusada pela própria conexão. Testes de API (falham sem a correção) e E2E novo. |
| M8 | Stream estável (≥ 10 s) zera o contador de reconexão (`streamRetries`). |
| A1 | Ferramenta de conciliação: `CommercialInferenceService.reconcileCall`/`listUnresolvedCalls` e `scripts/reconcile-commercial-call.mjs` (lista, dry-run e `--apply`), restrita a chamadas UNCERTAIN, com evidência obrigatória, sem cobrança ao cliente. Procedimento em `docs/operations/agentic-workspace/commercial-execution.md`. |

**A1 — o que não mudou, por decisão que cabe a Boni:** cancelar ou reiniciar durante uma chamada
continua marcando-a UNCERTAIN e bloqueando o tenant até a conciliação. Sem prova do consumo, não há
base para tratar cancelamento como custo zero. Se quiser reduzir a frequência do bloqueio, a política
precisa ser definida (por exemplo, conciliação automática por consulta ao registro de uso do provedor).

| Achado | Correção (31/10/2026) |
| --- | --- |
| M4 | A resposta confere saldo, limites, execução ativa e conciliação (`assertCanAdmit`) **antes** de cancelar a execução e consumir a pergunta. Se faltar saldo, a pergunta continua respondível; teste falha sem a correção. Não resolvido: a sucessora ainda reinicia sem checkpoint, porque a resposta muda o contexto e invalida o estado anterior. |
| M5 | Trabalho sem cobrança, mas com consumo medido, conta nos limites diário/mensal pelo preço que teria. Trabalho sem consumo não conta. **Muda o comportamento visível dos limites; política a confirmar por Boni.** Constantes 500/2000/10000 passaram a ler `COMMERCIAL_POLICY`. |
| M6 | Lista única `CASE_TASK_LIMITATION_CODES` no workflow; `finding()` só aceita esses códigos (o compilador impede código novo sem classificação) e a cobrança lê a mesma lista. A regex para códigos emitidos pelo modelo foi mantida. |
| M7 | Falhas engolidas passam a gerar log estruturado com código estável (`failure-log.ts`); ver `commercial-execution.md`. |
