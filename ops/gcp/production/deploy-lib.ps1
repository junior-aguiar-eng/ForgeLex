#Requires -Version 7.0
# Funções do deploy de produção. Sem efeito colateral ao ser carregado: tudo que fala com gcloud passa por
# Invoke-Gcloud / Invoke-GcloudJson, que os testes substituem por fakes (deploy-from-main.tests.ps1).
Set-StrictMode -Version Latest

# Substituições que o cloudbuild.yaml usa. O build anterior bem-sucedido é a fonte de todas elas, para que
# a publicação não dependa de lembrar flags de interface (o padrão do cloudbuild.yaml é 'false').
$script:RequiredSubstitutions = @(
  '_IMAGE_URI',
  '_SOURCE_SHA',
  '_SUPABASE_PROJECT_REF',
  '_VITE_SUPABASE_URL',
  '_VITE_SUPABASE_PUBLISHABLE_KEY',
  '_VITE_FORGELEX_SAVED_RESEARCH_ENABLED',
  '_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED',
  '_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'
)
$script:FlagSubstitutions = @(
  '_VITE_FORGELEX_SAVED_RESEARCH_ENABLED',
  '_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED',
  '_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'
)

function Get-Prop {
  # Leitura tolerante de JSON do gcloud: devolve $null em vez de falhar quando um campo opcional não existe.
  param($Object, [Parameter(Mandatory)][string]$Path)
  $current = $Object
  foreach ($part in $Path.Split('.')) {
    if ($null -eq $current) { return $null }
    $property = $current.PSObject.Properties[$part]
    if ($null -eq $property) { return $null }
    $current = $property.Value
  }
  return $current
}

function Invoke-Gcloud {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$AllowFailure
  )
  $output = & gcloud @Arguments 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  if ($code -ne 0 -and -not $AllowFailure) {
    $tail = ($output | Select-Object -Last 6) -join ' | '
    throw "gcloud $($Arguments[0..2] -join ' ') falhou (exit $code): $tail"
  }
  return [pscustomobject]@{ ExitCode = $code; Output = @($output) }
}

function Invoke-GcloudJson {
  # Só o stdout é lido como JSON; o stderr (progresso, avisos) vai para um arquivo temporário.
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$AllowFailure
  )
  $errorFile = [System.IO.Path]::GetTempFileName()
  try {
    $text = & gcloud @Arguments '--format=json' 2>$errorFile
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      if ($AllowFailure) { return $null }
      throw "gcloud $($Arguments[0..2] -join ' ') falhou (exit $code): $((Get-Content -Raw $errorFile) -replace '\s+', ' ')"
    }
    $joined = ($text -join "`n")
    if ([string]::IsNullOrWhiteSpace($joined)) { return $null }
    return ($joined | ConvertFrom-Json -Depth 30)
  }
  finally {
    Remove-Item -LiteralPath $errorFile -ErrorAction SilentlyContinue
  }
}

function Get-ServingRevision {
  # A revisão que recebe 100% do tráfego. Tráfego dividido (canário) é recusado: não há "a revisão anterior".
  param([Parameter(Mandatory)]$Service)
  # O gcloud omite 'percent' nas entradas com 0% (tags de revisões antigas); a ausência vale 0.
  $percent = { param($entry) [int](Get-Prop $entry 'percent') }
  $serving = @(@(Get-Prop $Service 'status.traffic') | Where-Object { $null -ne $_ -and (& $percent $_) -gt 0 })
  $name = Get-Prop $Service 'metadata.name'
  if ($serving.Count -ne 1 -or (& $percent $serving[0]) -ne 100) {
    throw "O tráfego de '$name' está dividido entre revisões; resolva antes de publicar."
  }
  $revision = Get-Prop $serving[0] 'revisionName'
  if (-not $revision -and (Get-Prop $serving[0] 'latestRevision')) {
    $revision = Get-Prop $Service 'status.latestReadyRevisionName'
  }
  if (-not $revision) { throw "Não foi possível identificar a revisão em uso de '$name'." }
  return [string]$revision
}

function Select-ProductionBuild {
  # O build bem-sucedido mais recente que traz todas as substituições da produção. Builds antigos, anteriores
  # às flags de interface, são ignorados em vez de produzirem uma imagem sem a mesa agêntica.
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Builds,
    [Parameter(Mandatory)][string]$ImageUri
  )
  foreach ($build in $Builds) {
    if ($null -eq $build) { continue }
    $status = Get-Prop $build 'status'
    $subs = Get-Prop $build 'substitutions'
    if ($status -ne 'SUCCESS' -or $null -eq $subs) { continue }
    $table = @{}
    foreach ($property in $subs.PSObject.Properties) { $table[$property.Name] = [string]$property.Value }
    if ($table['_IMAGE_URI'] -ne $ImageUri) { continue }
    $complete = $true
    foreach ($key in $script:RequiredSubstitutions) {
      if (-not $table.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($table[$key])) { $complete = $false; break }
    }
    if ($complete) {
      return [pscustomobject]@{ Id = [string](Get-Prop $build 'id'); Substitutions = $table }
    }
  }
  throw 'Nenhum build anterior bem-sucedido traz todas as substituições da produção. Use o build-from-main.ps1 uma vez, informando as flags.'
}

function New-BuildSubstitutions {
  param(
    [Parameter(Mandatory)][hashtable]$Previous,
    [Parameter(Mandatory)][string]$Sha,
    [hashtable]$Overrides = @{}
  )
  $result = [ordered]@{}
  foreach ($key in $script:RequiredSubstitutions) {
    if (-not $Previous.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($Previous[$key])) {
      throw "Substituição ausente no build anterior: $key"
    }
    $result[$key] = [string]$Previous[$key]
  }
  $result['_SOURCE_SHA'] = $Sha
  foreach ($key in $Overrides.Keys) {
    if ($key -notin $script:FlagSubstitutions) { throw "Só as flags de interface podem ser trocadas: $key" }
    $result[$key] = [string]$Overrides[$key]
  }
  if ($result['_SOURCE_SHA'] -notmatch '^[0-9a-f]{40}$') { throw 'SHA de origem inválido.' }
  if ($result['_VITE_SUPABASE_PUBLISHABLE_KEY'] -notmatch '^sb_publishable_[A-Za-z0-9_-]{8,}$') {
    throw 'A chave de build deve ser publishable (sb_publishable_...), nunca secret ou service_role.'
  }
  $ref = ([uri]$result['_VITE_SUPABASE_URL']).Host -replace '\.supabase\.co$', ''
  if ($ref -notmatch '^[a-z0-9]{20}$') { throw 'Supabase URL de produção inválida.' }
  if ($ref -ne $result['_SUPABASE_PROJECT_REF']) { throw 'A URL e o project ref do Supabase divergem.' }
  foreach ($flag in $script:FlagSubstitutions) {
    if ($result[$flag] -notin @('true', 'false')) { throw "Flag inválida: $flag deve ser 'true' ou 'false'." }
  }
  foreach ($value in $result.Values) {
    if ($value -match '[,\s]') { throw 'Valor de substituição com vírgula ou espaço não é suportado.' }
  }
  return $result
}

function ConvertTo-SubstitutionArgument {
  param([Parameter(Mandatory)][System.Collections.IDictionary]$Substitutions)
  return (($Substitutions.Keys | ForEach-Object { "$_=$($Substitutions[$_])" }) -join ',')
}

function Format-MaskedSubstitutions {
  # Para exibição: a chave publishable é pública por desenho, mas não há motivo para imprimi-la inteira.
  param([Parameter(Mandatory)][System.Collections.IDictionary]$Substitutions)
  return @($Substitutions.Keys | ForEach-Object {
      $value = $Substitutions[$_]
      if ($_ -eq '_VITE_SUPABASE_PUBLISHABLE_KEY') { $value = 'sb_publishable_***' }
      '{0,-44} {1}' -f $_, $value
    })
}

function ConvertTo-EnvMap {
  param($Container)
  $map = [ordered]@{}
  foreach ($entry in @(Get-Prop $Container 'env')) {
    if ($null -eq $entry) { continue }
    $from = Get-Prop $entry 'valueFrom'
    $map[[string]$entry.name] = if ($null -ne $from) {
      'valueFrom:' + ($from | ConvertTo-Json -Compress -Depth 10)
    }
    else {
      'value:' + [string](Get-Prop $entry 'value')
    }
  }
  return $map
}

function Compare-RevisionConfig {
  # Lista tudo o que difere entre duas revisões, exceto a imagem e as variáveis permitidas. Lista vazia = a revisão
  # nova é a antiga com outro código. Qualquer item deve impedir a troca de tráfego.
  param(
    [Parameter(Mandatory)]$Old,
    [Parameter(Mandatory)]$New,
    [string[]]$AllowedEnv = @('FORGELEX_SOURCE_SHA')
  )
  $differences = [System.Collections.Generic.List[string]]::new()
  $oldContainers = @(Get-Prop $Old 'spec.containers')
  $newContainers = @(Get-Prop $New 'spec.containers')
  if ($oldContainers.Count -ne $newContainers.Count) {
    $differences.Add("número de contêineres: $($oldContainers.Count) -> $($newContainers.Count)")
    return $differences.ToArray()
  }
  $oldC = $oldContainers[0]
  $newC = $newContainers[0]

  $oldEnv = ConvertTo-EnvMap $oldC
  $newEnv = ConvertTo-EnvMap $newC
  foreach ($name in @($oldEnv.Keys) + @($newEnv.Keys) | Sort-Object -Unique) {
    if ($name -in $AllowedEnv) { continue }
    if (-not $oldEnv.Contains($name)) { $differences.Add("variável nova: $name"); continue }
    if (-not $newEnv.Contains($name)) { $differences.Add("variável removida: $name"); continue }
    if ($oldEnv[$name] -ne $newEnv[$name]) { $differences.Add("variável alterada: $name") }
  }

  foreach ($field in 'resources', 'command', 'args', 'ports', 'startupProbe', 'livenessProbe') {
    $a = (Get-Prop $oldC $field) | ConvertTo-Json -Compress -Depth 10
    $b = (Get-Prop $newC $field) | ConvertTo-Json -Compress -Depth 10
    if ($a -ne $b) { $differences.Add("contêiner.$field") }
  }
  foreach ($path in 'spec.serviceAccountName', 'spec.timeoutSeconds', 'spec.containerConcurrency') {
    if ([string](Get-Prop $Old $path) -ne [string](Get-Prop $New $path)) { $differences.Add($path) }
  }

  $infra = '(autoscaling|vpc-access|cloudsql|cpu-throttling|startup-cpu-boost|network-interfaces|execution-environment|sessionAffinity)'
  $pick = {
    param($revision)
    $out = [ordered]@{}
    $annotations = Get-Prop $revision 'metadata.annotations'
    if ($null -ne $annotations) {
      foreach ($property in ($annotations.PSObject.Properties | Sort-Object Name)) {
        if ($property.Name -match $infra) { $out[$property.Name] = [string]$property.Value }
      }
    }
    return ($out | ConvertTo-Json -Compress)
  }
  if ((& $pick $Old) -ne (& $pick $New)) { $differences.Add('anotações de escala, rede ou CPU') }

  # Sem vírgula à frente: um array embrulhado chega ao chamador como UM elemento, e @(...) nunca ficaria vazio.
  # Quem chama deve usar @(Compare-RevisionConfig ...).
  return $differences.ToArray()
}

function Test-PublicHealth {
  # Sonda pública: /health e /readyz devem dar 200 e /mcp sem token deve dar 401 (o desafio OAuth).
  param(
    [Parameter(Mandatory)][string]$BaseUrl,
    [int]$Attempts = 6,
    [int]$DelaySeconds = 3,
    [scriptblock]$Probe
  )
  if ($null -eq $Probe) {
    $Probe = {
      param($Method, $Url, $Body)
      $arguments = @{ Uri = $Url; Method = $Method; TimeoutSec = 20; SkipHttpErrorCheck = $true }
      if ($Method -eq 'POST') { $arguments.ContentType = 'application/json'; $arguments.Body = $Body }
      try { return [int](Invoke-WebRequest @arguments).StatusCode } catch { return 0 }
    }
  }
  $base = $BaseUrl.TrimEnd('/')
  $checks = @(
    @{ Name = 'GET /health'; Method = 'GET'; Path = '/health'; Expected = 200; Body = $null },
    @{ Name = 'GET /readyz'; Method = 'GET'; Path = '/readyz'; Expected = 200; Body = $null },
    @{ Name = 'POST /mcp sem token'; Method = 'POST'; Path = '/mcp'; Expected = 401; Body = '{"jsonrpc":"2.0","id":1,"method":"ping"}' }
  )
  $failures = [System.Collections.Generic.List[string]]::new()
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    foreach ($check in $checks) {
      $status = & $Probe $check.Method ($base + $check.Path) $check.Body
      if ($status -ne $check.Expected) {
        $failures.Add("tentativa ${attempt}: $($check.Name) deu $status (esperado $($check.Expected))")
      }
    }
    if ($attempt -lt $Attempts -and $DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
  }
  return [pscustomobject]@{ Ok = ($failures.Count -eq 0); Failures = $failures.ToArray() }
}

function Switch-Traffic {
  # Troca o tráfego na ordem do plano, verifica e, se qualquer passo ou a verificação falhar, devolve tudo para as
  # revisões anteriores, na ordem inversa. Nunca deixa a produção pela metade sem avisar: o resultado diz o que houve.
  param(
    [Parameter(Mandatory)][object[]]$Plan,
    [Parameter(Mandatory)][string]$ProjectId,
    [Parameter(Mandatory)][string]$Region,
    [Parameter(Mandatory)][scriptblock]$Verify,
    [scriptblock]$Log = { param($message) Write-Host $message }
  )
  $touched = [System.Collections.Generic.List[object]]::new()
  try {
    foreach ($step in $Plan) {
      if ($step.Previous -eq $step.Revision) {
        & $Log "  $($step.Service): já recebe 100% em $($step.Revision); nada a trocar"
        continue
      }
      # Entra na lista antes do comando: se ele falhar no meio, reverter para a revisão anterior é inofensivo.
      $touched.Add($step)
      & $Log "  $($step.Service): 100% para $($step.Revision)"
      Invoke-Gcloud -Arguments @('run', 'services', 'update-traffic', $step.Service, "--project=$ProjectId", "--region=$Region", "--to-revisions=$($step.Revision)=100", '--quiet') | Out-Null
    }
    $verdict = & $Verify
    if (-not $verdict.Ok) { throw "verificação falhou: $($verdict.Failures -join '; ')" }
    return [pscustomobject]@{ Ok = $true; RolledBack = $false; Reason = $null; Errors = @() }
  }
  catch {
    $reason = $_.Exception.Message
    & $Log "FALHA: $reason"
    & $Log 'Revertendo o tráfego para as revisões anteriores...'
    $errors = [System.Collections.Generic.List[string]]::new()
    for ($index = $touched.Count - 1; $index -ge 0; $index--) {
      $step = $touched[$index]
      try {
        Invoke-Gcloud -Arguments @('run', 'services', 'update-traffic', $step.Service, "--project=$ProjectId", "--region=$Region", "--to-revisions=$($step.Previous)=100", '--quiet') | Out-Null
        & $Log "  $($step.Service): de volta para $($step.Previous)"
      }
      catch {
        $errors.Add("$($step.Service): $($_.Exception.Message)")
        & $Log "  $($step.Service): FALHOU ao reverter ($($_.Exception.Message))"
      }
    }
    return [pscustomobject]@{ Ok = $false; RolledBack = ($errors.Count -eq 0); Reason = $reason; Errors = $errors.ToArray() }
  }
}
