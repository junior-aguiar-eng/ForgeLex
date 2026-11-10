#Requires -Version 7.0
<#
.SYNOPSIS
  Passa a chave da OpenAI do serviço da API de uma versão fixa do segredo para `latest`, em um comando.

.DESCRIPTION
  Hoje o serviço lê `OPENAI_API_KEY` de uma versão fixa (`...:2`). Para girar a chave é preciso criar uma revisão à mão,
  como no incidente de 09/11/2026. Com o segredo em `latest`, uma versão nova é lida pelas instâncias novas, sem
  mexer no serviço. Para forçar a troca já, publique uma revisão (deploy-from-main.ps1), que parte do modelo do
  serviço e mantém `latest`.

  Sequência: lê o estado, cria uma revisão SEM tráfego só com a referência do segredo trocada, espera ficar pronta, troca
  o tráfego, sonda o site público e, se qualquer passo falhar, volta sozinho para a revisão anterior.

  Atenção: com `latest`, uma versão nova com a chave errada derrubaria só o caminho comercial das instâncias novas. O
  alerta de provedor (provision-provider-alert.ps1) e a verificação do /readyz avisam; para desfazer, desabilite a
  versão ruim do segredo.

.EXAMPLE
  ./ops/gcp/production/set-provider-secret-latest.ps1 -DryRun   # só lê e mostra o plano; não altera nada
  ./ops/gcp/production/set-provider-secret-latest.ps1           # aplica
#>
[CmdletBinding()]
param(
  [string]$ProjectId = 'project-bbbe1209-c295-4720-867',
  [string]$Region = 'southamerica-east1',
  [string]$ApiService = 'forgelex-api-prod',
  [string]$SecretName = 'forgelex-prod-openai-commercial-api-key',
  [string]$EnvName = 'OPENAI_API_KEY',
  [string]$PublicUrl = 'https://nexojuris.ia.br',
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')

if ($DryRun) { Write-Host 'MODO SIMULAÇÃO: só leitura. Nada será criado nem alterado.' -ForegroundColor Yellow }

Write-Host ''; Write-Host '== 1/4 Estado atual' -ForegroundColor Cyan
$service = Invoke-GcloudJson -Arguments @('run', 'services', 'describe', $ApiService, "--project=$ProjectId", "--region=$Region")
$serving = @($service.status.traffic | Where-Object { (Get-Prop $_ 'percent') -eq 100 -and (Get-Prop $_ 'revisionName') })[0]
if ($null -eq $serving) { throw 'Nenhuma revisão recebe 100% do tráfego; resolva isso antes.' }
$container = @($service.spec.template.spec.containers)[0]
$entry = @($container.env | Where-Object { $_.name -eq $EnvName })[0]
$ref = if ($null -ne $entry) { Get-Prop $entry 'valueFrom.secretKeyRef' } else { $null }
if ($null -eq $ref) { throw "$EnvName não vem de um segredo (secretKeyRef); este script só troca a versão de um segredo." }
if ($ref.name -ne $SecretName) { throw "$EnvName aponta para o segredo '$($ref.name)', não '$SecretName'." }
Write-Host "  serviço $ApiService recebe 100% em $($serving.revisionName)"
Write-Host "  $EnvName -> segredo $($ref.name), versão $($ref.key)"
if ($ref.key -eq 'latest') { Write-Host '  Já está em latest. Nada a fazer.'; return }

$versions = @(Invoke-GcloudJson -Arguments @('secrets', 'versions', 'list', $SecretName, "--project=$ProjectId", '--filter=state=ENABLED'))
Write-Host "  versões habilitadas do segredo: $(@($versions | ForEach-Object { ($_.name -split '/')[-1] }) -join ', ')"
if ($versions.Count -eq 0) { throw "O segredo $SecretName não tem versão habilitada; 'latest' não resolveria." }

$suffix = 'secretlatest-' + (Get-Date -Format 'yyyyMMddHHmm')
$newRevision = "$ApiService-$suffix"
Write-Host ''; Write-Host '== Plano' -ForegroundColor Cyan
Write-Host "  nova revisão $newRevision, sem tráfego, só com $EnvName=$SecretName`:latest"
Write-Host "  troca do tráfego de $($serving.revisionName) para a nova; sonda $PublicUrl; reversão automática se falhar"
if ($DryRun) { Write-Host ''; Write-Host 'Nenhum impedimento. A aplicação real pode ser executada.'; return }

Write-Host ''; Write-Host '== 2/4 Revisão sem tráfego' -ForegroundColor Cyan
Invoke-Gcloud -Arguments @('run', 'services', 'update', $ApiService, "--project=$ProjectId", "--region=$Region",
  "--update-secrets=$EnvName=${SecretName}:latest", '--no-traffic', "--revision-suffix=$suffix", '--quiet') | Out-Null
$revision = Invoke-GcloudJson -Arguments @('run', 'revisions', 'describe', $newRevision, "--project=$ProjectId", "--region=$Region")
$ready = @($revision.status.conditions | Where-Object { $_.type -eq 'Ready' })[0]
if ($null -eq $ready -or $ready.status -ne 'True') { throw "A revisão $newRevision não ficou pronta; o tráfego não foi trocado." }
Write-Host "  $newRevision pronta"

Write-Host ''; Write-Host '== 3/4 Troca de tráfego e verificação' -ForegroundColor Cyan
$plan = @([pscustomobject]@{ Service = $ApiService; Revision = $newRevision; Previous = $serving.revisionName })
$result = Switch-Traffic -Plan $plan -ProjectId $ProjectId -Region $Region -Verify { Test-PublicHealth -BaseUrl $PublicUrl }
if (-not $result.Ok) {
  Write-Host ''; Write-Host "NÃO APLICADO: $($result.Reason)" -ForegroundColor Red
  if (-not $result.RolledBack) { Write-Host "ATENÇÃO: a reversão falhou: $($result.Errors -join '; ')" -ForegroundColor Red }
  exit 1
}

Write-Host ''; Write-Host '== 4/4 Pronto' -ForegroundColor Green
Write-Host "  $ApiService recebe 100% em $newRevision, com $EnvName lendo $SecretName`:latest"
Write-Host '  Reversão, se precisar:'
Write-Host "  gcloud run services update-traffic $ApiService --project=$ProjectId --region=$Region --to-revisions=$($serving.revisionName)=100"
