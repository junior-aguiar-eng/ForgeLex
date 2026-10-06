# Registro local do recebimento de textos da IA

Esta seção registra a validação local anterior à integração. CI, publicação
e homologação real foram concluídas posteriormente em 06/10/2026;
[evidências e limites](../operations/stabilization/2026-10-06-draft-ai-publication.md).

Data: 06/10/2026. Checkout: `C:/Users/Boni Jr/.codex/worktrees/draft-review/SDK`.
Branch: `codex/retorno-producao-ia`; remoto: ForgeLex; base: `9e74b7f29ccc2be04d0a702c541149ea0d789875`.
Último commit de código validado: `aeeabb14b67c118591cb76bd4ad707bdeb0b8502`.
O checkout original SDK e suas alterações independentes foram preservados.

## Provas executadas

| Verificação | Resultado final |
|---|---|
| `pnpm lint` | Sem erros ou avisos |
| `pnpm build` | Todos os pacotes concluídos |
| `pnpm -r run typecheck` | Todos os projetos concluídos |
| `pnpm exec vitest run` | 711 aprovados, 17 ignorados; 131 arquivos aprovados, 2 ignorados |
| `pnpm test:e2e:case-ai` | 5 aprovados |
| `pnpm test:e2e:draft-review` | 8 aprovados |
| `pnpm test:e2e:documents` | 4 aprovados |
| `node scripts/smoke-draft-ai-postgres.mjs` | 13 verificações aprovadas |
| URL PostgreSQL remota no runner | Saída 2 antes de conectar |
| `git diff --check` | Sem problemas de whitespace |

PostgreSQL exclusivo desta tarefa: container `forgelex-draft-ai-test-20261006`, bind `127.0.0.1:55439`, versão **16.15**. Somente tenant e casos sintéticos. Migrations executadas duas vezes; env de conexão definida somente no processo do smoke. A limpeza deixou zero recibos desse tenant. O container foi removido ao encerrar a execução local.

As 13 verificações cobrem migration, recebimento antigo desabilitado, dois envios simultâneos com uma chave, payload divergente, versão documental fixada/derivação humana/proveniência entre revisores, estado aprovado preservado, numeração humana/externa, adoção comparada/histórico, rollback sem órfãos, cancelamento aguardando bloqueio real, revogação anterior ao commit, commit anterior à revogação e restauração/exclusão de recibos. Barreiras sinalizam aquisição/tentativa de UPDATE transacional; não dependem de sleeps para ordenar a disputa.

Uma rodada da suíte unitária falhou na exclusão do arquivo temporário SQLite da consulta jurisprudencial (EPERM no Windows), apesar de todas as asserções passarem. A falha foi reproduzida isoladamente. O teste de consulta passou a usar SQLite em memória; sua regressão isolada e duas execuções completas posteriores passaram.

Após as correções finais, o teste de Escape apresentou um timeout pontual aguardando a requisição da fonte. Passou isoladamente e na repetição integral de oito testes, sem alteração adicional do produto. A causa desse timeout não foi comprovada. Os resultados finais acima correspondem às repetições concluídas.

## Revisão independente e correções

A revisão única, somente leitura, avaliou `9e74b7f..7cb239c` contra a especificação/plano e os rulings. Não encontrou ponto crítico. Os três importantes foram corrigidos em uma passagem de testes RED→GREEN:

- Outro revisor autorizado recebia referências vazias e hash diferente. O teste falhou com array vazio; passou com fontes/hash iguais. Resolução interna da proveniência usa tenant/caso/rascunho/versão. Listagem privada e adoção continuam restritas ao proprietário, com testes de negação.
- Um conflito de adoção com buffer limpo conservava o texto antigo, mas habilitava a revisão da versão nova. O E2E falhou com o botão habilitado; passou com divergência sinalizada e revisão bloqueada, preservando o texto até salvar/abrir conscientemente.
- Ordinal não sequencial exibido como “Seção 1” criava citação no ordinal zero. O E2E falhou com POST 400; passou com POST 200 e posição visual correta. A escolha é sincronizada ao carregar/adotar e validada antes de adicionar.

O novo teste também reproduziu fontes ausentes ao abrir pelo recibo: a seleção automática do rascunho invalidava a consulta ainda pendente do caso. A abertura passou a aguardar o contexto carregado; o mesmo cenário passou com a fonte selecionável e a citação salva. A regressão final inclui todas essas correções. Conforme o workflow de execução sequencial, não houve uma segunda revisão independente; a prova dos reparos é RED→GREEN seguida das suítes completas.

Ponto menor adiado: o editor apresenta origem IA, versão e data, mas não o rótulo específico da conexão. A identidade do aplicativo já está no recibo; o rótulo futuro será metadado declarado, sem afirmar identidade comercial verificada.

## Decisões adotadas e limites

- Migration aditiva SQL compartilhada pelos dois drivers. Ambos passaram; uma incompatibilidade futura exigiria adaptação antes de integração.
- Recibos entram na lista comum de purge/verificação de resíduos. Não existe catálogo separado de snapshot no módulo de conta. Se um catálogo próprio for criado, ele também precisará incluir os recibos.
- Títulos de seção aceitam um caractere, conforme entrada aprovada; citações sem texto suficiente usam o título da fonte do caso. Se um consumidor depender do mínimo anterior de três caracteres, sua validação precisará acompanhar essa ampliação.
- O site possui ingestão PDF e exportação DOCX. A regressão PDF cobre ingestão; não foi criado um novo exportador PDF. Se a intenção for exportar PDF, isso permanece um incremento separado. A revisão independente confirmou esse recorte.
- A fixture de consulta usa SQLite em memória para eliminar a limpeza de arquivo bloqueado no Windows. Reabertura/persistência física não era objeto desse teste; comportamento específico de arquivo fica fora dessa cobertura. A revisão independente confirmou essa decisão.
- Integração, CI remota, migration de produção, deploy e homologação real são gates posteriores. Permanecer no escopo local conserva a produção; o custo é aguardar essas etapas antes de disponibilizar a escrita ao cliente. A revisão independente confirmou essa separação.

A CI foi configurada para rodar o smoke no serviço PostgreSQL 16 existente; não se afirma sua execução remota. Autenticação dos navegadores e MCP foi sintética. Nenhuma nova concessão OAuth real, geração paga, pesquisa faturável ou documento pessoal foi usada. As homologações anteriores de leitura no ChatGPT/Claude não comprovam esta nova escrita.
