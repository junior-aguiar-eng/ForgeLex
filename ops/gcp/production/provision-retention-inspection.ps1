param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$Region,
  [Parameter(Mandatory = $true)][string]$ImageDigest,
  [Parameter(Mandatory = $true)][string]$RuntimeServiceAccount,
  [Parameter(Mandatory = $true)][string]$InvokerServiceAccount,
  [Parameter(Mandatory = $true)][string]$CloudSqlInstance,
  [Parameter(Mandatory = $true)][string]$DatabaseSecret
)
$ErrorActionPreference = 'Stop'
if ($ImageDigest -notmatch '@sha256:[a-f0-9]{64}$') { throw 'IMMUTABLE_IMAGE_REQUIRED' }
$job = 'forgelex-operational-retention-inspect'
$scheduler = 'forgelex-operational-retention-inspect-daily'

# Create only: an existing resource needs inspection before any replacement.
gcloud run jobs create $job --project=$ProjectId --region=$Region --image=$ImageDigest --service-account=$RuntimeServiceAccount --set-cloudsql-instances=$CloudSqlInstance --set-secrets="DATABASE_URL=$DatabaseSecret" --set-env-vars='FORGELEX_RETENTION_EXECUTION_ENABLED=false,FORGELEX_OPERATION_RETENTION_DAYS=90' --command=node --args=api/dist/operations/retention-main.js --tasks=1 --parallelism=1 --max-retries=1 --task-timeout=120s --cpu=1 --memory=512Mi --quiet
if ($LASTEXITCODE -ne 0) { throw 'RETENTION_JOB_CREATE_FAILED' }
gcloud run jobs execute $job --project=$ProjectId --region=$Region --wait --quiet
if ($LASTEXITCODE -ne 0) { throw 'RETENTION_INSPECTION_FAILED_SCHEDULER_NOT_CREATED' }
gcloud run jobs add-iam-policy-binding $job --project=$ProjectId --region=$Region --member="serviceAccount:$InvokerServiceAccount" --role=roles/run.invoker --quiet
if ($LASTEXITCODE -ne 0) { throw 'RETENTION_JOB_INVOCATION_GRANT_FAILED' }
$uri = "https://run.googleapis.com/v2/projects/$ProjectId/locations/$Region/jobs/${job}:run"
gcloud scheduler jobs create http $scheduler --project=$ProjectId --location=$Region --schedule='0 8 * * *' --time-zone=America/Fortaleza --uri=$uri --http-method=POST --message-body='{}' --oauth-service-account-email=$InvokerServiceAccount --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform --quiet
if ($LASTEXITCODE -ne 0) { throw 'RETENTION_SCHEDULER_CREATE_FAILED' }
Write-Output 'RETENTION_INSPECTION_SCHEDULED_APPLY_DISABLED'
