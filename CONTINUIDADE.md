# ForgeLex — onde estamos e como continuar

Atualizado em 07/10/2026. Este resumo orienta a próxima sessão; o histórico de
validações e publicações permanece em [STATUS_VALIDACAO.md](STATUS_VALIDACAO.md).

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

| Frente                                                       | Estado nesta consolidação                                          | Evidência e limite                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Contexto autorizado e retorno de texto por MCP               | Publicado; homologações anteriores em ChatGPT e Claude registradas | Recebimentos versionados, idempotência e adoção humana; ver STATUS                                                               |
| Arquivo, lixeira, restauração e exclusão                     | Publicado                                                          | Homologado em `forgelex-api-prod-lifecycle-ui-326a96e` com dados sintéticos; incluído na revisão atual do leitor                 |
| Leitura integral de documentos e abertura das fontes         | Publicado; percurso completo homologado em produção                | PR #54, revisão `forgelex-api-prod-reader-0dc9ec5`, 100%; Claude → versão 2 → DOCX inspecionado; permissões sintéticas revogadas |
| Identificação das conexões de IA no caso                     | Publicado; integração e promoção verificadas | PR #56, revisão `forgelex-api-prod-connection-a23cc07`, 100%; CI da PR e de main aprovada                     |
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
Pesquisa ainda não tem **Salvar julgado no caso**; essa ponte direta é uma
lacuna de interface para um incremento próprio.

Manutenção separada: o GitHub informou três alertas abertos no lockfile em
07/10: `source-map-js` (alta, correção 1.2.2), `postcss-selector-parser`
(média, correção 7.1.6) e `braces` (alta, sem versão corrigida no alerta).
`pnpm why` localiza os três nas ferramentas de build do frontend; o Dockerfile
entrega a API com dependências de produção e o frontend como arquivos estáticos.
Não foi demonstrado caminho de exploração por entrada de usuário no servidor.
Avaliar atualização/substituição compatível e revalidar o build em uma frente
própria; o job de segurança da CI passou, o que não encerra esses alertas.

Usar um checkout alinhado com main e confirmar Git e revisão em produção. O
checkout antigo `C:/Users/Boni Jr/.antigravity-ide/SDK`, branch
`codex/p2-search-chunk-recovery`, contém trabalho antigo agora commitado e
enviado ao GitHub, separado do incremento atual. Seus registros de 02/10
não substituem o estado atual. As principais correções
de recuperação de tela e busca já existem em main; as diferenças residuais
precisam de comparação antes de reutilizar ou descartar qualquer arquivo.

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
