# Smoke test for bd-5cz7: empty / missing issues.jsonl handling
$ErrorActionPreference = 'Stop'
$root     = Split-Path $PSScriptRoot -Parent
$realFile = Join-Path (Join-Path $root '.beads') 'issues.jsonl'
$backup   = $realFile + '.bak'
$query    = Join-Path $PSScriptRoot 'beads-query.ps1'

$pass = 0; $fail = 0

function Assert([string]$label, [bool]$ok) {
    if ($ok) { Write-Host "  PASS: $label" -ForegroundColor Green; $script:pass++ }
    else      { Write-Host "  FAIL: $label" -ForegroundColor Red;   $script:fail++ }
}

Copy-Item $realFile $backup -Force

try {
    # --- Test 1: missing file ---
    Write-Host "`n--- Test 1: Missing issues.jsonl (list human) ---"
    Remove-Item $realFile -ErrorAction SilentlyContinue
    $null = & $query list 2>&1
    Assert "no error on missing file" ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE)

    # --- Test 2: empty file, list human ---
    Write-Host "`n--- Test 2: Empty file (list human) ---"
    '' | Set-Content $realFile -Encoding UTF8
    $null = & $query list 2>&1
    Assert "no error on empty file" ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE)

    # --- Test 3: empty file, list -Json ---
    Write-Host "`n--- Test 3: Empty file (list -Json) ---"
    '' | Set-Content $realFile -Encoding UTF8
    $json = (& $query list -Json) -join ''
    Write-Host "  raw: [$json]"
    Assert "list -Json returns []" ($json.Trim() -eq '[]')

    # --- Test 4: empty file, search -Json ---
    Write-Host "`n--- Test 4: Empty file (search -Json) ---"
    '' | Set-Content $realFile -Encoding UTF8
    $json = (& $query search foo -Json) -join ''
    Write-Host "  raw: [$json]"
    Assert "search -Json returns []" ($json.Trim() -eq '[]')

    # --- Test 5: empty file, ready -Json (summary mode) ---
    Write-Host "`n--- Test 5: Empty file (ready -Json summary) ---"
    '' | Set-Content $realFile -Encoding UTF8
    $json = (& $query ready -Json) -join ''
    Write-Host "  raw: [$json]"
    $obj = $json | ConvertFrom-Json -ErrorAction SilentlyContinue
    Assert "ready -Json returns valid JSON" ($null -ne $obj)
    Assert "ready -Json total=0"           ($obj.total -eq 0)

    # --- Test 6: empty file, ready -Limit 5 -Json ---
    Write-Host "`n--- Test 6: Empty file (ready -Limit 5 -Json) ---"
    '' | Set-Content $realFile -Encoding UTF8
    $json = (& $query ready -Limit 5 -Json) -join ''
    Write-Host "  raw: [$json]"
    Assert "ready -Limit -Json returns []" ($json.Trim() -eq '[]')

} finally {
    Copy-Item $backup $realFile -Force
    Remove-Item $backup -Force
    Write-Host "`nRestored real issues.jsonl."
}

Write-Host ""
Write-Host "Results: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }

