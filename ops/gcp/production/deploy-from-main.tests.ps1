#Requires -Version 7.0
# Testes da lógica de deploy. Não usam gcloud, git, rede nem credenciais: tudo que fala com o mundo é um fake.
#   pwsh -NoProfile -File ops/gcp/production/deploy-from-main.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')
. (Join-Path $PSScriptRoot 'migrate-lib.ps1')

$script:passed = 0
$script:failed = 0
function Test-Case {
  param([string]$Name, [scriptblock]$Body)
  try { & $Body; $script:passed++; Write-Host "  ok    $Name" }
  catch { $script:failed++; Write-Host "  FALHA $Name`n        $($_.Exception.Message)" -ForegroundColor Red }
}
function Assert-Equal {
  param($Actual, $Expected, [string]$Message = '')
  if ("$Actual" -ne "$Expected") { throw "esperado '$Expected', obtido '$Actual'. $Message" }
}
function Assert-True {
  param($Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}
function Assert-Throws {
  param([scriptblock]$Body, [string]$Pattern)
  $threw = $false
  try { & $Body } catch {
    $threw = $true
    if ($_.Exception.Message -notmatch $Pattern) { throw "mensagem inesperada: $($_.Exception.Message)" }
  }
  if (-not $threw) { throw "deveria ter lançado /$Pattern/" }
}
function ConvertFrom-JsonText { param([string]$Text) return ($Text | ConvertFrom-Json -Depth 30) }

# ---------- Fixtures ----------
$sha = 'a' * 40
$ref = 'abcdefghij0123456789'
$goodSubs = @{
  '_IMAGE_URI'                              = 'southamerica-east1-docker.pkg.dev/p/forgelex-prod/forgelex-api'
  '_SOURCE_SHA'                             = 'b' * 40
  '_SUPABASE_PROJECT_REF'                   = $ref
  '_VITE_SUPABASE_URL'                      = "https://$ref.supabase.co"
  '_VITE_SUPABASE_PUBLISHABLE_KEY'          = 'sb_publishable_TESTEXAMPLE12345'
  '_VITE_FORGELEX_SAVED_RESEARCH_ENABLED'   = 'true'
  '_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED' = 'true'
  '_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'   = 'true'
}
function New-Build {
  param([string]$Id, [string]$Status = 'SUCCESS', [hashtable]$Substitutions = $goodSubs)
  $copy = @{}
  foreach ($key in $Substitutions.Keys) { $copy[$key] = $Substitutions[$key] }
  return [pscustomobject]@{ id = $Id; status = $Status; substitutions = [pscustomobject]$copy }
}
function New-Service {
  param([string]$Name, [object[]]$Traffic)
  return [pscustomobject]@{
    metadata = [pscustomobject]@{ name = $Name }
    status   = [pscustomobject]@{ traffic = $Traffic; latestReadyRevisionName = "$Name-latest" }
  }
}
function New-Revision {
  param([hashtable]$Env = @{ A = '1' }, [hashtable]$Secrets = @{ S = 'projects/p/secrets/s' }, [string]$Cpu = '1',
    [string]$Account = 'svc@p.iam', [int]$Timeout = 360, [string]$MaxScale = '2', [string]$Sha = 'old')
  $entries = @()
  foreach ($key in $Env.Keys) { $entries += [pscustomobject]@{ name = $key; value = $Env[$key] } }
  foreach ($key in $Secrets.Keys) {
    $entries += [pscustomobject]@{ name = $key; valueFrom = [pscustomobject]@{ secretKeyRef = [pscustomobject]@{ name = $Secrets[$key]; key = 'latest' } } }
  }
  $entries += [pscustomobject]@{ name = 'FORGELEX_SOURCE_SHA'; value = $Sha }
  return [pscustomobject]@{
    metadata = [pscustomobject]@{ annotations = [pscustomobject]@{ 'autoscaling.knative.dev/maxScale' = $MaxScale; 'run.googleapis.com/client-name' = "x$Sha" } }
    spec     = [pscustomobject]@{
      serviceAccountName = $Account; timeoutSeconds = $Timeout; containerConcurrency = 80
      containers         = @([pscustomobject]@{ image = "img@sha256:$Sha"; env = $entries; resources = [pscustomobject]@{ limits = [pscustomobject]@{ cpu = $Cpu; memory = '512Mi' } } })
    }
  }
}

Write-Host 'Get-ServingRevision'
Test-Case 'devolve a revisão com 100%' {
  $service = New-Service 'api' @([pscustomobject]@{ revisionName = 'api-1'; percent = 100 }, [pscustomobject]@{ revisionName = 'api-0'; percent = 0; tag = 't' })
  Assert-Equal (Get-ServingRevision $service) 'api-1'
}
Test-Case 'entradas com 0% vêm sem a propriedade percent no gcloud real e não podem quebrar a leitura' {
  # Regressão: o StrictMode lançava "The property 'percent' cannot be found" contra a produção.
  $service = New-Service 'api' @(
    [pscustomobject]@{ revisionName = 'api-00001'; tag = 'phase4b-candidate' },
    [pscustomobject]@{ revisionName = 'api-00002' },
    [pscustomobject]@{ revisionName = 'api-9'; percent = 100 }
  )
  Assert-Equal (Get-ServingRevision $service) 'api-9'
}
Test-Case 'tráfego dividido com uma das partes sem percent também é recusado' {
  $service = New-Service 'api' @([pscustomobject]@{ revisionName = 'api-1'; percent = 50 }, [pscustomobject]@{ revisionName = 'api-2'; percent = 50 }, [pscustomobject]@{ revisionName = 'api-0'; tag = 'x' })
  Assert-Throws { Get-ServingRevision $service } 'dividido'
}
Test-Case 'resolve latestRevision para a última revisão pronta' {
  $service = New-Service 'api' @([pscustomobject]@{ latestRevision = $true; percent = 100 })
  Assert-Equal (Get-ServingRevision $service) 'api-latest'
}
Test-Case 'recusa tráfego dividido' {
  $service = New-Service 'api' @([pscustomobject]@{ revisionName = 'api-1'; percent = 90 }, [pscustomobject]@{ revisionName = 'api-2'; percent = 10 })
  Assert-Throws { Get-ServingRevision $service } 'dividido'
}
Test-Case 'recusa serviço sem tráfego' {
  Assert-Throws { Get-ServingRevision (New-Service 'api' @()) } 'dividido'
}

Write-Host 'Select-ProductionBuild'
$image = $goodSubs['_IMAGE_URI']
Test-Case 'escolhe o primeiro build completo' {
  $result = Select-ProductionBuild -Builds @((New-Build 'novo'), (New-Build 'velho')) -ImageUri $image
  Assert-Equal $result.Id 'novo'
}
Test-Case 'ignora build antigo sem as flags de interface em vez de usá-lo' {
  $old = @{}; foreach ($key in $goodSubs.Keys) { $old[$key] = $goodSubs[$key] }
  $old.Remove('_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED'); $old.Remove('_VITE_FORGELEX_CASE_WORKSPACE_ENABLED')
  $result = Select-ProductionBuild -Builds @((New-Build 'sem-flags' -Substitutions $old), (New-Build 'completo')) -ImageUri $image
  Assert-Equal $result.Id 'completo'
}
Test-Case 'ignora build com falha e build de outra imagem' {
  $other = @{}; foreach ($key in $goodSubs.Keys) { $other[$key] = $goodSubs[$key] }; $other['_IMAGE_URI'] = 'outra/imagem'
  $result = Select-ProductionBuild -Builds @((New-Build 'falhou' -Status 'FAILURE'), (New-Build 'outra' -Substitutions $other), (New-Build 'bom')) -ImageUri $image
  Assert-Equal $result.Id 'bom'
}
Test-Case 'lança quando nenhum build serve' {
  Assert-Throws { Select-ProductionBuild -Builds @((New-Build 'x' -Status 'FAILURE')) -ImageUri $image } 'Nenhum build anterior'
  Assert-Throws { Select-ProductionBuild -Builds @() -ImageUri $image } 'Nenhum build anterior'
}

Write-Host 'New-BuildSubstitutions'
Test-Case 'copia tudo do build anterior e troca só o SHA' {
  $result = New-BuildSubstitutions -Previous $goodSubs -Sha $sha
  Assert-Equal $result['_SOURCE_SHA'] $sha
  Assert-Equal $result['_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED'] 'true'
  Assert-Equal $result['_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'] 'true'
  Assert-Equal $result.Count 11
}
Test-Case 'flags da Mesa ausentes no build anterior valem false, como no cloudbuild.yaml' {
  $result = New-BuildSubstitutions -Previous $goodSubs -Sha $sha
  foreach ($key in '_VITE_FORGELEX_DESK_SHELL', '_VITE_FORGELEX_ATTACHMENTS_ENABLED', '_VITE_FORGELEX_MATTER_CHIPS_ENABLED') {
    Assert-Equal $result[$key] 'false'
  }
}
Test-Case 'flags da Mesa presentes no build anterior são preservadas e podem ser trocadas de propósito' {
  $prev = @{}; foreach ($key in $goodSubs.Keys) { $prev[$key] = $goodSubs[$key] }
  $prev['_VITE_FORGELEX_DESK_SHELL'] = 'true'
  $kept = New-BuildSubstitutions -Previous $prev -Sha $sha
  Assert-Equal $kept['_VITE_FORGELEX_DESK_SHELL'] 'true'
  Assert-Equal $kept['_VITE_FORGELEX_ATTACHMENTS_ENABLED'] 'false'
  $on = New-BuildSubstitutions -Previous $goodSubs -Sha $sha -Overrides @{ '_VITE_FORGELEX_ATTACHMENTS_ENABLED' = 'true'; '_VITE_FORGELEX_MATTER_CHIPS_ENABLED' = 'true' }
  Assert-Equal $on['_VITE_FORGELEX_ATTACHMENTS_ENABLED'] 'true'
  Assert-Equal $on['_VITE_FORGELEX_MATTER_CHIPS_ENABLED'] 'true'
  Assert-Throws { New-BuildSubstitutions -Previous $goodSubs -Sha $sha -Overrides @{ '_VITE_FORGELEX_DESK_SHELL' = 'sim' } } 'Flag inválida'
}
Test-Case 'aceita troca explícita de flag de interface' {
  $result = New-BuildSubstitutions -Previous $goodSubs -Sha $sha -Overrides @{ '_VITE_FORGELEX_CASE_WORKSPACE_ENABLED' = 'false' }
  Assert-Equal $result['_VITE_FORGELEX_CASE_WORKSPACE_ENABLED'] 'false'
  Assert-Equal $result['_VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED'] 'true'
}
Test-Case 'recusa trocar qualquer coisa além das flags' {
  Assert-Throws { New-BuildSubstitutions -Previous $goodSubs -Sha $sha -Overrides @{ '_IMAGE_URI' = 'outra' } } 'Só as flags'
}
Test-Case 'recusa chave que não seja publishable' {
  $bad = @{}; foreach ($key in $goodSubs.Keys) { $bad[$key] = $goodSubs[$key] }
  foreach ($value in 'sb_secret_ABCDEFGH1234', 'eyJhbGciOiJIUzI1NiJ9.service_role') {
    $bad['_VITE_SUPABASE_PUBLISHABLE_KEY'] = $value
    Assert-Throws { New-BuildSubstitutions -Previous $bad -Sha $sha } 'publishable'
  }
}
Test-Case 'recusa URL e project ref divergentes, SHA curto e flag inválida' {
  $bad = @{}; foreach ($key in $goodSubs.Keys) { $bad[$key] = $goodSubs[$key] }
  $bad['_SUPABASE_PROJECT_REF'] = 'zzzzzzzzzz0123456789'
  Assert-Throws { New-BuildSubstitutions -Previous $bad -Sha $sha } 'divergem'
  Assert-Throws { New-BuildSubstitutions -Previous $goodSubs -Sha 'abc123' } 'SHA'
  Assert-Throws { New-BuildSubstitutions -Previous $goodSubs -Sha $sha -Overrides @{ '_VITE_FORGELEX_CASE_WORKSPACE_ENABLED' = 'talvez' } } 'Flag inválida'
}
Test-Case 'recusa substituição ausente' {
  $bad = @{}; foreach ($key in $goodSubs.Keys) { $bad[$key] = $goodSubs[$key] }
  $bad.Remove('_VITE_FORGELEX_CASE_WORKSPACE_ENABLED')
  Assert-Throws { New-BuildSubstitutions -Previous $bad -Sha $sha } 'ausente'
}
Test-Case 'monta o argumento do gcloud e mascara a chave na exibição' {
  $subs = New-BuildSubstitutions -Previous $goodSubs -Sha $sha
  $argument = ConvertTo-SubstitutionArgument $subs
  Assert-True ($argument -match "_SOURCE_SHA=$sha") 'falta o SHA no argumento'
  Assert-True ($argument -match 'sb_publishable_TESTEXAMPLE12345') 'o argumento real deve levar a chave'
  $shown = (Format-MaskedSubstitutions $subs) -join "`n"
  Assert-True ($shown -notmatch 'TESTEXAMPLE') 'a chave apareceu na exibição'
  Assert-True ($shown -match 'sb_publishable_\*\*\*') 'a máscara não apareceu'
}

Write-Host 'Get-TrustedBuildOutput'
$trustedBuildId = '12345678-1234-4234-9234-123456789abc'
$trustedProject = 'project-test'
$trustedDigest = 'sha256:' + ('c' * 64)
function New-TrustedBuild {
  param(
    [string]$Id = $trustedBuildId,
    [string]$ProjectId = $trustedProject,
    [string]$Status = 'SUCCESS',
    [hashtable]$Substitutions,
    [object[]]$Images
  )
  if ($null -eq $Substitutions) {
    $Substitutions = @{}; foreach ($key in $script:trustedExpected.Keys) { $Substitutions[$key] = $script:trustedExpected[$key] }
  }
  if ($null -eq $Images) {
    $Images = @([pscustomobject]@{ name = "$($script:trustedImage):$($script:trustedExpected['_SOURCE_SHA'])"; digest = $trustedDigest })
  }
  return [pscustomobject]@{
    id = $Id; projectId = $ProjectId; status = $Status; substitutions = [pscustomobject]$Substitutions
    results = [pscustomobject]@{ images = $Images }
  }
}
$script:trustedExpected = New-BuildSubstitutions -Previous $goodSubs -Sha $sha
$script:trustedImage = $goodSubs['_IMAGE_URI']

Test-Case 'aceita somente a imagem vinculada ao resultado do build esperado' {
  $result = Get-TrustedBuildOutput -Build (New-TrustedBuild) -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected
  Assert-Equal $result.Id $trustedBuildId
  Assert-Equal $result.Image "$($script:trustedImage)@$trustedDigest"
  Assert-Equal $result.RevisionSuffix 'aaaaaaa-12345678'
}
Test-Case 'recusa build de outro SHA ou com substituições diferentes' {
  $wrong = @{}; foreach ($key in $script:trustedExpected.Keys) { $wrong[$key] = $script:trustedExpected[$key] }
  $wrong['_SOURCE_SHA'] = 'b' * 40
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -Substitutions $wrong) -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'substituição esperada _SOURCE_SHA'
}
Test-Case 'recusa tag, digest ou quantidade de imagens divergente' {
  $wrongTag = @([pscustomobject]@{ name = "$($script:trustedImage):$('b' * 40)"; digest = $trustedDigest })
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -Images $wrongTag) -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'exatamente a imagem esperada'
  $wrongDigest = @([pscustomobject]@{ name = "$($script:trustedImage):$sha"; digest = 'sha256:curto' })
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -Images $wrongDigest) -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'digest válido'
  $extra = @((New-TrustedBuild).results.images[0], [pscustomobject]@{ name = 'outra'; digest = $trustedDigest })
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -Images $extra) -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'exatamente a imagem esperada'
}
Test-Case 'recusa build sem identidade, projeto ou sucesso esperados' {
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -Id 'previsivel') -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'ID válido'
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -ProjectId 'outro') -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'outro projeto'
  Assert-Throws { Get-TrustedBuildOutput -Build (New-TrustedBuild -Status 'FAILURE') -ProjectId $trustedProject -ImageUri $script:trustedImage -ExpectedSubstitutions $script:trustedExpected } 'SUCCESS'
}
Test-Case 'script nunca autoriza release pela existência de tag' {
  $deploySource = Get-Content -Raw (Join-Path $PSScriptRoot 'deploy-from-main.ps1')
  $buildSource = Get-Content -Raw (Join-Path $PSScriptRoot 'build-from-main.ps1')
  Assert-True ($deploySource -notmatch "'artifacts', 'docker', 'images', 'describe'") 'o deploy voltou a consultar uma tag mutável'
  Assert-True ($buildSource -notmatch 'artifacts docker images describe') 'o build auxiliar voltou a consultar uma tag mutável'
  Assert-True ($deploySource -match "'builds', 'submit'") 'o deploy deixou de criar um build para a promoção'
  Assert-True ($deploySource -match 'Get-TrustedBuildOutput') 'o digest não está vinculado ao resultado do build'
  Assert-True ($buildSource -match 'Get-TrustedBuildOutput') 'o build auxiliar não vinculou o digest ao resultado'
}

Write-Host 'Compare-RevisionConfig'
Test-Case 'revisões iguais, exceto FORGELEX_SOURCE_SHA e a imagem, não têm diferenças' {
  # @(...) é como o deploy-from-main.ps1 chama; sem ele este teste escondeu um array embrulhado (Count sempre 1).
  $result = @(Compare-RevisionConfig -Old (New-Revision -Sha 'old') -New (New-Revision -Sha 'new'))
  Assert-Equal $result.Count 0
}
Test-Case 'uma única diferença chega como texto, não como array embrulhado' {
  $result = @(Compare-RevisionConfig -Old (New-Revision -Env @{ A = '1' }) -New (New-Revision -Env @{ A = '2' }))
  Assert-Equal $result.Count 1
  Assert-Equal ($result -join '; ') 'variável alterada: A'
}
Test-Case 'detecta variável alterada, nova e removida' {
  $old = New-Revision -Env @{ A = '1'; B = '2' }
  $new = New-Revision -Env @{ A = 'X'; C = '3' }
  $result = @(Compare-RevisionConfig -Old $old -New $new)
  Assert-True ($result -contains 'variável alterada: A') 'não viu A alterada'
  Assert-True ($result -contains 'variável removida: B') 'não viu B removida'
  Assert-True ($result -contains 'variável nova: C') 'não viu C nova'
}
Test-Case 'detecta segredo trocado, recursos, conta de serviço, timeout e escala' {
  $old = New-Revision
  $new = New-Revision -Secrets @{ S = 'projects/p/secrets/outro' } -Cpu '2' -Account 'outra@p.iam' -Timeout 60 -MaxScale '5'
  $result = @(Compare-RevisionConfig -Old $old -New $new)
  Assert-True ($result -contains 'variável alterada: S') 'segredo'
  Assert-True ($result -contains 'contêiner.resources') 'recursos'
  Assert-True ($result -contains 'spec.serviceAccountName') 'conta de serviço'
  Assert-True ($result -contains 'spec.timeoutSeconds') 'timeout'
  Assert-True ($result -contains 'anotações de escala, rede ou CPU') 'escala'
}
Test-Case 'anotações de cliente do gcloud não contam como diferença' {
  $old = New-Revision -Sha 'um'
  $new = New-Revision -Sha 'dois'
  Assert-Equal @(Compare-RevisionConfig -Old $old -New $new).Count 0 'client-name muda a cada deploy'
}

Write-Host 'Test-PublicHealth'
Test-Case 'tudo saudável passa e sonda cada rota em cada tentativa' {
  $script:probed = [System.Collections.Generic.List[string]]::new()
  $probe = { param($Method, $Url, $Body) $script:probed.Add("$Method $Url"); if ($Method -eq 'POST') { 401 } else { 200 } }
  $result = Test-PublicHealth -BaseUrl 'https://x.test/' -Attempts 2 -DelaySeconds 0 -Probe $probe
  Assert-True $result.Ok 'deveria estar saudável'
  Assert-Equal $script:probed.Count 6
  Assert-True ($script:probed -contains 'POST https://x.test/mcp') 'a URL não deve ter barra dupla'
}
Test-Case 'readyz 503 reprova e o relatório diz qual rota e tentativa' {
  $probe = { param($Method, $Url, $Body) if ($Url -like '*/readyz') { 503 } elseif ($Method -eq 'POST') { 401 } else { 200 } }
  $result = Test-PublicHealth -BaseUrl 'https://x.test' -Attempts 1 -DelaySeconds 0 -Probe $probe
  Assert-True (-not $result.Ok) 'deveria reprovar'
  Assert-True ($result.Failures[0] -match 'GET /readyz deu 503') "relatório: $($result.Failures[0])"
}
Test-Case '/mcp que deixa de pedir autenticação (200) reprova' {
  $probe = { param($Method, $Url, $Body) 200 }
  $result = Test-PublicHealth -BaseUrl 'https://x.test' -Attempts 1 -DelaySeconds 0 -Probe $probe
  Assert-True (-not $result.Ok) 'um /mcp aberto não pode passar'
}

Write-Host 'Switch-Traffic'
function Invoke-Gcloud {
  # Fake: registra os comandos e falha sob demanda.
  param([Parameter(Mandatory)][string[]]$Arguments, [switch]$AllowFailure)
  $line = $Arguments -join ' '
  $script:calls.Add($line)
  if ($script:failOn -and $line -match $script:failOn) { throw "falha simulada em: $line" }
  return [pscustomobject]@{ ExitCode = 0; Output = @() }
}
function New-Plan {
  return @(
    [pscustomobject]@{ Service = 'closure'; Revision = 'closure-new'; Previous = 'closure-old' },
    [pscustomobject]@{ Service = 'api'; Revision = 'api-new'; Previous = 'api-old' }
  )
}
$quiet = { param($message) }
$healthy = { [pscustomobject]@{ Ok = $true; Failures = @() } }
$unhealthy = { [pscustomobject]@{ Ok = $false; Failures = @('GET /readyz deu 503') } }

Test-Case 'sucesso: troca na ordem do plano e não reverte' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = $null
  $result = Switch-Traffic -Plan (New-Plan) -ProjectId 'p' -Region 'r' -Verify $healthy -Log $quiet
  Assert-True $result.Ok 'deveria dar certo'
  Assert-Equal $script:calls.Count 2
  Assert-True ($script:calls[0] -match 'update-traffic closure .*--to-revisions=closure-new=100') 'encerramento primeiro'
  Assert-True ($script:calls[1] -match 'update-traffic api .*--to-revisions=api-new=100') 'API depois'
}
Test-Case 'verificação reprovada: reverte as duas, API primeiro' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = $null
  $result = Switch-Traffic -Plan (New-Plan) -ProjectId 'p' -Region 'r' -Verify $unhealthy -Log $quiet
  Assert-True (-not $result.Ok) 'deveria reprovar'
  Assert-True $result.RolledBack 'deveria ter revertido'
  Assert-Equal $script:calls.Count 4
  Assert-True ($script:calls[2] -match 'update-traffic api .*--to-revisions=api-old=100') 'API volta primeiro'
  Assert-True ($script:calls[3] -match 'update-traffic closure .*--to-revisions=closure-old=100') 'encerramento volta depois'
  Assert-True ($result.Reason -match 'readyz') 'a causa deve constar'
}
Test-Case 'falha ao trocar a API: reverte o encerramento e a própria API' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = 'update-traffic api .*--to-revisions=api-new'
  $result = Switch-Traffic -Plan (New-Plan) -ProjectId 'p' -Region 'r' -Verify $healthy -Log $quiet
  Assert-True (-not $result.Ok) 'deveria reprovar'
  Assert-True $result.RolledBack 'deveria ter revertido'
  Assert-True (($script:calls -join "`n") -match 'api-old=100') 'a API deve voltar para a anterior mesmo com a troca incerta'
  Assert-True (($script:calls -join "`n") -match 'closure-old=100') 'o encerramento deve voltar'
}
Test-Case 'falha ao trocar o primeiro serviço: não deixa nada pela metade' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = 'update-traffic closure .*--to-revisions=closure-new'
  $result = Switch-Traffic -Plan (New-Plan) -ProjectId 'p' -Region 'r' -Verify $healthy -Log $quiet
  Assert-True (-not $result.Ok) 'deveria reprovar'
  Assert-True (-not (($script:calls -join "`n") -match 'api-new')) 'a API nem deveria ter sido tocada'
}
Test-Case 'revisão já em uso: não troca e não reverte' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = $null
  $plan = @([pscustomobject]@{ Service = 'api'; Revision = 'api-1'; Previous = 'api-1' })
  $result = Switch-Traffic -Plan $plan -ProjectId 'p' -Region 'r' -Verify $healthy -Log $quiet
  Assert-True $result.Ok 'deveria dar certo'
  Assert-Equal $script:calls.Count 0
}
Test-Case 'revisão já em uso mas saudável reprovada: nada a reverter, resultado negativo' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = $null
  $plan = @([pscustomobject]@{ Service = 'api'; Revision = 'api-1'; Previous = 'api-1' })
  $result = Switch-Traffic -Plan $plan -ProjectId 'p' -Region 'r' -Verify $unhealthy -Log $quiet
  Assert-True (-not $result.Ok) 'deveria reprovar'
  Assert-Equal $script:calls.Count 0 'não há o que reverter'
}
Test-Case 'falha também ao reverter: o resultado diz que a reversão NÃO foi concluída' {
  $script:calls = [System.Collections.Generic.List[string]]::new(); $script:failOn = 'to-revisions=api-old'
  $result = Switch-Traffic -Plan (New-Plan) -ProjectId 'p' -Region 'r' -Verify $unhealthy -Log $quiet
  Assert-True (-not $result.Ok) 'deveria reprovar'
  Assert-True (-not $result.RolledBack) 'não pode afirmar que reverteu'
  Assert-True ($result.Errors.Count -eq 1) 'deve listar o erro da reversão'
  Assert-True (($script:calls -join "`n") -match 'closure-old=100') 'deve seguir tentando o outro serviço'
}

Write-Host 'Get-ApiRuntimeFlagReport'
function New-Container {
  param([hashtable]$Env = @{})
  $entries = @()
  foreach ($key in $Env.Keys) { $entries += [pscustomobject]@{ name = $key; value = $Env[$key] } }
  return [pscustomobject]@{ env = $entries }
}
Test-Case 'flags ausentes contam como desligadas e são declaradas como ausentes' {
  $report = @(Get-ApiRuntimeFlagReport -Container (New-Container))
  Assert-Equal $report.Count 2
  Assert-True ($report[0] -match 'FORGELEX_DESK_GUIDANCE_ENABLED.*desligada.*ausente') $report[0]
  Assert-True ($report[1] -match 'FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED.*desligada.*ausente') $report[1]
}
Test-Case 'só o valor exato true liga a flag; false declarado é desligada declarada' {
  $report = @(Get-ApiRuntimeFlagReport -Container (New-Container -Env @{ FORGELEX_DESK_GUIDANCE_ENABLED = 'false'; FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED = 'TRUE' }))
  Assert-True ($report[0] -match 'desligada.*declarada') $report[0]
  Assert-True ($report[1] -match 'desligada.*declarada') $report[1]
}
Test-Case 'salvamento ligado lembra a migração 0041 antes de qualquer outra coisa' {
  $report = @(Get-ApiRuntimeFlagReport -Container (New-Container -Env @{ FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED = 'true' }))
  Assert-True ($report[1] -match 'ligada') $report[1]
  Assert-True ($report[1] -match '0041') 'deve citar a migração 0041'
}
Test-Case 'contêiner sem env não quebra a leitura' {
  $report = @(Get-ApiRuntimeFlagReport -Container ([pscustomobject]@{}))
  Assert-Equal $report.Count 2
}

# ---------- Sintaxe de todos os scripts de operação ----------
# Os scripts de gcloud só rodam de verdade numa publicação; um erro de sintaxe só apareceria ali. Aqui ele aparece na CI.
Test-Case 'todos os scripts de ops/gcp/production têm sintaxe PowerShell válida' {
  foreach ($file in @(Get-ChildItem -Path $PSScriptRoot -Filter '*.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    $count = @($parseErrors).Count
    $detail = if ($count -gt 0) { "$($file.Name): $(@($parseErrors)[0].Message)" } else { '' }
    Assert-True ($count -eq 0) $detail
  }
}

# ---------- Recibo de publicação ----------
# A validação e o texto do recibo são testados em scripts/deploy-receipt.test.ts. Aqui só a cola: chamar o node,
# devolver o caminho e nunca lançar exceção numa publicação.
function New-ReceiptInput {
  $digest = 'sha256:' + ('a' * 64)
  return @{
    status    = 'PUBLICADO'
    sha       = '6fe4f75fccb53deb54c395b6f534b01eb5f49e5e'
    buildId   = '92e59198-23c4-4341-b6b4-96e32fe1aec7'
    digest    = $digest
    image     = "southamerica-east1-docker.pkg.dev/project-bbbe1209-c295-4720-867/forgelex-prod/forgelex-api@$digest"
    projectId = 'project-bbbe1209-c295-4720-867'
    region    = 'southamerica-east1'
    publicUrl = 'https://example.test'
    services  = @(@{ service = 'forgelex-api-prod'; previous = 'forgelex-api-prod-af13b1c-65e7e42c'; revision = 'forgelex-api-prod-6fe4f75-92e59198' })
    flags     = @('FORGELEX_DRAFT_SAVE_COMMANDS_ENABLED: ligada (declarada).')
  }
}
$nodeAvailable = [bool](Get-Command node -ErrorAction SilentlyContinue)
Test-Case 'Write-DeployReceipt grava o recibo e devolve o caminho' {
  if (-not $nodeAvailable) { Write-Host '        (pulado: node ausente)'; return }
  $directory = Join-Path ([System.IO.Path]::GetTempPath()) "deploy-receipt-$([guid]::NewGuid())"
  try {
    $path = Write-DeployReceipt -Receipt (New-ReceiptInput) -OutDir $directory
    Assert-True (($null -ne $path) -and (Test-Path -LiteralPath $path)) 'o recibo deveria existir'
    $text = Get-Content -LiteralPath $path -Raw
    Assert-True ($text -match '6fe4f75') 'deve citar o SHA'
    Assert-True ($text -match 'forgelex-api-prod-6fe4f75-92e59198') 'deve citar a revisão nova'
  }
  finally { Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue }
}
Test-Case 'Write-DeployReceipt não lança nem grava nada quando o recibo é inválido' {
  if (-not $nodeAvailable) { Write-Host '        (pulado: node ausente)'; return }
  $directory = Join-Path ([System.IO.Path]::GetTempPath()) "deploy-receipt-$([guid]::NewGuid())"
  try {
    $invalid = New-ReceiptInput
    $invalid['sha'] = 'curto'
    $path = Write-DeployReceipt -Receipt $invalid -OutDir $directory 3>$null 6>$null
    Assert-True ($null -eq $path) 'um recibo inválido não deve devolver caminho'
    $written = if (Test-Path -LiteralPath $directory) { @(Get-ChildItem -LiteralPath $directory).Count } else { 0 }
    Assert-Equal $written 0
    Assert-Equal $LASTEXITCODE 0 'o código de saída do node não pode vazar'
  }
  finally { Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue }
}

# ---------- Ferramenta de migrations (migrate-lib.ps1) ----------
# Montagem de argumentos e leitura de respostas. O gcloud em si não é exercitado aqui: só numa execução real.
function New-ApiServiceFixture {
  $json = @'
{"metadata":{"name":"forgelex-api-prod"},"spec":{"template":{
 "metadata":{"annotations":{"run.googleapis.com/cloudsql-instances":"proj-1:southamerica-east1:forgelex-hml-pg"}},
 "spec":{"serviceAccountName":"runtime@proj-1.iam.gserviceaccount.com","containers":[{"env":[
   {"name":"FORGELEX_PUBLIC_URL","value":"https://example.test"},
   {"name":"DATABASE_URL","valueFrom":{"secretKeyRef":{"name":"forgelex-prod-database-url","key":"latest"}}}]}]}}}}
'@
  return (ConvertFrom-JsonText $json)
}
$migrationImage = 'southamerica-east1-docker.pkg.dev/proj-1/forgelex-prod/forgelex-api@sha256:' + ('c' * 64)
$migrationNow = [datetime]::new(2026, 11, 16, 20, 0, 0, [System.DateTimeKind]::Utc)
function New-MigrationCommandSet {
  param([string]$Mode = 'inspect', [string[]]$Allow = @())
  New-MigrationJobCommands -Mode $Mode -JobName 'forgelex-migrate-x' -Settings (Get-MigrationJobSettings -Service (New-ApiServiceFixture)) `
    -Image $migrationImage -Allow $Allow -ProjectId 'proj-1' -Region 'southamerica-east1'
}

Test-Case 'Get-MigrationJobSettings espelha identidade, instância e segredo do serviço' {
  $settings = Get-MigrationJobSettings -Service (New-ApiServiceFixture)
  Assert-Equal $settings.ServiceAccount 'runtime@proj-1.iam.gserviceaccount.com'
  Assert-Equal $settings.CloudSqlInstance 'proj-1:southamerica-east1:forgelex-hml-pg'
  Assert-Equal $settings.InstanceName 'forgelex-hml-pg'
  Assert-Equal $settings.DatabaseHost '/cloudsql/proj-1:southamerica-east1:forgelex-hml-pg'
  Assert-Equal $settings.SecretName 'forgelex-prod-database-url'
  Assert-Equal $settings.SecretKey 'latest'
}
Test-Case 'Get-MigrationJobSettings recusa DATABASE_URL em texto, mais de uma instância e conta ausente' {
  $plain = New-ApiServiceFixture
  $plain.spec.template.spec.containers[0].env[1] = [pscustomobject]@{ name = 'DATABASE_URL'; value = 'postgres://u:p@h/db' }
  Assert-Throws { Get-MigrationJobSettings -Service $plain } 'não vem de um segredo'
  $two = New-ApiServiceFixture
  $two.spec.template.metadata.annotations.'run.googleapis.com/cloudsql-instances' = 'a:b:c,d:e:f'
  Assert-Throws { Get-MigrationJobSettings -Service $two } 'única instância'
  $noAccount = New-ApiServiceFixture
  $noAccount.spec.template.spec.PSObject.Properties.Remove('serviceAccountName')
  Assert-Throws { Get-MigrationJobSettings -Service $noAccount } 'conta de serviço'
}

Test-Case 'Test-RecentBackup aceita um backup bem-sucedido recente' {
  $backups = ConvertFrom-JsonText '[{"status":"SUCCESSFUL","endTime":"2026-11-16T19:30:00.000Z"}]'
  $result = Test-RecentBackup -Backups $backups -Now $migrationNow -MaxAgeMinutes 120
  Assert-True $result.Ok $result.Reason
}
Test-Case 'Test-RecentBackup recusa backup velho, falho, ausente ou no futuro' {
  foreach ($case in @(
      @{ Json = '[{"status":"SUCCESSFUL","endTime":"2026-11-16T10:00:00.000Z"}]'; Pattern = 'tem' },
      @{ Json = '[{"status":"FAILED","endTime":"2026-11-16T19:55:00.000Z"}]'; Pattern = 'Não há backup' },
      @{ Json = '[]'; Pattern = 'Não há backup' },
      @{ Json = '[{"status":"SUCCESSFUL","endTime":"2026-11-16T23:00:00.000Z"}]'; Pattern = 'futuro' })) {
    $result = Test-RecentBackup -Backups (ConvertFrom-JsonText $case.Json) -Now $migrationNow -MaxAgeMinutes 120
    Assert-True (-not $result.Ok) "deveria recusar $($case.Json)"
    Assert-True ($result.Reason -match $case.Pattern) "motivo inesperado: $($result.Reason)"
  }
  Assert-True (-not (Test-RecentBackup -Backups $null -Now $migrationNow).Ok) 'sem lista de backups deve recusar'
}
Test-Case 'Test-RecentBackup usa o mais novo entre vários' {
  $backups = ConvertFrom-JsonText '[{"status":"SUCCESSFUL","endTime":"2026-11-16T05:00:00.000Z"},{"status":"SUCCESSFUL","endTime":"2026-11-16T19:40:00.000Z"}]'
  Assert-True (Test-RecentBackup -Backups $backups -Now $migrationNow).Ok 'o de 19:40 deveria valer'
}

Test-Case 'New-MigrationJobCommands cria um Job sem nova tentativa, com o script antes do modo' {
  $commands = New-MigrationCommandSet -Mode 'apply' -Allow @('persistence-0042-webhook-admission', 'billing-ledger-0011-refund-recovery')
  $create = $commands.Create -join ' '
  Assert-True ($commands.Create -contains '--max-retries=0') 'apply nunca deve tentar de novo sozinho'
  Assert-True ($commands.Create -contains '--command=node') 'o comando deve ser node'
  # Em 16/11/2026 `inspect` foi lido pelo node como o subcomando `node inspect`: o script vem sempre antes do modo.
  Assert-True ($commands.Create -contains '--args=api/dist/operations/migration-main.js,apply,--allow=persistence-0042-webhook-admission,--allow=billing-ledger-0011-refund-recovery') $create
  Assert-True ($commands.Create -contains '--set-secrets=DATABASE_URL=forgelex-prod-database-url:latest') $create
  Assert-True ($commands.Create -contains '--set-cloudsql-instances=proj-1:southamerica-east1:forgelex-hml-pg') $create
  Assert-True ($commands.Create -contains '--set-env-vars=FORGELEX_MIGRATION_EXPECTED_DATABASE=forgelex,FORGELEX_MIGRATION_EXPECTED_HOST=/cloudsql/proj-1:southamerica-east1:forgelex-hml-pg') $create
  Assert-True ($commands.Create -contains "--image=$migrationImage") $create
  Assert-Equal ($commands.Delete -join ' ') 'run jobs delete forgelex-migrate-x --project=proj-1 --region=southamerica-east1 --quiet'
}
Test-Case 'New-MigrationJobCommands: inspect e verify não levam --allow' {
  Assert-True ($null -ne (New-MigrationCommandSet -Mode 'verify')) 'verify sem allow deve montar'
  $inspect = New-MigrationCommandSet -Mode 'inspect'
  Assert-True ($inspect.Create -contains '--args=api/dist/operations/migration-main.js,inspect') ($inspect.Create -join ' ')
}
Test-Case 'New-MigrationJobCommands recusa entradas inseguras' {
  Assert-Throws { New-MigrationCommandSet -Mode 'apply' } 'apply exige'
  Assert-Throws { New-MigrationCommandSet -Mode 'inspect' -Allow @('persistence-0042-webhook-admission') } 'inspect não aceita'
  Assert-Throws { New-MigrationCommandSet -Mode 'apply' -Allow @('x; rm -rf /') } 'ID de migration inválido'
  Assert-Throws { New-MigrationCommandSet -Mode 'apply' -Allow @('a,b') } 'ID de migration inválido'
  Assert-Throws {
    New-MigrationJobCommands -Mode 'inspect' -JobName 'j' -Settings (Get-MigrationJobSettings -Service (New-ApiServiceFixture)) `
      -Image 'southamerica-east1-docker.pkg.dev/proj-1/forgelex-prod/forgelex-api:latest' -ProjectId 'proj-1' -Region 'r'
  } 'digest'
}
Test-Case 'New-MigrationJobName inclui o modo e o horário UTC' {
  Assert-Equal (New-MigrationJobName -Mode 'apply' -Now $migrationNow) 'forgelex-migrate-apply-20261116200000'
}

Test-Case 'Format-MigrationLogEntries e Test-MigrationOutcome leem jsonPayload' {
  $entries = ConvertFrom-JsonText '[{"jsonPayload":{"stage":"applied","id":"x"}},{"textPayload":"linha de texto"},{"jsonPayload":{"event":"migration.completed","mode":"apply"}}]'
  $lines = @(Format-MigrationLogEntries -Entries $entries)
  Assert-Equal $lines.Count 3
  Assert-True ($lines[0] -match '"stage":"applied"') $lines[0]
  Assert-Equal $lines[1] 'linha de texto'
  Assert-Equal (Test-MigrationOutcome -Entries $entries) 'completed'
  Assert-Equal (Test-MigrationOutcome -Entries (ConvertFrom-JsonText '[{"jsonPayload":{"event":"migration.failed","code":"X"}}]')) 'failed'
  Assert-Equal (Test-MigrationOutcome -Entries $null) 'unknown'
}

Write-Host ''
Write-Host "$script:passed passaram, $script:failed falharam"
# Código explícito: um $LASTEXITCODE deixado por um comando nativo de algum teste não pode decidir o resultado.
if ($script:failed -gt 0) { exit 1 } else { exit 0 }
