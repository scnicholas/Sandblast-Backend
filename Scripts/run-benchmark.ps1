Write-Host "Running Sandblast Benchmarking Phases 1 & 2..." -ForegroundColor Cyan

node .\runBenchmark.js

Write-Host ""
Write-Host "Optional Jest tests:" -ForegroundColor Yellow
Write-Host "npm test -- tests/benchmarking/phase1-baseline-smoke.test.js"
Write-Host "npm test -- tests/benchmarking/phase2-controlled-scenarios.test.js"
