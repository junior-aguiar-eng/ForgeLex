# Preparação de publicação — revisão editorial comercial

Preparado em 05/11/2026. Boni autorizou organizar os commits, enviar a branch,
abrir PR, acompanhar CI e preparar o deploy. Integração na `main`, migrations,
build remoto, deploy, ativação editorial e novas chamadas pagas não foram
executados nem são autorizados por este documento.

## Candidato e escopo

Branch `codex/forgelex-3-quality`, base `main`. A PR abrange a evolução ainda
não integrada: contexto de provas aprovadas, revisão humana de evidências,
entregas v9, geração/revisão/aplicação editorial versionada e integração à
política `commercial-brl-2026-10-30-v1`. A revisão concluída, validada e
persistida é cobrável mesmo sem sugestões, conforme decisão de Boni.

O SHA candidato é o HEAD da PR com todos os checks concluídos. O SHA de release
será o SHA integrado em `main`, a confirmar após autorização própria; não é
possível antecipar seu hash neste documento. Conferir a CI desse SHA antes do
build. Exigir checkout limpo da `main` igual a `origin/main`. O wrapper
`ops/gcp/production/build-from-main.ps1` verifica essas condições, mas só expõe
a opção de pesquisa salva: não transmite as flags de casos e workspace
agêntico. Portanto, não usá-lo sem adaptação para esta publicação. O caminho
usado no recibo de 02/11 é Cloud Build com `ops/gcp/production/cloudbuild.yaml`
e substituições explícitas; manter as mesmas verificações de SHA e checkout.
Conferir as três opções de frontend (`_VITE_FORGELEX_SAVED_RESEARCH_ENABLED`,
`_VITE_FORGELEX_CASE_WORKSPACE_ENABLED`, `_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED`),
historicamente `true`, com o build publicado e a decisão de Boni. Os defaults
do YAML são `false`. Registrar `_SOURCE_SHA`, `_IMAGE_URI` e as configurações
públicas Supabase necessárias, sem credenciais privadas no build.

## Inspeção remota somente leitura

Consultas via `gcloud` em 05/11/2026 confirmaram:

- Projeto `project-bbbe1209-c295-4720-867`, região `southamerica-east1`.
- Serviço `forgelex-api-prod`: 100% do tráfego na revisão
  `forgelex-api-prod-025f6dd-r2`.
- Serviço privado `forgelex-closure-hml-private`: 100% do tráfego na revisão
  `forgelex-closure-hml-private-025f6dd-r2`.
- Imagem atual:
  `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:4a5cec7d55e248e01ccca52f6da64ae0f895c068c9a93b3464c1cb0393fdf3c9`.
- Cloud SQL vinculado: `forgelex-hml-pg`. Apesar do nome, é o alvo produtivo.
  A referência de `DATABASE_URL` é `forgelex-hml-database-url`, versão 4;
  nenhum valor de segredo foi impresso ou incluído aqui.
- `FORGELEX_AUTO_MIGRATE=false`; flags de workspace agêntico, execução
  comercial e billing existentes estão `true`. A flag
  `FORGELEX_EDITORIAL_COMMERCIAL_ENABLED` está ausente na revisão inspecionada.
- Backup automático `1793847600000`, `SUCCESSFUL`, concluído às
  `2026-11-05T04:41:55.081Z`. Isso não substitui backup fresco antes do DDL
  nem comprova restauração testada desse backup.

O journal e as colunas do banco remoto não foram consultados nesta preparação.
O estado histórico documentado não prova quais migrations estão aplicadas hoje.

## Banco e sequência para uma publicação autorizada

O diff contra `main` acrescenta duas migrations aditivas, sem backfill:

| ID                                        | Alteração em `agentic_task_deliveries` |
| ----------------------------------------- | -------------------------------------- |
| `persistence-0037-native-evidence-review` | `evidence_review_json TEXT`, anulável  |
| `persistence-0038-editorial-human-review` | `editorial_review_json TEXT`, anulável |

A integração comercial de 05/11 reutiliza o ledger e os jobs existentes e não
acrescenta outra migration. Antes da operação, consultar em transação read-only
`SELECT id FROM forgelex_migrations ORDER BY id` e `information_schema.columns`
para as duas colunas. Comparar o journal inteiro com o artefato de release:
`pnpm db:migrate` aplica todas as pendências, não somente essas duas.

1. Registrar SHA integrado e CI, revisão/digest anterior, tráfego e flags atuais.
2. Confirmar o banco produtivo, pendências exatas e backup fresco `SUCCESSFUL`.
   A criação do backup e o DDL pertencem à autorização operacional futura.
3. Aplicar somente o conjunto aprovado pelo procedimento existente, com
   `FORGELEX_AUTO_MIGRATE=false`, `lock_timeout` de 3 s e
   `statement_timeout` de 120 s. Conferir journal, colunas e contagens antes/depois.
4. Construir a imagem pelo Cloud Build com as substituições acima e registrar o digest resultante.
   Criar candidata sem tráfego, com editor comercial desativado. Preservar
   conscientemente as flags comerciais já existentes; não copiar configurações
   históricas de homologação por inteiro.
5. Verificar readiness, autenticação, acesso às entregas existentes, isolamento,
   leitura de recibos e frontend, inclusive aba previamente aberta. Os testes
   sintéticos locais/CI não autorizam uma chamada real de modelo.
6. Atualizar também a candidata do serviço `forgelex-closure-hml-private`,
   responsável pelo encerramento de contas produtivas: a drenagem financeira
   agora reconhece comandos editoriais. Validar sua rota autenticada e seu
   digest; não ativar o editor com o serviço de encerramento ainda incompatível.
7. Após decisão de Boni sobre a evidência, promover o mesmo digest nos dois serviços. A ativação
   editorial é decisão separada: requer `FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=true`
   na composição comercial e, se desejado um ensaio real, autorização com teto.

## Reversão

Antes da primeira ativação editorial, manter a revisão anterior disponível e
registrar a configuração de tráfego. Se a candidata falhar, não promovê-la.
Após promoção, o retorno de tráfego à revisão anterior não desfaz o schema;
preservar as duas colunas aditivas e os registros, sem DROP ou baixa de ledger.

Após ativação, não remover a flag nem retornar a uma imagem antiga enquanto
houver comandos editoriais, leases ou reservas pendentes: a imagem anterior
não conhece o discriminador `editorial:`. Primeiro suspender novas admissões
por mecanismo operacional aprovado, concluir/cancelar cooperativamente os
comandos com o runtime compatível e conferir a liquidação. Se houver incerteza
de provedor, preservar a reserva e reconciliar; troca de tráfego não resolve
o ledger. Se não for possível drenar, manter runtime compatível e preparar
correção, em vez de executar rollback cego.

## Evidência e limites

[Validação local](../../architecture/2026-11-05-editorial-commercial-integration.md):
1.780 testes aprovados e 17 ignorados; 66 testes em PostgreSQL descartável e
15 de navegador. A CI passa a incluir explicitamente esses dois recortes.
Consultar o resultado do HEAD da PR; não transpor resultados de outro SHA.

O ensaio real anterior só produziu proposta vazia. Não há nova avaliação
semântica paga, homologação comercial em produção, benchmark de histórico
extenso, migration remota ou restauração produtiva nesta preparação.
Os US$ 0,083620 históricos de D04-v8 permanecem reservados.
