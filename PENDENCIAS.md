# Pendências atuais do ForgeLex

Atualizado em 07/10/2026. Este é o backlog vigente. Checkboxes de planos antigos
registram o recorte daquela entrega; não devem ser importados como tarefas novas.
[Produto e publicações](CONTINUIDADE.md) · [Evidências](STATUS_VALIDACAO.md).

| Frente | Estado atual | O que falta para encerrar |
| --- | --- | --- |
| CI do lifecycle | Integrado e publicado; 5 E2E locais e CI aprovados; artefatos preservados em falha | Acompanhar novas ocorrências; a causa exata da falha Linux anterior permanece não demonstrada |
| Dependências | Dois advisories corrigidos, build e CSS equivalentes; audit prod sem alertas | `braces` 3.0.3 mantém alerta alto; aguardar patch publicado e validar atualização |
| Pesquisa → Caso | Publicado na PR #58; salvar/deduplicar, consultar fonte e reutilizar nos seletores; pesquisa 10 E2E aprovados | Incremento técnico encerrado; pertinência jurídica continua sob conferência humana |
| Retenção ordinária | Job diário às 8h, OAuth; inspeção e disparo pelo Scheduler comprovados, zero elegíveis nas duas execuções | Expurgo automático exige decisão operacional registrada; apply e worker público desabilitados |
| Comprovações humanas | Roteiro e matriz preparados; aceite documental anterior preservado | Ensaio humano, segundo revisor/canal, qualificação fiscal e provas de privacidade/comércio eletrônico |
| Acompanhamento | Automação corrigida para main atual e backlog único; frequência diária às 15h preservada | Acompanhar mudanças acionáveis, sem relatório repetido quando nada muda |
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
