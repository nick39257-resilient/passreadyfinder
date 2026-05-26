# Creates passreadyfinder-find and passreadyfinder-queue-draft cron jobs via Render API.
# Prerequisite: create an API key at https://dashboard.render.com/u/settings#api-keys
#
# Usage:
#   $env:RENDER_API_KEY = "rnd_..."
#   $env:RENDER_OWNER_ID = "tea_..."   # Workspace ID from Render Dashboard → Workspace Settings
#   .\scripts\setup-render-crons.ps1
#
# Or sync from render.yaml (recommended): Dashboard → Blueprints → Connect repo → Sync

param(
  [string]$ApiKey = $env:RENDER_API_KEY,
  [string]$OwnerId = $env:RENDER_OWNER_ID,
  [string]$Repo = "https://github.com/nick39257-resilient/passreadyfinder",
  [string]$Branch = "main",
  [string]$WebServiceName = "passreadyfinder"
)

$ErrorActionPreference = "Stop"
$baseUrl = "https://api.render.com/v1"

function Invoke-RenderApi {
  param([string]$Method, [string]$Path, [object]$Body = $null)
  $headers = @{
    Authorization = "Bearer $ApiKey"
    Accept        = "application/json"
  }
  $uri = "$baseUrl$Path"
  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 12)
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
}

if (-not $ApiKey) {
  Write-Host @"
RENDER_API_KEY is not set.

Easiest path (no script):
  1. Push this repo to GitHub
  2. Render Dashboard → New → Blueprint
  3. Connect nick39257-resilient/passreadyfinder
  4. Sync render.yaml — creates web + both crons
  5. Copy env vars from your web service if prompted

API path:
  1. https://dashboard.render.com/u/settings#api-keys → Create API key
  2. Workspace Settings → copy Workspace ID (ownerId)
  3. `$env:RENDER_API_KEY = 'rnd_...'`
  4. `$env:RENDER_OWNER_ID = 'tea_...'`
  5. Re-run this script
"@
  exit 1
}

if (-not $OwnerId) {
  Write-Host "RENDER_OWNER_ID is required (Workspace ID from Render Dashboard → Workspace Settings)."
  exit 1
}

Write-Host "Listing existing Render services..."
$services = Invoke-RenderApi -Method GET -Path "/services?limit=100"
$existing = @{}
foreach ($s in $services) {
  if ($s.service.name) {
    $existing[$s.service.name] = $s.service
  }
}

function Ensure-CronJob {
  param(
    [string]$Name,
    [string]$Schedule,
    [string]$StartCommand,
    [string[]]$EnvVarKeys
  )

  if ($existing.ContainsKey($Name)) {
    Write-Host "  OK  $Name already exists (id: $($existing[$Name].id))"
    return
  }

  Write-Host "  CREATE $Name ..."

  $envVars = @(
    @{ key = "NODE_VERSION"; value = "20" }
  )
  foreach ($key in $EnvVarKeys) {
    $envVars += @{
      key   = $key
      value = $null
      fromService = @{
        name      = $WebServiceName
        type      = "web_service"
        envVarKey = $key
      }
    }
  }

  $body = @{
    type      = "cron_job"
    name      = $Name
    ownerId   = $OwnerId
    repo      = $Repo
    branch    = $Branch
    autoDeploy = "yes"
    serviceDetails = @{
      schedule      = $Schedule
      buildCommand  = "NPM_CONFIG_PRODUCTION=false npm install"
      startCommand  = $StartCommand
    }
    envVars = $envVars
  }

  $created = Invoke-RenderApi -Method POST -Path "/services" -Body $body
  Write-Host "  Created $($created.service.name) → $($created.service.id)"
}

Write-Host ""
Write-Host "Ensuring cron jobs (env inherited from web service '$WebServiceName')..."
Ensure-CronJob -Name "passreadyfinder-find" -Schedule "0 * * * *" -StartCommand "npm run find-cron" -EnvVarKeys @(
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"
)
Ensure-CronJob -Name "passreadyfinder-queue-draft" -Schedule "*/30 * * * *" -StartCommand "npm run queue-draft" -EnvVarKeys @(
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "OPENAI_API_KEY", "OPENAI_BASE_URL", "WHATSAPP_NUMBER"
)

Write-Host ""
Write-Host "Done. In Render Dashboard:"
Write-Host "  - Delete old passreadyfinder-auto-draft cron if it still exists"
Write-Host "  - Confirm web service '$WebServiceName' has all env vars set"
Write-Host "  - Trigger Manual Deploy on each new cron once to verify"
