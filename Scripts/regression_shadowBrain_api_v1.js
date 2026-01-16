$ErrorActionPreference = "Stop"

# -----------------------------------------
# Config
# -----------------------------------------
$BASE = $env:BASE
if (-not $BASE) { $BASE = "https://sandblast-backend.onrender.com" }

# If you want a clean run every time, uncomment the next line:
# $sessionId = "shadow_api_test_" + [System.Guid]::NewGuid().ToString("N").Substring(0,8)

# Otherwise keep fixed session id (stateful):
$sessionId = "shadow_api_test_01"

$visitorId = "mac-shadow-api"

# Determinism: how long to wait between duplicate calls
$detSleepMs = 50

function Assert-Shadow($resp, $label) {
  if (-not $resp) { throw "[$label] Response is null." }
  if (-not $resp.ok) { throw "[$label] Expected ok=true but got: $($resp.ok)" }
  if (-not $resp.shadow) { throw "[$label] Expected payload.shadow but got null. (Is shadowBrain.get() wired into res.json?)" }

  if (-not $resp.shadow.lane) { throw "[$label] shadow.lane missing" }
  if (-not $resp.shadow.orderedIntents) { throw "[$label] shadow.orderedIntents missing" }
  if ($resp.shadow.orderedIntents.Count -lt 1) { throw "[$label] shadow.orderedIntents empty" }

  # orderedChips can be null depending on implementation, but if present should be an array
  if ($resp.shadow.orderedChips -and ($resp.shadow.orderedChips.Count -lt 1)) {
    throw "[$label] shadow.orderedChips present but empty"
  }
}

function Call-Chat($text) {
  $payload = @{
    text = $text
    sessionId = $sessionId
    visitorId = $visitorId
    contractVersion = "1"
  } | ConvertTo-Json -Compress

  return Invoke-RestMethod -Method Post `
    -Uri "$BASE/api/chat?debug=1" `
    -ContentType "application/json" `
    -Body $payload
}

function TopNIntents($shadow, $n) {
  return (($shadow.orderedIntents | Select-Object -First $n | ForEach-Object { $_.intent }) -join "|")
}

function TopNChips($shadow, $n) {
  if (-not $shadow.orderedChips) { return "" }
  return (($shadow.orderedChips | Select-Object -First $n | ForEach-Object { $_.send }) -join "|")
}

function Print-ShadowSummary($resp, $label) {
  $sh = $resp.shadow
  $top4 = TopNIntents $sh 4
  $chips6 = TopNChips $sh 6

  Write-Host "[$label] lane:" $sh.lane "year:" $sh.year "mode:" $sh.mode "sig:" $sh.sig
  Write-Host "[$label] top intents:" $top4
  if ($chips6) {
    Write-Host "[$label] top chips:" $chips6
  }
}

Write-Host "BASE    = $BASE"
Write-Host "Session = $sessionId"
Write-Host "Visitor = $visitorId"

# -----------------------------------------
# 1) Bare year
# -----------------------------------------
$r1 = Call-Chat "1988"
Write-Host "`n[1] reply:" $r1.reply
Assert-Shadow $r1 "1"
Print-ShadowSummary $r1 "1"

# -----------------------------------------
# 2) Story moment
# -----------------------------------------
$r2 = Call-Chat "story moment 1988"
Write-Host "`n[2] reply:" $r2.reply
Assert-Shadow $r2 "2"
Print-ShadowSummary $r2 "2"

# -----------------------------------------
# 3) Stop asking
# -----------------------------------------
$r3 = Call-Chat "stop asking questions. just do it."
Write-Host "`n[3] reply:" $r3.reply
Assert-Shadow $r3 "3"
Print-ShadowSummary $r3 "3"

# -----------------------------------------
# 4) Determinism check: same input twice should produce same ordering
# -----------------------------------------
$r4a = Call-Chat "story moment 1988"
Start-Sleep -Milliseconds $detSleepMs
$r4b = Call-Chat "story moment 1988"

Assert-Shadow $r4a "4A"
Assert-Shadow $r4b "4B"

$topA = TopNIntents $r4a.shadow 4
$topB = TopNIntents $r4b.shadow 4

$chipsA = TopNChips $r4a.shadow 6
$chipsB = TopNChips $r4b.shadow 6

Write-Host "`n[4] top intents A:" $topA
Write-Host "[4] top intents B:" $topB

if ($topA -ne $topB) {
  Write-Host "`n[4] DEBUG A:"; Print-ShadowSummary $r4a "4A"
  Write-Host "[4] DEBUG B:"; Print-ShadowSummary $r4b "4B"
  throw "Non-deterministic orderedIntents for same input."
}

# Optional stronger check: chips order should also match (if emitted)
if ($chipsA -and $chipsB -and ($chipsA -ne $chipsB)) {
  Write-Host "`n[4] top chips A:" $chipsA
  Write-Host "[4] top chips B:" $chipsB
  throw "Non-deterministic orderedChips for same input."
}

Write-Host "`n✅ Shadow Brain API regression PASSED"
