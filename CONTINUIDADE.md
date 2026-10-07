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

| Frente | Estado nesta consolidação | Evidência e limite |
| --- | --- | --- |
| Contexto autorizado e retorno de texto por MCP | Publicado; homologações anteriores em ChatGPT e Claude registradas | Recebimentos versionados, idempotência e adoção humana; ver STATUS |
| Arquivo, lixeira, restauração e exclusão | Publicado | Revisão `forgelex-api-prod-lifecycle-ui-326a96e`, 100% do tráfego confirmado em 07/10; homologação anterior somente com dados sintéticos |
| Leitura integral de documentos e abertura das fontes | Implementação local em fechamento | Branch `codex/document-reader`; publicação e percurso real serão registrados após execução |
| Mesa do caso e orientação do próximo passo | Proposta futura | Organizar os recursos existentes em torno do caso, com detalhes técnicos sob demanda; não há execução autorizada nesta entrega |
| Novos agentes internos, modelos hospedados e novos tribunais | Fora do incremento atual | Exigem necessidade demonstrada e decisão própria; não bloqueiam o fluxo MCP externo |

## O trabalho em andamento

Fechar o leitor com testes e revisão independente, integrar em main e publicar
preservando configuração/rollback. Em seguida, percorrer um caso totalmente
sintético com IA externa, retorno, fonte citada, edição e exportação. Registrar
os pontos de atrito observados antes de escolher qualquer nova implementação.

A investigação da falha de conferência reproduziu um contexto desatualizado:
a conferência encontrava um fato que o painel ainda não tinha carregado. Abrir
um rascunho agora atualiza também o contexto do caso. O teste falhou antes da
correção e passou depois. Isso comprova esse defeito; não identifica, sozinho,
a ordem exata das respostas na primeira ocorrência intermitente.

## Cuidados para a próxima sessão

Usar um checkout alinhado com main e confirmar Git e revisão em produção. O
checkout antigo `C:/Users/Boni Jr/.antigravity-ide/SDK`, branch
`codex/p2-search-chunk-recovery`, contém trabalho antigo preservado. Seus
registros de outubro 2 não substituem o estado atual. As principais correções
de recuperação de tela e busca já existem em main; as diferenças residuais
precisam de comparação antes de reutilizar ou descartar qualquer arquivo.

Referências: [plano de execução](Plano%20de%20conclus%C3%A3o%20progressiva%20do%20F.md),
[comportamento do leitor](docs/product/document-reader.md) e
[última publicação anterior](docs/operations/stabilization/2026-10-06-matter-lifecycle-publication.md).
