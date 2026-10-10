# ForgeLex — onde estamos e como continuar

Atualizado em 10/10/2026. Este resumo orienta a próxima sessão; o histórico de
validações e publicações permanece em [STATUS_VALIDACAO.md](STATUS_VALIDACAO.md).

Boni é o único avaliador e aprovador humano do projeto, por decisão expressa
de 10/10/2026. Nenhuma frente depende de segundo revisor ou parecer de terceiro;
aplica-se [AGENTS.md](AGENTS.md), inclusive sobre exigências de planos antigos.

## Incremento local autorizado — análise de documentos

Em 10/10, Boni autorizou implementar **Analisar documentos do caso**. A branch
`codex/case-document-analysis` acrescenta permissão específica com objetivo,
recebimento gratuito pelo MCP (`case.save_analysis`) e conferência no site:
abrir a fonte fixada, editar texto e incorporar ou descartar propostas.
Fatos não são confirmados automaticamente. O modelo continua no host externo.

Este incremento está local, com migration `persistence-0030-case-document-analysis`;
não houve commit, push, migration remota ou deploy nesta tarefa. O runtime
publicado descrito abaixo não representa esta capacidade nova.
[Procedimento e limites](docs/product/case-document-analysis.md) e
[plano de execução](docs/superpowers/plans/2026-10-10-case-document-analysis.md).

## Entregas anteriores

O backlog atual está em [PENDENCIAS.md](PENDENCIAS.md). A remediação da auditoria
foi integrada pela PR #58: correções técnicas e ponte direta Pesquisa → Caso.
O runtime desta entrega é `forgelex-api-prod-audit-5aca51e`, código `5aca51e`.
[Evidências e limites](docs/operations/stabilization/2026-10-07-audit-remediation.md).

A pendência de ativação técnica da retenção foi encerrada em 09/10, após
autorização explícita de Boni e duas execuções em modo apply, ambas sem conteúdo
elegível. A entrega residual adiciona mitigação local de braces e audit completo
na CI; o advisory upstream e as comprovações humanas continuam abertos.
[Registro de 09/10](docs/operations/stabilization/2026-10-09-audit-residual-closure.md).

O encerramento técnico seguinte foi integrado pela PR #61 em `86156a0`.
A medição do corpus real demonstrou custo de acesso aos metadados de versões;
a migration 0029 foi aplicada ao banco publicado após seis checks e revisão.
O plano usa o índice de cobertura, com zero Heap Fetches nessa etapa. Amostras
da mesma consulta ampla: 20,3 s antes, 13,3–16,5 s depois, resultados idênticos.
Não houve novo deploy HTTP. As correções executáveis do recorte auditado estão
encerradas; manutenção, dependências externas e comprovações humanas são
separadas no backlog.
[Medições, aplicação e limites](docs/operations/stabilization/2026-10-09-technical-pending-closure.md).

PR #60 reúne a entrega residual; o código `c0a2d3c` passou nos seis checks
obrigatórios, com 794 unitários e 130 E2E aprovados. Serviços PostgreSQL da CI
usam o espelho Docker Official Image no ECR Public. Sem novo deploy HTTP,
pois o comportamento de runtime não foi alterado por esse incremento.

## O produto hoje

O percurso é **caso → documentos → análise na IA externa → rascunho no site →
conferência das fontes → edição → versão salva → DOCX**. O ForgeLex conserva
documentos, versões, referências, permissões e histórico. ChatGPT/Claude fazem
a análise com sua própria conta, usando o MCP autorizado por caso. O envio de
texto depende de permissão específica; receber texto não significa aprovação
jurídica. A revisão humana continua necessária.

O produto STJ tem pesquisa, cobrança por operação, API e MCP. O estado canônico
marca as Fases 8 e 14 concluídas e a expansão para outros tribunais congelada.
Os pacotes de agentes/workflows existentes não tornam necessário hospedar um
modelo no site nem montar uma nova arquitetura. O documento V2 é uma visão
ampla; sua extensão não deve ser usada como uma lista de urgências.

## Publicado, local e futuro

As revisões nas evidências de cada incremento identificam suas publicações
originais. O runtime atual incorpora essas entregas e está indicado no início.

| Frente                                                       | Estado nesta consolidação                                          | Evidência e limite                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Contexto autorizado e retorno de texto por MCP               | Publicado; homologações anteriores em ChatGPT e Claude registradas | Recebimentos versionados, idempotência e adoção humana; ver STATUS                                                               |
| Arquivo, lixeira, restauração e exclusão                     | Publicado                                                          | Homologado em `forgelex-api-prod-lifecycle-ui-326a96e` com dados sintéticos; incluído na revisão atual do leitor                 |
| Leitura integral de documentos e abertura das fontes         | Publicado; percurso completo homologado em produção                | PR #54, revisão `forgelex-api-prod-reader-0dc9ec5`, 100%; Claude → versão 2 → DOCX inspecionado; permissões sintéticas revogadas |
| Identificação das conexões de IA no caso                     | Publicado; integração e promoção verificadas | PR #56, revisão `forgelex-api-prod-connection-a23cc07`, 100%; CI da PR e de main aprovada                     |
| Julgados da Pesquisa no caso                                 | Publicado; salvar, conferir fonte e reutilizar nos rascunhos | PR #58; CI com 130 E2E; runtime `forgelex-api-prod-audit-5aca51e`; sem nova pesquisa para salvar/copiar |
| Retenção operacional                                        | Limpeza diária às 8h, autenticada por OAuth, ativada em 09/10 | Autorização nominal; apply manual e via Scheduler concluídos com zero removidos; worker HTTP desabilitado; ver registro residual |
| Mesa do caso e orientação do próximo passo                   | Proposta futura                                                    | Organizar os recursos existentes em torno do caso, com detalhes técnicos sob demanda; não há execução autorizada nesta entrega   |
| Novos agentes internos, modelos hospedados e novos tribunais | Fora do incremento atual                                           | Exigem necessidade demonstrada e decisão própria; não bloqueiam o fluxo MCP externo                                              |

## A entrega encerrada

O leitor foi integrado e publicado, com testes, revisão independente e promoção
gradual aprovados. O caso sintético passou por leitura no Claude, retorno ao
rascunho, conferência da fonte, edição salva como versão 2 e exportação DOCX.
O arquivo indicado pelo usuário na área de trabalho foi inspecionado: versão 2,
edição de teste, seis referências à versão documental 1 e revisão humana pendente.
As duas permissões sintéticas foram revogadas; nova leitura pelo Claude recebeu
`CASE_CONTEXT_NOT_AUTHORIZED`. Caso, documento e rascunho foram preservados. O
[registro da entrega](docs/operations/stabilization/2026-10-07-document-reader-publication.md)
separa essas evidências.

A investigação da falha de conferência reproduziu um contexto desatualizado:
a conferência encontrava um fato que o painel ainda não tinha carregado. Abrir
um rascunho agora atualiza também o contexto do caso. O teste falhou antes da
correção e passou depois. Isso comprova esse defeito; não identifica, sozinho,
a ordem exata das respostas na primeira ocorrência intermitente.

## Cuidados para a próxima sessão

O percurso real encontrou uma dificuldade concreta: reconectar o Claude criou
uma nova conexão, enquanto a seleção sintética continuava autorizada na antiga.
Ambas apareciam como “Claude”. A leitura inicial retornou lista vazia; atualizar
as conexões, revogar a seleção antiga e selecionar a nova resolveu o ensaio.
O incremento de **identificar a conexão no fluxo do caso e orientar a reconexão**
foi implementado e enviado ao GitHub na branch `codex/case-ai-connection-identity`, com
nome/data/estado e detalhes sob demanda. A mudança invalida a prévia quando a
conexão escolhida muda e conserva o material para conferência, sem escolher ou
transferir permissões automaticamente. Foi integrado pela PR #56 em `a23cc07`
e publicado com 100% do tráfego; conferência da interface no caso sintético
sem concessão de novas permissões.
[Comportamento e limites da validação](docs/product/case-ai-connection-identity.md).

Casos já conservam julgados para teses, seções, citações e leitura autorizada
pela IA. A busca dentro do research memo salva as fontes no caso. A tela geral
Pesquisa oferece **Salvar julgado no caso** desde a publicação da PR #58.
O usuário escolhe um caso ativo; o acervo permite conferir a fonte e copiar a
citação. O vínculo conserva a proveniência e não decide a pertinência jurídica.

Registro anterior à remediação: o GitHub informou três alertas no lockfile em
07/10: `source-map-js` (alta, correção 1.2.2), `postcss-selector-parser`
(média, correção 7.1.6) e `braces` (alta, sem versão corrigida no alerta).
`pnpm why` localiza os três nas ferramentas de build do frontend; o Dockerfile
entrega a API com dependências de produção e o frontend como arquivos estáticos.
Não foi demonstrado caminho de exploração por entrada de usuário no servidor.
Na remediação, os dois primeiros foram corrigidos com build aprovado e CSS
idêntico. O alerta alto de `braces` permanece acompanhado, sem patch publicado
na consulta de 07/10. O audit de produção sem alertas não encerra esse residual.

Usar um checkout baseado em main e confirmar Git e revisão em produção.
Em 10/10, `C:/Users/Boni Jr/.antigravity-ide/SDK` passou à branch local
`codex/docs-repository-hygiene`, criada sobre `origin/main` (`117b7d0`).
A branch histórica `codex/p2-search-chunk-recovery` foi preservada com seus
três commits exclusivos e cópia recuperável. O checkout de main continua em
`C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`. Os registros antigos
não substituem o estado atual nem autorizam integrar diferenças históricas.
[Inventário, limpeza e recuperação](docs/operations/stabilization/2026-10-10-documentation-repository-hygiene.md).

## Consolidação documental e higiene local — 10/10/2026

README, índice e plano mestre foram reconciliados com as publicações atuais.
O status distingue as correções técnicas encerradas das comprovações humanas,
dependências externas e manutenção contínua. Branches locais já integradas e
fora de uso foram retiradas após inventário e bundle verificado; branches
vinculadas a worktrees e os dois históricos exclusivos foram preservados.
Os worktrees do app permanecem disponíveis; a vinculação do worktree
`document-reader` foi recusada por pertencer a outro chat. Boni autorizou
commit e push da revisão documental em `codex/docs-repository-hygiene`.
Integração em main, PR, migration e deploy ficam fora desta manutenção.

## Organização do repositório em 07/10 — registro anterior à publicação

- `main` local atualizado por fast-forward até `origin/main` (`9439524`),
  no checkout `draft-review/SDK`. Não houve integração de novas branches.
- Incremento de conexões: código `85d1c22`, em
  `codex/case-ai-connection-identity`, com documentação e validações locais.
- Pendências antigas dos P2: commits separados para busca, recuperação de
  páginas e registro histórico, na branch `codex/p2-search-chunk-recovery`.
  A base antiga não é o checkout para continuar novos incrementos.
- Duas propostas originais de 03/10 preservadas no commit `e2733f0`, branch
  `codex/datajud-workspace-publication`, claramente marcadas como históricas.
  As versões executadas continuam em main; não são tarefas novas.

O desenho de revisão/contexto/retorno e o plano de conferência foram reconciliados
com as publicações já registradas. Esta consolidação faz commit e push; não faz
PR, merge, migration ou deploy. As novas mudanças continuavam em branch naquele registro. A integração e
publicação posteriores da PR #56 estão no registro abaixo.

Referências: [plano de execução](Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md),
[comportamento do leitor](docs/product/document-reader.md) e
[última publicação anterior](docs/operations/stabilization/2026-10-06-matter-lifecycle-publication.md).

## Publicação do incremento das conexões

PR #56 integrada e publicada em 07/10/2026. CI da PR e de main: seis jobs
aprovados, 761 testes unitários (17 condicionais ignorados) e 127 E2E. Banco
temporário limpo automaticamente, candidata sem tráfego validada e promoção
5/25/100 concluída. Configuração preservada, sem migration.

[Registro e limites da publicação](docs/operations/stabilization/2026-10-07-case-ai-connection-publication.md).

## Publicação da remediação da auditoria

PR #58 integrada em `5aca51e`. CI da PR e de main com seis jobs aprovados;
764 unitários aprovados, 17 condicionais ignorados e 130 E2E em main.
Promoção 5/25/100 e configuração preservada, sem migration. Inspeção de retenção
diária às 8h, com duas execuções reais; somente leitura e zero elegíveis nas
medições. A reserva histórica foi classificada sem alterar saldo ou registros.

Este registro de 07/10 antecede a ativação autorizada de retenção em 09/10.
A autorização técnica de expurgo foi posteriormente registrada e executada;
as comprovações humanas seguem abertas em PENDENCIAS e não foram encerradas
por testes. A organização dos checkouts foi atualizada em 10/10 acima.
[Recibo, rollback e limites](docs/operations/stabilization/2026-10-07-audit-remediation-publication.md).
