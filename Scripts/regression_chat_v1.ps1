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

function Assert-ContainsAll([string]$hay, [string[]]$needles, [string]$name) {
  $h = [string]$hay
  foreach($n in $needles){
    if (-not ($h -match [regex]::Escape($n))) {
      throw "$name failed: reply missing expected token: '$n'"
    }
  }
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

function Assert-Lane($r, [string]$expectLane, [string]$name) {
  Assert-DebugState $r $name
  $lane = [string]$r.debug.state.lane
  if ([string]::IsNullOrWhiteSpace($lane)) { throw "$name failed: debug.state.lane missing" }
  if ($lane -ne $expectLane) { throw "$name failed: expected lane='$expectLane' got '$lane'" }
}

function Assert-HasAnyChip($r, [string[]]$chipLabels, [string]$name) {
  if ($null -eq $r.followUps -or $r.followUps.Count -lt 1) { throw "$name failed: followUps missing" }
  $labels = @($r.followUps | ForEach-Object { [string]$_.label })
  foreach($c in $chipLabels){
    if ($labels -contains $c) { return }
  }
  throw "$name failed: expected at least one chip in: $($chipLabels -join ', ') ; got: $($labels -join ' | ')"
}

function Assert-ScheduleTzState($r, [string]$name) {
  Assert-DebugState $r $name
  $lane = [string]$r.debug.state.lane
  if ($lane -ne "schedule") { throw "$name failed: expected lane='schedule' got '$lane'" }

  # These may be null on first question depending on resolver behavior,
  # but once we ask with an explicit city, we expect them to be set.
  $tz   = [string]$r.debug.state.userTz
  $city = [string]$r.debug.state.userCity

  if ([string]::IsNullOrWhiteSpace($tz))   { throw "$name failed: expected debug.state.userTz to be set" }
  if ([string]::IsNullOrWhiteSpace($city)) { throw "$name failed: expected debug.state.userCity to be set" }
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

# Light check only — avoid brittle copy checks
Assert-ContainsAny $r4.reply @("Top 10", "1.") "Explicit Top 10 reply shape"

# -------------------------
# D) Lane switching smoke (Sponsors / Movies)
# -------------------------
$r7 = Post-Chat "Sponsors Lane" "sponsors_lane"
Assert-Ok $r7 "Sponsors Lane"
Assert-Lane $r7 "sponsors" "Sponsors Lane sets lane"
Assert-ContainsAny $r7.reply @("Sponsors", "goal") "Sponsors Lane reply shape"
Show-Summary $r7 "7) Sponsors Lane"
$script:Step++

$r8 = Post-Chat "Movies Lane" "movies_lane"
Assert-Ok $r8 "Movies Lane"
Assert-Lane $r8 "movies" "Movies Lane sets lane"
Assert-ContainsAny $r8.reply @("Movies", "movie") "Movies Lane reply shape"
Show-Summary $r8 "8) Movies Lane"
$script:Step++

# Exit lane back to music
$r9 = Post-Chat "Back" "lane_exit_back"
Assert-Ok $r9 "Lane Exit Back"
Assert-Lane $r9 "music" "Back exits to music lane"
Show-Summary $r9 "9) Back exits lane to music"
$script:Step++

# -------------------------
# E) Schedule Lane (timezone-aware) smoke
# -------------------------

# E1) Explicit lane command
$r10 = Post-Chat "Schedule Lane" "schedule_lane_cmd"
Assert-Ok $r10 "Schedule Lane (cmd)"
Assert-Lane $r10 "schedule" "Schedule Lane command sets lane"
Assert-ContainsAny $r10.reply @("Schedule Lane", "schedule") "Schedule Lane cmd reply shape"
Show-Summary $r10 "10) Schedule Lane command"
$script:Step++

# E2) Intent-based schedule question w/ explicit city (should set userCity/userTz)
$r11 = Post-Chat "What time does Gospel Sunday play in London?" "schedule_london_q"
Assert-Ok $r11 "Schedule London Q"
Assert-Lane $r11 "schedule" "Schedule question keeps lane"
Assert-ScheduleTzState $r11 "Schedule London Q sets tz"
Assert-ContainsAny $r11.reply @("London", "ET", "EST", "GMT", "UTC", "local") "Schedule reply mentions time context"
Show-Summary $r11 "11) Schedule question (London) sets tz"
$script:Step++

# E3) Now/playing intent should still route schedule (state already has tz/city)
$r12 = Post-Chat "What's playing now?" "schedule_playing_now"
Assert-Ok $r12 "Schedule Playing Now"
Assert-Lane $r12 "schedule" "Playing now routes schedule"
# Expect it to be schedule-y, but keep it non-brittle.
Assert-ContainsAny $r12.reply @("playing", "now", "schedule", "on") "Schedule playing-now reply shape"
Show-Summary $r12 "12) Schedule: what's playing now"
$script:Step++

# E4) Lane exit back to music again
$r13 = Post-Chat "Back to music" "schedule_exit_music"
Assert-Ok $r13 "Exit schedule to music"
Assert-Lane $r13 "music" "Back to music exits schedule lane"
Show-Summary $r13 "13) Exit schedule lane to music"
$script:Step++

Write-Host ""
Write-Host "PASS: regression_chat_v1 completed. Outputs in $OutDir"
exit 0
