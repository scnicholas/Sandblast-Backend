# Scripts/pillarA_fmp_regression.ps1
# Pillar A — Forward Motion Patch (FMP) Regression Harness
# Verifies: greeting chips, handshake flows, nav, replay integrity, visit counting stability (via debug)

$ErrorActionPreference = "Stop"

# ===== CONFIG (HARDENED) =====
$BASE = $env:BASE
if (-not $BASE) { $BASE = "https://sandblast-backend.onrender.com" }

# Strip hidden chars + whitespace + smart quotes; ensure scheme; remove trailing slash
$BASE = ($BASE | Out-String).Trim()
$BASE = $BASE -replace "\u200B",""            # zero-width space
$BASE = $BASE -replace "[`r`n`t ]",""         # CR/LF/TAB/spaces
$BASE = $BASE -replace "[“”‘’]",""            # smart quotes
if ($BASE -notmatch '^https?://') { $BASE = "https://$BASE" }
$BASE = $BASE.TrimEnd("/")

$VISITOR  = "mac-regress-001"
$CONTRACT = "1"

function New-SessionId([string]$prefix) {
  return "{0}-{1}-{2}" -f $prefix, ([Guid]::NewGuid().ToString("N").Substring(0,8)), (Get-Date).ToString("HHmmss")
}

function Invoke-NyxChat([string]$msg, [string]$sid, [switch]$Debug) {
  $uri = "{0}/api/chat" -f $BASE
  if ($Debug) { $uri = "{0}/api/chat?debug=1" -f $BASE }

  # Optional safety: validate URI early with a clearer error than Invoke-RestMethod
  try { [void][Uri]$uri } catch { throw "BAD URI BUILT: '$uri' (BASE='$BASE')" }

  $payload = @{
    message         = $msg
    sessionId       = $sid
    visitorId       = $VISITOR
    contractVersion = $CONTRACT
  } | ConvertTo-Json -Depth 6

  $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $payload
  return $resp
}

function Assert-True([bool]$cond, [string]$label) {
  if (-not $cond) { throw "ASSERT FAILED: $label" }
  Write-Host "PASS: $label"
}

function Assert-Eq($a, $b, [string]$label) {
  if ($a -ne $b) { throw "ASSERT FAILED: $label (got '$a' expected '$b')" }
  Write-Host "PASS: $label"
}

function Get-FollowupLabels($resp) {
  if ($resp.followUp) { return @($resp.followUp) }
  if ($resp.followUps) { return @($resp.followUps | ForEach-Object { $_.label }) }
  return @()
}

function Contains-Any([string]$text, [string[]]$needles) {
  foreach ($n in $needles) {
    if ($text -match [regex]::Escape($n)) { return $true }
  }
  return $false
}

Write-Host "`n=== Sandblast Pillar A Regression ==="
Write-Host "BASE=$BASE"
Write-Host "VISITOR=$VISITOR"
Write-Host "CONTRACT=$CONTRACT`n"

# =========================
# A) Greeting flow + returning 4 chips only
# =========================
$sA1 = New-SessionId "A1"
$rA1 = Invoke-NyxChat "hi nyx" $sA1 -Debug
Assert-True ($rA1.ok -eq $true) "A1 ok=true"
$labelsA1 = Get-FollowupLabels $rA1
Assert-True ($labelsA1.Count -gt 0) "A1 has chips"

# new session with same visitor makes returning
$sA2 = New-SessionId "A2"
$rA2 = Invoke-NyxChat "hi nyx" $sA2 -Debug
$labelsA2 = Get-FollowupLabels $rA2

Assert-Eq $labelsA2.Count 4 "A2 returning greeting has exactly 4 chips"
Assert-True (Contains-Any ($labelsA2 -join "|") @("Continue","Start fresh")) "A2 includes Continue/Start fresh"
Assert-True (($labelsA2 -contains "Top 10") -and ($labelsA2 -contains "Story moment") -and ($labelsA2 -contains "Micro moment")) "A2 includes Top10/Story/Micro"

# =========================
# B) Mode -> year handshake (Top 10)
# =========================
$sB = New-SessionId "B"
$rB = Invoke-NyxChat "Top 10" $sB -Debug
Assert-True ($rB.reply -match "(?i)what year|1950|2024") "B asks for year when only mode is provided"

# =========================
# C) Year -> mode handshake
# =========================
$sC = New-SessionId "C"
$rC = Invoke-NyxChat "1988" $sC -Debug
Assert-True ($rC.reply -match "(?i)top 10|story moment|micro moment") "C asks for mode when only year is provided"

# =========================
# D) One-shot (top 10 1988) should not dead-end
# =========================
$sD = New-SessionId "D"
$rD = Invoke-NyxChat "top 10 1988" $sD -Debug
Assert-True ([string]::IsNullOrWhiteSpace($rD.reply) -eq $false) "D has reply text"
$labelsD = Get-FollowupLabels $rD
Assert-True ($labelsD.Count -gt 0) "D has chips"
Assert-True ($labelsD.Count -le 8) "D chips <= 8"

# =========================
# E) Navigation: next/prev/another year
# =========================
$sE = New-SessionId "E"
$rE1 = Invoke-NyxChat "story moment 1957" $sE -Debug
Assert-True ([string]::IsNullOrWhiteSpace($rE1.reply) -eq $false) "E1 has reply"

$rE2 = Invoke-NyxChat "next year" $sE -Debug
Assert-True ($rE2.reply -match "(?i)1958") "E2 next year moves to 1958 (or mentions it)"

$rE3 = Invoke-NyxChat "prev year" $sE -Debug
Assert-True ($rE3.reply -match "(?i)1957") "E3 prev year moves back to 1957 (or mentions it)"

$rE4 = Invoke-NyxChat "another year" $sE -Debug
Assert-True ($rE4.reply -match "(?i)new year|give me a year|what year|1950|2024") "E4 another year prompts for year"

# =========================
# F) Replay integrity: replay must return same chips as last time
# =========================
$sF = New-SessionId "F"
$rF1 = Invoke-NyxChat "micro moment 1959" $sF -Debug
$chips1 = @($rF1.followUps | ForEach-Object { $_.label })  # object chips expected
Assert-True ($chips1.Count -gt 0) "F1 has chips"
$rF2 = Invoke-NyxChat "replay last" $sF -Debug
$chips2 = @($rF2.followUps | ForEach-Object { $_.label })
Assert-Eq ($chips2 -join "|") ($chips1 -join "|") "F2 replay returns same chip set order"

# =========================
# G) FMP loop breaker: vague input after a fully-defined turn should not re-ask year/mode repeatedly
# =========================
$sG = New-SessionId "G"
$rG1 = Invoke-NyxChat "story moment 1965" $sG -Debug
$rG2 = Invoke-NyxChat "ok" $sG -Debug
Assert-True ($rG2.reply -notmatch "(?i)give me a year|what year.*1950|choose.*top 10.*story.*micro") "G2 should not fall back into re-asking year/mode loop"

Write-Host "`n=== ALL TESTS PASSED ===`n"
