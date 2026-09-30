# Fase 4B — promoção do ForgeLex

Autoridade e sequência: [decisão de topologia](../../../docs/operations/production/topology-decision.md).
Este runbook não autoriza execução remota por si só. O Cloud SQL e o Supabase
atuais são a autoridade das contas reais; `hml.nexojuris.ia.br` ainda aponta
ao mesmo serviço que a raiz até a host rule ser separada.

## Pré-condições verificáveis

- Fases 4A e 4B integradas em `main`, CI verde no SHA final e checkout limpo.
- Orçamento Google Cloud e custo do novo Cloud SQL HML registrados e aprovados.
- Supabase HML `hhemvrxygfzbzpgmohfj` criado na organização `nexohub`,
  ainda vazio e destinado apenas a contas sintéticas. Supabase de produção:
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
deverá usar Direct VPC egress nessa subnet. O banco está parado por padrão;
inicie-o somente para configuração ou ensaio e pare após a verificação:

```powershell
gcloud sql instances patch forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --activation-policy=ALWAYS --quiet
gcloud sql instances describe forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --format='value(state,settings.activationPolicy)'
gcloud sql instances patch forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --activation-policy=NEVER --quiet
gcloud sql instances describe forgelex-hml-isolated-pg --project=project-bbbe1209-c295-4720-867 --format='value(state,settings.activationPolicy)'
```

Enquanto `STOPPED`, `/readyz` do futuro serviço HML não passará. Não usar
essa indisponibilidade esperada para inferir falha de produção. Como não há
backup automático, o ambiente HML só pode conter fixtures e corpus
reconstituíveis. O SSD continua cobrado mesmo com a instância parada.

## Build por SHA e inspeção do frontend

No Windows, em checkout limpo de `main`:

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
