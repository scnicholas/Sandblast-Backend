param(
  [string]$Endpoint = "https://sandblast-backend.onrender.com/api/chat",
  [int]$MaximumMilliseconds = 5000
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 may otherwise negotiate an older TLS version.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-FirstNonEmptyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Values
  )

  foreach ($value in $Values) {
    if ($null -ne $value) {
      $text = [string]$value
      if (-not [string]::IsNullOrWhiteSpace($text)) {
        return $text
      }
    }
  }

  return ""
}

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

  $body = @{
    sessionId = $session
    turnId = "${session}_turn"
    traceId = "${session}_trace"
    lane = "public_interface"
    source = "nyx_catalog_r6_live_test_ps51"
    audience = "public"
    surfaceAgent = "nyx"
    publicSurfaceOnly = $true
    publicIdentityLock = $true
    requireCleanPublicReply = $true
    message = $Prompt
    text = $Prompt
    presentationProfile = "public"
  } | ConvertTo-Json -Depth 10

  $watch = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $response = Invoke-RestMethod `
      -Uri $Endpoint `
      -Method Post `
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

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      Write-Host "Response body:"
      Write-Host $_.ErrorDetails.Message
    }

    throw
  }

  $watch.Stop()

  # PowerShell 5.1 does not support the PowerShell 7 null-coalescing operator (??).
  $reply = Get-FirstNonEmptyValue -Values @(
    $response.reply
    $response.publicReply
    $response.visibleReply
    $response.displayReply
    $response.text
    $response.answer
  )

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
Write-Host "PASS: live Nyx media catalog retrieval R6 on Windows PowerShell 5.1." -ForegroundColor Green
