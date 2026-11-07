#Requires -Version 7.0
# Testes da lógica de deploy. Não usam gcloud, git, rede nem credenciais: tudo que fala com o mundo é um fake.
#   pwsh -NoProfile -File ops/gcp/production/deploy-from-main.tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')

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
  Assert-Equal $result.Count 8
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

Write-Host ''
Write-Host "$script:passed passaram, $script:failed falharam"
if ($script:failed -gt 0) { exit 1 }
