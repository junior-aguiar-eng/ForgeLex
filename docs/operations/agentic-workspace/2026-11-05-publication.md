# Publicação de a5d9762 — 05/11/2026

Boni autorizou acompanhar a CI e, se aprovada, criar backup, aplicar as duas
migrations pendentes e publicar API e serviço de encerramento, mantendo o editor
comercial desativado. Operação concluída; horários abaixo em UTC.

## Fonte e validação

- PR #103 integrada; fonte `a5d97628f0a63e26f3c6eb72ba5cd4444a332ee9`.
- [CI do merge](https://github.com/junior-aguiar-eng/ForgeLex/actions/runs/42098128247):
  seis jobs aprovados antes das mutações operacionais.
- Build a partir de `git archive` desse SHA, sem arquivos locais.
- Cloud Build `179456fb-2a03-451c-a640-a406b824fa64`, `SUCCESS`, concluído
  às `20:11:03.973340Z`.
- Imagem dos dois serviços:
  `southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@sha256:f3dc33abbc8b38d09a9b1defa4acee4158d3ecb5cac083afa697a53737c31de5`.
- As três flags públicas de build de pesquisa salva, casos e workspace agêntico
  foram mantidas em `true`, a partir das substituições da publicação anterior.

## Backup e banco

Instância produtiva `forgelex-hml-pg`, banco `forgelex`, projeto
`project-bbbe1209-c295-4720-867`, região `southamerica-east1`.

Backup manual `1793909132283`, descrição vinculada ao release e às migrations,
concluído `SUCCESSFUL` às `20:07:44.118Z`. Não foi realizado ensaio de restauração
desse backup nesta operação.

Antes do DDL: 49 migrations aplicadas, sem IDs inesperados, somente 0037 e 0038
pendentes. Aplicadas em transação única com conferência explícita desse conjunto,
lock no journal, `lock_timeout=3s` e `statement_timeout=120s`:

- `persistence-0037-native-evidence-review`: `evidence_review_json TEXT`.
- `persistence-0038-editorial-human-review`: `editorial_review_json TEXT`.

Commit da transação confirmado às `20:08:09.005Z`. Ambas as colunas são anuláveis.
Contagens na mesma transação, antes e depois: uma entrega, duas minutas e seis
versões. A consulta posterior em nova transação read-only, às `20:08:36.051Z`,
confirmou 51 migrations, nenhuma pendência, nenhum ID inesperado e ambas as
colunas. O proxy local temporário foi encerrado; credenciais não foram gravadas
nos registros.

## Revisões e promoção

| Serviço      | Revisão anterior                          | Revisão publicada, 100%                | Promoção        |
| ------------ | ----------------------------------------- | -------------------------------------- | --------------- |
| API          | `forgelex-api-prod-025f6dd-r2`            | `forgelex-api-prod-a5d9762`            | `20:13:42.289Z` |
| Encerramento | `forgelex-closure-hml-private-025f6dd-r2` | `forgelex-closure-hml-private-a5d9762` | `20:13:33.355Z` |

Candidatas inicialmente sem tráfego. Foram adicionadas tags temporárias
`rel-a5d9762` para ativar as revisões e observar a inicialização; removidas após
a promoção. As revisões anteriores foram preservadas.

Alterações de configuração: imagem, `FORGELEX_SOURCE_SHA`, flag editorial
explicitamente `false` e startup probe HTTP `/readyz` na porta 8080, período
10 s, timeout 5 s e limiar de 24 falhas. A comparação por hash da especificação
restante confirmou preservação das demais variáveis, referências a segredos,
recursos e conta de execução. `FORGELEX_AUTO_MIGRATE=false` nos dois serviços.
Não houve alteração de IAM, URL map ou Scheduler.

O editor comercial continua desativado nos dois serviços:
`FORGELEX_EDITORIAL_COMMERCIAL_ENABLED=false`.

## Verificações observadas

- Startup HTTP `/readyz` aprovado nas duas candidatas antes da promoção:
  encerramento às `20:12:38.161Z`, API às `20:12:46.822Z`. Ambas apresentaram
  `Ready=True`, `Active=True` e `ContainerHealthy=True`.
- Após promoção, `/readyz?release=a5d9762` retornou 200, `status=ready`, com
  persistence, migrations, billing, source, auth, outbox e verificações de
  restauração verdadeiros. Log vinculado à revisão nova da API às `20:13:49.844Z`.
- `/` retornou 200; GET `/mcp`, 405; POST initialize sem credencial, 401.
- `/hub` e `/ratione`: 200 e hashes dos corpos iguais à linha de base anterior.
- O Scheduler existente chamou `/api/internal/account-closure/reconcile` na
  revisão nova do serviço privado às `20:14:02.978Z` e `20:15:02.956Z`, ambos 200.
  Não foi disparado encerramento artificial nem houve impersonação nesta operação.
- Consulta delimitada de logs das duas revisões, janela de 15 minutos, limite
  30, sem entradas de severidade ERROR ou superior. Na inicialização da API
  apareceram avisos `MaxListenersExceededWarning` em streams PassThrough; isso
  não demonstra vazamento de memória e sua causa não foi investigada neste deploy.
- Estado final: 100% nas novas revisões, mesmo digest, flag editorial `false`,
  nenhuma tag temporária remanescente.

Não houve nova chamada paga de modelo nos testes de publicação. Não foi
realizado teste autenticado completo da interface, de aba previamente aberta
ou avaliação jurídica de geração nesta operação. Readiness e HTTP 200 do
reconciliador não demonstram o processamento de um encerramento real.

## Retorno de tráfego

Se necessário e autorizado, retornar primeiro o serviço privado e a API às
respectivas revisões `025f6dd-r2`, preservadas. Não remover colunas, journals ou
reservas financeiras; as migrations são aditivas. O editor não foi ativado.

```powershell
gcloud run services update-traffic forgelex-closure-hml-private --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-closure-hml-private-025f6dd-r2=100
gcloud run services update-traffic forgelex-api-prod --project=project-bbbe1209-c295-4720-867 --region=southamerica-east1 --to-revisions=forgelex-api-prod-025f6dd-r2=100
```

Este recibo foi preparado após a publicação e integra uma atualização documental
separada do SHA de código publicado.
