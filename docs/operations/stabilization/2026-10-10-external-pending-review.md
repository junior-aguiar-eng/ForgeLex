# Braces e STJ — tratamento das pendências externas

Data: 10/10/2026. Base main `8c1820a`. Solicitação de Boni: registrar aprovação
fiscal e tratar braces/STJ. [Recibo das consultas e validações](2026-10-10-external-pending-review-proof.json).
Avaliação local de controles existentes; não é deploy ou nova ingestão.

## Resultado e tratamento vigente

Não foi identificada nesta rodada uma nova correção executável necessária.
As medidas internas de braces e da lacuna STJ já estão implementadas e passaram
nas verificações abaixo. A correção upstream continua aberta e deve ser
acompanhada; sua ausência não exige outro avaliador humano nem paralisa outras
frentes do projeto. A governança continua exclusivamente de Boni.

| Frente | Situação externa | Controle interno verificado | Tratamento |
| --- | --- | --- | --- |
| Braces | Registry latest 3.0.3; alerta #11 aberto, sem primeira versão corrigida | Patch de profundidade, testes reais da dependência transitiva, audit completo e exceção com vencimento | Preservar controles atuais; substituir patch quando houver versão corrigida publicada e validada; não descartar o alerta |
| STJ | Recurso 20240229.json mantém os mesmos bytes inválidos | Reconhecimento específico da lacuna terminal, skip antes da coleta do recurso e distinção de falhas ordinárias | Manter a lacuna explícita; reavaliar quando a fonte mudar; não reparar/publicar manualmente conteúdo da fonte |

Isso conserva as decisões e limites já vigentes. Não houve nova aceitação
genérica de vulnerabilidades, renovação da exceção ou aprovação fiscal adicional.

## Braces

Consulta às 14:00:17 UTC (11:00:17 em America/Fortaleza): latest 3.0.3;
Dependabot #11 `open`; `firstPatchedVersion: null`. O
[advisory oficial](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) continua
sem versão corrigida indicada. Uma indicação de >=3.0.4 no audit não comprova
release disponível; não será instalada uma versão inexistente.

`pnpm why braces --recursive` encontrou uma versão, transitiva de Tailwind
via chokidar/micromatch/fast-glob, em devDependencies do frontend. O rótulo
de escopo do alerta GitHub não substitui essa conferência da árvore local.
Isso delimita a cadeia observada, sem afirmar ausência de risco em todo contexto.

O [patch versionado](../../../patches/braces@3.0.3.patch) faz conferência iterativa
da profundidade antes dos percursos recursivos de compile/expand/stringify.
Os testes verificam padrões e ASTs profundas, entradas comuns e impossibilidade
de contornar a profundidade aumentando maxLength. O controle é mitigação local
específica, não correção upstream nem garantia contra qualquer custo de globs.

Audit de produção: zero alertas em todas as severidades. Audit completo:
somente braces no conjunto mitigado e zero outros alertas acionáveis pelo
avaliador vigente. A CI mantém o audit completo e os testes do patch; relatórios
inválidos, novos alertas moderados/altos/críticos e exceção vencida continuam
reprovados pelos controles existentes.

A revisão deve ocorrer **antes de 08/11/2026 às 00h UTC**, equivalente a
**07/11/2026 às 21h em America/Fortaleza**. Esta rodada não altera esse vencimento.
Se não houver release até lá, Boni avaliará as alternativas concretas para a
cadeia de build; não há renovação automática. Nenhuma troca ampla de Tailwind,
supressão do advisory ou alteração do lockfile foi feita para esconder o alerta.

## Lacuna STJ

A requisição oficial foi limitada a bytes 0–598 e o fluxo fechado após até
599 bytes. Resposta 206, `Content-Range: bytes 0-598/599`. SHA-256:
`ea2537c36c1e11d5206f7cee7b82178fc455cb8832cd7110a1acc807b7da9b46`.
É idêntico ao registro anterior do erro estrutural na linha 24, posição 592.

Recurso: [20240229.json na fonte oficial](https://dadosabertos.web.stj.jus.br/dataset/7107650a-f26c-4900-bffd-4492af6361cf/resource/5176e318-5de1-4d28-8931-3ee31fd9d7d7/download/20240229.json).
O conteúdo não foi incorporado parcialmente nem corrigido por conta própria.
Não se conclui inexistência de julgados ou completude do mês a partir de JSON
inválido. A cobertura permanece qualificada por essa lacuna.

Os testes de manifest distinguem erro oficial terminal de erro comum; os testes
de ingestão verificam o retorno `SKIPPED_TERMINAL_SOURCE_GAP` sem baixar a lacuna.
Os testes de freshness preservam a distinção para não reportar a mesma lacuna
conhecida como falha operacional nova. Isso não elimina o registro da lacuna,
não corrige a fonte e não comprova frescor integral do corpus.

Quando os bytes mudarem, primeiro verificar identidade do recurso e validade
estrutural. Se a fonte estiver corrigida, planejar o reprocessamento específico
com os gates operacionais pertinentes; não tornar o manifest READY só por HTTP
200 ou por aprovação humana. Nenhuma ingestão ou edição do manifest foi executada.

## Validação confirmada

- `pnpm exec vitest run scripts/security/braces-depth.test.ts scripts/security/build-audit.test.ts packages/persistence/src/repositories/jurisprudence-source-manifest-repository.test.ts --maxWorkers=1`: 35 testes aprovados, três arquivos.
- `pnpm exec vitest run scripts/ingest-stj-open-data.test.ts scripts/report-stj-freshness.test.ts --maxWorkers=1`: 16 testes aprovados, dois arquivos.
- Audit prod sem vulnerabilidades conhecidas; audit completo aceito pelo
  avaliador existente com apenas a exceção específica de braces.

Total: 51 testes aprovados em cinco arquivos. O pnpm reconciliou dependências
locais ao executar os testes; nenhum arquivo de dependências versionado mudou.
Não houve suíte completa, deploy, atualização de pacote, operação financeira,
descarte de alerta GitHub, alteração de manifest ou ingestão produtiva.

Conclusão: controle interno revalidado; correções upstream abertas em
acompanhamento externo. A preparação fiscal foi aprovada separadamente no
[registro FISCAL-2026-10-10.v1](2026-10-10-fiscal-decision.md).
