param(
  [string]$Endpoint = "https://sandblast-backend.onrender.com/api/chat",
  [int]$MaximumMilliseconds = 5000
)

$ErrorActionPreference = "Stop"

function Invoke-NyxCatalogTest {
  param(
    [string]$Prompt,
    [string]$ExpectedIntent,
    [string]$ExpectedPattern
  )

  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $session = "nyx_catalog_r6_$stamp"

  $body = @{
    sessionId = $session
    turnId = "${session}_turn"
    traceId = "${session}_trace"
    lane = "public_interface"
    source = "nyx_catalog_r6_live_test"
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
  $response = Invoke-RestMethod `
    -Uri $Endpoint `
    -Method Post `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec 20
  $watch.Stop()

  $reply = [string](
    $response.reply ??
    $response.publicReply ??
    $response.visibleReply ??
    $response.displayReply ??
    $response.text ??
    $response.answer
  )

  Write-Host ""
  Write-Host "Prompt: $Prompt"
  Write-Host "Elapsed: $($watch.ElapsedMilliseconds) ms"
  Write-Host "Intent: $($response.intent)"
  Write-Host "Reply: $reply"
  Write-Host "Catalog count: $($response.catalog.activeCount)"

  if ([string]::IsNullOrWhiteSpace($reply)) {
    throw "FAIL: Empty reply."
  }
  if ($response.intent -ne $ExpectedIntent) {
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
  if ($response.routeType -ne "knowledge") {
    throw "FAIL: Catalog retrieval was not returned as a knowledge route."
  }
  if ($response.catalog.dynamic -ne $true) {
    throw "FAIL: Dynamic catalog metadata was not returned."
  }
  if ($watch.ElapsedMilliseconds -gt $MaximumMilliseconds) {
    throw "FAIL: Response exceeded $MaximumMilliseconds ms."
  }
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
  -ExpectedPattern "(?i)classic-film selections|cartoon selections"

Write-Host ""
Write-Host "PASS: live Nyx media catalog retrieval R6."
