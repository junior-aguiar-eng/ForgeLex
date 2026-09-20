#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${FORGELEX_PHASE8_CONFIG:-$(dirname "$0")/config.env}"
source "$CONFIG_FILE"
test "${FORGELEX_PHASE8_TEARDOWN:-}" = confirmed || { echo "TEARDOWN_NOT_CONFIRMED" >&2; exit 1; }
test "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT_ID" || { echo "PROJECT_MISMATCH" >&2; exit 1; }
mkdir -p "$EVIDENCE_DIR"
"$(dirname "$0")/04-inventory.sh" > "$EVIDENCE_DIR/inventory-before-teardown.json"

assert_labels() {
  local labels="$1" resource="$2"
  echo "$labels" | grep -q 'env=homologation' && echo "$labels" | grep -q 'phase=8' || { echo "RESOURCE_LABEL_MISMATCH:$resource" >&2; exit 1; }
}
if gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then assert_labels "$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(metadata.labels)')" "$SERVICE"; fi
if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then assert_labels "$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(settings.userLabels)')" "$SQL_INSTANCE"; fi
if gcloud artifacts repositories describe "$AR_REPOSITORY" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then assert_labels "$(gcloud artifacts repositories describe "$AR_REPOSITORY" --location="$REGION" --project="$PROJECT_ID" --format='value(labels)')" "$AR_REPOSITORY"; fi

delete_if_present() { local describe="$1" delete="$2"; if eval "$describe" >/dev/null 2>&1; then eval "$delete"; fi; }
delete_if_present "gcloud compute forwarding-rules describe '$SERVICE-https-rule' --global --project='$PROJECT_ID'" "gcloud compute forwarding-rules delete '$SERVICE-https-rule' --global --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud compute target-https-proxies describe '$SERVICE-https-proxy' --project='$PROJECT_ID'" "gcloud compute target-https-proxies delete '$SERVICE-https-proxy' --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud compute url-maps describe '$SERVICE-map' --project='$PROJECT_ID'" "gcloud compute url-maps delete '$SERVICE-map' --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud compute backend-services describe '$SERVICE-backend' --global --project='$PROJECT_ID'" "gcloud compute backend-services delete '$SERVICE-backend' --global --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud compute network-endpoint-groups describe '$SERVICE-neg' --region='$REGION' --project='$PROJECT_ID'" "gcloud compute network-endpoint-groups delete '$SERVICE-neg' --region='$REGION' --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud compute ssl-certificates describe '$SERVICE-cert' --global --project='$PROJECT_ID'" "gcloud compute ssl-certificates delete '$SERVICE-cert' --global --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud compute addresses describe '$SERVICE-ip' --global --project='$PROJECT_ID'" "gcloud compute addresses delete '$SERVICE-ip' --global --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud run services describe '$SERVICE' --region='$REGION' --project='$PROJECT_ID'" "gcloud run services delete '$SERVICE' --region='$REGION' --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud sql instances describe '$SQL_INSTANCE' --project='$PROJECT_ID'" "gcloud sql instances delete '$SQL_INSTANCE' --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud artifacts repositories describe '$AR_REPOSITORY' --location='$REGION' --project='$PROJECT_ID'" "gcloud artifacts repositories delete '$AR_REPOSITORY' --location='$REGION' --project='$PROJECT_ID' --quiet"
for name in forgelex-hml-database-url forgelex-hml-webhook-master-key forgelex-hml-metrics-token; do delete_if_present "gcloud secrets describe '$name' --project='$PROJECT_ID'" "gcloud secrets delete '$name' --project='$PROJECT_ID' --quiet"; done
for metric in http-5xx http-latency webhook-failure ingestion-failure; do delete_if_present "gcloud logging metrics describe 'forgelex-phase8-$metric' --project='$PROJECT_ID'" "gcloud logging metrics delete 'forgelex-phase8-$metric' --project='$PROJECT_ID' --quiet"; done
delete_if_present "gcloud logging sinks describe forgelex-phase8 --project='$PROJECT_ID'" "gcloud logging sinks delete forgelex-phase8 --project='$PROJECT_ID' --quiet"
delete_if_present "gcloud logging buckets describe '$LOG_BUCKET' --location='$REGION' --project='$PROJECT_ID'" "gcloud logging buckets delete '$LOG_BUCKET' --location='$REGION' --project='$PROJECT_ID' --quiet"
for account in "$RUNTIME_SA" "$DEPLOY_SA"; do delete_if_present "gcloud iam service-accounts describe '$account@$PROJECT_ID.iam.gserviceaccount.com' --project='$PROJECT_ID'" "gcloud iam service-accounts delete '$account@$PROJECT_ID.iam.gserviceaccount.com' --project='$PROJECT_ID' --quiet"; done

"$(dirname "$0")/04-inventory.sh" > "$EVIDENCE_DIR/inventory-after-teardown.json"
jq -e '[.cloudRun,.cloudSql,.artifactRegistry,.secrets,.addresses,.certificates,.negs,.backends] | map(length) | add == 0' "$EVIDENCE_DIR/inventory-after-teardown.json" >/dev/null || { echo "BILLABLE_RESOURCES_REMAIN" >&2; exit 1; }
