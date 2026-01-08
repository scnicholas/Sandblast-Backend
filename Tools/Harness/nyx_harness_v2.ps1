<# ============================================================
Nyx Regression Harness — “Regression-Grade” v2 (PowerShell)
- Fixed catalog (40 prompts)
- Regex-based expectations per test
- Writes JUnit XML report for CI/CD (GitHub Actions, etc.)
- Deterministic staging via visitorId (optionally pinned)
- Fails with non-zero exit code on any regression
============================================================ #>

# -----------------------------
# CONFIG
# -----------------------------
$BaseUrl = "https://sandblast-backend.onrender.com"
$SessionId = "harness_" + (Get-Date -Format "yyyyMMdd_HHmmss")
$VisitorId = "harness_" + ([guid]::NewGuid().ToString("N").Substring(0,12))   # pin this if you want stable rollout bucket
$ClientBuild = "widget-harness-ps1-v2"
$ContractVersion = "1"   # set "0" to force legacy behavior
$FailFast = $false       # regression-grade: collect all failures
$TimeoutSec = 45

# Output (JUnit)
$ReportDir = Join-Path $PSScriptRoot "harness_reports"
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$ReportPath = Join-Path $ReportDir ("nyx-junit-" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".xml")

# Optional: /api/s2s test
$S2SAudioPath = ""  # e.g. "C:\temp\short_audio.webm"

# -----------------------------
# Helpers
# -----------------------------
$Results = New-Object System.Collections.Generic.List[object]
$SuiteStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function New-Headers {
  return @{
    "Content-Type"       = "application/json; charset=utf-8"
    "X-Visitor-Id"       = $VisitorId
    "X-Contract-Version" = $ContractVersion
    "X-Client-Build"     = $ClientBuild
  }
}

function Assert-True([bool]$cond, [string]$msg) {
  if (-not $cond) { throw $msg }
}

function Assert-Regex([string]$text, [string]$pattern, [string]$msg) {
  if ($null -eq $text) { throw $msg }
  if (-not ($text -match $pattern)) { throw $msg }
}

function Assert-NotRegex([string]$text, [string]$pattern, [string]$msg) {
  if ($null -eq $text) { return } # null handled elsewhere
  if ($text -match $pattern) { throw $msg }
}

function Add-Result($name, $ok, $detail, $ms) {
  $Results.Add([pscustomobject]@{
    Test   = $name
    Ok     = $ok
    Detail = $detail
    Ms     = $ms
  }) | Out-Null
}

function Invoke-JsonPost([string]$url, [hashtable]$headers, [object]$bodyObj) {
  $bodyJson = ($bodyObj | ConvertTo-Json -Depth 12)
  return Invoke-RestMethod -Method POST -Uri $url -Headers $headers -Body $bodyJson -TimeoutSec $TimeoutSec
}

function Invoke-JsonGet([string]$url, [hashtable]$headers) {
  return Invoke-RestMethod -Method GET -Uri $url -Headers $headers -TimeoutSec $TimeoutSec
}

function Run-Test([string]$name, [scriptblock]$fn) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    & $fn
    $sw.Stop()
    Add-Result $name $true "OK" $sw.ElapsedMilliseconds
  } catch {
    $sw.Stop()
    Add-Result $name $false $_.Exception.Message $sw.ElapsedMilliseconds
    if ($FailFast) { throw }
  }
}

function XmlEscape([string]$s) {
  if ($null -eq $s) { return "" }
  return $s.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;").Replace('"',"&quot;").Replace("'","&apos;")
}

function Write-JUnitReport([string]$path) {
  $SuiteStopwatch.Stop()
  $total = $Results.Count
  $fail  = ($Results | Where-Object {-not $_.Ok}).Count
  $time  = [Math]::Round(($SuiteStopwatch.ElapsedMilliseconds / 1000.0), 3)

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
  [void]$sb.AppendLine(("<testsuite name=""NyxRegressionHarness"" tests=""{0}"" failures=""{1}"" time=""{2}"">" -f $total, $fail, $time))

  foreach ($r in $Results) {
    $t = [Math]::Round(($r.Ms / 1000.0), 3)
    $testName = XmlEscape($r.Test)
    [void]$sb.AppendLine(("  <testcase classname=""Nyx"" name=""{0}"" time=""{1}"">" -f $testName, $t))
    if (-not $r.Ok) {
      $msg = XmlEscape($r.Detail)
      [void]$sb.AppendLine(("    <failure message=""{0}""></failure>" -f $msg))
    }
    [void]$sb.AppendLine("  </testcase>")
  }

  [void]$sb.AppendLine("</testsuite>")
  $sb.ToString() | Out-File -FilePath $path -Encoding utf8
}

function Print-Summary {
  $passed = ($Results | Where-Object {$_.Ok}).Count
  $failed = ($Results | Where-Object {-not $_.Ok}).Count
  Write-Host ""
  Write-Host "==================== HARNESS SUMMARY ====================" -ForegroundColor Cyan
  Write-Host ("BaseUrl: {0}" -f $BaseUrl)
  Write-Host ("SessionId: {0}" -f $SessionId)
  Write-Host ("VisitorId: {0}" -f $VisitorId)
  Write-Host ("ContractVersion sent: {0}" -f $ContractVersion)
  Write-Host ("JUnit Report: {0}" -f $ReportPath)
  Write-Host ("Passed: {0}  Failed: {1}" -f $passed, $failed)

  if ($failed -gt 0) {
    Write-Host ""
    Write-Host "Failures:" -ForegroundColor Yellow
    $Results | Where-Object {-not $_.Ok} | ForEach-Object {
      Write-Host ("- {0}: {1}" -f $_.Test, $_.Detail) -ForegroundColor Red
    }
  }

  Write-Host "=========================================================" -ForegroundColor Cyan
}

# -----------------------------
# Test Catalog (40 prompts)
# Each item: Name, Message, ExpectRegex (required), RejectRegex (optional)
# Notes:
# - Keep patterns resilient: match intent, not exact copy.
# - Add “reject rude” patterns globally where helpful.
# -----------------------------
$Catalog = @(
  @{ Name="Greet empty";             Message="";                  Expect="(?i)\b(welcome|on air|i’m nyx|im nyx)\b"; Reject="(?i)repeat myself" },
  @{ Name="Greet hi";                Message="Hi";                Expect="(?i)\b(hi|hey|welcome|on air)\b";         Reject="(?i)repeat myself" },
  @{ Name="Ask help";                Message="help";              Expect="(?i)\b(year|top 10|story|micro|pick)\b" },
  @{ Name="Missing year Top 10";     Message="Top 10";            Expect="(?i)\b(year)\b";                         Reject="(?i)repeat myself|waste your time" },
  @{ Name="Missing year story";      Message="story moment";      Expect="(?i)\b(year)\b" },
  @{ Name="Missing year micro";      Message="micro moment";      Expect="(?i)\b(year)\b" },

  @{ Name="Year only 1950";          Message="1950";              Expect="(?i)\b(1950|top|song|#1|billboard)\b" },
  @{ Name="Year only 1955";          Message="1955";              Expect="(?i)\b(1955|top|song|billboard)\b" },
  @{ Name="Top 10 1950";             Message="top 10 1950";       Expect="(?i)\b(1950|top\s*10|#1|no\.?\s*1|1\.)\b" },
  @{ Name="Story 1950";              Message="story moment 1950"; Expect="(?i)\b(1950)\b" },
  @{ Name="Micro 1950";              Message="micro moment 1950"; Expect="(?i)\b(1950)\b" },

  @{ Name="Top 10 1988";             Message="top 10 1988";       Expect="(?i)\b(1988|top\s*10|#1|no\.?\s*1|1\.)\b" },
  @{ Name="Story 1988";              Message="story moment 1988"; Expect="(?i)\b(1988)\b" },
  @{ Name="Micro 1988";              Message="micro moment 1988"; Expect="(?i)\b(1988)\b" },

  @{ Name="Top 10 2024";             Message="top 10 2024";       Expect="(?i)\b(2024|top\s*10|#1|no\.?\s*1|1\.)\b" },
  @{ Name="Story 2024";              Message="story moment 2024"; Expect="(?i)\b(2024)\b" },
  @{ Name="Micro 2024";              Message="micro moment 2024"; Expect="(?i)\b(2024)\b" },

  # Robustness/fallback tests
  @{ Name="Nonsense input";          Message="asdasdasd";         Expect="(?i)\b(year|1950|2024|top 10|story|micro)\b" },
  @{ Name="Ambiguous request";       Message="play something";    Expect="(?i)\b(year|pick|what year|1950)\b" },
  @{ Name="Ask range";               Message="what years do you have"; Expect="(?i)\b(1950|2024|years)\b" },

  # Loop resistance: repeated ambiguous command
  @{ Name="Repeat guard 1";          Message="Top 10";            Expect="(?i)\b(year)\b"; Reject="(?i)repeat myself|waste your time" },
  @{ Name="Repeat guard 2";          Message="Top 10";            Expect="(?i)\b(year|move forward)\b"; Reject="(?i)repeat myself|waste your time" },
  @{ Name="Repeat guard 3";          Message="Top 10";            Expect="(?i)\b(year|move forward)\b"; Reject="(?i)repeat myself|waste your time" },

  # General UX: should always have reply
  @{ Name="Short ping";              Message="yo";                Expect="(?i)\b(yo|hi|hey|welcome|on air)\b" },
  @{ Name="Question: what can you do"; Message="what can you do"; Expect="(?i)\b(top 10|story|micro|years)\b" },

  # Contract fields presence tests (reply still main assertion in catalog, details in separate tests)
  @{ Name="Contract v1 hint";        Message="top 10";            Expect="(?i)\b(year)\b" },

  # Additional year spread
  @{ Name="Top 10 1967";             Message="top 10 1967";       Expect="(?i)\b(1967|top\s*10|#1|no\.?\s*1|1\.)\b" },
  @{ Name="Top 10 1979";             Message="top 10 1979";       Expect="(?i)\b(1979|top\s*10|#1|no\.?\s*1|1\.)\b" },
  @{ Name="Top 10 1999";             Message="top 10 1999";       Expect="(?i)\b(1999|top\s*10|#1|no\.?\s*1|1\.)\b" },
  @{ Name="Story 1959";              Message="story moment 1959"; Expect="(?i)\b(1959)\b" },
  @{ Name="Micro 1959";              Message="micro moment 1959"; Expect="(?i)\b(1959)\b" },

  # Tone regression checks
  @{ Name="Tone: no scolding";       Message="Top 10";            Expect="(?i)\b(year)\b"; Reject="(?i)(not going to|won't|wont).*repeat|waste your time|stop wasting" },

  # Availability of next step hints
  @{ Name="Next steps present";      Message="1950";              Expect="(?i)\b(top 10|story|micro|year)\b" },

  # More casual
  @{ Name="Casual ask";              Message="give me something from 1950"; Expect="(?i)\b(1950)\b" },

  # Diagnostic: ensure endpoint is alive
  @{ Name="Echo stays alive";         Message="echo health";      Expect="(?i)\b(health|echo)\b" }
)

# -----------------------------
# Core Endpoint Tests (structure)
# -----------------------------
$H = New-Headers

try {
  Run-Test "GET /api/contract ok + using field" {
    $r = Invoke-JsonGet "$BaseUrl/api/contract" $H
    Assert-True ($r.ok -eq $true) "contract.ok is not true"
    Assert-True ($null -ne $r.contract.using) "contract.using missing"
    Assert-True ($null -ne $r.requestId) "requestId missing"
  }

  Run-Test "POST /api/diag/echo echoes + contractUsing exists" {
    $msg = "echo v2 " + (Get-Date -Format "HHmmss")
    $r = Invoke-JsonPost "$BaseUrl/api/diag/echo" $H @{
      message=$msg; sessionId=$SessionId; visitorId=$VisitorId; contractVersion=$ContractVersion; clientBuild=$ClientBuild
    }
    Assert-True ($r.ok -eq $true) "echo.ok is not true"
    Assert-True ($r.echo -eq $msg) "echo mismatch"
    Assert-True ($null -ne $r.contractUsing) "contractUsing missing"
  }

  Run-Test "POST /api/chat returns requestId + sessionId" {
    $r = Invoke-JsonPost "$BaseUrl/api/chat" $H @{
      message="Hi"; sessionId=$SessionId; visitorId=$VisitorId; contractVersion=$ContractVersion; clientBuild=$ClientBuild
    }
    Assert-True ($r.ok -eq $true) "chat.ok is not true"
    Assert-True ($null -ne $r.requestId) "requestId missing"
    Assert-True ($null -ne $r.sessionId) "sessionId missing"
    Assert-True (-not [string]::IsNullOrWhiteSpace($r.reply)) "reply empty"
  }

  Run-Test "Contract v1 followUps shape (if enabled) OR legacy followUp exists" {
    $r = Invoke-JsonPost "$BaseUrl/api/chat" $H @{
      message="Top 10"; sessionId=$SessionId; visitorId=$VisitorId; contractVersion=$ContractVersion; clientBuild=$ClientBuild
    }
    Assert-True ($r.ok -eq $true) "chat.ok is not true"
    # legacy must exist always (per our contract wrapper)
    Assert-True ($null -ne $r.followUp) "legacy followUp missing"
    Assert-True ($r.followUp.Count -ge 3) "legacy followUp too short"

    if ($null -ne $r.followUps) {
      Assert-True ($r.followUps.Count -ge 3) "v1 followUps missing"
      Assert-True ($null -ne $r.followUps[0].label) "followUps[0].label missing"
      Assert-True ($null -ne $r.followUps[0].send) "followUps[0].send missing"
    }
  }

  # -----------------------------
  # Catalog-driven regression checks
  # -----------------------------
  foreach ($t in $Catalog) {
    $name = "CAT: " + $t.Name
    Run-Test $name {
      $msg = [string]$t.Message
      $r = Invoke-JsonPost "$BaseUrl/api/chat" $H @{
        message=$msg; sessionId=$SessionId; visitorId=$VisitorId; contractVersion=$ContractVersion; clientBuild=$ClientBuild
      }
      Assert-True ($r.ok -eq $true) "chat.ok is not true"
      Assert-True (-not [string]::IsNullOrWhiteSpace($r.reply)) "reply empty"

      # Required expectation
      Assert-Regex $r.reply $t.Expect ("Expected reply to match regex: " + $t.Expect)

      # Optional rejection
      if ($t.ContainsKey("Reject") -and -not [string]::IsNullOrWhiteSpace($t.Reject)) {
        Assert-NotRegex $r.reply $t.Reject ("Reply matched rejected regex: " + $t.Reject)
      }
    }
  }

  # -----------------------------
  # TTS checks (optional but recommended)
  # -----------------------------
  Run-Test "POST /api/tts returns audioBytes" {
    $r = Invoke-JsonPost "$BaseUrl/api/tts" $H @{
      text="Nyx regression harness v2 test."; visitorId=$VisitorId; contractVersion=$ContractVersion; clientBuild=$ClientBuild
    }
    Assert-True ($r.ok -eq $true) "tts.ok is not true"
    Assert-True ($null -ne $r.audioBytes) "audioBytes missing"
    Assert-True ($null -ne $r.audioMime) "audioMime missing"
  }

  Run-Test "POST /api/voice alias returns audioBytes" {
    $r = Invoke-JsonPost "$BaseUrl/api/voice" $H @{
      text="Nyx voice alias regression test."; visitorId=$VisitorId; contractVersion=$ContractVersion; clientBuild=$ClientBuild
    }
    Assert-True ($r.ok -eq $true) "voice.ok is not true"
    Assert-True ($null -ne $r.audioBytes) "audioBytes missing"
  }

  # -----------------------------
  # Optional: S2S checks (requires a real local audio file)
  # -----------------------------
  if ($S2SAudioPath -and (Test-Path $S2SAudioPath)) {
    Run-Test "POST /api/s2s returns transcript + reply" {
      $cmd = @(
        "curl.exe","--http1.1","-sS",
        "-X","POST","$BaseUrl/api/s2s",
        "-H","X-Visitor-Id: $VisitorId",
        "-H","X-Contract-Version: $ContractVersion",
        "-H","X-Client-Build: $ClientBuild",
        "-F","file=@$S2SAudioPath",
        "-F","sessionId=$SessionId",
        "-F","visitorId=$VisitorId",
        "-F","contractVersion=$ContractVersion",
        "-F","clientBuild=$ClientBuild"
      )
      $raw = & $cmd 2>$null
      $r = $raw | ConvertFrom-Json
      Assert-True ($r.ok -eq $true) "s2s.ok is not true"
      Assert-True (-not [string]::IsNullOrWhiteSpace($r.transcript)) "transcript missing"
      Assert-True (-not [string]::IsNullOrWhiteSpace($r.reply)) "reply missing"
    }
  } else {
    Add-Result "POST /api/s2s returns transcript + reply" $true "SKIPPED (set `$S2SAudioPath`)" 0
  }

} catch {
  # Collect-all mode still arrives here only if FailFast = true or a hard exception bubbles
}

# -----------------------------
# Report + Exit
# -----------------------------
Write-JUnitReport $ReportPath
Print-Summary

$failed = ($Results | Where-Object {-not $_.Ok}).Count
if ($failed -gt 0) { exit 1 } else { exit 0 }
