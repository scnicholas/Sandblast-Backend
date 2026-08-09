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
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Baseline manifest missing: $manifestPath"
}

$baseline = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$current = Get-HashInventory -Root $root

$baseMap = @{}
foreach ($i in $baseline) { $baseMap[$i.path] = $i.sha256 }
$currentMap = @{}
foreach ($i in $current) { $currentMap[$i.path] = $i.sha256 }

$removed = @($baseMap.Keys | Where-Object { -not $currentMap.ContainsKey($_) } | Sort-Object)
$added   = @($currentMap.Keys | Where-Object { -not $baseMap.ContainsKey($_) } | Sort-Object)
$changed = @($baseMap.Keys | Where-Object {
    $currentMap.ContainsKey($_) -and $baseMap[$_] -ne $currentMap[$_]
} | Sort-Object)

Write-Host "=== Current Backend vs Certified Baseline ==="
Write-Host "Baseline: $BaselinePath"
Write-Host "Removed: $($removed.Count)"
Write-Host "Added:   $($added.Count)"
Write-Host "Changed: $($changed.Count)"

if ($removed) { Write-Host "`nREMOVED"; $removed | ForEach-Object { Write-Host " - $_" } }
if ($added)   { Write-Host "`nADDED";   $added   | ForEach-Object { Write-Host " + $_" } }
if ($changed) { Write-Host "`nCHANGED"; $changed | ForEach-Object { Write-Host " * $_" } }

if (-not ($removed.Count -or $added.Count -or $changed.Count)) {
    Write-Host "[PASS] Current backend matches the certified baseline."
    exit 0
}

Write-Warning "Current backend differs from the certified baseline."
exit 2
