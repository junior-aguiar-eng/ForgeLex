#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$ImageUri,
  [Parameter(Mandatory = $true)][string]$SupabaseUrl,
  [Parameter(Mandatory = $true)][string]$SupabasePublishableKey,
  [ValidateSet('true', 'false')][string]$SavedResearchEnabled = 'false',
  # Obrigatórias de propósito: o cloudbuild.yaml assume 'false' para as duas, e publicar o front sem elas remove a
  # mesa agêntica e o caso da interface. Para publicar em um comando, prefira deploy-from-main.ps1.
  [Parameter(Mandatory = $true)][ValidateSet('true', 'false')][string]$AgenticWorkspaceEnabled,
  [Parameter(Mandatory = $true)][ValidateSet('true', 'false')][string]$CaseWorkspaceEnabled
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')
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

$previous = @{
  '_IMAGE_URI'                               = $ImageUri
  '_SOURCE_SHA'                              = $sourceSha
  '_SUPABASE_PROJECT_REF'                    = $projectRef
  '_VITE_SUPABASE_URL'                       = $SupabaseUrl
  '_VITE_SUPABASE_PUBLISHABLE_KEY'           = $SupabasePublishableKey
  '_VITE_FORGELEX_SAVED_RESEARCH_ENABLED'    = $SavedResearchEnabled
  '_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED' = $AgenticWorkspaceEnabled
  '_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'    = $CaseWorkspaceEnabled
}
$substitutions = New-BuildSubstitutions -Previous $previous -Sha $sourceSha
$build = Invoke-GcloudJson -Arguments @('builds', 'submit', '.', '--config=ops/gcp/production/cloudbuild.yaml', "--project=$ProjectId", "--substitutions=$(ConvertTo-SubstitutionArgument $substitutions)", '--suppress-logs', '--quiet')
$trustedBuild = Get-TrustedBuildOutput -Build $build -ProjectId $ProjectId -ImageUri $ImageUri -ExpectedSubstitutions $substitutions

Write-Output "buildId=$($trustedBuild.Id)"
Write-Output "sourceSha=$sourceSha"
Write-Output "image=$($trustedBuild.Image)"
