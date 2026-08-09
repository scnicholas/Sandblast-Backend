Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-BackendRoot {
    param([string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend')
    $resolved = [System.IO.Path]::GetFullPath($BackendRoot)
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw "Backend root does not exist: $resolved"
    }
    return $resolved.TrimEnd('\')
}

function Get-BaselineRoot {
    param([string]$BackendRoot)
    return (Join-Path $BackendRoot '_certified_baselines')
}

function Get-ExcludedTopLevelNames {
    @('node_modules', '.git', '_certified_baselines')
}

function Test-IsExcludedRelativePath {
    param([string]$RelativePath)
    $normalized = $RelativePath.Replace('/', '\').TrimStart('\')

    foreach ($name in (Get-ExcludedTopLevelNames)) {
        if ($normalized -eq $name -or $normalized.StartsWith("$name\")) {
            return $true
        }
    }

    if ($normalized -match '(^|\\)(coverage|\.nyc_output|dist|build|tmp|temp)(\\|$)') {
        return $true
    }

    if ($normalized -match '\.(log|tmp)$') {
        return $true
    }

    return $false
}

function Get-RelativePathSafe {
    param(
        [string]$BasePath,
        [string]$FullPath
    )

    # Windows PowerShell 5.1 / .NET Framework compatibility.
    # System.IO.Path.GetRelativePath() is not available in older .NET Framework.
    $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\', '/')
    $full = [System.IO.Path]::GetFullPath($FullPath)

    if ($full.Equals($base, [System.StringComparison]::OrdinalIgnoreCase)) {
        return ''
    }

    $prefix = $base + [System.IO.Path]::DirectorySeparatorChar

    if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the expected backend root. Base='$base' Full='$full'"
    }

    return $full.Substring($prefix.Length).Replace('/', '\')
}

function Get-HashInventory {
    param([string]$Root)

    $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    $items = New-Object System.Collections.Generic.List[object]

    Get-ChildItem -LiteralPath $rootPath -File -Recurse -Force | ForEach-Object {
        $relative = Get-RelativePathSafe -BasePath $rootPath -FullPath $_.FullName
        if (-not (Test-IsExcludedRelativePath -RelativePath $relative)) {
            $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
            $items.Add([pscustomobject]@{
                path   = $relative
                sha256 = $hash.Hash.ToLowerInvariant()
                bytes  = $_.Length
            })
        }
    }

    return @($items | Sort-Object path)
}

function Get-LatestCertifiedBaseline {
    param([string]$BackendRoot)

    $baselineRoot = Get-BaselineRoot -BackendRoot $BackendRoot
    if (-not (Test-Path -LiteralPath $baselineRoot)) {
        throw "No certified baseline directory exists yet: $baselineRoot"
    }

    $candidates = Get-ChildItem -LiteralPath $baselineRoot -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'CERTIFIED_BASELINE.txt') } |
        Sort-Object Name -Descending

    if (-not $candidates) {
        throw "No certified baseline found under: $baselineRoot"
    }

    return $candidates[0].FullName
}

function Assert-CanonicalPaths {
    param([string]$BackendRoot)

    $required = @(
        'package.json',
        'utils\chatEngine.js',
        'utils\tts.js',
        'utils\ttsProvidersResemble.js',
        'utils\voiceRoute.js',
        'utils\nyxVoiceMount.js',
        'utils\nyx_state_controller.js',
        'public\nyx\sandblast_nyx_widget.html',
        'Data\marion\runtime\metacognition',
        'tests\marion\marionStrategicPlanner.test.js',
        'tests\marion\marionLayer27Integration.test.js'
    )

    $missing = @()
    foreach ($rel in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $BackendRoot $rel))) {
            $missing += $rel
        }
    }

    if ($missing.Count -gt 0) {
        throw ("Canonical path preflight failed. Missing:`n - " + ($missing -join "`n - "))
    }
}

function Assert-Round6Script {
    param([string]$BackendRoot)

    $packagePath = Join-Path $BackendRoot 'package.json'
    $pkg = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    $scriptNames = @($pkg.scripts.PSObject.Properties.Name)

    if ($scriptNames -notcontains 'verify:marion-round6') {
        throw "package.json does not contain npm script: verify:marion-round6"
    }
}

function Invoke-Round6Certification {
    param([string]$BackendRoot)

    Push-Location $BackendRoot
    try {
        & npm.cmd run verify:marion-round6
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "Marion Round 6 certification failed with exit code $exitCode. Baseline must NOT be frozen."
    }
    return $exitCode
}

function Copy-BackendSnapshot {
    param([string]$BackendRoot, [string]$SnapshotRoot)

    New-Item -ItemType Directory -Path $SnapshotRoot -Force | Out-Null

    $excludedDirs = @(
        (Join-Path $BackendRoot 'node_modules'),
        (Join-Path $BackendRoot '.git'),
        (Join-Path $BackendRoot '_certified_baselines')
    )

    $args = @(
        $BackendRoot,
        $SnapshotRoot,
        '/E',
        '/COPY:DAT',
        '/DCOPY:DAT',
        '/R:1',
        '/W:1',
        '/NFL',
        '/NDL',
        '/NP',
        '/NJH',
        '/NJS',
        '/XF', '*.log', '*.tmp',
        '/XD'
    ) + $excludedDirs

    & robocopy @args | Out-Null
    $code = $LASTEXITCODE

    if ($code -gt 7) {
        throw "Robocopy snapshot failed with exit code $code"
    }
}

function Write-JsonFile {
    param([object]$Object, [string]$Path)
    $Object | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Path -Encoding UTF8
}
