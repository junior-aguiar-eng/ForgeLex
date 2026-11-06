# Ativação editorial e conferência da mesa — 06/11/2026

Boni autorizou publicar o recibo das correções, atualizar a documentação e
ativar o editor comercial. A autorização atual substitui a determinação de
mantê-lo desativado registrada nas publicações anteriores.

## Configuração publicada

Ativação por configuração, sem alteração de código, nova imagem ou migration.
Fonte `ef818d6079999cf1cccc116afda6048aaaf4c7e2`, da
[PR #107](https://github.com/junior-aguiar-eng/ForgeLex/pull/107).
Imagem dos dois serviços:
`southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:596089eb3d9b0a7c641e3afe19f1080e622a6136f3daea88bf397b0255ab8d66`.

- API: `forgelex-api-prod-ef818d6-ed1`, 100% do tráfego.
- Encerramento: `forgelex-closure-hml-private-ef818d6-ed1`, 100% do tráfego.
- `FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=true` em ambos.
- `FORGELEX_AUTO_MIGRATE=false` preservado.

Candidatas verificadas sem tráfego antes da promoção, primeiro no serviço de
encerramento e depois na API. A comparação das especificações confirmou que
somente a flag editorial mudou: imagem, fonte, demais variáveis, referências a
segredos, recursos e conta de execução foram preservados. Tags temporárias
removidas; revisões anteriores preservadas. Não houve mudança de IAM ou Scheduler.

A composição comercial mantém confirmação de cobrança por trabalho, reserva e
limites da política aprovada. Revisão concluída sem sugestões também é cobrada,
conforme decisão anterior de Boni. Ativação não implica aplicação automática
de alterações à peça.

Após a promoção, `/readyz?activation=editorial-ef818d6` respondeu 200 com todos
os checks verdadeiros. O Scheduler existente recebeu 200 do reconciliador na
nova revisão privada às `14:17:03.124714Z` e `14:18:03.046490Z` (UTC).
Leitura autenticada da entrega e de seu recibo retornou 200 na nova API.
Consulta das duas revisões, janela de 15 minutos e limite 20, não encontrou
entradas de severidade ERROR ou superior. Isso não demonstra processamento
de encerramento real nem conclusão de revisão editorial paga.

## Conferência visual autenticada

Conferência manual em produção na sessão existente, incluindo desktop
1440 × 1000 e celular 390 × 844:

- Histórico lateral aberto no desktop, com controles de exclusão e acesso às
  conversas excluídas; nenhuma conversa foi removida neste ensaio.
- Caixa única de pedido, seletor Automático e opção Pesquisar uma questão
  legíveis; abrir o contexto do caso não apresentou a antiga caixa Contexto escrito.
- Editor ao lado da conversa. Texto sintético digitado apenas localmente foi
  preservado ao recolher/reabrir a peça e depois apagado, sem salvar no servidor.
- Menu Word/PDF conferido visualmente. Nenhum arquivo foi exportado neste ensaio.
- Conversa sintética existente reaberta; alternância Conversa/Peça conferida no
  celular e viewport restaurado ao final.

Não houve chamada paga, envio de pedido à IA ou alteração de peça persistida.
A entrega sintética existente não estava vinculada a caso/minuta salva; portanto,
não foi usado esse registro para conferir ou executar uma revisão comercial.
A confirmação, cobrança e aplicação editorial continuam sustentadas pelos testes
automatizados já aprovados, sem novo ensaio pago nesta ativação.

## Retorno da configuração

Se necessário, retornar primeiro o serviço privado e depois a API às revisões
`forgelex-closure-hml-private-ef818d6` e `forgelex-api-prod-ef818d6`, que mantêm
o editor desativado. A migration 0039 e os registros existentes devem ser
preservados; não há reversão de banco associada à ativação.

O backup, a aplicação da migration e a CI do código publicado estão no
[recibo da publicação](2026-11-05-conversation-publication.md).
