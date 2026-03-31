# Full lifecycle smoke test for the beads helper / query system.
# Exercises: dot-source helpers, bd list, bd create, bd show, bd update --claim,
#            bd close --reason, bd stats, bd ready, bd dep, bd-create, bd-dep wrappers.
# Exits with code 0 on success, 1 on first failure.
#
# NOTE: Backs up and restores .beads/issues.jsonl so real tracking data is never lost.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

$script:passed = 0
$script:failed = 0

function Assert-True {
    param([bool]$condition, [string]$label)
    if ($condition) {
        Write-Host "  [PASS] $label" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  [FAIL] $label" -ForegroundColor Red
        $script:failed++
    }
}

function Assert-Contains {
    param([string]$haystack, [string]$needle, [string]$label)
    Assert-True ($haystack -match [regex]::Escape($needle)) $label
}

# --------------------------------------------------------------------------
# Setup: backup real data, write clean slate, dot-source helpers
# --------------------------------------------------------------------------

$issuesFile = Join-Path $PSScriptRoot '..\\.beads\\issues.jsonl'
$backupFile = "$issuesFile.smoke-backup"

# Back up existing data so the real tracker is never destroyed by this test
if (Test-Path $issuesFile) {
    Copy-Item $issuesFile $backupFile -Force
}

Set-Content $issuesFile ''
Write-Host "Smoke test starting (clean slate, real data backed up)..." -ForegroundColor Cyan

. "$PSScriptRoot\beads-helpers.ps1"

# --------------------------------------------------------------------------
# 1. bd list on empty file — should not error
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 1. bd list (empty) ===" -ForegroundColor Yellow
$listEmpty = bd list 2>&1 | Out-String
Assert-True ($listEmpty -notmatch 'ERROR') "bd list on empty file exits cleanly (no error output)"

# --------------------------------------------------------------------------
# 2. bd create via direct bd call
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 2. bd create ===" -ForegroundColor Yellow
bd create 'Smoke test issue' -Description 'Verify create works' -Priority 2
Assert-True $true "bd create ran without terminating error"

$raw    = bd list --json 2>&1
$issues = $raw | ConvertFrom-Json
$id     = if ($issues -is [array]) { $issues[0].id } else { $issues.id }
Assert-True ($id -match '^bd-[0-9a-z]{4}$') "Created issue has valid id format: $id"

# --------------------------------------------------------------------------
# 3. bd show
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 3. bd show ===" -ForegroundColor Yellow
$showOut = bd show $id *>&1 | Out-String
Assert-Contains $showOut $id          "bd show includes issue id"
Assert-Contains $showOut 'Smoke test' "bd show includes title text"

# --------------------------------------------------------------------------
# 4. bd update --claim
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 4. bd update --claim ===" -ForegroundColor Yellow
bd update $id --claim
$afterClaim = bd show $id --json 2>&1 | Out-String | ConvertFrom-Json
Assert-True ($afterClaim.status -eq 'in-progress') "status is in-progress after --claim"
Assert-True ($afterClaim.claimed_by -eq $env:USERNAME) "claimed_by matches current user"

# --------------------------------------------------------------------------
# 5. bd ready
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 5. bd ready ===" -ForegroundColor Yellow
$readyOut = bd ready *>&1 | Out-String
Assert-Contains $readyOut 'Ready' "bd ready output contains 'Ready' header"

# --------------------------------------------------------------------------
# 6. bd dep add / dep list / dep remove
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 6. bd dep ===" -ForegroundColor Yellow
# Create a second issue to use as a dependency target
bd create 'Dep target issue' -Priority 3
$raw2    = bd list --json 2>&1 | Out-String | ConvertFrom-Json
$allIds  = @($raw2 | ForEach-Object { $_.id })
$id2     = @($allIds | Where-Object { $_ -ne $id })[0]
Assert-True ($id2 -match '^bd-[0-9a-z]{4}$') "Second issue id is valid: $id2"

bd dep add $id $id2
$depListOut = bd dep list $id *>&1 | Out-String
Assert-Contains $depListOut $id2 "dep list shows added dependency $id2"

bd dep remove $id $id2
$depListAfter = bd dep list $id *>&1 | Out-String
Assert-True ($depListAfter -notmatch [regex]::Escape($id2)) "dep remove eliminated $id2 from dep list"

# --------------------------------------------------------------------------
# 7. bd-create wrapper (helper function)
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 7. bd-create wrapper ===" -ForegroundColor Yellow
bd-create 'Wrapper test issue' -Description 'via bd-create' -Priority 1 -Type 'task'
$allAfterWrapper = bd list --json 2>&1 | Out-String | ConvertFrom-Json
$wrapperIssue    = @($allAfterWrapper | Where-Object { $_.title -eq 'Wrapper test issue' })
Assert-True ($wrapperIssue.Count -eq 1) "bd-create created exactly one issue with correct title"
Assert-True ($wrapperIssue[0].priority -eq 1) "bd-create passed priority=1 correctly"

# --------------------------------------------------------------------------
# 8. bd-dep wrapper (helper function)
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 8. bd-dep wrapper ===" -ForegroundColor Yellow
$wid = $wrapperIssue[0].id
bd-dep add $wid $id2
$depOut = bd-dep list $wid *>&1 | Out-String
Assert-Contains $depOut $id2 "bd-dep add+list works via helper wrapper"
bd-dep remove $wid $id2

# --------------------------------------------------------------------------
# 9. bd search
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 9. bd search ===" -ForegroundColor Yellow
$searchOut = bd search 'Smoke' *>&1 | Out-String
Assert-Contains $searchOut 'Smoke' "bd search returns matching issue"

# --------------------------------------------------------------------------
# 10. bd close --reason
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 10. bd close --reason ===" -ForegroundColor Yellow
bd close $id --reason 'done'
$closed = bd show $id --json 2>&1 | Out-String | ConvertFrom-Json
Assert-True ($closed.status -eq 'closed')       "status is closed after bd close"
Assert-True ($closed.close_reason -eq 'done')   "close_reason is 'done'"

# --------------------------------------------------------------------------
# 11. bd list --status closed
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 11. bd list --status closed ===" -ForegroundColor Yellow
$closedList = bd list --status closed --json 2>&1 | Out-String | ConvertFrom-Json
$closedIds  = @($closedList | ForEach-Object { $_.id })
Assert-True ($closedIds -contains $id) "Closed issue appears in bd list --status closed"

# --------------------------------------------------------------------------
# 12. bd stats
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "=== 12. bd stats ===" -ForegroundColor Yellow
$statsOut = bd stats *>&1 | Out-String
Assert-Contains $statsOut 'Total issues' "bd stats output contains 'Total issues'"
Assert-Contains $statsOut 'closed'       "bd stats output contains status breakdown 'closed'"

# --------------------------------------------------------------------------
# Cleanup + Summary
# --------------------------------------------------------------------------

Write-Host ""
Write-Host "--- cleanup: restoring real issues.jsonl from backup ---" -ForegroundColor DarkGray
if (Test-Path $backupFile) {
    Copy-Item $backupFile $issuesFile -Force
    Remove-Item $backupFile -Force
} else {
    Set-Content $issuesFile ''
}

Write-Host ""
if ($script:failed -eq 0) {
    Write-Host "Smoke test PASSED: $($script:passed)/$($script:passed + $script:failed) assertions." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Smoke test FAILED: $($script:failed) failure(s) out of $($script:passed + $script:failed) assertions." -ForegroundColor Red
    exit 1
}

