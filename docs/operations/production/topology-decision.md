# Fase 4B — autoridade de produção e separação de homologação

Data do inventário: 2026-09-26. Checkout de preparação: `feat/production-topology-4b`,
partindo de `bb6cb7258c8dec45f75ac8f98be1abf6a9a44ab7`. Esta decisão não
declara que a troca de tráfego ou o novo ambiente HML já ocorreram.

## Decisão

**Promover formalmente o plano de dados atual a produção e criar uma nova
homologação isolada por serviço, banco, identidade, segredos e Supabase.** Boni
determinou que a produção reutilize o projeto Supabase
`mmywgqttfthtwntjkqgh` (`https://mmywgqttfthtwntjkqgh.supabase.co`). O
Cloud SQL `forgelex-hml-pg` também já recebe operações de contas reais, billing
e encerramento pelo domínio público. Copiar esse banco para uma produção nova
exigiria corte de escrita e sincronização ou perda de transações no rollback.
Preservá-lo como autoridade evita essa migração de dados durante a Fase 4B.

O projeto Google Cloud `project-bbbe1209-c295-4720-867` permanece como plano de
controle dos dois ambientes. A separação de dados e de runtime será feita
dentro dele. Esse compartilhamento de IAM, quotas e faturamento é uma limitação
explícita; uma migração futura para projetos GCP separados exigirá outro gate.
Até a separação, `hml.nexojuris.ia.br` é um alias do serviço que atende contas
reais e **não pode receber ensaios destrutivos**. O serviço atual de nome
`forgelex-api-hml` torna-se fallback de produção, apesar do nome histórico;
não deve ser repontado ao banco novo de HML.

### Comparação das alternativas

| Alternativa                                       | Efeito sobre contas e billing existentes                                                       | Rollback de dados                                                         | Decisão               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| Nova produção com Cloud SQL e Supabase novos      | Exige migração de contas e transações; contradiz a reutilização do Supabase definida por Boni. | Uma volta após novas escritas exigiria reconciliação.                     | Rejeitada nesta fase. |
| Nova produção com Cloud SQL novo e Supabase atual | Mantém Auth, mas exige corte ou replicação do banco transacional atual.                        | Arriscado após a primeira escrita no banco novo.                          | Rejeitada nesta fase. |
| Autoridade de dados atual como produção; HML novo | Mantém IDs, saldos e encerramentos; HML recebe somente dados sintéticos.                       | Troca de backend HTTP pode voltar ao serviço atual sem reversão de banco. | Escolhida.            |

## Inventário observado

| Componente        | Estado em 2026-09-26                                                                                                                                                              | Autoridade após separação                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS               | `nexojuris.ia.br` e `hml.nexojuris.ia.br` resolvem para `34.160.73.22`.                                                                                                           | Nomes permanecem; URL map separa os hosts.                                                                                                                                 |
| HTTPS LB          | `forgelex-api-hml-https-rule` → proxy com certificados ativos dos dois domínios → URL map `forgelex-api-hml-map` → backend único `forgelex-api-hml-backend` → NEG do serviço HML. | Backend produtivo dedicado para a raiz; backend HML dedicado para o subdomínio. O backend antigo fica como rollback.                                                       |
| Cloud Run         | `forgelex-api-hml-00021-max` recebe 100% do tráfego; imagem de tag editorial `closure-release-f10e13f`. Serviço privado `forgelex-closure-hml-private-00010-q6s`.                 | Novo serviço `forgelex-api-prod`, imagem por digest, mais novo serviço HML separado. O serviço antigo continua apontando aos dados produtivos até desativação controlada.  |
| Cloud SQL         | `forgelex-hml-pg`, PostgreSQL 16, `db-f1-micro`, zonal, SSD de 49 GiB, backup diário às 03:00 UTC, retenção configurada por 7 cópias.                                             | Instância atual é produtiva, mesmo com nome histórico; `forgelex-hml-isolated-pg` foi criada vazia e parada em 30/09/2026 para HML.                                        |
| Supabase          | Projeto `mmywgqttfthtwntjkqgh`, região `sa-east-1`, ativo.                                                                                                                        | Produção continua nesse projeto; `hhemvrxygfzbzpgmohfj` foi criado vazio para HML, sem copiar contas reais.                                                                |
| Storage           | `forgelex-hml-closure-journal-bbbe1209` em `southamerica-east1`; bucket de Cloud Build em `US`.                                                                                   | Diário atual continua vinculado às contas reais. O bucket HML isolado `forgelex-hml-isolated-closure-journal-bbbe1209` foi criado vazio; suas chaves ainda faltam.         |
| Schedulers        | Reconciliação de encerramento a cada minuto e ingestão STJ diária às 09:00 de Fortaleza.                                                                                          | Jobs atuais afetam o banco produtivo; devem receber classificação e runbooks de produção. HML terá jobs separados somente após fixture e validação.                        |
| Secrets e IAM     | Segredos e identidades atuais têm prefixo `hml`; seis contas de serviço dedicadas/geradas foram listadas.                                                                         | Identidades `forgelex-api-prod` e `forgelex-api-hml-isolated` criadas; só a primeira recebeu acesso restrito a quatro segredos atuais. Não copiar valores entre ambientes. |
| Artifact Registry | Repositório Docker `forgelex-hml` em `southamerica-east1`.                                                                                                                        | `forgelex-prod` criado para imagem por SHA de `main` e digest fixo.                                                                                                        |

O projeto Supabase atual também contém tabelas de aplicação, billing e
encerramento. O nome `hml` de recursos existentes não demonstra que seus dados
sejam descartáveis. Valores dos segredos, chaves privadas e payload jurídico
não fazem parte deste inventário.

**Gate de acesso Supabase:** uma consulta read-only ao catálogo PostgreSQL
mostrou as 46 tabelas de `public` sem RLS e com `SELECT` para `anon` e
`authenticated`, inclusive `billing_accounts`, `billing_invoices`,
`billing_payments`, `billing_purchases`, `forgelex_tenants` e
`forgelex_user_profiles`. ACLs amostradas também concedem escrita. Uma chamada
ao Data API sem recuperar linhas (`limit=0`) retornou `503 PGRST002`, então
o acesso HTTP efetivo não foi demonstrado. O projeto não deve ser tratado como
revisado para produção antes de confirmar a configuração de schemas expostos
e remover grants não necessários ou habilitar RLS com políticas de propriedade.
O app observado usa Supabase diretamente para Auth; a compatibilidade de
eventuais outros clientes ainda precisa ser verificada. Após autorização de
Boni, `ops/gcp/production/supabase-public-access-hardening.sql` foi aplicada:
46/46 tabelas com RLS, nenhuma com `SELECT` para `anon` ou `authenticated`, e
46/46 ainda acessíveis por `service_role`. Os privilégios padrão para objetos
criados por `postgres` foram restringidos. Os privilégios padrão de
`supabase_admin` permanecem e exigem auditoria de novos objetos criados por
essa role. O advisor agora informa 46 tabelas com RLS sem políticas e mantém
o aviso de proteção contra senhas vazadas desabilitada.

## Recursos, escala, orçamento e custos antes do provisionamento

1. Em 30/09/2026, após autorização de Boni, as APIs Cloud Billing e Cloud
   Billing Budget foram habilitadas. O projeto tem faturamento ativo na conta
   `01F613-01A496-ECFAFD` (BRL). O orçamento mensal existente de **R$ 100**
   cobre a conta inteira, sem filtro por projeto, com alertas em 50%, 90%,
   100% e 150%. Um [orçamento de alertas não limita a despesa](https://docs.cloud.google.com/billing/docs/how-to/budgets).
   A despesa efetiva do mês ainda não foi apurada; a API de catálogo e a lista
   de orçamentos não a informam, e não há dataset de exportação BigQuery no
   projeto.
2. O [catálogo de preços](https://cloud.google.com/billing/docs/how-to/get-pricing-information)
   consultado em BRL para Cloud SQL PostgreSQL zonal em São Paulo mostrou
   `db-f1-micro` a R$ 0,092751165/h, SSD a R$ 1,496933367/GiB.mês e backups
   a R$ 0,704439231/GiB.mês. Para 730 h, a base de uma nova instância HML
   com 10 GiB SSD seria **R$ 82,68/mês**; com 20 GiB, **R$ 97,65/mês**,
   excluindo backups, IP, rede e outros recursos. São estimativas de preço de
   tabela, não valores faturados nem teto. A instância atual provisiona 49 GiB,
   e a métrica de uso marcou 8,57 GiB em 30/09/2026; reproduzir o corpus em
   10 GiB deixaria pouca folga. O preço varia com máquina, armazenamento e uso;
   Boni aprovou 20 GiB sob demanda e a instância HML foi criada em 30/09/2026.
   Para reduzir gasto fora dos ensaios, uma HML sob demanda poderia ser
   interrompida com `activationPolicy=NEVER`; a [documentação do Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance)
   confirma que a cobrança da instância para, mas armazenamento e endereço IP
   continuam cobrados. Essa opção deixa HML indisponível enquanto parada e
   exige operação explícita de início antes de cada validação. Não foi
   implementada em `forgelex-hml-isolated-pg`. O banco foi criado com
   PostgreSQL 16, `db-f1-micro`, 20 GiB SSD, sem crescimento automático e sem
   backups, com proteção contra exclusão. Estado final confirmado:
   `STOPPED`, `activationPolicy=NEVER`. O SSD de 20 GiB tem base de tabela de
   R$ 29,94/mês mesmo com a instância parada; isso exclui outros custos.
   Como um IP público reservado continuaria cobrado, a instância usa apenas
   IP privado pela VPC `forgelex-hml-vpc`, subnet
   `forgelex-hml-sa-east1` (`10.60.0.0/24`) e peering de serviços com a faixa
   `forgelex-hml-psa` (`10.61.0.0/16`). O Cloud Run HML precisará de
   [Direct VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
   nessa subnet. O banco está vazio, sem contas reais. Backups desabilitados
   significam que a HML deve ser reconstruível a partir de fixtures e corpus
   permitido; não guardar ali dados cuja perda não possa ser tolerada.
   [`db-f1-micro` não possui SLA de Cloud SQL](https://cloud.google.com/sql/pricing)
   e não deve ser adotado por simples cópia do ambiente atual.
3. O novo Supabase HML é o segundo projeto ativo da organização `nexohub`
   no plano Free; a ferramenta retornou custo recorrente estimado de **US$ 0/mês**
   para criação do projeto, confirmado por Boni. O projeto `ForgeLex HML`
   (`hhemvrxygfzbzpgmohfj`, `https://hhemvrxygfzbzpgmohfj.supabase.co`)
   foi criado em `sa-east-1` e está `ACTIVE_HEALTHY`, com zero usuários Auth e
   nenhuma tabela no schema `public` na leitura inicial. Isso não cobre
   crescimento ou eventual mudança de plano. O plano Free permite [dois
   projetos ativos](https://supabase.com/docs/guides/platform/billing-faq).
4. Reutilizar o encaminhamento HTTPS atual e criar host rules, evitando um
   segundo forwarding rule; confirmar cobrança de [processamento de dados](https://cloud.google.com/load-balancing/pricing),
   Cloud Run, Cloud SQL, Artifact Registry, Secret Manager, Storage, Scheduler
   e Monitoring antes da ativação. Cloud Run produtivo: concorrência inicial
   20, máximo de 2 instâncias e mínimo 0, sujeitos a revisão por carga real.
5. Criar identidades separadas para runtime HML, deploy, ingestão e encerramento;
   limitar acesso a segredos específicos e ao banco correspondente. Guardar
   somente referências a segredos no manifesto de deploy.

## Sequência de promoção e rollback

1. Integrar a Fase 4A e esta preparação em `main` com CI verde no SHA final.
   Registrar o SHA de `origin/main` e assegurar working tree limpo.
2. Construir a imagem a partir desse SHA, com URL e chave **publishable** do
   Supabase produtivo. Validar o bundle sem imprimir valores. Registrar tag SHA
   e digest; o serviço Cloud Run usa somente o digest.
3. Criar `forgelex-api-prod` apontando ao Cloud SQL e Supabase atuais, com
   billing desligado na revisão candidata e sem tráfego do load balancer.
   Validar `/readyz`, conexão de banco, Auth com conta sintética, REST e MCP;
   registrar que a conta de ensaio não gerou cobrança. O host público segue no
   backend antigo.
4. Provisionar HML novo: Cloud SQL, Supabase, bucket, segredos, runtime e jobs
   separados; carregar somente fixtures sintéticas e o corpus STJ necessário.
   Validar HML diretamente antes de alterar o URL map. Nenhuma restauração de
   conta real deve ser usada como seed.
5. Alterar apenas a host rule de `hml.nexojuris.ia.br` para o backend HML novo;
   verificar certificado, Auth, `/readyz`, REST e MCP no subdomínio. Registrar
   backend anterior para reversão.
6. Ativar a revisão produtiva aprovada e alterar apenas a host rule da raiz
   para `forgelex-api-prod`; verificar `/readyz`, Auth, REST, MCP e webhook.
   Rollback HTTP: restaurar a host rule da raiz ao backend antigo, que continua
   usando o mesmo banco e Supabase produtivos. Rollback de schema só é permitido
   quando a migration tiver contrato reversível comprovado; nenhuma migration
   deve ocorrer nesta troca de tráfego.
7. Depois do período de observação, reclassificar ou substituir os jobs e
   segredos com nomes históricos `hml`, sem duplicar agendas e sem apagar o
   fallback antes do gate de release.

Cada mudança no URL map, IAM, banco, Auth ou billing requer registro de estado
anterior e posterior. `Ready=True` e HTTP 200, isoladamente, não comprovam
login, débito, MCP nem rollback. O teste de retorno à revisão anterior ainda
não foi executado.
