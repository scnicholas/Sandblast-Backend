param(
    [string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend',
    [string]$BaselinePath
)

. "$PSScriptRoot\lib\BaselineFreeze.Common.ps1"

$root = Get-BackendRoot -BackendRoot $BackendRoot
if (-not $BaselinePath) {
    $BaselinePath = Get-LatestCertifiedBaseline -BackendRoot $root
}

$manifestPath = Join-Path $BaselinePath 'baseline-manifest.json'
$snapshotPath = Join-Path $BaselinePath 'snapshot'

if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Manifest missing: $manifestPath" }
if (-not (Test-Path -LiteralPath $snapshotPath)) { throw "Snapshot missing: $snapshotPath" }

$expected = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$actual = Get-HashInventory -Root $snapshotPath

$expectedMap = @{}
foreach ($i in $expected) { $expectedMap[$i.path] = $i.sha256 }
$actualMap = @{}
foreach ($i in $actual) { $actualMap[$i.path] = $i.sha256 }

$missing = @($expectedMap.Keys | Where-Object { -not $actualMap.ContainsKey($_) })
$extra   = @($actualMap.Keys | Where-Object { -not $expectedMap.ContainsKey($_) })
$changed = @($expectedMap.Keys | Where-Object {
    $actualMap.ContainsKey($_) -and $expectedMap[$_] -ne $actualMap[$_]
})

Write-Host "=== Certified Baseline Hash Verification ==="
Write-Host "Baseline: $BaselinePath"
Write-Host "Expected files: $($expectedMap.Count)"
Write-Host "Actual files:   $($actualMap.Count)"
Write-Host "Missing: $($missing.Count)"
Write-Host "Extra:   $($extra.Count)"
Write-Host "Changed: $($changed.Count)"

if ($missing.Count -or $extra.Count -or $changed.Count) {
    if ($missing) { Write-Host "`nMissing:"; $missing | Sort-Object | ForEach-Object { Write-Host " - $_" } }
    if ($extra)   { Write-Host "`nExtra:"; $extra | Sort-Object | ForEach-Object { Write-Host " - $_" } }
    if ($changed) { Write-Host "`nChanged:"; $changed | Sort-Object | ForEach-Object { Write-Host " - $_" } }
    exit 1
}

Write-Host "[PASS] Frozen snapshot is byte-for-byte consistent with its certified manifest."
exit 0
