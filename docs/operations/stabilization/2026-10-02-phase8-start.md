# Fase 8 — acompanhamento operacional não bloqueante

Decisão de Boni em 02/10/2026: o acompanhamento continua em paralelo à
operação e evolução do produto. Sete dias de observação deixam de ser gate
para entrega, publicação ou início de uma nova frente, como DataJud.

Marco inicial preservado: 02/10/2026 às 13h01min57s (America/Fortaleza),
2026-10-02T16:01:57Z. A referência de relatório de sete dias seria 09/10 às
13h01min57s; não é prazo mínimo de aprovação. Tempo decorrido e agendamento
ativo, isoladamente, não comprovam estabilidade ou reconciliações.

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
A entrega validada e a fase 7 permanecem fechadas. A rotina da fase 8 não
bloqueia a evolução do projeto; nenhuma nova recarga é necessária para esse
acompanhamento. Não afirmar sete dias observados ou reconciliação global concluída.

Acompanhamento diário de leitura configurado no Codex às 15h, America/Fortaleza,
em 02/10/2026. A rotina consulta o estado canônico antes de avaliar disponibilidade,
latência/erros, billing, ledger/outbox, STJ, schedulers, encerramentos e backups;
registra resultados e limites. Não executa correções, cobranças ou mudanças remotas.
O agendamento foi confirmado ativo; sua primeira execução não está comprovada
neste registro. Este documento conserva o baseline, não é relatório de sete dias.

Incidente concreto P0/P1 aciona a operação ou release afetada até conter/corrigir
o risco, com responsável e evidência. P2 e novas funcionalidades continuam em
backlog e não impedem frentes independentes. DataJud é evolução planejada,
com escopo a definir; não altera as capabilities comerciais STJ atuais.
