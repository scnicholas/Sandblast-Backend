param(
    [string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend'
)

. "$PSScriptRoot\lib\BaselineFreeze.Common.ps1"

$root = Get-BackendRoot -BackendRoot $BackendRoot

Write-Host "=== Sandblast Baseline Freeze Preflight ==="
Write-Host "Backend root: $root"

Assert-CanonicalPaths -BackendRoot $root
Assert-Round6Script -BackendRoot $root

$forbiddenLayer29 = @(
    (Join-Path $root 'Data\marion\runtime\layer29'),
    (Join-Path $root 'Data\marion\runtime\Layer29')
)

foreach ($path in $forbiddenLayer29) {
    if (Test-Path -LiteralPath $path) {
        throw "Layer 29 path detected. Freeze aborted: $path"
    }
}

Write-Host "[PASS] Canonical paths present."
Write-Host "[PASS] verify:marion-round6 npm script present."
Write-Host "[PASS] Canonical Layer 28 metacognition path present."
Write-Host "[PASS] No obvious Layer 29 directory detected."
Write-Host "[READY] Preflight passed."
