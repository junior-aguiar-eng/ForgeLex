#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${FORGELEX_PHASE8_CONFIG:-$(dirname "$0")/config.env}"
source "$CONFIG_FILE"
test "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT_ID" || { echo "PROJECT_MISMATCH" >&2; exit 1; }

jq -e '.status == "passed"' "$GATE_A_EVIDENCE_FILE" >/dev/null
DEPLOYED_IMAGE="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(spec.template.spec.containers[0].image)')"
DEPLOYED_DIGEST="${DEPLOYED_IMAGE##*@}"
test "$(jq -r '.commit' "$GATE_A_EVIDENCE_FILE")" = "$COMMIT_SHA" || { echo "GATE_A_COMMIT_MISMATCH" >&2; exit 1; }
test "$(jq -r '.digest' "$GATE_A_EVIDENCE_FILE")" = "$DEPLOYED_DIGEST" || { echo "GATE_A_DIGEST_MISMATCH" >&2; exit 1; }

NEG="$SERVICE-neg"
BACKEND="$SERVICE-backend"
URL_MAP="$SERVICE-map"
PROXY="$SERVICE-https-proxy"
CERT="$SERVICE-cert"
ADDRESS="$SERVICE-ip"
RULE="$SERVICE-https-rule"

gcloud compute addresses describe "$ADDRESS" --global --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute addresses create "$ADDRESS" --global --description="ForgeLex phase8 homologation" --project="$PROJECT_ID"
gcloud compute network-endpoint-groups describe "$NEG" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute network-endpoint-groups create "$NEG" --region="$REGION" --network-endpoint-type=serverless --cloud-run-service="$SERVICE" --project="$PROJECT_ID"
gcloud compute backend-services describe "$BACKEND" --global --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute backend-services create "$BACKEND" --global --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTPS --project="$PROJECT_ID"
if ! gcloud compute backend-services describe "$BACKEND" --global --project="$PROJECT_ID" --format=json | jq -e --arg neg "$NEG" '.backends // [] | any(.group | contains($neg))' >/dev/null; then
  gcloud compute backend-services add-backend "$BACKEND" --global --network-endpoint-group="$NEG" --network-endpoint-group-region="$REGION" --project="$PROJECT_ID"
fi
gcloud compute url-maps describe "$URL_MAP" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute url-maps create "$URL_MAP" --default-service="$BACKEND" --project="$PROJECT_ID"
gcloud compute ssl-certificates describe "$CERT" --global --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute ssl-certificates create "$CERT" --domains="$DOMAIN" --global --project="$PROJECT_ID"
gcloud compute target-https-proxies describe "$PROXY" --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute target-https-proxies create "$PROXY" --ssl-certificates="$CERT" --url-map="$URL_MAP" --project="$PROJECT_ID"
gcloud compute forwarding-rules describe "$RULE" --global --project="$PROJECT_ID" >/dev/null 2>&1 || gcloud compute forwarding-rules create "$RULE" --global --load-balancing-scheme=EXTERNAL_MANAGED --address="$ADDRESS" --target-https-proxy="$PROXY" --ports=443 --project="$PROJECT_ID"

IP="$(gcloud compute addresses describe "$ADDRESS" --global --project="$PROJECT_ID" --format='value(address)')"
printf '{"type":"A","name":"%s","value":"%s","ttl":300}\n' "$DOMAIN" "$IP"
