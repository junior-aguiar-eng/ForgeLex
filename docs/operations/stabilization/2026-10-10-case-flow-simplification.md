# Simplificação do ciclo documental — entrega local de 10/10/2026

Boni aprovou a especificação e o plano neste chat. Implementação no checkout
SDK, branch `codex/case-flow-simplification`, working tree sobre
`101ee331fc621ebf38fd536a549c38b0f9340d12`. O incremento anterior de análise
documental já está nesse commit e em `origin/codex/case-document-analysis`;
main local/origin permanece em `f5f9316`. Este registro não declara integração,
publicação, migration remota ou homologação de host externo.

## Execução das seis tarefas

1. Aprovação no editor por sessão autenticada, com confirmação explícita da
   versão e dos avisos. Recuperação da mesma solicitação pendente rotaciona o
   token sem estender validade ou criar versão. Consumo condicional sob lock
   impede resolução com hash anterior; token bruto não é persistido/auditado.
   OAuth/API key não aprovam. A fila encaminha ao editor com caso/versão.
2. Cabeçalho Documentos e análise → Conferência → Texto e conclusão. URLs
   transportam caso, análise e rascunho; mudança de página e voltar/avançar
   protegem edição não salva. Nenhum identificador concede permissão.
3. Prévia automática do material selecionado, permissão explícita e ação
   Autorizar e copiar instrução. Erro de clipboard permite copiar novamente
   sem conceder outra permissão. Listas de retornos atualizam em foco e a cada
   30 segundos enquanto visíveis, por até dez minutos, sem geração faturável.
4. Propostas em leitura por padrão, edição localizada e decisões por item ou
   lote. Prova com fato pendente exige seleção e confirmação explícitas; fontes,
   versões, divergências, lacunas e decisões anteriores continuam disponíveis.
5. Uma ação principal conforme estado: criar, salvar e conferir, conferir,
   aprovar ou baixar. Fontes, vínculos, cadastro manual, verificações concluídas
   e histórico ficam em painéis progressivos. Avisos/bloqueios permanecem
   destacados; DOCX usa exclusivamente a versão salva.
6. Cenário E2E do ciclo completo, incluindo leitura da fonte, edição, descarte,
   incorporação, texto recebido por MCP, navegação protegida, revisão,
   falha/recarga/recuperação de aprovação e download. Dados e host são sintéticos.

O caminho defensivo `APPROVAL_TOKEN_REQUIRED` do cliente de operações foi
mantido; a interface deixou de oferecer aprovação direta de rascunho por esse
caminho. A revisão automatizada final não apontou defeito material novo; é
apoio técnico, não dependência de outro aprovador humano.

O plano original preserva checklists de teste prévio: não foram marcados como
executados retroativamente. Este registro informa o comportamento implementado
junto às verificações efetivamente realizadas.

## Medição da interface

Comparação da versão `101ee33` e working tree no mesmo banco local, caso
`Ciclo completo — cobrança fictícia`, rascunho aprovado v3, quatro seções,
nove referências, três avisos e treze verificações concluídas. Viewport de
990 × 664; painéis recolhidos em ambas. Foram contados elementos HTML `button`
renderizados fora de `details` fechados, na página inteira (inclui conteúdo
abaixo da dobra), não somente dentro do viewport. Menus e lista de casos
mantidos iguais; não se contam `summary` como `button`.

| Medida | Anterior | Nova | Redução |
| --- | ---: | ---: | ---: |
| Botões renderizados | 42 | 17 | 59,5% |
| Botões + summaries renderizados | 44 | 28 | 36,4% |

Os summaries aumentaram de dois para onze: ocultam ferramentas opcionais,
mas continuam sendo controles acionáveis. Portanto 59,5% não significa
redução equivalente de todos os controles interativos ou de complexidade.

O trecho mecânico seleção pronta → permissão/instrução → abrir análise recebida
passou de seis ações (prévia, permitir, copiar, fechar, atualizar, conferir)
para três (autorizar e copiar, fechar, conferir), com chegada da lista
atualizada automaticamente. Não se incluem seleção, checkboxes de permissão,
objetivo, execução no host, leitura das fontes nem decisões jurídicas.
A meta de reduzir 40% dos cliques do ciclo integral ainda não foi demonstrada
por benchmark comparável; a aprovação antiga não concluía pela interface.
Não foi medido ganho de latência da IA externa.

## Validação

- `pnpm exec vitest run --maxWorkers=1 --testTimeout=15000`: 829 aprovados,
  17 ignorados, 156 arquivos aprovados e dois ignorados; exit code zero.
- Build monorepo e build final da web: concluídos; tipos dos pacotes, tipos da
  web e lint geral/focado concluídos sem erros. A web não possui script
  `typecheck`; sua verificação usa `tsc` e também integra o build.
- `pnpm test:e2e:case-flow`: 24 E2E aprovados em Chromium, exit code zero,
  incluindo ciclo completo, mobile, ausência de overflow e auditorias axe
  no diálogo de permissão, leitor e revisão; não certifica WCAG global.
- `node scripts/smoke-draft-ai-postgres.mjs` após build, com banco temporário
  PostgreSQL 16 local: treze checks aprovados (exit code zero), incluindo
  recuperação/rotação/concorrência de aprovação no check de versão aprovada,
  rollback, autorização e conservação do histórico.

Os ensaios anteriores tiveram falhas de seletores/estado de fixture e timeout
sob carga; uma abertura de catálogo concorrente com prévia foi corrigida
com fila automática, e o harness integrado passou a habilitar o journal
sintético de exclusão já existente. As causas e a execução final são
distinguidas dos resultados verdes.
Após esgotamento de buffer de rede do navegador (`ERR_NO_BUFFER_SPACE`) em
uma rodada com módulos de desenvolvimento, o E2E integrado passou a executar
build e servir a web compilada. Cache, build e banco usam diretório temporário
isolado, evitando interferência com a prévia. Os seletores de pontos de revisão
foram delimitados ao cartão para não capturar todos os controles do novo grupo. A suíte unitária final usa um worker e timeout de 15 segundos;
nenhuma expectativa é removida para acomodar carga local.

## Limites e estado de publicação

A revogação feita nesta tela interrompe a espera local; revogação remota é
observada quando a API negar a operação. Leitura histórica já autorizada à
sessão não implica erro de listagem após revogação de OAuth. Não se apresenta
esse mecanismo como detecção instantânea de todas as alterações externas.

Prévia local: web `127.0.0.1:3300`, API `127.0.0.1:3301`, autenticação sintética
`127.0.0.1:15531`, SQLite `.git/case-analysis-preview.sqlite`. O caso anterior
foi preservado. Captura local: `.git/case-flow-final.jpg`; logs finais em
`.git/case-flow-*.log`, incluindo `case-flow-unit-final.log`,
`case-flow-e2e-final-approved.log` e `case-flow-postgres-final.log`. Esses
artefatos operacionais são ignorados pelo Git.
O container PostgreSQL temporário `forgelex-case-flow-pg` foi removido após
os checks; outros containers foram preservados. A cópia da versão anterior
em `Temp/forgelex-case-flow-baseline-101ee33` permanece fora do checkout:
a política de execução bloqueou sua remoção; não entra no commit.
Sem commit, push, PR, deploy ou migration remota deste incremento.
