#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${FORGELEX_PHASE8_CONFIG:-$(dirname "$0")/config.env}"
source "$CONFIG_FILE"
test "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT_ID" || { echo "PROJECT_MISMATCH" >&2; exit 1; }

safe_json() { "$@" --format=json 2>/dev/null || printf '[]'; }
jq -n \
  --arg project "$PROJECT_ID" --arg region "$REGION" \
  --argjson cloudRun "$(safe_json gcloud run services list --region="$REGION" --project="$PROJECT_ID" --filter="metadata.name=$SERVICE")" \
  --argjson cloudSql "$(safe_json gcloud sql instances list --project="$PROJECT_ID" --filter="name=$SQL_INSTANCE")" \
  --argjson artifactRegistry "$(safe_json gcloud artifacts repositories list --location="$REGION" --project="$PROJECT_ID" --filter="name~/$AR_REPOSITORY$")" \
  --argjson secrets "$(safe_json gcloud secrets list --project="$PROJECT_ID" --filter="labels.env=homologation AND labels.phase=8")" \
  --argjson serviceAccounts "$(safe_json gcloud iam service-accounts list --project="$PROJECT_ID" --filter="email:($RUNTIME_SA OR $DEPLOY_SA)")" \
  --argjson addresses "$(safe_json gcloud compute addresses list --global --project="$PROJECT_ID" --filter="name=$SERVICE-ip")" \
  --argjson certificates "$(safe_json gcloud compute ssl-certificates list --global --project="$PROJECT_ID" --filter="name=$SERVICE-cert")" \
  --argjson negs "$(safe_json gcloud compute network-endpoint-groups list --regions="$REGION" --project="$PROJECT_ID" --filter="name=$SERVICE-neg")" \
  --argjson backends "$(safe_json gcloud compute backend-services list --global --project="$PROJECT_ID" --filter="name=$SERVICE-backend")" \
  '{timestamp:(now|todateiso8601),project:$project,region:$region,cloudRun:$cloudRun,cloudSql:$cloudSql,artifactRegistry:$artifactRegistry,secrets:$secrets,serviceAccounts:$serviceAccounts,addresses:$addresses,certificates:$certificates,negs:$negs,backends:$backends}'
