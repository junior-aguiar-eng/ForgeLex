# Fase 8 da estabilização — início da observação operacional

Marco inicial: 02/10/2026 às 13h01min57s (America/Fortaleza),
2026-10-02T16:01:57Z. A janela mínima de sete dias termina em
09/10/2026 às 13h01min57s, desde que a observação e as reconciliações
tenham evidência suficiente. Tempo decorrido, isoladamente, não fecha o gate.

Baseline da release: origem 0f1ce2fe9ca91e507d22eb0baa90360c9cffdfc8,
revisão forgelex-api-prod-webhook-0f1ce2fe, digest
sha256:b13d0a013fe3c1db52e2110dadf57ebc113582ac3fdf633fdbb7800c39c2d98f.
Promoção 5/25/100 concluída às 15:59:00Z com 468 verificações readyz 200
e oito verificações finais 200. Fonte: recibo de promoção local e CI de main.

Verificações iniciais de 02/10: backup automático SUCCESSFUL,
concluído às 04:26:30Z; schedulers de ingestão STJ e reconciliação de
encerramento ENABLED. Recarga real conciliada com o provedor: compra PAID,
saldo de 2.500 centavos e um único crédito, inclusive após replay.
Isso não comprova reconciliação global de todos os pagamentos ou execução
bem-sucedida dos schedulers: ENABLED e lastAttemptTime não são prova de sucesso.

Durante a janela: verificar disponibilidade, 5xx, p95, billing/webhooks,
frescor STJ, Scheduler, encerramentos, backups e alertas; reconciliar saldo,
pagamentos, outbox, manifestos STJ e encerramentos; classificar pendências
com proprietário, prazo e estado. Registrar evidência por período observado.

A cadeia faturável no ChatGPT, get/verify, dois replays, evento único,
revogação e restauração foram comprovados posteriormente neste dia.
A fase 7 foi fechada após publicar e validar focalmente as duas correções
de espaçamento: runtime b6c893c a 100% em 02/10 às 17:03:40Z. A troca de
revisão integra o histórico desta janela; claims de auditoria permanecem limitados.
A observação operacional pode avançar em paralelo, sem declarar COMPLETED
do programa. Nenhuma nova recarga é necessária.

Este registro é um marco e baseline; não é monitoramento autônomo agendado
nem relatório de sete dias completos.
