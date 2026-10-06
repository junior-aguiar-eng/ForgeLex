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

## Gates remotos

A CI do SHA final precisa concluir antes da integração. A produção ainda
usa `forgelex-api-prod-draft-ai-ebad9b2` com 100% do tráfego, confirmado
por consulta ao Cloud Run nesta rodada; a implementação não foi publicada
por esse registro.

Publicação exige backup anterior à migration `persistence-0028-matter-lifecycle`,
secrets e âncora lifecycle independentes do banco, candidata identificada e
promoção com evidência de tráfego. Não substituir isso por `readyz=200`.
Homologação nativa no ChatGPT e Claude desta funcionalidade ainda não ocorreu.

Restaurar não reativa concessões IA. Excluir apenas um documento não apaga
trechos anteriormente copiados em rascunhos/fatos/notas. Backups antigos
não são apagados retroativamente: journal e chaves devem sobreviver a eles,
e exclusões confirmadas são reaplicadas antes de servir uma base restaurada.
