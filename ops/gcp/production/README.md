# Fase 4B — promoção do ForgeLex

Autoridade e sequência: [decisão de topologia](../../../docs/operations/production/topology-decision.md).
Este runbook não autoriza execução remota por si só. O Cloud SQL e o Supabase
atuais são a autoridade das contas reais. Em 30/09/2026, as host rules foram
separadas e testadas; o registro da execução está em
[`2026-09-26-phase4b.md`](../../../docs/operations/stabilization/2026-09-26-phase4b.md).
O serviço antigo `forgelex-api-hml` permanece como fallback de produção.

## Pré-condições verificáveis

- Fases 4A e 4B integradas em `main`, CI verde no SHA final e checkout limpo.
- Orçamento Google Cloud e custo do novo Cloud SQL HML registrados e aprovados.
- Supabase HML `hhemvrxygfzbzpgmohfj` criado na organização `nexohub`,
  com contas sintéticas e destinado apenas a ensaios. Supabase de produção:
  projeto `mmywgqttfthtwntjkqgh`. Confirmar as
  [redirect URLs de Auth](https://supabase.com/docs/guides/auth/redirect-urls)
  antes do ensaio.
- Novo HML com banco, segredos, bucket e runtime próprios. O fallback
  `forgelex-api-hml` continua conectado aos dados de produção.
- Inventário anterior de URL map, certificados, backends, tráfego e digest salvo
  no registro da execução, sem valores de segredo.
- Janela de alteração e conta sintética de ensaio identificadas. Não executar
  compras ou encerramento em conta real para provar a promoção.

## Banco HML sob demanda

O Cloud SQL HML `forgelex-hml-isolated-pg` está isolado do banco produtivo,
com 20 GiB SSD, somente IP privado, backups e crescimento automático
desabilitados. Sua VPC é `forgelex-hml-vpc`, subnet
`forgelex-hml-sa-east1` em `southamerica-east1`. O serviço Cloud Run HML
usa Direct VPC egress nessa subnet. O banco fica parado por padrão;
inicie-o somente para configuração ou ensaio e pare após a verificação:

```powershell
gcloud sql instances patch forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --activation-policy=ALWAYS --quiet
gcloud sql instances describe forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --format='value(state,settings.activationPolicy)'
gcloud sql instances patch forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --activation-policy=NEVER --quiet
gcloud sql instances describe forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --format='value(state,settings.activationPolicy)'
```

Enquanto `STOPPED`, `/readyz` do serviço HML não passará. Não usar
essa indisponibilidade esperada para inferir falha de produção. Como não há
backup automático, o ambiente HML só pode conter fixtures e corpus
reconstituíveis. O SSD continua cobrado mesmo com a instância parada.

## Chave do provedor comercial (OpenAI): alerta, verificação e rotação

A mesa e as peças dependem de `OPENAI_API_KEY`, lida do segredo `forgelex-prod-openai-commercial-api-key`. Em 09/11/2026 a
chave ficou inválida e só se soube quando um cliente tentou uma peça (HTTP 401 da OpenAI). Três proteções:

- **Verificação leve:** o `/readyz` consulta `GET /v1/models` (sem custo) no máximo a cada 10 minutos, espera no máximo 1 s e
  grava `provider.key_invalid` em caso de 401. Nunca altera a prontidão: o site e o MCP funcionam sem a chave comercial.
  403 (chave restrita sem permissão de leitura de modelos) é `provider.key_unverifiable`, sem alerta.
- **Disparo periódico:** o `/readyz` só consulta a OpenAI quando alguém o acessa. Em 11/11/2026 (leitura do Cloud
  Monitoring) existe o Uptime Check “ForgeLex – disponibilidade pública”, que chama `https://nexojuris.ia.br/readyz` a
  cada 300 s, o que mantém a verificação leve rodando sem ação de cliente (no máximo 10 minutos entre consultas à
  OpenAI). Esse Uptime Check foi criado no console e **não está provisionado por script**. Ele aponta para o domínio
  atual: na virada de domínio (Frente D), recriá-lo no host novo antes de desligar o antigo. Os serviços só têm
  `startupProbe` em `/readyz`; não há sonda de vida. Conferir a existência com
  `gcloud monitoring uptime list-configs --project=<projeto>`.
  **Ainda não ensaiado:** chave inválida em homologação confirmando o log e o e-mail do alerta.
- **Alerta:** `provision-provider-alert.ps1` cria a política de log que avisa por e-mail em `provider.key_invalid` ou em
  `commercial_call_trace` com `failureClass=AUTHORIZATION`. Só cria; `-DryRun` mostra a política.
- **Segredo em `latest`:** `set-provider-secret-latest.ps1` troca a versão fixa por `latest`, com revisão sem tráfego,
  sonda pública e reversão automática. Depois disso, uma versão nova do segredo vale para as instâncias novas; para
  forçar já, publique com `deploy-from-main.ps1`, que parte do modelo do serviço e mantém `latest`.

```powershell
./ops/gcp/production/provision-provider-alert.ps1 -DryRun
./ops/gcp/production/set-provider-secret-latest.ps1 -DryRun
```

**Rotação** (a chave nunca passa por chat, log ou ticket): gerar a chave na OpenAI, gravar como nova versão do segredo,
conferir que `provider.key_invalid` não aparece e que uma chamada comercial fecha em `SETTLED`. Desabilite a versão
antiga do segredo depois. Com `latest`, uma versão nova com a chave errada derruba só o caminho comercial das instâncias
novas: o alerta avisa, e para desfazer basta desabilitar a versão ruim. Uma chamada recusada por autenticação acontece
antes do consumo e não exige reconciliação.

## Publicação em um comando

Com o `gcloud` autenticado no projeto do ForgeLex, o `gh` autenticado e um checkout limpo no SHA de
`origin/main` (PowerShell 7):

```powershell
./ops/gcp/production/deploy-from-main.ps1 -DryRun      # só lê e mostra o plano; não altera nada
./ops/gcp/production/deploy-from-main.ps1              # publica
./ops/gcp/production/deploy-from-main.ps1 -NoTraffic   # gera a imagem e as revisões, sem trocar o tráfego
```

O script confere o checkout e a CI do SHA, lê o estado de produção, reaproveita as substituições do último
build bem-sucedido (trocando só o SHA, inclusive as flags de interface `AGENTIC_WORKSPACE` e `CASE_WORKSPACE`),
gera a imagem, cria as revisões da API e do encerramento **sem tráfego**, confere que só a imagem e
`FORGELEX_SOURCE_SHA` mudaram, troca o tráfego (encerramento, depois API), verifica `/health`, `/readyz`,
`/mcp` sem token (deve dar 401) e a ausência de 5xx nos logs, e **reverte sozinho** se qualquer passo falhar.
Ao terminar, imprime os comandos de reversão e o que registrar no `PENDENCIAS.md`.

- **Não aplica migrations.** `FORGELEX_AUTO_MIGRATE` continua como está nos serviços. Se o SHA traz migration,
  faça backup e aplique-a pelo procedimento próprio antes de publicar.
- **Flags de execução da Mesa guiada.** `FORGELEX_DESK_GUIDANCE_ENABLED` e
  `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED` são variáveis do serviço da API no Cloud Run, não substituições do
  build; por isso o `cloudbuild.yaml` não as define. A ausência vale como desligada (só o valor exato `true`
  liga), e o deploy preserva o ambiente do serviço e recusa qualquer diferença além da imagem e de
  `FORGELEX_SOURCE_SHA`. O passo 3 do script informa o valor efetivo de cada uma, sem alterá-lo.
  Ordem obrigatória para ligar: (1) backup e migração `0041`, pelo procedimento de
  [`draft-save-recovery.md`](../../../docs/operations/draft-save-recovery.md); (2) conferir
  `persistence-0041-draft-save-commands` no registro de migrações; (3) só então ligar
  `FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED=true` na API. Com a flag ligada e sem a tabela, a API recusa subir; isso
  é intencional e o deploy reverte sozinho. A Mesa guiada (`FORGELEX_DESK_GUIDANCE_ENABLED`) liga em homologação
  antes da produção. Para trocar o valor, use um comando separado e autorizado por Boni
  (`gcloud run services update <serviço> --update-env-vars=NOME=true`) e reverta com `=false`.
- **Trocar uma flag de interface de propósito:** `-AgenticWorkspaceEnabled`, `-CaseWorkspaceEnabled` ou
  `-SavedResearchEnabled` (`true`/`false`). Sem elas, valem as do último build.
- **Repetir é seguro:** se a imagem e as revisões do SHA já existem, são reaproveitadas, e um serviço que já
  recebe 100% na revisão nova não é tocado.
- **Testes** (sem gcloud, sem rede): `pwsh -NoProfile -File ops/gcp/production/deploy-from-main.tests.ps1`.
  Rodam na CI.

## Build por SHA e inspeção do frontend

O `build-from-main.ps1` abaixo só gera a imagem. Ele exige `-AgenticWorkspaceEnabled` e `-CaseWorkspaceEnabled`
porque o `cloudbuild.yaml` assume `false` para as duas e o front sairia sem a mesa agêntica. No Windows, em
checkout limpo de `main`:

```powershell
./ops/gcp/production/build-from-main.ps1 -ProjectId 'project-bbbe1209-c295-4720-867' -ImageUri 'southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api' -SupabaseUrl 'https://mmywgqttfthtwntjkqgh.supabase.co' -SupabasePublishableKey '<chave publishable do projeto produtivo>'
```

O script recusa branch diferente de `main`, working tree sujo, SHA diferente
do `origin/main`, URL inválida e chave que não seja `sb_publishable_...`.
O Dockerfile recusa build sem configuração pública válida; após `pnpm build`,
confere que URL e chave aparecem no artefato e que não há `sb_secret_...` ou
JWT `service_role`. O teste imprime apenas aprovado/reprovado, nunca a chave.
Guardar o `sourceSha` e a referência `image@sha256:...` no registro do ensaio.
Não usar `latest` nem tag editorial como identidade de release.

O repositório `forgelex-prod` deve existir antes do build. O executor do build
precisa ter permissão de escrita no Artifact Registry; não usar credencial do
runtime para publicar imagens.

## Revisão candidata sem tráfego

Criar o serviço `forgelex-api-prod` no projeto e região do inventário. Usar a
imagem por digest, `min-instances=0`, concorrência inicial 20, máximo de 2,
`--no-traffic` e tag temporária de candidato. Vincular Cloud SQL atual,
runtime SA de produção e apenas versões de segredos necessárias. Copiar
configurações existentes por campo revisado, não importar indiscriminadamente
um export do serviço HML. Na revisão candidata, usar
`FORGELEX_BILLING_ENABLED=false` e `FORGELEX_AUTO_MIGRATE=false`, sem enviar
webhook externo. Em produção, a API apenas confere os IDs de migrations por
padrão e falha se algum estiver pendente; migrations exigem execução separada
e revisão antes do deploy. A revisão não
deve receber a host rule pública antes do ensaio.

Registrar as respostas e os IDs sintéticos de teste, sem payload jurídico ou
token de sessão:

| Prova | Critério |
| --- | --- |
| `/readyz` | 200 com dependências necessárias prontas e identidade da revisão candidata. |
| Banco | Consulta read-only e estado de migrations compatíveis com `main`; nenhuma migration implícita no boot. |
| Auth | Login da conta sintética no Supabase produtivo, sem expor token. |
| REST | Busca STJ com e sem resultado; sem débito na conta de ensaio. |
| MCP | Handshake, `search_case_law`, `get_authority` e `verify_citation` com token sintético. |
| Frontend | URL e chave publishable corretas no bundle; nenhum segredo. |
| Billing | Flag desabilitada na candidata e ausência de `usage_event` faturável para o ensaio. |

Depois do ensaio, promover uma revisão aprovada com billing configurado para
produção e imagem pelo **mesmo digest**. Validar a configuração final antes de
ligar a host rule da raiz. Uma revisão com billing desligado não é o release
comercial.

## Separação de hosts e rollback

Exportar o URL map atual antes de editar:

```powershell
gcloud compute url-maps export forgelex-api-hml-map --destination=<arquivo-de-evidencia-fora-do-repo>.yaml --global --project=project-bbbe1209-c295-4720-867
```

Criar backends/NEGs distintos para `forgelex-api-prod` e o novo serviço HML.
Adicionar host rules explícitas: raiz → backend produtivo; `hml` → backend HML.
Confirmar que não há fallback ambíguo no default service. O IP e os
certificados existentes permanecem; DNS não muda nesta sequência. Testar cada
host após a importação do URL map e registrar o nome da revisão atendida.

Para rollback HTTP, importar o export anterior do URL map ou restaurar somente
a host rule afetada, com a revisão antiga ainda pronta. A volta é segura para
dados porque ambos os serviços produtivos usam o **mesmo** Cloud SQL e Supabase.
Não reverter schema por troca de tráfego. Se houver escrita incompatível com a
revisão antiga, suspender a promoção e preparar migração de compatibilidade
antes de tentar rollback. O teste de ida e volta do URL map deve ser observado
no host real e documentado com horário, backend e revisão; um `Ready=True`
isolado não o substitui.

Após o ensaio, retirar a tag candidata se ela expuser endpoints de teste e
preservar o fallback até o gate de release. Jobs de ingestão e encerramento
com nomes históricos `hml` continuam produtivos enquanto conectados ao banco
atual; não duplicar Scheduler ao reclassificá-los.


## OAuth externo restrito ao MCP

Configure o servidor OAuth Supabase de produção com Site URL
`https://nexojuris.ia.br` e Authorization Path `/oauth/consent`. Mantenha
**Allow Dynamic OAuth Apps desativado**: o registro público ocorre no gateway
ForgeLex, que cria clientes confidenciais no Supabase. Não exponha seus
segredos nem os tokens nativos ao host.

A revisão candidata requer `FORGELEX_MCP_OAUTH_ENABLED=true`,
`FORGELEX_PUBLIC_URL=https://nexojuris.ia.br`, a configuração Supabase já
existente e `FORGELEX_MCP_OAUTH_ENCRYPTION_KEY` via Secret Manager. Essa chave
é aleatória, de 32 bytes codificados em base64; não é variável pública de
build. Sua troca invalida os envelopes de clientes e tokens previamente
emitidos, exigindo nova instalação das conexões.

A descoberta pública aponta para o gateway do próprio domínio. `/oauth/register`
aceita somente retornos HTTPS e tem limite por origem de requisição;
`/oauth/authorize` exige S256 e recurso MCP; `/oauth/callback` preserva o state
externo; `/oauth/token` cifra acesso e refresh. O PKCE externo é independente
do PKCE interno secreto. A API exige conta ativa e grant vigente em cada uso,
sem conceder escopos de casos, rascunhos, billing ou administração de chaves.

Após build local, `scripts/smoke-mcp-oauth.mjs` verifica o Supabase hospedado.
Informe `FORGELEX_SMOKE_SUPABASE_URL`, `FORGELEX_SMOKE_SUPABASE_PUBLIC` e
`FORGELEX_SMOKE_SUPABASE_SECRET` somente no ambiente temporário do processo.
O teste cria usuário e dois clientes sintéticos, verifica troca/refresh,
retorno A/B, adulteração plain, revogação e isolamento das credenciais,
e remove exclusivamente os objetos criados nessa execução. Não realiza
pesquisa jurídica nem envia mensagem de cadastro.

A prova no ChatGPT ou Claude é separada desse smoke. Instalação só está
confirmada quando o host conclui o retorno e exibe ferramentas; uso exige
chamada observada. `forgelex.connection_status` verifica gratuitamente o
acesso, sem consumir saldo. Aprovação e promoção de tráfego seguem os gates
vigentes; `Ready` e CI verde não provam instalação no host.
