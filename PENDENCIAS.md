# Pendências atuais do ForgeLex

Atualizado em 09/10/2026. Este é o backlog vigente. Checkboxes de planos antigos
registram o recorte daquela entrega; não devem ser importados como tarefas novas.
[Produto e publicações](CONTINUIDADE.md) · [Evidências](STATUS_VALIDACAO.md).

| Frente | Estado atual | O que falta para encerrar |
| --- | --- | --- |
| CI do lifecycle | Integrado e publicado; 5 E2E locais e CI aprovados; artefatos preservados em falha | Acompanhar novas ocorrências; a causa exata da falha Linux anterior permanece não demonstrada |
| Dependências | Dois advisories corrigidos; mitigação local de profundidade de `braces`, com regressão e audit completo na CI | Alerta upstream permanece aberto. Reavaliar patch/release antes de 08/11/2026 UTC; não descartar o advisory |
| Pesquisa → Caso | Publicado na PR #58; salvar/deduplicar, consultar fonte e reutilizar nos seletores; pesquisa 10 E2E aprovados | Incremento técnico encerrado; pertinência jurídica continua sob conferência humana |
| Retenção ordinária | Ativada por decisão explícita de Boni em 09/10; job diário às 8h, OAuth, --apply; execuções manual e pelo Scheduler concluídas, zero removidos | Acompanhar falhas, contagens, exceções e backups; worker público continua desabilitado. Ativação técnica encerrada, sem qualificação fiscal automática |
| Comprovações humanas | Boni confirmou em 09/10 que opera sozinho e ainda não tem as comprovações solicitadas | Ações sensíveis dependentes de segundo revisor permanecem bloqueadas; ensaio humano, qualificação fiscal, contratos/transferências e provas comerciais continuam abertos |
| Acompanhamento | Automação recriada em 09/10 porque o app informou ausência da anterior; main atual, diariamente às 15h, somente leitura dos recibos | Não disparar job/Scheduler com --apply durante monitoramento; avisar somente mudanças acionáveis e revisão da mitigação de braces |
| Reserva histórica | Classificada: 1 PENDING de 20 centavos, lease vencido, sem fingerprint e sem débito correspondente | Preservar evidência; não inferir estorno/backfill. Não bloqueia saldo pela regra atual |
| Busca STJ / P2 | Projeção e semântica de busca já em main; timeout 45s; recuperação de tela presente | Medir latência atual sob uso representativo e acompanhar lacunas oficiais; não prometer cobertura integral |

Nenhum P0/P1 foi comprovado pela auditoria deste recorte. Isso não substitui
teste de intrusão nem comprovação jurídica/fiscal. Cada estado distingue código,
CI, runtime e avaliação humana.

Mesa do caso, novos agentes internos, OCR e novos tribunais são possibilidades
futuras; não são defeitos ou entregas atrasadas deste incremento. A arquitetura
continua MCP/IA externa, com permissões e conferência humana.

Responsável pelo acompanhamento: Boni. A classificação da reserva e a inspeção
de retenção foram realizadas às 20:42:44 UTC, somente leitura. A automação não
executa operações faturáveis ou mutações. Detalhes e limites:
[remediação](docs/operations/stabilization/2026-10-07-audit-remediation.md),
[publicação e recibo](docs/operations/stabilization/2026-10-07-audit-remediation-publication.md),
[provas humanas](docs/operations/stabilization/2026-10-07-operational-proof-checklist.md),
[dependências](docs/operations/stabilization/2026-10-07-build-dependencies.md).

[Conferência e ativação de 09/10](docs/operations/stabilization/2026-10-09-audit-residual-closure.md).

Entrega residual na PR #60: código `c0a2d3c` validado nos seis checks da CI
`37991979881`, com 794 unitários e 130 E2E aprovados. O bloqueio adicional de
download do PostgreSQL na CI foi resolvido usando o espelho Docker Official
Image no ECR Public. Isso não encerra o advisory upstream nem os gates humanos.
