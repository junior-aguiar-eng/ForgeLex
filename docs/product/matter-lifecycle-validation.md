# Ciclo de vida de casos e documentos — evidências

Data: 06/10/2026. Checkout isolado `draft-review/SDK`, branch
`codex/casos-documentos-ciclo-vida`, base `dbdc349`. PR #51.

## Implementação e revisão

Casos e documentos oferecem arquivo, lixeira, restauração e exclusão
definitiva pela sessão web. A revisão independente da branch inteira
identificou leitura indireta de fonte arquivada, catálogo IA sem filtro,
aviso incompleto sobre cópias anteriores e disputas de atualização da lista.
As correções foram implementadas e reavaliadas; não restaram achados abertos.

`7ef511c` restringe leitores indiretos e catálogo IA; `d6a0335` preserva
seleção com edição pendente e amplia concorrência PostgreSQL; `e1e147f`
protege edição durante resposta atrasada, troca de filtro e restauração
do caso retido. `26322bf` expõe os comandos de smoke e restore.

## Evidências comprovadas

| Ambiente / revisão | Resultado | Escopo |
|---|---|---|
| CI `37538629226`, `d6a0335` | Seis jobs aprovados | validate, postgres, security, e2e-public, e2e-product, e2e-account-closure |
| Unitários dessa CI | 754 aprovados, 17 ignorados | 146 arquivos aprovados, dois ignorados; lint, build e typecheck aprovados |
| PostgreSQL 16 dessa CI | Oito verificações aprovadas | Ambas as ordens de gravação, receipt e aprovação versus archive; CAS, revogação OAuth e purge |
| Backup PostgreSQL real | Aprovado | `pg_dump` antes de purge, `pg_restore`, reaplicação de documento e caso antes de abrir o gate |
| Windows, após `e1e147f` | Quatro E2E aprovados | Archive/trash/restore/purge, documento sem excluir o caso, edição em outra aba e resposta atrasada com restauração |
| Windows, ensaio adicional | Um E2E aprovado | Escape e Cancelar sem transição, diálogo acessível e viewport 390 × 844 |
| Windows, correção de buffer | Lint e `tsc --noEmit` aprovados | Tela de casos; build web aprovado |

O screenshot móvel foi inspecionado: diálogo cabe na tela, texto e ações
legíveis, sem corte horizontal. O Axe não encontrou violações no diálogo.
Os logs e screenshot locais ficam no diretório ignorado
`.superpowers/sdd/2026-10-06-casos-documentos-ciclo-vida/`.

A execução unitária serial adicional no Windows foi interrompida sem
resumo final; não constitui aprovação. A aprovação integral documentada
acima vem da CI Linux. Não havia PostgreSQL local disponível nesta rodada.

## Integração, publicação e homologação remota

PR #51 integrada em 26c6b8c: CI final da branch 37540028655 e CI integrada 37540924228 com seis jobs aprovados. Backup anterior e migration 0028 explícita concluídos; journal/âncora próprios verificados. Candidata identificada pelos logs e promoção 5/25/100 concluída.

ChatGPT e Claude foram homologados nas conexões reais, apenas com o caso sintético: ambos recusaram manifesto após arquivo/lixeira e leitura direta após arquivar o documento selecionado; restaurar não reativou o acesso. O navegador preservou edição não salva e o servidor recusou gravação no caso arquivado. A exclusão definitiva do documento fictício foi confirmada por Boni e comprovada no banco, no journal externo e pela verificação canônica de resíduos. Caso e outro documento foram preservados; rascunho continuou na versão 4 e houve zero operações financeiras na janela do teste.

A PR #52 altera apenas mensagens de filtros vazios. CI 37545567596 e CI integrada 37546148375 passaram nos seis jobs. Código publicado 326a96e2569d17e6462674f684197e02f03cdd98, revisão forgelex-api-prod-lifecycle-ui-326a96e, com 100% após nova promoção 5/25/100. Recursos temporários removidos.

Não houve restore de produção nem purge definitivo de caso em produção. Backup/restore e reaplicação passaram na CI PostgreSQL; purge definitivo de caso passou na CI e no E2E local. A atualização por foco da segunda aba foi comprovada pelo E2E automatizado; esta rodada nativa comprovou a recusa de gravação e a preservação do buffer.

[Evidências, horários, digests e limites](../operations/stabilization/2026-10-06-matter-lifecycle-publication.md).

Restaurar não reativa concessões IA. Excluir apenas um documento não apaga
trechos anteriormente copiados em rascunhos/fatos/notas. Backups antigos
não são apagados retroativamente: journal e chaves devem sobreviver a eles,
e exclusões confirmadas são reaplicadas antes de servir uma base restaurada.
