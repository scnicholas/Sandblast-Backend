# Scripts\regression_chat_v1.ps1
param(
  [string]$Base = $env:BASE,
  [string]$SID  = "laneTest01",
  [string]$VID  = "mac-lane-001"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Base([string]$b){
  if ([string]::IsNullOrWhiteSpace($b)) { throw "BASE is empty. Set `$env:BASE or pass -Base." }
  $b = $b.Trim().TrimEnd("/")
  if (-not ($b -match '^https?://')) { throw "BASE must start with http:// or https:// . Got: $b" }
  return $b
}

$script:Base = Assert-Base $Base
$script:Step = 1

$OutDir = Join-Path $PSScriptRoot "_regression_out"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Post-Chat([string]$msg, [string]$tag) {
  $uri  = "$script:Base/api/chat?debug=1"
  $bodyObj = @{
    message         = $msg
    sessionId       = $SID
    visitorId       = $VID
    contractVersion = "1"
  }
  $json = $bodyObj | ConvertTo-Json -Compress

  try {
    $r = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $json
  } catch {
    $payloadFile = Join-Path $OutDir ("{0:00}_{1}_REQUEST.json" -f $script:Step, $tag)
    $json | Out-File -Encoding utf8 $payloadFile
    throw "HTTP call failed. URI=$uri ; Saved request to $payloadFile ; Error=$($_.Exception.Message)"
  }

  $file = Join-Path $OutDir ("{0:00}_{1}.json" -f $script:Step, $tag)
  ($r | ConvertTo-Json -Depth 15) | Out-File -Encoding utf8 $file
  return $r
}

function Assert-Ok($r, [string]$name) {
  if ($null -eq $r) { throw "$name failed: response is null" }
  if (-not $r.ok)   { throw "$name failed: ok=false" }
  if ([string]::IsNullOrWhiteSpace($r.reply)) { throw "$name failed: missing reply" }
  if ([string]::IsNullOrWhiteSpace($r.sessionId)) { throw "$name failed: missing sessionId" }
  if ([string]::IsNullOrWhiteSpace($r.contractVersion)) { throw "$name failed: missing contractVersion" }
  if ($null -eq $r.followUps -or $r.followUps.Count -lt 1) { throw "$name failed: missing followUps" }
}

function Show-Summary($r, [string]$name) {
  $chips = @()
  if ($r.followUps) { $chips = $r.followUps | ForEach-Object { $_.label } }
  $chipsLine = ($chips | Select-Object -First 8) -join " | "

  $replyLine = ($r.reply -replace "\s+", " ").Trim()
  if ($replyLine.Length -gt 160) { $replyLine = $replyLine.Substring(0,160) + "..." }

  Write-Host ""
  Write-Host "=== $name ==="
  Write-Host "BASE: $script:Base"
  Write-Host "SID:  $SID"
  Write-Host "VID:  $VID"
  Write-Host "reply: $replyLine"
  Write-Host "chips: $chipsLine"
}

function Assert-DebugState($r, [string]$name) {
  if ($null -eq $r.debug) { throw "$name failed: missing debug (ensure ?debug=1 is enabled)" }
  if ([string]::IsNullOrWhiteSpace($r.debug.index)) { throw "$name failed: missing debug.index" }
  if ($null -eq $r.debug.state) { throw "$name failed: missing debug.state" }
}

function Assert-ContainsAny([string]$hay, [string[]]$needles, [string]$name) {
  $h = [string]$hay
  foreach($n in $needles){
    if ($h -match [regex]::Escape($n)) { return }
  }
  throw "$name failed: reply did not contain any of: $($needles -join ', ')"
}

function Assert-MusicModeChart($r, [string]$expectMode, [string]$expectChart, [string]$name) {
  Assert-DebugState $r $name
  $mode  = [string]$r.debug.state.activeMusicMode
  $chart = [string]$r.debug.state.activeMusicChart

  if ([string]::IsNullOrWhiteSpace($mode))  { throw "$name failed: debug.state.activeMusicMode missing" }
  if ([string]::IsNullOrWhiteSpace($chart)) { throw "$name failed: debug.state.activeMusicChart missing" }

  if ($mode -ne $expectMode) {
    throw "$name failed: expected activeMusicMode='$expectMode' got '$mode'"
  }
  if ($chart -ne $expectChart) {
    throw "$name failed: expected activeMusicChart='$expectChart' got '$chart'"
  }
}

Write-Host "Running regression_chat_v1..."
Write-Host "BASE=$script:Base"
Write-Host "OutDir=$OutDir"

# -------------------------
# A) Seed music state
# -------------------------
$r1 = Post-Chat "story moment 1988" "music_seed"
Assert-Ok $r1 "Music seed"
Show-Summary $r1 "1) Music seed: story moment 1988"
$script:Step++

# -------------------------
# B) Replay integrity
# -------------------------
$r2 = Post-Chat "Replay last" "replay"
Assert-Ok $r2 "Replay"
Show-Summary $r2 "2) Replay last"
$script:Step++

# -------------------------
# C) Top10 Explicit Guard regression
# -------------------------
$YEAR = 1963
$YEAR_END_CHART = "Billboard Year-End Hot 100"

# C1) Bare year defaults to Top 10 (must not auto-run story)
$r3 = Post-Chat "$YEAR" "bare_year_defaults_top10"
Assert-Ok $r3 "Bare year defaults Top10"
Assert-MusicModeChart $r3 "top10" $YEAR_END_CHART "Bare year defaults Top10"
Show-Summary $r3 "3) Bare year '$YEAR' defaults to Top 10"
$script:Step++

# C2) Explicit "Top 10 ####" must remain Top 10 (no degradation)
$r4 = Post-Chat "Top 10 $YEAR" "explicit_top10"
Assert-Ok $r4 "Explicit Top 10"
Assert-MusicModeChart $r4 "top10" $YEAR_END_CHART "Explicit Top 10"
Show-Summary $r4 "4) Explicit 'Top 10 $YEAR' stays Top 10"
$script:Step++

# C3) "top10 ####" variant must remain Top 10
$r5 = Post-Chat "top10 $YEAR" "explicit_top10_compact"
Assert-Ok $r5 "Explicit top10 compact"
Assert-MusicModeChart $r5 "top10" $YEAR_END_CHART "Explicit top10 compact"
Show-Summary $r5 "5) Explicit 'top10 $YEAR' stays Top 10"
$script:Step++

# C4) "top ten ####" variant must remain Top 10
$r6 = Post-Chat "top ten $YEAR" "explicit_top_ten"
Assert-Ok $r6 "Explicit top ten"
Assert-MusicModeChart $r6 "top10" $YEAR_END_CHART "Explicit top ten"
Show-Summary $r6 "6) Explicit 'top ten $YEAR' stays Top 10"
$script:Step++

# Optional: also assert reply isn't obviously a story moment opener
# (Light check only — we don't want false negatives if copy changes.)
Assert-ContainsAny $r4.reply @("Top 10", "1.") "Explicit Top 10 reply shape"

# -------------------------
# D) Lane switching smoke
# -------------------------
$r7 = Post-Chat "Sponsors Lane" "sponsors_lane"
Assert-Ok $r7 "Sponsors Lane"
Show-Summary $r7 "7) Sponsors Lane"
$script:Step++

$r8 = Post-Chat "Movies Lane" "movies_lane"
Assert-Ok $r8 "Movies Lane"
Show-Summary $r8 "8) Movies Lane"

Write-Host ""
Write-Host "PASS: regression_chat_v1 completed. Outputs in $OutDir"
exit 0
