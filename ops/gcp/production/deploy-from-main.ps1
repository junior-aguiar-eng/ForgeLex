#Requires -Version 7.0
<#
.SYNOPSIS
  Publica o SHA atual de origin/main na API e no serviço de encerramento, em um comando.

.DESCRIPTION
  Sequência: confere o checkout e a CI, lê o estado de produção, reaproveita as substituições do último build
  bem-sucedido (trocando só o SHA), gera a imagem em um novo Cloud Build e usa somente o digest autenticado pelo
  resultado desse build. Depois cria as revisões SEM tráfego, confere que só a imagem e FORGELEX_SOURCE_SHA mudaram,
  troca o tráfego, verifica e, se qualquer coisa falhar, reverte sozinho.

  Não aplica migrations: FORGELEX_AUTO_MIGRATE continua como está nos serviços. Se o SHA traz migration, aplique-a
  antes, pelo procedimento próprio, e faça backup.

.EXAMPLE
  ./ops/gcp/production/deploy-from-main.ps1 -DryRun     # só lê e mostra o plano; não altera nada
  ./ops/gcp/production/deploy-from-main.ps1             # publica
  ./ops/gcp/production/deploy-from-main.ps1 -NoTraffic  # gera a imagem e as revisões, sem trocar o tráfego
  ./ops/gcp/production/deploy-from-main.ps1 -ReleaseBuildId '<id>' # retoma o build exibido pelo -NoTraffic
#>
[CmdletBinding()]
param(
  [string]$ProjectId = 'project-bbbe1209-c295-4720-867',
  [string]$Region = 'southamerica-east1',
  [string]$ImageUri = 'southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api',
  [string]$ApiService = 'forgelex-api-prod',
  [string]$ClosureService = 'forgelex-closure-hml-private',
  # Por padrão as flags de interface vêm do último build. Informe só para mudá-las de propósito.
  [ValidateSet('true', 'false')][string]$AgenticWorkspaceEnabled,
  [ValidateSet('true', 'false')][string]$CaseWorkspaceEnabled,
  [ValidateSet('true', 'false')][string]$SavedResearchEnabled,
  [ValidateSet('true', 'false')][string]$DeskShellEnabled,
  [ValidateSet('true', 'false')][string]$AttachmentsEnabled,
  [ValidateSet('true', 'false')][string]$MatterChipsEnabled,
  [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
  [string]$ReleaseBuildId,
  [switch]$DryRun,
  [switch]$NoTraffic,
  [switch]$SkipCiCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')

$problems = [System.Collections.Generic.List[string]]::new()
function Write-Step { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Assert-Precondition {
  # Na simulação, impedimentos são listados no fim; na publicação real, o primeiro deles interrompe tudo.
  param([bool]$Ok, [string]$Message)
  if ($Ok) { return }
  if ($DryRun) { $problems.Add($Message); Write-Host "  IMPEDIMENTO: $Message" -ForegroundColor Yellow }
  else { throw $Message }
}
function Get-EnvValue {
  param($Container, [string]$Name)
  foreach ($entry in @(Get-Prop $Container 'env')) {
    if ($null -ne $entry -and $entry.name -eq $Name) { return (Get-Prop $entry 'value') }
  }
  return $null
}
function Test-RevisionReady {
  param($Revision)
  foreach ($condition in @(Get-Prop $Revision 'status.conditions')) {
    if ($null -ne $condition -and $condition.type -eq 'Ready') { return ($condition.status -eq 'True') }
  }
  return $false
}

if ($DryRun) { Write-Host 'MODO SIMULAÇÃO: só leitura. Nada será construído, criado ou alterado.' -ForegroundColor Yellow }

# ---------------------------------------------------------------- 1. Origem do código
Write-Step '1/7 Origem do código'
$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot
git fetch origin main --quiet
$sha = (git rev-parse HEAD).Trim()
$remoteSha = (git rev-parse origin/main).Trim()
$dirty = @(git status --porcelain)
Write-Host "  HEAD         $sha"
Write-Host "  origin/main  $remoteSha"
Assert-Precondition ($sha -eq $remoteSha) "HEAD ($($sha.Substring(0, 7))) difere de origin/main ($($remoteSha.Substring(0, 7))). Faça o checkout limpo do origin/main."
Assert-Precondition ($dirty.Count -eq 0) 'A árvore de trabalho tem alterações. A publicação exige checkout limpo.'

# ---------------------------------------------------------------- 2. CI
Write-Step '2/7 CI do SHA'
if ($SkipCiCheck) {
  Write-Host '  pulado (-SkipCiCheck)' -ForegroundColor Yellow
}
elseif (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Warning 'gh não encontrado: a CI não foi conferida.'
}
else {
  # O argumento de --json é UMA string: com espaços após as vírgulas o PowerShell o separa em vários argumentos.
  $ghOutput = @(gh run list --branch main --limit 20 --json 'headSha,status,conclusion' 2>&1)
  if ($LASTEXITCODE -ne 0) {
    Assert-Precondition $false "Não consegui consultar a CI com o gh ($(($ghOutput | Select-Object -First 1) -join ' ')). Autentique o gh ou use -SkipCiCheck."
  }
  else {
    $runs = @($ghOutput | ConvertFrom-Json)
    $green = @($runs | Where-Object { $_.headSha -eq $sha -and $_.conclusion -eq 'success' }).Count -gt 0
    Write-Host "  CI verde para este SHA: $green"
    Assert-Precondition $green "A CI de main não está verde para $sha. Aguarde a CI terminar; -SkipCiCheck só se souber o que está fazendo."
  }
}

# ---------------------------------------------------------------- 3. Produção hoje
Write-Step '3/7 Estado atual em produção'
$state = [ordered]@{}
foreach ($name in $ApiService, $ClosureService) {
  $service = Invoke-GcloudJson -Arguments @('run', 'services', 'describe', $name, "--project=$ProjectId", "--region=$Region")
  $previous = $null
  try { $previous = Get-ServingRevision $service }
  catch { Assert-Precondition $false $_.Exception.Message }
  $state[$name] = [pscustomobject]@{ Name = $name; Previous = $previous; Service = $service }
  Write-Host "  $name  recebe 100% em  $previous"
}
$apiContainer = @(Get-Prop $state[$ApiService].Service 'spec.template.spec.containers')[0]
$publicUrl = Get-EnvValue $apiContainer 'FORGELEX_PUBLIC_URL'
Assert-Precondition (-not [string]::IsNullOrWhiteSpace($publicUrl)) "O serviço $ApiService não define FORGELEX_PUBLIC_URL; não há URL para verificar."
Write-Host "  URL pública  $publicUrl"
Get-ApiRuntimeFlagReport $apiContainer | ForEach-Object { Write-Host "  $_" }

# ---------------------------------------------------------------- 4. Configuração de build
Write-Step '4/7 Configuração de build'
$build = $null
if ($ReleaseBuildId) {
  $build = Invoke-GcloudJson -Arguments @('builds', 'describe', $ReleaseBuildId, "--project=$ProjectId")
  $base = Select-ProductionBuild -Builds @($build) -ImageUri $ImageUri
}
else {
  $builds = @(Invoke-GcloudJson -Arguments @('builds', 'list', "--project=$ProjectId", '--filter=status=SUCCESS', '--limit=30', '--sort-by=~createTime'))
  $base = Select-ProductionBuild -Builds $builds -ImageUri $ImageUri
}
$overrides = @{}
if ($PSBoundParameters.ContainsKey('AgenticWorkspaceEnabled')) { $overrides['_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED'] = $AgenticWorkspaceEnabled }
if ($PSBoundParameters.ContainsKey('CaseWorkspaceEnabled')) { $overrides['_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'] = $CaseWorkspaceEnabled }
if ($PSBoundParameters.ContainsKey('SavedResearchEnabled')) { $overrides['_VITE_FORGELEX_SAVED_RESEARCH_ENABLED'] = $SavedResearchEnabled }
if ($PSBoundParameters.ContainsKey('DeskShellEnabled')) { $overrides['_VITE_FORGELEX_DESK_SHELL'] = $DeskShellEnabled }
if ($PSBoundParameters.ContainsKey('AttachmentsEnabled')) { $overrides['_VITE_FORGELEX_ATTACHMENTS_ENABLED'] = $AttachmentsEnabled }
if ($PSBoundParameters.ContainsKey('MatterChipsEnabled')) { $overrides['_VITE_FORGELEX_MATTER_CHIPS_ENABLED'] = $MatterChipsEnabled }
$substitutions = New-BuildSubstitutions -Previous $base.Substitutions -Sha $sha -Overrides $overrides
Write-Host "  base: build $($base.Id)$(if ($ReleaseBuildId) { '  (retomada explícita)' } elseif ($overrides.Count) { "  (com $($overrides.Count) flag(s) trocada(s) de propósito)" })"
Format-MaskedSubstitutions $substitutions | ForEach-Object { Write-Host "  $_" }

$imageTag = "${ImageUri}:$sha"
$trustedBuild = if ($null -ne $build) {
  Get-TrustedBuildOutput -Build $build -ProjectId $ProjectId -ImageUri $ImageUri -ExpectedSubstitutions $substitutions
}
else { $null }
$plannedSuffix = if ($null -ne $trustedBuild) { $trustedBuild.RevisionSuffix } else { "$($sha.Substring(0, 7))-<build-id>" }

if ($DryRun) {
  Write-Step 'Plano (simulação)'
  if ($null -ne $trustedBuild) {
    Write-Host "  imagem           $($trustedBuild.Image)  (Cloud Build $($trustedBuild.Id))"
  }
  else {
    Write-Host "  imagem           $imageTag  (será construída; o digest virá do resultado do novo Cloud Build)"
  }
  foreach ($name in $ApiService, $ClosureService) {
    Write-Host "  $name  $($state[$name].Previous)  ->  $name-$plannedSuffix"
  }
  Write-Host '  ordem da troca   encerramento, depois API; verificação; reversão automática se falhar'
  Write-Host ''
  if ($problems.Count -gt 0) {
    Write-Host "A publicação real seria RECUSADA por $($problems.Count) impedimento(s):" -ForegroundColor Yellow
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 2
  }
  Write-Host 'Nenhum impedimento. A publicação real pode ser executada.' -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- 5. Build
Write-Step '5/7 Imagem'
if ($null -eq $trustedBuild) {
  Write-Host "  construindo $imageTag em um novo Cloud Build (alguns minutos)..."
  $build = Invoke-GcloudJson -Arguments @('builds', 'submit', '.', '--config=ops/gcp/production/cloudbuild.yaml', "--project=$ProjectId", "--substitutions=$(ConvertTo-SubstitutionArgument $substitutions)", '--suppress-logs', '--quiet')
  $trustedBuild = Get-TrustedBuildOutput -Build $build -ProjectId $ProjectId -ImageUri $ImageUri -ExpectedSubstitutions $substitutions
}
else {
  Write-Host "  retomando o Cloud Build $($trustedBuild.Id) após conferir projeto, SHA, substituições e digest"
}
$buildId = $trustedBuild.Id
$digest = $trustedBuild.Digest
$image = $trustedBuild.Image
$suffix = $trustedBuild.RevisionSuffix
Write-Host "  build $buildId"
Write-Host "  $image"

# ---------------------------------------------------------------- 6. Revisões sem tráfego
Write-Step '6/7 Revisões sem tráfego'
$plan = @()
foreach ($name in $ClosureService, $ApiService) {
  $revisionName = "$name-$suffix"
  $arguments = @('run', 'revisions', 'describe', $revisionName, "--project=$ProjectId", "--region=$Region")
  $revision = Invoke-GcloudJson -AllowFailure -Arguments $arguments
  if ($null -ne $revision) {
    $existingImage = (@(Get-Prop $revision 'spec.containers')[0]).image
    if ($existingImage -ne $image) { throw "A revisão $revisionName já existe com outra imagem ($existingImage). Remova-a ou use outro SHA." }
    Write-Host "  $revisionName já existe com esta imagem; reaproveitando"
  }
  else {
    Write-Host "  criando $revisionName"
    Invoke-Gcloud -Arguments @('run', 'deploy', $name, "--project=$ProjectId", "--region=$Region", "--image=$image", '--no-traffic', "--revision-suffix=$suffix", "--update-env-vars=FORGELEX_SOURCE_SHA=$sha", '--quiet') | Out-Null
    $revision = Invoke-GcloudJson -Arguments $arguments
  }
  if (-not (Test-RevisionReady $revision)) { throw "A revisão $revisionName não está pronta." }
  $declared = Get-EnvValue (@(Get-Prop $revision 'spec.containers')[0]) 'FORGELEX_SOURCE_SHA'
  if ($declared -ne $sha) { throw "A revisão $revisionName declara FORGELEX_SOURCE_SHA=$declared, esperado $sha." }

  $previousName = $state[$name].Previous
  if ($previousName -ne $revisionName) {
    $previousRevision = Invoke-GcloudJson -Arguments @('run', 'revisions', 'describe', $previousName, "--project=$ProjectId", "--region=$Region")
    $differences = @(Compare-RevisionConfig -Old $previousRevision -New $revision)
    if ($differences.Count -gt 0) {
      throw "A revisão $revisionName difere da em uso ($previousName) em mais do que a imagem e FORGELEX_SOURCE_SHA: $($differences -join '; '). Tráfego não alterado."
    }
    Write-Host "  $revisionName confere com $previousName (só imagem e SOURCE_SHA mudaram)"
  }
  $plan += [pscustomobject]@{ Service = $name; Revision = $revisionName; Previous = $previousName }
}

if ($NoTraffic) {
  Write-Step 'Parado antes da troca (-NoTraffic)'
  Write-Host "  Revisões prontas e sem tráfego. Para trocar, rode novamente com -ReleaseBuildId '$buildId': o build e as revisões serão revalidados e reaproveitados."
  exit 0
}

# ---------------------------------------------------------------- 7. Tráfego + verificação
Write-Step '7/7 Troca de tráfego e verificação'
$verify = {
  $failures = [System.Collections.Generic.List[string]]::new()
  Start-Sleep -Seconds 8
  $health = Test-PublicHealth -BaseUrl $publicUrl
  if (-not $health.Ok) { foreach ($failure in $health.Failures) { $failures.Add($failure) } }
  foreach ($step in $plan) {
    $revision = Invoke-GcloudJson -Arguments @('run', 'revisions', 'describe', $step.Revision, "--project=$ProjectId", "--region=$Region")
    if (-not (Test-RevisionReady $revision)) { $failures.Add("$($step.Revision) não está pronta") }
    $rows = @(Invoke-GcloudJson -Arguments @('logging', 'read', "resource.type=cloud_run_revision AND resource.labels.revision_name=$($step.Revision) AND httpRequest.status>=500", "--project=$ProjectId", '--freshness=5m', '--limit=5'))
    if ($rows.Count -gt 0) { $failures.Add("$($step.Revision) respondeu 5xx ($($rows.Count) nos últimos 5 min)") }
  }
  return [pscustomobject]@{ Ok = ($failures.Count -eq 0); Failures = $failures.ToArray() }
}
$result = Switch-Traffic -Plan $plan -ProjectId $ProjectId -Region $Region -Verify $verify

Write-Host ''
if ($result.Ok) {
  Write-Host "PUBLICADO: $sha" -ForegroundColor Green
  Write-Host "  build    $buildId"
  Write-Host "  imagem   $image"
  foreach ($step in $plan) { Write-Host "  $($step.Service)  $($step.Previous)  ->  $($step.Revision)" }
  Write-Host ''
  Write-Host 'Reversão, se precisar:'
  foreach ($step in $plan) {
    if ($step.Previous -ne $step.Revision) {
      Write-Host "  gcloud run services update-traffic $($step.Service) --project=$ProjectId --region=$Region --to-revisions=$($step.Previous)=100"
    }
  }
  Write-Host ''
  Write-Host 'Registre no PENDENCIAS.md: aprovação de Boni, SHA, build ID, digest, revisões e a verificação acima.'
  exit 0
}

Write-Host "A PUBLICAÇÃO FALHOU: $($result.Reason)" -ForegroundColor Red
if ($result.RolledBack) {
  $after = Test-PublicHealth -BaseUrl $publicUrl -Attempts 2 -DelaySeconds 3
  Write-Host "Tráfego revertido para as revisões anteriores. Saúde pública depois da reversão: $(if ($after.Ok) { 'OK' } else { 'FALHOU: ' + ($after.Failures -join '; ') })" -ForegroundColor Yellow
}
else {
  Write-Host 'A REVERSÃO NÃO FOI CONCLUÍDA. Verifique o tráfego manualmente:' -ForegroundColor Red
  $result.Errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  foreach ($step in $plan) {
    Write-Host "  gcloud run services update-traffic $($step.Service) --project=$ProjectId --region=$Region --to-revisions=$($step.Previous)=100"
  }
}
exit 1
