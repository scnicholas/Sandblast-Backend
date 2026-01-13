param(
  [string]$Base = $env:BASE
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Base)) { throw "BASE missing" }
$Base = $Base.Trim().TrimEnd("/")

function Post($text, $deviceTz="Europe/London"){
  $payload = @{
    text=$text
    sessionId="t_sched_v1_1"
    visitorId="mac-sched"
    contractVersion="1"
    deviceTz=$deviceTz
  } | ConvertTo-Json -Compress

  Invoke-RestMethod -Method Post -Uri "$Base/api/chat?debug=1" -ContentType "application/json" -Body $payload
}

Write-Host "1) Enter schedule lane"
Post "Schedule" | Select-Object ok,reply | Format-List

Write-Host "2) Now/Next/Later"
Post "Now next later" | Select-Object ok,reply | Format-List

Write-Host "3) For me (device tz)"
Post "What time does Gospel Sunday play for me?" "Europe/London" | Select-Object ok,reply | Format-List

Write-Host "4) Explicit city"
Post "What time does Gospel Sunday play in Toronto?" "Europe/London" | Select-Object ok,reply | Format-List

Write-Host "5) Convert ET time"
Post "Convert 8pm ET to London" "America/Toronto" | Select-Object ok,reply | Format-List

Write-Host "6) Back to music"
Post "Back to music" | Select-Object ok,reply | Format-List

Write-Host "PASS schedule v1.1 regression"
