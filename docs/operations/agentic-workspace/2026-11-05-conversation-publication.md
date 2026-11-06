# Publicação das correções da mesa — 05/11/2026 (Fortaleza)

Autorização: Boni solicitou commit, push e deploy, mantendo o editor comercial desativado.

- PR #107 integrada: https://github.com/junior-aguiar-eng/ForgeLex/pull/107
- Fonte publicada: `ef818d6079999cf1cccc116afda6048aaaf4c7e2`.
- CI da PR `42135911480` e do merge `42137289150`: seis jobs aprovados em cada uma.
- A primeira CI encontrou um cenário de teste que aplicava 0039 sem a tabela base. Corrigido o conjunto histórico e adicionada a verificação da coluna; quatro testes locais de migration passaram e a CI completa posterior passou.
- Backup `1793924200076`: SUCCESSFUL, concluído em `2026-11-06T00:18:51.885Z` (UTC). Não foi executado ensaio de restauração desse backup.
- Migration `persistence-0039-conversation-history` aplicada em transação com lock_timeout 3s e statement_timeout 120s. Journal 51 → 52, sem pendências ou IDs inesperados. Três conversas e cinco mensagens preservadas; coluna `history_hidden_at TEXT` anulável. Conferência posterior read-only em nova transação.
- Cloud Build `fe0ffc3d-1b94-4475-8a45-1a8ec3567b08`: SUCCESS. Imagem construída de git archive; SHA-256 do arquivo `2376C0254A4A7BE78B6F51290BE98C939D49E1490150CA07BA793E2DACD5E449`.
- Digest publicado: `sha256:596089eb3d9b0a7c641e3afe19f1080e622a6136f3daea88bf397b0255ab8d66`.
- API: `forgelex-api-prod-ef818d6`, 100% do tráfego.
- Encerramento: `forgelex-closure-hml-private-ef818d6`, 100% do tráfego.
- Candidatas saudáveis sem tráfego antes da promoção. Comparação de configurações confirmou preservação das demais variáveis, referências a segredos, recursos, conta de execução e anotações. Editor comercial `false`, auto-migration `false` em ambos os serviços. Tags temporárias removidas; revisões anteriores preservadas.
- `/readyz?release=ef818d6`: 200, todos os checks verdadeiros. Reconciliador existente: 200 na nova revisão privada às `00:43:02.981792Z` e `00:44:02.979313Z` (UTC). Nenhum encerramento artificial disparado.
- Bundle publicado contém Automático e exclusão do histórico; não contém o antigo campo Contexto escrito (opcional). Interface autenticada não foi testada manualmente em produção; fluxos foram cobertos pelos testes de navegador locais e da CI.
- Consulta de logs das novas revisões: sem entradas de severidade ERROR ou superior, janela 15 minutos, limite 20. `/hub` respondeu 200 com hash preservado; `/ratione` respondeu 200 com hash diferente, destino separado conforme publicação anterior; causa não investigada nesta operação.
- Sem chamadas pagas a modelos, ativação editorial ou alterações de IAM/Scheduler.

Os números acima descrevem a publicação de 05/11/2026; a ativação posterior e
a conferência visual autenticada constam no
[recibo de 06/11/2026](2026-11-06-editorial-activation.md).
Este recibo documental é posterior ao SHA de código publicado.
