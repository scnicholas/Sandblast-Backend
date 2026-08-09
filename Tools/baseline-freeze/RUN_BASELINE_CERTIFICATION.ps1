param(
    [string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend'
)

. "$PSScriptRoot\lib\BaselineFreeze.Common.ps1"

$root = Get-BackendRoot -BackendRoot $BackendRoot
Assert-CanonicalPaths -BackendRoot $root
Assert-Round6Script -BackendRoot $root

Write-Host "=== Marion Round 6 Baseline Certification ==="
Write-Host "Command: npm run verify:marion-round6"
Write-Host "Root: $root"

Invoke-Round6Certification -BackendRoot $root | Out-Null

Write-Host "[PASS] npm run verify:marion-round6 returned exit code 0."
Write-Host "[CERTIFIABLE] Backend is eligible for baseline freeze."
