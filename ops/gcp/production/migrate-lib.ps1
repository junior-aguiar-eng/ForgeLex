#Requires -Version 7.0
# Funções do migrate-production.ps1. Sem efeito colateral ao ser carregado; só montam argumentos e interpretam
# respostas do gcloud. Quem fala com o gcloud é o script principal, e os testes (deploy-from-main.tests.ps1) usam fixtures.
Set-StrictMode -Version Latest

$script:MigrationModes = @('inspect', 'apply', 'verify')
$script:MigrationToolPath = 'api/dist/operations/migration-main.js'

function Get-MigrationJobSettings {
  <# Lê, do serviço da API, com que identidade e contra qual banco o Job deve rodar: o Job é um espelho da API. #>
  param([Parameter(Mandatory)]$Service)
  $template = Get-Prop $Service 'spec.template'
  $serviceAccount = Get-Prop $template 'spec.serviceAccountName'
  $annotations = Get-Prop $template 'metadata.annotations'
  $cloudSql = $null
  if ($null -ne $annotations) {
    $property = $annotations.PSObject.Properties['run.googleapis.com/cloudsql-instances']
    if ($null -ne $property) { $cloudSql = [string]$property.Value }
  }
  if (-not $serviceAccount) { throw 'O serviço não declara a conta de serviço (spec.template.spec.serviceAccountName).' }
  if (-not $cloudSql) { throw 'O serviço não declara a instância do Cloud SQL (run.googleapis.com/cloudsql-instances).' }
  if ($cloudSql -notmatch '^[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z][a-z0-9-]*$') {
    throw "Esperava uma única instância 'projeto:região:nome' do Cloud SQL; o serviço declara '$cloudSql'."
  }
  $container = @(Get-Prop $template 'spec.containers')[0]
  $secret = $null
  foreach ($entry in @(Get-Prop $container 'env')) {
    if ($null -ne $entry -and $entry.name -eq 'DATABASE_URL') { $secret = Get-Prop $entry 'valueFrom.secretKeyRef'; break }
  }
  $secretName = Get-Prop $secret 'name'
  $secretKey = Get-Prop $secret 'key'
  if (-not $secretName -or -not $secretKey) {
    throw 'DATABASE_URL do serviço não vem de um segredo (valueFrom.secretKeyRef); recuso copiar um valor em texto.'
  }
  return [pscustomobject]@{
    ServiceAccount   = [string]$serviceAccount
    CloudSqlInstance = $cloudSql
    InstanceName     = $cloudSql.Split(':')[2]
    DatabaseHost     = "/cloudsql/$cloudSql"
    SecretName       = [string]$secretName
    SecretKey        = [string]$secretKey
  }
}

function Test-RecentBackup {
  <# Exige um backup bem-sucedido e recente antes de qualquer `apply`. O formato de data do gcloud pode virar DateTime no ConvertFrom-Json. #>
  param($Backups, [Parameter(Mandatory)][datetime]$Now, [int]$MaxAgeMinutes = 120)
  $newest = $null
  foreach ($backup in @($Backups)) {
    if ($null -eq $backup -or (Get-Prop $backup 'status') -ne 'SUCCESSFUL') { continue }
    $raw = Get-Prop $backup 'endTime'
    if ($null -eq $raw) { $raw = Get-Prop $backup 'windowStartTime' }
    if ($null -eq $raw) { continue }
    $moment = if ($raw -is [datetime]) { $raw.ToUniversalTime() }
    else { [datetimeoffset]::Parse([string]$raw, [System.Globalization.CultureInfo]::InvariantCulture).UtcDateTime }
    if ($null -eq $newest -or $moment -gt $newest) { $newest = $moment }
  }
  if ($null -eq $newest) {
    return [pscustomobject]@{ Ok = $false; Reason = 'Não há backup bem-sucedido; crie um sob demanda antes de aplicar.'; At = $null }
  }
  $age = ($Now.ToUniversalTime() - $newest).TotalMinutes
  if ($age -lt 0) {
    return [pscustomobject]@{ Ok = $false; Reason = 'O backup mais recente está no futuro; confira os relógios.'; At = $newest }
  }
  if ($age -gt $MaxAgeMinutes) {
    return [pscustomobject]@{ Ok = $false; Reason = ("O último backup bem-sucedido tem {0:N0} min (limite {1}); crie outro sob demanda." -f $age, $MaxAgeMinutes); At = $newest }
  }
  return [pscustomobject]@{ Ok = $true; Reason = ("Backup bem-sucedido há {0:N0} min." -f $age); At = $newest }
}

function New-MigrationJobName {
  param([Parameter(Mandatory)][string]$Mode, [Parameter(Mandatory)][datetime]$Now)
  return "forgelex-migrate-$Mode-$($Now.ToUniversalTime().ToString('yyyyMMddHHmmss'))"
}

function New-MigrationJobCommands {
  <# Devolve os argumentos de gcloud (sem o executável) para criar, executar, ler os logs e apagar o Job. Não executa nada. #>
  param(
    [Parameter(Mandatory)][ValidateSet('inspect', 'apply', 'verify')][string]$Mode,
    [Parameter(Mandatory)][string]$JobName,
    [Parameter(Mandatory)]$Settings,
    [Parameter(Mandatory)][string]$Image,
    [string[]]$Allow = @(),
    [Parameter(Mandatory)][string]$ProjectId,
    [Parameter(Mandatory)][string]$Region,
    [string]$ExpectedDatabase = 'forgelex'
  )
  if ($Image -notmatch '^[a-z0-9.-]+(/[a-z0-9._-]+)+@sha256:[0-9a-f]{64}$') {
    throw 'A imagem deve estar fixada por digest (registro/caminho@sha256:...).'
  }
  if ($JobName -notmatch '^[a-z][a-z0-9-]{0,62}$') { throw "Nome de Job inválido: $JobName" }
  foreach ($id in $Allow) {
    if ($id -notmatch '^[a-z0-9][a-z0-9-]*$') { throw "ID de migration inválido em -Allow: '$id'" }
  }
  if ($Mode -eq 'apply' -and @($Allow).Count -eq 0) { throw 'apply exige -Allow com ao menos um ID de migration.' }
  if ($Mode -eq 'inspect' -and @($Allow).Count -gt 0) { throw 'inspect não aceita -Allow.' }
  # O gcloud divide --args em vírgulas; nenhum destes valores tem vírgula, então cada um vira um argumento.
  $toolArguments = @($script:MigrationToolPath, $Mode) + @($Allow | ForEach-Object { "--allow=$_" })
  $scope = @("--project=$ProjectId", "--region=$Region")
  return [pscustomobject]@{
    Create  = @('run', 'jobs', 'create', $JobName) + $scope + @(
      "--image=$Image",
      "--service-account=$($Settings.ServiceAccount)",
      "--set-cloudsql-instances=$($Settings.CloudSqlInstance)",
      "--set-secrets=DATABASE_URL=$($Settings.SecretName):$($Settings.SecretKey)",
      "--set-env-vars=FORGELEX_MIGRATION_EXPECTED_DATABASE=$ExpectedDatabase,FORGELEX_MIGRATION_EXPECTED_HOST=$($Settings.DatabaseHost)",
      '--command=node',
      "--args=$($toolArguments -join ',')",
      '--tasks=1', '--parallelism=1',
      # Sem nova tentativa automática: um `apply` que falhou a meio precisa ser lido por uma pessoa antes de repetir.
      '--max-retries=0',
      '--task-timeout=600s', '--cpu=1', '--memory=512Mi', '--quiet'
    )
    Execute = @('run', 'jobs', 'execute', $JobName) + $scope + @('--wait', '--quiet')
    Logs    = @('logging', 'read', "resource.type=`"cloud_run_job`" AND resource.labels.job_name=`"$JobName`" AND (jsonPayload:* OR textPayload:*)", "--project=$ProjectId", '--freshness=2h', '--order=asc')
    Delete  = @('run', 'jobs', 'delete', $JobName) + $scope + @('--quiet')
  }
}

function Format-MigrationLogEntries {
  <# Uma linha por entrada: JSON do jsonPayload (a ferramenta imprime JSON) ou o texto. #>
  param($Entries)
  foreach ($entry in @($Entries)) {
    if ($null -eq $entry) { continue }
    $json = Get-Prop $entry 'jsonPayload'
    $text = Get-Prop $entry 'textPayload'
    if ($null -ne $json) { ($json | ConvertTo-Json -Depth 8 -Compress) }
    elseif ($text) { [string]$text }
  }
}

function Test-MigrationOutcome {
  <# Lê as entradas de log e diz como a ferramenta terminou: completed, failed ou unknown. #>
  param($Entries)
  $outcome = 'unknown'
  foreach ($entry in @($Entries)) {
    $event = Get-Prop $entry 'jsonPayload.event'
    if ($event -eq 'migration.completed') { $outcome = 'completed' }
    elseif ($event -eq 'migration.failed') { return 'failed' }
  }
  return $outcome
}
