#Requires -Version 7.0
<#
.SYNOPSIS
  Roda a ferramenta de migrations de produção como um Cloud Run Job temporário: cria, executa, mostra o resultado e apaga.

.DESCRIPTION
  A ferramenta (apps/api/src/operations/migration-command.ts) tem três modos: `inspect` (só lê), `apply` (aplica só o que
  `-Allow` autoriza) e `verify` (o journal deve estar completo). O Job usa a mesma conta de serviço, a mesma instância
  do Cloud SQL e o mesmo segredo DATABASE_URL da API, lidos do serviço; e só aceita o banco e o host esperados.

  `apply` exige um backup bem-sucedido recente do Cloud SQL (-MaxBackupAgeMinutes, padrão 120). Não há como pulá-lo.
  O Job nunca tenta de novo sozinho. É apagado ao final, também quando falha; os logs ficam no Cloud Logging.

  A imagem (-Image, fixada por digest) tem de conter a ferramenta, ou seja, ser de um build que inclui este código.
  Gere-a com build-from-main.ps1 (só imagem); um -NoTraffic do deploy não serve com migration pendente, porque a revisão
  nova recusa subir (MIGRATIONS_PENDING).

.EXAMPLE
  ./ops/gcp/production/migrate-production.ps1 -Mode inspect -Image '<registro>/forgelex-api@sha256:...' -DryRun
  ./ops/gcp/production/migrate-production.ps1 -Mode inspect -Image '<...>@sha256:...'
  ./ops/gcp/production/migrate-production.ps1 -Mode apply -Image '<...>@sha256:...' -Allow persistence-0042-webhook-admission,persistence-0043-execution-stream-leases
  ./ops/gcp/production/migrate-production.ps1 -Mode verify -Image '<...>@sha256:...'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('inspect', 'apply', 'verify')][string]$Mode,
  [Parameter(Mandatory)][string]$Image,
  [string[]]$Allow = @(),
  [string]$ProjectId = 'project-bbbe1209-c295-4720-867',
  [string]$Region = 'southamerica-east1',
  [string]$ApiService = 'forgelex-api-prod',
  [string]$ExpectedDatabase = 'forgelex',
  [int]$MaxBackupAgeMinutes = 120,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')
. (Join-Path $PSScriptRoot 'migrate-lib.ps1')

function Write-Step { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }

$now = [datetime]::UtcNow
$jobName = New-MigrationJobName -Mode $Mode -Now $now

Write-Step "1. Lendo o serviço $ApiService (identidade, Cloud SQL e segredo)"
$service = Invoke-GcloudJson -Arguments @('run', 'services', 'describe', $ApiService, "--project=$ProjectId", "--region=$Region")
if ($null -eq $service) { throw "Não encontrei o serviço $ApiService." }
$settings = Get-MigrationJobSettings -Service $service
Write-Host "  conta de serviço: $($settings.ServiceAccount)"
Write-Host "  instância:        $($settings.CloudSqlInstance)"
Write-Host "  segredo:          $($settings.SecretName):$($settings.SecretKey) (valor não lido)"

$blocked = $null
if ($Mode -eq 'apply') {
  Write-Step '2. Conferindo o backup'
  $backups = Invoke-GcloudJson -Arguments @('sql', 'backups', 'list', "--instance=$($settings.InstanceName)", "--project=$ProjectId", '--limit=10')
  $backup = Test-RecentBackup -Backups $backups -Now $now -MaxAgeMinutes $MaxBackupAgeMinutes
  Write-Host "  $($backup.Reason)"
  if (-not $backup.Ok) { $blocked = $backup.Reason }
}

$commands = New-MigrationJobCommands -Mode $Mode -JobName $jobName -Settings $settings -Image $Image -Allow $Allow `
  -ProjectId $ProjectId -Region $Region -ExpectedDatabase $ExpectedDatabase

Write-Step "3. Plano: Job '$jobName', modo $Mode"
foreach ($step in 'Create', 'Execute', 'Delete') { Write-Host "  gcloud $($commands.$step -join ' ')" }

if ($blocked) {
  if ($DryRun) { Write-Host "IMPEDIMENTO: $blocked" -ForegroundColor Yellow; return }
  throw $blocked
}
if ($DryRun) { Write-Host ''; Write-Host 'Simulação: nada foi criado nem executado.'; return }

$failure = $null
$entries = @()
try {
  Write-Step '4. Criando e executando o Job'
  [void](Invoke-Gcloud -Arguments $commands.Create)
  $run = Invoke-Gcloud -Arguments $commands.Execute -AllowFailure
  if ($run.ExitCode -ne 0) { $failure = "A execução do Job terminou com erro: $(($run.Output | Select-Object -Last 4) -join ' | ')" }

  Write-Step '5. Resultado (Cloud Logging pode levar alguns segundos)'
  foreach ($attempt in 1..4) {
    Start-Sleep -Seconds (5 * $attempt)
    $read = Invoke-GcloudJson -Arguments $commands.Logs -AllowFailure
    $entries = @($read)
    if ((Test-MigrationOutcome -Entries $entries) -ne 'unknown') { break }
  }
  Format-MigrationLogEntries -Entries $entries | ForEach-Object { Write-Host "  $_" }
  $outcome = Test-MigrationOutcome -Entries $entries
  if ($outcome -eq 'failed' -and -not $failure) { $failure = 'A ferramenta registrou migration.failed.' }
  if ($outcome -eq 'unknown' -and -not $failure) { $failure = 'Não li o resultado nos logs; confira o Cloud Logging antes de seguir.' }
}
finally {
  Write-Step '6. Apagando o Job temporário'
  $deleted = Invoke-Gcloud -Arguments $commands.Delete -AllowFailure
  if ($deleted.ExitCode -ne 0) { Write-Warning "Não consegui apagar o Job '$jobName'; apague-o à mão." }
}
if ($failure) { throw $failure }
Write-Host ''
Write-Host "Concluído: modo $Mode. Job: $jobName (apagado). Logs: resource.labels.job_name=`"$jobName`"." -ForegroundColor Green
if ($Mode -eq 'apply') { Write-Host 'Próximo passo: rode o modo verify e registre o resultado (checklist, seção 6).' }
