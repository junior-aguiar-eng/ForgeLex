# Reconciliação documental e higiene local — 10/10/2026

Escopo autorizado: reconciliar as entradas documentais com o estado publicado
e organizar branches/worktrees preservando registros históricos e trabalho
exclusivo. Base `origin/main`: `117b7d0d8cd3f86f6ea9fee9e544cf6049743081`.
Remoto: `https://github.com/junior-aguiar-eng/ForgeLex.git`.

## Estado confirmado e execução

A [CI de main](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/38004022329)
terminou com sucesso nos seis jobs. O serviço `forgelex-api-prod`, projeto
`project-bbbe1209-c295-4720-867`, região `southamerica-east1`, atende 100% do
tráfego em `forgelex-api-prod-audit-5aca51e`. `/readyz` e o shell de
`/app/consulta-processual`, com `Accept: text/html`, responderam 200.
Essas sondas não comprovaram autenticação de usuário, consulta real ao CNJ ou
um novo percurso E2E. A conferência foi somente leitura.

O checkout original estava limpo na branch P2 histórica; os três worktrees
vinculados também estavam limpos. Antes das mudanças, foi salvo inventário
de nomes, SHAs e upstreams das 58 branches e das quatro associações de
worktree. `git bundle create --branches` conservou o histórico completo;
`git bundle verify` confirmou a integridade estrutural e a ausência de
pré-requisitos de histórico.

O checkout original foi atualizado para uma nova branch documental criada
sobre `origin/main`: `codex/docs-repository-hygiene`. Foram retiradas 54
branches locais já integradas, sem checkout associado. Cada remoção conferiu
o SHA contra o bundle, ancestralidade em `origin/main` e ausência de uso por
worktree. O upstream das branches encerradas foi retirado antes de
`git branch -d`, permitindo a verificação contra HEAD baseado em main.
Não houve exclusão forçada ou remoção de branch remota.

README, índice de documentação, plano mestre, continuidade e backlog agora
distinguem entregas publicadas, correções técnicas encerradas e pendências
humanas/externas. O checklist operacional recebeu um adendo sobre a retenção
ativada em 09/10. Os registros históricos permanecem com seus limites originais.

## Inventário após a limpeza

| Branch local | Checkout e finalidade |
| --- | --- |
| `main` | `C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`; sincronizado com origin/main na base conferida |
| `codex/docs-repository-hygiene` | `C:/Users/Boni Jr/.antigravity-ide/SDK`; revisão documental local sobre a mesma base |
| `codex/technical-closure-evidence` | `C:/Users/Boni Jr/.codex/worktrees/document-reader/SDK`; entrega integrada, preservada por vínculo com outro chat |
| `codex/datajud-workspace-publication` | `C:/Users/Boni Jr/.codex/worktrees/document-io/SDK`; um commit exclusivo de preservação dos desenhos originais |
| `codex/p2-search-chunk-recovery` | Sem checkout associado; três commits históricos exclusivos, preservados localmente e no remoto |

Permanecem quatro checkouts válidos. O app recusou vincular `document-reader`
a este chat: `This worktree is owned by another task.` O arquivamento não
foi executado, e não se contornou essa restrição com remoção manual.
O worktree `document-io` conserva material histórico exclusivo. O checkout
de main e o checkout deste incremento continuam em uso.

Pastas ignoradas de dependências, builds e ensaios foram preservadas. Não foi
executado `git clean`; este registro não afirma eliminação física de todo
artefato local nem auditoria de segredos de todo o histórico.

## Cópia recuperável

A cópia está fora dos arquivos versionados, no diretório Git compartilhado:

```text
C:/Users/Boni Jr/.antigravity-ide/SDK/.git/hygiene-backups/2026-10-10-documentation/
  local-branches.bundle
  branches-before.txt
  worktrees-before.txt
  cleanup-candidates.txt
  branches-removed.json
```

SHA-256 do bundle:
`5EDA39A444D293DB91232BA4BCDF84495221819C2C585A9F27E3D730AE5E9CC0`.
O bundle contém as 58 referências anteriores; a branch nova não existia nessa
fotografia. `branches-removed.json` relaciona os 54 nomes e SHAs retirados.

Para recuperar uma branch ausente, consultar o inventário e usar seu nome
exato no lugar de `<nome>`; o comando recria somente a referência local:

```powershell
git fetch .git/hygiene-backups/2026-10-10-documentation/local-branches.bundle refs/heads/<nome>:refs/heads/<nome>
```

O tracking anterior consta em `branches-before.txt` e pode ser restabelecido
depois da recuperação. Não usar recuperação forçada sobre uma branch existente.

## Versionamento, validação e limites

Após a manutenção local, Boni autorizou commit e push na branch
`codex/docs-repository-hygiene`. A revisão documental permanece separada de
main; os SHAs e o envio são verificáveis pelo histórico Git da branch.
PR, merge, migration e deploy não integram esta autorização.

Validação documental concluída em oito arquivos: 103 links locais conferidos,
zero destinos ausentes, zero caracteres de substituição Unicode e nenhuma
das afirmações atuais obsoletas identificadas na auditoria. `git diff --check`
sem erros; alterações restritas a Markdown. Diff revisto contra os recibos de
publicação e os registros operacionais de 09/10.

Validação da limpeza concluída: as 58 referências anteriores estão no bundle,
os 54 nomes/SHAs retirados correspondem ao inventário e seus commits continuam
alcançáveis por origin/main. Os quatro commits exclusivos das duas branches
históricas mantêm os SHAs originais. Quatro worktrees existem; os três
checkouts não alterados continuam limpos. `git worktree prune --dry-run`
não apontou registros obsoletos.

Não foram executados testes automatizados do produto nesta manutenção
documental. A CI citada é a execução já concluída na base de main, não uma
validação desta revisão documental. Sem PR, merge, migration, deploy, expurgo,
alteração de saldo ou concessão de acesso MCP nesta entrega.
As comprovações humanas/externas continuam em [PENDENCIAS.md](../../../PENDENCIAS.md).
