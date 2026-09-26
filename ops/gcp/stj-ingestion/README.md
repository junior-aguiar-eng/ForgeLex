# STJ Open Data: ingestão periódica em homologação

O contêiner executa um único processo e termina; não expõe HTTP nem compartilha
o ciclo de vida da API. `--incremental` consulta o catálogo oficial e processa
somente `resource_id` ainda sem manifesto concluído. A lacuna oficial terminal
registrada permanece ignorada. `--single-flight` mantém um advisory lock no
PostgreSQL durante toda a execução; uma segunda execução falha com
`STJ_INGESTION_ALREADY_RUNNING`, sem ingerir dados. O job não aplica migrations:
o schema deve estar pronto antes da primeira execução.
O modo incremental recusa um banco sem ao menos um manifesto STJ concluído
(`STJ_INGESTION_BASELINE_REQUIRED`); a carga histórica inicial é um gate
separado.

## Preparação e ensaio

1. Confirmar projeto, região, instância, schema e contagens atuais; criar uma
   identidade dedicada ao job com `roles/cloudsql.client` no projeto e acesso
   apenas ao segredo de `DATABASE_URL`. Preferir uma credencial PostgreSQL
   dedicada às tabelas de ingestão e jurisprudência. No ensaio de 2026-09-26,
   foi referenciado o segredo já existente de homologação, sem ler seu valor;
   a criação de um principal de banco exclusivo permanece como endurecimento
   de acesso. O valor do segredo deve apontar ao
   socket `/cloudsql/<PROJECT>:<REGION>:<INSTANCE>`; não passá-lo em argumentos,
   logs, substituições de build ou arquivos versionados.
2. Construir a imagem a partir do checkout revisado:

   ```sh
   gcloud builds submit . --config=ops/gcp/stj-ingestion/cloudbuild.yaml \
     --substitutions=_IMAGE_URI=REGION-docker.pkg.dev/PROJECT/REPOSITORY/forgelex-stj-ingestion,_IMAGE_TAG=COMMIT_SHA
   ```

3. Criar o Cloud Run Job com a imagem por digest, uma tarefa, sem retries e
   timeout revisado. O serviço da API permanece intacto:

   ```sh
   gcloud run jobs create forgelex-stj-ingestion-hml \
     --region=REGION --image=IMAGE_AT_DIGEST \
     --service-account=INGESTION_SA \
     --set-cloudsql-instances=PROJECT:REGION:INSTANCE \
     --set-secrets=DATABASE_URL=INGESTION_DATABASE_SECRET:latest \
     --tasks=1 --parallelism=1 --max-retries=0 \
     --task-timeout=3600s --memory=2Gi
   ```

4. Registrar snapshot anterior de `jurisprudence_source_manifests`,
   `jurisprudence_documents` e `jurisprudence_document_versions`. Executar
   `gcloud run jobs execute forgelex-stj-ingestion-hml --region=REGION --wait`
   duas vezes, uma após a outra. Confirmar que a primeira só cria manifestos
   de recursos novos e que a segunda não cria manifesto, documento ou versão.
   Registrar IDs das execuções, horário, digest e diferenças de contagem. Não
   publicar números estimados como observados.
5. Executar `node scripts/report-stj-freshness.mjs` com `DATABASE_URL` presente
   somente no ambiente seguro. O JSON expõe apenas datas e contagens. Código 1
   significa atraso/falha; código 2 significa que o relatório não pôde ser
   produzido. `FORGELEX_STJ_MAX_LAG_HOURS` controla o limite (48 h por padrão).

## Agendamento e alerta

Após as duas execuções e reconciliação, criar uma conta separada para o
Scheduler com `roles/run.invoker` apenas no job. A frequência inicial é diária,
fora do horário de backup; o lock impede sobreposição mesmo em chamadas manuais:

```sh
gcloud scheduler jobs create http forgelex-stj-ingestion-daily \
  --location=REGION --schedule="0 9 * * *" --time-zone="America/Fortaleza" \
  --uri="https://run.googleapis.com/v2/projects/PROJECT/locations/REGION/jobs/forgelex-stj-ingestion-hml:run" \
  --http-method=POST --oauth-service-account-email=SCHEDULER_SA
```

Criar uma política de Monitoring sobre
`run.googleapis.com/job/completed_execution_count` para o recurso
`cloud_run_job`, filtrando o resultado de falha e o nome desse job. Associar um
canal de notificação verificado. Testar a política com uma falha controlada e
confirmar a notificação recebida; uma política sem canal não cumpre o gate de
alerta. Monitorar também a ausência de execução concluída por mais de 48 h
com o relatório read-only. Não agendar enquanto qualquer desses gates falhar.

## Limites

O modo incremental considera o `resource_id` concluído como imutável. Ele não
detecta alteração retroativa de bytes sob o mesmo ID; uma reconciliação
periódica sem `--incremental`, em janela controlada, deve conferir hashes antes
de declarar cobertura completa. `lagHours` mede o tempo desde a última
execução concluída, e `lastSuccessfulManifestAt` mostra separadamente a última
publicação de recurso. Nenhum dos dois, isoladamente, prova que o STJ publicou
um novo recurso ou que todo o acervo interno do tribunal está coberto.
