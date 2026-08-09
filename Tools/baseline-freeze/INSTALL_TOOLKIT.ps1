param(
    [string]$BackendRoot = 'C:\Users\User\Desktop\sandblast backend'
)

$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$destination = Join-Path $BackendRoot 'tools\baseline-freeze'

if (-not (Test-Path -LiteralPath $BackendRoot -PathType Container)) {
    throw "Backend root does not exist: $BackendRoot"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null

Get-ChildItem -LiteralPath $source -Force | Where-Object {
    $_.Name -ne 'INSTALL_TOOLKIT.ps1'
} | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
}

Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $destination 'INSTALL_TOOLKIT.ps1') -Force

Write-Host "[PASS] Toolkit installed to:"
Write-Host $destination
Write-Host "No runtime file, route, Marion layer, composer, State Spine, or execution authority was modified."
