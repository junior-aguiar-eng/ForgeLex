# Revisão editorial de peças da mesa — 06/11/2026

## Contrato

A revisão comercial pode partir de uma versão salva na mesa, criada manualmente ou editada após entrega da IA. O identificador interno `desk:<matterId>` seleciona esse caminho; não cria uma entrega agêntica fictícia e não altera a entrega original.

O contexto contém o texto exato da versão salva e a origem `DESK_VERSION`. Fontes, fatos e mérito jurídico não são auditados por esse caminho. A proposta deve ser `LIMITED`, declarar limitações e manter `legalAssessment=NOT_EVALUATED`. A revisão de uma entrega original continua usando suas fontes e auditorias persistidas.

`draft_versions.editorial_reviews_json` guarda snapshots e decisões por usuário, sob o bloqueio existente de caso/rascunho. A coluna acompanha o ciclo de retenção e exclusão da própria versão. A migration `persistence-0040-desk-editorial` é aditiva e inicia os registros existentes com valor nulo.

## Operação e interface

A ação “Revisar texto com IA” fica dentro da conferência da peça. Edições locais precisam ser salvas antes da revisão. As versões antigas preservam recibos e decisões, mas não aceitam nova geração ou aplicação. Revogação de acesso e ciclo de vida do caso continuam sendo verificados.

O fluxo reutiliza reserva, política comercial, idempotência, recuperação e recibos existentes. Revisão concluída é cobrada inclusive quando não sugere alterações. Nenhuma proposta é aplicada automaticamente: decisões humanas e criação de nova versão são comandos separados.

## Publicação e ensaio autorizado

Publicar após build, testes e CI aprovados; conferir journal remoto, criar backup e aplicar somente a migration 0040; publicar API e serviço de encerramento preservando o editor comercial ativo e a migração automática desativada.

Após publicação, executar uma única revisão de peça sintética, com teto de R$ 5,00, sem aplicar sugestões. Recuperar o mesmo comando em caso de resposta incerta, sem repetir a cobrança. Resultado e recibo devem ser registrados como evidência efetiva, não presumidos a partir de testes locais.
