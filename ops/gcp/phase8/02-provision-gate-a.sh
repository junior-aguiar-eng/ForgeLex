#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${FORGELEX_PHASE8_CONFIG:-$(dirname "$0")/config.env}"
source "$CONFIG_FILE"
: "${COMMIT_SHA:?COMMIT_SHA_REQUIRED}"
: "${FORGELEX_PHASE8_DB_PASSWORD:?DB_PASSWORD_REQUIRED}"
: "${FORGELEX_PHASE8_WEBHOOK_MASTER_KEY:?WEBHOOK_MASTER_KEY_REQUIRED}"
: "${FORGELEX_PHASE8_METRICS_TOKEN:?METRICS_TOKEN_REQUIRED}"
test "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT_ID" || { echo "PROJECT_MISMATCH" >&2; exit 1; }

LABELS="env=homologation,phase=8,app=forgelex"
RUNTIME_EMAIL="$RUNTIME_SA@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOY_EMAIL="$DEPLOY_SA@$PROJECT_ID.iam.gserviceaccount.com"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPOSITORY/$SERVICE"

gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com compute.googleapis.com logging.googleapis.com --project="$PROJECT_ID"

gcloud artifacts repositories describe "$AR_REPOSITORY" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud artifacts repositories create "$AR_REPOSITORY" --repository-format=docker --location="$REGION" --labels="$LABELS" --project="$PROJECT_ID"
gcloud iam service-accounts describe "$RUNTIME_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud iam service-accounts create "$RUNTIME_SA" --display-name="ForgeLex HML runtime phase8" --project="$PROJECT_ID"
gcloud iam service-accounts describe "$DEPLOY_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud iam service-accounts create "$DEPLOY_SA" --display-name="ForgeLex HML deploy phase8" --project="$PROJECT_ID"

for role in roles/cloudsql.client roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME_EMAIL" --role="$role" --condition=None --quiet >/dev/null
done
for role in roles/artifactregistry.writer roles/cloudbuild.builds.editor roles/run.admin roles/cloudsql.admin roles/secretmanager.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOY_EMAIL" --role="$role" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" --member="serviceAccount:$DEPLOY_EMAIL" --role=roles/iam.serviceAccountUser --project="$PROJECT_ID" --quiet >/dev/null

gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION" --availability-type=ZONAL --storage-size=10 --storage-type=SSD --storage-auto-increase --backup-start-time=03:00 --retained-backups-count=7 --labels="$LABELS" --project="$PROJECT_ID"
gcloud sql databases describe "$SQL_DATABASE" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud sql databases create "$SQL_DATABASE" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
gcloud sql users describe "$SQL_USER" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud sql users create "$SQL_USER" --instance="$SQL_INSTANCE" --password="$FORGELEX_PHASE8_DB_PASSWORD" --project="$PROJECT_ID"
gcloud sql users set-password "$SQL_USER" --instance="$SQL_INSTANCE" --password="$FORGELEX_PHASE8_DB_PASSWORD" --project="$PROJECT_ID"

CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')"
ENCODED_DB_PASSWORD="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$FORGELEX_PHASE8_DB_PASSWORD")"
DATABASE_URL="postgresql://$SQL_USER:$ENCODED_DB_PASSWORD@/$SQL_DATABASE?host=/cloudsql/$CONNECTION_NAME"
put_secret() {
  local name="$1" value="$2"
  gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud secrets create "$name" --replication-policy=automatic --labels="$LABELS" --project="$PROJECT_ID"
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" --format='value(name.basename())'
}
DATABASE_SECRET_VERSION="$(put_secret forgelex-hml-database-url "$DATABASE_URL")"
WEBHOOK_SECRET_VERSION="$(put_secret forgelex-hml-webhook-master-key "$FORGELEX_PHASE8_WEBHOOK_MASTER_KEY")"
METRICS_SECRET_VERSION="$(put_secret forgelex-hml-metrics-token "$FORGELEX_PHASE8_METRICS_TOKEN")"

gcloud builds submit . --tag="$IMAGE_URI:$COMMIT_SHA" --project="$PROJECT_ID"
DIGEST="$(gcloud artifacts docker images describe "$IMAGE_URI:$COMMIT_SHA" --format='value(image_summary.digest)' --project="$PROJECT_ID")"
test -n "$DIGEST" || { echo "IMAGE_DIGEST_REQUIRED" >&2; exit 1; }

gcloud run deploy "$SERVICE" --image="$IMAGE_URI@$DIGEST" --region="$REGION" --platform=managed --service-account="$RUNTIME_EMAIL" --add-cloudsql-instances="$CONNECTION_NAME" --set-secrets="DATABASE_URL=forgelex-hml-database-url:$DATABASE_SECRET_VERSION,FORGELEX_WEBHOOK_MASTER_KEY=forgelex-hml-webhook-master-key:$WEBHOOK_SECRET_VERSION,FORGELEX_METRICS_TOKEN=forgelex-hml-metrics-token:$METRICS_SECRET_VERSION" --set-env-vars="NODE_ENV=production,FORGELEX_WEB_ROOT=/app/web" --port=8080 --cpu=1 --memory=512Mi --concurrency=20 --min-instances=0 --max-instances=2 --timeout=60s --allow-unauthenticated --labels="$LABELS" --project="$PROJECT_ID"

gcloud logging buckets describe "$LOG_BUCKET" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud logging buckets create "$LOG_BUCKET" --location="$REGION" --retention-days="$LOG_RETENTION_DAYS" --description="ForgeLex phase8 homologation" --project="$PROJECT_ID"
gcloud logging sinks describe forgelex-phase8 --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud logging sinks create forgelex-phase8 "logging.googleapis.com/projects/$PROJECT_ID/locations/$REGION/buckets/$LOG_BUCKET" "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE" --project="$PROJECT_ID"
for metric in http-5xx http-latency webhook-failure ingestion-failure; do
  filter="resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE"
  case "$metric" in http-5xx) filter="$filter AND httpRequest.status>=500";; http-latency) filter="$filter AND httpRequest.latency:*";; webhook-failure) filter="$filter AND jsonPayload.event=webhook_failure";; ingestion-failure) filter="$filter AND jsonPayload.event=ingestion_failure";; esac
  gcloud logging metrics describe "forgelex-phase8-$metric" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud logging metrics create "forgelex-phase8-$metric" --description="ForgeLex phase8 $metric" --log-filter="$filter" --project="$PROJECT_ID"
done

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
printf '{"status":"provisioned","project":"%s","region":"%s","service":"%s","commit":"%s","digest":"%s","url":"%s"}\n' "$PROJECT_ID" "$REGION" "$SERVICE" "$COMMIT_SHA" "$DIGEST" "$SERVICE_URL"
