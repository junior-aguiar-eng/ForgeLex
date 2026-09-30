param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$ImageUri,
  [Parameter(Mandatory = $true)][string]$SupabaseUrl,
  [Parameter(Mandatory = $true)][string]$SupabasePublishableKey
)

$ErrorActionPreference = 'Stop'
$branch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw 'O build de produção exige checkout na branch main.' }
if (git status --porcelain) { throw 'O build de produção exige working tree limpo.' }

$sourceSha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível identificar o HEAD.' }
$remoteLine = (git ls-remote origin refs/heads/main).Trim()
if ($LASTEXITCODE -ne 0 -or !$remoteLine) { throw 'Não foi possível confirmar origin/main.' }
$remoteSha = ($remoteLine -split '\s+')[0]
if ($sourceSha -ne $remoteSha) { throw 'HEAD local difere de origin/main.' }

$projectRef = ([uri]$SupabaseUrl).Host -replace '\.supabase\.co$', ''
if ($projectRef -notmatch '^[a-z0-9]{20}$') { throw 'Supabase URL de produção inválida.' }
if ($SupabasePublishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]{8,}$') {
  throw 'A chave de build deve ser publishable.'
}

$substitutions = "_IMAGE_URI=$ImageUri,_SOURCE_SHA=$sourceSha,_VITE_SUPABASE_URL=$SupabaseUrl,_VITE_SUPABASE_PUBLISHABLE_KEY=$SupabasePublishableKey,_SUPABASE_PROJECT_REF=$projectRef"
gcloud builds submit . --config=ops/gcp/production/cloudbuild.yaml --project=$ProjectId --substitutions=$substitutions --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cloud Build falhou.' }

$image = "${ImageUri}:$sourceSha"
$digest = (gcloud artifacts docker images describe $image --project=$ProjectId --format='value(image_summary.digest)').Trim()
if ($LASTEXITCODE -ne 0 -or !$digest) { throw 'O digest da imagem não foi encontrado.' }
Write-Output "sourceSha=$sourceSha"
Write-Output "image=${ImageUri}@$digest"
