$ErrorActionPreference = "Stop"

# Set your base URL
$BASE = $env:BASE
if (-not $BASE) { $BASE = "https://sandblast-backend.onrender.com" }

$sessionId = "shadow_api_test_01"
$visitorId = "mac-shadow-api"

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

Write-Host "BASE = $BASE"
Write-Host "Session = $sessionId"

# 1) Bare year
$r1 = Call-Chat "1988"
Write-Host "`n[1] reply:" $r1.reply
if (-not $r1.shadow) { throw "Expected payload.shadow but got null. (Did you wire shadowBrain.get() into res.json?)" }
Write-Host "[1] shadow lane:" $r1.shadow.lane "year:" $r1.shadow.year

# 2) Story moment
$r2 = Call-Chat "story moment 1988"
Write-Host "`n[2] reply:" $r2.reply
if (-not $r2.shadow) { throw "Expected payload.shadow in turn 2" }
Write-Host "[2] top intent:" ($r2.shadow.orderedIntents[0].intent)

# 3) Stop asking
$r3 = Call-Chat "stop asking questions. just do it."
Write-Host "`n[3] reply:" $r3.reply
if (-not $r3.shadow) { throw "Expected payload.shadow in turn 3" }

# 4) Determinism check: same input twice should produce same orderedIntents
$r4a = Call-Chat "story moment 1988"
Start-Sleep -Milliseconds 50
$r4b = Call-Chat "story moment 1988"

$topA = ($r4a.shadow.orderedIntents | Select-Object -First 4 | ForEach-Object { $_.intent }) -join "|"
$topB = ($r4b.shadow.orderedIntents | Select-Object -First 4 | ForEach-Object { $_.intent }) -join "|"

Write-Host "`n[4] top intents A:" $topA
Write-Host "[4] top intents B:" $topB

if ($topA -ne $topB) { throw "Non-deterministic orderedIntents for same input." }

Write-Host "`n✅ Shadow Brain API regression PASSED"
