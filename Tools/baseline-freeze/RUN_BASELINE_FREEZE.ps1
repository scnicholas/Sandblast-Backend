param(
    [string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend',
    [switch]$SkipCertification
)

. "$PSScriptRoot\lib\BaselineFreeze.Common.ps1"

$root = Get-BackendRoot -BackendRoot $BackendRoot

Write-Host "=== Sandblast / Marion Certified Baseline Freeze ==="
Write-Host "Backend root: $root"

Assert-CanonicalPaths -BackendRoot $root
Assert-Round6Script -BackendRoot $root

if (-not $SkipCertification) {
    Write-Host "[1/5] Running required Round 6 certification..."
    Invoke-Round6Certification -BackendRoot $root | Out-Null
    Write-Host "[PASS] Round 6 certification passed."
}
else {
    Write-Warning "Certification was skipped by explicit switch. Use only after a same-session verified pass."
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baselineRoot = Get-BaselineRoot -BackendRoot $root
$baselineDir = Join-Path $baselineRoot $timestamp
$snapshotDir = Join-Path $baselineDir 'snapshot'

New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null

Write-Host "[2/5] Calculating active backend hashes..."
$activeInventory = Get-HashInventory -Root $root

Write-Host "[3/5] Copying certified backend snapshot..."
Copy-BackendSnapshot -BackendRoot $root -SnapshotRoot $snapshotDir

Write-Host "[4/5] Calculating snapshot hashes..."
$snapshotInventory = Get-HashInventory -Root $snapshotDir

$activeMap = @{}
foreach ($i in $activeInventory) { $activeMap[$i.path] = $i.sha256 }
$snapshotMap = @{}
foreach ($i in $snapshotInventory) { $snapshotMap[$i.path] = $i.sha256 }

$missing = @($activeMap.Keys | Where-Object { -not $snapshotMap.ContainsKey($_) })
$extra   = @($snapshotMap.Keys | Where-Object { -not $activeMap.ContainsKey($_) })
$changed = @($activeMap.Keys | Where-Object {
    $snapshotMap.ContainsKey($_) -and $activeMap[$_] -ne $snapshotMap[$_]
})

if ($missing.Count -or $extra.Count -or $changed.Count) {
    throw "Snapshot verification failed before certification marker was written. Missing=$($missing.Count), Extra=$($extra.Count), Changed=$($changed.Count)"
}

$metadata = [pscustomobject]@{
    toolkitVersion = '1.0'
    baselineId = $timestamp
    createdAt = (Get-Date).ToString('o')
    backendRoot = $root
    certificationCommand = 'npm run verify:marion-round6'
    certificationExitCode = 0
    constraints = @(
        'Preserve Layer 24 hard stop',
        'Preserve Layer 26 hard stop',
        'Preserve Layer 28 hard stop',
        'Layer 28 canonical path = Data\marion\runtime\metacognition',
        'No Layer 29',
        'Execution disabled',
        'Composer/final-reply authority preserved',
        'State Spine continuity preserved'
    )
    fileCount = $activeInventory.Count
}

Write-JsonFile -Object $activeInventory -Path (Join-Path $baselineDir 'baseline-manifest.json')
Write-JsonFile -Object $metadata -Path (Join-Path $baselineDir 'baseline-metadata.json')

@"
SANDLAST / MARION CERTIFIED BASELINE
Baseline ID: $timestamp
Created: $((Get-Date).ToString('o'))
Certification: npm run verify:marion-round6
Certification exit code: 0
File count: $($activeInventory.Count)

Protected:
- Layer 24 hard stop
- Layer 26 hard stop
- Layer 28 hard stop
- Layer 28 path Data\marion\runtime\metacognition
- No Layer 29
- Execution disabled
- Composer/final-reply authority
- State Spine continuity
"@ | Set-Content -LiteralPath (Join-Path $baselineDir 'CERTIFIED_BASELINE.txt') -Encoding UTF8

Write-Host "[5/5] Certified baseline created."
Write-Host "Baseline: $baselineDir"
Write-Host "[PASS] Active backend and frozen snapshot hashes match."
