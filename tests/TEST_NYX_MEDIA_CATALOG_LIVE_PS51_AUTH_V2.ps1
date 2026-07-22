param(
  [string]$Endpoint = "https://sandblast-backend.onrender.com/api/chat",
  [int]$MaximumMilliseconds = 5000,
  [string]$Token = "",
  [string]$Origin = "https://www.sandblast.channel"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Resolve-NyxApiToken {
  param(
    [string]$ExplicitToken
  )

  $candidates = New-Object System.Collections.Generic.List[string]

  if (-not [string]::IsNullOrWhiteSpace($ExplicitToken)) {
    [void]$candidates.Add($ExplicitToken)
  }

  foreach ($name in @(
    "SB_WIDGET_TOKEN",
    "SB_API_KEY",
    "SANDBLAST_API_KEY",
    "CHAT_API_KEY",
    "NYX_API_KEY",
    "WIDGET_API_KEY"
  )) {
    $value = [Environment]::GetEnvironmentVariable($name, "Process")
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      [void]$candidates.Add($value)
    }
  }

  if ($candidates.Count -eq 0) {
    throw @"
FAIL: No Nyx widget/API token is available.

Use either:

  `$env:SB_WIDGET_TOKEN = "YOUR_REAL_RENDER_TOKEN"
  & "PATH\TO\TEST_NYX_MEDIA_CATALOG_LIVE.ps1" -Token `$env:SB_WIDGET_TOKEN

or:

  & "PATH\TO\TEST_NYX_MEDIA_CATALOG_LIVE.ps1" -Token "YOUR_REAL_RENDER_TOKEN"

Do not commit the token to Git.
"@
  }

  return $candidates[0].Trim()
}

function Get-FirstReplyValue {
  param(
    [object]$Response
  )

  if ($null -eq $Response) {
    return ""
  }

  foreach ($propertyName in @(
    "reply",
    "publicReply",
    "visibleReply",
    "displayReply",
    "text",
    "answer"
  )) {
    $property = $Response.PSObject.Properties[$propertyName]
    if ($null -ne $property -and $null -ne $property.Value) {
      $text = [string]$property.Value
      if (-not [string]::IsNullOrWhiteSpace($text)) {
        return $text
      }
    }
  }

  return ""
}

$ResolvedToken = Resolve-NyxApiToken -ExplicitToken $Token

function Invoke-NyxCatalogTest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedIntent,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedPattern
  )

  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $session = "nyx_catalog_r6_$stamp"
  $turn = "${session}_turn"
  $trace = "${session}_trace"

  $body = @{
    sessionId = $session
    turnId = $turn
    traceId = $trace
    lane = "public_interface"
    source = "nyx_catalog_r6_live_test_ps51_auth_v2"
    audience = "public"
    surfaceAgent = "nyx"
    publicSurfaceOnly = $true
    publicIdentityLock = $true
    requireCleanPublicReply = $true
    message = $Prompt
    text = $Prompt
    presentationProfile = "public"
  } | ConvertTo-Json -Depth 10

  $headers = @{
    "Accept" = "application/json"
    "Origin" = $Origin
    "X-Requested-With" = "XMLHttpRequest"
    "Authorization" = "Bearer $ResolvedToken"
    "x-sb-widget-token" = $ResolvedToken
    "x-sbnyx-widget-token" = $ResolvedToken
    "x-nyx-widget-token" = $ResolvedToken
    "x-api-key" = $ResolvedToken
    "x-sb-session-id" = $session
    "x-sb-turn-id" = $turn
    "x-sb-trace-id" = $trace
  }

  $watch = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $response = Invoke-RestMethod `
      -Uri $Endpoint `
      -Method Post `
      -Headers $headers `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 20
  }
  catch {
    $watch.Stop()

    Write-Host ""
    Write-Host "FAIL: HTTP request did not complete." -ForegroundColor Red
    Write-Host "Prompt: $Prompt"
    Write-Host "Elapsed: $($watch.ElapsedMilliseconds) ms"
    Write-Host "Error: $($_.Exception.Message)"

    if ($_.Exception.Response) {
      try {
        Write-Host "HTTP status: $([int]$_.Exception.Response.StatusCode)"
      }
      catch {}
    }

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      Write-Host "Response body:"
      Write-Host $_.ErrorDetails.Message
    }

    throw
  }

  $watch.Stop()

  $reply = Get-FirstReplyValue -Response $response

  $catalogDynamic = $null
  $catalogCount = $null

  if ($null -ne $response.catalog) {
    $catalogDynamic = $response.catalog.dynamic
    $catalogCount = $response.catalog.activeCount
  }

  Write-Host ""
  Write-Host "Prompt: $Prompt" -ForegroundColor Cyan
  Write-Host "Elapsed: $($watch.ElapsedMilliseconds) ms"
  Write-Host "Intent: $($response.intent)"
  Write-Host "Route type: $($response.routeType)"
  Write-Host "Action required: $($response.actionRequired)"
  Write-Host "Validate action: $($response.validateAction)"
  Write-Host "Catalog dynamic: $catalogDynamic"
  Write-Host "Catalog count: $catalogCount"
  Write-Host "Reply: $reply"

  if ([string]::IsNullOrWhiteSpace($reply)) {
    throw "FAIL: Empty reply."
  }

  if ([string]$response.intent -ne $ExpectedIntent) {
    throw "FAIL: Expected intent '$ExpectedIntent' but received '$($response.intent)'."
  }

  if ($reply -notmatch $ExpectedPattern) {
    throw "FAIL: Reply did not include expected live catalog content."
  }

  if ($reply -match "(?i)legal-risk triage|not legal advice|route unavailable") {
    throw "FAIL: Catalog response was contaminated by a Law or route fallback."
  }

  if ($response.actionRequired -eq $true -or $response.validateAction -eq $true) {
    throw "FAIL: Informational catalog retrieval became executable navigation."
  }

  if ([string]$response.routeType -ne "knowledge") {
    throw "FAIL: Catalog retrieval was not returned as a knowledge route."
  }

  if ($catalogDynamic -ne $true) {
    throw "FAIL: Dynamic catalog metadata was not returned."
  }

  if ($watch.ElapsedMilliseconds -gt $MaximumMilliseconds) {
    throw "FAIL: Response exceeded $MaximumMilliseconds ms."
  }

  Write-Host "PASS" -ForegroundColor Green
}

Write-Host "Nyx API authentication token resolved." -ForegroundColor Green
Write-Host "Running authenticated R6 live catalog tests..." -ForegroundColor Cyan

Invoke-NyxCatalogTest `
  -Prompt "What movies are available?" `
  -ExpectedIntent "movie_catalog" `
  -ExpectedPattern "(?i)Strangers on a Train|Alaska Seas|Crime Inc"

Invoke-NyxCatalogTest `
  -Prompt "What cartoons are available?" `
  -ExpectedIntent "cartoon_catalog" `
  -ExpectedPattern "(?i)Superman|Popeye|Lone Ranger|Clutch Cargo"

Invoke-NyxCatalogTest `
  -Prompt "What can I watch on Sandblast?" `
  -ExpectedIntent "media_overview" `
  -ExpectedPattern "(?i)classic-film selections|cartoon selections|Sandblast Classics|Sandblast Cartoons"

Write-Host ""
Write-Host "PASS: authenticated live Nyx media catalog retrieval R6 on Windows PowerShell 5.1." -ForegroundColor Green
