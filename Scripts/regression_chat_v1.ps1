# Scripts\regression_chat_v1.ps1
param(
  [string]$Base = $env:BASE,
  [string]$SID = "laneTest01",
  [string]$VID = "mac-lane-001"
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

Write-Host "Running regression_chat_v1..."
Write-Host "BASE=$script:Base"
Write-Host "OutDir=$OutDir"

$r1 = Post-Chat "story moment 1988" "music_seed"
Assert-Ok $r1 "Music seed"
Show-Summary $r1 "1) Music seed: story moment 1988"
$script:Step++

$r2 = Post-Chat "Replay last" "replay"
Assert-Ok $r2 "Replay"
Show-Summary $r2 "2) Replay last"
$script:Step++

$r3 = Post-Chat "Sponsors Lane" "sponsors_lane"
Assert-Ok $r3 "Sponsors Lane"
Show-Summary $r3 "3) Sponsors Lane"
$script:Step++

$r4 = Post-Chat "Movies Lane" "movies_lane"
Assert-Ok $r4 "Movies Lane"
Show-Summary $r4 "4) Movies Lane"

Write-Host ""
Write-Host "PASS: regression_chat_v1 completed. Outputs in $OutDir"
exit 0
