#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${FORGELEX_PHASE8_CONFIG:-$(dirname "$0")/config.env}"
source "$CONFIG_FILE"

test "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT_ID" || { echo "PROJECT_MISMATCH" >&2; exit 1; }
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
test -n "$ACCOUNT" && test "$ACCOUNT" != "(unset)" || { echo "ACTIVE_ACCOUNT_REQUIRED" >&2; exit 1; }

BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName.basename())')"
test -n "$BILLING_ACCOUNT" || { echo "BILLING_REQUIRED" >&2; exit 1; }
BUDGET_API_ENABLED="$(gcloud services list --enabled --project="$PROJECT_ID" --filter='config.name=billingbudgets.googleapis.com' --format='value(config.name)')"
if test "$BUDGET_API_ENABLED" = "billingbudgets.googleapis.com"; then
  gcloud beta billing budgets list --billing-account="$BILLING_ACCOUNT" --format=json | jq -e 'length > 0' >/dev/null
  BUDGET_STATUS="api-confirmed"
else
  test "${FORGELEX_PHASE8_BUDGET_CONFIRMED:-}" = "confirmed" || { echo "BUDGET_CONSOLE_CONFIRMATION_REQUIRED" >&2; exit 1; }
  BUDGET_STATUS="console-confirmed"
fi

REQUIRED_APIS=(run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com compute.googleapis.com logging.googleapis.com)
MISSING_APIS=()
for api in "${REQUIRED_APIS[@]}"; do
  gcloud services list --enabled --project="$PROJECT_ID" --filter="config.name=$api" --format='value(config.name)' | grep -qx "$api" || MISSING_APIS+=("$api")
done

jq -e '.storageHeadroomRatio >= 0.25 and .estimatedMonthlyBrl >= 0' "$MEASUREMENT_FILE" >/dev/null

assert_owned_or_absent() {
  local command="$1" name="$2"
  local labels
  labels="$(eval "$command" 2>/dev/null || true)"
  test -z "$labels" || { echo "$labels" | grep -q 'env=homologation' && echo "$labels" | grep -q 'phase=8'; } || { echo "RESOURCE_NAME_COLLISION:$name" >&2; exit 1; }
}

assert_owned_or_absent "gcloud run services describe '$SERVICE' --region='$REGION' --project='$PROJECT_ID' --format='value(metadata.labels)'" "$SERVICE"
assert_owned_or_absent "gcloud sql instances describe '$SQL_INSTANCE' --project='$PROJECT_ID' --format='value(settings.userLabels)'" "$SQL_INSTANCE"
assert_owned_or_absent "gcloud artifacts repositories describe '$AR_REPOSITORY' --location='$REGION' --project='$PROJECT_ID' --format='value(labels)'" "$AR_REPOSITORY"

MISSING_APIS_JSON="$(printf '%s\n' "${MISSING_APIS[@]:-}" | jq -Rsc 'split("\n") | map(select(length > 0))')"
jq -n --arg project "$PROJECT_ID" --arg account "$ACCOUNT" --arg billingAccount "$BILLING_ACCOUNT" --arg budgetStatus "$BUDGET_STATUS" --argjson missingApis "$MISSING_APIS_JSON" '{status:"passed",project:$project,account:$account,billingAccount:$billingAccount,budgetStatus:$budgetStatus,missingApis:$missingApis}'
