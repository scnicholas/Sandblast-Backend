param(
    [string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend',
    [string]$BaselinePath,
    [switch]$Apply
)

. "$PSScriptRoot\lib\BaselineFreeze.Common.ps1"

$root = Get-BackendRoot -BackendRoot $BackendRoot
if (-not $BaselinePath) {
    $BaselinePath = Get-LatestCertifiedBaseline -BackendRoot $root
}

$snapshot = Join-Path $BaselinePath 'snapshot'
if (-not (Test-Path -LiteralPath $snapshot -PathType Container)) {
    throw "Certified snapshot missing: $snapshot"
}

Write-Host "=== Certified Baseline Restore ==="
Write-Host "Backend:  $root"
Write-Host "Baseline: $BaselinePath"

if (-not $Apply) {
    Write-Warning "DRY RUN ONLY. No files will be overwritten."
    Write-Host "Run the following only when rollback is intentional:"
    Write-Host ".\RESTORE_CERTIFIED_BASELINE.ps1 -Apply"
    exit 0
}

Write-Warning "APPLY MODE: restoring certified snapshot files into active backend."

# Copy certified files back. We intentionally do NOT /MIR the backend root:
# node_modules, .git, generated data, and later unrelated files are not deleted.
$args = @(
    $snapshot,
    $root,
    '/E',
    '/COPY:DAT',
    '/DCOPY:DAT',
    '/R:1',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NP',
    '/NJH',
    '/NJS'
)

& robocopy @args | Out-Null
$code = $LASTEXITCODE
if ($code -gt 7) {
    throw "Restore robocopy failed with exit code $code"
}

Write-Host "[PASS] Certified snapshot files restored."
Write-Host "Run RUN_BASELINE_CERTIFICATION.ps1 next."
