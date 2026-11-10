#Requires -Version 7.0
<#
.SYNOPSIS
  Cria o alerta do Cloud Logging para falha de autenticação do provedor comercial (chave da OpenAI inválida).

.DESCRIPTION
  Em 09/11/2026 a chave comercial ficou inválida e só se soube quando um cliente tentou uma peça (HTTP 401). O alerta
  dispara em qualquer um destes registros do serviço `forgelex-api-prod`:

    - `provider.key_invalid`: a verificação leve da chave (GET /v1/models, sem custo), feita pelo `/readyz`;
    - `commercial_call_trace` com `failureClass=AUTHORIZATION`: uma chamada comercial real recusada pelo provedor.

  Só cria: se já existir uma política com o mesmo nome, nada é alterado (inspecione antes de substituir). Usa o canal de
  e-mail que já recebe os outros alertas. Nunca inclui conteúdo jurídico nem a chave no alerta.

.EXAMPLE
  ./ops/gcp/production/provision-provider-alert.ps1 -DryRun   # só lê e mostra a política; não cria nada
  ./ops/gcp/production/provision-provider-alert.ps1           # cria
#>
[CmdletBinding()]
param(
  [string]$ProjectId = 'project-bbbe1209-c295-4720-867',
  [string]$ApiService = 'forgelex-api-prod',
  [string]$DisplayName = 'ForgeLex - falha de autenticacao do provedor comercial',
  # Canal que já recebe os alertas de produção; o nome é histórico, é o único canal de e-mail configurado.
  [string]$ChannelDisplayName = 'ForgeLex STJ ingestion alerts',
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lib.ps1')

if ($DryRun) { Write-Host 'MODO SIMULAÇÃO: só leitura. Nada será criado.' -ForegroundColor Yellow }

$channels = @(Invoke-GcloudJson -Arguments @('beta', 'monitoring', 'channels', 'list', "--project=$ProjectId"))
$channel = @($channels | Where-Object { $_.displayName -eq $ChannelDisplayName -and $_.enabled })[0]
if ($null -eq $channel) { throw "Canal de notificação '$ChannelDisplayName' não encontrado ou desativado." }
Write-Host "Canal: $($channel.displayName) ($($channel.type))"

$existing = @(Invoke-GcloudJson -Arguments @('alpha', 'monitoring', 'policies', 'list', "--project=$ProjectId"))
if (@($existing | Where-Object { $_.displayName -eq $DisplayName }).Count -gt 0) {
  Write-Host "Já existe uma política '$DisplayName'. Nada a fazer (este script só cria)."
  return
}

$filter = 'resource.type="cloud_run_revision" AND resource.labels.service_name="' + $ApiService + '" AND (' +
  'jsonPayload.message="provider.key_invalid" OR ' +
  '(jsonPayload.message="commercial_call_trace" AND jsonPayload.diagnostic:"failureClass=AUTHORIZATION"))'

$policy = [ordered]@{
  displayName          = $DisplayName
  combiner             = 'OR'
  enabled              = $true
  conditions           = @(
    [ordered]@{
      displayName         = 'chave do provedor recusada (401) ou verificação da chave falhou'
      conditionMatchedLog = [ordered]@{ filter = $filter }
    }
  )
  alertStrategy        = [ordered]@{
    # No máximo um aviso por hora enquanto durar; fecha sozinho depois de um dia sem novos registros.
    notificationRateLimit = [ordered]@{ period = '3600s' }
    autoClose             = '86400s'
  }
  notificationChannels = @($channel.name)
  documentation        = [ordered]@{
    mimeType = 'text/markdown'
    content  = @'
A chave da OpenAI usada nas pecas e na mesa foi recusada (HTTP 401) ou falhou na verificacao leve do /readyz.

**O que fazer:** gerar uma chave nova na OpenAI, gravar como nova versao do segredo `forgelex-prod-openai-commercial-api-key` e fazer uma nova revisao (ou, com o segredo em `latest`, esperar instancias novas). Ver a secao de rotacao em ops/gcp/production/README.md.

Nao ha reconciliacao a fazer: a recusa de autenticacao acontece antes do consumo. Nao copiar a chave para chat, log ou ticket.
'@
  }
}
$json = $policy | ConvertTo-Json -Depth 10

if ($DryRun) {
  Write-Host 'Política que seria criada:'
  Write-Host $json
  Write-Host ''
  Write-Host 'Nenhum impedimento. A criação real pode ser executada.'
  return
}

$file = Join-Path ([System.IO.Path]::GetTempPath()) ("forgelex-provider-alert-{0}.json" -f [guid]::NewGuid().ToString('N'))
try {
  Set-Content -LiteralPath $file -Value $json -Encoding utf8
  $created = Invoke-Gcloud -Arguments @('alpha', 'monitoring', 'policies', 'create', "--project=$ProjectId", "--policy-from-file=$file")
  Write-Host "Criada: $DisplayName"
  $created.Output | Select-Object -Last 2 | ForEach-Object { Write-Host "  $_" }
}
finally {
  Remove-Item -LiteralPath $file -ErrorAction SilentlyContinue
}
