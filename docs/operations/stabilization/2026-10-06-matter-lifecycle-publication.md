# Publicação e homologação do ciclo de vida — 06/10/2026

## Integração e validação

A funcionalidade foi integrada pela [PR #51](https://github.com/junior-aguiar-eng/ForgeLex/pull/51), SHA `26c6b8c6fb6f68c6f3f3852053dd66d8ad8aeff9`. Os seis jobs passaram no head `7ac4953` ([CI 37540028655](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37540028655)) e no SHA integrado ([CI 37540924228](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37540924228)): validate, postgres, security, e2e-public, e2e-product e e2e-account-closure.

O PostgreSQL 16 executou oito verificações com barreiras transacionais reais: ambas as ordens de escrita, receipt e aprovação versus arquivamento; CAS; revogação OAuth sem restauração automática; exclusão de documento/caso. O restore usou `pg_dump` anterior à exclusão e `pg_restore`, reaplicando ambas as exclusões antes de abrir o gate. A CI anterior `37538629226` confirmou 754 unitários aprovados e 17 ignorados. Quatro E2E locais passaram após a correção final de buffer; outro passou para Escape/Cancelar, acessibilidade do diálogo e viewport 390 × 844.

## Publicação inicial

Cloud Build `d3e11b33-f2b9-4b90-9e6c-0670951302d3` concluído. Digest `sha256:c9b3639c81bd290a692b5d5aaf510b0037bfdc9cebb2820f83705607e5aeee25`. Backup Cloud SQL `1791325407137` concluído às 22:25:28.783Z. A execução `forgelex-lifecycle-migrate-5czbt` aplicou somente `persistence-0028-matter-lifecycle`, depois da CI integrada e do backup. `FORGELEX_AUTO_MIGRATE=false`, ingresso, identidade, recursos e limites do serviço foram preservados.

O journal externo usa o namespace separado `matter-lifecycle/`, no bucket já existente `forgelex-hml-closure-journal-bbbe1209`. Três secrets próprios e âncora assinada foram provisionados e verificados antes da candidata. As chaves locais temporárias foram removidas; as chaves e o journal duráveis devem ser preservados enquanto existirem backups recuperáveis.

A candidata `forgelex-api-prod-lifecycle-26c6b8c` foi identificada pelos logs nas dez rotas de smoke às 22:47:22.503Z. Três sondagens anteriores chegaram à revisão antiga e foram recusadas pelo controle de identidade. A passagem à nova revisão ocorreu sem alteração adicional da rota; a causa do atraso não foi comprovada.

As etapas de 5% e 25% passaram com 143 sondas cada e janelas de 133 e 138 segundos. Na primeira tentativa em 100%, todas as sondas responderam corretamente, mas uma falha de resolução DNS local impediu a consulta ao Logging; o controle retornou automaticamente à revisão anterior. A consulta recuperada comprovou 137 requisições exclusivamente na candidata e nenhum status diferente de 200. A repetição de 100% passou com 153 sondas, janela de 133 segundos e somente a nova revisão observada. Conclusão às 23:03:16.256Z, domínio `https://nexojuris.ia.br`. Rollback dessa publicação: `forgelex-api-prod-draft-ai-ebad9b2`, sem desfazer a migration aditiva.

Regra temporária, backend, NEG, tag da candidata e jobs de migration/inspeção foram removidos. Tags históricas e recursos duráveis foram preservados. A consulta aos logs dessa revisão, de 22:38Z até 23:18:31.914Z, não encontrou HTTP 5xx.

## Navegador, ChatGPT e Claude

As conexões OAuth existentes foram reutilizadas. Somente o caso inteiramente fictício `Homologação IA 05-10-2026 — caso sintético` e um documento da versão 1 foram compartilhados, sem permissão de envio ao editor. Ambos os hosts consultaram o manifesto inicialmente na revisão 5 da concessão.

| Ensaio | Resultado comprovado nos dois hosts |
|---|---|
| Arquivar o caso | Nova chamada `case.get_context` recusada |
| Restaurar sem nova autorização | Acesso continuou recusado |
| Nova autorização e envio à lixeira | Novas chamadas recusadas |
| Nova autorização e arquivamento de somente um documento | Manifesto e leitura direta por ID recusados; caso permaneceu em uso |

Todas as recusas retornaram `CASE_CONTEXT_NOT_AUTHORIZED`. A auditoria PostgreSQL corroborou duas consultas iniciais bem-sucedidas, oito consultas de manifesto recusadas e duas leituras diretas recusadas. As permissões terminaram `REVOKED`, revisão 10. Não houve pesquisa paga nem material real compartilhado.

No navegador, Escape cancelou o diálogo sem transição. Uma gravação tentada no caso arquivado foi recusada e a edição fictícia não salva permaneceu no editor; ela foi retirada após restaurar o caso, sem gravar versão nova. O controle em segundo plano não reproduziu a mudança de foco da segunda aba: a atualização por foco continua comprovada pelo E2E automatizado, enquanto esta rodada nativa comprovou a recusa no servidor e a preservação do buffer.

O documento arquivado continuou localizável para consulta humana da versão fixada. Quando enviado à lixeira, a conferência 3 indicou que a versão/trecho não estava disponível. Após restaurá-lo ao arquivo e depois ao uso, uma nova conferência 4 voltou a localizar a versão 1. Isso não constitui aprovação jurídica.

Boni confirmou pontualmente a exclusão definitiva apenas de `Documento excluído — homologação` (`homologacao-excluido.txt`). O site mostrou conclusão; o caso e `Documento permitido — homologação` foram preservados. A operação `386208468081d658f323435023cc41521299dea77e625eeac7a8ad950ec57f87` terminou `COMMITTED` no banco e `COMPLETED` no objeto terminal externo, às 23:12:06.299Z. A verificação canônica de resíduos em transação `READ ONLY` passou às 23:14:05.12Z: caso ativo revisão 4, documento preservado ativo revisão 4, documento excluído `PURGED` revisão 2. O rascunho manteve a versão atual 4 e quatro versões no histórico. Houve zero operações financeiras no sistema desde o início do ensaio, às 22:35Z.

## Limites

Não foi restaurada a base de produção; backup anterior, restore real e reaplicação foram ensaiados no PostgreSQL 16 da CI. A exclusão definitiva de caso foi coberta na CI e no E2E local; a operação nativa em produção atingiu somente o documento sintético confirmado. Cópias já incorporadas a rascunhos/fatos/notas não são reescritas, e registros financeiros não participam da exclusão. Backups antigos não são apagados retroativamente; o journal reaplica exclusões confirmadas antes de servir uma base restaurada.

[Recibo operacional sem segredos](2026-10-06-matter-lifecycle-publication.json). Evidências nativas e logs brutos permanecem no diretório local ignorado `.superpowers/sdd/2026-10-06-casos-documentos-ciclo-vida/`.

## Mensagens da interface e revisão final publicada

A [PR #52](https://github.com/junior-aguiar-eng/ForgeLex/pull/52) substituiu somente duas mensagens de listas vazias: cada filtro de casos/documentos explica agora se não há conteúdo em uso, arquivado ou na lixeira, sem referências a tokens ou nomes técnicos. Build web e ESLint locais passaram; os seis jobs passaram na [CI da PR](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37545567596) e na [CI integrada](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/37546148375).

SHA de código publicado: 326a96e2569d17e6462674f684197e02f03cdd98. Cloud Build 2363fe46-f0aa-45e4-821b-12353f3c07c8 concluído às 2026-10-06T23:26:35.4417160Z, imagem southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:05111103f1f3152e09068c48479ae5e41253f4edd72d2981f22238cfca66ad6b. Revisão forgelex-api-prod-lifecycle-ui-326a96e, com 100% do tráfego após smoke identificado e promoção 5/25/100, concluída às 2026-10-06T23:44:41.1490467Z. Rollback: forgelex-api-prod-lifecycle-26c6b8c. Não houve nova migration; configuração e journal foram preservados. A candidata iniciou após a exclusão sintética e passou pelo gate de reconciliação existente. Recursos temporários desta segunda publicação removidos às 2026-10-06T23:47:06.2233540Z.

A homologação nativa descrita acima ocorreu no código 26c6b8c; o diff posterior modifica apenas mensagens da interface. O recibo distingue ambas as publicações. As quatro mensagens de listas arquivadas/lixeiras vazias foram conferidas no navegador após a promoção; o caso sintético e o documento restante estavam em uso. Chamadas ao Compute excederam o limite durante criação e limpeza da rota de teste; os recursos e operações foram inspecionados e a execução retomada a partir do estado confirmado. Sondagens iniciais ainda atingiam a revisão anterior e foram recusadas pelo gate; o smoke posterior identificou somente a candidata, sem alteração adicional da rota. A causa desse intervalo não foi comprovada.
